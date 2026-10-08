import express from 'express';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadAttachment, UPLOADS_DIR, fixUtf8Filename } from '../middleware/upload.js';
import { importContractsFromExcel, computeDeadlineDate } from '../services/contractsImporter.js';
import { resolveCityCoordinates } from '../services/cityCoordinates.js';

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
    const { q, type, customer, status, year, manager, entity } = req.query;
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // 1. Поиск по строке (номер, заказчик, менеджер, предмет, место, юрлицо, регион, лоты)
    if (q && q.trim()) {
      const searchVal = `%${q.trim()}%`;
      whereConditions.push(`(
        c.internal_number ILIKE $${paramIndex} OR
        c.contract_number ILIKE $${paramIndex} OR
        c.customer_name ILIKE $${paramIndex} OR
        c.our_entity_name ILIKE $${paramIndex} OR
        c.manager_name ILIKE $${paramIndex} OR
        u.full_name ILIKE $${paramIndex} OR
        u.username ILIKE $${paramIndex} OR
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

    // 3. Фильтр по Стороне 1 (Заказчик)
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
      whereConditions.push(`c.status ILIKE $${paramIndex}`);
      params.push(`%${status}%`);
      paramIndex++;
    }

    // 5. Фильтр по году
    if (year && year !== 'all') {
      const yr = parseInt(year, 10);
      const twoDigit = String(yr).slice(-2);
      whereConditions.push(`(
        EXTRACT(YEAR FROM c.contract_date) = $${paramIndex} OR
        (c.contract_date IS NULL AND c.internal_number ~ ('(?:^|\\D)' || '${twoDigit}' || '-\\d+'))
      )`);
      params.push(yr);
      paramIndex++;
    }

    // 6. Фильтр по Менеджеру (кто ведет контракт)
    if (manager && manager !== 'all') {
      if (manager === 'unassigned' || manager === 'none') {
        whereConditions.push(`(c.manager_id IS NULL AND (c.manager_name IS NULL OR TRIM(c.manager_name) = ''))`);
      } else if (manager === 'assigned') {
        whereConditions.push(`(c.manager_id IS NOT NULL OR (c.manager_name IS NOT NULL AND TRIM(c.manager_name) != ''))`);
      } else if (/^\d+$/.test(manager)) {
        whereConditions.push(`c.manager_id = $${paramIndex}`);
        params.push(parseInt(manager, 10));
        paramIndex++;
      } else {
        whereConditions.push(`(c.manager_name ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`);
        params.push(`%${manager}%`);
        paramIndex++;
      }
    }

    // 7. Фильтр по Стороне 2 (Исполнитель / Наша организация)
    if (entity && entity !== 'all') {
      whereConditions.push(`c.our_entity_name ILIKE $${paramIndex}`);
      params.push(`%${entity}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const listQuery = `
      SELECT 
        c.*,
        COALESCE(c.manager_name, u.full_name, u.username) AS manager_display_name,
        (SELECT COUNT(*) FROM tasks t WHERE t.contract_id = c.id) AS linked_tasks_count,
        COALESCE(aggr.agreements, '[]'::jsonb) AS agreements
      FROM contracts c
      LEFT JOIN users u ON u.id = c.manager_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ca.id,
            'agreement_number', ca.agreement_number,
            'agreement_code', ca.agreement_code,
            'external_number', ca.external_number,
            'region', ca.region,
            'city', ca.city,
            'price_unit', ca.price_unit,
            'price_list', ca.price_list,
            'amount', ca.amount,
            'status', ca.status,
            'comment', ca.comment,
            'geo_lat', ca.geo_lat,
            'geo_lon', ca.geo_lon,
            'linked_tasks_count', (SELECT COUNT(*) FROM tasks t WHERE t.contract_agreement_id = ca.id)
          ) ORDER BY ca.agreement_number ASC NULLS LAST, ca.id ASC
        ) AS agreements
        FROM contract_agreements ca
        WHERE ca.contract_id = c.id
      ) aggr ON true
      ${whereClause}
      ORDER BY c.contract_date DESC NULLS LAST, c.id DESC
    `;

    const statsQuery = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(c.amount), 0) as total_amount,
        COALESCE(SUM(c.security_amount), 0) as total_security,
        COUNT(CASE WHEN jsonb_array_length(COALESCE(c.lots, '[]'::jsonb)) > 0 THEN 1 END) as multi_lot_count
      FROM contracts c
      LEFT JOIN users u ON u.id = c.manager_id
      ${whereClause}
    `;

    const filterOptionsQuery = `
      SELECT
        (SELECT jsonb_agg(DISTINCT our_entity_name) FROM contracts WHERE our_entity_name IS NOT NULL AND our_entity_name != '') AS entities,
        (SELECT jsonb_agg(DISTINCT EXTRACT(YEAR FROM contract_date)::int ORDER BY EXTRACT(YEAR FROM contract_date)::int DESC) FROM contracts WHERE contract_date IS NOT NULL) AS years,
        (SELECT jsonb_agg(DISTINCT customer_name) FROM (
          SELECT customer_name FROM contracts WHERE customer_name IS NOT NULL AND customer_name != '' ${year && year !== 'all' ? `AND (EXTRACT(YEAR FROM contract_date) = ${parseInt(year, 10)} OR internal_number ~ '(?:^|\\D)${String(parseInt(year, 10)).slice(-2)}-\\d+')` : ''} LIMIT 300
        ) sub_cust) AS customers,
        (SELECT jsonb_agg(jsonb_build_object('id', sub_u.id, 'name', sub_u.name, 'role', sub_u.role)) FROM (
          SELECT u.id, COALESCE(u.full_name, u.username) AS name, u.role FROM users u ORDER BY COALESCE(u.full_name, u.username)
        ) sub_u) AS users
    `;

    const [listResult, statsResult, filterResult] = await Promise.all([
      pool.query(listQuery, params),
      pool.query(statsQuery, params),
      pool.query(filterOptionsQuery)
    ]);

    res.json({
      contracts: listResult.rows,
      stats: statsResult.rows[0] || {
        total_count: 0,
        total_amount: 0,
        total_security: 0,
        multi_lot_count: 0
      },
      filterOptions: filterResult.rows[0] || {}
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

    // Загружаем связанные дополнительные соглашения (ДС)
    const { rows: agreements } = await pool.query(`
      SELECT 
        ca.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.contract_agreement_id = ca.id) AS linked_tasks_count
      FROM contract_agreements ca
      WHERE ca.contract_id = $1
      ORDER BY ca.agreement_number ASC NULLS LAST, ca.id ASC
    `, [id]);
    contract.agreements = agreements || [];

    // Загружаем связанные заявки/объекты
    const { rows: tasks } = await pool.query(`
      SELECT 
        t.id, t.region, t.address, t.work_type, t.status, t.stage, t.amount,
        t.date_zayavki, t.deadline, t.assignee, t.macro_status, t.contract_lot,
        t.contract_agreement_id,
        ca.agreement_code, ca.external_number AS agreement_ext_num
      FROM tasks t
      LEFT JOIN contract_agreements ca ON ca.id = t.contract_agreement_id
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

    for (const a of (attachments || [])) {
      const fixedName = fixUtf8Filename(a.original_name);
      if (fixedName && fixedName !== a.original_name) {
        a.original_name = fixedName;
        pool.query('UPDATE contract_attachments SET original_name = $1 WHERE id = $2', [fixedName, a.id]).catch(() => {});
      }
    }

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
 * Быстрое обновление статуса договора (играется, выигран, заключен, в работе и т.д.)
 */
router.patch('/contracts/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Статус не указан' });

    const { rows } = await pool.query(`
      UPDATE contracts SET
        status = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Договор не найден' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating contract status:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Быстрое обновление контактов куратора договора со стороны заказчика
 */
router.patch('/contracts/:id/contacts', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { contacts_raw } = req.body;

    const { rows } = await pool.query(`
      UPDATE contracts SET
        contacts_raw = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [contacts_raw || '', id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Договор не найден' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating contract contacts:', err);
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
      const cleanOriginalName = fixUtf8Filename(file.originalname);
      const { rows } = await pool.query(`
        INSERT INTO contract_attachments (
          contract_id, file_path, original_name, mime_type, size_bytes, uploaded_by, uploader_name, comment
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        id, file.filename, cleanOriginalName, file.mimetype, file.size, req.user.id, uploaderName, req.body.comment || null
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
 * Скачать файл / приложение договора с корректным UTF-8 именем
 */
router.get('/contracts/:id/attachments/:attachmentId/download', authenticateToken, async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    const { rows } = await pool.query(`
      SELECT * FROM contract_attachments WHERE id = $1 AND contract_id = $2
    `, [attachmentId, id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const att = rows[0];
    const cleanName = fixUtf8Filename(att.original_name || 'attachment');
    const fullPath = path.join(UPLOADS_DIR, att.file_path);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Файл не найден на сервере' });
    }
    res.download(fullPath, cleanName);
  } catch (err) {
    console.error('Error downloading contract attachment:', err);
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

/**
 * Поиск доступных заявок для привязки к договору
 */
router.get('/contracts/:id/available-tasks', authenticateToken, async (req, res) => {
  try {
    const contractId = parseInt(req.params.id, 10);
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const { rows: cRows } = await pool.query('SELECT id, internal_number, customer_name, delivery_place FROM contracts WHERE id = $1', [contractId]);
    if (!cRows.length) {
      return res.status(404).json({ error: 'Договор не найден' });
    }
    const contract = cRows[0];
    const prefix = contract.internal_number ? contract.internal_number.trim() : '';
    const custName = contract.customer_name ? contract.customer_name.trim() : '';

    let query = `
      SELECT 
        t.id, t.region, t.address, t.work_type, t.customer, t.status, t.stage, t.amount,
        t.date_zayavki, t.deadline, t.assignee, t.contract_id,
        c.internal_number AS linked_contract_num,
        c.contract_number AS linked_contract_official_num
      FROM tasks t
      LEFT JOIN contracts c ON c.id = t.contract_id
      WHERE (t.contract_id IS NULL OR t.contract_id != $1)
    `;
    const params = [contractId];

    if (q) {
      params.push(`%${q}%`);
      query += ` AND (t.id ILIKE $${params.length} OR t.address ILIKE $${params.length} OR t.customer ILIKE $${params.length} OR t.region ILIKE $${params.length})`;
    }

    query += `
      ORDER BY 
        CASE 
          WHEN $${params.length + 1} != '' AND t.id ILIKE $${params.length + 1} || '%' THEN 0 
          WHEN $${params.length + 2} != '' AND t.customer ILIKE '%' || $${params.length + 2} || '%' THEN 1
          ELSE 2 
        END,
        CASE WHEN t.contract_id IS NULL THEN 0 ELSE 1 END,
        t.date_zayavki DESC NULLS LAST,
        t.id DESC
      LIMIT $${params.length + 3}
    `;
    params.push(prefix, custName, limit);

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching available tasks for contract:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Привязать существующую заявку к договору
 */
router.post('/contracts/:id/link-task', authenticateToken, async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'director', 'manager', 'accountant'].includes(role)) {
    return res.status(403).json({ error: 'Недостаточно прав для привязки заявки к договору' });
  }

  try {
    const contractId = parseInt(req.params.id, 10);
    const { taskId, agreementId } = req.body;
    if (!taskId) {
      return res.status(400).json({ error: 'Не указан taskId заявки' });
    }

    const { rows: cRows } = await pool.query('SELECT id, internal_number, contract_number, customer_name FROM contracts WHERE id = $1', [contractId]);
    if (!cRows.length) {
      return res.status(404).json({ error: 'Договор не найден' });
    }

    const { rows: tRows } = await pool.query('SELECT id, contract_id, customer FROM tasks WHERE id = $1', [taskId]);
    if (!tRows.length) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    const parsedAgreementId = agreementId ? parseInt(agreementId, 10) : null;

    await pool.query(`
      UPDATE tasks 
      SET 
        contract_id = $1,
        contract_agreement_id = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [contractId, parsedAgreementId, taskId]);

    res.json({ success: true, taskId, contractId, agreementId: parsedAgreementId });
  } catch (err) {
    console.error('Error linking task to contract:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Отвязать заявку от договора
 */
router.post('/contracts/:id/unlink-task', authenticateToken, async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'director', 'manager', 'accountant'].includes(role)) {
    return res.status(403).json({ error: 'Недостаточно прав для отвязки заявки от договора' });
  }

  try {
    const contractId = parseInt(req.params.id, 10);
    const { taskId } = req.body;
    if (!taskId) {
      return res.status(400).json({ error: 'Не указан taskId заявки' });
    }

    await pool.query(`
      UPDATE tasks 
      SET 
        contract_id = NULL,
        contract_agreement_id = NULL,
        updated_at = NOW()
      WHERE id = $1 AND contract_id = $2
    `, [taskId, contractId]);

    res.json({ success: true, taskId });
  } catch (err) {
    console.error('Error unlinking task from contract:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Создать новое дополнительное соглашение (ДС) к договору
 */
router.post('/contracts/:id/agreements', authenticateToken, async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'director', 'manager', 'accountant'].includes(role)) {
    return res.status(403).json({ error: 'Недостаточно прав для добавления допсоглашения' });
  }

  try {
    const contractId = parseInt(req.params.id, 10);
    const { region, city, external_number, price_unit, amount, comment, status } = req.body;

    if (!region || !region.trim()) {
      return res.status(400).json({ error: 'Укажите регион или город для допсоглашения' });
    }

    // Вычисляем следующий номер соглашения
    const { rows: maxRows } = await pool.query(
      'SELECT COALESCE(MAX(agreement_number), 0) + 1 AS next_num FROM contract_agreements WHERE contract_id = $1',
      [contractId]
    );
    const nextNum = parseInt(maxRows[0].next_num, 10) || 1;
    const agCode = `ДС-${nextNum}`;

    const targetLoc = (city || region).trim();
    const coords = resolveCityCoordinates(targetLoc) || resolveCityCoordinates(region.trim());
    const geoLat = coords ? coords.lat : null;
    const geoLon = coords ? coords.lon : null;

    const { rows: newRows } = await pool.query(`
      INSERT INTO contract_agreements (
        contract_id, agreement_number, agreement_code, external_number,
        region, city, price_unit, amount, comment, status, geo_lat, geo_lon, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING *, 0 AS linked_tasks_count
    `, [
      contractId,
      nextNum,
      agCode,
      (external_number || '').trim(),
      region.trim(),
      targetLoc,
      price_unit ? parseFloat(price_unit) : 0,
      amount ? parseFloat(amount) : 0,
      comment || '',
      status || 'active',
      geoLat,
      geoLon
    ]);

    res.json(newRows[0]);
  } catch (err) {
    console.error('Error adding contract agreement:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Обновить параметры дополнительного соглашения (в т.ч. региональную цену, лимит, комментарий)
 */
router.patch('/contracts/agreements/:id', authenticateToken, async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'director', 'manager', 'accountant'].includes(role)) {
    return res.status(403).json({ error: 'Недостаточно прав для редактирования допсоглашения' });
  }

  try {
    const agreementId = parseInt(req.params.id, 10);
    const { price_unit, price_list, amount, comment, status, external_number, region, city } = req.body;

    const { rows: curRows } = await pool.query('SELECT * FROM contract_agreements WHERE id = $1', [agreementId]);
    if (!curRows.length) {
      return res.status(404).json({ error: 'Дополнительное соглашение не найдено' });
    }

    const cur = curRows[0];
    const newPriceUnit = price_unit !== undefined ? (price_unit === '' || price_unit === null ? 0 : parseFloat(price_unit)) : cur.price_unit;
    const newAmount = amount !== undefined ? (amount === '' || amount === null ? 0 : parseFloat(amount)) : cur.amount;
    const newPriceList = price_list !== undefined ? JSON.stringify(price_list) : JSON.stringify(cur.price_list || []);
    const newComment = comment !== undefined ? comment : cur.comment;
    const newStatus = status !== undefined ? status : cur.status;
    const newExtNum = external_number !== undefined ? external_number.trim() : cur.external_number;
    const newRegion = region !== undefined ? region.trim() : cur.region;
    const newCity = city !== undefined ? city.trim() : cur.city;

    let geoLat = cur.geo_lat;
    let geoLon = cur.geo_lon;
    if (newRegion !== cur.region || newCity !== cur.city || (!geoLat && (newCity || newRegion))) {
      const coords = resolveCityCoordinates(newCity || newRegion) || resolveCityCoordinates(newRegion);
      if (coords) {
        geoLat = coords.lat;
        geoLon = coords.lon;
      }
    }

    const { rows: updatedRows } = await pool.query(`
      UPDATE contract_agreements SET
        price_unit = $1,
        amount = $2,
        price_list = $3,
        comment = $4,
        status = $5,
        external_number = $6,
        region = $7,
        city = $8,
        geo_lat = $9,
        geo_lon = $10,
        updated_at = NOW()
      WHERE id = $11
      RETURNING *,
        (SELECT COUNT(*) FROM tasks t WHERE t.contract_agreement_id = contract_agreements.id) AS linked_tasks_count
    `, [newPriceUnit, newAmount, newPriceList, newComment, newStatus, newExtNum, newRegion, newCity, geoLat, geoLon, agreementId]);

    res.json(updatedRows[0]);
  } catch (err) {
    console.error('Error updating contract agreement:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Удалить дополнительное соглашение
 */
router.delete('/contracts/agreements/:id', authenticateToken, async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'director'].includes(role)) {
    return res.status(403).json({ error: 'Удаление допсоглашения доступно только Администратору или Руководителю' });
  }

  try {
    const agreementId = parseInt(req.params.id, 10);
    // Отвязываем связанные задачи
    await pool.query('UPDATE tasks SET contract_agreement_id = NULL WHERE contract_agreement_id = $1', [agreementId]);
    const { rowCount } = await pool.query('DELETE FROM contract_agreements WHERE id = $1', [agreementId]);
    if (!rowCount) {
      return res.status(404).json({ error: 'Дополнительное соглашение не найдено' });
    }
    res.json({ success: true, message: 'Дополнительное соглашение удалено' });
  } catch (err) {
    console.error('Error deleting contract agreement:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

