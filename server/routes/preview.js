import express from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { convertDocxToHtml } from '../services/docxPreview.js';
import { convertXlsxToHtml } from '../services/xlsxPreview.js';

const router = express.Router();

router.get('/preview/attachment', authenticateToken, async (req, res) => {
  try {
    const { source, id, file_path } = req.query;
    let targetPath = '';
    let fileName = '';

    if (file_path) {
      // Прямой путь в uploads
      targetPath = path.resolve('uploads', file_path.replace(/^\/?uploads\//, ''));
      fileName = path.basename(targetPath);
    } else if (source === 'contract' && id) {
      const { rows } = await pool.query('SELECT file_path, original_name FROM contract_attachments WHERE id = $1', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Вложение договора не найдено' });
      targetPath = path.resolve('uploads', rows[0].file_path);
      fileName = rows[0].original_name || path.basename(targetPath);
    } else if (source === 'task' && id) {
      const { rows } = await pool.query('SELECT file_path, original_name FROM task_attachments WHERE id = $1', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Вложение заявки не найдено' });
      targetPath = path.resolve('uploads', rows[0].file_path);
      fileName = rows[0].original_name || path.basename(targetPath);
    } else {
      return res.status(400).json({ error: 'Не указан источник файла' });
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Файл на диске не найден' });
    }

    const ext = path.extname(targetPath).toLowerCase();
    const relativeUrl = '/uploads/' + path.relative('uploads', targetPath).replace(/\\/g, '/');

    if (ext === '.docx') {
      const buf = fs.readFileSync(targetPath);
      const html = await convertDocxToHtml(buf);
      return res.json({ type: 'docx', fileName, html, downloadUrl: relativeUrl });
    }

    if (ext === '.xlsx' || ext === '.xls') {
      const buf = fs.readFileSync(targetPath);
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
    res.status(500).json({ error: 'Ошибка предпросмотра: ' + err.message });
  }
});

export default router;
