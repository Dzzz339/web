import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import xlsx from 'xlsx';
import { pool } from '../config/db.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

function parseRussianDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val)) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

export function execPython(scriptPath, args, callback) {
  const isWin = process.platform === 'win32';
  const candidates = isWin ? ['py', 'python', 'python3'] : ['python3', 'python', 'py'];
  if (process.env.PYTHON_BIN) {
    candidates.unshift(process.env.PYTHON_BIN);
  }

  function tryCandidate(idx) {
    if (idx >= candidates.length) {
      return callback(new Error('Интерпретатор Python 3 не найден в системе. Установите python3.'));
    }
    const bin = candidates[idx];
    execFile(bin, [scriptPath, ...args], (err, stdout, stderr) => {
      if (err && (err.code === 'ENOENT' || (stderr && (stderr.includes('not found') || stderr.includes('не найдено'))))) {
        return tryCandidate(idx + 1);
      }
      callback(err, stdout, stderr);
    });
  }

  tryCandidate(0);
}

export async function importSpecialistsFromXlsx(xlsxPath) {
  if (!fs.existsSync(xlsxPath)) {
    return { count: 0, error: 'Файл не найден' };
  }

  const wb = xlsx.readFile(xlsxPath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  if (!rows || rows.length < 2) {
    return { count: 0, inserted: 0, updated: 0 };
  }

  const header = rows[0].map(h => String(h || '').trim().toLowerCase());
  const nameIdx = header.findIndex(h => h.includes('фио') || h.includes('сотрудник') || h.includes('монтажник') || h.includes('специалист') || h.includes('фамилия'));
  const phoneIdx = header.findIndex(h => h.includes('телефон') || h.includes('связь') || h.includes('номер'));
  const passIdx = header.findIndex(h => h.includes('паспорт'));
  const orgIdx = header.findIndex(h => h.includes('организаци') || h.includes('компани'));
  const posIdx = header.findIndex(h => h.includes('должност') || h.includes('роль'));

  let inserted = 0;
  let updated = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || nameIdx === -1 || !row[nameIdx]) continue;

    const fullName = String(row[nameIdx]).trim();
    if (!fullName) continue;

    const phone = phoneIdx !== -1 && row[phoneIdx] ? String(row[phoneIdx]).trim() : null;
    const passportRaw = passIdx !== -1 && row[passIdx] ? String(row[passIdx]).trim() : null;
    const org = orgIdx !== -1 && row[orgIdx] ? String(row[orgIdx]).trim() : 'ООО "Ультима"';
    const pos = posIdx !== -1 && row[posIdx] ? String(row[posIdx]).trim() : 'Монтажник СКС';

    const check = await pool.query('SELECT id FROM specialists WHERE full_name = $1 LIMIT 1', [fullName]);
    if (check.rows.length === 0) {
      await pool.query(
        `INSERT INTO specialists (full_name, phone, passport_raw, organization, position)
         VALUES ($1, $2, $3, $4, $5)`,
        [fullName, phone, passportRaw, org, pos]
      );
      inserted++;
    } else {
      await pool.query(
        `UPDATE specialists SET
           phone = COALESCE(NULLIF($1, ''), phone),
           passport_raw = COALESCE(NULLIF($2, ''), passport_raw),
           organization = COALESCE(NULLIF($3, ''), organization),
           position = COALESCE(NULLIF($4, ''), position)
         WHERE id = $5`,
        [phone, passportRaw, org, pos, check.rows[0].id]
      );
      updated++;
    }
  }

  console.log(`[DirectoriesImporter] Specialists xlsx: inserted ${inserted}, updated ${updated}`);
  return { inserted, updated, total: rows.length - 1 };
}

export async function importSpecialistsFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    return importSpecialistsFromXlsx(filePath);
  }
  return importSpecialistsFromDocx(filePath);
}

