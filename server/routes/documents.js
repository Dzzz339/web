// server/routes/documents.js - Маршруты генерации, реестра и скачивания документов
import express from 'express';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { UPLOADS_DIR, uploadAttachment, fixUtf8Filename } from '../middleware/upload.js';
import { generateIdPdfAlbum, resolveTaskChecklist, getDefaultChecklist, isSfrCustomer } from '../services/idPdfGenerator.js';
import { generateIdExcelAlbum } from '../services/idExcelGenerator.js';
import { generateCableJournalExcel, generateFlukeProtocolExcel } from '../services/cableJournalExcelGenerator.js';
import {
  generateSubcontractOrder,
  generatePermitLetter,
  generateAccessWorkOrder,
  generateHazardousWorkPermit,
  generatePowerOfAttorney,
  generateIdRegistry,
  generateContract,
  generateSubcontractAgreementDocx,
  generateCompletionAct,
  generateInvoice,
  generateTmcAct,
  DEFAULT_GENERAL_CONTRACTOR
} from '../services/docxGenerator.js';
import { htmlToDocxBuffer } from '../services/htmlDocxConverter.js';
import { collectDocumentContext, renderTemplateHtml, formatDateRu } from '../services/documentContext.js';

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
router.post('/tasks/:taskId/documents/generate', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
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
          SELECT * FROM contractor_contracts
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
        const cntRes = await pool.query('SELECT own_company_id, our_entity_name FROM contracts WHERE id = $1', [task.contract_id]);
        if (cntRes.rows.length > 0) {
          ownId = cntRes.rows[0].own_company_id;
          if (!ownId && cntRes.rows[0].our_entity_name) {
            const entName = String(cntRes.rows[0].our_entity_name).toLowerCase();
            if (entName.includes('к10')) {
              const k10 = await pool.query("SELECT id FROM own_companies WHERE code = 'K10' LIMIT 1");
              if (k10.rows.length) ownId = k10.rows[0].id;
            } else if (entName.includes('кабельн')) {
              const ks = await pool.query("SELECT id FROM own_companies WHERE code = 'KS' LIMIT 1");
              if (ks.rows.length) ownId = ks.rows[0].id;
            } else if (entName.includes('ультим')) {
              const ult = await pool.query("SELECT id FROM own_companies WHERE code = 'ULTIMA' LIMIT 1");
              if (ult.rows.length) ownId = ult.rows[0].id;
            }
          }
        }
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
      const subDetails = (subcontract && subcontract.calculation_details) || {};
      const orderParams = subDetails.order_params || (task && task.raw_data && task.raw_data.orderParams) || {};
      const appendixNum = parseInt(orderParams.appendix_num, 10) || 2;
      const orderNum = parseInt(orderParams.order_num, 10) || (subcontract ? subcontract.id : 1);

      let linkedContract = {};
      if (subcontract && subcontract.contractor_contract_id) {
        const ccRes = await pool.query('SELECT * FROM contractor_contracts WHERE id = $1', [subcontract.contractor_contract_id]);
        if (ccRes.rows.length) linkedContract = ccRes.rows[0];
      }
      if (!linkedContract.id && contractor.id) {
        const ccRes = await pool.query('SELECT * FROM contractor_contracts WHERE contractor_id = $1 ORDER BY id DESC LIMIT 1', [contractor.id]);
        if (ccRes.rows.length) linkedContract = ccRes.rows[0];
      }
      if (!linkedContract.id && contractor.id) {
        const cRes = await pool.query('SELECT * FROM contracts WHERE customer_id = $1 ORDER BY id DESC LIMIT 1', [contractor.id]);
        if (cRes.rows.length) linkedContract = cRes.rows[0];
      }

      let customerContract = null;
      if (task.contract_id) {
        const cRes = await pool.query('SELECT * FROM contracts WHERE id = $1', [task.contract_id]);
        if (cRes.rows.length) customerContract = cRes.rows[0];
      } else if (subcontract && subcontract.contractor_contract_id) {
        const ccParent = await pool.query(`
          SELECT c.* FROM contractor_contracts cc
          JOIN contracts c ON c.id = cc.parent_contract_id
          WHERE cc.id = $1
        `, [subcontract.contractor_contract_id]);
        if (ccParent.rows.length) customerContract = ccParent.rows[0];
      }

      const contractNumber = linkedContract.contract_number || contractor.contract_number || 'б/н';
      const contractDateRu = linkedContract.contract_date ? formatDateRu(linkedContract.contract_date) : (contractor.contract_date ? formatDateRu(contractor.contract_date) : 'б/д');

      docNumber = String(orderNum);
      title = `Приложение № ${appendixNum} к Договору субподряда № ${contractNumber} от ${contractDateRu} — Заявка № ${orderNum}`;
      buffer = await generateSubcontractOrder({
        task,
        subcontract: subcontract || {},
        contract: customerContract || {},
        contractor,
        generalContractor,
        orderNumber: docNumber,
        appendixNum,
        linkedContract,
        orderParams
      });

    } else if (doc_type === 'contract' || doc_type === 'subcontract_agreement') {
      // Подгружаем договор субподряда если привязан
      let linkedContract = {};
      if (subcontract && subcontract.contractor_contract_id) {
        const ccRes = await pool.query('SELECT * FROM contractor_contracts WHERE id = $1', [subcontract.contractor_contract_id]);
        if (ccRes.rows.length) linkedContract = ccRes.rows[0];
      }
      if (!linkedContract.id && contractor.id) {
        const ccRes = await pool.query('SELECT * FROM contractor_contracts WHERE contractor_id = $1 ORDER BY id DESC LIMIT 1', [contractor.id]);
        if (ccRes.rows.length) linkedContract = ccRes.rows[0];
      }

      docNumber = linkedContract.contract_number || contractor.contract_number || `ДГ-${contractor.inn || '000'}-${Date.now().toString().slice(-4)}`;
      title = `Договор субподряда № ${docNumber}`;

      buffer = await generateSubcontractAgreementDocx({
        contract: {
          ...linkedContract,
          contract_number: docNumber,
          contract_date: linkedContract.contract_date || contractor.contract_date || new Date()
        },
        contractor: contractor || {},
        ownCompany: generalContractor,
        task,
        subcontract
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
    } else if (doc_type === 'id_registry' || doc_type === 'id_album') {
      // Генерация альбома ИД в формате .PDF через headless движок
      const pdfRes = await generateIdPdfAlbum({ taskId, pool });
      return res.json({
        id: pdfRes.docId,
        task_id: taskId,
        subcontract_id: subcontract?.id || null,
        doc_type: 'id_album',
        doc_number: pdfRes.docNumber,
        title: pdfRes.title,
        file_url: pdfRes.fileUrl,
        file_type: 'pdf',
        created_at: new Date()
      });
    } else if (doc_type === 'access_order') {
      docNumber = `ЗН-${task.id}-ОБ`;
      title = `Заказ-наряд на производство работ № ${docNumber}`;
      let specialists = (meta && Array.isArray(meta.specialists)) ? meta.specialists : [];
      if (specialists.length === 0 && subcontract && subcontract.installer_fio) {
        specialists.push({
          full_name: subcontract.installer_fio,
          passport_series_number: subcontract.installer_passport,
          phone: subcontract.installer_phone,
          role: 'Старший монтажник'
        });
      }
      buffer = await generateAccessWorkOrder({
        task,
        specialists,
        contractor,
        generalContractor,
        orderNumber: docNumber,
        responsibleInfo: meta?.responsible_info,
        workTypes: meta?.work_types,
        instructions: meta?.instructions
      });
    } else if (doc_type === 'work_permit') {
      docNumber = `НД-${task.id}`;
      title = `Наряд-допуск на работы повышенной опасности № ${docNumber}`;
      let specialists = (meta && Array.isArray(meta.specialists)) ? meta.specialists : [];
      if (specialists.length === 0 && subcontract && subcontract.installer_fio) {
        specialists.push({
          full_name: subcontract.installer_fio,
          passport_series_number: subcontract.installer_passport,
          phone: subcontract.installer_phone
        });
      }
      buffer = await generateHazardousWorkPermit({
        task,
        specialists,
        contractor,
        generalContractor,
        permitNumber: docNumber,
        responsibleInfo: meta?.responsible_info
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
      VALUES ($1, $2, $3, $4, $5, $6, 'docx', $7, (SELECT id FROM users WHERE id = $8))
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

// 2.1. Загрузка / ручной учет входящего счета или акта от контрагента
router.post('/tasks/:taskId/documents/upload', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  try {
    const { taskId } = req.params;
    const {
      doc_type = 'invoice',
      doc_number = '',
      doc_date = null,
      title = '',
      amount = null,
      status = 'issued',
      comment = '',
      subcontract_id = null
    } = req.body;

    let fileUrl = '';
    let fileType = 'file';

    if (req.file) {
      fileUrl = `/uploads/documents/${req.file.filename}`;
      const ext = path.extname(req.file.originalname).replace('.', '').toLowerCase();
      fileType = ext || 'pdf';
    }

    const numVal = (amount !== undefined && amount !== '' && amount !== null) ? parseFloat(amount) : null;
    const meta = {
      amount: numVal,
      status: status || 'issued',
      comment: comment || '',
      is_incoming: true,
      uploader_name: req.user?.fullName || req.user?.username || 'Пользователь'
    };

    let docTitle = title;
    if (!docTitle) {
      if (doc_type === 'invoice') docTitle = `Счет на оплату № ${doc_number || 'б/н'}`;
      else if (doc_type === 'completion_act') docTitle = `Акт вып. работ № ${doc_number || 'б/н'}`;
      else if (doc_type === 'access_order') docTitle = `Заказ-наряд № ${doc_number || 'б/н'}`;
      else if (doc_type === 'work_permit') docTitle = `Наряд-допуск № ${doc_number || 'б/н'}`;
      else docTitle = `Входящий документ № ${doc_number || 'б/н'}`;
    }

    const insertRes = await pool.query(`
      INSERT INTO task_documents (
        task_id, subcontract_id, doc_type, doc_number, doc_date, title, file_url, file_type, meta, status, created_by
      )
      VALUES (
        $1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, $7, $8, $9, $10,
        (SELECT id FROM users WHERE id = $11)
      )
      RETURNING *
    `, [
      taskId,
      subcontract_id || null,
      doc_type,
      doc_number || null,
      doc_date || null,
      docTitle,
      fileUrl,
      fileType,
      JSON.stringify(meta),
      status || 'issued',
      req.user?.id || null
    ]);

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error('Error uploading/recording document:', err);
    res.status(500).json({ error: 'Ошибка сохранения документа: ' + err.message });
  }
});

const ALLOWED_DOC_TRANSITIONS = {
  draft: ['draft', 'review', 'pending', 'approved', 'signed', 'rejected'],
  created: ['created', 'draft', 'review', 'pending', 'approved', 'signed', 'rejected'],
  generated: ['generated', 'draft', 'review', 'pending', 'approved', 'signed', 'rejected'],
  issued: ['issued', 'draft', 'review', 'pending', 'approved', 'signed', 'rejected'],
  review: ['review', 'pending', 'approved', 'signed', 'rejected', 'draft'],
  pending: ['pending', 'review', 'approved', 'signed', 'rejected', 'draft'],
  approved: ['approved', 'signed', 'sent', 'rejected', 'pending', 'draft'],
  rejected: ['rejected', 'draft', 'review', 'pending'],
  signed: ['signed', 'sent', 'paid', 'rejected'],
  sent: ['sent', 'signed', 'paid', 'rejected'],
  paid: ['paid']
};

const handleDocumentUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, amount, doc_number, doc_date, title, comment, rejection_reason, reason } = req.body || {};

    const curRes = await pool.query('SELECT * FROM task_documents WHERE id = $1', [id]);
    if (!curRes.rows.length) return res.status(404).json({ error: 'Документ не найден' });

    const doc = curRes.rows[0];
    const meta = typeof doc.meta === 'string' ? JSON.parse(doc.meta || '{}') : (doc.meta || {});
    const curStatus = String(doc.status || 'draft').toLowerCase();

    if (status !== undefined && status !== null) {
      const nextStatus = String(status).trim().toLowerCase();
      const allowedNext = ALLOWED_DOC_TRANSITIONS[curStatus] || ['draft', 'review', 'pending', 'approved', 'signed', 'rejected'];
      if (nextStatus !== curStatus && !allowedNext.includes(nextStatus)) {
        return res.status(400).json({
          error: `Недопустимый переход статуса документа из «${curStatus}» в «${nextStatus}»`
        });
      }

      if (nextStatus === 'rejected') {
        const rejReason = (rejection_reason || reason || comment || '').trim();
        if (!rejReason) {
          return res.status(400).json({ error: 'При отклонении документа необходимо указать причину' });
        }
        meta.rejection_reason = rejReason;
        meta.comment = rejReason;
      }

      meta.status = nextStatus;
    }

    if (amount !== undefined) {
      meta.amount = (amount !== '' && amount !== null) ? parseFloat(amount) : null;
    }
    if (comment !== undefined && (!status || String(status).toLowerCase() !== 'rejected')) {
      meta.comment = comment;
    }

    const newStatus = (status !== undefined && status !== null) ? String(status).trim().toLowerCase() : doc.status;
    const newDocNum = doc_number !== undefined ? doc_number : doc.doc_number;
    const newDocDate = doc_date !== undefined ? doc_date : doc.doc_date;
    const newTitle = title !== undefined ? title : doc.title;

    // Синхронизируем статус с договором субподряда, если передан subcontract_contract_id И статус не rejected
    if (doc.subcontract_contract_id && newStatus && newStatus !== 'rejected') {
      await pool.query(
        'UPDATE contractor_contracts SET status = $1, updated_at = NOW() WHERE id = $2 AND status != $1',
        [newStatus, doc.subcontract_contract_id]
      );
    }

    const updRes = await pool.query(`
      UPDATE task_documents SET
        status = $1,
        doc_number = $2,
        doc_date = COALESCE($3::date, doc_date),
        title = $4,
        meta = $5
      WHERE id = $6
      RETURNING *
    `, [newStatus, newDocNum, newDocDate, newTitle, JSON.stringify(meta), id]);

    res.json(updRes.rows[0]);
  } catch (err) {
    console.error('Error updating document:', err);
    res.status(500).json({ error: 'Ошибка обновления документа: ' + err.message });
  }
};

// 2.2. Быстрое обновление статуса, суммы и реквизитов документа
router.patch('/documents/:id', authenticateToken, requireRole('admin', 'director', 'manager', 'to_engineer'), handleDocumentUpdate);
router.put('/documents/:id', authenticateToken, requireRole('admin', 'director', 'manager', 'to_engineer'), handleDocumentUpdate);
router.post('/documents/:id/status', authenticateToken, requireRole('admin', 'director', 'manager', 'to_engineer'), handleDocumentUpdate);

// 3. Удалить документ (запрещено удалять подписанные / отправленные документы)
router.delete('/documents/:id', authenticateToken, requireRole('admin', 'director', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const docRes = await pool.query('SELECT * FROM task_documents WHERE id = $1', [id]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' });
    }

    const doc = docRes.rows[0];
    const userRole = req.user?.role || 'user';
    if ((doc.status === 'signed' || doc.status === 'sent') && userRole !== 'admin') {
      return res.status(403).json({
        error: `Удаление документа запрещено в статусе «${doc.status}». Удалять можно только черновики.`
      });
    }

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

// 3.1. Загрузка скан-копии подписанного документа (автоматический перевод в статус "signed")
router.post('/documents/:id/upload-scan', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!req.file) {
      return res.status(400).json({ error: 'Файл скан-копии не передан' });
    }
    const fileUrl = '/uploads/documents/' + req.file.filename;
    const ext = path.extname(req.file.originalname).replace('.', '').toLowerCase();

    const curRes = await pool.query('SELECT * FROM task_documents WHERE id = $1', [id]);
    if (!curRes.rows.length) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    const doc = curRes.rows[0];
    const meta = typeof doc.meta === 'string' ? JSON.parse(doc.meta || '{}') : (doc.meta || {});
    meta.status = 'signed';
    meta.scan_uploaded_at = new Date().toISOString();
    meta.scan_uploaded_by = req.user?.fullName || req.user?.username || 'Пользователь';

    const updRes = await pool.query(`
      UPDATE task_documents SET
        file_url = $1,
        file_type = $2,
        status = 'signed',
        meta = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [fileUrl, ext, JSON.stringify(meta), id]);

    if (doc.subcontract_contract_id) {
      await pool.query(`
        UPDATE contractor_contracts SET
          scan_url = $1,
          status = 'signed',
          updated_at = NOW()
        WHERE id = $2
      `, [fileUrl, doc.subcontract_contract_id]);
    }

    res.json({
      success: true,
      file_url: fileUrl,
      document: updRes.rows[0]
    });
  } catch (err) {
    console.error('Error uploading document scan:', err);
    res.status(500).json({ error: 'Ошибка загрузки скана документа: ' + err.message });
  }
});


// 4. Прямой просмотр / скачивание альбома ИД в .PDF
router.get('/tasks/:taskId/id-album.pdf', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    // Ищем существующий альбом в task_documents
    const docRes = await pool.query(
      "SELECT * FROM task_documents WHERE task_id = $1 AND doc_type = 'id_album' ORDER BY id DESC LIMIT 1",
      [taskId]
    );

    let fileUrl = docRes.rows[0]?.file_url;
    let diskPath = fileUrl ? path.join(UPLOADS_DIR, fileUrl.replace(/^\/uploads\//, '')) : null;

        if (!diskPath || !fs.existsSync(diskPath)) {
      // Генерируем альбом на лету с учетом чек-листа
      const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
      const task = taskRes.rows[0];
      const checklist = task ? resolveTaskChecklist(task) : undefined;
      const genRes = await generateIdPdfAlbum({ taskId, pool, checklist });
      fileUrl = genRes.fileUrl;
      diskPath = path.join(UPLOADS_DIR, fileUrl.replace(/^\/uploads\//, ''));
    }

    const safeAscii = 'id_album_' + encodeURIComponent(taskId).replace(/%/g, '_') + '.pdf';
    const utf8Filename = 'id_album_' + taskId + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`);
    res.sendFile(diskPath);
  } catch (err) {
    console.error('Error serving ID album PDF:', err);
    res.status(500).json({ error: 'Ошибка генерации альбома ИД в PDF: ' + err.message });
  }
});

