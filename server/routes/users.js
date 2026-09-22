import express from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { ROLES, ROLE_LIST, isValidRole, normalizeRole } from '../config/roles.js';

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
        u.avatar_url, u.contractor_id, u.created_at, u.assigned_regions,
        u.passport_series_number, u.passport_issued_by, 
        u.passport_issue_date, u.passport_code, u.passport_scan_url,
        c.name_short AS contractor_name
      FROM users u
      LEFT JOIN contractors c ON c.id = u.contractor_id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Создать нового пользователя (Администратор)
router.post('/', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа. Создание пользователей доступно только Администратору' });
  try {
    const { 
      username, password, role, fullName, email, phone, contractorId, assignedRegions,
      passportSeriesNumber, passportIssuedBy, passportIssueDate, passportCode, passportScanUrl 
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    const effectiveRole = normalizeRole(role);

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    
    await pool.query(`
      INSERT INTO users (
        username, password_hash, role, full_name, email, phone, contractor_id, assigned_regions,
        passport_series_number, passport_issued_by, passport_issue_date, passport_code, passport_scan_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      username.trim(), hash, effectiveRole, fullName ? fullName.trim() : null,
      email || null, phone || null, contractorId || null, assignedRegions || null,
      passportSeriesNumber || null, passportIssuedBy || null, passportIssueDate || null, passportCode || null, passportScanUrl || null
    ]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Обновить данные пользователя (только для Админа)
router.put('/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа. Редактирование пользователей доступно только Администратору' });
  try {
    const { 
      username, password, role, fullName, email, phone, contractorId, assignedRegions,
      passportSeriesNumber, passportIssuedBy, passportIssueDate, passportCode, passportScanUrl 
    } = req.body;

    const effectiveRole = role ? normalizeRole(role) : undefined;

    let query = `
      UPDATE users SET 
        username = $1, role = COALESCE($2, role), full_name = $3, email = $4, phone = $5, contractor_id = $6,
        assigned_regions = $7,
        passport_series_number = $8, passport_issued_by = $9, passport_issue_date = $10,
        passport_code = $11, passport_scan_url = $12
    `;
    let params = [
      username ? username.trim() : null, effectiveRole || null, fullName ? fullName.trim() : null,
      email || null, phone || null, contractorId || null, assignedRegions || null,
      passportSeriesNumber || null, passportIssuedBy || null, passportIssueDate || null, passportCode || null, passportScanUrl || null
    ];

    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      query += ', password_hash = $' + (params.length + 1);
      params.push(hash);
    }

    query += ' WHERE id = $' + (params.length + 1);
    params.push(req.params.id);

    await pool.query(query, params);
    res.json({ success: true });
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
