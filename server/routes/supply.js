import express from 'express';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadAttachment } from '../middleware/upload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const SCRIPTS_DIR = path.join(__dirname, '../scripts');

const router = express.Router();

function getPythonCommand() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  return process.platform === 'win32' ? 'py' : 'python3';
}

// ─── ФОРМУЛЬНЫЙ РАСЧЕТ МАТЕРИАЛОВ ПО ЧЕК-ЛИСТУ (ТИПОВИК СБЕРА) ───────────────
export function calculateChecklistMaterials(checklist) {
  const ports = Math.max(1, parseInt(checklist.ports_install) || parseInt(checklist.ports_install_qty) || parseInt(checklist.ports_move) || 1);
  const ceilingHeight = parseFloat(checklist.ceiling_height) || (checklist.ceiling_height_mm ? checklist.ceiling_height_mm / 1000 : 2.5) || 2.5;
  const surfaceType = (checklist.surface_type || checklist.mount_surface || '').toLowerCase();
  const socketSurface = (checklist.socket_surface || checklist.outlet_surface || '').toLowerCase();
  const addChannel = Boolean(checklist.add_cable_channel_needed || checklist.trunking_install_needed);
  const addChannelMeters = parseFloat(checklist.add_cable_channel_meters || checklist.trunking_install_meters) || 0;
  const patchPanelNeeded = Boolean(checklist.patch_panel_needed || checklist.patch_panel_install_needed);

  // Горизонтальная трасса: Армстронг ~15м, лоток/бетон ~20м, стандарт ~18м
  let horizontal = 18;
  if (surfaceType.includes('армстронг') || surfaceType.includes('фальш')) horizontal = 15;
  else if (surfaceType.includes('лоток') || surfaceType.includes('бетон')) horizontal = 20;

  const slack = 3; // технологический запас (1м + 2м)
  const cablePerPort = Math.round((ceilingHeight * 2) + horizontal + slack);
  const totalCable = ports * cablePerPort;

  const items = [];

  // Кабель
  items.push({
    code: 'CABLE-UTP-5E-CU',
    name: 'Кабель UTP 4 пары Cat.5e Cu (бухта 305м)',
    quantity: totalCable,
    unit: 'м',
    calc_details: `${ports} порт(ов) × (${ceilingHeight * 2}м спуск/подъем + ${horizontal}м горизонт + ${slack}м запас) = ${totalCable} м`
  });

  // Модули Keystone
  items.push({
    code: 'KEYSTONE-RJ45-5E',
    name: 'Модуль Keystone RJ-45 Cat.5e UTP',
    quantity: ports,
    unit: 'шт',
    calc_details: `По 1 шт на каждый порт (${ports} шт)`
  });

  // Патч-корды 2м (к рабочим местам)
  items.push({
    code: 'PATCH-CORD-2M',
    name: 'Патч-корд UTP Cat.5e 2.0м',
    quantity: ports,
    unit: 'шт',
    calc_details: `По 1 шт на каждое рабочее место (${ports} шт)`
  });

  // Патч-корды 1м (коммутационные в шкаф)
  items.push({
    code: 'PATCH-CORD-1M',
    name: 'Патч-корд UTP Cat.5e 1.0м',
    quantity: ports,
    unit: 'шт',
    calc_details: `По 1 шт для кроссировки в шкафу (${ports} шт)`
  });

  // Розетки / лицевые панели
  if (socketSurface.includes('стол') || socketSurface.includes('накладн') || socketSurface.includes('короб')) {
    items.push({
      code: 'SURFACE-BOX-1P',
      name: 'Коробка накладная 1 порт RJ-45',
      quantity: ports,
      unit: 'шт',
      calc_details: `Установка "${socketSurface || 'в столе/накладная'}" — коробка на каждый порт (${ports} шт)`
    });
  } else {
    items.push({
      code: 'FACEPLATE-1P',
      name: 'Лицевая панель / рамка суппорта 1 порт',
      quantity: ports,
      unit: 'шт',
      calc_details: `Лицевая рамка суппорта на каждый порт (${ports} шт)`
    });
  }

  // Гофра ф16 (если монтаж за потолком или без кабель-канала)
  const conduitMeters = Math.round(totalCable * 0.7);
  items.push({
    code: 'CORRUGATED-16',
    name: 'Труба гофрированная ПВХ ф16 с протяжкой',
    quantity: conduitMeters,
    unit: 'м',
    calc_details: `70% от длины кабельной трассы (${totalCable}м × 0.7 = ${conduitMeters} м)`
  });

  // Дополнительный кабель-канал (если заявлено в чек-листе)
  if (addChannel && addChannelMeters > 0) {
    items.push({
      code: 'CABLE-TRUNK-40X25',
      name: 'Кабель-канал 40х25 мм с крышкой (хлыст 2м)',
      quantity: Math.ceil(addChannelMeters),
      unit: 'м',
      calc_details: `По чек-листу обследования: ${addChannelMeters} м`
    });
  }

  // Патч-панель (если требуется по чек-листу)
  if (patchPanelNeeded) {
    items.push({
      code: 'PATCH-PANEL-24',
      name: 'Патч-панель 19" 1U 24 порта Cat.5e',
      quantity: 1,
      unit: 'шт',
      calc_details: `Требуется установка новой патч-панели по чек-листу (1 шт)`
    });
    items.push({
      code: 'CABLE-ORG-1U',
      name: 'Кабельный органайзер 19" 1U',
      quantity: 1,
      unit: 'шт',
      calc_details: `Органайзер в стойку под новую патч-панель (1 шт)`
    });
  }

  // Маркировка
  items.push({
    code: 'MARKING-LABEL',
    name: 'Маркировочные этикетки / бирки',
    quantity: ports * 2,
    unit: 'шт',
    calc_details: `По 2 бирки на порт (порт + кабель) = ${ports * 2} шт`
  });

  return items;
}