// 4.1. Скачивание альбома ИД в формате Excel (.xlsx по эталону ГОСТ)
router.get('/tasks/:taskId/id-album.xlsx', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const excelBuffer = await generateIdExcelAlbum(taskId);

    const safeAscii = 'ID_Album_' + encodeURIComponent(taskId).replace(/%/g, '_') + '.xlsx';
    const utf8Filename = 'ID_Album_' + taskId + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`);
    res.send(excelBuffer);
  } catch (err) {
    console.error('Error generating ID album Excel:', err);
    res.status(500).json({ error: 'Ошибка формирования альбома ИД в Excel: ' + err.message });
  }
});

// 4.2. Скачивание Кабельного журнала (КЖ) в формате Excel (структура KZh.xlsx)
router.get('/tasks/:taskId/cable-journal.xlsx', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const excelBuffer = await generateCableJournalExcel(taskId);
    const safeAscii = 'KZh_' + encodeURIComponent(taskId).replace(/%/g, '_') + '.xlsx';
    const utf8Filename = `${taskId}_Кабельный_журнал.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`);
    res.send(excelBuffer);
  } catch (err) {
    console.error('Error generating Cable Journal Excel:', err);
    res.status(500).json({ error: 'Ошибка формирования кабельного журнала в Excel: ' + err.message });
  }
});

// 4.3. Скачивание Протокола измерений Fluke в формате Excel
router.get('/tasks/:taskId/fluke-protocol.xlsx', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const excelBuffer = await generateFlukeProtocolExcel(taskId);
    const safeAscii = 'Fluke_' + encodeURIComponent(taskId).replace(/%/g, '_') + '.xlsx';
    const utf8Filename = `${taskId}_Протокол_измерений_Fluke.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`);
    res.send(excelBuffer);
  } catch (err) {
    console.error('Error generating Fluke protocol Excel:', err);
    res.status(500).json({ error: 'Ошибка формирования протокола Fluke в Excel: ' + err.message });
  }
});

// 5. Отдельный POST эндпоинт для генерации альбома ИД в .PDF
router.post('/tasks/:taskId/id-album/generate', authenticateToken, requireRole('admin', 'director', 'manager', 'to_engineer'), async (req, res) => {
  try {
    const { taskId } = req.params;
    const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (!taskRes.rows.length) return res.status(404).json({ error: 'Задача не найдена' });
    const task = taskRes.rows[0];
    const checklist = resolveTaskChecklist(task);
    const result = await generateIdPdfAlbum({ taskId, pool, checklist });
    res.json(result);
  } catch (err) {
    console.error('Error generating ID album:', err);
    res.status(500).json({ error: 'Ошибка сборки альбома ИД в PDF: ' + err.message });
  }
});

const ID_MODERATION_KEYS = [
  'title', 'album_list', 'aosr', 'act', 'act_equip', 'act_mount',
  'work_log', 'scheme', 'kj', 'fluke', 'cert', 'manual', 'warranty'
];

const ID_DOCUMENT_SPECS = [
  {
    key: 'title',
    code: 'ИД-01',
    title: 'Титульный лист альбома ИД',
    category: 'basic',
    mandatory: true,
    page: 1,
    defaultType: 'pdf'
  },
  {
    key: 'album_list',
    code: 'ИД-02',
    title: 'Ведомость документов исполнительной документации',
    category: 'basic',
    mandatory: true,
    page: 2,
    defaultType: 'pdf'
  },
  {
    key: 'aosr',
    alias: 'act',
    code: 'ИД-03',
    title: 'Акт освидетельствования скрытых работ (АОСР)',
    category: 'configurable',
    mandatory: false,
    page: 3,
    defaultType: 'pdf'
  },
  {
    key: 'act_equip',
    code: 'ИД-04',
    title: 'Спецификация смонтированного оборудования и материалов',
    category: 'configurable',
    mandatory: false,
    page: 4,
    defaultType: 'pdf'
  },
  {
    key: 'act_mount',
    code: 'ИД-04/1',
    title: 'Акт монтажа оборудования и кабельных трасс',
    category: 'configurable',
    mandatory: false,
    page: 4,
    defaultType: 'pdf'
  },
  {
    key: 'work_log',
    code: 'ИД-04/2',
    title: 'Журнал производства работ (СМР)',
    category: 'configurable',
    mandatory: false,
    page: 2,
    defaultType: 'pdf'
  },
  {
    key: 'scheme',
    code: 'ИД-05',
    title: 'Исполнительная схема трасс СКС и розеток',
    category: 'basic',
    mandatory: true,
    page: 5,
    defaultType: 'image_or_pdf'
  },
  {
    key: 'kj',
    code: 'ИД-06',
    title: 'Кабельный журнал и таблица соединений (КЖ)',
    category: 'basic',
    mandatory: true,
    page: 6,
    defaultType: 'pdf'
  },
  {
    key: 'fluke',
    code: 'ИД-07',
    title: 'Протокол измерений параметров кабельных линий',
    category: 'basic',
    mandatory: true,
    page: 7,
    defaultType: 'pdf'
  },
  {
    key: 'cert',
    code: 'ИД-08',
    title: 'Сертификат соответствия на кабель Cat 5e/6',
    category: 'appendix',
    mandatory: false,
    page: 8,
    defaultType: 'pdf'
  },
  {
    key: 'manual',
    code: 'ИД-09',
    title: 'Руководства по эксплуатации и паспорта оборудования',
    category: 'appendix',
    mandatory: false,
    page: 2,
    defaultType: 'pdf'
  },
  {
    key: 'warranty',
    code: 'ИД-10',
    title: 'Гарантийные обязательства производителя и подрядчика',
    category: 'appendix',
    mandatory: false,
    page: 2,
    defaultType: 'pdf'
  }
];

function isModerationFileAvailable(fileReference) {
  if (!fileReference || typeof fileReference !== 'string') return false;
  try {
    const rootPath = path.resolve(UPLOADS_DIR);
    let filePath;
    if (fileReference.startsWith('/uploads/') || fileReference.startsWith('uploads/')) {
      const relativePath = fileReference.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
      filePath = path.resolve(rootPath, relativePath);
    } else if (path.isAbsolute(fileReference)) {
      filePath = path.resolve(fileReference);
    } else {
      const relativePath = fileReference.replace(/^\/+/, '');
      filePath = path.resolve(rootPath, relativePath);
    }
    const relativeToRoot = path.relative(rootPath, filePath);
    if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      return false;
    }
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findSchemeAttachment(attachments) {
  return (attachments || []).find(a =>
    a.type === 'scheme' ||
    a.category === 'scheme' ||
    a.category === 'plan' ||
    String(a.original_name || a.file_name || '').toLowerCase().includes('схем') ||
    String(a.original_name || a.file_name || '').toLowerCase().includes('план')
  );
}

function getModerationAvailability(docKey, documents, attachments) {
  const normKey = (docKey === 'act' ? 'aosr' : docKey);
  const albumDoc = [...(documents || [])].reverse().find(d => d.doc_type === 'id_album');
  const isAlbumFileOnDisk = isModerationFileAvailable(albumDoc?.file_path || albumDoc?.file_url);

  if (normKey === 'aosr') {
    const actDoc = (documents || []).find(d => d.doc_type === 'hidden_works_act' || d.title?.includes('скрытых'));
    if (actDoc && isModerationFileAvailable(actDoc.file_path || actDoc.file_url)) return true;
    return isAlbumFileOnDisk;
  }
  if (normKey === 'cert') {
    const certDoc = (documents || []).find(d => d.doc_type === 'cable_certificate' || d.title?.includes('Сертификат'));
    if (certDoc && isModerationFileAvailable(certDoc.file_path || certDoc.file_url)) return true;
    return isAlbumFileOnDisk;
  }
  if (normKey === 'scheme') {
    const schemeAtt = findSchemeAttachment(attachments);
    if (schemeAtt && isModerationFileAvailable(schemeAtt.file_path || schemeAtt.file_url)) return true;
    return isAlbumFileOnDisk;
  }
  if (normKey === 'act_equip' || normKey === 'act_mount') {
    const equipDoc = (documents || []).find(d => d.doc_type === 'equipment_act' || d.title?.includes('Спецификация') || d.title?.includes('оборудования'));
    if (equipDoc && isModerationFileAvailable(equipDoc.file_path || equipDoc.file_url)) return true;
    return isAlbumFileOnDisk;
  }
  if (normKey === 'work_log') {
    const logDoc = (documents || []).find(d => d.doc_type === 'work_log' || d.title?.includes('Журнал'));
    if (logDoc && isModerationFileAvailable(logDoc.file_path || logDoc.file_url)) return true;
    return isAlbumFileOnDisk;
  }
  if (normKey === 'manual') {
    const manualDoc = (documents || []).find(d => d.doc_type === 'manual' || d.title?.includes('паспорт') || d.title?.includes('Руководство'));
    if (manualDoc && isModerationFileAvailable(manualDoc.file_path || manualDoc.file_url)) return true;
    return isAlbumFileOnDisk;
  }
  if (normKey === 'warranty') {
    const wDoc = (documents || []).find(d => d.doc_type === 'warranty' || d.title?.includes('Гарант'));
    if (wDoc && isModerationFileAvailable(wDoc.file_path || wDoc.file_url)) return true;
    return isAlbumFileOnDisk;
  }
  return isAlbumFileOnDisk;
}

// 6. Получить состояние модерации комплекта ИД по задаче
router.get('/tasks/:taskId/id-moderation', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (!taskRes.rows.length) return res.status(404).json({ error: 'Задача не найдена' });
    const task = taskRes.rows[0];

    const subRes = await pool.query(`
      SELECT s.*, c.name_short AS contractor_name, c.inn AS contractor_inn
      FROM task_subcontracts s
      LEFT JOIN contractors c ON s.contractor_id = c.id
      WHERE s.task_id = $1
      ORDER BY s.id DESC LIMIT 1
    `, [taskId]);
    const sub = subRes.rows[0] || {};

    const docsRes = await pool.query('SELECT * FROM task_documents WHERE task_id = $1 ORDER BY id ASC', [taskId]);
    const attRes = await pool.query('SELECT * FROM task_attachments WHERE task_id = $1 ORDER BY id ASC', [taskId]);
    const portsRes = await pool.query('SELECT * FROM task_ports WHERE task_id = $1 ORDER BY id ASC', [taskId]);

    const rawMeta = (task.raw_data && task.raw_data.id_moderation) || {};
    const checklist = resolveTaskChecklist(task);

    const availableChecklistItems = ID_DOCUMENT_SPECS.map(spec => ({
      key: spec.key,
      alias: spec.alias || null,
      code: spec.code,
      title: spec.title,
      category: spec.category,
      mandatory: spec.mandatory,
      active: checklist[spec.key] === true
    }));

    const actRecord = docsRes.rows.find(d => d.doc_type === 'hidden_works_act' || d.title?.includes('скрытых'));
    const certRecord = docsRes.rows.find(d => d.doc_type === 'cable_certificate' || d.title?.includes('Сертификат'));
    const schemeAtt = findSchemeAttachment(attRes.rows);

        const activeDocs = [];

    let nextPdfPage = 3;
    const specPages = { title: 1, album_list: 2 };
    if (checklist.aosr || checklist.act) specPages.aosr = nextPdfPage++;
    if (checklist.act_equip || checklist.act_mount) {
      specPages.act_equip = nextPdfPage;
      specPages.act_mount = nextPdfPage++;
    }
    specPages.scheme = nextPdfPage++;
    specPages.kj = nextPdfPage++;
    specPages.fluke = nextPdfPage++;

    for (const spec of ID_DOCUMENT_SPECS) {
      if (checklist[spec.key] !== true) continue;

      const targetPage = specPages[spec.key] || (spec.alias ? specPages[spec.alias] : null) || 2;
      let fileUrl = `/api/tasks/${taskId}/id-album.pdf#page=${targetPage}`;
      let fileType = 'pdf';
      let title = spec.title;

      if (spec.key === 'aosr') {
        if (actRecord?.file_url) fileUrl = actRecord.file_url;
      } else if (spec.key === 'cert') {
        if (certRecord?.file_url) fileUrl = certRecord.file_url;
      } else if (spec.key === 'scheme') {
        if (schemeAtt) {
          fileUrl = `/api/attachments/${schemeAtt.id}/file`;
          fileType = path.extname(schemeAtt.original_name || schemeAtt.file_path || '').slice(1) || 'png';
        }
      } else if (spec.key === 'kj') {
        title = `Кабельный журнал и таблица соединений (${portsRes.rows.length} линий)`;
      }

      // STRICT RULE: If not explicitly moderated by user, status is ALWAYS 'pending'!
      // Neither ports, nor attachments, nor fact, nor album can make status 'approved' automatically!
      const explicitMeta = rawMeta[spec.key] || (spec.alias ? rawMeta[spec.alias] : null) || {};
      const status = (explicitMeta.status === 'approved' || explicitMeta.status === 'rejected') ? explicitMeta.status : 'pending';
      const rejectionReason = explicitMeta.status === 'rejected' ? (explicitMeta.rejection_reason || null) : null;
      const comment = explicitMeta.comment || null;

      activeDocs.push({
        id: spec.key,
        key: spec.key,
        alias: spec.alias || null,
        code: spec.code,
        title,
        category: spec.category,
        mandatory: spec.mandatory,
        file_url: fileUrl,
        file_type: fileType,
        status,
        rejection_reason: rejectionReason,
        comment,
        available: getModerationAvailability(spec.key, docsRes.rows, attRes.rows)
      });
    }

    const approvedCount = activeDocs.filter(d => d.status === 'approved').length;
    const rejectedCount = activeDocs.filter(d => d.status === 'rejected').length;
    const hasRejected = rejectedCount > 0;
    const allApproved = (activeDocs.length > 0 && approvedCount === activeDocs.length);
    const overallStatus = hasRejected ? 'rejected' : (allApproved ? 'approved' : 'pending');

    res.json({
      task: {
        id: task.id,
        customer: task.customer || 'ПАО Сбербанк',
        address: task.address,
        vsp: task.vsp,
        deadline: task.deadline,
        contractor: sub.contractor_name || task.contractor,
        installer_fio: sub.installer_fio,
        installer_phone: sub.installer_phone,
        total_amount: sub.total_amount || 0,
        margin: task.margin || 0,
        fact: task.fact,
        in_order: task.in_order
      },
      checklist,
      availableChecklistItems,
      documents: activeDocs,
      fullAlbumUrl: `/api/tasks/${taskId}/id-album.pdf`,
      approvedCount,
      rejectedCount,
      totalCount: activeDocs.length,
      allApproved,
      hasRejected,
      overallStatus
    });
  } catch (err) {
    console.error('Error fetching ID moderation state:', err);
    res.status(500).json({ error: 'Ошибка получения состояния модерации ИД: ' + err.message });
  }
});

