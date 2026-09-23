// server/routes/subcontracts.js - Маршруты управления исходящими субподрядами
import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// 1. Получить все субподряды по задаче
router.get('/tasks/:taskId/subcontracts', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const result = await pool.query(`
      SELECT 
        s.*,
        c.name_short AS contractor_name,
        c.inn AS contractor_inn,
        c.phone AS contractor_phone,
        c.director AS contractor_director,
        c.address_legal AS contractor_address,
        sp.full_name AS specialist_name,
        sp.phone AS specialist_phone,
        sp.passport_series_number AS specialist_passport
      FROM task_subcontracts s
      LEFT JOIN contractors c ON s.contractor_id = c.id
      LEFT JOIN specialists sp ON s.specialist_id = sp.id
      WHERE s.task_id = $1
      ORDER BY s.id ASC
    `, [taskId]);

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
    const {
      contractor_id,
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
      return res.status(400).json({ error: 'Укажите вид работ для субподряда' });
    }

    const result = await pool.query(`
      INSERT INTO task_subcontracts (
        task_id, contractor_id, work_type, price_agreed, deadline,
        specialist_id, installer_fio, installer_phone, installer_passport,
        auto_number, comment, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'assigned')
      RETURNING *
    `, [
      taskId,
      contractor_id || null,
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
    const {
      contractor_id,
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

    const result = await pool.query(`
      UPDATE task_subcontracts
      SET 
        contractor_id = COALESCE($1, contractor_id),
        work_type = COALESCE($2, work_type),
        status = COALESCE($3, status),
        price_agreed = COALESCE($4, price_agreed),
        deadline = COALESCE($5, deadline),
        specialist_id = COALESCE($6, specialist_id),
        installer_fio = COALESCE($7, installer_fio),
        installer_phone = COALESCE($8, installer_phone),
        installer_passport = COALESCE($9, installer_passport),
        auto_number = COALESCE($10, auto_number),
        tmc_issued = COALESCE($11, tmc_issued),
        report_photos = COALESCE($12, report_photos),
        cable_journal = COALESCE($13, cable_journal),
        comment = COALESCE($14, comment),
        updated_at = NOW()
      WHERE id = $15
      RETURNING *
    `, [
      contractor_id,
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

    res.json(result.rows[0]);
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
