import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

import { uploadAttachment, fixUtf8Filename } from '../middleware/upload.js';

const router = express.Router();

// Получить или создать чат конкретной заявки
router.get('/chats/task/:taskId', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    let { rows: rooms } = await pool.query(
      "SELECT * FROM chat_rooms WHERE task_id = $1 AND type = 'task' LIMIT 1",
      [taskId]
    );

    let room = rooms[0];
    if (!room) {
      const { rows: taskExists } = await pool.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
      if (!taskExists.length) {
        return res.status(404).json({ error: 'Заявка не найдена' });
      }
      const { rows: newRooms } = await pool.query(
        "INSERT INTO chat_rooms (name, type, task_id) VALUES ($1, 'task', $2) RETURNING *",
        [`Чат по заявке ${taskId}`, taskId]
      );
      room = newRooms[0];
    }

    const { rows: messages } = await pool.query(`
      SELECT m.id, m.room_id, m.sender_id, m.message_text, m.attachments, m.created_at,
             u.full_name, u.username, u.avatar_url, u.role
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = $1
      ORDER BY m.created_at ASC
      LIMIT 250
    `, [room.id]);

    res.json({ room, messages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Загрузка фото/файла в чат
router.post('/chats/:roomId/upload', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не прикреплен' });
    const originalName = fixUtf8Filename(req.file.originalname);
    res.json({
      url: `/uploads/${req.file.filename}`,
      name: originalName,
      size: req.file.size,
      type: req.file.mimetype
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Отправка сообщения через REST API (дублирует сокет для надёжности)
router.post('/chats/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { text, attachments } = req.body;
    if (!text && (!attachments || !attachments.length)) {
      return res.status(400).json({ error: 'Текст или вложение обязательно' });
    }
    const { rows } = await pool.query(
      'INSERT INTO chat_messages (room_id, sender_id, message_text, attachments) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.roomId, req.user.id, text || '', JSON.stringify(attachments || [])]
    );
    const { rows: userRows } = await pool.query(
      'SELECT full_name, username, avatar_url, role FROM users WHERE id = $1',
      [req.user.id]
    );
    const u = userRows[0] || {};
    const msg = {
      ...rows[0],
      full_name: u.full_name || u.username || 'Пользователь',
      username: u.username || '',
      avatar_url: u.avatar_url || null,
      role: u.role || 'user'
    };
    const io = req.app.get('io');
    if (io) {
      io.to(`room_${req.params.roomId}`).emit('new-message', msg);
    }
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Получить список всех диалогов текущего пользователя
router.get('/chats', authenticateToken, async (req, res) => {
  try {
    // 1. Все пользователи (для создания ЛС 1-на-1) с аватарками
    const { rows: users } = await pool.query(
      'SELECT id, username, role, full_name, avatar_url FROM users WHERE id != $1 ORDER BY full_name ASC, username ASC',
      [req.user.id]
    );
    
    // 2. Общий чат
    const { rows: general } = await pool.query("SELECT id, name, type FROM chat_rooms WHERE type = 'group' LIMIT 1");
    
    res.json({ users, generalChat: general[0] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Получить сообщения комнаты (с avatar_url отправителя)
router.get('/chats/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.id, m.room_id, m.sender_id, m.message_text, m.attachments, m.created_at, u.full_name, u.username, u.avatar_url, u.role
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = $1
      ORDER BY m.created_at ASC
      LIMIT 250
    `, [req.params.roomId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Получить или создать ЛС с конкретным пользователем
router.post('/chats/direct', authenticateToken, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    
    // Ищем существующую комнату 1-на-1 между этими пользователями
    const { rows: existing } = await pool.query(`
      SELECT r.id 
      FROM chat_rooms r
      JOIN chat_members m1 ON m1.room_id = r.id AND m1.user_id = $1
      JOIN chat_members m2 ON m2.room_id = r.id AND m2.user_id = $2
      WHERE r.type = 'direct'
      LIMIT 1
    `, [req.user.id, targetUserId]);

    if (existing.length > 0) {
      return res.json({ roomId: existing[0].id });
    }

    // Если комнаты нет — создаем
    const { rows: newRoom } = await pool.query("INSERT INTO chat_rooms (type) VALUES ('direct') RETURNING id");
    const roomId = newRoom[0].id;

    await pool.query('INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2), ($1, $3)', [roomId, req.user.id, targetUserId]);
    res.json({ roomId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
