// server/routes/documents.js - Маршруты генерации, реестра и скачивания документов
import express from 'express';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { UPLOADS_DIR } from '../middleware/upload.js';
import {
  generateSubcontractOrder,
  generatePermitLetter,
  generatePowerOfAttorney,
  generateIdRegistry,
  DEFAULT_GENERAL_CONTRACTOR
} from '../services/docxGenerator.js';

const router = express.Router();
const DOCS_DIR = path.join(UPLOADS_DIR, 'documents');
if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

// 1. Получить список документов по задаче
router.get('/tasks/:taskId/documents', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { subcontractId } = req.query;

    let query = `
      SELECT d.*, u.full_name AS created_by_name
      FROM task_documents d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.task_id = $1
    `;
    const params = [taskId];

    if (subcontractId) {
      params.push(subcontractId);
      query += ` AND d.subcontract_id = $2`;
    }

    query += ` ORDER BY d.created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Ошибка получения реестра документов' });
  }
});

// 2. Сгенерировать и зарегистрировать документ
router.post('/tasks/:taskId/documents/generate', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const {
      doc_type, // 'order_subcontract', 'permit_letter', 'power_attorney', 'id_registry'
      subcontract_id,
      meta = {}
    } = req.body;

    // Загружаем данные задачи
    const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    const task = taskRes.rows[0];

    // Загружаем данные субподряда, если передан
    let subcontract = null;
    let contractor = {};
    if (subcontract_id) {
      const subRes = await pool.query(`
        SELECT s.*, c.name_short, c.name_full, c.inn, c.address_legal, c.director, c.phone, c.contract_number
        FROM task_subcontracts s
        LEFT JOIN contractors c ON s.contractor_id = c.id
        WHERE s.id = $1
      `, [subcontract_id]);
      if (subRes.rows.length > 0) {
        subcontract = subRes.rows[0];
        contractor = {
          name_short: subcontract.name_short,
          name_full: subcontract.name_full,
          inn: subcontract.inn,
          address_legal: subcontract.address_legal,
          director: subcontract.director,
          phone: subcontract.phone,
          contract_number: subcontract.contract_number
        };
      }
    }

    let buffer = null;
    let title = 'Документ';
    let docNumber = '';

    const safeId = String(taskId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();

    if (doc_type === 'order_subcontract') {
      docNumber = `ЗН-${task.id}-${subcontract ? subcontract.id : '1'}`;
      title = `Заказ-наряд № ${docNumber}`;
      buffer = await generateSubcontractOrder({
        task,
        subcontract: subcontract || {},
        contractor,
        orderNumber: docNumber
      });
    } else if (doc_type === 'permit_letter') {
      docNumber = `ИСХ-${task.id}-ДОП`;
      title = `Письмо на допуск на объект (${task.vsp || task.address || ''})`;
      // Специалисты
      let specialists = [];
      if (subcontract && subcontract.installer_fio) {
        specialists.push({
          full_name: subcontract.installer_fio,
          passport_series_number: subcontract.installer_passport,
          phone: subcontract.installer_phone,
          auto_number: subcontract.auto_number
        });
      }
      buffer = await generatePermitLetter({
        task,
        specialists,
        contractor,
        letterNumber: docNumber
      });
    } else if (doc_type === 'power_attorney') {
      docNumber = `ДОВ-${Math.floor(1000 + Math.random() * 9000)}`;
      title = `Доверенность на ТМЦ № ${docNumber}`;
      const specialist = {
        full_name: subcontract ? subcontract.installer_fio : 'Специалист СМР',
        passport_series_number: subcontract ? subcontract.installer_passport : ''
      };
      buffer = await generatePowerOfAttorney({
        task,
        specialist,
        contractor,
        poaNumber: docNumber
      });
    } else if (doc_type === 'id_registry') {
      docNumber = `РИД-${task.id}`;
      title = `Реестр передачи ИД № ${docNumber}`;
      buffer = await generateIdRegistry({
        task,
        registryNumber: docNumber
      });
    } else {
      return res.status(400).json({ error: `Неизвестный тип документа: ${doc_type}` });
    }

    // Сохраняем файл на диск
    const fileName = `${doc_type}_${safeId}_${timestamp}.docx`;
    const filePath = path.join(DOCS_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    const fileUrl = `/uploads/documents/${fileName}`;

    // Регистрируем в таблице task_documents
    const insertRes = await pool.query(`
      INSERT INTO task_documents (
        task_id, subcontract_id, doc_type, doc_number, title, file_url, file_type, meta, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'docx', $7, $8)
      RETURNING *
    `, [
      taskId,
      subcontract_id || null,
      doc_type,
      docNumber,
      title,
      fileUrl,
      JSON.stringify(meta),
      req.user?.id || null
    ]);

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error('Error generating document:', err);
    res.status(500).json({ error: 'Ошибка генерации документа: ' + err.message });
  }
});

// 3. Удалить документ
router.delete('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const docRes = await pool.query('SELECT * FROM task_documents WHERE id = $1', [id]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' });
    }

    const doc = docRes.rows[0];
    if (doc.file_url && doc.file_url.startsWith('/uploads/documents/')) {
      const diskPath = path.join(DOCS_DIR, path.basename(doc.file_url));
      if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    }

    await pool.query('DELETE FROM task_documents WHERE id = $1', [id]);
    res.json({ success: true, message: 'Документ удален' });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Ошибка удаления документа' });
  }
});

export default router;
