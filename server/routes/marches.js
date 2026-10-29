import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// ─── СПИСОК МАРШРУТОВ ────────────────────────────────────────────────────────
router.get('/marches', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM marches ORDER BY created_at DESC');
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      baseCity: r.base_city || '',
      kmRate: Number(r.km_rate) || 70,
      contractorId: r.contractor_id || null,
      contractorName: r.contractor_name || '',
      status: r.status || 'draft',
      startDate: r.start_date || null,
      endDate: r.end_date || null,
      params: r.params || {},
      points: Array.isArray(r.points) ? r.points : [],
      createdAt: r.created_at
    })));
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// ─── СОЗДАНИЕ МАРШРУТА ───────────────────────────────────────────────────────
router.post('/marches', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
  try {
    const id = 'march_' + Date.now();
    const kmRate = Math.max(0, Number(req.body.kmRate) || 70);
    const params = req.body.params || {
      perDiemRate: 700,
      lodgingRate: 0,
      avgSpeed: 70,
      workHoursPerPoint: 2,
      returnToBase: true
    };

    const { rows } = await pool.query(
      `INSERT INTO marches (
        id, name, base_city, km_rate, contractor_id, contractor_name, status, start_date, end_date, params, points
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        id,
        req.body.name || 'Новый маршрут',
        req.body.baseCity || '',
        kmRate,
        req.body.contractorId || null,
        req.body.contractorName || '',
        req.body.status || 'draft',
        req.body.startDate || null,
        req.body.endDate || null,
        JSON.stringify(params),
        JSON.stringify(req.body.points || [])
      ]
    );
    const r = rows[0];
    res.json({
      id: r.id,
      name: r.name,
      baseCity: r.base_city,
      kmRate: Number(r.km_rate),
      contractorId: r.contractor_id,
      contractorName: r.contractor_name,
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date,
      params: r.params || {},
      points: r.points || [],
      createdAt: r.created_at
    });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// ─── ОБНОВЛЕНИЕ МАРШРУТА ─────────────────────────────────────────────────────
router.put('/marches/:id', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
  try {
    const d = req.body;
    const kmRate = d.kmRate !== undefined && d.kmRate !== null ? Math.max(0, Number(d.kmRate)) : null;

    await pool.query(`
      UPDATE marches SET
        name            = COALESCE($2, name),
        base_city       = COALESCE($3, base_city),
        km_rate         = COALESCE($4::numeric, km_rate),
        contractor_id   = CASE WHEN $5::text = 'null' THEN NULL WHEN $5 IS NOT NULL THEN $5::integer ELSE contractor_id END,
        contractor_name = COALESCE($6, contractor_name),
        status          = COALESCE($7, status),
        start_date      = COALESCE($8::date, start_date),
        end_date        = COALESCE($9::date, end_date),
        params          = CASE WHEN $10::jsonb IS NOT NULL THEN COALESCE(params, '{}'::jsonb) || $10::jsonb ELSE params END,
        points          = COALESCE($11::jsonb, points)
      WHERE id = $1
    `, [
      req.params.id,
      d.name !== undefined ? d.name : null,
      d.baseCity !== undefined ? d.baseCity : null,
      kmRate,
      d.contractorId !== undefined ? (d.contractorId === null ? 'null' : d.contractorId) : null,
      d.contractorName !== undefined ? d.contractorName : null,
      d.status !== undefined ? d.status : null,
      d.startDate || null,
      d.endDate || null,
      d.params !== undefined ? JSON.stringify(d.params) : null,
      d.points !== undefined ? JSON.stringify(d.points) : null
    ]);

    res.json({ success: true });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// ─── УДАЛЕНИЕ МАРШРУТА ───────────────────────────────────────────────────────
router.delete('/marches/:id', authenticateToken, requireRole('admin', 'director', 'manager'), async (req, res) => {
  try {
    await pool.query('DELETE FROM marches WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// ─── ПРЕДЗАГРУЗКА ДАННЫХ ЗАЯВКИ ДЛЯ ТОЧКИ МАРШРУТА ─────────────────────────
router.get('/marches/task-data/:taskId', authenticateToken, async (req, res) => {
  try {
    const { rows: tRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.taskId]);
    if (!tRows.length) return res.status(404).json({ error: 'Заявка не найдена' });
    const t = tRows[0];

    // Сумма материалов по заявке (фактический расход или плановый)
    const { rows: mRows } = await pool.query(`
      SELECT COALESCE(SUM(COALESCE(fact_qty, plan_qty, 0) * 100), 0) as mat_calc
      FROM task_materials WHERE task_id = $1
    `, [req.params.taskId]);
    const matSum = Number(mRows[0]?.mat_calc) || Number(t.tmc) || 0;

    res.json({
      taskId: t.id,
      address: t.address || '',
      region: t.region || '',
      workType: t.work_type || 'СКС',
      ports: Number(t.fact) || Number(t.in_order) || 1,
      pricePerUnit: Number(t.price_per_unit) || 0,
      amount: Number(t.amount) || 0,
      tmc: matSum,
      contractor: t.contractor || t.assignee || '',
      distanceKm: Number(t.distance_km) || 0,
      customer: t.customer || 'ПАО Сбербанк'
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
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
