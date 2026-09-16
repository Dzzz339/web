import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/marches', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM marches ORDER BY created_at');
    res.json(rows.map(r => ({
      id: r.id, name: r.name, baseCity: r.base_city,
      kmRate: Number(r.km_rate), points: r.points || [], createdAt: r.created_at
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/marches', async (req, res) => {
  try {
    const id = 'march_' + Date.now();
    const { rows } = await pool.query(
      `INSERT INTO marches (id, name, base_city, km_rate) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, req.body.name||'Новый маршрут', req.body.baseCity||'', Number(req.body.kmRate)||70]
    );
    const r = rows[0];
    res.json({ id: r.id, name: r.name, baseCity: r.base_city, kmRate: Number(r.km_rate), points: [], createdAt: r.created_at });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/marches/:id', authenticateToken, async (req, res) => {
  try {
    const d = req.body;
    await pool.query(`
      UPDATE marches SET
        name      = COALESCE($2, name),
        base_city = COALESCE($3, base_city),
        km_rate   = COALESCE($4::numeric, km_rate),
        points    = COALESCE($5::jsonb, points)
      WHERE id = $1
    `, [req.params.id, d.name||null, d.baseCity||null, d.kmRate ? Number(d.kmRate) : null,
        d.points !== undefined ? JSON.stringify(d.points) : null]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/marches/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM marches WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── API: ГЕОКОДИРОВАНИЕ ──────────────────────────────────────────────────────
router.get('/geocode', authenticateToken, async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&accept-language=ru&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Stockeasy/1.0 (internal logistics app)', 'Accept-Language': 'ru' } });
    res.json(await r.json());
  } catch(e) { res.json([]); }
});

// ─── API: OSRM МАРШРУТ ───────────────────────────────────────────────────────
router.get('/route', authenticateToken, async (req, res) => {
  const coords = req.query.coords;
  if (!coords) return res.status(400).json({ error: 'coords required' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Stockeasy/1.0' } });
    const data = await r.json();
    if (!data.routes?.[0]) return res.json({ error: 'no route' });
    const route = data.routes[0];
    res.json({ distance_km: Math.round(route.distance/100)/10, duration_min: Math.round(route.duration/60), geometry: route.geometry });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;