// 6.1. Настройка чек-листа состава комплекта ИД
router.put('/tasks/:taskId/id-moderation/checklist', authenticateToken, requireRole('admin', 'director', 'manager', 'to_engineer'), async (req, res) => {
  try {
    const { taskId } = req.params;
    const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (!taskRes.rows.length) return res.status(404).json({ error: 'Задача не найдена' });
    const task = taskRes.rows[0];

    if (task.id_moderation_status === 'approved') {
      return res.status(409).json({ error: 'Нельзя изменять состав чек-листа: комплект ИД уже финализирован и отправлен на Портал' });
    }

    const currentChecklist = resolveTaskChecklist(task);
    const body = req.body || {};
    const updated = { ...currentChecklist };

    const optKeys = ['aosr', 'act_equip', 'act_mount', 'work_log', 'cert', 'manual', 'warranty'];
    for (const k of optKeys) {
      if (typeof body[k] === 'boolean') {
        updated[k] = body[k];
      }
    }
    if (typeof body.act === 'boolean' && body.aosr === undefined) {
      updated.aosr = body.act;
    }
    updated.act = updated.aosr;

    // Mandatory keys cannot be disabled
    updated.title = true;
    updated.album_list = true;
    updated.scheme = true;
    updated.kj = true;
    updated.fluke = true;

    const rawData = task.raw_data || {};
    rawData.idChecklist = updated;
    rawData.id_checklist = updated;

    await pool.query('UPDATE tasks SET raw_data = $1 WHERE id = $2', [JSON.stringify(rawData), taskId]);
    res.json({ success: true, checklist: updated });
  } catch (err) {
    console.error('Error updating ID checklist:', err);
    res.status(500).json({ error: 'Ошибка обновления чек-листа ИД: ' + err.message });
  }
});

