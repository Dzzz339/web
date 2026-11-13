import express from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { UPLOADS_DIR } from '../middleware/upload.js';
import { convertDocxToHtml } from '../services/docxPreview.js';
import { convertXlsxToHtml } from '../services/xlsxPreview.js';

const router = express.Router();
const unavailableError = { error: 'Файл не найден или недоступен' };

function fileUnavailable(res) {
  return res.status(404).json(unavailableError);
}

function normalizeUploadPath(rawPath) {
  let value = String(rawPath || '').trim();
  if (!value || value.includes('\0')) return null;
  value = value.replace(/\\/g, '/');
  if (/^\/uploads\//i.test(value)) value = value.slice('/uploads/'.length);
  else if (/^uploads\//i.test(value)) value = value.slice('uploads/'.length);
  else if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.startsWith('/')) return null;
  if (!value || value.split('/').some(part => part === '..')) return null;
  return value;
}

async function resolveUploadFile(rawPath) {
  const relativePath = normalizeUploadPath(rawPath);
  if (!relativePath) return null;
  const rootPath = path.resolve(UPLOADS_DIR);
  const candidatePath = path.resolve(rootPath, relativePath);
  const relativeToRoot = path.relative(rootPath, candidatePath);
  if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return null;

  try {
    const [canonicalRoot, canonicalPath] = await Promise.all([
      fs.promises.realpath(rootPath),
      fs.promises.realpath(candidatePath)
    ]);
    const canonicalRelative = path.relative(canonicalRoot, canonicalPath);
    if (!canonicalRelative || canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) return null;
    if (!(await fs.promises.stat(canonicalPath)).isFile()) return null;
    return {
      targetPath: canonicalPath,
      relativeUrl: '/uploads/' + canonicalRelative.split(path.sep).join('/')
    };
  } catch {
    return null;
  }
}

async function canAccessTask(user, taskId) {
  if (!user || !taskId) return false;
  const role = String(user.role || '').toLowerCase();
  if (['admin', 'director', 'manager', 'logistics', 'designer', 'accountant', 'to_engineer'].includes(role)) return true;
  const { rows } = await pool.query('SELECT assignee, contractor, contractor_id FROM tasks WHERE id = $1', [taskId]);
  if (!rows[0]) return false;
  const task = rows[0];
  const userName = String(user.fullName || '').toLowerCase().trim();
  const userLogin = String(user.username || '').toLowerCase().trim();
  const assignee = String(task.assignee || '').toLowerCase().trim();
  const contractor = String(task.contractor || '').toLowerCase().trim();
  if (assignee && (assignee === userName || assignee === userLogin)) return true;
  if (contractor && userName && (contractor === userName || contractor.includes(userName) || userName.includes(contractor))) return true;
  if (user.contractorId && task.contractor_id === user.contractorId) return true;
  const fullName = typeof user.fullName === 'string' ? user.fullName.trim() : '';
  const username = typeof user.username === 'string' ? user.username.trim() : '';
  const namePattern = fullName ? `%${fullName}%` : null;
  const loginPattern = username ? `%${username}%` : null;
  const { rows: subRows } = await pool.query(
    `SELECT 1 FROM task_subcontracts WHERE task_id = $1 AND (
      ($2::text IS NOT NULL AND installer_fio ILIKE $2) OR
      ($3::text IS NOT NULL AND installer_fio ILIKE $3) OR
      (contractor_id IS NOT NULL AND $4::integer IS NOT NULL AND contractor_id = $4::integer)
    ) LIMIT 1`,
    [taskId, namePattern, loginPattern, user.contractorId || null]
  );
  return subRows.length > 0;
}

async function canAccessContract(user, contractId) {
  if (!user || !contractId) return false;
  const role = String(user.role || '').toLowerCase();
  if (['worker', 'contractor', 'installer'].includes(role)) return false;
  const { rows } = await pool.query('SELECT 1 FROM contracts WHERE id = $1', [contractId]);
  return rows.length > 0;
}

async function canAccessPath(user, rawPath, relativePath) {
  const variants = [...new Set([String(rawPath || ''), relativePath, `uploads/${relativePath}`, `/uploads/${relativePath}`])];
  const { rows: owners } = await pool.query(`
    SELECT owner_type, owner_id FROM (
      SELECT 'task' AS owner_type, task_id::text AS owner_id FROM task_attachments WHERE file_path = ANY($1)
      UNION ALL
      SELECT 'contract' AS owner_type, contract_id::text AS owner_id FROM contract_attachments WHERE file_path = ANY($1)
      UNION ALL
      SELECT 'task' AS owner_type, task_id::text AS owner_id FROM task_documents WHERE task_id IS NOT NULL AND file_url = ANY($1)
      UNION ALL
      SELECT 'contract' AS owner_type, contract_id::text AS owner_id FROM task_documents WHERE contract_id IS NOT NULL AND file_url = ANY($1)
    ) attached_owners
  `, [variants]);
  for (const owner of owners) {
    if (owner.owner_type === 'task' && await canAccessTask(user, owner.owner_id)) return true;
    if (owner.owner_type === 'contract' && await canAccessContract(user, owner.owner_id)) return true;
  }
  return false;
}

router.get('/preview/attachment', authenticateToken, async (req, res) => {
  try {
    const { source, id, file_path } = req.query;
    let storedPath = '';
    let fileName = '';
    let allowed = false;

    if (source === 'contract' && id) {
      if (!/^\d+$/.test(String(id))) return fileUnavailable(res);
      const { rows } = await pool.query('SELECT contract_id, file_path, original_name FROM contract_attachments WHERE id = $1', [id]);
      if (!rows.length) return fileUnavailable(res);
      storedPath = rows[0].file_path;
      fileName = rows[0].original_name || path.basename(storedPath);
      allowed = await canAccessContract(req.user, rows[0].contract_id);
    } else if (source === 'task' && id) {
      if (!/^\d+$/.test(String(id))) return fileUnavailable(res);
      const { rows } = await pool.query('SELECT task_id, file_path, original_name FROM task_attachments WHERE id = $1', [id]);
      if (!rows.length) return fileUnavailable(res);
      storedPath = rows[0].file_path;
      fileName = rows[0].original_name || path.basename(storedPath);
      allowed = await canAccessTask(req.user, rows[0].task_id);
    } else if (file_path) {
      storedPath = String(file_path);
      fileName = path.basename(normalizeUploadPath(storedPath) || '');
      const relativePath = normalizeUploadPath(storedPath);
      if (!relativePath) return res.status(400).json({ error: 'Некорректный путь к файлу' });
      allowed = await canAccessPath(req.user, storedPath, relativePath);
    } else {
      return res.status(400).json({ error: 'Не указан источник файла' });
    }

    if (!allowed) return fileUnavailable(res);
    const file = await resolveUploadFile(storedPath);
    if (!file) return fileUnavailable(res);
    const { targetPath, relativeUrl } = file;
    const ext = path.extname(targetPath).toLowerCase();

    if (ext === '.docx') {
      const buf = await fs.promises.readFile(targetPath);
      const html = await convertDocxToHtml(buf);
      return res.json({ type: 'docx', fileName, html, downloadUrl: relativeUrl });
    }

    if (ext === '.xlsx' || ext === '.xls') {
      const buf = await fs.promises.readFile(targetPath);
      const sheets = convertXlsxToHtml(buf);
      return res.json({ type: 'xlsx', fileName, sheets, downloadUrl: relativeUrl });
    }

    if (ext === '.pdf') {
      return res.json({ type: 'pdf', fileName, url: relativeUrl, downloadUrl: relativeUrl });
    }

    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) {
      return res.json({ type: 'image', fileName, url: relativeUrl, downloadUrl: relativeUrl });
    }

    return res.json({ type: 'download', fileName, url: relativeUrl, downloadUrl: relativeUrl });
  } catch (err) {
    console.error('File preview error:', err);
    res.status(500).json({ error: 'Ошибка предпросмотра файла' });
  }
});

export default router;
