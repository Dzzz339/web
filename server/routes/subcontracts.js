import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { syncSingleTaskSubcontract } from '../scripts/sync_task_subcontracts.js';

const router = express.Router();

// 1. Получить все субподряды по задаче
router.get('/tasks/:taskId/subcontracts', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    let result = await pool.query(`
      SELECT 
        s.*,
        COALESCE(c.name_short, s.contractor_name) AS contractor_name,
        c.inn AS contractor_inn,
        c.phone AS contractor_phone,
        c.director AS contractor_director,
        c.address_legal AS contractor_address,
        COALESCE(sp.full_name, s.installer_fio) AS specialist_name,
        COALESCE(sp.phone, s.installer_phone) AS specialist_phone,
        COALESCE(sp.passport_series_number, s.installer_passport) AS specialist_passport,
        oc.name_short AS own_company_name,
        cc.contract_number,
        cc.contract_date
      FROM task_subcontracts s
      LEFT JOIN contractors c ON s.contractor_id = c.id
      LEFT JOIN specialists sp ON s.specialist_id = sp.id
      LEFT JOIN own_companies oc ON s.own_company_id = oc.id
      LEFT JOIN contractor_contracts cc ON s.contractor_contract_id = cc.id
      WHERE s.task_id = $1
      ORDER BY s.id ASC
    `, [taskId]);

    // Если субподрядов еще нет, но в самой заявке назначен подрядчик — создаем субподряд автоматически
    if (result.rows.length === 0) {
      const synced = await syncSingleTaskSubcontract(pool, taskId);
      if (synced) {
        result = await pool.query(`
          SELECT 
            s.*,
            COALESCE(c.name_short, s.contractor_name) AS contractor_name,
            c.inn AS contractor_inn,
            c.phone AS contractor_phone,
            c.director AS contractor_director,
            c.address_legal AS contractor_address,
            COALESCE(sp.full_name, s.installer_fio) AS specialist_name,
            COALESCE(sp.phone, s.installer_phone) AS specialist_phone,
            COALESCE(sp.passport_series_number, s.installer_passport) AS specialist_passport,
            oc.name_short AS own_company_name,
            cc.contract_number,
            cc.contract_date
          FROM task_subcontracts s
          LEFT JOIN contractors c ON s.contractor_id = c.id
          LEFT JOIN specialists sp ON s.specialist_id = sp.id
          LEFT JOIN own_companies oc ON s.own_company_id = oc.id
          LEFT JOIN contractor_contracts cc ON s.contractor_contract_id = cc.id
          WHERE s.task_id = $1
          ORDER BY s.id ASC
        `, [taskId]);
      }
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching subcontracts:', err);
    res.status(500).json({ error: 'Ошибка получения субподрядов' });
  }
});

// 2. Создать субподряд (назначить подрядчика на часть работ)
router.post('/tasks/:taskId/subcontracts', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    let {
      contractor_id,
      contractor_name,
      work_type,
      price_agreed,
      deadline,
      specialist_id,
      installer_fio,
      installer_phone,
      installer_passport,
      auto_number,
      comment
    } = req.body;

    if (!work_type) {
      work_type = 'Монтаж СКС';
    }

    // Если передан contractor_id, уточняем имя подрядчика
    if (contractor_id && !contractor_name) {
      const cRes = await pool.query('SELECT name_short FROM contractors WHERE id = $1', [contractor_id]);
      if (cRes.rows.length) contractor_name = cRes.rows[0].name_short;
    }
    if (!contractor_id && contractor_name) {
      const cRes = await pool.query(`
        SELECT id, name_short FROM contractors 
        WHERE LOWER(TRIM(name_short)) = LOWER(TRIM($1)) OR LOWER(TRIM(name_full)) = LOWER(TRIM($1)) 
        LIMIT 1
      `, [contractor_name]);
      if (cRes.rows.length) {
        contractor_id = cRes.rows[0].id;
        contractor_name = cRes.rows[0].name_short;
      }
    }

    // Если передан специалист_id, подтягиваем его данные при отсутствии
    if (specialist_id) {
      const spRes = await pool.query('SELECT full_name, phone, passport_raw, passport_series_number, auto_number FROM specialists WHERE id = $1', [specialist_id]);
      if (spRes.rows.length) {
        const sp = spRes.rows[0];
        if (!installer_fio) installer_fio = sp.full_name;
        if (!installer_phone) installer_phone = sp.phone;
        if (!installer_passport) installer_passport = sp.passport_raw || sp.passport_series_number;
        if (!auto_number) auto_number = sp.auto_number;
      }
    } else if (installer_fio && installer_fio.trim()) {
      const spMatch = await pool.query('SELECT id, phone, passport_raw, passport_series_number, auto_number FROM specialists WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1)) LIMIT 1', [installer_fio.trim()]);
      if (spMatch.rows.length) {
        specialist_id = spMatch.rows[0].id;
        if (!installer_phone) installer_phone = spMatch.rows[0].phone;
        if (!installer_passport) installer_passport = spMatch.rows[0].passport_raw || spMatch.rows[0].passport_series_number;
        if (!auto_number) auto_number = spMatch.rows[0].auto_number;
      }
    }

    const result = await pool.query(`
      INSERT INTO task_subcontracts (
        task_id, contractor_id, contractor_name, work_type, price_agreed, deadline,
        specialist_id, installer_fio, installer_phone, installer_passport,
        auto_number, comment, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'assigned')
      RETURNING *
    `, [
      taskId,
      contractor_id || null,
      contractor_name || null,
      work_type,
      price_agreed || 0,
      deadline || null,
      specialist_id || null,
      installer_fio || null,
      installer_phone || null,
      installer_passport || null,
      auto_number || null,
      comment || null
    ]);

    // Синхронизируем поле contractor в самой задаче
    if (contractor_name) {
      await pool.query('UPDATE tasks SET contractor = $1 WHERE id = $2', [contractor_name, taskId]);
    }

    // Обновляем макро-статус заявки в 'assigned', если она была 'new' или 'in_progress'
    await pool.query(`
      UPDATE tasks 
      SET macro_status = 'assigned'
      WHERE id = $1 AND macro_status IN ('new', 'review', 'in_progress')
    `, [taskId]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating subcontract:', err);
    res.status(500).json({ error: 'Ошибка назначения субподрядчика' });
  }
});