export async function importSpecialistsFromDocx(docxPath) {
  const targetPath = docxPath || path.join(ROOT_DIR, 'документы', 'Dlya_poluchenia_dopuska.docx');
  if (!fs.existsSync(targetPath)) {
    console.log('[DirectoriesImporter] Docx not found:', targetPath);
    return { count: 0 };
  }

  const buf = fs.readFileSync(targetPath);
  const cfb = xlsx.CFB.read(buf, { type: 'buffer' });
  const entry = xlsx.CFB.find(cfb, 'document.xml');
  if (!entry || !entry.content) {
    throw new Error('Не удалось прочитать document.xml в файле docx');
  }

  const xmlStr = entry.content.toString('utf-8');
  const tblRegex = /<w:tbl[\s>][\s\S]*?<\/w:tbl>/g;
  const tables = xmlStr.match(tblRegex) || [];
  if (tables.length === 0) {
    return { count: 0, inserted: 0, updated: 0 };
  }

  const mainTable = tables[0];
  const rowRegex = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
  const rows = mainTable.match(rowRegex) || [];

  const specialists = [];

  for (let r = 0; r < rows.length; r++) {
    const cellRegex = /<w:tc[\s>][\s\S]*?<\/w:tc>/g;
    const cells = rows[r].match(cellRegex) || [];
    const cellTexts = cells.map(cellXml => {
      const textRegex = /<w:t[\s>][\s\S]*?<\/w:t>/g;
      const texts = cellXml.match(textRegex) || [];
      return texts.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
    });

    if (cellTexts.length >= 4) {
      const lastName = cellTexts[0];
      const firstName = cellTexts[1] || '';
      const middleName = cellTexts[2] || '';
      const passport = cellTexts[3] || '';
      const phone = cellTexts[4] || '';

      if (!lastName || lastName.toLowerCase().includes('фамилия') || lastName.toLowerCase().includes('наименование')) continue;

      const fullName = (lastName + ' ' + firstName + ' ' + middleName).trim();
      if (!fullName) continue;

      const snMatch = passport.match(/(\d{2}\s*\d{2})\s*(?:№\s*)?(\d{6})/);
      const passportSn = snMatch ? (snMatch[1].replace(/\s+/g, '') + ' ' + snMatch[2]) : '';

      const dateMatch = passport.match(/(\d{2}\.\d{2}\.\d{4})/);
      const passportDate = dateMatch ? dateMatch[1] : '';

      const pos = fullName.includes('Чайка Алексей') ? 'Руководитель проекта (ПМ)' : 'Монтажник СКС';

      specialists.push({
        full_name: fullName,
        phone: phone,
        passport_raw: passport,
        passport_series_number: passportSn,
        passport_issue_date: passportDate,
        organization: 'ООО "Ультима"',
        position: pos
      });
    }
  }

  // Also save template for access letters
  try {
    const tplDir = path.join(UPLOADS_DIR, 'templates');
    if (!fs.existsSync(tplDir)) fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'access_letter_template.docx'), buf);
  } catch (_) {}

  let inserted = 0;
  let updated = 0;

  for (const s of specialists) {
    const check = await pool.query(
      'SELECT id FROM specialists WHERE full_name = $1 LIMIT 1',
      [s.full_name]
    );

    const userMatch = await pool.query(
      'SELECT id FROM users WHERE full_name ILIKE $1 OR username ILIKE $2 LIMIT 1',
      [`%${s.full_name}%`, s.full_name.split(' ')[0]]
    );
    const userId = userMatch.rows[0]?.id || null;

    if (check.rows.length === 0) {
      await pool.query(
        `INSERT INTO specialists (full_name, phone, passport_raw, passport_series_number, passport_issue_date, organization, position, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          s.full_name,
          s.phone || null,
          s.passport_raw || null,
          s.passport_series_number || null,
          s.passport_issue_date || null,
          s.organization || 'ООО "Ультима"',
          s.position || 'Монтажник СКС',
          userId
        ]
      );
      inserted++;
    } else {
      await pool.query(
        `UPDATE specialists 
         SET phone = COALESCE(NULLIF($1, ''), phone),
             passport_raw = COALESCE(NULLIF($2, ''), passport_raw),
             passport_series_number = COALESCE(NULLIF($3, ''), passport_series_number),
             passport_issue_date = COALESCE(NULLIF($4, ''), passport_issue_date),
             position = COALESCE(NULLIF($5, ''), position),
             user_id = COALESCE(user_id, $6)
         WHERE id = $7`,
        [
          s.phone || '',
          s.passport_raw || '',
          s.passport_series_number || '',
          s.passport_issue_date || '',
          s.position || '',
          userId,
          check.rows[0].id
        ]
      );
      updated++;
    }
  }

  console.log(`[DirectoriesImporter] Specialists docx (pure JS): inserted ${inserted}, updated ${updated}`);
  return { inserted, updated, total: specialists.length };
}

export function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateAccessLetterDocxPureJs(templateBuf, config) {
  const cfb = xlsx.CFB.read(templateBuf, { type: 'buffer' });
  const entry = xlsx.CFB.find(cfb, 'document.xml');
  if (!entry) throw new Error('document.xml not found in docx template');

  let xml = entry.content.toString('utf-8');

  const contrName = escapeXml(config.contractor_name || 'ООО "Ультима"');
  xml = xml.replace(
    /(<w:tr[\s\S]*?Наименование организации Подрядчика:\s*)([^<]*)([\s\S]*?<\/w:tr>)/,
    (match, p1, p2, p3) => p1 + contrName + p3
  );

  let respStr = escapeXml(config.responsible_info || '8(923) 102-40-42, ПМ – Чайка Алексей Николаевич');
  if (config.task_info) {
    respStr += '&#10;Объект / Основание: ' + escapeXml(config.task_info);
  }
  xml = xml.replace(
    /(<w:tr[\s\S]*?Контактный номер телефона[\s\S]*?<w:t>)([^<]*)(<\/w:t>)/,
    (match, p1, p2, p3) => p1 + 'Контактный номер телефона, должность и ФИО ответственного за выполнение работ: ' + respStr + p3
  );

  const tblMatch = xml.match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/);
  if (!tblMatch) throw new Error('Table not found in template');
  const tblXml = tblMatch[0];

  const rows = tblXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
  if (rows.length < 4) throw new Error('Template table does not have enough rows');

  const headerRows = rows.slice(0, 3).join('');
  const r3 = rows[3];

  const specialists = config.specialists || [];
  let newSpecRows = '';

  for (const s of specialists) {
    const fullName = (s.full_name || '').trim();
    const parts = fullName.split(/\s+/);
    const lastName = escapeXml(s.last_name || parts[0] || '');
    const firstName = escapeXml(s.first_name || parts[1] || '');
    const middleName = escapeXml(s.middle_name || parts.slice(2).join(' ') || '');
    const passport = escapeXml(s.passport_raw || s.passport_series_number || 'Паспортные данные уточняются');
    const phone = escapeXml(s.phone || '');

    let rowXml = r3;
    const cells = rowXml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
    if (cells.length >= 5) {
      const vals = [lastName, firstName, middleName, passport, phone];
      const newCells = cells.map((cXml, idx) => {
        if (idx < vals.length) {
          return cXml.replace(/<w:t[\s>][\s\S]*?<\/w:t>/, `<w:t>${vals[idx]}</w:t>`);
        }
        return cXml;
      });
      let cellIdx = 0;
      rowXml = rowXml.replace(/<w:tc[\s>][\s\S]*?<\/w:tc>/g, () => newCells[cellIdx++]);
    }

    newSpecRows += rowXml;
  }

  const newTblXml = tblXml.replace(
    /<w:tr[\s>][\s\S]*?<\/w:tr>[\s\S]*?<\/w:tbl>/,
    headerRows + newSpecRows + '</w:tbl>'
  );

  xml = xml.replace(tblXml, newTblXml);
  entry.content = Buffer.from(xml, 'utf-8');

  return xlsx.CFB.write(cfb, { type: 'buffer' });
}

export async function importPowersOfAttorneyFromXlsx(xlsxPath) {
  const targetPath = xlsxPath || path.join(ROOT_DIR, 'документы', 'Obnovlenny_Reestr_Doverennostey__3.xlsx');
  if (!fs.existsSync(targetPath)) {
    console.log('[DirectoriesImporter] Excel not found:', targetPath);
    return { count: 0 };
  }

  const wb = xlsx.readFile(targetPath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  if (!rows || rows.length < 2) {
    return { count: 0 };
  }

  const header = rows[0].map(h => String(h || '').trim().toLowerCase());
  const dateIdx = header.findIndex(h => h.includes('дата'));
  const numIdx = header.findIndex(h => h.includes('номер'));
  const personIdx = header.findIndex(h => h.includes('подотчетное') || h.includes('лицо'));
  const contrIdx = header.findIndex(h => h.includes('контрагент'));
  const orgIdx = header.findIndex(h => h.includes('организация'));
  const validIdx = header.findIndex(h => h.includes('срок'));

  const today = new Date().toISOString().slice(0, 10);
  let inserted = 0;
  let updated = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[numIdx]) continue;

    const rawDate = row[dateIdx];
    const rawNumber = String(row[numIdx]).trim();
    const rawPerson = row[personIdx] ? String(row[personIdx]).trim() : '';
    const rawContr = row[contrIdx] ? String(row[contrIdx]).trim() : '';
    const rawOrg = row[orgIdx] ? String(row[orgIdx]).trim() : '';
    const rawValid = row[validIdx];

    const issueDate = parseRussianDate(rawDate);
    const validUntil = parseRussianDate(rawValid);

    let status = 'active';
    if (validUntil) {
      if (validUntil < today) {
        status = 'expired';
      } else {
        const dDiff = (new Date(validUntil) - new Date(today)) / (1000 * 60 * 60 * 24);
        if (dDiff <= 30) status = 'expiring';
      }
    }

    // Match or create specialist
    let specialistId = null;
    if (rawPerson) {
      const specRes = await pool.query(
        'SELECT id FROM specialists WHERE full_name ILIKE $1 LIMIT 1',
        [rawPerson]
      );
      if (specRes.rows.length > 0) {
        specialistId = specRes.rows[0].id;
      } else {
        // Create new specialist entry from POA person
        const newSpec = await pool.query(
          `INSERT INTO specialists (full_name, organization, position)
           VALUES ($1, $2, 'Подотчетное лицо')
           RETURNING id`,
          [rawPerson, rawOrg || 'ООО "Ультима"']
        );
        specialistId = newSpec.rows[0].id;
      }
    }

    const check = await pool.query(
      'SELECT id FROM powers_of_attorney WHERE number = $1 AND person_name = $2 LIMIT 1',
      [rawNumber, rawPerson]
    );

    if (check.rows.length === 0) {
      await pool.query(
        `INSERT INTO powers_of_attorney 
         (number, issue_date, valid_until, person_name, specialist_id, contractor_name, organization, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [rawNumber, issueDate, validUntil, rawPerson, specialistId, rawContr, rawOrg, status]
      );
      inserted++;
    } else {
      await pool.query(
        `UPDATE powers_of_attorney
         SET issue_date = COALESCE($1, issue_date),
             valid_until = COALESCE($2, valid_until),
             specialist_id = COALESCE(specialist_id, $3),
             contractor_name = COALESCE($4, contractor_name),
             organization = COALESCE($5, organization),
             status = $6
         WHERE id = $7`,
        [issueDate, validUntil, specialistId, rawContr, rawOrg, status, check.rows[0].id]
      );
      updated++;
    }
  }

  console.log(`[DirectoriesImporter] Powers of attorney: inserted ${inserted}, updated ${updated}`);
  return { inserted, updated, total: rows.length - 1 };
}

