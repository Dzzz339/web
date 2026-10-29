// server/routes/documents.js - Маршруты генерации, реестра и скачивания документов
import express from 'express';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { UPLOADS_DIR, uploadAttachment, fixUtf8Filename } from '../middleware/upload.js';
import { generateIdPdfAlbum } from '../services/idPdfGenerator.js';
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
      docNumber = `ЗН-${task.id}-${subcontract ? subcontract.id : '1'}`;
      title = `Приложение № 1 (Заказ-наряд на объект) № ${docNumber}`;
      buffer = await generateSubcontractOrder({
        task,
        subcontract: subcontract || {},
        contractor,
        generalContractor,
        orderNumber: docNumber
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

// 2.2. Быстрое обновление статуса, суммы и реквизитов документа
router.patch('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, amount, doc_number, doc_date, title, comment } = req.body;

    const curRes = await pool.query('SELECT * FROM task_documents WHERE id = $1', [id]);
    if (!curRes.rows.length) return res.status(404).json({ error: 'Документ не найден' });

    const doc = curRes.rows[0];
    const meta = typeof doc.meta === 'string' ? JSON.parse(doc.meta || '{}') : (doc.meta || {});

    if (status !== undefined) {
      meta.status = status;
    }
    if (amount !== undefined) {
      meta.amount = (amount !== '' && amount !== null) ? parseFloat(amount) : null;
    }
    if (comment !== undefined) {
      meta.comment = comment;
    }

    const newStatus = status !== undefined ? status : doc.status;
    const newDocNum = doc_number !== undefined ? doc_number : doc.doc_number;
    const newDocDate = doc_date !== undefined ? doc_date : doc.doc_date;
    const newTitle = title !== undefined ? title : doc.title;

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
      // Генерируем альбом на лету
      const genRes = await generateIdPdfAlbum({ taskId, pool });
      fileUrl = genRes.fileUrl;
      diskPath = path.join(UPLOADS_DIR, fileUrl.replace(/^\/uploads\//, ''));
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="id_album_${taskId}.pdf"`);
    res.sendFile(diskPath);
  } catch (err) {
    console.error('Error serving ID album PDF:', err);
    res.status(500).json({ error: 'Ошибка генерации альбома ИД в PDF: ' + err.message });
  }
});

// 5. Отдельный POST эндпоинт для генерации альбома ИД в .PDF
router.post('/tasks/:taskId/id-album/generate', authenticateToken, requireRole('admin', 'director', 'manager', 'to_engineer'), async (req, res) => {
  try {
    const { taskId } = req.params;
    const result = await generateIdPdfAlbum({ taskId, pool });
    res.json(result);
  } catch (err) {
    console.error('Error generating ID album:', err);
    res.status(500).json({ error: 'Ошибка сборки альбома ИД в PDF: ' + err.message });
  }
});

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

    // Модерация по 5 ключевым документам чек-листа
    const rawMeta = (task.raw_data && task.raw_data.id_moderation) || {};

    // 1. Акт скрытых работ
    const actDoc = docsRes.rows.find(d => d.doc_type === 'hidden_works_act' || d.title?.includes('скрытых')) || {
      id: 'act',
      key: 'act',
      title: 'Акт освидетельствования скрытых работ',
      code: 'ИД-03',
      file_url: '/api/tasks/' + taskId + '/id-album.pdf#page=3',
      file_type: 'pdf',
      status: rawMeta.act?.status || 'approved',
      rejection_reason: rawMeta.act?.rejection_reason || null,
      comment: rawMeta.act?.comment || null
    };

    // 2. Сертификат на кабель
    const certDoc = docsRes.rows.find(d => d.doc_type === 'cable_certificate' || d.title?.includes('Сертификат')) || {
      id: 'cert',
      key: 'cert',
      title: 'Сертификат соответствия на кабель Cat 5e/6',
      code: 'ИД-08',
      file_url: '/api/tasks/' + taskId + '/id-album.pdf#page=8',
      file_type: 'pdf',
      status: rawMeta.cert?.status || 'approved',
      rejection_reason: rawMeta.cert?.rejection_reason || null,
      comment: rawMeta.cert?.comment || null
    };

    // 3. Исполнительная схема
    const schemeAtt = attRes.rows.find(a => a.category === 'scheme' || a.category === 'plan' || a.file_name?.toLowerCase().includes('схем'));
    const schemeDoc = {
      id: 'scheme',
      key: 'scheme',
      title: 'Исполнительная схема трасс СКС и розеток',
      code: 'ИД-05',
      file_url: schemeAtt?.file_url || ('/api/tasks/' + taskId + '/id-album.pdf#page=5'),
      file_type: schemeAtt ? path.extname(schemeAtt.file_name).slice(1) : 'pdf',
      status: rawMeta.scheme?.status || 'approved',
      rejection_reason: rawMeta.scheme?.rejection_reason || null,
      comment: rawMeta.scheme?.comment || null
    };

    // 4. Кабельный журнал
    const kjDoc = {
      id: 'kj',
      key: 'kj',
      title: 'Кабельный журнал и таблица соединений (' + portsRes.rows.length + ' портов)',
      code: 'ИД-06',
      file_url: '/api/tasks/' + taskId + '/id-album.pdf#page=6',
      file_type: 'pdf',
      status: rawMeta.kj?.status || (portsRes.rows.length > 0 ? 'approved' : 'pending'),
      rejection_reason: rawMeta.kj?.rejection_reason || null,
      comment: rawMeta.kj?.comment || null
    };

    // 5. Протокол Fluke
    const flukeDoc = {
      id: 'fluke',
      key: 'fluke',
      title: 'Протокол измерений Fluke Networks (100% PASS)',
      code: 'ИД-07',
      file_url: '/api/tasks/' + taskId + '/id-album.pdf#page=7',
      file_type: 'pdf',
      status: rawMeta.fluke?.status || 'approved',
      rejection_reason: rawMeta.fluke?.rejection_reason || null,
      comment: rawMeta.fluke?.comment || null
    };

    const checkList = [actDoc, certDoc, schemeDoc, kjDoc, flukeDoc];
    const approvedCount = checkList.filter(d => d.status === 'approved').length;
    const hasRejected = checkList.some(d => d.status === 'rejected');
    const allApproved = (approvedCount === checkList.length);

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
      documents: checkList,
      fullAlbumUrl: '/api/tasks/' + taskId + '/id-album.pdf',
      approvedCount,
      totalCount: checkList.length,
      allApproved,
      hasRejected,
      overallStatus: task.id_moderation_status || (allApproved ? 'approved' : (hasRejected ? 'rejected' : 'pending'))
    });
  } catch (err) {
    console.error('Error fetching ID moderation state:', err);
    res.status(500).json({ error: 'Ошибка получения состояния модерации ИД: ' + err.message });
  }
});

// 7. Сохранить статус проверки конкретного документа ИД
router.post('/tasks/:taskId/id-moderation/status', authenticateToken, requireRole('admin', 'director', 'manager', 'to_engineer'), async (req, res) => {
  try {
    const { taskId } = req.params;
    const { docKey, status, rejectionReason, comment } = req.body;
    if (!docKey || !status) return res.status(400).json({ error: 'docKey и status обязательны' });

    const taskRes = await pool.query('SELECT raw_data FROM tasks WHERE id = $1', [taskId]);
    if (!taskRes.rows.length) return res.status(404).json({ error: 'Задача не найдена' });

    const rawData = taskRes.rows[0].raw_data || {};
    if (!rawData.id_moderation) rawData.id_moderation = {};
    rawData.id_moderation[docKey] = {
      status,
      rejection_reason: rejectionReason || null,
      comment: comment || null,
      moderated_at: new Date().toISOString(),
      moderated_by: req.user?.id || null
    };

    await pool.query('UPDATE tasks SET raw_data = $1 WHERE id = $2', [JSON.stringify(rawData), taskId]);
    res.json({ success: true, docKey, status, rejectionReason, comment });
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

    if (action === 'return_rework') {
      await pool.query(
        "UPDATE tasks SET status_smr = 'issues', id_moderation_status = 'rejected', id_moderation_notes = $1 WHERE id = $2",
        [notes || 'ИД возвращена на доработку подрядчику', taskId]
      );
      return res.json({ success: true, message: 'Комплект ИД возвращен подрядчику на доработку', status: 'rejected' });
    }

    if (action === 'send_portal') {
      await pool.query(
        "UPDATE tasks SET status_smr = 'done', stage_num = 4, id_moderation_status = 'approved', id_moderation_notes = $1 WHERE id = $2",
        ['Комплект ИД успешно проверен и отправлен на Портал поставщиков', taskId]
      );
      return res.json({ success: true, message: 'Комплект ИД одобрен и отправлен на Портал поставщиков', status: 'approved' });
    }

    res.status(400).json({ error: 'Неизвестное действие finalise: ' + action });
  } catch (err) {
    console.error('Error finalizing ID moderation:', err);
    res.status(500).json({ error: 'Ошибка финализации: ' + err.message });
  }
});

export default router;
