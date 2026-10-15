// server/routes/documents.js - Маршруты генерации, реестра и скачивания документов
import express from 'express';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { UPLOADS_DIR } from '../middleware/upload.js';
import {
  generateSubcontractOrder,
  generatePermitLetter,
  generatePowerOfAttorney,
  generateIdRegistry,
  generateContract,
  generateCompletionAct,
  generateInvoice,
  generateTmcAct,
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
router.post('/tasks/:taskId/documents/generate', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics'), async (req, res) => {
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

    // Загружаем данные субподряда
    let subcontract = null;
    let contractor = {};
    let generalContractor = DEFAULT_GENERAL_CONTRACTOR;

    let subRes = null;
    if (subcontract_id) {
      subRes = await pool.query(`
        SELECT s.*, 
          c.name_short, c.name_full, c.inn, c.address_legal, c.director, c.phone, c.bank_name, c.bik, c.account_pay, c.account_corr,
          cc.contract_number AS linked_contract_number, cc.contract_date AS linked_contract_date, cc.title AS linked_contract_title,
          oc.id AS own_id, oc.name_short AS own_name_short, oc.name_full AS own_name_full, oc.inn AS own_inn, oc.kpp AS own_kpp,
          oc.ogrn AS own_ogrn, oc.director AS own_director, oc.director_title AS own_director_title, oc.address_legal AS own_address_legal, oc.phone AS own_phone,
          oc.bank_name AS own_bank_name, oc.bik AS own_bik, oc.account_pay AS own_account_pay, oc.account_corr AS own_account_corr
        FROM task_subcontracts s
        LEFT JOIN contractors c ON s.contractor_id = c.id
        LEFT JOIN contractor_contracts cc ON s.contractor_contract_id = cc.id
        LEFT JOIN own_companies oc ON s.own_company_id = oc.id
        WHERE s.id = $1
      `, [subcontract_id]);
    } else {
      subRes = await pool.query(`
        SELECT s.*, 
          c.name_short, c.name_full, c.inn, c.address_legal, c.director, c.phone, c.bank_name, c.bik, c.account_pay, c.account_corr,
          cc.contract_number AS linked_contract_number, cc.contract_date AS linked_contract_date, cc.title AS linked_contract_title,
          oc.id AS own_id, oc.name_short AS own_name_short, oc.name_full AS own_name_full, oc.inn AS own_inn, oc.kpp AS own_kpp,
          oc.ogrn AS own_ogrn, oc.director AS own_director, oc.director_title AS own_director_title, oc.address_legal AS own_address_legal, oc.phone AS own_phone,
          oc.bank_name AS own_bank_name, oc.bik AS own_bik, oc.account_pay AS own_account_pay, oc.account_corr AS own_account_corr
        FROM task_subcontracts s
        LEFT JOIN contractors c ON s.contractor_id = c.id
        LEFT JOIN contractor_contracts cc ON s.contractor_contract_id = cc.id
        LEFT JOIN own_companies oc ON s.own_company_id = oc.id
        WHERE s.task_id = $1
        ORDER BY s.id DESC LIMIT 1
      `, [taskId]);
    }

    if (subRes && subRes.rows.length > 0) {
      subcontract = subRes.rows[0];
      contractor = {
        name_short: subcontract.name_short || subcontract.contractor_name,
        name_full: subcontract.name_full,
        inn: subcontract.inn,
        address_legal: subcontract.address_legal,
        director: subcontract.director,
        phone: subcontract.phone,
        contract_number: subcontract.linked_contract_number || subcontract.contract_number,
        contract_date: subcontract.linked_contract_date || null,
        bank_name: subcontract.bank_name,
        bik: subcontract.bik,
        account_pay: subcontract.account_pay,
        account_corr: subcontract.account_corr
      };

      if (subcontract.own_name_full) {
        generalContractor = {
          name_full: subcontract.own_name_full,
          name_short: subcontract.own_name_short,
          inn: subcontract.own_inn,
          kpp: subcontract.own_kpp || '',
          ogrn: subcontract.own_ogrn || '',
          address_legal: subcontract.own_address_legal,
          phone: subcontract.own_phone || '',
          director: subcontract.own_director,
          director_title: subcontract.own_director_title || 'Директор',
          bank_name: subcontract.own_bank_name || '',
          bik: subcontract.own_bik || '',
          account_pay: subcontract.own_account_pay || '',
          account_corr: subcontract.own_account_corr || ''
        };
      }
    }

    // Если подрядчик все еще не найден, но указан в task.contractor:
    if (!contractor.name_short && task.contractor) {
      const cRes = await pool.query(`
        SELECT * FROM contractors 
        WHERE LOWER(TRIM(name_short)) = LOWER(TRIM($1)) OR LOWER(TRIM(name_full)) = LOWER(TRIM($1))
        LIMIT 1
      `, [task.contractor.trim()]);
      if (cRes.rows.length > 0) {
        const c = cRes.rows[0];
        contractor = {
          name_short: c.name_short,
          name_full: c.name_full,
          inn: c.inn,
          address_legal: c.address_legal,
          director: c.director || c.name_short,
          phone: c.phone,
          bank_name: c.bank_name,
          bik: c.bik,
          account_pay: c.account_pay,
          account_corr: c.account_corr
        };
        const ccRes = await pool.query(`
          SELECT * FROM contracts 
          WHERE contractor_id = $1 OR contract_number ILIKE $2
          ORDER BY id DESC LIMIT 1
        `, [c.id, `%${c.name_short.split(' ').slice(-1)[0]}%`]);
        if (ccRes.rows.length > 0) {
          contractor.contract_number = ccRes.rows[0].contract_number;
          contractor.contract_date = ccRes.rows[0].contract_date;
        }
      } else {
        contractor.name_short = task.contractor;
        contractor.director = task.contractor;
      }
    }

    // Определяем Генерального подрядчика («Мы»), если не был назначен в субподряде:
    if (generalContractor === DEFAULT_GENERAL_CONTRACTOR) {
      let ownId = task.own_company_id;
      if (!ownId && task.contract_id) {
        const cntRes = await pool.query('SELECT own_company_id FROM contracts WHERE id = $1', [task.contract_id]);
        if (cntRes.rows.length > 0) ownId = cntRes.rows[0].own_company_id;
      }
      if (!ownId && (String(task.customer || '').includes('Сбер') || String(task.id || '').includes('К10') || String(task.sheet || '').includes('Сбер'))) {
        const k10Res = await pool.query("SELECT id FROM own_companies WHERE code = 'K10' LIMIT 1");
        if (k10Res.rows.length > 0) ownId = k10Res.rows[0].id;
      }
      if (ownId) {
        const ocRes = await pool.query('SELECT * FROM own_companies WHERE id = $1', [ownId]);
        if (ocRes.rows.length > 0) {
          const oc = ocRes.rows[0];
          generalContractor = {
            name_full: oc.name_full,
            name_short: oc.name_short,
            inn: oc.inn,
            kpp: oc.kpp || '',
            ogrn: oc.ogrn || '',
            address_legal: oc.address_legal,
            phone: oc.phone || '',
            director: oc.director,
            director_title: oc.director_title || 'Директор',
            bank_name: oc.bank_name || '',
            bik: oc.bik || '',
            account_pay: oc.account_pay || '',
            account_corr: oc.account_corr || ''
          };
        }
      }
    }

    let buffer = null;
    let title = 'Документ';
    let docNumber = '';

    const safeId = String(taskId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();

    if (doc_type === 'order_subcontract') {
      docNumber = `ЗН-${task.id}-${subcontract ? subcontract.id : '1'}`;
      title = `Заказ-наряд (Приложение №2) № ${docNumber}`;
      buffer = await generateSubcontractOrder({
        task,
        subcontract: subcontract || {},
        contractor,
        generalContractor,
        orderNumber: docNumber
      });

    } else if (doc_type === 'contract') {
      docNumber = contractor.contract_number || `ДГ-${contractor.inn || '000'}-${Date.now().toString().slice(-4)}`;
      title = `Договор подряда № ${docNumber}`;
      buffer = await generateContract({
        contractor: contractor || {},
        generalContractor,
        date: contractor.contract_date || new Date()
      });
    } else if (doc_type === 'completion_act') {
      docNumber = `АКТ-${task.id}-${subcontract ? subcontract.id : '1'}`;
      title = `Акт сдачи-приемки («Сдал/Принял») № ${docNumber}`;
      buffer = await generateCompletionAct({
        task,
        contractor: contractor || {},
        subcontract: subcontract || {},
        generalContractor,
        date: new Date()
      });

    } else if (doc_type === 'invoice') {
      // Поддержка нескольких счетов при поэтапной оплате
      const cntRes = await pool.query(
        "SELECT COUNT(*) FROM task_documents WHERE task_id = $1 AND doc_type = 'invoice'",
        [taskId]
      );
      const seqNum = Number(cntRes.rows[0].count) + 1;
      docNumber = meta.invoice_number || `СЧ-${task.id}/${seqNum}`;
      title = `Счет на оплату № ${docNumber}`;
      buffer = await generateInvoice({
        task,
        contractor: contractor || {},
        subcontract: subcontract || {},
        generalContractor,
        invoiceNumber: docNumber,
        date: new Date()
      });
    } else if (doc_type === 'tmc_act') {
      // Подгружаем реальные материалы по задаче из task_materials
      const matRes = await pool.query(`
        SELECT tm.*, m.name, m.unit, m.code, m.price_default
        FROM task_materials tm
        LEFT JOIN materials m ON tm.material_id = m.id
        WHERE tm.task_id = $1
        ORDER BY tm.id ASC
      `, [taskId]);

      docNumber = `ТМЦ-${task.id}-${subcontract ? subcontract.id : '1'}`;
      title = `Акт списания материалов (ТМЦ) № ${docNumber}`;
      buffer = await generateTmcAct({
        task,
        contractor: contractor || {},
        subcontract: subcontract || {},
        generalContractor,
        materials: matRes.rows,
        date: new Date()
      });
    } else if (doc_type === 'permit_letter') {
      docNumber = `ИСХ-${task.id}-ДОП`;
      title = `Письмо на допуск на объект (${task.customer || ''}, ${task.vsp || task.address || ''})`;
      // Специалисты
      let specialists = (meta && Array.isArray(meta.specialists)) ? meta.specialists : [];
      if (specialists.length === 0 && subcontract && subcontract.installer_fio) {
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
        generalContractor,
        letterNumber: docNumber
      });
    } else if (doc_type === 'power_attorney') {
      docNumber = `ДОВ-${Math.floor(1000 + Math.random() * 9000)}`;
      title = `Доверенность на получение ТМЦ № ${docNumber}`;
      const specialist = {
        full_name: subcontract ? subcontract.installer_fio : 'Специалист СМР',
        passport_series_number: subcontract ? subcontract.installer_passport : ''
      };
      buffer = await generatePowerOfAttorney({
        task,
        specialist,
        contractor,
        generalContractor,
        poaNumber: docNumber
      });
    } else if (doc_type === 'id_registry') {
      // Подгружаем реальные порты по задаче из task_ports
      const portsRes = await pool.query(`
        SELECT * FROM task_ports
        WHERE task_id = $1
        ORDER BY port_number ASC, id ASC
      `, [taskId]);

      docNumber = `ИД-${task.id}-СКС`;
      title = `Альбом исполнительной документации (СКС) № ${docNumber}`;
      buffer = await generateIdRegistry({
        task,
        ports: portsRes.rows,
        generalContractor,
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
router.delete('/documents/:id', authenticateToken, requireRole('admin', 'director', 'manager'), async (req, res) => {
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
