import { pool } from '../config/db.js';

export async function createNotification(userId, title, body, link) {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)',
      [userId, title, body || '', link || null]
    );
  } catch(e) { console.error('Notification creation error:', e.message); }
}

export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Stockeasy <robot@stockeasy.ru>',
        to: [to],
        subject: subject,
        html: html
      })
    });
    const data = await res.json();
    console.log('[Email Sent]:', data);
    return data;
  } catch (e) {
    console.error('[Email Error]:', e.message);
  }
}