// Запуск Python парсера чек-листа PDF
function runChecklistParser(filePath) {
  return new Promise((resolve, reject) => {
    const pythonCommand = getPythonCommand();
    const scriptPath = path.join(SCRIPTS_DIR, 'parse_checklist.py');
    const py = spawn(pythonCommand, [scriptPath, filePath]);
    let result = '';
    let errorOutput = '';

    py.on('error', (err) => reject(new Error(`Не удалось запустить парсер чек-листа: ${err.message}`)));
    py.stdout.on('data', (d) => { result += d.toString('utf-8'); });
    py.stderr.on('data', (d) => { errorOutput += d.toString('utf-8'); });

    py.on('close', (code) => {
      if (code !== 0) {
        console.error(`[PDF Parser] exit code ${code}: ${errorOutput}`);
        return reject(new Error('Ошибка разбора чек-листа PDF: ' + (errorOutput || code)));
      }
      try {
        const parsed = JSON.parse(result);
        if (parsed.error) return reject(new Error(parsed.error));
        resolve(parsed);
      } catch (e) {
        reject(new Error('Невалидный JSON от парсера чек-листа: ' + result.slice(0, 200)));
      }
    });
  });
}

// Запуск Python CP-SAT оптимизатора
function runSupplyOptimizer(data) {
  return new Promise((resolve, reject) => {
    const pythonCommand = getPythonCommand();
    const scriptPath = path.join(SCRIPTS_DIR, 'optimizer.py');
    const py = spawn(pythonCommand, [scriptPath]);
    let result = '';
    let errorOutput = '';

    py.on('error', (err) => reject(new Error(`Не удалось запустить CP-SAT оптимизатор: ${err.message}`)));
    py.stdin.on('error', (err) => console.error('[CP-SAT] Stdin error:', err.message));

    try {
      py.stdin.write(JSON.stringify(data));
      py.stdin.end();
    } catch (e) {
      console.error('[CP-SAT] Write error:', e);
    }

    py.stdout.on('data', (d) => { result += d.toString('utf-8'); });
    py.stderr.on('data', (d) => { errorOutput += d.toString('utf-8'); });

    py.on('close', (code) => {
      if (code !== 0) {
        console.error(`[CP-SAT] exit code ${code}: ${errorOutput}`);
        return reject(new Error('Ошибка работы оптимизатора CP-SAT: ' + (errorOutput || code)));
      }
      try {
        const parsed = JSON.parse(result);
        if (!parsed.success) return reject(new Error(parsed.error || 'Ошибка оптимизации'));
        resolve(parsed);
      } catch (e) {
        reject(new Error('Невалидный JSON от CP-SAT: ' + result.slice(0, 200)));
      }
    });
  });
}

// ─── 1. МАТЕРИАЛЫ ────────────────────────────────────────────────────────────

