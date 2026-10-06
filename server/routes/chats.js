import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadAttachment, fixUtf8Filename } from '../middleware/upload.js';
import { createNotification } from '../services/notifications.js';

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

    // Авто-добавление участников по умолчанию: создатель, менеджер, исполнитель
    const { rows: taskRow } = await pool.query('SELECT manager, assignee FROM tasks WHERE id = $1', [taskId]);
    const t = taskRow[0] || {};
    const defaultNames = [t.manager, t.assignee].filter(Boolean);

    let initialUserIds = [req.user.id];
    if (defaultNames.length > 0) {
      const { rows: defUsers } = await pool.query('SELECT id FROM users WHERE full_name = ANY($1)', [defaultNames]);
      defUsers.forEach(u => initialUserIds.push(u.id));
    }

    for (const uid of initialUserIds) {
      await pool.query(
        'INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [room.id, uid]
      );
    }

    // Сообщения
    const { rows: messages } = await pool.query(`
      SELECT m.id, m.room_id, m.sender_id, m.message_text, m.attachments, m.created_at,
             u.full_name, u.username, u.avatar_url, u.role
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = $1
      ORDER BY m.created_at ASC
      LIMIT 250
    `, [room.id]);

    // Участники
    const { rows: members } = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, u.role
      FROM chat_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.room_id = $1
      ORDER BY u.full_name ASC
    `, [room.id]);

    res.json({ room, messages, members });
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
    
    // 3. Чаты по заявкам (комнаты type = 'task')
    let taskRoomsQuery;
    let taskParams;
    if (['admin', 'director'].includes(req.user.role)) {
      taskRoomsQuery = `
        SELECT r.id, r.name, r.type, r.task_id, r.created_at,
               t.address, t.status, t.region, t.macro_status,
               (SELECT COUNT(*)::int FROM chat_members WHERE room_id = r.id) AS members_count,
               lm.message_text AS last_message_text,
               lm.created_at AS last_message_time,
               lm.sender_name AS last_message_sender
        FROM chat_rooms r
        LEFT JOIN tasks t ON t.id = r.task_id
        LEFT JOIN LATERAL (
          SELECT m.message_text, m.created_at, COALESCE(u.full_name, u.username) AS sender_name
          FROM chat_messages m
          LEFT JOIN users u ON u.id = m.sender_id
          WHERE m.room_id = r.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) lm ON true
        WHERE r.type = 'task'
        ORDER BY COALESCE(lm.created_at, r.created_at) DESC
        LIMIT 100
      `;
      taskParams = [];
    } else {
      taskRoomsQuery = `
        SELECT r.id, r.name, r.type, r.task_id, r.created_at,
               t.address, t.status, t.region, t.macro_status,
               (SELECT COUNT(*)::int FROM chat_members WHERE room_id = r.id) AS members_count,
               lm.message_text AS last_message_text,
               lm.created_at AS last_message_time,
               lm.sender_name AS last_message_sender
        FROM chat_rooms r
        JOIN chat_members cm ON cm.room_id = r.id AND cm.user_id = $1
        LEFT JOIN tasks t ON t.id = r.task_id
        LEFT JOIN LATERAL (
          SELECT m.message_text, m.created_at, COALESCE(u.full_name, u.username) AS sender_name
          FROM chat_messages m
          LEFT JOIN users u ON u.id = m.sender_id
          WHERE m.room_id = r.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) lm ON true
        WHERE r.type = 'task'
        ORDER BY COALESCE(lm.created_at, r.created_at) DESC
        LIMIT 100
      `;
      taskParams = [req.user.id];
    }
    const { rows: taskChats } = await pool.query(taskRoomsQuery, taskParams);

    res.json({ users, generalChat: general[0] || null, taskChats });
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

// Получить список участников комнаты
router.get('/chats/:roomId/members', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, u.role
      FROM chat_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.room_id = $1
      ORDER BY u.full_name ASC
    `, [req.params.roomId]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Добавить участника в комнату чата
router.post('/chats/:roomId/members', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Пользователь не указан' });

    const { rows: roomRows } = await pool.query('SELECT * FROM chat_rooms WHERE id = $1', [req.params.roomId]);
    const room = roomRows[0];
    if (!room) return res.status(404).json({ error: 'Комната чата не найдена' });

    const { rows: userRows } = await pool.query('SELECT id, full_name, username, role, avatar_url FROM users WHERE id = $1', [userId]);
    const targetUser = userRows[0];
    if (!targetUser) return res.status(404).json({ error: 'Пользователь не найден' });

    await pool.query(
      'INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [room.id, userId]
    );

    const adderName = req.user.full_name || req.user.username || 'Коллега';
    const targetName = targetUser.full_name || targetUser.username;

    // Уведомление добавленному пользователю в колокольчик 🔔
    createNotification(
      userId,
      `💬 Вас добавили в чат заявки ${room.task_id || ''}`,
      `${adderName} добавил(а) вас в обсуждение`,
      room.task_id || 'chat'
    );

    // Системное сообщение в чат
    const sysText = `➕ ${adderName} добавил(а) в чат: ${targetName}`;
    const { rows: msgRows } = await pool.query(
      'INSERT INTO chat_messages (room_id, sender_id, message_text, attachments) VALUES ($1, $2, $3, $4) RETURNING *',
      [room.id, req.user.id, sysText, JSON.stringify([])]
    );

    const io = req.app.get('io');
    if (io) {
      const msg = {
        ...msgRows[0],
        full_name: 'Система',
        username: 'system',
        avatar_url: null,
        role: 'system'
      };
      io.to(`room_${room.id}`).emit('new-message', msg);
      io.to(`user_${userId}`).emit('added-to-room', { roomId: room.id, taskId: room.task_id });
    }

    res.json({ success: true, member: targetUser });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Удалить участника из комнаты
router.delete('/chats/:roomId/members/:userId', authenticateToken, async (req, res) => {
  try {
    const { roomId, userId } = req.params;
    const { rows: roomRows } = await pool.query('SELECT * FROM chat_rooms WHERE id = $1', [roomId]);
    const room = roomRows[0];
    if (!room) return res.status(404).json({ error: 'Комната чата не найдена' });

    const role = String(req.user?.role || '').toLowerCase();
    const isSelf = Number(req.user.id) === Number(userId);
    const isPrivileged = ['admin', 'director', 'manager'].includes(role) || (room.created_by && Number(room.created_by) === Number(req.user.id));
    if (!isSelf && !isPrivileged) {
      return res.status(403).json({ error: 'Недостаточно прав для удаления участников из чата' });
    }

    const { rows: userRows } = await pool.query('SELECT id, full_name, username FROM users WHERE id = $1', [userId]);
    const targetUser = userRows[0];

    await pool.query('DELETE FROM chat_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);

    if (targetUser) {
      const removerName = req.user.full_name || req.user.username || 'Коллега';
      const targetName = targetUser.full_name || targetUser.username;
      const sysText = `➖ ${removerName} удалил(а) из чата: ${targetName}`;
      const { rows: msgRows } = await pool.query(
        'INSERT INTO chat_messages (room_id, sender_id, message_text, attachments) VALUES ($1, $2, $3, $4) RETURNING *',
        [room.id, req.user.id, sysText, JSON.stringify([])]
      );
      const io = req.app.get('io');
      if (io) {
        io.to(`room_${room.id}`).emit('new-message', {
          ...msgRows[0],
          full_name: 'Система',
          username: 'system',
          avatar_url: null,
          role: 'system'
        });
      }
    }

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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

