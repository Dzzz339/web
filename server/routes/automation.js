import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { createNotification, sendEmail } from '../services/notifications.js';

const router = express.Router();

// ── 1. Отправка сообщения человеку в личный чат из сценария автоматизации ──────
router.post('/send-chat', authenticateToken, async (req, res) => {
  const { targetUserId, targetUserName, text, taskId } = req.body || {};
  const msgText = (text || '').trim();
  if (!msgText) return res.status(400).json({ error: 'Текст сообщения не указан' });

  try {
    let recipientId = targetUserId;

    // Если передан username или имя исполнителя (например, из поля assignee)
    if (!recipientId && targetUserName) {
      const { rows: uRows } = await pool.query(
        `SELECT id FROM users 
         WHERE LOWER(full_name) = LOWER($1) OR LOWER(username) = LOWER($1) 
         LIMIT 1`,
        [targetUserName.trim()]
      );
      if (uRows.length > 0) recipientId = uRows[0].id;
    }

    // Если получатель не найден по точному совпадению, пробуем поиск по LIKE
    if (!recipientId && targetUserName) {
      const { rows: uRows } = await pool.query(
        `SELECT id FROM users 
         WHERE full_name ILIKE $1 OR username ILIKE $1 
         LIMIT 1`,
        [`%${targetUserName.trim()}%`]
      );
      if (uRows.length > 0) recipientId = uRows[0].id;
    }

    if (!recipientId) {
      return res.status(404).json({ error: `Пользователь "${targetUserName || targetUserId}" не найден в системе` });
    }

    // Ищем или создаем личный чат 1-на-1 между отправителем (админ) и получателем
    let roomId = null;
    const { rows: existing } = await pool.query(`
      SELECT r.id 
      FROM chat_rooms r
      JOIN chat_members m1 ON m1.room_id = r.id AND m1.user_id = $1
      JOIN chat_members m2 ON m2.room_id = r.id AND m2.user_id = $2
      WHERE r.type = 'direct'
      LIMIT 1
    `, [req.user.id, recipientId]);

    if (existing.length > 0) {
      roomId = existing[0].id;
    } else {
      const { rows: newRoom } = await pool.query("INSERT INTO chat_rooms (type) VALUES ('direct') RETURNING id");
      roomId = newRoom[0].id;
      await pool.query('INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2), ($1, $3)', [roomId, req.user.id, recipientId]);
    }

    // Добавляем префикс автоматизации если есть заявка
    const finalMsg = (taskId ? `[⚡ Автоматизация по заявке #${taskId}]\n` : '') + msgText;

    // Вставляем сообщение
    const { rows: msgRows } = await pool.query(
      'INSERT INTO chat_messages (room_id, sender_id, message_text) VALUES ($1, $2, $3) RETURNING *',
      [roomId, req.user.id, finalMsg]
    );

    // Оповещаем через WebSockets
    const io = req.app.get('io');
    if (io) {
      const { rows: senderRows } = await pool.query('SELECT full_name, username, avatar_url FROM users WHERE id = $1', [req.user.id]);
      const sender = senderRows[0] || {};
      const msgObj = {
        ...msgRows[0],
        full_name: sender.full_name || sender.username || 'Стоки (Автоматизация)',
        username: sender.username || '',
        avatar_url: sender.avatar_url || null
      };
      io.to(`room_${roomId}`).emit('new-message', msgObj);
      io.to(`user_${recipientId}`).emit('unread-badge');
    }

    // Создаем колокольчик-уведомление
    await createNotification(
      recipientId,
      'Новое сообщение по заявке',
      finalMsg.slice(0, 140),
      taskId ? `#card/${taskId}` : '#chat'
    );

    res.json({ success: true, roomId, recipientId });
  } catch (e) {
    console.error('[Automation send-chat error]:', e);
    res.status(500).json({ error: e.message || 'Ошибка отправки сообщения' });
  }
});

// ── 2. Отправка email о просрочке / статусе из сценария ────────────────────────
router.post('/send-email', authenticateToken, async (req, res) => {
  const { to, subject, html, text, taskId } = req.body || {};
  let targetEmail = (to || '').trim();

  try {
    // Если в "to" передано имя пользователя или подрядчика, находим email в базе
    if (!targetEmail.includes('@') && targetEmail) {
      const { rows: uRows } = await pool.query(
        `SELECT email FROM users 
         WHERE LOWER(full_name) = LOWER($1) OR LOWER(username) = LOWER($1) OR email ILIKE $1
         LIMIT 1`,
        [targetEmail]
      );
      if (uRows.length > 0 && uRows[0].email) {
        targetEmail = uRows[0].email;
      }
    }

    // Если email так и не найден, пробуем взять email ответственного из заявки
    if (!targetEmail && taskId) {
      const { rows: tRows } = await pool.query('SELECT assignee FROM tasks WHERE id = $1', [taskId]);
      if (tRows.length > 0 && tRows[0].assignee) {
        const { rows: uRows } = await pool.query(
          `SELECT email FROM users WHERE LOWER(full_name) = LOWER($1) OR LOWER(username) = LOWER($1) LIMIT 1`,
          [tRows[0].assignee]
        );
        if (uRows.length > 0 && uRows[0].email) targetEmail = uRows[0].email;
      }
    }

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ error: `Не найден email адрес для отправки: "${to || ''}"` });
    }

    const emailSubject = subject || (taskId ? `⚠️ Уведомление по заявке #${taskId}` : 'Уведомление Stockeasy');
    const emailBody = html || `
      <div style="font-family:sans-serif; padding:16px; color:#1f2937;">
        <h2 style="color:#ea580c; margin-top:0;">⚡ Уведомление Stockeasy Automation</h2>
        <p style="font-size:15px; line-height:1.5;">${(text || '').replace(/\n/g, '<br>')}</p>
        ${taskId ? `<div style="margin-top:16px; padding:12px; background:#f3f4f6; border-radius:8px;">Заявка в системе: <strong>#${taskId}</strong></div>` : ''}
        <hr style="margin-top:24px; border:none; border-top:1px solid #e5e7eb;">
        <div style="font-size:12px; color:#9ca3af;">Письмо сформировано автоматически сервисом сценариев Stockeasy.</div>
      </div>
    `;

    const result = await sendEmail({
      to: targetEmail,
      subject: emailSubject,
      html: emailBody
    });

    res.json({ success: true, sentTo: targetEmail, result });
  } catch (e) {
    console.error('[Automation send-email error]:', e);
    res.status(500).json({ error: e.message || 'Ошибка отправки email' });
  }
});

// ── 3. Создание системного колокольчик-уведомления ─────────────────────────────
router.post('/notify', authenticateToken, async (req, res) => {
  const { userId, userName, title, body, link, taskId } = req.body || {};

  try {
    let targetId = userId;
    if (!targetId && userName) {
      const { rows } = await pool.query(
        `SELECT id FROM users WHERE LOWER(full_name) = LOWER($1) OR LOWER(username) = LOWER($1) LIMIT 1`,
        [userName.trim()]
      );
      if (rows.length > 0) targetId = rows[0].id;
    }

    if (!targetId) targetId = req.user.id; // по умолчанию текущему пользователю

    await createNotification(
      targetId,
      title || (taskId ? `Заявка #${taskId}` : 'Сценарий автоматизации'),
      body || 'Успешно обработано сценарием',
      link || (taskId ? `#card/${taskId}` : null)
    );

    res.json({ success: true, targetId });
  } catch (e) {
    console.error('[Automation notify error]:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