// GET /api/materials
router.get('/materials', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM materials WHERE is_active = true ORDER BY category ASC, name ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/materials
router.post('/materials', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    const { code, name, category, unit, package_qty, package_unit, price_default, min_stock_alert } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO materials (code, name, category, unit, package_qty, package_unit, price_default, min_stock_alert)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        unit = EXCLUDED.unit,
        package_qty = EXCLUDED.package_qty,
        package_unit = EXCLUDED.package_unit,
        price_default = EXCLUDED.price_default,
        min_stock_alert = EXCLUDED.min_stock_alert
      RETURNING *
    `, [code, name, category, unit || 'шт', package_qty || 1, package_unit || null, price_default || 0, min_stock_alert || 0]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── 2. СКЛАДЫ И ОСТАТКИ ─────────────────────────────────────────────────────

// GET /api/warehouses
router.get('/warehouses', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT w.*, c.name_short AS contractor_name, c.inn AS contractor_inn
      FROM warehouses w
      LEFT JOIN contractors c ON w.contractor_id = c.id
      WHERE w.is_active = true
      ORDER BY 
        CASE w.type WHEN 'central' THEN 1 WHEN 'regional' THEN 2 ELSE 3 END,
        w.name ASC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/warehouses/:id/balances
router.get('/warehouses/:id/balances', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT sb.*, m.code, m.name, m.category, m.unit, m.package_qty, m.package_unit, m.min_stock_alert
      FROM stock_balances sb
      JOIN materials m ON sb.material_id = m.id
      WHERE sb.warehouse_id = $1
      ORDER BY m.category ASC, m.name ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/contractors/:id/warehouse
router.get('/contractors/:id/warehouse', authenticateToken, async (req, res) => {
  try {
    let { rows: whRows } = await pool.query(`
      SELECT * FROM warehouses WHERE contractor_id = $1 AND is_active = true LIMIT 1
    `, [req.params.id]);

    if (whRows.length === 0) {
      const { rows: cRows } = await pool.query('SELECT name_short FROM contractors WHERE id = $1', [req.params.id]);
      if (cRows.length === 0) return res.status(404).json({ error: 'Подрядчик не найден' });
      const { rows: newWh } = await pool.query(
        `INSERT INTO warehouses (name, type, contractor_id) VALUES ($1, 'contractor', $2) RETURNING *`,
        [`Склад ${cRows[0].name_short}`, req.params.id]
      );
      whRows = newWh;
    }

    const warehouse = whRows[0];
    const { rows: balances } = await pool.query(`
      SELECT sb.*, m.code, m.name, m.category, m.unit, m.package_qty, m.package_unit
      FROM stock_balances sb
      JOIN materials m ON sb.material_id = m.id
      WHERE sb.warehouse_id = $1
      ORDER BY m.category ASC, m.name ASC
    `, [warehouse.id]);

    res.json({ warehouse, balances });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── 3. ДВИЖЕНИЕ МАТЕРИАЛОВ (ПРИХОД, ПЕРЕМЕЩЕНИЕ) ───────────────────────────

// POST /api/stock/receipt
router.post('/stock/receipt', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { target_warehouse_id, items, comment, doc_number } = req.body;
    if (!target_warehouse_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Укажите склад и список материалов' });
    }

    const { rows: movRows } = await client.query(`
      INSERT INTO stock_movements (movement_type, target_warehouse_id, status, doc_number, comment, created_by, confirmed_at)
      VALUES ('receipt', $1, 'completed', $2, $3, $4, NOW())
      RETURNING *
    `, [target_warehouse_id, doc_number || null, comment || null, req.user.id]);
    const movement = movRows[0];

    for (const item of items) {
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unit_price) || 0;
      if (qty <= 0) continue;

      await client.query(`
        INSERT INTO stock_movement_items (movement_id, material_id, quantity, unit_price)
        VALUES ($1, $2, $3, $4)
      `, [movement.id, item.material_id, qty, price]);

      await client.query(`
        INSERT INTO stock_balances (warehouse_id, material_id, quantity, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (warehouse_id, material_id) DO UPDATE SET
          quantity = stock_balances.quantity + $3,
          updated_at = NOW()
      `, [target_warehouse_id, item.material_id, qty]);
    }

    await client.query('COMMIT');
    res.json({ success: true, movement });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/stock/transfer
router.post('/stock/transfer', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { source_warehouse_id, target_warehouse_id, items, comment, doc_number } = req.body;
    if (!source_warehouse_id || !target_warehouse_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Укажите склад-источник, склад-получатель и список материалов' });
    }

    const { rows: movRows } = await client.query(`
      INSERT INTO stock_movements (movement_type, source_warehouse_id, target_warehouse_id, status, doc_number, comment, created_by, confirmed_at)
      VALUES ('transfer', $1, $2, 'completed', $3, $4, $5, NOW())
      RETURNING *
    `, [source_warehouse_id, target_warehouse_id, doc_number || null, comment || null, req.user.id]);
    const movement = movRows[0];

    for (const item of items) {
      const qty = parseFloat(item.quantity);
      if (qty <= 0) continue;

      await client.query(`
        INSERT INTO stock_movement_items (movement_id, material_id, quantity)
        VALUES ($1, $2, $3)
      `, [movement.id, item.material_id, qty]);

      // Списание с источника
      await client.query(`
        INSERT INTO stock_balances (warehouse_id, material_id, quantity, updated_at)
        VALUES ($1, $2, -$3, NOW())
        ON CONFLICT (warehouse_id, material_id) DO UPDATE SET
          quantity = stock_balances.quantity - $3,
          updated_at = NOW()
      `, [source_warehouse_id, item.material_id, qty]);

      // Зачисление на склад получателя
      await client.query(`
        INSERT INTO stock_balances (warehouse_id, material_id, quantity, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (warehouse_id, material_id) DO UPDATE SET
          quantity = stock_balances.quantity + $3,
          updated_at = NOW()
      `, [target_warehouse_id, item.material_id, qty]);
    }

    await client.query('COMMIT');
    res.json({ success: true, movement });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ─── 4. ЧЕК-ЛИСТЫ И МАТЕРИАЛЫ ЗАЯВКИ ─────────────────────────────────────────

// GET /api/tasks/:id/checklist
router.get('/tasks/:id/checklist', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM task_checklists WHERE task_id = $1 ORDER BY id DESC LIMIT 1', [req.params.id]);
    res.json(rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/tasks/:id/checklist
router.post('/tasks/:id/checklist', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const c = req.body || {};
    const { rows } = await pool.query(`
      INSERT INTO task_checklists (
        task_id, zno_number, inspection_date, room_name, work_type,
        ports_install, ports_move, ports_dismantle, ports_restore,
        surface_type, socket_surface, ceiling_height,
        has_cable_channel, cable_channel_size, add_cable_channel_needed, add_cable_channel_meters,
        has_tray, has_floor_passage, has_server_room, has_telecom_closet,
        patch_panel_needed, patch_panel_free_num, port_marking, sbs_contact,
        materials_needed, raw_checklist_json
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23, $24,
        $25, $26
      )
      RETURNING *
    `, [
      taskId, c.zno_number || null, c.survey_date || c.inspection_date || null, c.room_name || '1', c.work_type || 'монтаж',
      c.ports_install || c.ports_install_qty || 1, c.ports_move || 0, c.ports_dismantle || 0, c.ports_restore || 0,
      c.surface_type || 'Фальш-потолок(Армстронг)', c.socket_surface || 'в столе', c.ceiling_height || 2.5,
      Boolean(c.has_cable_channel), c.cable_channel_size || null, Boolean(c.add_cable_channel_needed), c.add_cable_channel_meters || 0,
      Boolean(c.has_tray), Boolean(c.has_floor_passage), Boolean(c.has_server_room), Boolean(c.has_telecom_closet),
      Boolean(c.patch_panel_needed), c.patch_panel_free_num || '1', c.port_marking || 'ССМ 1', c.sbs_contact || null,
      Boolean(c.materials_needed), JSON.stringify(c)
    ]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/tasks/:id/materials
router.get('/tasks/:id/materials', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT tm.*, m.code, m.name, m.category, m.unit, m.package_qty, m.package_unit, m.price_default
      FROM task_materials tm
      JOIN materials m ON tm.material_id = m.id
      WHERE tm.task_id = $1
      ORDER BY m.category ASC, m.name ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/tasks/:id/materials/calculate
router.post('/tasks/:id/materials/calculate', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;

    let checklist = req.body.checklist;
    if (!checklist) {
      const { rows: chRows } = await client.query('SELECT * FROM task_checklists WHERE task_id = $1 ORDER BY id DESC LIMIT 1', [taskId]);
      if (chRows.length > 0) checklist = chRows[0];
    }
    if (!checklist) {
      checklist = { ports_install: 1, surface_type: 'Фальш-потолок(Армстронг)', ceiling_height: 2.5, socket_surface: 'в столе' };
    }

    const calculatedItems = calculateChecklistMaterials(checklist);
    const saved = [];

    for (const item of calculatedItems) {
      const { rows: matRows } = await client.query('SELECT id FROM materials WHERE code = $1', [item.code]);
      if (matRows.length === 0) continue;
      const matId = matRows[0].id;

      const { rows: tmRows } = await client.query(`
        INSERT INTO task_materials (task_id, material_id, plan_qty, calc_details, source)
        VALUES ($1, $2, $3, $4, 'template')
        ON CONFLICT (task_id, material_id) DO UPDATE SET
          plan_qty = EXCLUDED.plan_qty,
          calc_details = EXCLUDED.calc_details,
          source = 'template'
        RETURNING *
      `, [taskId, matId, item.quantity, item.calc_details]);

      saved.push({ ...item, material_id: matId, task_material: tmRows[0] });
    }

    await client.query('COMMIT');
    res.json({ success: true, materials: saved });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/tasks/:id/materials/write-off
router.post('/tasks/:id/materials/write-off', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;
    const { items, comment } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Укажите перечень материалов и списанные количества' });
    }

    const { rows: taskRows } = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskRows.length === 0) return res.status(404).json({ error: 'Заявка не найдена' });
    const task = taskRows[0];

    // Находим склад подрядчика
    let warehouseId = null;
    if (req.user.contractor_id) {
      const { rows: wh } = await client.query('SELECT id FROM warehouses WHERE contractor_id = $1 LIMIT 1', [req.user.contractor_id]);
      if (wh.length > 0) warehouseId = wh[0].id;
    }
    if (!warehouseId && task.contractor) {
      const { rows: wh } = await client.query(`
        SELECT w.id FROM warehouses w
        JOIN contractors c ON w.contractor_id = c.id
        WHERE LOWER(c.name_short) = LOWER($1) OR LOWER(c.name_full) = LOWER($1)
        LIMIT 1
      `, [task.contractor.trim()]);
      if (wh.length > 0) warehouseId = wh[0].id;
    }
    if (!warehouseId) {
      const { rows: wh } = await client.query("SELECT id FROM warehouses WHERE type = 'central' LIMIT 1");
      if (wh.length > 0) warehouseId = wh[0].id;
    }

    // Создаем документ движения ТМЦ (task_consumption)
    const { rows: movRows } = await client.query(`
      INSERT INTO stock_movements (movement_type, source_warehouse_id, task_id, status, comment, created_by, confirmed_at)
      VALUES ('task_consumption', $1, $2, 'completed', $3, $4, NOW())
      RETURNING *
    `, [warehouseId, taskId, comment || `Списание по заявке ${taskId}`, req.user.id]);
    const movement = movRows[0];

    for (const item of items) {
      const qty = parseFloat(item.quantity);
      if (isNaN(qty) || qty <= 0) continue;

      await client.query(`
        INSERT INTO stock_movement_items (movement_id, material_id, quantity)
        VALUES ($1, $2, $3)
      `, [movement.id, item.material_id, qty]);

      // Уменьшаем остаток на складе подрядчика
      if (warehouseId) {
        await client.query(`
          INSERT INTO stock_balances (warehouse_id, material_id, quantity, updated_at)
          VALUES ($1, $2, -$3, NOW())
          ON CONFLICT (warehouse_id, material_id) DO UPDATE SET
            quantity = stock_balances.quantity - $3,
            updated_at = NOW()
        `, [warehouseId, item.material_id, qty]);
      }

      // Обновляем факт в task_materials
      await client.query(`
        INSERT INTO task_materials (task_id, material_id, plan_qty, fact_qty, is_written_off, written_off_at)
        VALUES ($1, $2, $3, $3, true, NOW())
        ON CONFLICT (task_id, material_id) DO UPDATE SET
          fact_qty = $3,
          is_written_off = true,
          written_off_at = NOW()
      `, [taskId, item.material_id, qty]);
    }

    await client.query('COMMIT');
    res.json({ success: true, movement_id: movement.id, warehouse_id: warehouseId });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/tasks/:id/materials/reserve
router.post('/tasks/:id/materials/reserve', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;
    const { materials } = req.body;

    if (!materials) return res.status(400).json({ error: 'Нет материалов для резервирования' });

    const { rows: wh } = await client.query("SELECT id FROM warehouses WHERE type = 'central' LIMIT 1");
    const whId = wh[0]?.id || 1;

    const items = Array.isArray(materials) ? materials : Object.entries(materials).map(([name, qty]) => ({ name, qty }));
    const saved = [];

    for (const it of items) {
      const name = (it.name || '').trim();
      const qty = parseFloat(it.qty || it.quantity) || 0;
      if (!name || qty <= 0) continue;

      let { rows: matRows } = await client.query(`
        SELECT id, code, package_qty FROM materials 
        WHERE LOWER(name) LIKE LOWER($1) OR LOWER(code) LIKE LOWER($1)
        LIMIT 1
      `, [`%${name.split(',')[0].slice(0, 15)}%`]);

      let matId;
      if (matRows.length > 0) {
        matId = matRows[0].id;
      } else {
        const code = 'MAT-' + Date.now().toString().slice(-6);
        const { rows: newMat } = await client.query(`
          INSERT INTO materials (code, name, unit, package_qty)
          VALUES ($1, $2, 'шт', 1)
          RETURNING id
        `, [code, name]);
        matId = newMat[0].id;
      }

      await client.query(`
        INSERT INTO task_materials (task_id, material_id, plan_qty, source)
        VALUES ($1, $2, $3, 'ai')
        ON CONFLICT (task_id, material_id) DO UPDATE SET
          plan_qty = EXCLUDED.plan_qty,
          source = 'ai'
      `, [taskId, matId, qty]);

      await client.query(`
        INSERT INTO stock_balances (warehouse_id, material_id, reserved_qty, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (warehouse_id, material_id) DO UPDATE SET
          reserved_qty = stock_balances.reserved_qty + $3,
          updated_at = NOW()
      `, [whId, matId, qty]);

      saved.push({ material_id: matId, name, quantity: qty });
    }

    await client.query('COMMIT');
    res.json({ success: true, reserved: saved });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/checklists/upload
router.post('/checklists/upload', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл PDF не прикреплен' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checklist = await runChecklistParser(req.file.path);
    const taskId = (checklist.zno_number || req.body.task_id || ('ЗнО-' + Date.now())).trim();

    await client.query(`
      INSERT INTO tasks (
        id, address, work_type, in_order, status, stage, contact, 
        supplier_id_uploaded, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'progress', 'survey', $5, true, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        address = COALESCE(NULLIF(tasks.address, ''), EXCLUDED.address),
        work_type = COALESCE(NULLIF(tasks.work_type, ''), EXCLUDED.work_type),
        in_order = CASE WHEN tasks.in_order = 0 THEN EXCLUDED.in_order ELSE tasks.in_order END,
        contact = COALESCE(NULLIF(tasks.contact, ''), EXCLUDED.contact),
        updated_at = NOW()
    `, [
      taskId,
      checklist.address || '',
      checklist.work_type || 'монтаж',
      checklist.ports_install || 1,
      checklist.sbs_contact || ''
    ]);

    await client.query(`
      INSERT INTO task_checklists (
        task_id, zno_number, inspection_date, room_name, work_type,
        ports_install, ports_move, ports_dismantle, ports_restore,
        surface_type, socket_surface, ceiling_height,
        has_cable_channel, cable_channel_size, add_cable_channel_needed, add_cable_channel_meters,
        has_tray, has_floor_passage, has_server_room, has_telecom_closet,
        patch_panel_needed, patch_panel_free_num, port_marking, sbs_contact,
        materials_needed, raw_checklist_json
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23, $24,
        $25, $26
      )
    `, [
      taskId, checklist.zno_number || taskId, null, checklist.room_name || '1', checklist.work_type || 'монтаж',
      checklist.ports_install || 1, checklist.ports_move || 0, checklist.ports_dismantle || 0, checklist.ports_restore || 0,
      checklist.surface_type || 'Фальш-потолок(Армстронг)', checklist.socket_surface || 'в столе', checklist.ceiling_height || 2.5,
      checklist.has_cable_channel, checklist.cable_channel_size || null, checklist.add_cable_channel_needed, checklist.add_cable_channel_meters || 0,
      checklist.has_tray, checklist.has_floor_passage, checklist.has_server_room, checklist.has_telecom_closet,
      checklist.patch_panel_needed, checklist.patch_panel_free_num || '1', checklist.port_marking || 'ССМ 1', checklist.sbs_contact || null,
      checklist.materials_needed, JSON.stringify(checklist)
    ]);

    await client.query(`
      INSERT INTO task_attachments (task_id, type, file_path, original_name, mime_type, size_bytes, uploaded_by, comment)
      VALUES ($1, 'scheme', $2, $3, $4, $5, $6, 'Чек-лист Сбера (PDF)')
    `, [taskId, req.file.path, req.file.originalname, req.file.mimetype, req.file.size, req.user.id]);

    const calculatedItems = calculateChecklistMaterials(checklist);
    const savedMaterials = [];

    for (const item of calculatedItems) {
      const { rows: matRows } = await client.query('SELECT id FROM materials WHERE code = $1', [item.code]);
      if (matRows.length === 0) continue;
      const matId = matRows[0].id;

      const { rows: tmRows } = await client.query(`
        INSERT INTO task_materials (task_id, material_id, plan_qty, calc_details, source)
        VALUES ($1, $2, $3, $4, 'template')
        ON CONFLICT (task_id, material_id) DO UPDATE SET
          plan_qty = EXCLUDED.plan_qty,
          calc_details = EXCLUDED.calc_details,
          source = 'template'
        RETURNING *
      `, [taskId, matId, item.quantity, item.calc_details]);

      savedMaterials.push({ ...item, material_id: matId, task_material: tmRows[0] });
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      task_id: taskId,
      checklist: checklist,
      materials: savedMaterials
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ─── 5. ОПТИМИЗАТОР СНАБЖЕНИЯ CP-SAT ─────────────────────────────────────────

// POST /api/supply/optimize
router.post('/supply/optimize', authenticateToken, async (req, res) => {
  try {
    const { rows: warehouses } = await pool.query(`
      SELECT id, name, type, region, address FROM warehouses WHERE is_active = true
    `);

    const { rows: contractors } = await pool.query(`
      SELECT c.id, c.name_short, c.name_full, w.id AS warehouse_id, w.region
      FROM contractors c
      LEFT JOIN warehouses w ON w.contractor_id = c.id
      WHERE c.status = 'active'
    `);

    const { rows: materials } = await pool.query(`
      SELECT id, code, name, unit, package_qty, package_unit FROM materials WHERE is_active = true
    `);

    const { rows: stockBalances } = await pool.query(`
      SELECT warehouse_id, material_id, quantity FROM stock_balances WHERE quantity > 0
    `);

    let { rows: demands } = await pool.query(`
      SELECT 
        c.id AS contractor_id,
        w.id AS contractor_warehouse_id,
        tm.material_id,
        SUM(tm.plan_qty - tm.fact_qty) AS needed_qty
      FROM task_materials tm
      JOIN tasks t ON tm.task_id = t.id
      JOIN contractors c ON (LOWER(c.name_short) = LOWER(TRIM(t.contractor)) OR LOWER(c.name_full) = LOWER(TRIM(t.contractor)))
      LEFT JOIN warehouses w ON w.contractor_id = c.id
      WHERE tm.is_written_off = false AND t.status IN ('progress', 'pending')
      GROUP BY c.id, w.id, tm.material_id
      HAVING SUM(tm.plan_qty - tm.fact_qty) > 0
    `);

    if (demands.length === 0 && Array.isArray(req.body.demands)) {
      demands = req.body.demands;
    }

    const payload = {
      warehouses,
      contractors,
      materials,
      stock_balances: stockBalances,
      demands
    };

    const optimizationResult = await runSupplyOptimizer(payload);
    res.json(optimizationResult);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 6. ПРОГНОЗИРОВАНИЕ MRP & RUN-RATE ──────────────────────────────────────

// GET /api/forecast/mrp
router.get('/forecast/mrp', authenticateToken, async (req, res) => {
  try {
    const { rows: centralWh } = await pool.query("SELECT id FROM warehouses WHERE type = 'central' LIMIT 1");
    const centralWhId = centralWh[0]?.id || 1;

    const { rows: balances } = await pool.query(`
      SELECT sb.material_id, sb.quantity, sb.reserved_qty, sb.in_transit_qty,
             (sb.quantity - sb.reserved_qty) AS free_stock
      FROM stock_balances sb
      WHERE sb.warehouse_id = $1
    `, [centralWhId]);

    const stockMap = new Map();
    for (const b of balances) {
      stockMap.set(b.material_id, {
        quantity: parseFloat(b.quantity) || 0,
        reserved: parseFloat(b.reserved_qty) || 0,
        free: Math.max(0, parseFloat(b.free_stock) || 0),
        in_transit: parseFloat(b.in_transit_qty) || 0
      });
    }

    const { rows: materials } = await pool.query('SELECT * FROM materials WHERE is_active = true');
    const matMap = new Map(materials.map(m => [m.id, m]));

    const { rows: taskDemands } = await pool.query(`
      SELECT 
        t.id AS task_id,
        t.region,
        t.address,
        t.contractor,
        t.data_vyhoda,
        t.deadline,
        tm.material_id,
        (tm.plan_qty - tm.fact_qty) AS planned_demand
      FROM tasks t
      JOIN task_materials tm ON tm.task_id = t.id
      WHERE t.archived = false 
        AND t.status IN ('progress', 'pending')
        AND tm.is_written_off = false
        AND (tm.plan_qty - tm.fact_qty) > 0
      ORDER BY COALESCE(t.data_vyhoda, t.deadline, '2099-01-01') ASC
    `);

    const { rows: suppliers } = await pool.query('SELECT * FROM suppliers WHERE is_active = true ORDER BY lead_time_days ASC');
    const defaultLeadTime = suppliers[0]?.lead_time_days || 14;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items = [];
    let totalCritical = 0;
    let totalWarning = 0;
    let totalNormal = 0;
    let totalEstimatedCost = 0;

    const simulatedStock = new Map();
    for (const [matId, st] of stockMap.entries()) {
      simulatedStock.set(matId, st.free + st.in_transit);
    }

    for (const td of taskDemands) {
      const mat = matMap.get(td.material_id);
      if (!mat) continue;

      const workDateStr = td.data_vyhoda || td.deadline;
      const workDate = workDateStr ? new Date(workDateStr) : new Date(today.getTime() + 14 * 86400000);
      
      const leadTime = defaultLeadTime;
      const orderDeadline = new Date(workDate.getTime() - leadTime * 86400000);
      const daysUntilOrder = Math.round((orderDeadline.getTime() - today.getTime()) / 86400000);

      let urgency = 'normal';
      if (daysUntilOrder < 0) {
        urgency = 'critical';
        totalCritical++;
      } else if (daysUntilOrder <= 7) {
        urgency = 'warning';
        totalWarning++;
      } else {
        totalNormal++;
      }

      const available = simulatedStock.get(td.material_id) || 0;
      const grossDemand = parseFloat(td.planned_demand) || 0;
      
      let netDemand = 0;
      if (grossDemand > available) {
        netDemand = grossDemand - available;
        simulatedStock.set(td.material_id, 0);
      } else {
        netDemand = 0;
        simulatedStock.set(td.material_id, available - grossDemand);
      }

      const pkgQty = parseFloat(mat.package_qty) || 1;
      const packagesToOrder = netDemand > 0 ? Math.ceil(netDemand / pkgQty) : 0;
      const roundedOrderQty = packagesToOrder * pkgQty;
      const estCost = roundedOrderQty * (parseFloat(mat.price_default) || 0);
      totalEstimatedCost += estCost;

      items.push({
        task_id: td.task_id,
        region: td.region || '',
        address: td.address || '',
        contractor: td.contractor || '',
        work_date: workDate.toISOString().slice(0, 10),
        order_deadline: orderDeadline.toISOString().slice(0, 10),
        days_until_order: daysUntilOrder,
        urgency,
        material_id: mat.id,
        material_code: mat.code,
        material_name: mat.name,
        unit: mat.unit,
        package_qty: pkgQty,
        package_unit: mat.package_unit || `${pkgQty} ${mat.unit}`,
        gross_demand: grossDemand,
        free_stock: stockMap.get(mat.id)?.free || 0,
        in_transit: stockMap.get(mat.id)?.in_transit || 0,
        net_demand: netDemand,
        packages_to_order: packagesToOrder,
        rounded_order_qty: roundedOrderQty,
        unit_price: parseFloat(mat.price_default) || 0,
        estimated_cost: estCost,
        lead_time_days: leadTime
      });
    }

    res.json({
      summary: {
        total_demands: items.length,
        critical_count: totalCritical,
        warning_count: totalWarning,
        normal_count: totalNormal,
        total_estimated_cost: totalEstimatedCost,
        suppliers_count: suppliers.length
      },
      items
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/forecast/run-rate
router.get('/forecast/run-rate', authenticateToken, async (req, res) => {
  try {
    const { rows: stats } = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '30 days') AS done_30d,
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '60 days') AS done_60d,
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '90 days') AS done_90d,
        COUNT(*) FILTER (WHERE status IN ('progress', 'pending')) AS current_active
      FROM tasks WHERE status = 'done' AND archived = false
    `);

    const done30 = parseInt(stats[0]?.done_30d) || 12;

    const { rows: consumption } = await pool.query(`
      SELECT 
        m.id AS material_id,
        m.code,
        m.name,
        m.unit,
        m.package_qty,
        m.package_unit,
        m.min_stock_alert,
        COALESCE(SUM(tm.fact_qty), 0) AS total_consumed_fact,
        COUNT(DISTINCT tm.task_id) AS tasks_count
      FROM materials m
      LEFT JOIN task_materials tm ON tm.material_id = m.id AND tm.is_written_off = true
      WHERE m.is_active = true
      GROUP BY m.id
      ORDER BY total_consumed_fact DESC
    `);

    const result = consumption.map(c => {
      const tasksCount = parseInt(c.tasks_count) || 1;
      const totalFact = parseFloat(c.total_consumed_fact) || 0;
      const avgPerTask = totalFact > 0 ? +(totalFact / tasksCount).toFixed(1) : (c.code === 'CABLE-UTP-5E-CU' ? 22 : 1);
      const projectedMonthly = +(avgPerTask * (done30 || 15)).toFixed(0);
      const recommendedSafetyStock = Math.max(
        parseFloat(c.min_stock_alert) || 0,
        Math.ceil(projectedMonthly * 0.4)
      );
      return {
        material_id: c.material_id,
        code: c.code,
        name: c.name,
        unit: c.unit,
        package_qty: c.package_qty,
        package_unit: c.package_unit,
        avg_per_task: avgPerTask,
        projected_monthly: projectedMonthly,
        recommended_safety_stock: recommendedSafetyStock
      };
    });

    res.json({
      period_stats: stats[0] || {},
      materials_run_rate: result
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 7. ПОСТАВЩИКИ И ЗАКАЗЫ ──────────────────────────────────────────────────

// GET /api/suppliers
router.get('/suppliers', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM suppliers WHERE is_active = true ORDER BY name ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/suppliers
router.post('/suppliers', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    const { name, contact, phone, email, lead_time_days, min_order_amount } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO suppliers (name, contact, phone, email, lead_time_days, min_order_amount)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, contact, phone, email, lead_time_days || 14, min_order_amount || 0]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/purchase-orders
router.get('/purchase-orders', authenticateToken, async (req, res) => {
  try {
    const { rows: orders } = await pool.query(`
      SELECT po.*, s.name AS supplier_name, s.lead_time_days, w.name AS warehouse_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN warehouses w ON po.target_warehouse_id = w.id
      ORDER BY po.id DESC
    `);

    const { rows: items } = await pool.query(`
      SELECT poi.*, m.code, m.name, m.unit, m.package_qty, m.package_unit
      FROM purchase_order_items poi
      JOIN materials m ON poi.material_id = m.id
    `);

    const itemsByOrder = new Map();
    for (const it of items) {
      if (!itemsByOrder.has(it.purchase_order_id)) itemsByOrder.set(it.purchase_order_id, []);
      itemsByOrder.get(it.purchase_order_id).push(it);
    }

    const result = orders.map(o => ({
      ...o,
      items: itemsByOrder.get(o.id) || []
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/purchase-orders
router.post('/purchase-orders', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { supplier_id, target_warehouse_id, status = 'ordered', expected_delivery_date, notes, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Добавьте хотя бы одну позицию в заказ' });
    }

    let whId = target_warehouse_id;
    if (!whId) {
      const { rows: wh } = await client.query("SELECT id FROM warehouses WHERE type = 'central' LIMIT 1");
      whId = wh[0]?.id || 1;
    }

    const orderNumber = 'ЗП-' + Date.now().toString().slice(-6);
    let totalAmount = 0;
    for (const it of items) {
      totalAmount += (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
    }

    const { rows: poRows } = await client.query(`
      INSERT INTO purchase_orders (
        order_number, supplier_id, target_warehouse_id, status, total_amount,
        order_date, expected_delivery_date, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8)
      RETURNING *
    `, [orderNumber, supplier_id || null, whId, status, totalAmount, expected_delivery_date || null, notes || null, req.user.id]);
    const po = poRows[0];

    for (const it of items) {
      const qty = parseFloat(it.quantity);
      const price = parseFloat(it.unit_price) || 0;
      const pkgUnits = parseFloat(it.package_units) || 1;
      await client.query(`
        INSERT INTO purchase_order_items (purchase_order_id, material_id, quantity, package_units, unit_price, total_price)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [po.id, it.material_id, qty, pkgUnits, price, qty * price]);

      if (status === 'ordered' || status === 'in_transit') {
        await client.query(`
          INSERT INTO stock_balances (warehouse_id, material_id, in_transit_qty, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (warehouse_id, material_id) DO UPDATE SET
            in_transit_qty = stock_balances.in_transit_qty + $3,
            updated_at = NOW()
        `, [whId, it.material_id, qty]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, purchase_order: po });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/purchase-orders/:id/receive
router.post('/purchase-orders/:id/receive', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const poId = req.params.id;
    const { rows: poRows } = await client.query('SELECT * FROM purchase_orders WHERE id = $1', [poId]);
    if (poRows.length === 0) return res.status(404).json({ error: 'Заказ не найден' });
    const po = poRows[0];

    if (po.status === 'received') {
      return res.status(400).json({ error: 'Заказ уже оприходован' });
    }

    const { rows: items } = await client.query('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1', [poId]);
    const whId = po.target_warehouse_id || 1;

    const { rows: movRows } = await client.query(`
      INSERT INTO stock_movements (movement_type, target_warehouse_id, status, doc_number, comment, created_by, confirmed_at)
      VALUES ('receipt', $1, 'completed', $2, $3, $4, NOW())
      RETURNING id
    `, [whId, po.order_number, `Оприходование заказа поставщику #${po.order_number}`, req.user.id]);
    const movId = movRows[0].id;

    for (const it of items) {
      const qty = parseFloat(it.quantity);
      await client.query(`
        INSERT INTO stock_movement_items (movement_id, material_id, quantity, unit_price)
        VALUES ($1, $2, $3, $4)
      `, [movId, it.material_id, qty, it.unit_price]);

      await client.query(`
        INSERT INTO stock_balances (warehouse_id, material_id, quantity, in_transit_qty, updated_at)
        VALUES ($1, $2, $3, 0, NOW())
        ON CONFLICT (warehouse_id, material_id) DO UPDATE SET
          quantity = stock_balances.quantity + $3,
          in_transit_qty = GREATEST(0, stock_balances.in_transit_qty - $3),
          updated_at = NOW()
      `, [whId, it.material_id, qty]);
    }

    await client.query(`
      UPDATE purchase_orders
      SET status = 'received', received_date = CURRENT_DATE, updated_at = NOW()
      WHERE id = $1
    `, [poId]);

    await client.query('COMMIT');
    res.json({ success: true, message: `Поставка #${po.order_number} успешно оприходована на склад` });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
