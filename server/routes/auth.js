import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { pool } from '../config/db.js';
import { JWT_SECRET, authenticateToken } from '../middleware/auth.js';
import { uploadAttachment, UPLOADS_DIR } from '../middleware/upload.js';

// Rate limiting для /login: не более 10 неудачных попыток за 15 минут с одного IP
const loginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of loginAttempts.entries()) {
    if (now - data.firstAttempt > LOCKOUT_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, LOCKOUT_WINDOW_MS).unref();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

// Предотвращение timing-attack при переборе логинов
const DUMMY_HASH = '$2a$10$wN9a8N4oB2M0W1j7yM7w1.eGkKkG4B0M0W1j7yM7w1eGkKkG4B0M0';

const router = express.Router();

router.post('/login', async (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const attempts = loginAttempts.get(ip);

  if (attempts && attempts.count >= MAX_FAILED_ATTEMPTS) {
    if (now - attempts.firstAttempt < LOCKOUT_WINDOW_MS) {
      const waitMinutes = Math.ceil((LOCKOUT_WINDOW_MS - (now - attempts.firstAttempt)) / 60000);
      return res.status(429).json({
        error: `Слишком много неудачных попыток входа. Пожалуйста, повторите попытку через ${waitMinutes} мин.`
      });
    } else {
      loginAttempts.delete(ip);
    }
  }

  const recordFailedAttempt = () => {
    const cur = loginAttempts.get(ip);
    if (!cur || now - cur.firstAttempt > LOCKOUT_WINDOW_MS) {
      loginAttempts.set(ip, { count: 1, firstAttempt: now });
    } else {
      cur.count += 1;
    }
  };

  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      recordFailedAttempt();
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
    const user = rows[0];

    if (!user) {
      // Имитируем вычисление bcrypt для защиты от timing-атаки
      await bcrypt.compare(password, DUMMY_HASH);
      recordFailedAttempt();
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      recordFailedAttempt();
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    // Успешный вход — сбрасываем счетчик ошибок для IP
    loginAttempts.delete(ip);

    // Создаем токен (в него упаковываем ID, роль, ФИО и закрепленные регионы)
    const token = jwt.sign(
      { id: user.id, role: user.role, fullName: user.full_name, contractorId: user.contractor_id, assignedRegions: user.assigned_regions },
      JWT_SECRET,
      { expiresIn: '24h', algorithm: 'HS256' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        email: user.email,
        avatarUrl: user.avatar_url,
        assignedRegions: user.assigned_regions
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ПРОФИЛЬ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ──────────────────────────────────────────
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.username, u.role, u.full_name, u.email, u.avatar_url, u.contractor_id, u.created_at, u.assigned_regions, c.name_short AS contractor_name
      FROM users u
      LEFT JOIN contractors c ON c.id = u.contractor_id
      WHERE u.id = $1
    `, [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      email: user.email,
      avatarUrl: user.avatar_url,
      assignedRegions: user.assigned_regions,
      contractorId: user.contractor_id,
      contractorName: user.contractor_name,
      createdAt: user.created_at
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName, email, currentPassword, newPassword } = req.body;
    
    // Получаем текущего пользователя для проверки пароля
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    let newPasswordHash = null;
    if (newPassword && newPassword.trim() !== '') {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Для смены пароля необходимо ввести текущий пароль' });
      }
      const validCurrent = await bcrypt.compare(currentPassword, user.password_hash);
      if (!validCurrent) {
        return res.status(400).json({ error: 'Текущий пароль указан неверно' });
      }
      if (newPassword.trim().length < 6) {
        return res.status(400).json({ error: 'Новый пароль должен быть не менее 6 символов' });
      }
      const salt = await bcrypt.genSalt(10);
      newPasswordHash = await bcrypt.hash(newPassword.trim(), salt);
    }

    let query = 'UPDATE users SET full_name = $1, email = $2';
    let params = [fullName ? fullName.trim() : null, email ? email.trim() : null];

    if (newPasswordHash) {
      query += ', password_hash = $' + (params.length + 1);
      params.push(newPasswordHash);
    }

    query += ' WHERE id = $' + (params.length + 1) + ' RETURNING id, username, role, full_name, email, avatar_url';
    params.push(req.user.id);

    const { rows: updatedRows } = await pool.query(query, params);
    const updated = updatedRows[0];

    res.json({
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        role: updated.role,
        fullName: updated.full_name,
        email: updated.email,
        avatarUrl: updated.avatar_url
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/profile/avatar', authenticateToken, uploadAttachment.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const avatarUrl = '/uploads/' + req.file.filename;

    const { rows: curRows } = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [req.user.id]);
    if (curRows[0] && curRows[0].avatar_url && curRows[0].avatar_url.startsWith('/uploads/')) {
      const oldFilename = curRows[0].avatar_url.replace('/uploads/', '');
      fs.unlink(path.join(UPLOADS_DIR, oldFilename), () => {});
    }

    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.user.id]);
    res.json({ success: true, avatarUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/profile/avatar', authenticateToken, async (req, res) => {
  try {
    const { rows: curRows } = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [req.user.id]);
    if (curRows[0] && curRows[0].avatar_url && curRows[0].avatar_url.startsWith('/uploads/')) {
      const oldFilename = curRows[0].avatar_url.replace('/uploads/', '');
      fs.unlink(path.join(UPLOADS_DIR, oldFilename), () => {});
    }
    await pool.query('UPDATE users SET avatar_url = NULL WHERE id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
