import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { pool } from '../config/db.js';
import { JWT_SECRET, authenticateToken } from '../middleware/auth.js';
import { uploadAttachment, UPLOADS_DIR } from '../middleware/upload.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
    const user = rows[0];

    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Неверный пароль' });

    // Создаем токен (в него упаковываем ID, роль и ФИО)
    const token = jwt.sign(
      { id: user.id, role: user.role, fullName: user.full_name, contractorId: user.contractor_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        email: user.email,
        avatarUrl: user.avatar_url
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
      SELECT u.id, u.username, u.role, u.full_name, u.email, u.avatar_url, u.contractor_id, u.created_at, c.name_short AS contractor_name
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
