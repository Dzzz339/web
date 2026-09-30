import express from 'express';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadAttachment, UPLOADS_DIR } from '../middleware/upload.js';
import { importContractsFromExcel, computeDeadlineDate } from '../services/contractsImporter.js';

const router = express.Router();

/**
 * Получить список всех договоров с фильтрацией и агрегированной статистикой
 */
router.get('/contracts', authenticateToken, async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  if (role === 'worker' || role === 'installer') {
    return res.status(403).json({ error: 'Нет доступа для полевого монтажника' });
  }

  try {
    const { q, type, customer, status, year } = req.query;
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // 1. Поиск по строке (номер, заказчик, предмет, место, лоты)
    if (q && q.trim()) {
      const searchVal = `%${q.trim()}%`;
      whereConditions.push(`(
        c.internal_number ILIKE $${paramIndex} OR
        c.contract_number ILIKE $${paramIndex} OR
        c.customer_name ILIKE $${paramIndex} OR
        c.subject ILIKE $${paramIndex} OR
        c.delivery_place ILIKE $${paramIndex} OR
        c.our_entity_region ILIKE $${paramIndex} OR
        c.lots::text ILIKE $${paramIndex}
      )`);
      params.push(searchVal);
      paramIndex++;
    }

    // 2. Фильтр по категории «О чем договор»
    if (type && type !== 'all') {
      whereConditions.push(`c.contract_type_summary = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    // 3. Фильтр по заказчику
    if (customer && customer !== 'all') {
      if (/^\d+$/.test(customer)) {
        whereConditions.push(`c.customer_id = $${paramIndex}`);
        params.push(parseInt(customer, 10));
      } else {
        whereConditions.push(`c.customer_name ILIKE $${paramIndex}`);
        params.push(`%${customer}%`);
      }
      paramIndex++;
    }

    // 4. Фильтр по статусу
    if (status && status !== 'all') {
      whereConditions.push(`c.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    // 5. Фильтр по году
    if (year && year !== 'all') {
      whereConditions.push(`EXTRACT(YEAR FROM c.contract_date) = $${paramIndex}`);
      params.push(parseInt(year, 10));
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const listQuery = `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.contract_id = c.id) AS linked_tasks_count
      FROM contracts c
      ${whereClause}
      ORDER BY c.contract_date DESC NULLS LAST, c.id DESC
    `;

    const statsQuery = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(security_amount), 0) as total_security,
        COUNT(CASE WHEN jsonb_array_length(COALESCE(lots, '[]'::jsonb)) > 0 THEN 1 END) as multi_lot_count
      FROM contracts c
      ${whereClause}
    `;

    const [listResult, statsResult] = await Promise.all([
      pool.query(listQuery, params),
      pool.query(statsQuery, params)
    ]);

    res.json({
      contracts: listResult.rows,
      stats: statsResult.rows[0] || {
        total_count: 0,
        total_amount: 0,
        total_security: 0,
        multi_lot_count: 0
      }
    });
  } catch (err) {
    console.error('Error fetching contracts:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Получить детальную карточку конкретного договора + связанные объекты (tasks)
 */
router.get('/contracts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: contractRows } = await pool.query(`
      SELECT c.*,
        cust.inn AS customer_inn,
        cust.phone AS customer_phone,
        cust.email AS customer_email,
        u.full_name AS manager_user_name
      FROM contracts c
      LEFT JOIN contractors cust ON cust.id = c.customer_id
      LEFT JOIN users u ON u.id = c.manager_id
      WHERE c.id = $1
    `, [id]);

    if (!contractRows.length) {
      return res.status(404).json({ error: 'Договор не найден' });
    }

    const contract = contractRows[0];

    // Загружаем связанные заявки/объекты
    const { rows: tasks } = await pool.query(`
      SELECT 
        t.id, t.region, t.address, t.work_type, t.status, t.stage, t.amount,
        t.date_zayavki, t.deadline, t.assignee, t.macro_status, t.contract_lot
      FROM tasks t
      WHERE t.contract_id = $1
      ORDER BY t.date_zayavki DESC NULLS LAST, t.id DESC
      LIMIT 100
    `, [id]);

    contract.linked_tasks = tasks;

    // Загружаем прикрепленные файлы/приложения договора
    const { rows: attachments } = await pool.query(`
      SELECT a.*, COALESCE(a.uploader_name, u.full_name, u.username) AS uploader_display_name
      FROM contract_attachments a
      LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.contract_id = $1
      ORDER BY a.created_at DESC
    `, [id]);

    contract.attachments = attachments || [];

    res.json(contract);
  } catch (err) {
    console.error('Error fetching contract details:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Назначить или изменить ответственного менеджера договора
 */
router.patch('/contracts/:id/manager', authenticateToken, async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'director', 'manager', 'accountant'].includes(role)) {
    return res.status(403).json({ error: 'Недостаточно прав для назначения менеджера' });
  }

  try {
    const { id } = req.params;
    const { manager_id, manager_name } = req.body;

    const { rows } = await pool.query(`
      UPDATE contracts SET
        manager_id = $1,
        manager_name = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [manager_id ? parseInt(manager_id, 10) : null, manager_name || null, id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Договор не найден' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error setting contract manager:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Обновить чек-лист закрывающих требований / документов договора
 */
router.patch('/contracts/:id/checklist', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { checklist } = req.body;

    const { rows } = await pool.query(`
      UPDATE contracts SET
        checklist = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(checklist || {}), id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Договор не найден' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating contract checklist:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Загрузить файлы / приложения к договору
 */
router.post('/contracts/:id/attachments', authenticateToken, uploadAttachment.array('files', 10), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'Файлы не загружены' });
    }

    const uploaderName = req.user.fullName || req.user.username || 'Пользователь';
    const inserted = [];

    for (const file of req.files) {
      const { rows } = await pool.query(`
        INSERT INTO contract_attachments (
          contract_id, file_path, original_name, mime_type, size_bytes, uploaded_by, uploader_name, comment
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        id, file.filename, file.originalname, file.mimetype, file.size, req.user.id, uploaderName, req.body.comment || null
      ]);
      inserted.push(rows[0]);
    }

    res.status(201).json(inserted);
  } catch (err) {
    console.error('Error uploading contract attachments:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Удалить файл / приложение договора
 */
router.delete('/contracts/:id/attachments/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    const { rows } = await pool.query(`
      SELECT * FROM contract_attachments WHERE id = $1 AND contract_id = $2
    `, [attachmentId, id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const att = rows[0];
    await pool.query('DELETE FROM contract_attachments WHERE id = $1', [attachmentId]);

    if (att.file_path) {
      fs.unlink(path.join(UPLOADS_DIR, att.file_path), () => {});
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting contract attachment:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Создать новый договор вручную
 */
router.post('/contracts', authenticateToken, async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'director', 'manager', 'accountant'].includes(role)) {
    return res.status(403).json({ error: 'Недостаточно прав для создания договора' });
  }

  try {
    const {
      internal_number,
      contract_number,
      contract_date,
      contract_type_summary,
      customer_name,
      customer_id,
      our_entity_region,
      our_entity_name,
      delivery_place,
      subject,
      terms_text,
      zakupki_url,
      deadline_raw,
      deadline_date,
      payment_terms,
      security_amount,
      security_condition,
      discount_percent,
      amount,
      platform,
      cloud_url,
      contacts_raw,
      status,
      lots,
      manager_id,
      manager_name
    } = req.body;

    let finalDeadlineDate = deadline_date || null;
    if (!finalDeadlineDate && deadline_raw) {
      finalDeadlineDate = computeDeadlineDate(deadline_raw, contract_date);
    }

    const { rows } = await pool.query(`
      INSERT INTO contracts (
        internal_number, contract_number, contract_date, contract_type_summary,
        customer_name, customer_id, our_entity_region, our_entity_name,
        delivery_place, subject, terms_text, zakupki_url,
        deadline_raw, deadline_date, payment_terms,
        security_amount, security_condition, discount_percent, amount,
        platform, cloud_url, contacts_raw, status, lots,
        manager_id, manager_name
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
        $25, $26
      )
      RETURNING *
    `, [
      internal_number || '', contract_number || '', contract_date || null, contract_type_summary || 'СМР / СКС и ЛВС',
      customer_name || 'Не указан', customer_id || null, our_entity_region || '', our_entity_name || 'ООО «Ультима»',
      delivery_place || '', subject || '', terms_text || '', zakupki_url || '',
      deadline_raw || '', finalDeadlineDate || null, payment_terms || '',
      security_amount || 0, security_condition || '', discount_percent || 0, amount || 0,
      platform || '', cloud_url || '', contacts_raw || '', status || 'Действует', JSON.stringify(lots || []),
      manager_id ? parseInt(manager_id, 10) : null, manager_name || null
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating contract:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Обновить существующий договор
 */
router.put('/contracts/:id', authenticateToken, async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'director', 'manager', 'accountant'].includes(role)) {
    return res.status(403).json({ error: 'Недостаточно прав для редактирования договора' });
  }

  try {
    const { id } = req.params;
    const {
      internal_number,
      contract_number,
      contract_date,
      contract_type_summary,
      customer_name,
      customer_id,
      our_entity_region,
      our_entity_name,
      delivery_place,
      subject,
      terms_text,
      zakupki_url,
      deadline_raw,
      deadline_date,
      payment_terms,
      security_amount,
      security_condition,
      discount_percent,
      amount,
      platform,
      cloud_url,
      contacts_raw,
      status,
      lots,
      manager_id,
      manager_name
    } = req.body;

    let finalDeadlineDate = deadline_date;
    if ((finalDeadlineDate === undefined || finalDeadlineDate === null) && deadline_raw) {
      finalDeadlineDate = computeDeadlineDate(deadline_raw, contract_date);
    }

    const { rows } = await pool.query(`
      UPDATE contracts SET
        internal_number = COALESCE($1, internal_number),
        contract_number = COALESCE($2, contract_number),
        contract_date = $3,
        contract_type_summary = COALESCE($4, contract_type_summary),
        customer_name = COALESCE($5, customer_name),
        customer_id = $6,
        our_entity_region = COALESCE($7, our_entity_region),
        our_entity_name = COALESCE($8, our_entity_name),
        delivery_place = COALESCE($9, delivery_place),
        subject = COALESCE($10, subject),
        terms_text = COALESCE($11, terms_text),
        zakupki_url = COALESCE($12, zakupki_url),
        deadline_raw = COALESCE($13, deadline_raw),
        deadline_date = $14,
        payment_terms = COALESCE($15, payment_terms),
        security_amount = COALESCE($16, security_amount),
        security_condition = COALESCE($17, security_condition),
        discount_percent = COALESCE($18, discount_percent),
        amount = COALESCE($19, amount),
        platform = COALESCE($20, platform),
        cloud_url = COALESCE($21, cloud_url),
        contacts_raw = COALESCE($22, contacts_raw),
        status = COALESCE($23, status),
        lots = COALESCE($24, lots),
        manager_id = COALESCE($25, manager_id),
        manager_name = COALESCE($26, manager_name),
        updated_at = NOW()
      WHERE id = $27
      RETURNING *
    `, [
      internal_number, contract_number, contract_date || null, contract_type_summary,
      customer_name, customer_id || null, our_entity_region, our_entity_name,
      delivery_place, subject, terms_text, zakupki_url,
      deadline_raw, finalDeadlineDate || null, payment_terms,
      security_amount, security_condition, discount_percent, amount,
      platform, cloud_url, contacts_raw, status, lots ? JSON.stringify(lots) : null,
      manager_id ? parseInt(manager_id, 10) : null, manager_name || null,
      id
    ]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Договор не найден' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating contract:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Удалить договор
 */
router.delete('/contracts/:id', authenticateToken, async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'director'].includes(role)) {
    return res.status(403).json({ error: 'Удаление договоров доступно только Администратору или Руководителю' });
  }

  try {
    const { id } = req.params;
    // Снимаем ссылку на договор в заявках
    await pool.query('UPDATE tasks SET contract_id = NULL WHERE contract_id = $1', [id]);
    const { rowCount } = await pool.query('DELETE FROM contracts WHERE id = $1', [id]);
    if (!rowCount) {
      return res.status(404).json({ error: 'Договор не найден' });
    }
    res.json({ success: true, message: 'Договор удален' });
  } catch (err) {
    console.error('Error deleting contract:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Импорт реестра договоров из файла Excel
 */
router.post('/contracts/import', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'director'].includes(role)) {
    return res.status(403).json({ error: 'Импорт реестра доступен только Администратору или Руководителю' });
  }

  try {
    let filePath = req.file ? req.file.path : null;
    if (!filePath) {
      filePath = path.join(process.cwd(), 'Reestr_kontraktov_ot_14_10_2017.xlsx');
    }

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'Файл реестра не найден на сервере' });
    }

    const result = await importContractsFromExcel(filePath, pool);
    res.json({
      success: true,
      message: `Импорт завершен: обработано ${result.totalParsed}, добавлено ${result.importedCount}, обновлено ${result.updatedCount}`,
      ...result
    });
  } catch (err) {
    console.error('Error importing contracts:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
