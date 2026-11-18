import express from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { ROLES, ROLE_LIST, isValidRole, normalizeRole } from '../config/roles.js';
import { getValidAvatarUrl } from './auth.js';

const router = express.Router();

// Получить справочник доступных ролей системы (для выпадающих списков)
router.get('/roles', authenticateToken, (req, res) => {
  res.json(ROLE_LIST);
});

// Получить список всех пользователей (доступно Админу и Руководителю)
router.get('/', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'director') {
    return res.status(403).json({ error: 'Нет доступа. Доступно только для Администратора и Руководителя' });
  }
  try {
    const { rows } = await pool.query(`
      SELECT 
        u.id, u.username, u.role, u.full_name, u.email, u.phone, 
        u.avatar_url, u.contractor_id, u.specialist_id, u.created_at, u.assigned_regions,
        u.passport_series_number, u.passport_issued_by, 
        u.passport_issue_date, u.passport_code, u.passport_scan_url,
        c.name_short AS contractor_name,
        s.full_name AS specialist_name
      FROM users u
      LEFT JOIN contractors c ON c.id = u.contractor_id
      LEFT JOIN specialists s ON s.id = u.specialist_id
      ORDER BY u.created_at DESC
    `);
    const sanitized = rows.map(u => ({
      ...u,
      avatar_url: getValidAvatarUrl(u.avatar_url)
    }));
    res.json(sanitized);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Создать нового пользователя (Администратор)
router.post('/', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа. Создание пользователей доступно только Администратору' });
  try {
    const { 
      username, password, role, fullName, email, phone, contractorId, specialistId, assignedRegions,
      passportSeriesNumber, passportIssuedBy, passportIssueDate, passportCode, passportScanUrl 
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    const effectiveRole = normalizeRole(role);

    let targetSpecialistId = (specialistId || req.body.specialist_id) ? parseInt(specialistId || req.body.specialist_id) : null;
    if (!targetSpecialistId && fullName && fullName.trim()) {
      const { rows: existSpecs } = await pool.query(
        'SELECT id FROM specialists WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1)) LIMIT 1',
        [fullName.trim()]
      );
      if (existSpecs.length > 0) {
        targetSpecialistId = existSpecs[0].id;
      }
    }

    let specData = null;
    if (targetSpecialistId) {
      const { rows: sRows } = await pool.query('SELECT * FROM specialists WHERE id = $1', [targetSpecialistId]);
      if (sRows.length) specData = sRows[0];
    }

    const mergedFullName = fullName ? fullName.trim() : (specData ? specData.full_name : null);
    const mergedPhone = (phone && phone.trim()) || (specData ? specData.phone : null);
    const effectiveContractorId = (contractorId || req.body.contractor_id) ? parseInt(contractorId || req.body.contractor_id) : (specData ? specData.contractor_id : null);
    const mergedPassNum = passportSeriesNumber || (specData ? specData.passport_series_number : null);
    const mergedPassIssued = passportIssuedBy || (specData ? specData.passport_issued_by : null);
    const mergedPassCode = passportCode || (specData ? specData.passport_code : null);
    const mergedPassDate = passportIssueDate || (specData && specData.passport_issue_date ? specData.passport_issue_date.slice(0, 10) : null);

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    
    const { rows: insertRes } = await pool.query(`
      INSERT INTO users (
        username, password_hash, role, full_name, email, phone, contractor_id, specialist_id, assigned_regions,
        passport_series_number, passport_issued_by, passport_issue_date, passport_code, passport_scan_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [
      username.trim(), hash, effectiveRole, mergedFullName,
      email || null, mergedPhone, effectiveContractorId, targetSpecialistId, assignedRegions || null,
      mergedPassNum, mergedPassIssued, mergedPassDate, mergedPassCode, passportScanUrl || null
    ]);
    const newUserId = insertRes[0].id;

    if (targetSpecialistId) {
      await pool.query(`
        UPDATE specialists SET
          user_id = $1,
          full_name = COALESCE($2, full_name),
          phone = COALESCE(NULLIF($3, ''), phone),
          contractor_id = COALESCE($4, contractor_id),
          passport_series_number = COALESCE(NULLIF($5, ''), passport_series_number),
          passport_issued_by = COALESCE(NULLIF($6, ''), passport_issued_by),
          passport_code = COALESCE(NULLIF($7, ''), passport_code)
        WHERE id = $8
      `, [newUserId, mergedFullName, mergedPhone, effectiveContractorId, mergedPassNum, mergedPassIssued, mergedPassCode, targetSpecialistId]);
    } else if (mergedFullName && ['worker', 'installer', 'contractor', 'subcontractor', 'foreman', 'master'].includes(effectiveRole)) {
      const { rows: newSpec } = await pool.query(`
        INSERT INTO specialists (full_name, phone, contractor_id, passport_series_number, passport_issued_by, passport_code, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [mergedFullName, mergedPhone, effectiveContractorId, mergedPassNum, mergedPassIssued, mergedPassCode, newUserId]);
      await pool.query('UPDATE users SET specialist_id = $1 WHERE id = $2', [newSpec[0].id, newUserId]);
    }

    res.json({ success: true, id: newUserId, specialist_id: targetSpecialistId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Обновить данные пользователя (только для Админа)
router.put('/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа. Редактирование пользователей доступно только Администратору' });
  try {
    const userId = parseInt(req.params.id);
    const { 
      username, password, role, fullName, email, phone, contractorId, specialistId, assignedRegions,
      passportSeriesNumber, passportIssuedBy, passportIssueDate, passportCode, passportScanUrl 
    } = req.body;

    const effectiveRole = role ? normalizeRole(role) : undefined;

    let targetSpecialistId = (specialistId || req.body.specialist_id) ? parseInt(specialistId || req.body.specialist_id) : null;
    if (!targetSpecialistId && fullName && fullName.trim()) {
      const { rows: existSpecs } = await pool.query(
        'SELECT id FROM specialists WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1)) OR user_id = $2 LIMIT 1',
        [fullName.trim(), userId]
      );
      if (existSpecs.length > 0) {
        targetSpecialistId = existSpecs[0].id;
      }
    }
    if (!targetSpecialistId) {
      const { rows: curU } = await pool.query('SELECT specialist_id FROM users WHERE id = $1', [userId]);
      if (curU.length && curU[0].specialist_id) {
        targetSpecialistId = curU[0].specialist_id;
      }
    }

    const effectiveContractorId = (contractorId !== undefined)
      ? (contractorId ? parseInt(contractorId) : null)
      : (req.body.contractor_id !== undefined ? (req.body.contractor_id ? parseInt(req.body.contractor_id) : null) : undefined);

    let query = `
      UPDATE users SET
        username = COALESCE(NULLIF($1, ''), username),
        role = COALESCE($2, role),
        full_name = COALESCE(NULLIF($3, ''), full_name),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        contractor_id = CASE WHEN $6::boolean THEN $7::integer ELSE contractor_id END,
        specialist_id = CASE WHEN $8::boolean THEN $9::integer ELSE specialist_id END,
        assigned_regions = COALESCE($10, assigned_regions),
        passport_series_number = COALESCE($11, passport_series_number),
        passport_issued_by = COALESCE($12, passport_issued_by),
        passport_issue_date = COALESCE($13, passport_issue_date),
        passport_code = COALESCE($14, passport_code),
        passport_scan_url = COALESCE($15, passport_scan_url)
    `;
    let params = [
      username ? username.trim() : null, effectiveRole || null, fullName ? fullName.trim() : null,
      email || null, phone || null,
      effectiveContractorId !== undefined, effectiveContractorId || null,
      targetSpecialistId !== undefined && targetSpecialistId !== null, targetSpecialistId || null,
      assignedRegions || null,
      passportSeriesNumber || null, passportIssuedBy || null, passportIssueDate || null,
      passportCode || null, passportScanUrl || null
    ];

    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      query += ', password_hash = $' + (params.length + 1);
      params.push(hash);
    }

    query += ' WHERE id = $' + (params.length + 1);
    params.push(userId);

    await pool.query(query, params);

    // Двусторонняя синхронизация со связанным специалистом
    if (targetSpecialistId) {
      await pool.query(`
        UPDATE specialists SET
          user_id = $1,
          full_name = COALESCE(NULLIF($2, ''), full_name),
          phone = COALESCE(NULLIF($3, ''), phone),
          contractor_id = CASE WHEN $4::boolean THEN $5::integer ELSE contractor_id END,
          passport_series_number = COALESCE(NULLIF($6, ''), passport_series_number),
          passport_issued_by = COALESCE(NULLIF($7, ''), passport_issued_by),
          passport_code = COALESCE(NULLIF($8, ''), passport_code)
        WHERE id = $9
      `, [
        userId,
        fullName ? fullName.trim() : null,
        phone || null,
        effectiveContractorId !== undefined, effectiveContractorId || null,
        passportSeriesNumber || null,
        passportIssuedBy || null,
        passportCode || null,
        targetSpecialistId
      ]);
    }

    res.json({ success: true, specialist_id: targetSpecialistId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Удалить пользователя
router.delete('/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