// 7. Сохранить статус проверки конкретного документа ИД
router.post('/tasks/:taskId/id-moderation/status', authenticateToken, requireRole('admin', 'director', 'manager', 'to_engineer'), async (req, res) => {
  try {
    const { taskId } = req.params;
    const { docKey, status, rejectionReason, comment } = req.body;
    if (!ID_MODERATION_KEYS.includes(docKey) || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Некорректные docKey или status' });
    }
    const canonicalKey = (docKey === 'act' ? 'aosr' : docKey);
    const normalizedReason = String(rejectionReason || '').trim();
    if (status === 'rejected' && !normalizedReason) {
      return res.status(400).json({ success: false, error: 'Укажите причину отклонения документа' });
    }

    const taskRes = await pool.query('SELECT raw_data, id_moderation_status FROM tasks WHERE id = $1', [taskId]);
    if (!taskRes.rows.length) return res.status(404).json({ error: 'Задача не найдена' });
    const task = taskRes.rows[0];

    if (task.id_moderation_status === 'approved') {
      return res.status(409).json({ success: false, error: 'Нельзя изменить статус документа: комплект ИД уже финализирован и отправлен на Портал' });
    }

    if (status === 'approved') {
      const [docsRes, attRes] = await Promise.all([
        pool.query('SELECT * FROM task_documents WHERE task_id = $1 ORDER BY id ASC', [taskId]),
        pool.query('SELECT * FROM task_attachments WHERE task_id = $1 ORDER BY id ASC', [taskId])
      ]);
      if (!getModerationAvailability(canonicalKey, docsRes.rows, attRes.rows)) {
        return res.status(409).json({ success: false, error: 'Документ не сформирован или недоступен для одобрения' });
      }
    }

    const rawData = task.raw_data || {};
    if (!rawData.id_moderation) rawData.id_moderation = {};
    const modEntry = {
      status,
      rejection_reason: status === 'rejected' ? normalizedReason : null,
      comment: comment || null,
      moderated_at: new Date().toISOString(),
      moderated_by: req.user?.id || null
    };
    rawData.id_moderation[canonicalKey] = modEntry;
    if (canonicalKey === 'aosr') {
      rawData.id_moderation.act = modEntry;
    }

    await pool.query('UPDATE tasks SET raw_data = $1 WHERE id = $2', [JSON.stringify(rawData), taskId]);
    res.json({ success: true, docKey, canonicalKey, status, rejectionReason: modEntry.rejection_reason, comment });
  } catch (err) {
    console.error('Error updating document moderation status:', err);
    res.status(500).json({ error: 'Ошибка сохранения статуса: ' + err.message });
  }
});

