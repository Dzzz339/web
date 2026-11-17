import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { UPLOADS_DIR } from '../middleware/upload.js';
import { pool as defaultPool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getBrowserPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH) ? process.env.PUPPETEER_EXECUTABLE_PATH : null;
  }
  if (process.env.CHROME_BIN) {
    return fs.existsSync(process.env.CHROME_BIN) ? process.env.CHROME_BIN : null;
  }
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function formatDateRu(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const day = dt.getDate();
  const m = months[dt.getMonth()];
  const y = dt.getFullYear();
  return `«${day}» ${m} ${y} г.`;
}

function formatDateShort(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  return `${day}.${month}.${year}`;
}

function esc(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function numericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function displayTestStatus(value) {
  if (value === null || value === undefined || value === '') return '';
  const normalized = String(value).toLowerCase();
  if (normalized.includes('pass') || normalized.includes('годен')) return 'PASS';
  if (normalized.includes('fail')) return 'FAIL';
  return String(value);
}

export function isSfrCustomer(customer) {
  const custName = (customer || '').toLowerCase();
  return custName.includes('сфр') || custName.includes('социальн') || custName.includes('пенсион');
}

export function getDefaultChecklist(customer) {
  const isSfr = isSfrCustomer(customer);
  return {
    title: true,
    album_list: true,
    aosr: !isSfr,
    act: !isSfr,
    act_equip: false,
    act_mount: false,
    work_log: false,
    scheme: true,
    kj: true,
    fluke: true,
    cert: true,
    manual: false,
    warranty: false
  };
}

export function resolveTaskChecklist(task) {
  const defaults = getDefaultChecklist(task.customer);
  const raw = task.raw_data || {};
  const saved = raw.idChecklist || raw.id_checklist || {};

  const merged = { ...defaults };
  merged.title = true;
  merged.album_list = true;
  merged.scheme = true;
  merged.kj = true;
  merged.fluke = true;

  const optKeys = ['aosr', 'act_equip', 'act_mount', 'work_log', 'cert', 'manual', 'warranty'];
  for (const k of optKeys) {
    if (typeof saved[k] === 'boolean') {
      merged[k] = saved[k];
    }
  }
  if (typeof saved.act === 'boolean' && saved.aosr === undefined) {
    merged.aosr = saved.act;
  }
  merged.act = merged.aosr;

  return merged;
}

export async function generateIdPdfAlbum(opts) {
  const taskId = typeof opts === 'string' ? opts : opts?.taskId;
  const pool = (typeof opts === 'object' && opts?.pool) ? opts.pool : defaultPool;

  // 1. Загрузка данных задачи
  const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (!taskRes.rows.length) throw new Error(`Задача ${taskId} не найдена`);
  const task = taskRes.rows[0];
  const checklist = (opts && typeof opts === 'object' && opts.checklist) ? opts.checklist : resolveTaskChecklist(task);

  // 2. Договор генподряда (контракт)
  let contract = {};
  if (task.contract_id) {
    const cRes = await pool.query('SELECT * FROM contracts WHERE id = $1', [task.contract_id]);
    if (cRes.rows.length) contract = cRes.rows[0];
  }

  // 3. Субподряд и организации
  const subRes = await pool.query(`
    SELECT s.*, c.name_short AS contractor_name, c.name_full AS contractor_name_full, c.inn AS contractor_inn, c.director AS contractor_director,
           oc.name_short AS own_name, oc.name_full AS own_name_full, oc.inn AS own_inn, oc.director AS own_director
    FROM task_subcontracts s
    LEFT JOIN contractors c ON s.contractor_id = c.id
    LEFT JOIN own_companies oc ON s.own_company_id = oc.id
    WHERE s.task_id = $1
    ORDER BY s.id DESC LIMIT 1
  `, [taskId]);
  const sub = subRes.rows[0] || {};

  // Наша компания
  let ownCompany = {};
  const ownId = sub.own_company_id || task.own_company_id || contract.own_company_id;
  if (ownId) {
    const ocRes = await pool.query('SELECT * FROM own_companies WHERE id = $1', [ownId]);
    if (ocRes.rows.length) ownCompany = ocRes.rows[0];
  }

  // Подрядчик
  let contractor = {};
  if (sub.contractor_id) {
    const crRes = await pool.query('SELECT * FROM contractors WHERE id = $1', [sub.contractor_id]);
    if (crRes.rows.length) contractor = crRes.rows[0];
  } else if (task.contractor) {
    const crRes = await pool.query(
      'SELECT * FROM contractors WHERE LOWER(TRIM(name_short)) = LOWER(TRIM($1)) OR LOWER(TRIM(name_full)) = LOWER(TRIM($1)) LIMIT 1',
      [task.contractor.trim()]
    );
    if (crRes.rows.length) contractor = crRes.rows[0];
  }

  // 4. Порты (КЖ)
  const portsRes = await pool.query('SELECT * FROM task_ports WHERE task_id = $1 ORDER BY id ASC', [taskId]);
  const ports = portsRes.rows;

  // 5. Материалы
  const matRes = await pool.query(`
    SELECT tm.*, COALESCE(tm.item_name, m.name) AS name, COALESCE(tm.unit, m.unit) AS unit, COALESCE(tm.article, m.code) AS code, COALESCE(tm.price, m.price_default) AS price
    FROM task_materials tm
    LEFT JOIN materials m ON tm.material_id = m.id
    WHERE tm.task_id = $1
    ORDER BY tm.id ASC
  `, [taskId]);
  const materials = matRes.rows;

  // 6. Вложения (Исполнительная схема и сертификаты)
  const attRes = await pool.query(`
    SELECT * FROM task_attachments 
    WHERE task_id = $1 
    ORDER BY id DESC
  `, [taskId]);
  
  let schemeBase64 = null;
  const certAttachments = [];

  for (const a of attRes.rows) {
    const nameStr = String(a.original_name || a.file_name || a.file_path || '').toLowerCase();
    const isScheme = (a.type === 'scheme' || a.category === 'scheme' || a.category === 'plan' || nameStr.includes('схем') || nameStr.includes('план'));
    const isCert = (a.type === 'certificate' || a.category === 'certificate' || a.category === 'cert' || nameStr.includes('сертификат') || nameStr.includes('паспорт'));
    const fullPath = a.file_path ? (path.isAbsolute(a.file_path) ? a.file_path : path.join(UPLOADS_DIR, a.file_path)) : null;

    if (!schemeBase64 && isScheme && fullPath && fs.existsSync(fullPath)) {
      try {
        const ext = path.extname(fullPath).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
          const imgBuf = fs.readFileSync(fullPath);
          const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
          schemeBase64 = `data:${mime};base64,${imgBuf.toString('base64')}`;
        }
      } catch (e) {
        console.error('Error reading scheme image:', e);
      }
    }

    if (isCert && fullPath && fs.existsSync(fullPath)) {
      try {
        const ext = path.extname(fullPath).toLowerCase();
        let base64 = null;
        if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
          const imgBuf = fs.readFileSync(fullPath);
          const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
          base64 = `data:${mime};base64,${imgBuf.toString('base64')}`;
        }
        certAttachments.push({ ...a, fullPath, base64, ext });
      } catch (e) {
        console.error('Error reading cert image:', e);
      }
    }
  }

  // Общий комплект сертификатов на случай, если к конкретной задаче файлы не привязаны
  if (certAttachments.length === 0 && checklist.cert) {
    const sharedCertRes = await pool.query(`
      SELECT * FROM task_attachments
      WHERE task_id IS NULL AND (type = 'certificate' OR type = 'cert' OR original_name ILIKE '%сертификат%' OR original_name ILIKE '%паспорт%')
      ORDER BY id DESC LIMIT 3
    `);
    for (const a of sharedCertRes.rows) {
      const fullPath = a.file_path ? (path.isAbsolute(a.file_path) ? a.file_path : path.join(UPLOADS_DIR, a.file_path)) : null;
      if (fullPath && fs.existsSync(fullPath)) {
        try {
          const ext = path.extname(fullPath).toLowerCase();
          let base64 = null;
          if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
            const imgBuf = fs.readFileSync(fullPath);
            const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
            base64 = `data:${mime};base64,${imgBuf.toString('base64')}`;
          }
          certAttachments.push({ ...a, fullPath, base64, ext });
        } catch (e) {
          console.error('Error reading shared cert image:', e);
        }
      }
    }
  }

  const cableLengths = ports.map(p => numericValue(p.cable_length)).filter(value => value !== null);
  const totalCableLen = cableLengths.length > 0 ? cableLengths.reduce((sum, value) => sum + value, 0) : null;
  const passCount = ports.filter(p => displayTestStatus(p.testing_status) === 'PASS').length;
  const testedCount = ports.filter(p => displayTestStatus(p.testing_status) !== '').length;

  const browserPath = getBrowserPath();
  if (!browserPath) throw new Error('Не найден исполняемый браузер (Edge/Chrome) для Puppeteer');

  const customerName = ['—', '–', '-'].includes(String(task.customer || '').trim()) ? '' : (task.customer || contract.customer || '');
  const objectAddress = task.address || task.vsp || '';
  const edoNum = task.edo_number || task.edoNumber || (task.raw_data && task.raw_data.edoNumber) || '';
  const genContractor = ownCompany.name_full || ownCompany.name_short || sub.own_name || '';
  const genContractorDirector = ownCompany.director || sub.own_director || '';
  const subContractor = contractor.name_full || contractor.name_short || sub.contractor_name || task.contractor || '';
  const subContractorDirector = contractor.director || sub.contractor_director || '';
  const installerFio = sub.installer_fio || task.assignee || '';
  const completionDate = formatDateRu(task.smr_actual_end_date || task.data_vyhoda);
  const docDateShort = formatDateShort(task.smr_actual_end_date || task.data_vyhoda);
  const currentYear = new Date().getFullYear();

  // Состав альбома: строим структуру листов
  const sheetDefinitions = [
    { key: 'title', title: 'Титульный лист альбома исполнительной документации', format: 'A4', frame: 'frame-simple', active: true },
    { key: 'album_list', title: 'Ведомость документов исполнительной документации', format: 'A4', frame: 'frame-short', active: true },
    { key: 'aosr', title: 'Акт освидетельствования скрытых работ (прокладка кабельных трасс СКС)', format: 'A4', frame: 'frame-short', active: Boolean(checklist.aosr || checklist.act) },
    { key: 'act_equip', title: 'Спецификация смонтированного оборудования и израсходованных материалов', format: 'A4', frame: 'frame-short', active: Boolean(checklist.act_equip) },
    { key: 'act_mount', title: 'Акт готовности объекта к проведению монтажных работ', format: 'A4', frame: 'frame-short', active: Boolean(checklist.act_mount) },
    { key: 'work_log', title: 'Журнал производства работ и прокладки кабелей', format: 'A4', frame: 'frame-short', active: Boolean(checklist.work_log) },
    { key: 'scheme', title: 'Исполнительная схема трасс СКС и размещения информационных розеток', format: 'A3', frame: 'frame-full', active: Boolean(checklist.scheme !== false) },
    { key: 'kj', title: 'Кабельный журнал и таблица соединений (КЖ)', format: 'A3', frame: 'frame-short', active: Boolean(checklist.kj !== false) },
    { key: 'fluke', title: 'Протокол измерений параметров кабельных линий', format: 'A3', frame: 'frame-short', active: Boolean(checklist.fluke !== false) },
    { key: 'cert', title: 'Сертификаты соответствия и паспорта качества на кабель и компоненты', format: 'A4', frame: 'frame-none', active: Boolean(checklist.cert) },
    { key: 'manual', title: 'Руководства по эксплуатации и технические паспорта оборудования', format: 'A4', frame: 'frame-none', active: Boolean(checklist.manual) },
    { key: 'warranty', title: 'Гарантийные обязательства производителя и подрядчика', format: 'A4', frame: 'frame-none', active: Boolean(checklist.warranty) }
  ].filter(s => s.active);

  const totalSheets = sheetDefinitions.length;

  // Формируем таблицу ведомости документов (TOC)
  const tocRowsHtml = sheetDefinitions.map((entry, idx) => {
    const num = idx + 1;
    const docCode = `ИД-${esc(taskId)}-${String(num).padStart(2, '0')}`;
    return `<tr>
      <td class="text-center">${num}</td>
      <td><b>${docCode}</b></td>
      <td>${esc(entry.title)}</td>
      <td class="text-center">1</td>
      <td></td>
    </tr>`;
  }).join('');

  // Вспомогательная функция отрисовки краткого штампа
  function renderShortStamp(sheetNum) {
    return `
      <div class="stamp-short">
        <div class="stamp-short-code">ИД-${esc(taskId)}-СКС</div>
        <div class="stamp-short-sheet">
          <div style="font-size:7pt;color:#64748b;">Лист</div>
          <div style="font-weight:700;font-size:9.5pt;">${sheetNum}</div>
        </div>
      </div>
    `;
  }

  // Вспомогательная функция отрисовки полного штампа (форма 2)
  function renderFullStamp(sheetNum) {
    const orgLabel = genContractor || subContractor || '';
    return `
      <div class="stamp-full">
        <table class="stamp-full-table">
          <tr>
            <td style="width:24px;" class="tc">Изм.</td>
            <td style="width:18px;" class="tc">Кол.</td>
            <td style="width:24px;" class="tc">Лист</td>
            <td style="width:30px;" class="tc">№ док.</td>
            <td style="width:32px;" class="tc">Подп.</td>
            <td style="width:40px;" class="tc">Дата</td>
            <td rowspan="3" colspan="3" class="stamp-obj-cell">
              <div class="stamp-obj-title">${esc(objectAddress)}</div>
              <div class="stamp-obj-sub">${esc(task.work_type || 'Структурированная кабельная система (СКС)')}</div>
            </td>
          </tr>
          <tr>
            <td colspan="2">Разраб.</td>
            <td colspan="2"></td>
            <td></td>
            <td class="tc">${esc(docDateShort)}</td>
          </tr>
          <tr>
            <td colspan="2">Пров.</td>
            <td colspan="2"></td>
            <td></td>
            <td class="tc">${esc(docDateShort)}</td>
          </tr>
          <tr>
            <td colspan="6" class="stamp-doc-code">ИД-${esc(taskId)}-СКС</td>
            <td class="tc" style="width:28px;"><b>Стадия</b><br>И</td>
            <td class="tc" style="width:30px;"><b>Лист</b><br>${sheetNum}</td>
            <td class="tc" style="width:35px;"><b>Листов</b><br>${totalSheets}</td>
          </tr>
          <tr>
            <td colspan="6" class="stamp-doc-name">Исполнительная схема трасс СКС и размещения оборудования</td>
            <td colspan="3" class="tc stamp-org-name">${esc(orgLabel)}</td>
          </tr>
        </table>
      </div>
    `;
  }

  // Генерация HTML отдельных листов
  let sheetsHtml = '';
  let currentSheetNum = 0;

  for (const sheetDef of sheetDefinitions) {
    currentSheetNum++;
    const sheetNum = currentSheetNum;

    if (sheetDef.key === 'title') {
      // ─── ЛИСТ 1. ТИТУЛЬНЫЙ ЛИСТ (A4, frame-simple) ─────────────────────────
      sheetsHtml += `
      <div class="sheet sheet-a4">
        <div class="frame-box frame-simple">
          <div class="frame-content">
            <div class="cover-header">
              <div style="font-weight:700;font-size:12pt;">${esc(customerName)}</div>
              <div style="font-size:9pt;color:#475569;margin-top:4px;">
                Генеральный подрядчик: ${esc(genContractor)} · Монтажная организация: ${esc(subContractor)}
              </div>
            </div>

            <div class="cover-body">
              <div class="cover-cipher">ШИФР: СКС-${esc(taskId)}-ИД</div>
              <div class="cover-title">АЛЬБОМ ИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ</div>
              <div class="cover-subtitle">Структурированная кабельная система (СКС / ЛВС)</div>

              <div class="cover-meta">
                <div><b>Объект:</b> ${esc(objectAddress)}</div>
                ${task.vsp ? `<div><b>ВСП / Подразделение:</b> ${esc(task.vsp)}</div>` : ''}
                <div><b>Номер заявки в системе:</b> № ${esc(taskId)}</div>
                ${contract.contract_number ? `<div><b>Контракт:</b> № ${esc(contract.contract_number)}${contract.contract_date ? ' от ' + formatDateRu(contract.contract_date) : ''}</div>` : ''}
                ${sub.subcontract_number ? `<div><b>Договор субподряда:</b> № ${esc(sub.subcontract_number)}</div>` : ''}
                ${edoNum ? `<div><b>Идентификатор в ЭДО:</b> ${esc(edoNum)}</div>` : ''}
                <div><b>Количество портов (КЖ):</b> ${ports.length} шт.</div>
                ${completionDate ? `<div><b>Дата завершения монтажа:</b> ${completionDate}</div>` : ''}
              </div>
            </div>

            <div class="cover-footer">
              <div class="cover-sign-box">
                <div><b>Генеральный подрядчик:</b></div>
                <div style="font-size:9pt;margin-top:2px;">${esc(genContractor)}</div>
                <div class="cover-sign-line">
                  <span>(подпись)</span>
                  <span>/ ${esc(genContractorDirector)} /</span>
                </div>
                <div style="font-size:8pt;color:#64748b;margin-top:4px;">М.П.</div>
              </div>

              <div class="cover-sign-box">
                <div><b>Ответственный производитель работ:</b></div>
                <div style="font-size:9pt;margin-top:2px;">${esc(subContractor)}</div>
                <div class="cover-sign-line">
                  <span>(подпись)</span>
                  <span>/ ${esc(installerFio || subContractorDirector)} /</span>
                </div>
                <div style="font-size:8pt;color:#64748b;margin-top:4px;">М.П.</div>
              </div>
            </div>

            <div class="cover-city-year">
              ${(task.city || ownCompany.city) ? `${esc(task.city || ownCompany.city)}, ` : ''}${currentYear} г.
            </div>
          </div>
        </div>
      </div>`;
    } else if (sheetDef.key === 'album_list') {
      // ─── ЛИСТ 2. ВЕДОМОСТЬ ДОКУМЕНТОВ ИД (A4, frame-short) ──────────────────
      sheetsHtml += `
      <div class="sheet sheet-a4">
        <div class="frame-box frame-short">
          <div class="frame-content">
            <div class="section-heading">1. ВЕДОМОСТЬ ДОКУМЕНТОВ КОМПЛЕКТА ИД</div>
            <p style="font-size:9pt;color:#334155;margin:0 0 10px 0;">
              Настоящий комплект исполнительной документации сформирован по результатам завершения строительно-монтажных работ на объекте: <b>${esc(objectAddress)}</b>.
            </p>

            <table class="grid-table" style="margin-bottom:12px;">
              <thead>
                <tr>
                  <th style="width:35px;" class="tc">№</th>
                  <th style="width:120px;">Обозначение</th>
                  <th>Наименование документа</th>
                  <th style="width:60px;" class="tc">Листов</th>
                  <th style="width:100px;">Примечание</th>
                </tr>
              </thead>
              <tbody>
                ${tocRowsHtml}
              </tbody>
            </table>

            <div class="doc-signatures" style="margin-top:auto;margin-bottom:8px;">
              <div class="doc-sign-col">
                <b>От Генерального подрядчика:</b><br>
                <span>${esc(genContractor)}</span>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ ${esc(genContractorDirector)} /</span></div>
              </div>
              <div class="doc-sign-col">
                <b>От Монтажной организации:</b><br>
                <span>${esc(subContractor)}</span>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ ${esc(installerFio || subContractorDirector)} /</span></div>
              </div>
            </div>
          </div>
          ${renderShortStamp(sheetNum)}
        </div>
      </div>`;
    } else if (sheetDef.key === 'aosr') {
      // ─── АОСР (A4, frame-short) ─────────────────────────────────────────────
      sheetsHtml += `
      <div class="sheet sheet-a4">
        <div class="frame-box frame-short">
          <div class="frame-content">
            <div class="section-heading">АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ</div>
            <div style="text-align:center;font-weight:700;font-size:10pt;margin-bottom:8px;">
              АКТ № ${esc(taskId)}/СР<br>
              освидетельствования скрытых работ по прокладке кабельных трасс СКС
            </div>

            <div style="font-size:8.5pt;line-height:1.45;flex:1;">
              <p style="margin:2px 0;"><b>Объект:</b> ${esc(objectAddress)}</p>
              <p style="margin:2px 0;"><b>Дата проведения освидетельствования:</b> ${completionDate}</p>
              <p style="margin:4px 0 2px 0;"><b>Комиссия в составе представителей:</b></p>
              <ul style="margin:2px 0 6px 16px;padding:0;">
                <li>Заказчика: ${esc(customerName)} _________________</li>
                <li>Генподрядчика: ${esc(genContractor)} / ${esc(genContractorDirector)} /</li>
                <li>Монтажной организации: ${esc(subContractor)} / ${esc(installerFio || subContractorDirector)} /</li>
              </ul>
              <p style="margin:4px 0 2px 0;"><b>произвела осмотр работ, выполненных подрядчиком:</b></p>
              <div style="background:#f8fafc;padding:5px 8px;border:1px solid #cbd5e1;border-radius:3px;font-size:8pt;margin-bottom:6px;">
                ${esc(task.work_type || '')}
              </div>
              <p style="margin:2px 0;"><b>1. К освидетельствованию предъявлены работы:</b> Прокладка слаботочных кабельных линий связи в количестве: ${ports.length} шт.; протяженность: ${totalCableLen === null ? '' : totalCableLen.toFixed(1) + ' м'}.</p>
              <p style="margin:2px 0;"><b>2. Применены материалы и изделия:</b> ${esc(materials.map(m => m.name).filter(Boolean).join(', '))}.</p>
              <p style="margin:2px 0;"><b>3. Отступления от требований проектной документации и нормативных документов:</b></p>
              <div style="border-bottom:1px solid #cbd5e1;height:18px;margin-bottom:4px;"></div>
              <p style="margin:2px 0;"><b>4. Решение комиссии:</b></p>
              <div style="border-bottom:1px solid #cbd5e1;height:18px;margin-bottom:4px;"></div>
              <div style="border-bottom:1px solid #cbd5e1;height:18px;margin-bottom:4px;"></div>
            </div>

            <div class="doc-signatures" style="margin-top:auto;margin-bottom:6px;">
              <div class="doc-sign-col">
                <b>Представитель Заказчика:</b>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ _________________ /</span></div>
              </div>
              <div class="doc-sign-col">
                <b>Представитель Подрядчика:</b>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ ${esc(installerFio || subContractorDirector)} /</span></div>
              </div>
            </div>
          </div>
          ${renderShortStamp(sheetNum)}
        </div>
      </div>`;
    } else if (sheetDef.key === 'act_equip') {
      // ─── СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ (A4, frame-short) ────────────────────────
      sheetsHtml += `
      <div class="sheet sheet-a4">
        <div class="frame-box frame-short">
          <div class="frame-content">
            <div class="section-heading">СПЕЦИФИКАЦИЯ СМОНТИРОВАННОГО ОБОРУДОВАНИЯ И МАТЕРИАЛОВ</div>
            <table class="grid-table" style="margin-bottom:8px;">
              <thead>
                <tr>
                  <th style="width:30px;" class="tc">№</th>
                  <th>Наименование материала / оборудования</th>
                  <th style="width:50px;" class="tc">Ед.</th>
                  <th style="width:65px;" class="tr">План</th>
                  <th style="width:65px;" class="tr">Факт</th>
                  <th style="width:65px;" class="tr">Остаток</th>
                  <th style="width:110px;">Поставщик</th>
                </tr>
              </thead>
              <tbody>
                ${materials.map((m, idx) => {
                  const plan = numericValue(m.plan_qty);
                  const fact = numericValue(m.fact_qty);
                  const rem = plan !== null && fact !== null ? plan - fact : null;
                  return `<tr>
                    <td class="tc">${idx + 1}</td>
                    <td><b>${esc(m.name)}</b></td>
                    <td class="tc">${esc(m.unit)}</td>
                    <td class="tr">${esc(plan)}</td>
                    <td class="tr"><b>${esc(fact)}</b></td>
                    <td class="tr">${esc(rem)}</td>
                    <td>${esc(m.supplier)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>

            <div class="doc-signatures" style="margin-top:auto;margin-bottom:6px;">
              <div class="doc-sign-col">
                <b>Ответственный за ТМЦ:</b>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ _________________ /</span></div>
              </div>
              <div class="doc-sign-col">
                <b>Монтажная бригада:</b>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ ${esc(installerFio || subContractorDirector)} /</span></div>
              </div>
            </div>
          </div>
          ${renderShortStamp(sheetNum)}
        </div>
      </div>`;
    } else if (sheetDef.key === 'act_mount') {
      // ─── АКТ ГОТОВНОСТИ К МОНТАЖУ (A4, frame-short) ─────────────────────────
      sheetsHtml += `
      <div class="sheet sheet-a4">
        <div class="frame-box frame-short">
          <div class="frame-content">
            <div class="section-heading">АКТ ГОТОВНОСТИ ОБЪЕКТА К ПРОВЕДЕНИЮ МОНТАЖНЫХ РАБОТ</div>
            <div style="font-size:9pt;line-height:1.5;flex:1;">
              <p><b>Объект:</b> ${esc(objectAddress)}</p>
              <p><b>Дата освидетельствования:</b> ${completionDate}</p>
              <p><b>Комиссия установила:</b></p>
              <div style="border-bottom:1px solid #cbd5e1;height:24px;margin-bottom:8px;"></div>
              <div style="border-bottom:1px solid #cbd5e1;height:24px;margin-bottom:8px;"></div>
              <div style="border-bottom:1px solid #cbd5e1;height:24px;margin-bottom:8px;"></div>
            </div>
            <div class="doc-signatures" style="margin-top:auto;margin-bottom:6px;">
              <div class="doc-sign-col">
                <b>Ответственный за объект (Заказчик):</b>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ _________________ /</span></div>
              </div>
              <div class="doc-sign-col">
                <b>Руководитель монтажных работ (Подрядчик):</b>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ ${esc(installerFio || subContractorDirector)} /</span></div>
              </div>
            </div>
          </div>
          ${renderShortStamp(sheetNum)}
        </div>
      </div>`;
    } else if (sheetDef.key === 'work_log') {
      // ─── ЖУРНАЛ РАБОТ (A4, frame-short) ─────────────────────────────────────
      const hasWorkEntry = Boolean(docDateShort || task.work_type);
      const workLogDesc = task.work_type ? `${task.work_type}${objectAddress ? ' на объекте: ' + objectAddress : ''}` : '';
      sheetsHtml += `
      <div class="sheet sheet-a4">
        <div class="frame-box frame-short">
          <div class="frame-content">
            <div class="section-heading">ЖУРНАЛ ПРОИЗВОДСТВА РАБОТ И ПРОКЛАДКИ КАБЕЛЕЙ</div>
            <table class="grid-table" style="margin-bottom:8px;">
              <thead>
                <tr>
                  <th style="width:30px;" class="tc">№</th>
                  <th style="width:75px;" class="tc">Дата</th>
                  <th>Краткое описание выполненных работ</th>
                  <th style="width:110px;">Исполнитель</th>
                  <th style="width:70px;" class="tc">Подпись</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="tc">1</td>
                  <td class="tc">${hasWorkEntry ? esc(docDateShort) : ''}</td>
                  <td>${hasWorkEntry ? esc(workLogDesc) : ''}</td>
                  <td>${hasWorkEntry ? esc(installerFio || subContractor) : ''}</td>
                  <td class="tc"></td>
                </tr>
              </tbody>
            </table>
          </div>
          ${renderShortStamp(sheetNum)}
        </div>
      </div>`;
    } else if (sheetDef.key === 'scheme') {
      // ─── ИСПОЛНИТЕЛЬНАЯ СХЕМА (A3 landscape, frame-full) ───────────────────
      sheetsHtml += `
      <div class="sheet sheet-a3">
        <div class="frame-box frame-full">
          <div class="frame-content">
            <div class="section-heading-landscape">ИСПОЛНИТЕЛЬНАЯ СХЕМА РАЗМЕЩЕНИЯ ОБОРУДОВАНИЯ И ТРАСС СКС</div>
            <div class="scheme-canvas">
              ${schemeBase64 ? `
                <img src="${schemeBase64}" class="scheme-image" alt="Исполнительная схема">
              ` : `
                <div class="scheme-placeholder">
                  <div style="font-weight:700;font-size:13pt;margin-bottom:6px;">[ Место для размещения исполнительной схемы ]</div>
                  <div style="font-size:10pt;">Исполнительная схема трасс СКС, размещения шкафов и информационных розеток</div>
                </div>
              `}
            </div>
          </div>
          ${renderFullStamp(sheetNum)}
        </div>
      </div>`;
    } else if (sheetDef.key === 'kj') {
      // ─── КАБЕЛЬНЫЙ ЖУРНАЛ (A3 landscape, frame-short) ───────────────────────
      sheetsHtml += `
      <div class="sheet sheet-a3">
        <div class="frame-box frame-short">
          <div class="frame-content">
            <div class="section-heading-landscape">КАБЕЛЬНЫЙ ЖУРНАЛ СКС (КЖ)</div>
            <table class="grid-table" style="font-size:8pt;margin-bottom:6px;">
              <thead>
                <tr>
                  <th style="width:28px;" class="tc">№</th>
                  <th style="width:55px;">Порт</th>
                  <th style="width:75px;">Маркировка</th>
                  <th>Помещение (РМ)</th>
                  <th style="width:70px;">Шкаф</th>
                  <th style="width:45px;" class="tc">Юнит</th>
                  <th style="width:85px;">Патч-панель</th>
                  <th style="width:75px;" class="tc">Марка кабеля</th>
                  <th style="width:65px;" class="tr">Длина, м</th>
                  <th style="width:65px;" class="tc">Обжим</th>
                  <th style="width:75px;" class="tc">Статус</th>
                </tr>
              </thead>
              <tbody>
                ${ports.map((p, idx) => {
                  const cableLength = numericValue(p.cable_length);
                  return `<tr>
                    <td class="tc">${idx + 1}</td>
                    <td><b>${esc(p.port_number)}</b></td>
                    <td>${esc(p.marking)}</td>
                    <td>${esc(p.room)}</td>
                    <td>${esc(p.cabinet)}</td>
                    <td class="tc">${esc(p.unit)}</td>
                    <td>${esc(p.patch_panel)}</td>
                    <td class="tc">${esc(p.cable_mark)}</td>
                    <td class="tr">${cableLength !== null ? esc(cableLength) : ''}</td>
                    <td class="tc">${esc(p.crimping)}</td>
                    <td class="tc">${esc(displayTestStatus(p.testing_status))}</td>
                  </tr>`;
                }).join('')}
              </tbody>
              ${ports.length > 0 ? `
              <tfoot>
                <tr style="background:#f8fafc;font-weight:700;">
                  <td colspan="8" class="tr">ИТОГО ПО ОБЪЕКТУ:</td>
                  <td class="tr">${totalCableLen !== null ? totalCableLen.toFixed(1) + ' м' : ''}</td>
                  <td colspan="2" class="tc">${testedCount > 0 ? `Годных: ${passCount} / ${testedCount}` : ''}</td>
                </tr>
              </tfoot>` : ''}
            </table>

            <div class="doc-signatures" style="margin-top:auto;margin-bottom:4px;">
              <div class="doc-sign-col">
                <b>Ответственный за ведение КЖ:</b>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ ${esc(installerFio || subContractorDirector)} /</span></div>
              </div>
              <div class="doc-sign-col">
                <b>Принял технический надзор Заказчика:</b>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ _________________ /</span></div>
              </div>
            </div>
          </div>
          ${renderShortStamp(sheetNum)}
        </div>
      </div>`;
    } else if (sheetDef.key === 'fluke') {
      // ─── ПРОТОКОЛ ИЗМЕРЕНИЙ (A3 landscape, frame-short) ────────────────────
      const hasTests = testedCount > 0;
      sheetsHtml += `
      <div class="sheet sheet-a3">
        <div class="frame-box frame-short">
          <div class="frame-content">
            <div class="section-heading-landscape">ПРОТОКОЛ ИЗМЕРЕНИЙ ПАРАМЕТРОВ КАБЕЛЬНЫХ ЛИНИЙ СКС</div>
            <table class="grid-table" style="font-size:8pt;margin-bottom:6px;">
              <thead>
                <tr>
                  <th style="width:28px;" class="tc">№</th>
                  <th style="width:110px;">ID Линии / Порт</th>
                  <th>Точка А (Кросс / Панель / Порт)</th>
                  <th>Точка Б (Рабочее место / Маркировка)</th>
                  <th style="width:85px;" class="tc">Кабель</th>
                  <th style="width:65px;" class="tr">Длина, м</th>
                  <th style="width:85px;" class="tc">WireMap</th>
                  <th style="width:80px;" class="tc">Результат</th>
                </tr>
              </thead>
              <tbody>
                ${ports.map((p, idx) => {
                  const cableLength = numericValue(p.cable_length);
                  const pointA = [p.cabinet, p.patch_panel, p.port_number].filter(Boolean).join(' / ');
                  const pointB = [p.room, p.outlet_marking || p.marking].filter(Boolean).join(', ');
                  return `<tr>
                    <td class="tc">${idx + 1}</td>
                    <td><b>${esc(p.port_number || p.marking)}</b></td>
                    <td>${esc(pointA)}</td>
                    <td>${esc(pointB)}</td>
                    <td class="tc">${esc(p.cable_mark)}</td>
                    <td class="tr">${cableLength !== null ? esc(cableLength) : ''}</td>
                    <td class="tc">${esc(p.wiremap ?? p.wire_map ?? p.crimping)}</td>
                    <td class="tc">${esc(displayTestStatus(p.testing_status))}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>

            <div style="font-size:8.5pt;margin:4px 0;">
              <b>Заключение по результатам измерений:</b>
            </div>

            <div class="doc-signatures" style="margin-top:auto;margin-bottom:4px;">
              <div class="doc-sign-col">
                <b>Специалист по тестированию:</b>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ _________________ /</span></div>
              </div>
              <div class="doc-sign-col">
                <b>Представитель службы эксплуатации:</b>
                <div class="doc-sign-line"><span>(подпись)</span><span>/ _________________ /</span></div>
              </div>
            </div>
          </div>
          ${renderShortStamp(sheetNum)}
        </div>
      </div>`;
    } else if (sheetDef.key === 'cert') {
      // ─── СЕРТИФИКАТЫ (A4, frame-none) ───────────────────────────────────────
      const certImgs = certAttachments.filter(a => a.base64);
      sheetsHtml += `
      <div class="sheet sheet-a4">
        <div class="frame-box frame-none">
          <div class="frame-content">
            <h2 style="text-align:center;font-size:14pt;margin-top:0;margin-bottom:12px;">Сертификаты соответствия и паспорта качества</h2>
            ${certImgs.length > 0 ? `
              <div style="text-align:center;flex:1;display:flex;align-items:center;justify-content:center;">
                <img src="${certImgs[0].base64}" style="max-width:100%;max-height:240mm;object-fit:contain;border:1px solid #cbd5e1;">
              </div>
            ` : `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#475569;">
              </div>
            `}
          </div>
        </div>
      </div>`;
    } else if (sheetDef.key === 'manual') {
      // ─── РУКОВОДСТВО ПО ЭКСПЛУАТАЦИИ (A4, frame-none) ──────────────────────
      sheetsHtml += `
      <div class="sheet sheet-a4">
        <div class="frame-box frame-none">
          <div class="frame-content" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#475569;">
            <h2 style="font-size:14pt;margin-bottom:12px;color:#0f172a;">Руководства по эксплуатации оборудования</h2>
          </div>
        </div>
      </div>`;
    } else if (sheetDef.key === 'warranty') {
      // ─── ГАРАНТИЙНЫЕ ОБЯЗАТЕЛЬСТВА (A4, frame-none) ─────────────────────────
      sheetsHtml += `
      <div class="sheet sheet-a4">
        <div class="frame-box frame-none">
          <div class="frame-content" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#475569;">
            <h2 style="font-size:14pt;margin-bottom:12px;color:#0f172a;">Гарантийные обязательства</h2>
          </div>
        </div>
      </div>`;
    }
  }

  // Общий HTML-документ альбома
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Альбом ИД — Заявка № ${esc(taskId)}</title>
  <style>
    @page {
      margin: 0;
    }
    @page a4-portrait {
      size: A4 portrait;
      margin: 0;
    }
    @page a3-landscape {
      size: A3 landscape;
      margin: 0;
    }

    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
      color: #000;
      margin: 0;
      padding: 0;
      font-size: 9pt;
      line-height: 1.35;
      background: #fff;
    }

    .sheet {
      page-break-after: always;
      position: relative;
      overflow: hidden;
      background: #fff;
    }

    .sheet-a4 {
      page: a4-portrait;
      width: 210mm;
      height: 297mm;
      padding: 5mm 5mm 5mm 20mm;
    }

    .sheet-a3 {
      page: a3-landscape;
      width: 420mm;
      height: 297mm;
      padding: 5mm 5mm 5mm 20mm;
    }

    /* Рамки ГОСТ */
    .frame-box {
      width: 100%;
      height: 100%;
      border: 1.5px solid #000;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .frame-simple .frame-content {
      flex: 1;
      padding: 10mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .frame-short .frame-content {
      flex: 1;
      padding: 6mm 6mm 2mm 6mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .frame-full .frame-content {
      flex: 1;
      padding: 6mm 6mm 2mm 6mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .frame-none {
      border: none !important;
    }
    .frame-none .frame-content {
      flex: 1;
      padding: 10mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Краткий штамп 185x15 мм */
    .stamp-short {
      height: 15mm;
      width: 185mm;
      margin-left: auto;
      border-top: 1.5px solid #000;
      border-left: 1.5px solid #000;
      display: flex;
      flex-shrink: 0;
    }
    .stamp-short-code {
      flex: 1;
      border-right: 1px solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 10pt;
    }
    .stamp-short-sheet {
      width: 35mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    /* Полный штамп 185x55 мм (форма 2) */
    .stamp-full {
      height: 55mm;
      width: 185mm;
      margin-left: auto;
      border-top: 1.5px solid #000;
      border-left: 1.5px solid #000;
      flex-shrink: 0;
      font-size: 7pt;
    }
    .stamp-full-table {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .stamp-full-table td {
      border: 1px solid #000;
      padding: 1px 3px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .stamp-obj-cell {
      text-align: center;
      vertical-align: middle;
      white-space: normal !important;
      padding: 4px !important;
    }
    .stamp-obj-title {
      font-weight: 700;
      font-size: 8pt;
      line-height: 1.2;
    }
    .stamp-obj-sub {
      font-size: 7pt;
      color: #334155;
      margin-top: 2px;
    }
    .stamp-doc-code {
      font-weight: 700;
      font-size: 8.5pt;
      text-align: center;
      background: #fafafa;
    }
    .stamp-doc-name {
      font-size: 7.5pt;
      text-align: center;
      font-weight: 600;
    }
    .stamp-org-name {
      font-weight: 700;
      font-size: 8pt;
    }

    /* Заголовки разделов */
    .section-heading {
      font-size: 11pt;
      font-weight: 700;
      color: #000;
      border-bottom: 1.5px solid #000;
      padding-bottom: 4px;
      margin-top: 0;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: .3px;
    }
    .section-heading-landscape {
      font-size: 12pt;
      font-weight: 700;
      color: #000;
      border-bottom: 1.5px solid #000;
      padding-bottom: 4px;
      margin-top: 0;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: .4px;
    }

    /* Таблицы данных */
    table.grid-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      border: 1px solid #000;
    }
    table.grid-table th, table.grid-table td {
      border: 1px solid #000;
      padding: 3px 5px;
    }
    table.grid-table th {
      background: #f1f5f9;
      color: #000;
      font-weight: 700;
      text-align: left;
    }
    .tc { text-align: center; }
    .tr { text-align: right; }

    /* Блоки подписей */
    .doc-signatures {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      font-size: 8.5pt;
    }
    .doc-sign-col {
      width: 48%;
      line-height: 1.4;
    }
    .doc-sign-line {
      border-bottom: 1px solid #000;
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      font-size: 7pt;
      color: #64748b;
    }

    /* Титульный лист стили */
    .cover-header {
      border-bottom: 1.5px solid #000;
      padding-bottom: 10px;
      text-align: center;
    }
    .cover-body {
      margin: 20px 0;
      text-align: center;
    }
    .cover-cipher {
      font-size: 11pt;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: .5px;
    }
    .cover-title {
      font-size: 20pt;
      font-weight: 800;
      letter-spacing: .6px;
      margin-bottom: 6px;
    }
    .cover-subtitle {
      font-size: 12pt;
      font-weight: 600;
      color: #334155;
      margin-bottom: 25px;
    }
    .cover-meta {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 12px 16px;
      font-size: 9.5pt;
      text-align: left;
      line-height: 1.6;
      max-width: 650px;
      margin: 0 auto;
    }
    .cover-footer {
      border-top: 1px solid #000;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      font-size: 9pt;
      text-align: left;
    }
    .cover-sign-box {
      width: 46%;
    }
    .cover-sign-line {
      border-bottom: 1px solid #000;
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #64748b;
    }
    .cover-city-year {
      text-align: center;
      font-size: 9.5pt;
      font-weight: 600;
      margin-top: 10px;
    }

    /* Исполнительная схема */
    .scheme-canvas {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 4mm;
    }
    .scheme-image {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border: 1px solid #cbd5e1;
    }
    .scheme-placeholder {
      width: 100%;
      height: 100%;
      border: 2px dashed #94a3b8;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #64748b;
      text-align: center;
      padding: 20px;
    }
  </style>
</head>
<body>

${sheetsHtml}

</body>
</html>`;

  // 7. Запуск Puppeteer и рендеринг PDF
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
    });

    await browser.close();

    // 8. Сохранение файла на диск и регистрация в task_documents
    const docsDir = path.join(UPLOADS_DIR, 'documents');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    const fileName = `id_album_${taskId}_${Date.now()}.pdf`;
    const filePath = path.join(docsDir, fileName);
    fs.writeFileSync(filePath, pdfBuffer);

    const fileUrl = `/uploads/documents/${fileName}`;
    const docNumber = `ИД-${taskId}-СКС`;
    const title = `Альбом исполнительной документации (СКС) № ${docNumber}`;

    const insertRes = await pool.query(`
      INSERT INTO task_documents (
        task_id, subcontract_id, doc_type, doc_number, doc_date, title, file_url, file_type, meta, status
      ) VALUES ($1, $2, 'id_album', $3, CURRENT_DATE, $4, $5, 'pdf', $6, 'pending')
      RETURNING id
    `, [
      taskId,
      sub.id || null,
      docNumber,
      title,
      fileUrl,
      JSON.stringify({
        ports_count: ports.length,
        total_cable_len: totalCableLen,
        pass_count: passCount,
        moderation_status: 'pending',
        generator: 'puppeteer_id_engine'
      })
    ]);

    return {
      success: true,
      docId: insertRes.rows[0].id,
      fileUrl,
      docNumber,
      title,
      html,
      buffer: pdfBuffer
    };
  } catch (err) {
    if (browser) await browser.close();
    throw err;
  }
}
