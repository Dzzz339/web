import { pool } from '../config/db.js';
import { createNotification, sendEmail } from '../services/notifications.js';

// Авто-создание «Общего чата» компании при старте
export async function ensureGeneralChat() {
  try {
    const { rows } = await pool.query("SELECT id FROM chat_rooms WHERE type = 'group' AND name = 'Общий чат'");
    if (rows.length === 0) {
      await pool.query("INSERT INTO chat_rooms (name, type) VALUES ('Общий чат', 'group')");
      console.log('[Chat] Создан Общий чат компании');
    }
  } catch(e) { console.error('General chat error:', e.message); }
}

export function setupChatSocket(io) {
  // WebSockets подсоединение и умная адресация
  io.on('connection', (socket) => {
    
    // При подключении привязываем сокет к персональному каналу пользователя
    socket.on('init-user', async (userId) => {
      if (!userId) return;
      socket.userId = userId;
      socket.join(`user_${userId}`); // Личный канал пользователя (например, user_3)

      // Автоматически подключаем пользователя ко всем его комнатам
      try {
        const { rows } = await pool.query('SELECT room_id FROM chat_members WHERE user_id = $1', [userId]);
        rows.forEach(r => socket.join(`room_${r.room_id}`));
        
        const { rows: gen } = await pool.query("SELECT id FROM chat_rooms WHERE type = 'group' LIMIT 1");
        if (gen.length) socket.join(`room_${gen[0].id}`);
      } catch(e) {}
    });

    socket.on('join-room', (roomId) => {
      if (roomId) socket.join(`room_${roomId}`);
    });

    // Отправка сообщения
    socket.on('send-message', async (data) => {
      if (!data.text || !data.roomId || !data.senderId) return;

      try {
        // 1. Сохраняем сообщение в базу
        const { rows } = await pool.query(
          'INSERT INTO chat_messages (room_id, sender_id, message_text) VALUES ($1, $2, $3) RETURNING *',
          [data.roomId, data.senderId, data.text]
        );
        
        const { rows: userRows } = await pool.query('SELECT full_name, username, avatar_url FROM users WHERE id = $1', [data.senderId]);
        const sender = userRows[0] || {};
        const senderName = sender.full_name || sender.username || 'Пользователь';

        const msg = {
          ...rows[0],
          full_name: senderName,
          username: sender.username || '',
          avatar_url: sender.avatar_url || null
        };

        // 2. Отправляем сообщение в комнату чата по WebSockets
        io.to(`room_${data.roomId}`).emit('new-message', msg);

        // 3. Если это личный диалог (1-на-1) — отправляем получателю Email и Колокольчик
        const { rows: roomRows } = await pool.query('SELECT type FROM chat_rooms WHERE id = $1', [data.roomId]);
        
        if (roomRows.length > 0 && roomRows[0].type === 'direct') {
          // Находим получателя (того, кто НЕ является отправителем)
          const { rows: recipients } = await pool.query(`
            SELECT u.id, u.email, u.full_name 
            FROM chat_members cm 
            JOIN users u ON u.id = cm.user_id 
            WHERE cm.room_id = $1 AND cm.user_id != $2
          `, [data.roomId, data.senderId]);

          recipients.forEach(recipient => {
            // А. Создаем уведомление в Колокольчик 🔔
            createNotification(
              recipient.id,
              `💬 Сообщение от ${senderName}`,
              data.text.slice(0, 90),
              'chat'
            );

            // Б. Отправляем Email (если у получателя указан адрес)
            if (recipient.email) {
              sendEmail({
                to: recipient.email,
                subject: `💬 Новое сообщение от ${senderName}`,
                html: `
                  <div style="font-family: 'Golos Text', sans-serif, Arial; max-width: 500px; padding: 24px; background: #FFF4EE; border-radius: 12px; border: 1px solid #FFEDD5;">
                    <h3 style="color: #FF6200; margin-top: 0;">Новое сообщение от ${senderName}</h3>
                    <div style="font-size: 14px; color: #333; background: #ffffff; padding: 14px; border-radius: 8px; border: 1px solid #E4E4E7; margin: 12px 0;">
                      "${data.text}"
                    </div>
                    <br>
                    <a href="https://app.stockeasy.ru" style="display: inline-block; background: #FF6200; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Ответить в Stockeasy</a>
                  </div>
                `
              });
            }
          });
        }
      } catch(e) { console.error('Socket message error:', e.message); }
    });
  });
}