// 8. Финализация модерации: отправка на доработку или на Портал поставщиков
router.post('/tasks/:taskId/id-moderation/finalize', authenticateToken, requireRole('admin', 'director', 'manager', 'to_engineer'), async (req, res) => {
  try {
    const { taskId } = req.params;
    const { action, notes } = req.body; // 'return_rework' | 'send_portal'

    const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (!taskRes.rows.length) return res.status(404).json({ error: 'Задача не найдена' });
    const task = taskRes.rows[0];

    const checklist = resolveTaskChecklist(task);
    const rawData = task.raw_data || {};
    const rawMeta = rawData.id_moderation || {};

    const [docsRes, attRes] = await Promise.all([
      pool.query('SELECT * FROM task_documents WHERE task_id = $1 ORDER BY id ASC', [taskId]),
      pool.query('SELECT * FROM task_attachments WHERE task_id = $1 ORDER BY id ASC', [taskId])
    ]);

    if (action === 'send_portal') {
      const activeSpecs = ID_DOCUMENT_SPECS.filter(spec => checklist[spec.key] === true);
      if (activeSpecs.length === 0) {
        return res.status(409).json({ error: 'В чек-листе ИД нет активных документов' });
      }

      for (const spec of activeSpecs) {
        const explicitMeta = rawMeta[spec.key] || (spec.alias ? rawMeta[spec.alias] : null) || {};
        const isApproved = (explicitMeta.status === 'approved');
        const isAvailable = getModerationAvailability(spec.key, docsRes.rows, attRes.rows);

        if (!isApproved) {
          return res.status(409).json({
            error: `Нельзя отправить на Портал: документ «${spec.title}» не одобрен (текущий статус: ${explicitMeta.status || 'pending'})`
          });
        }
        if (!isAvailable) {
          return res.status(409).json({
            error: `Нельзя отправить на Портал: документ «${spec.title}» недоступен или не сформирован на диске`
          });
        }
      }

      await pool.query(
        "UPDATE tasks SET status_smr = 'done', stage_num = 4, id_moderation_status = 'approved', id_moderation_notes = $1 WHERE id = $2",
        [notes || 'Комплект ИД успешно проверен и отправлен на Портал поставщиков', taskId]
      );
      return res.json({ success: true, message: 'Комплект ИД одобрен и отправлен на Портал поставщиков', status: 'approved' });
    }

    if (action === 'return_rework') {
      const activeSpecs = ID_DOCUMENT_SPECS.filter(spec => checklist[spec.key] === true);
      const hasRejected = activeSpecs.some(spec => {
        const explicitMeta = rawMeta[spec.key] || (spec.alias ? rawMeta[spec.alias] : null) || {};
        return explicitMeta.status === 'rejected';
      });

      if (!hasRejected) {
        return res.status(400).json({
          error: 'Для возврата на доработку необходимо отклонить хотя бы один активный документ с указанием причины'
        });
      }

      await pool.query(
        "UPDATE tasks SET status_smr = 'issues', id_moderation_status = 'rejected', id_moderation_notes = $1 WHERE id = $2",
        [notes || 'ИД возвращена на доработку подрядчику', taskId]
      );
      return res.json({ success: true, message: 'Комплект ИД возвращен подрядчику на доработку', status: 'rejected' });
    }

    res.status(400).json({ error: 'Неизвестное действие finalize: ' + action });
  } catch (err) {
    console.error('Error finalizing ID moderation:', err);
    res.status(500).json({ error: 'Ошибка финализации: ' + err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. УНИВЕРСАЛЬНЫЕ ШАБЛОНЫ ДОКУМЕНТОВ И СЕРВИС ОНЛАЙН-РЕДАКТИРОВАНИЯ
// ══════════════════════════════════════════════════════════════════════════════

// 9.1. Список всех шаблонов документов
router.get('/document-templates', authenticateToken, async (req, res) => {
  try {
    const { category, format } = req.query;
    let query = 'SELECT * FROM document_templates WHERE 1=1';
    const params = [];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    if (format) {
      params.push(format);
      query += ` AND doc_format = $${params.length}`;
    }

    query += ' ORDER BY is_system DESC, category ASC, name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching templates:', err);
    res.status(500).json({ error: 'Ошибка загрузки шаблонов документов' });
  }
});

// 9.2. Список всех доступных переменных с описанием для конструктора шаблонов
router.get('/document-templates-variables', authenticateToken, (req, res) => {
  res.json([
    {
      group: 'Документ и даты',
      vars: [
        { code: 'номер_документа', label: 'Номер документа' },
        { code: 'дата_документа', label: 'Дата документа (ДД.ММ.ГГГГ)' },
        { code: 'дата_документа_прописью', label: 'Дата прописью («__» _____ 202_ г.)' },
        { code: 'текущая_дата', label: 'Сегодняшняя дата' },
        { code: 'текущий_год', label: 'Текущий год' },
        { code: 'город', label: 'Город составления' }
      ]
    },
    {
      group: 'Наша организация (Генподрядчик)',
      vars: [
        { code: 'наша_организация', label: 'Краткое название (ООО «КС»)' },
        { code: 'наша_организация_полная', label: 'Полное наименование организации' },
        { code: 'наш_инн', label: 'ИНН' },
        { code: 'наш_кпп', label: 'КПП' },
        { code: 'наш_огрн', label: 'ОГРН' },
        { code: 'наш_директор', label: 'ФИО руководителя' },
        { code: 'наш_директор_должность', label: 'Должность руководителя' },
        { code: 'наш_адрес', label: 'Юридический адрес' },
        { code: 'наш_телефон', label: 'Телефон' },
        { code: 'наш_банк', label: 'Банк' },
        { code: 'наш_бик', label: 'БИК банка' },
        { code: 'наш_расчетный_счет', label: 'Расчетный счет' },
        { code: 'наш_корр_счет', label: 'Корреспондентский счет' }
      ]
    },
    {
      group: 'Подрядчик / Исполнитель',
      vars: [
        { code: 'подрядчик_наименование', label: 'Краткое название подрядчика / ФИО ИП' },
        { code: 'подрядчик_наименование_полное', label: 'Полное наименование' },
        { code: 'подрядчик_инн', label: 'ИНН подрядчика' },
        { code: 'подрядчик_кпп', label: 'КПП подрядчика' },
        { code: 'подрядчик_директор', label: 'ФИО руководителя / ИП' },
        { code: 'подрядчик_адрес', label: 'Юридический адрес' },
        { code: 'подрядчик_телефон', label: 'Телефон' },
        { code: 'подрядчик_банк', label: 'Банк подрядчика' },
        { code: 'подрядчик_бик', label: 'БИК банка' },
        { code: 'подрядчик_расчетный_счет', label: 'Расчетный счет' },
        { code: 'подрядчик_корр_счет', label: 'Корреспондентский счет' },
        { code: 'номер_договора_подрядчика', label: 'Номер договора с подрядчиком' },
        { code: 'дата_договора_подрядчика', label: 'Дата договора с подрядчиком' }
      ]
    },
    {
      group: 'Заказчик',
      vars: [
        { code: 'наш_заказчик', label: 'Наименование заказчика' },
        { code: 'наш_заказчик_инн', label: 'ИНН заказчика' },
        { code: 'наш_заказчик_адрес', label: 'Адрес заказчика' }
      ]
    },
    {
      group: 'Объект и заявка',
      vars: [
        { code: 'номер_заявки', label: 'Номер заявки' },
        { code: 'номер_всп', label: 'Номер ВСП / Отделения' },
        { code: 'адрес_объекта', label: 'Адрес объекта' },
        { code: 'тип_объекта', label: 'Тип объекта' },
        { code: 'вид_работ', label: 'Вид работ' },
        { code: 'срок_выполнения', label: 'Срок выполнения (ДД.ММ.ГГГГ)' },
        { code: 'срок_выполнения_прописью', label: 'Срок выполнения прописью' },
        { code: 'дата_заявки', label: 'Дата заявки' },
        { code: 'номер_контракта', label: 'Номер контракта' },
        { code: 'дата_контракта', label: 'Дата контракта' },
        { code: 'идентификатор_закупки', label: 'ИКЗ / Номер извещения ЕИС' }
      ]
    },
    {
      group: 'Финансы и сметы',
      vars: [
        { code: 'сумма', label: 'Сумма с рублями (125 000.00 ₽)' },
        { code: 'сумма_числом', label: 'Сумма числом (125000)' },
        { code: 'сумма_прописью', label: 'Сумма прописью' },
        { code: 'ндс_инфо', label: 'Информация по НДС' }
      ]
    },
    {
      group: 'Специалисты',
      vars: [
        { code: 'фио_монтажника', label: 'ФИО монтажника' },
        { code: 'паспорт_монтажника', label: 'Паспортные данные' },
        { code: 'телефон_монтажника', label: 'Телефон монтажника' },
        { code: 'госномер_авто', label: 'Госномер автотранспорта' }
      ]
    },
    {
      group: 'Таблицы и блоки',
      vars: [
        { code: 'таблица_работ', label: 'Таблица сметы и расценок работ' },
        { code: 'таблица_специалистов', label: 'Таблица состава бригады монтажников' },
        { code: 'таблица_материалов', label: 'Таблица использованных материалов (ТМЦ)' },
        { code: 'блок_подписей', label: 'Двусторонний блок реквизитов и подписей' }
      ]
    }
  ]);
});

// 9.3. Получить конкретный шаблон
router.get('/document-templates/:idOrCode', authenticateToken, async (req, res) => {
  try {
    const { idOrCode } = req.params;
    let query = 'SELECT * FROM document_templates WHERE id = $1';
    let val = parseInt(idOrCode, 10);
    if (isNaN(val)) {
      query = 'SELECT * FROM document_templates WHERE code = $1';
      val = idOrCode;
    }
    const result = await pool.query(query, [val]);
    if (!result.rows.length) return res.status(404).json({ error: 'Шаблон не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching template:', err);
    res.status(500).json({ error: 'Ошибка получения шаблона' });
  }
});

// 9.4. Создать шаблон документа
router.post('/document-templates', authenticateToken, requireRole('admin', 'director'), async (req, res) => {
  try {
    const { code, name, category, doc_format = 'word', description, template_html } = req.body;
    if (!code || !name || !template_html) {
      return res.status(400).json({ error: 'Поля code, name и template_html обязательны' });
    }

    const insertRes = await pool.query(`
      INSERT INTO document_templates (code, name, category, doc_format, description, template_html, is_system, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
      RETURNING *
    `, [code.trim(), name.trim(), category || 'custom', doc_format, description || '', template_html]);

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error('Error creating template:', err);
    res.status(500).json({ error: 'Ошибка создания шаблона: ' + err.message });
  }
});

// 9.5. Обновить шаблон документа
router.put('/document-templates/:id', authenticateToken, requireRole('admin', 'director'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, doc_format, description, template_html } = req.body;

    const updRes = await pool.query(`
      UPDATE document_templates SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        doc_format = COALESCE($3, doc_format),
        description = COALESCE($4, description),
        template_html = COALESCE($5, template_html),
        updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [name, category, doc_format, description, template_html, id]);

    if (!updRes.rows.length) return res.status(404).json({ error: 'Шаблон не найден' });
    res.json(updRes.rows[0]);
  } catch (err) {
    console.error('Error updating template:', err);
    res.status(500).json({ error: 'Ошибка обновления шаблона: ' + err.message });
  }
});

// 9.6. Удалить шаблон документа (только пользовательские)
router.delete('/document-templates/:id', authenticateToken, requireRole('admin', 'director'), async (req, res) => {
  try {
    const { id } = req.params;
    const chk = await pool.query('SELECT is_system FROM document_templates WHERE id = $1', [id]);
    if (!chk.rows.length) return res.status(404).json({ error: 'Шаблон не найден' });
    if (chk.rows[0].is_system) {
      return res.status(400).json({ error: 'Системный шаблон нельзя удалить' });
    }

    await pool.query('DELETE FROM document_templates WHERE id = $1', [id]);
    res.json({ success: true, message: 'Шаблон удален' });
  } catch (err) {
    console.error('Error deleting template:', err);
    res.status(500).json({ error: 'Ошибка удаления шаблона' });
  }
});

// 9.7. Сформировать документ для предпросмотра и редактирования в приложении (БЕЗ СКАЧИВАНИЯ)
router.post('/documents/render', authenticateToken, async (req, res) => {
  try {
    const template_code = req.body.template_code || req.body.templateCode;
    const template_id = req.body.template_id || req.body.templateId;
    const task_id = req.body.task_id || req.body.taskId;
    const contract_id = req.body.contract_id || req.body.contractId;
    const subcontract_id = req.body.subcontract_id || req.body.subcontractId;
    const subcontract_contract_id = req.body.subcontract_contract_id || req.body.subcontractContractId;
    const poa_id = req.body.poa_id || req.body.poaId;
    const custom_data = req.body.custom_data || req.body.customData || {};
    const force_fresh = Boolean(req.body.force_fresh || req.body.forceFresh);

    // 1. Ищем шаблон
    let template = null;
    if (template_id) {
      const tRes = await pool.query('SELECT * FROM document_templates WHERE id = $1', [template_id]);
      if (tRes.rows.length) template = tRes.rows[0];
    }
    if (!template && template_code) {
      const tRes = await pool.query('SELECT * FROM document_templates WHERE code = $1', [template_code]);
      if (tRes.rows.length) template = tRes.rows[0];
    }
    if (!template) {
      return res.status(404).json({ error: `Шаблон документа не найден (${template_code || template_id})` });
    }

    // 2. Проверяем, существует ли уже сохраненный документ в реестре task_documents
    let existingDoc = null;
    if (subcontract_contract_id) {
      const exRes = await pool.query(
        'SELECT * FROM task_documents WHERE subcontract_contract_id = $1 ORDER BY id DESC LIMIT 1',
        [subcontract_contract_id]
      );
      if (exRes.rows.length) existingDoc = exRes.rows[0];
    } else if (poa_id) {
      const exRes = await pool.query(
        'SELECT * FROM task_documents WHERE poa_id = $1 ORDER BY id DESC LIMIT 1',
        [poa_id]
      );
      if (exRes.rows.length) existingDoc = exRes.rows[0];
    } else if (task_id && template.code) {
      const exRes = await pool.query(
        'SELECT * FROM task_documents WHERE task_id = $1 AND doc_type = $2 ORDER BY id DESC LIMIT 1',
        [task_id, template.code]
      );
      if (exRes.rows.length) existingDoc = exRes.rows[0];
    }

    // 3. Собираем единый контекст данных
    const context = await collectDocumentContext({
      pool,
      taskId: task_id,
      contractId: contract_id,
      subcontractId: subcontract_id,
      subcontractContractId: subcontract_contract_id,
      poaId: poa_id,
      customData: custom_data
    });

    // 4. Проверяем статус блокировки редактирования
    let isLocked = false;
    let lockReason = '';
    let docStatus = existingDoc?.status || 'created';

    if (subcontract_contract_id) {
      const ccRes = await pool.query('SELECT status, scan_url FROM contractor_contracts WHERE id = $1', [subcontract_contract_id]);
      if (ccRes.rows.length) {
        const cStat = ccRes.rows[0].status || 'created';
        docStatus = cStat;
        if (cStat !== 'created') {
          isLocked = true;
          const statusLabels = {
            agreed: 'Согласован',
            sent: 'Передан на подпись',
            signed: 'Подписан',
            terminated: 'Расторгнут'
          };
          lockReason = `Договор находится в статусе «${statusLabels[cStat] || cStat}». Редактирование закрыто.`;
        }
      }
    } else if (existingDoc && ['agreed', 'sent', 'signed', 'terminated', 'cancelled', 'paid'].includes(existingDoc.status)) {
      isLocked = true;
      const statusLabels = {
        agreed: 'Согласован',
        sent: 'Передан на подпись',
        signed: 'Подписан',
        cancelled: 'Аннулирован',
        paid: 'Оплачен'
      };
      lockReason = `Документ находится в статусе «${statusLabels[existingDoc.status] || existingDoc.status}». Редактирование закрыто.`;
    }

    // 5. Подставляем переменные в HTML
    const renderedHtml = renderTemplateHtml(template.template_html, context);

    const isOrderSubcontract = template.code === 'order_subcontract';
    const flatVars = context.плоские_переменные || context;
    const docNumber = (!force_fresh && existingDoc?.doc_number) ? existingDoc.doc_number : (isOrderSubcontract ? (flatVars.номер_заявки_к_договору || context.doc_number) : context.doc_number);
    let title = (!force_fresh && existingDoc?.title) ? existingDoc.title : null;
    if (!title) {
      if (isOrderSubcontract) {
        const appNum = flatVars.номер_приложения || context.номер_приложения || '2';
        const cNum = flatVars.номер_договора_субподряда || context.номер_договора_субподряда || 'б/н';
        const cDate = flatVars.дата_договора_субподряда || context.дата_договора_субподряда || 'б/д';
        const ordNum = docNumber || '1';
        title = `Приложение № ${appNum} к Договору субподряда № ${cNum} от ${cDate} — Заявка № ${ordNum}`;
      } else {
        title = `${template.name} № ${docNumber}`;
      }
    }
    const finalHtml = (existingDoc && existingDoc.content_html && !force_fresh) ? existingDoc.content_html : renderedHtml;

    res.json({
      template: {
        id: template.id,
        code: template.code,
        name: template.name,
        category: template.category,
        doc_format: template.doc_format
      },
      rendered_html: finalHtml,
      context,
      doc_number: docNumber,
      title,
      existing_doc_id: existingDoc?.id || null,
      status: docStatus,
      is_locked: isLocked,
      lock_reason: lockReason,
      scan_url: existingDoc?.file_url || null
    });
  } catch (err) {
    console.error('Error rendering document:', err);
    res.status(500).json({ error: 'Ошибка формирования документа: ' + err.message });
  }
});

// 9.8. Сохранить документ (из редактора в реестр системы)
router.post('/documents/save', authenticateToken, async (req, res) => {
  try {
    const id = req.body.id;
    const task_id = req.body.task_id || req.body.taskId;
    const contract_id = req.body.contract_id || req.body.contractId;
    const subcontract_id = req.body.subcontract_id || req.body.subcontractId;
    const subcontract_contract_id = req.body.subcontract_contract_id || req.body.subcontractContractId;
    const poa_id = req.body.poa_id || req.body.poaId;
    const doc_type = req.body.doc_type || req.body.docType || 'custom';
    const doc_format = req.body.doc_format || req.body.docFormat || 'word';
    const doc_number = req.body.doc_number || req.body.docNumber;
    const doc_date = req.body.doc_date || req.body.docDate;
    const title = req.body.title;
    const content_html = req.body.content_html || req.body.contentHtml;
    const content_json = req.body.content_json || req.body.contentJson;
    const status = req.body.status || 'generated';
    const meta = req.body.meta || {};

    if (!title) return res.status(400).json({ error: 'Заголовок документа обязателен' });

    const userRole = req.user?.role || 'user';

    // Защита от дублирования при повторной генерации документов
    let effectiveDocId = id;
    if (!effectiveDocId && task_id && doc_type && doc_type !== 'other' && doc_type !== 'custom') {
      const exLookup = subcontract_id
        ? await pool.query(
            "SELECT id FROM task_documents WHERE task_id = $1 AND doc_type = $2 AND subcontract_id = $3 AND status IN ('created', 'draft', 'generated') ORDER BY id DESC LIMIT 1",
            [task_id, doc_type, subcontract_id]
          )
        : await pool.query(
            "SELECT id FROM task_documents WHERE task_id = $1 AND doc_type = $2 AND status IN ('created', 'draft', 'generated') ORDER BY id DESC LIMIT 1",
            [task_id, doc_type]
          );
      if (exLookup.rows.length) {
        effectiveDocId = exLookup.rows[0].id;
      }
    }

    // Защита от редактирования в статусах отправки / подписания (по замечаниям руководства)
    let exRes = null;
    if (effectiveDocId) {
      exRes = await pool.query('SELECT status, content_html, file_url FROM task_documents WHERE id = $1', [effectiveDocId]);
      if (exRes.rows.length) {
        const curStatus = exRes.rows[0].status;
        if (['agreed', 'sent', 'signed', 'terminated', 'cancelled'].includes(curStatus) && userRole !== 'admin') {
          if (content_html && content_html !== exRes.rows[0].content_html) {
            return res.status(403).json({
              error: `Редактирование текста документа закрыто в статусе «${curStatus}». Изменения не сохранены.`
            });
          }
        }
      }
    }

    if (subcontract_contract_id) {
      const ccRes = await pool.query('SELECT status FROM contractor_contracts WHERE id = $1', [subcontract_contract_id]);
      if (ccRes.rows.length) {
        const curCcStatus = ccRes.rows[0].status;
        if (curCcStatus !== 'created' && userRole !== 'admin') {
          // Если договор не в статусе "created", запрещаем менять текст
          const exDoc = id ? await pool.query('SELECT content_html FROM task_documents WHERE id = $1', [id]) : null;
          if (!exDoc || !exDoc.rows.length || (content_html && content_html !== exDoc.rows[0].content_html)) {
            return res.status(403).json({
              error: `Редактирование договора закрыто в статусе «${curCcStatus}». Вносить правки можно только в статусе «Создан» (черновик).`
            });
          }
        }
      }
    }

    // Создаем или обновляем фоновый DOCX/HTML файл на диске
    const ext = doc_format === 'excel' ? 'xlsx' : 'docx';
    let fileName = null;
    let filePath = null;
    let fileUrl = null;

    if (id && exRes && exRes.rows.length && exRes.rows[0].file_url) {
      fileUrl = exRes.rows[0].file_url;
      const relPath = fileUrl.replace(/^\/uploads\/?/, '');
      filePath = path.join(UPLOADS_DIR, relPath);
    } else {
      const safeId = String(task_id || contract_id || subcontract_contract_id || 'doc').replace(/[^a-zA-Z0-9_-]/g, '_');
      const timestamp = Date.now();
      fileName = `${doc_type}_${safeId}_${timestamp}.${ext}`;
      filePath = path.join(DOCS_DIR, fileName);
      fileUrl = `/uploads/documents/${fileName}`;
    }

    if (content_html) {
      if (ext === 'docx') {
        const docxBuffer = await htmlToDocxBuffer(content_html, title);
        fs.writeFileSync(filePath, docxBuffer);
      } else {
        fs.writeFileSync(filePath, content_html, 'utf8');
      }
    }

    let resolvedContractId = contract_id || null;
    if (!resolvedContractId && task_id) {
      const tRes = await pool.query('SELECT contract_id FROM tasks WHERE id = $1', [task_id]);
      if (tRes.rows.length && tRes.rows[0].contract_id) {
        resolvedContractId = tRes.rows[0].contract_id;
      }
    }

    // Синхронизируем статус с договором субподряда, если передан subcontract_contract_id И статус не rejected
    if (subcontract_contract_id && status && status !== 'rejected') {
      await pool.query(
        'UPDATE contractor_contracts SET status = $1, updated_at = NOW() WHERE id = $2 AND status != $1',
        [status, subcontract_contract_id]
      );
    }

    if (effectiveDocId) {
      // Обновление существующего документа
      const updRes = await pool.query(`
        UPDATE task_documents SET
          title = $1,
          doc_number = COALESCE($2, doc_number),
          doc_date = COALESCE($3::date, doc_date),
          content_html = $4,
          content_json = $5,
          status = $6,
          meta = $7,
          file_url = COALESCE($8, file_url),
          subcontract_contract_id = COALESCE($9, subcontract_contract_id),
          poa_id = COALESCE($10, poa_id),
          updated_at = NOW()
        WHERE id = $11
        RETURNING *
      `, [
        title,
        doc_number || null,
        doc_date || null,
        content_html || null,
        content_json ? JSON.stringify(content_json) : null,
        status,
        JSON.stringify(meta),
        fileUrl,
        subcontract_contract_id || null,
        poa_id || null,
        effectiveDocId
      ]);
      if (poa_id) {
        await pool.query('UPDATE powers_of_attorney SET document_id = $1 WHERE id = $2', [updRes.rows[0].id, poa_id]);
      }
      return res.json(updRes.rows[0]);
    }

    // Создание нового документа
    const insRes = await pool.query(`
      INSERT INTO task_documents (
        task_id, contract_id, subcontract_id, subcontract_contract_id, poa_id, doc_type, doc_format, doc_number, doc_date, title,
        content_html, content_json, file_url, file_type, meta, status, created_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::date, CURRENT_DATE), $10,
        $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()
      )
      RETURNING *
    `, [
      task_id || null,
      resolvedContractId,
      subcontract_id || null,
      subcontract_contract_id || null,
      poa_id || null,
      doc_type,
      doc_format,
      doc_number || null,
      doc_date || null,
      title,
      content_html || null,
      content_json ? JSON.stringify(content_json) : null,
      fileUrl,
      ext,
      JSON.stringify(meta),
      status,
      req.user?.id || null
    ]);

    if (poa_id) {
      await pool.query('UPDATE powers_of_attorney SET document_id = $1 WHERE id = $2', [insRes.rows[0].id, poa_id]);
    }

    res.status(201).json(insRes.rows[0]);
  } catch (err) {
    console.error('Error saving document:', err);
    res.status(500).json({ error: 'Ошибка сохранения документа: ' + err.message });
  }
});

// 9.9. Получить все документы контракта (прямые и по связанным заявкам)
router.get('/contracts/:contractId/documents', authenticateToken, async (req, res) => {
  try {
    const { contractId } = req.params;
    const query = `
      SELECT d.*, u.full_name AS created_by_name,
             t.address AS task_address, t.vsp AS task_vsp, t.customer AS task_customer
      FROM task_documents d
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN tasks t ON d.task_id = t.id
      WHERE d.contract_id = $1
         OR d.task_id IN (SELECT id FROM tasks WHERE contract_id = $1)
      ORDER BY d.created_at DESC
    `;
    const result = await pool.query(query, [contractId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching contract documents:', err);
    res.status(500).json({ error: 'Ошибка загрузки документов контракта' });
  }
});

// 9.10. Получить один документ по ID (с полным телом content_html)
router.get('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT d.*, u.full_name AS created_by_name,
             t.address AS task_address, t.vsp AS task_vsp, t.customer AS task_customer
      FROM task_documents d
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN tasks t ON d.task_id = t.id
      WHERE d.id = $1
    `, [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Документ не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching document:', err);
    res.status(500).json({ error: 'Ошибка загрузки документа' });
  }
});

// 9.11. Экспорт произвольного HTML в валидный OOXML DOCX
router.post('/documents/export-docx', authenticateToken, async (req, res) => {
  try {
    const rawHtml = req.body?.content_html || req.body?.html;
    if (!rawHtml) {
      return res.status(400).json({ error: 'content_html или html обязателен для экспорта' });
    }
    const cleanTitle = (req.body?.title || 'Документ').trim();
    const docxBuf = await htmlToDocxBuffer(rawHtml, cleanTitle);
    const safeAscii = cleanTitle.replace(/[^a-zA-Z0-9_-]/g, '_') + '.docx';
    const utf8Filename = `${cleanTitle}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`);
    res.send(docxBuf);
  } catch (err) {
    console.error('Error exporting docx:', err);
    res.status(500).json({ error: 'Ошибка экспорта в DOCX: ' + err.message });
  }
});

// 9.12. Экспорт сохраненного документа по ID в валидный OOXML DOCX
router.get('/documents/:id/export-docx', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM task_documents WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Документ не найден' });
    const doc = rows[0];
    let docxBuf;
    if (doc.content_html) {
      docxBuf = await htmlToDocxBuffer(doc.content_html, doc.title || 'Документ');
    } else if (doc.file_url) {
      const diskPath = path.join(UPLOADS_DIR, doc.file_url.replace(/^\/uploads\/?/, ''));
      if (fs.existsSync(diskPath)) {
        docxBuf = fs.readFileSync(diskPath);
      }
    }
    if (!docxBuf) {
      docxBuf = await htmlToDocxBuffer('<p>Документ пуст</p>', doc.title || 'Документ');
    }
    const safeAscii = (doc.title || `Document_${id}`).replace(/[^a-zA-Z0-9_-]/g, '_') + '.docx';
    const utf8Filename = `${doc.title || `Документ_${id}`}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`);
    res.send(docxBuf);
  } catch (err) {
    console.error('Error exporting docx:', err);
    res.status(500).json({ error: 'Ошибка экспорта документа: ' + err.message });
  }
});

