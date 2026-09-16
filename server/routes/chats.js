import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

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
      SELECT m.id, m.room_id, m.sender_id, m.message_text, m.created_at, u.full_name, u.username, u.avatar_url
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = $1
      ORDER BY m.created_at ASC
      LIMIT 150
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