// 3. Обновить субподряд
router.put('/subcontracts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    let {
      contractor_id,
      contractor_name,
      work_type,
      status,
      price_agreed,
      deadline,
      specialist_id,
      installer_fio,
      installer_phone,
      installer_passport,
      auto_number,
      tmc_issued,
      report_photos,
      cable_journal,
      comment
    } = req.body;

    if (contractor_id && !contractor_name) {
      const cRes = await pool.query('SELECT name_short FROM contractors WHERE id = $1', [contractor_id]);
      if (cRes.rows.length) contractor_name = cRes.rows[0].name_short;
    }
    if (!contractor_id && contractor_name) {
      const cRes = await pool.query(`
        SELECT id, name_short FROM contractors 
        WHERE LOWER(TRIM(name_short)) = LOWER(TRIM($1)) OR LOWER(TRIM(name_full)) = LOWER(TRIM($1)) 
        LIMIT 1
      `, [contractor_name]);
      if (cRes.rows.length) {
        contractor_id = cRes.rows[0].id;
        contractor_name = cRes.rows[0].name_short;
      }
    }

    const result = await pool.query(`
      UPDATE task_subcontracts
      SET 
        contractor_id = COALESCE($1, contractor_id),
        contractor_name = COALESCE($2, contractor_name),
        work_type = COALESCE($3, work_type),
        status = COALESCE($4, status),
        price_agreed = COALESCE($5, price_agreed),
        deadline = COALESCE($6, deadline),
        specialist_id = COALESCE($7, specialist_id),
        installer_fio = COALESCE($8, installer_fio),
        installer_phone = COALESCE($9, installer_phone),
        installer_passport = COALESCE($10, installer_passport),
        auto_number = COALESCE($11, auto_number),
        tmc_issued = COALESCE($12, tmc_issued),
        report_photos = COALESCE($13, report_photos),
        cable_journal = COALESCE($14, cable_journal),
        comment = COALESCE($15, comment),
        updated_at = NOW()
      WHERE id = $16
      RETURNING *
    `, [
      contractor_id,
      contractor_name,
      work_type,
      status,
      price_agreed,
      deadline,
      specialist_id,
      installer_fio,
      installer_phone,
      installer_passport,
      auto_number,
      tmc_issued ? JSON.stringify(tmc_issued) : null,
      report_photos ? JSON.stringify(report_photos) : null,
      cable_journal,
      comment,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Субподряд не найден' });
    }

    const updatedRow = result.rows[0];
    if (contractor_name && updatedRow.task_id) {
      await pool.query('UPDATE tasks SET contractor = $1 WHERE id = $2', [contractor_name, updatedRow.task_id]);
    }

    res.json(updatedRow);
  } catch (err) {
    console.error('Error updating subcontract:', err);
    res.status(500).json({ error: 'Ошибка обновления субподряда' });
  }
});

// 4. Удалить субподряд
router.delete('/subcontracts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM task_subcontracts WHERE id = $1', [id]);
    res.json({ success: true, message: 'Субподряд удален' });
  } catch (err) {
    console.error('Error deleting subcontract:', err);
    res.status(500).json({ error: 'Ошибка удаления субподряда' });
  }
});

export default router;