// 9.13. Откат утверждения модерации ИД администратором с фиксацией визы
router.post('/tasks/:taskId/id-moderation/rollback', authenticateToken, requireRole('admin', 'director'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { taskId } = req.params;
    const reason = (req.body && req.body.reason ? String(req.body.reason) : '').trim();
    if (!reason) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'При откате необходимо указать причину' });
    }

    const { rows: taskRows } = await client.query('SELECT id_moderation_status, raw_data FROM tasks WHERE id = $1 FOR UPDATE', [taskId]);
    if (!taskRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    const task = taskRows[0];
    let rawData = task.raw_data || {};
    if (typeof rawData === 'string') {
      try { rawData = JSON.parse(rawData); } catch { rawData = {}; }
    }

    const currentModStatus = task.id_moderation_status || rawData.id_moderation_status || 'pending';
    if (currentModStatus !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Модерация ИД находится в статусе «${currentModStatus}», откат возможен только из статуса «approved»` });
    }

    if (!Array.isArray(rawData.adminRollbacks)) rawData.adminRollbacks = [];
    const rollbackVisa = {
      action: 'rollback_id_moderation',
      old_status: 'approved',
      new_status: 'pending',
      reason,
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.username || 'Администратор',
      role: req.user.role,
      date: new Date().toISOString()
    };
    rawData.adminRollbacks.push(rollbackVisa);
    rawData.id_moderation_status = 'pending';

    await client.query(`
      UPDATE tasks SET
        id_moderation_status = 'pending',
        raw_data = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(rawData), taskId]);

    await client.query('COMMIT');
    res.json({ success: true, id_moderation_status: 'pending', rollbackVisa });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