export async function linkArchiveDocuments() {
  const archiveDir = path.join(ROOT_DIR, 'документы', 'Архив', '12.06.2026');
  if (!fs.existsSync(archiveDir)) {
    console.log('[DirectoriesImporter] Archive dir not found:', archiveDir);
    return { linked: 0 };
  }

  const folders = fs.readdirSync(archiveDir);
  let totalLinked = 0;

  for (const folder of folders) {
    const folderPath = path.join(archiveDir, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const files = fs.readdirSync(folderPath);
    // Find task ID from zakaz file
    let taskId = null;
    const zakazFile = files.find(f => f.toLowerCase().includes('заказ'));
    if (zakazFile) {
      const match = zakazFile.match(/([А-Яа-яA-Za-z]+-\d+-\d+)/);
      if (match) taskId = match[1];
    }

    if (!taskId) {
      // Check if folder name is in tasks
      const tCheck = await pool.query('SELECT id FROM tasks WHERE id = $1 LIMIT 1', [folder]);
      if (tCheck.rows.length > 0) taskId = tCheck.rows[0].id;
    }

    if (!taskId) continue;

    // Verify task exists in DB
    const taskExists = await pool.query('SELECT id FROM tasks WHERE id = $1 LIMIT 1', [taskId]);
    if (taskExists.rows.length === 0) continue;

    // Target upload folder: uploads/archive/<folder>/
    const targetDir = path.join(UPLOADS_DIR, 'archive', folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    for (const file of files) {
      const srcPath = path.join(folderPath, file);
      const dstPath = path.join(targetDir, file);

      // Copy if not exists or size differs
      if (!fs.existsSync(dstPath)) {
        fs.copyFileSync(srcPath, dstPath);
      }

      const relPath = `archive/${folder}/${file}`;
      const ext = path.extname(file).toLowerCase();
      let type = 'order_pdf';
      let mime = 'application/pdf';

      if (file.toLowerCase().includes('чек-лист') || file.toLowerCase().includes('checklist')) {
        type = 'checklist';
        mime = 'application/pdf';
      } else if (file.toLowerCase().includes('схема') || ['.jpg', '.jpeg', '.png'].includes(ext)) {
        type = 'scheme';
        mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      }

      const stat = fs.statSync(dstPath);

      // Check if already in task_attachments
      const attCheck = await pool.query(
        'SELECT id FROM task_attachments WHERE task_id = $1 AND original_name = $2 LIMIT 1',
        [taskId, file]
      );

      if (attCheck.rows.length === 0) {
        await pool.query(
          `INSERT INTO task_attachments 
           (task_id, type, file_path, original_name, mime_type, size_bytes, comment)
           VALUES ($1, $2, $3, $4, $5, $6, 'Импортировано из архива 12.06.2026')`,
          [taskId, type, relPath, file, mime, stat.size]
        );
        totalLinked++;
      }
    }
  }

  console.log(`[DirectoriesImporter] Archive files linked to tasks: ${totalLinked}`);
  return { totalLinked };
}

export async function syncContractorsFromPOA() {
  const key = process.env.DADATA_API_KEY || '5312de9ffa05f9a68cc381ddbb8484385f032bd8';

  const { rows } = await pool.query(`
    SELECT DISTINCT TRIM(contractor_name) AS name, COUNT(*) as poa_count
    FROM powers_of_attorney
    WHERE contractor_name IS NOT NULL AND TRIM(contractor_name) <> ''
    GROUP BY TRIM(contractor_name)
    ORDER BY poa_count DESC
  `);

  let added = 0;
  let updated = 0;
  const results = [];

  for (const row of rows) {
    const rawName = row.name;
    if (!rawName) continue;

    const innMatch = rawName.match(/\b(\d{10}|\d{12})\b/);
    let dadataParty = null;

    if (innMatch) {
      try {
        const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Token ' + key
          },
          body: JSON.stringify({ query: innMatch[1] })
        });
        const data = await res.json();
        if (data.suggestions && data.suggestions.length > 0) {
          dadataParty = data.suggestions[0];
        }
      } catch (e) {}
    }

    if (!dadataParty) {
      try {
        const cleanQuery = rawName
          .replace(/ИНН\s*\d+/gi, '')
          .replace(/ТД\s+/gi, '')
          .trim();

        const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Token ' + key
          },
          body: JSON.stringify({ query: cleanQuery || rawName, count: 1 })
        });
        const data = await res.json();
        if (data.suggestions && data.suggestions.length > 0) {
          dadataParty = data.suggestions[0];
        }
      } catch (e) {}
    }

    if (!dadataParty && rawName.includes('"')) {
      try {
        const unquoted = rawName.replace(/["«»]/g, ' ').replace(/\s+/g, ' ').trim();
        const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Token ' + key
          },
          body: JSON.stringify({ query: unquoted, count: 1 })
        });
        const data = await res.json();
        if (data.suggestions && data.suggestions.length > 0) {
          dadataParty = data.suggestions[0];
        }
      } catch (e) {}
    }

    let inn, kpp, nameShort, nameFull, addressLegal, director, type;

    if (dadataParty) {
      const d = dadataParty.data || {};
      inn = d.inn || ('NO_INN_' + Buffer.from(rawName).toString('hex').slice(0, 10));
      kpp = d.kpp || null;
      nameShort = (d.name && (d.name.short_with_opf || d.name.short)) || dadataParty.value || rawName;
      nameFull = (d.name && (d.name.full_with_opf || d.name.full)) || dadataParty.value;
      addressLegal = d.address ? d.address.value : null;
      director = d.management ? d.management.name : null;

      const lower = (nameShort + ' ' + (d.opf?.short || '')).toLowerCase();
      if (lower.startsWith('ип ') || lower.includes('индивидуальный')) {
        type = 'executor';
      } else if (lower.includes('линии') || lower.includes('витэка') || lower.includes('пэк') || lower.includes('кит') || lower.includes('транспорт')) {
        type = 'supplier';
      } else if (lower.includes('электро') || lower.includes('линдекс') || lower.includes('тайле') || lower.includes('мерлен') || lower.includes('трейд') || lower.includes('совер')) {
        type = 'supplier';
      } else {
        type = 'supplier';
      }
    } else {
      const pseudoInn = 'GEN_' + Math.abs(rawName.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0));
      inn = pseudoInn;
      kpp = null;
      nameShort = rawName;
      nameFull = rawName;
      addressLegal = null;
      director = null;
      type = 'supplier';
    }

    const check = await pool.query(
      'SELECT id, name_short FROM contractors WHERE inn = $1 OR name_short = $2',
      [inn, nameShort]
    );

    let contractorId;
    if (check.rows.length === 0) {
      const insRes = await pool.query(
        `INSERT INTO contractors 
         (inn, kpp, name_short, name_full, address_legal, director, type, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
         RETURNING id`,
        [inn, kpp, nameShort, nameFull, addressLegal, director, type]
      );
      contractorId = insRes.rows[0].id;
      added++;
      results.push({ name: nameShort, inn, action: 'added' });
    } else {
      contractorId = check.rows[0].id;
      await pool.query(
        `UPDATE contractors
         SET kpp = COALESCE($1, kpp),
             name_full = COALESCE($2, name_full),
             address_legal = COALESCE($3, address_legal),
             director = COALESCE($4, director)
         WHERE id = $5`,
        [kpp, nameFull, addressLegal, director, contractorId]
      );
      updated++;
      results.push({ name: nameShort, inn, action: 'updated' });
    }

    // Link powers_of_attorney rows to this contractor_id
    await pool.query(
      `UPDATE powers_of_attorney 
       SET contractor_id = $1 
       WHERE TRIM(contractor_name) = $2 OR contractor_name ILIKE $3`,
      [contractorId, rawName, `%${nameShort}%`]
    );
  }

  console.log(`[DirectoriesImporter] Sync contractors from POA: ${added} added, ${updated} updated.`);
  return { added, updated, totalPOAContractors: rows.length, results };
}

export async function runFullImport() {
  console.log('[DirectoriesImporter] Starting full directory & archive import...');
  const specRes = await importSpecialistsFromDocx();
  const poaRes = await importPowersOfAttorneyFromXlsx();
  const contrRes = await syncContractorsFromPOA();
  const archRes = await linkArchiveDocuments();
  console.log('[DirectoriesImporter] Full import finished successfully.');
  return { specialists: specRes, powersOfAttorney: poaRes, contractors: contrRes, archive: archRes };
}



