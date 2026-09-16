import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadAttachment } from '../middleware/upload.js';
import { 
  runFullImport, 
  importSpecialistsFromFile, 
  importPowersOfAttorneyFromXlsx, 
  syncContractorsFromPOA, 
  execPython 
} from '../services/directoriesImporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

const router = express.Router();

// GET /api/specialists - List specialists with POA summary
router.get('/specialists', authenticateToken, async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim().toLowerCase() : '';
    const contractorId = req.query.contractorId ? parseInt(req.query.contractorId) : null;
    const onlyWithPassport = req.query.withPassport === 'true';

    let query = `
      SELECT 
        s.*,
        c.name_short AS contractor_name,
        COALESCE(poa.active_poa_count, 0) AS active_poa_count,
        COALESCE(poa.active_poas, '[]'::jsonb) AS active_poas
      FROM specialists s
      LEFT JOIN contractors c ON c.id = s.contractor_id
      LEFT JOIN (
        SELECT 
          specialist_id,
          COUNT(*) FILTER (WHERE status = 'active' OR (valid_until >= CURRENT_DATE)) AS active_poa_count,
          jsonb_agg(
            jsonb_build_object(
              'number', number,
              'valid_until', valid_until,
              'contractor', contractor_name,
              'status', status
            ) ORDER BY valid_until DESC
          ) AS active_poas
        FROM powers_of_attorney
        WHERE specialist_id IS NOT NULL
        GROUP BY specialist_id
      ) poa ON poa.specialist_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      query += ` AND (LOWER(s.full_name) LIKE $${params.length} OR LOWER(COALESCE(s.phone, '')) LIKE $${params.length} OR LOWER(COALESCE(s.passport_raw, '')) LIKE $${params.length})`;
    }

    if (contractorId) {
      params.push(contractorId);
      query += ` AND s.contractor_id = $${params.length}`;
    }

    if (onlyWithPassport) {
      query += ` AND (s.passport_raw IS NOT NULL AND s.passport_raw <> '')`;
    }

    query += ` ORDER BY s.passport_raw IS NOT NULL DESC, s.full_name ASC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/specialists - Create specialist
router.post('/specialists', authenticateToken, async (req, res) => {
  try {
    const {
      full_name,
      phone,
      passport_series_number,
      passport_issued_by,
      passport_issue_date,
      passport_code,
      passport_raw,
      organization,
      position,
      contractor_id
    } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ error: 'ФИО специалиста обязательно' });
    }

    const { rows } = await pool.query(
      `INSERT INTO specialists 
       (full_name, phone, passport_series_number, passport_issued_by, passport_issue_date, passport_code, passport_raw, organization, position, contractor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        full_name.trim(),
        phone || null,
        passport_series_number || null,
        passport_issued_by || null,
        passport_issue_date || null,
        passport_code || null,
        passport_raw || null,
        organization || 'ООО "Ультима"',
        position || 'Монтажник СКС',
        contractor_id || null
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/specialists/:id - Update specialist
router.put('/specialists/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      full_name,
      phone,
      passport_series_number,
      passport_issued_by,
      passport_issue_date,
      passport_code,
      passport_raw,
      organization,
      position,
      contractor_id
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE specialists
       SET full_name = COALESCE($1, full_name),
           phone = $2,
           passport_series_number = $3,
           passport_issued_by = $4,
           passport_issue_date = $5,
           passport_code = $6,
           passport_raw = $7,
           organization = COALESCE($8, organization),
           position = COALESCE($9, position),
           contractor_id = $10
       WHERE id = $11
       RETURNING *`,
      [
        full_name ? full_name.trim() : null,
        phone || null,
        passport_series_number || null,
        passport_issued_by || null,
        passport_issue_date || null,
        passport_code || null,
        passport_raw || null,
        organization || null,
        position || null,
        contractor_id || null,
        id
      ]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Специалист не найден' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/specialists/:id - Delete specialist
router.delete('/specialists/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await pool.query('DELETE FROM specialists WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/powers-of-attorney - List powers of attorney
router.get('/powers-of-attorney', authenticateToken, async (req, res) => {
  try {
    const status = req.query.status || 'all'; // all, active, expiring, expired
    const q = req.query.q ? String(req.query.q).trim().toLowerCase() : '';
    const specialistId = req.query.specialistId ? parseInt(req.query.specialistId) : null;
    const contractorId = req.query.contractorId ? parseInt(req.query.contractorId) : null;

    let query = `
      SELECT 
        p.*,
        s.full_name AS specialist_name,
        s.phone AS specialist_phone,
        CASE
          WHEN p.valid_until IS NOT NULL AND p.valid_until < CURRENT_DATE THEN 'expired'
          WHEN p.valid_until IS NOT NULL AND p.valid_until <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring'
          ELSE 'active'
        END AS computed_status
      FROM powers_of_attorney p
      LEFT JOIN specialists s ON s.id = p.specialist_id
      WHERE 1=1
    `;
    const params = [];

    if (specialistId) {
      params.push(specialistId);
      query += ` AND p.specialist_id = $${params.length}`;
    }

    if (contractorId) {
      params.push(contractorId);
      query += ` AND p.contractor_id = $${params.length}`;
    }

    if (q) {
      params.push(`%${q}%`);
      query += ` AND (LOWER(p.number) LIKE $${params.length} OR LOWER(p.person_name) LIKE $${params.length} OR LOWER(COALESCE(p.contractor_name, '')) LIKE $${params.length})`;
    }

    if (status === 'active') {
      query += ` AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE)`;
    } else if (status === 'expiring') {
      query += ` AND (p.valid_until >= CURRENT_DATE AND p.valid_until <= CURRENT_DATE + INTERVAL '30 days')`;
    } else if (status === 'expired') {
      query += ` AND (p.valid_until < CURRENT_DATE)`;
    }

    query += ` ORDER BY p.valid_until DESC NULLS LAST, p.issue_date DESC NULLS LAST`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/powers-of-attorney - Create power of attorney
router.post('/powers-of-attorney', authenticateToken, async (req, res) => {
  try {
    const {
      number,
      issue_date,
      valid_until,
      person_name,
      specialist_id,
      contractor_name,
      organization
    } = req.body;

    if (!number || !person_name) {
      return res.status(400).json({ error: 'Номер и подотчетное лицо обязательны' });
    }

    let status = 'active';
    if (valid_until) {
      const today = new Date().toISOString().slice(0, 10);
      if (valid_until < today) status = 'expired';
      else {
        const dDiff = (new Date(valid_until) - new Date(today)) / (1000 * 60 * 60 * 24);
        if (dDiff <= 30) status = 'expiring';
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO powers_of_attorney
       (number, issue_date, valid_until, person_name, specialist_id, contractor_name, organization, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        number.trim(),
        issue_date || null,
        valid_until || null,
        person_name.trim(),
        specialist_id || null,
        contractor_name || null,
        organization || 'ООО "Ультима"',
        status
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/powers-of-attorney/:id - Update power of attorney
router.put('/powers-of-attorney/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      number,
      issue_date,
      valid_until,
      person_name,
      specialist_id,
      contractor_name,
      organization
    } = req.body;

    let status = 'active';
    if (valid_until) {
      const today = new Date().toISOString().slice(0, 10);
      if (valid_until < today) status = 'expired';
      else {
        const dDiff = (new Date(valid_until) - new Date(today)) / (1000 * 60 * 60 * 24);
        if (dDiff <= 30) status = 'expiring';
      }
    }

    const { rows } = await pool.query(
      `UPDATE powers_of_attorney
       SET number = COALESCE($1, number),
           issue_date = $2,
           valid_until = $3,
           person_name = COALESCE($4, person_name),
           specialist_id = $5,
           contractor_name = $6,
           organization = COALESCE($7, organization),
           status = $8
       WHERE id = $9
       RETURNING *`,
      [
        number ? number.trim() : null,
        issue_date || null,
        valid_until || null,
        person_name ? person_name.trim() : null,
        specialist_id || null,
        contractor_name || null,
        organization || null,
        status,
        id
      ]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Доверенность не найдена' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/powers-of-attorney/:id - Delete power of attorney
router.delete('/powers-of-attorney/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await pool.query('DELETE FROM powers_of_attorney WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tasks/:id/access-letter - Generate DOCX access letter
router.post('/tasks/:id/access-letter', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { specialistIds, contractorName, responsibleInfo, customTaskInfo } = req.body;

    if (!Array.isArray(specialistIds) || specialistIds.length === 0) {
      return res.status(400).json({ error: 'Выберите хотя бы одного специалиста для допуска' });
    }

    // Get task details
    const taskRes = await pool.query(
      'SELECT id, address, gosb, vsp, customer, contact FROM tasks WHERE id = $1 LIMIT 1',
      [taskId]
    );
    const task = taskRes.rows[0] || { id: taskId };

    // Get specialists details
    const specsRes = await pool.query(
      'SELECT * FROM specialists WHERE id = ANY($1::int[]) ORDER BY id ASC',
      [specialistIds]
    );
    const specialists = specsRes.rows;

    const templatePath = path.join(ROOT_DIR, 'документы', 'Dlya_poluchenia_dopuska.docx');
    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ error: 'Шаблон письма Dlya_poluchenia_dopuska.docx не найден' });
    }

    // Build task info string
    const parts = [];
    if (task.address) parts.push(task.address);
    if (task.vsp) parts.push(`ВСП ${task.vsp}`);
    if (task.gosb) parts.push(`ГОСБ ${task.gosb}`);
    parts.push(`Заявка № ${task.id}`);
    if (task.contact) parts.push(`Контакт: ${task.contact}`);
    const taskInfoStr = customTaskInfo || parts.join(', ');

    const outFilename = `AccessLetter_${taskId}_${Date.now()}.docx`;
    const outPath = path.join(UPLOADS_DIR, outFilename);
    const cfgPath = path.join(UPLOADS_DIR, `cfg_${Date.now()}.json`);

    const cfg = {
      template_path: templatePath,
      output_path: outPath,
      contractor_name: contractorName || 'ООО "Ультима"',
      responsible_info: responsibleInfo || '8(923) 102-40-42, ПМ – Чайка Алексей Николаевич',
      task_info: taskInfoStr,
      specialists: specialists.map(s => ({
        full_name: s.full_name,
        passport_raw: s.passport_raw || s.passport_series_number || 'Паспортные данные уточняются',
        phone: s.phone || ''
      }))
    };

    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');

    const scriptPath = path.join(ROOT_DIR, 'server', 'scripts', 'generate_access_letter.py');
    execPython(scriptPath, [cfgPath], (pyErr, stdout, stderr) => {
      // Clean up config file
      try { if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath); } catch (_) {}

      if (pyErr) {
        console.error('[AccessLetter] Generation failed:', stderr || pyErr.message);
        return res.status(500).json({ error: 'Ошибка генерации документа: ' + (stderr || pyErr.message) });
      }

      if (!fs.existsSync(outPath)) {
        return res.status(500).json({ error: 'Сгенерированный файл не найден' });
      }

      const cleanTaskId = String(task.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      const downloadName = `Pismo_na_dopusk_${cleanTaskId}.docx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
      
      const fileStream = fs.createReadStream(outPath);
      fileStream.pipe(res);
      fileStream.on('end', () => {
        try { fs.unlinkSync(outPath); } catch (_) {}
      });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/directories/upload-specialists - Upload specialists file (.docx or .xlsx)
router.post('/directories/upload-specialists', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не прикреплен' });
  }
  const uploadedPath = req.file.path;
  try {
    const result = await importSpecialistsFromFile(uploadedPath);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[UploadSpecialists] Error:', e);
    res.status(500).json({ error: 'Ошибка обработки файла специалистов: ' + e.message });
  } finally {
    try { if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch (_) {}
  }
});

// POST /api/directories/upload-poa - Upload powers of attorney (.xlsx)
router.post('/directories/upload-poa', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не прикреплен' });
  }
  const uploadedPath = req.file.path;
  try {
    const poaResult = await importPowersOfAttorneyFromXlsx(uploadedPath);
    let contrResult = { added: 0, updated: 0 };
    try {
      contrResult = await syncContractorsFromPOA();
    } catch (cErr) {
      console.warn('[UploadPOA] Warning syncing contractors:', cErr.message);
    }
    res.json({ ok: true, poa: poaResult, contractors: contrResult });
  } catch (e) {
    console.error('[UploadPOA] Error:', e);
    res.status(500).json({ error: 'Ошибка обработки реестра доверенностей: ' + e.message });
  } finally {
    try { if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch (_) {}
  }
});

// POST /api/directories/reimport - Force reimport from disk (if files exist on server)
router.post('/directories/reimport', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только для администраторов' });
  try {
    const result = await runFullImport();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
