import express from 'express';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { uploadAttachment, fixUtf8Filename } from '../middleware/upload.js';
import { parseMaterialSpecExcel, saveImportedMaterials } from '../services/materialSpecParser.js';
import { generateShipmentExcel } from '../services/materialSpecExcelGenerator.js';

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
  if (!['admin', 'director', 'logistics', 'to_engineer'].includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
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
  if (!['admin', 'director', 'logistics', 'to_engineer'].includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
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
    let { rows } = await pool.query(`
      SELECT 
        tm.id,
        tm.task_id,
        tm.material_id,
        tm.pos_num,
        COALESCE(tm.item_name, m.name) AS name,
        tm.model,
        COALESCE(tm.article, m.code) AS code,
        tm.supplier_contractor_id,
        COALESCE(sc.name_short, tm.supplier) AS supplier,
        COALESCE(tm.unit, m.unit, 'шт') AS unit,
        tm.plan_qty,
        tm.fact_qty,
        COALESCE(tm.price, m.price_default, 0) AS price,
        COALESCE(tm.price, m.price_default, 0) AS price_default,
        CASE WHEN tm.fact_qty IS NULL THEN NULL ELSE COALESCE(tm.total_price, ROUND(tm.fact_qty * COALESCE(tm.price, m.price_default, 0))) END AS total_price,
        tm.mass_kg,
        tm.task_item_id,
        (
          SELECT SUM(si.accepted_qty)
          FROM material_shipment_items si
          JOIN material_shipments s ON s.id = si.shipment_id
          WHERE s.task_id = tm.task_id
            AND s.status IN ('accepted', 'accepted_discrepancy')
            AND (si.task_material_id = tm.id OR (tm.task_item_id IS NOT NULL AND si.task_item_id = tm.task_item_id))
        ) AS accepted_qty,
        tm.note,
        tm.calc_details,
        tm.source,
        tm.is_written_off,
        tm.written_off_at,
        m.category
      FROM task_materials tm
      LEFT JOIN materials m ON tm.material_id = m.id
      LEFT JOIN contractors sc ON tm.supplier_contractor_id = sc.id
      WHERE tm.task_id = $1
      ORDER BY 
        COALESCE(NULLIF(regexp_replace(tm.pos_num, '[^0-9.]', '', 'g'), ''), '9999')::numeric ASC NULLS LAST,
        tm.id ASC
    `, [req.params.id]);

    // Если в task_materials пусто, но в task_items есть материалы — авто-синхронизируем!
    if (!rows.length) {
      const { rows: items } = await pool.query(`SELECT * FROM task_items WHERE task_id = $1 ORDER BY id ASC`, [req.params.id]);
      if (items.length) {
        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx];
          const parsedQty = Number(it.quantity);
          if (it.quantity === null || it.quantity === undefined || String(it.quantity).trim() === '' || !Number.isFinite(parsedQty)) continue;
          const qty = parsedQty;
          const price = Number(it.price_customer || it.price_contractor || 0) || 0;
          const total = Number(it.amount_customer || it.amount_contractor || (qty * price)) || 0;
          await pool.query(`
            INSERT INTO task_materials (
              task_id, pos_num, item_name, article, unit, plan_qty, fact_qty, price, total_price, supplier, source
            ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, 'task_items')
          `, [
            req.params.id, String(idx + 1), it.work_type, it.article_plan || it.article || null,
            it.unit || 'шт', qty, price, total, it.supplier || null
          ]);
        }
        const recheck = await pool.query(`
          SELECT 
            tm.id, tm.task_id, tm.material_id, tm.pos_num,
            COALESCE(tm.item_name, m.name) AS name, tm.model,
            COALESCE(tm.article, m.code) AS code, tm.supplier,
            COALESCE(tm.unit, m.unit, 'шт') AS unit, tm.plan_qty, tm.fact_qty,
            COALESCE(tm.price, m.price_default, 0) AS price_default,
            CASE WHEN tm.fact_qty IS NULL THEN NULL ELSE COALESCE(tm.total_price, ROUND(tm.fact_qty * COALESCE(tm.price, m.price_default, 0))) END AS total_price,
            tm.mass_kg, tm.note, tm.calc_details, tm.source, tm.is_written_off, tm.written_off_at, m.category
          FROM task_materials tm
          LEFT JOIN materials m ON tm.material_id = m.id
          WHERE tm.task_id = $1
          ORDER BY tm.id ASC
        `, [req.params.id]);
        rows = recheck.rows;
      }
    }

    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/tasks/:id/materials/import-excel (Импорт спецификации ТМЦ из Excel)
router.post('/tasks/:id/materials/import-excel', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  try {
    const taskId = req.params.id;
    const { rows: taskRows } = await pool.query('SELECT raw_data FROM tasks WHERE id = $1', [taskId]);
    if (taskRows.length) {
      let rawData = taskRows[0].raw_data || {};
      if (typeof rawData === 'string') { try { rawData = JSON.parse(rawData); } catch { rawData = {}; } }
      if (rawData.tmcLogistAccepted) {
        return res.status(409).json({ error: 'Отчёт по ТМЦ утверждён логистом и заблокирован от изменений' });
      }
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Файл спецификации Excel не прикреплен' });
    }
    const replace = req.body.replace === 'true' || req.body.replace === true;
    const items = parseMaterialSpecExcel(req.file.path);
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'В прикрепленном файле не найдено строк спецификации материалов' });
    }
    const result = await saveImportedMaterials(taskId, items, { replace });
    res.json({ success: true, count: result.count, itemsCount: items.length });
  } catch (e) {
    console.error('[IMPORT SPEC EXCEL ERROR]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tasks/:id/materials/add-item (Ручное добавление строки в спецификацию)
router.post('/tasks/:id/materials/add-item', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { rows: taskRows } = await pool.query('SELECT raw_data FROM tasks WHERE id = $1', [taskId]);
    if (taskRows.length) {
      let rawData = taskRows[0].raw_data || {};
      if (typeof rawData === 'string') { try { rawData = JSON.parse(rawData); } catch { rawData = {}; } }
      if (rawData.tmcLogistAccepted) {
        return res.status(409).json({ error: 'Отчёт по ТМЦ утверждён логистом и заблокирован от изменений' });
      }
    }
    const { pos_num, name, model, article, supplier, unit, plan_qty, price, note } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Наименование обязательно' });
    }
    const hasQuantity = plan_qty !== null && plan_qty !== undefined && String(plan_qty).trim() !== '';
    const qty = hasQuantity ? Number(plan_qty) : NaN;
    if (!Number.isFinite(qty)) {
      return res.status(400).json({ error: 'Количество (план) должно быть числом' });
    }
    const pr = parseFloat(price) || 0;
    const tot = Math.round(qty * pr);

    const { rows } = await pool.query(`
      INSERT INTO task_materials (
        task_id, pos_num, item_name, model, article, supplier, unit, plan_qty, fact_qty, price, total_price, note, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10, $11, 'manual')
      RETURNING *
    `, [taskId, pos_num || null, name.trim(), model || null, article || null, supplier || null, unit || 'шт', qty, pr, tot, note || null]);

    res.json({ success: true, item: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/tasks/:id/materials/:itemId (Удаление строки спецификации)
router.delete('/tasks/:id/materials/:itemId', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const itemId = req.params.itemId;
    const { rows: taskRows } = await pool.query('SELECT raw_data FROM tasks WHERE id = $1', [taskId]);
    if (taskRows.length) {
      let rawData = taskRows[0].raw_data || {};
      if (typeof rawData === 'string') { try { rawData = JSON.parse(rawData); } catch { rawData = {}; } }
      if (rawData.tmcLogistAccepted) {
        return res.status(409).json({ error: 'Отчёт по ТМЦ утверждён логистом и заблокирован от изменений' });
      }
    }
    await pool.query(`DELETE FROM task_materials WHERE id = $1 AND task_id = $2`, [itemId, taskId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tasks/:id/materials/calculate
router.post('/tasks/:id/materials/calculate', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Загружаем данные задачи для точного определения объема портов
    const { rows: tRows } = await client.query('SELECT in_order, fact, work_type FROM tasks WHERE id = $1', [taskId]);
    const taskObj = tRows[0] || {};
    const taskPorts = Math.max(1, parseInt(taskObj.fact, 10) || parseInt(taskObj.in_order, 10) || 1);

    let checklist = req.body.checklist;
    if (!checklist) {
      const { rows: chRows } = await client.query('SELECT * FROM task_checklists WHERE task_id = $1 ORDER BY id DESC LIMIT 1', [taskId]);
      if (chRows.length > 0) checklist = chRows[0];
    }
    if (!checklist) {
      checklist = { 
        ports_install: taskPorts, 
        surface_type: 'Фальш-потолок(Армстронг)', 
        ceiling_height: 2.5, 
        socket_surface: 'в столе' 
      };
    } else if (!checklist.ports_install && !checklist.ports_install_qty) {
      checklist.ports_install = taskPorts;
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

// POST /api/tasks/:id/materials/save-fact
router.post('/tasks/:id/materials/save-fact', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;
    const { items } = req.body;

    const { rows: taskRows } = await client.query('SELECT raw_data FROM tasks WHERE id = $1', [taskId]);
    if (taskRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    let rawData = taskRows[0].raw_data || {};
    if (typeof rawData === 'string') {
      try { rawData = JSON.parse(rawData); } catch { rawData = {}; }
    }
    if (rawData.tmcLogistAccepted) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Отчёт по ТМЦ утверждён логистом и заблокирован от изменений' });
    }
    const { rows: accShipments } = await client.query(
      "SELECT id FROM material_shipments WHERE task_id = $1 AND status IN ('accepted', 'accepted_discrepancy') LIMIT 1",
      [taskId]
    );
    if (!rawData.tmcAccepted && accShipments.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Фактический расход доступен после акцепта ТМЦ подрядчиком' });
    }

    if (Array.isArray(items)) {
      for (const item of items) {
        const hasQty = Object.prototype.hasOwnProperty.call(item, 'fact_qty') || Object.prototype.hasOwnProperty.call(item, 'quantity');
        const rawQty = item.fact_qty !== undefined ? item.fact_qty : item.quantity;
        const qty = hasQty && rawQty !== null && rawQty !== '' ? parseFloat(rawQty) : null;
        let supplier = (item.supplier !== undefined && item.supplier !== null) ? String(item.supplier).trim() : null;
        const hasSupplierText = Object.prototype.hasOwnProperty.call(item, 'supplier');
        const hasSupplierContractorId = Object.prototype.hasOwnProperty.call(item, 'supplier_contractor_id') || Object.prototype.hasOwnProperty.call(item, 'supplier_id');
        const rawSupplierContractorId = item.supplier_contractor_id !== undefined ? item.supplier_contractor_id : item.supplier_id;
        const supplierContractorId = hasSupplierContractorId && rawSupplierContractorId !== null && rawSupplierContractorId !== '' ? Number(rawSupplierContractorId) : null;
        if (hasSupplierContractorId && supplierContractorId !== null) {
          if (!Number.isInteger(supplierContractorId) || supplierContractorId <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Некорректный ID поставщика' });
          }
          const { rows: supplierRows } = await client.query(
            "SELECT id, name_short FROM contractors WHERE id = $1 AND type = 'supplier' AND is_own IS NOT TRUE AND status = 'active'",
            [supplierContractorId]
          );
          if (!supplierRows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Поставщик не найден или неактивен' });
          }
          supplier = supplierRows[0].name_short;
        }
        const price = (item.price !== undefined && item.price !== null && item.price !== '') ? parseFloat(item.price) : null;
        const totalPrice = (item.total_price !== undefined && item.total_price !== null && item.total_price !== '')
          ? parseFloat(item.total_price)
          : (qty !== null && !isNaN(qty) && price !== null && !isNaN(price) ? Math.round(qty * price) : null);
        const clearTotalPrice = hasQty && qty === null && (item.total_price === undefined || item.total_price === null || item.total_price === '');
        const itemId = item.id ? parseInt(item.id, 10) : null;
        const materialId = item.material_id ? parseInt(item.material_id, 10) : null;
        const itemName = (item.item_name || item.name) ? String(item.item_name || item.name).trim() : null;

        if (itemId) {
          const sets = [];
          const vals = [];
          let idx = 1;

          if (hasQty && (qty === null || !isNaN(qty))) { sets.push(`fact_qty = $${idx++}`); vals.push(qty); }
          if (hasSupplierText) { sets.push(`supplier = $${idx++}`); vals.push(supplier); }
          if (hasSupplierContractorId) { sets.push(`supplier_contractor_id = $${idx++}`); vals.push(supplierContractorId); }
          if (price !== null && !isNaN(price)) { sets.push(`price = $${idx++}`); vals.push(price); }
          if (clearTotalPrice || (totalPrice !== null && !isNaN(totalPrice))) { sets.push(`total_price = $${idx++}`); vals.push(totalPrice); }
          if (materialId) { sets.push(`material_id = $${idx++}`); vals.push(materialId); }
          if (itemName) { sets.push(`item_name = $${idx++}`); vals.push(itemName); }
          if (Object.prototype.hasOwnProperty.call(item, 'note')) {
            sets.push(`note = $${idx++}`);
            vals.push(item.note !== null && item.note !== undefined ? String(item.note).trim() : null);
          }

          if (sets.length > 0) {
            vals.push(itemId);
            vals.push(taskId);
            await client.query(`
              UPDATE task_materials 
              SET ${sets.join(', ')}
              WHERE id = $${idx++} AND task_id = $${idx++}
            `, vals);
          }
        } else if (materialId) {
          const sets = [];
          const vals = [];
          let idx = 1;

          if (hasQty && (qty === null || !isNaN(qty))) { sets.push(`fact_qty = $${idx++}`); vals.push(qty); }
          if (hasSupplierText) { sets.push(`supplier = $${idx++}`); vals.push(supplier); }
          if (hasSupplierContractorId) { sets.push(`supplier_contractor_id = $${idx++}`); vals.push(supplierContractorId); }
          if (price !== null && !isNaN(price)) { sets.push(`price = $${idx++}`); vals.push(price); }
          if (clearTotalPrice || (totalPrice !== null && !isNaN(totalPrice))) { sets.push(`total_price = $${idx++}`); vals.push(totalPrice); }
          if (itemName) { sets.push(`item_name = $${idx++}`); vals.push(itemName); }
          if (Object.prototype.hasOwnProperty.call(item, 'note')) {
            sets.push(`note = $${idx++}`);
            vals.push(item.note !== null && item.note !== undefined ? String(item.note).trim() : null);
          }

          if (sets.length > 0) {
            vals.push(taskId);
            vals.push(materialId);
            await client.query(`
              UPDATE task_materials 
              SET ${sets.join(', ')}
              WHERE task_id = $${idx++} AND material_id = $${idx++}
            `, vals);
          }
        }
      }
    }

    // Автоматически пересчитываем общую сумму только по строкам с введённым фактом
    const { rows: tmcSum } = await client.query(`
      SELECT COALESCE(SUM(
        CASE WHEN tm.fact_qty IS NULL THEN 0
             ELSE COALESCE(tm.total_price, ROUND(tm.fact_qty * COALESCE(tm.price, m.price_default, 0)))
        END
      ), 0) AS total_tmc
      FROM task_materials tm
      LEFT JOIN materials m ON tm.material_id = m.id
      WHERE tm.task_id = $1
    `, [taskId]);
    
    if (tmcSum.length > 0) {
      await client.query('UPDATE tasks SET tmc = $1, updated_at = NOW() WHERE id = $2', [tmcSum[0].total_tmc, taskId]);
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/tasks/:id/materials/:itemId/bind (Быстрая привязка позиции каталога)
router.post('/tasks/:id/materials/:itemId/bind', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;
    const itemId = parseInt(req.params.itemId, 10);
    const { material_id } = req.body;

    const { rows: taskRows } = await client.query('SELECT raw_data FROM tasks WHERE id = $1', [taskId]);
    if (taskRows.length) {
      let rawData = taskRows[0].raw_data || {};
      if (typeof rawData === 'string') { try { rawData = JSON.parse(rawData); } catch { rawData = {}; } }
      if (rawData.tmcLogistAccepted) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Отчёт по ТМЦ утверждён логистом и заблокирован от изменений' });
      }
    }

    if (!material_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'material_id обязателен' });
    }

    const { rows: mRows } = await client.query('SELECT * FROM materials WHERE id = $1', [material_id]);
    if (!mRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Позиция номенклатуры не найдена' });
    }
    const mat = mRows[0];
    if (mat.is_active === false) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Позиция номенклатуры неактивна или удалена из каталога' });
    }

    // Проверяем: itemId может быть из task_items (таблица комплектации) или из task_materials
    let tiRow = null;
    let tmRow = null;

    const { rows: checkTi } = await client.query(
      'SELECT * FROM task_items WHERE id = $1 AND task_id = $2',
      [itemId, taskId]
    );

    if (checkTi.length > 0) {
      tiRow = checkTi[0];
      // Ищем связанную запись в task_materials по task_item_id
      const { rows: checkTm } = await client.query(
        'SELECT * FROM task_materials WHERE task_id = $1 AND task_item_id = $2',
        [taskId, tiRow.id]
      );
      if (checkTm.length > 0) {
        tmRow = checkTm[0];
      } else {
        // Безопасное сопоставление в рамках заявки (если task_item_id еще не был проставлен)
        const { rows: safeTm } = await client.query(
          'SELECT * FROM task_materials WHERE task_id = $1 AND task_item_id IS NULL AND LOWER(TRIM(item_name)) = LOWER(TRIM($2)) LIMIT 1',
          [taskId, tiRow.work_type]
        );
        if (safeTm.length > 0) {
          tmRow = safeTm[0];
          await client.query('UPDATE task_materials SET task_item_id = $1 WHERE id = $2', [tiRow.id, tmRow.id]);
        }
      }
    } else {
      const { rows: checkTm } = await client.query(
        'SELECT * FROM task_materials WHERE id = $1 AND task_id = $2',
        [itemId, taskId]
      );
      if (checkTm.length > 0) {
        tmRow = checkTm[0];
        if (tmRow.task_item_id) {
          const { rows: linkedTi } = await client.query(
            'SELECT * FROM task_items WHERE id = $1 AND task_id = $2',
            [tmRow.task_item_id, taskId]
          );
          if (linkedTi.length > 0) tiRow = linkedTi[0];
        } else {
          const { rows: safeTi } = await client.query(
            'SELECT * FROM task_items WHERE task_id = $1 AND LOWER(TRIM(work_type)) = LOWER(TRIM($2)) LIMIT 1',
            [taskId, tmRow.item_name]
          );
          if (safeTi.length > 0) {
            tiRow = safeTi[0];
            await client.query('UPDATE task_materials SET task_item_id = $1 WHERE id = $2', [tiRow.id, tmRow.id]);
          }
        }
      }
    }

    if (!tiRow && !tmRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Строка спецификации или комплектации не найдена' });
    }

    // Если связанная запись в task_materials имеет is_written_off = true — 409
    if (tmRow && tmRow.is_written_off) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Нельзя привязывать позицию каталога к уже списанной строке' });
    }

    const price = parseFloat(mat.price_default) || (tmRow ? parseFloat(tmRow.price) : 0) || (tiRow ? parseFloat(tiRow.price_customer || tiRow.price_contractor) : 0) || 0;

    // В task_items:
    // сохрани исходное наименование в demand_name = COALESCE(demand_name, work_type)
    // обнови work_type = mat.name, material_id = mat.id, article = mat.code, article_plan = mat.code,
    // manufacturer = COALESCE(mat.manufacturer, manufacturer), unit = COALESCE(mat.unit, unit)
    if (tiRow) {
      const { rows: updTi } = await client.query(`
        UPDATE task_items SET
          demand_name = COALESCE(demand_name, work_type),
          work_type = $1,
          material_id = $2,
          article = $3,
          article_plan = $3,
          manufacturer = COALESCE($4, manufacturer),
          unit = COALESCE($5, unit),
          price_customer = CASE WHEN $6::numeric > 0 THEN $6::numeric ELSE price_customer END,
          price_contractor = CASE WHEN $6::numeric > 0 THEN $6::numeric ELSE price_contractor END,
          amount_customer = CASE WHEN $6::numeric > 0 AND quantity IS NOT NULL THEN ROUND(quantity * $6::numeric) ELSE amount_customer END,
          amount_contractor = CASE WHEN $6::numeric > 0 AND quantity IS NOT NULL THEN ROUND(quantity * $6::numeric) ELSE amount_contractor END,
          updated_at = NOW()
        WHERE id = $7 AND task_id = $8
        RETURNING *
      `, [
        mat.name, mat.id, mat.code,
        mat.manufacturer || null,
        mat.unit || tiRow.unit || 'шт',
        price,
        tiRow.id, taskId
      ]);
      tiRow = updTi[0];
    }

    // В task_materials:
    // сохрани demand_name = COALESCE(demand_name, item_name)
    // обнови item_name = mat.name, model = mat.name, material_id = mat.id, article = mat.code,
    // manufacturer = COALESCE(mat.manufacturer, manufacturer), unit = COALESCE(mat.unit, unit), price = price,
    // строго НЕ меняя fact_qty и plan_qty, и считая total_price только при fact_qty IS NOT NULL.
    if (tmRow) {
      const totalPrice = tmRow.fact_qty !== null && tmRow.fact_qty !== undefined
        ? Math.round(Number(tmRow.fact_qty) * price)
        : null;

      const { rows: updTm } = await client.query(`
        UPDATE task_materials SET
          demand_name = COALESCE(demand_name, item_name),
          item_name = $1,
          model = $1,
          material_id = $2,
          article = $3,
          manufacturer = COALESCE($4, manufacturer),
          unit = COALESCE($5, unit),
          price = $6,
          total_price = $7,
          task_item_id = COALESCE(task_item_id, $8)
        WHERE id = $9 AND task_id = $10
        RETURNING *
      `, [
        mat.name, mat.id, mat.code,
        mat.manufacturer || null,
        mat.unit || tmRow.unit || 'шт',
        price,
        totalPrice,
        tiRow ? tiRow.id : null,
        tmRow.id, taskId
      ]);
      tmRow = updTm[0];
    } else if (tiRow) {
      // Создаем связанную запись с task_item_id, если ее еще не было
      const { rows: newTm } = await client.query(`
        INSERT INTO task_materials (
          task_id, task_item_id, item_name, model, material_id, article,
          manufacturer, unit, price, total_price, plan_qty, fact_qty,
          demand_name, source, supplier, supplier_contractor_id, shipment_method
        ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, NULL, $9, NULL, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        taskId, tiRow.id, mat.name, mat.id, mat.code,
        mat.manufacturer || tiRow.manufacturer || null,
        mat.unit || tiRow.unit || 'шт',
        price,
        tiRow.quantity,
        tiRow.demand_name || mat.name,
        tiRow.source || null,
        tiRow.supplier || null,
        tiRow.supplier_contractor_id || null,
        tiRow.shipment_method || null
      ]);
      tmRow = newTm[0];
    }

    // Обновляем сумму tmc в tasks ТОЛЬКО по строкам с введённым фактом (P0-ТМЦ-1)
    const { rows: tmcSum } = await client.query(`
      SELECT COALESCE(SUM(
        CASE WHEN tm.fact_qty IS NULL THEN 0
             ELSE COALESCE(tm.total_price, ROUND(tm.fact_qty * COALESCE(tm.price, m.price_default, 0)))
        END
      ), 0) AS total_tmc
      FROM task_materials tm
      LEFT JOIN materials m ON tm.material_id = m.id
      WHERE tm.task_id = $1
    `, [taskId]);
    if (tmcSum.length > 0) {
      await client.query('UPDATE tasks SET tmc = $1, updated_at = NOW() WHERE id = $2', [tmcSum[0].total_tmc, taskId]);
    }

    await client.query('COMMIT');
    res.json({ success: true, item: tmRow || tiRow });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('BIND ERROR in supply.js:', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/tasks/:id/materials/batch (Групповые операции над строками комплектации)
router.post('/tasks/:id/materials/batch', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;

    // Проверка заявки
    const { rows: taskRows } = await client.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
    if (!taskRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    // Запрет изменения запрещённых полей через batch
    const forbidden = ['fact_qty', 'plan_qty', 'is_written_off', 'quantity', 'written_off_at'];
    for (const f of forbidden) {
      if (Object.prototype.hasOwnProperty.call(req.body, f)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Поле ${f} запрещено для изменения через групповую операцию` });
      }
    }

    const { item_ids, ids, source, supplier_contractor_id, shipment_method, clear_source } = req.body;
    const rawIds = Array.isArray(item_ids) ? item_ids : (Array.isArray(ids) ? ids : []);
    const targetIds = Array.from(new Set(rawIds.map(Number))).filter(n => Number.isInteger(n) && n > 0);

    if (!targetIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Не указаны ID строк для групповой операции' });
    }

    // Проверяем валидность поставщика, если указан
    let effectiveSupplier = null;
    let validSupplierContractorId = null;

    if (clear_source) {
      // Очистка источника и зависимого поставщика
    } else if (supplier_contractor_id !== undefined && supplier_contractor_id !== null && supplier_contractor_id !== '') {
      const scId = parseInt(supplier_contractor_id, 10);
      if (!Number.isInteger(scId) || scId <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Некорректный ID поставщика' });
      }
      const { rows: scRows } = await client.query(
        "SELECT id, name_short FROM contractors WHERE id = $1 AND type = 'supplier' AND is_own IS NOT TRUE AND status = 'active'",
        [scId]
      );
      if (!scRows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Поставщик не найден или неактивен' });
      }
      validSupplierContractorId = scRows[0].id;
      effectiveSupplier = scRows[0].name_short;
    }

    // Определяем, к какой таблице относятся переданные ID: task_items (комплектация) или task_materials
    const { rows: tiCheck } = await client.query(
      'SELECT id, task_id, work_type FROM task_items WHERE id = ANY($1::int[])',
      [targetIds]
    );

    let isItemsTable = false;
    let isMaterialsTable = false;
    let tiRows = [];
    let tmRows = [];

    if (tiCheck.length === targetIds.length) {
      const foreign = tiCheck.filter(r => String(r.task_id) !== String(taskId));
      if (foreign.length > 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Позиция принадлежит другой заявке' });
      }
      // Проверяем списанные строки в task_materials строго по task_item_id
      const { rows: writtenOffCheck } = await client.query(
        'SELECT id FROM task_materials WHERE task_id = $1 AND is_written_off IS TRUE AND task_item_id = ANY($2::int[])',
        [taskId, targetIds]
      );
      if (writtenOffCheck.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Нельзя изменять уже списанные строки' });
      }
      isItemsTable = true;
    } else {
      const { rows: tmCheck } = await client.query(
        'SELECT id, task_id, is_written_off, item_name, pos_num, task_item_id FROM task_materials WHERE id = ANY($1::int[])',
        [targetIds]
      );
      if (tmCheck.length === targetIds.length) {
        const foreign = tmCheck.filter(r => String(r.task_id) !== String(taskId));
        if (foreign.length > 0) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Позиция принадлежит другой заявке' });
        }
        const writtenOff = tmCheck.filter(r => r.is_written_off);
        if (writtenOff.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Нельзя изменять уже списанные строки' });
        }
        isMaterialsTable = true;
      } else {
        const foreignTi = tiCheck.filter(r => String(r.task_id) !== String(taskId));
        const foreignTm = tmCheck.filter(r => String(r.task_id) !== String(taskId));
        if (foreignTi.length > 0 || foreignTm.length > 0) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Позиция принадлежит другой заявке' });
        }
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Одна или несколько позиций не найдены' });
      }
    }

    // Применяем обновления
    if (clear_source) {
      if (isMaterialsTable) {
        const { rows: updTm } = await client.query(
          `UPDATE task_materials SET
             source = NULL,
             supplier = NULL,
             supplier_contractor_id = NULL
           WHERE id = ANY($1::int[]) AND task_id = $2
           RETURNING task_item_id`,
          [targetIds, taskId]
        );
        const linkedTiIds = updTm.map(r => r.task_item_id).filter(Boolean);
        if (linkedTiIds.length > 0) {
          await client.query(
            `UPDATE task_items SET
               source = NULL,
               supplier = NULL,
               supplier_contractor_id = NULL
             WHERE id = ANY($1::int[]) AND task_id = $2`,
            [linkedTiIds, taskId]
          );
        }
      } else if (isItemsTable) {
        await client.query(
          `UPDATE task_items SET
             source = NULL,
             supplier = NULL,
             supplier_contractor_id = NULL
           WHERE id = ANY($1::int[]) AND task_id = $2`,
          [targetIds, taskId]
        );
        await client.query(
          `UPDATE task_materials SET
             source = NULL,
             supplier = NULL,
             supplier_contractor_id = NULL
           WHERE task_id = $1 AND task_item_id = ANY($2::int[])`,
          [taskId, targetIds]
        );
      }
    } else {
      const sets = [];
      const vals = [];
      let idx = 1;

      if (source !== undefined) {
        sets.push(`source = $${idx++}`);
        vals.push(source ? String(source).trim() : null);
        if (source === 'warehouse' && validSupplierContractorId === null && req.body.supplier === undefined) {
          sets.push(`supplier = $${idx++}`);
          vals.push('Склад');
          sets.push(`supplier_contractor_id = $${idx++}`);
          vals.push(null);
        }
      }
      if (validSupplierContractorId !== null) {
        sets.push(`supplier_contractor_id = $${idx++}`);
        vals.push(validSupplierContractorId);
        sets.push(`supplier = $${idx++}`);
        vals.push(effectiveSupplier);
      } else if (req.body.supplier !== undefined) {
        sets.push(`supplier = $${idx++}`);
        vals.push(req.body.supplier ? String(req.body.supplier).trim() : null);
      }
      if (shipment_method !== undefined) {
        sets.push(`shipment_method = $${idx++}`);
        vals.push(shipment_method ? String(shipment_method).trim() : null);
      }

      if (sets.length > 0) {
        vals.push(targetIds);
        vals.push(taskId);

        if (isMaterialsTable) {
          const { rows: updTm } = await client.query(
            `UPDATE task_materials SET ${sets.join(', ')} WHERE id = ANY($${idx++}::int[]) AND task_id = $${idx++} RETURNING task_item_id`,
            vals
          );
          const linkedTiIds = updTm.map(r => r.task_item_id).filter(Boolean);
          if (linkedTiIds.length > 0) {
            const itemSets = [...sets];
            const itemVals = [...vals.slice(0, sets.length), taskId, linkedTiIds];
            await client.query(
              `UPDATE task_items SET ${itemSets.join(', ')} WHERE task_id = $${sets.length + 1} AND id = ANY($${sets.length + 2}::int[])`,
              itemVals
            );
          }
        } else if (isItemsTable) {
          await client.query(
            `UPDATE task_items SET ${sets.join(', ')} WHERE id = ANY($${idx++}::int[]) AND task_id = $${idx++}`,
            vals
          );
          const matSets = [...sets];
          const matVals = [...vals.slice(0, sets.length), taskId, targetIds];
          await client.query(
            `UPDATE task_materials SET ${matSets.join(', ')} WHERE task_id = $${sets.length + 1} AND task_item_id = ANY($${sets.length + 2}::int[]) AND (is_written_off IS FALSE OR is_written_off IS NULL)`,
            matVals
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, count: targetIds.length, updated: targetIds.length });
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
    const { items, comment } = req.body || {};

    const { rows: taskRows } = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    const task = taskRows[0];

    let rawData = task.raw_data || {};
    if (typeof rawData === 'string') {
      try { rawData = JSON.parse(rawData); } catch { rawData = {}; }
    }
    if (rawData.tmcLogistAccepted) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Отчёт по ТМЦ утверждён логистом и заблокирован от списания и изменений' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Укажите перечень материалов и списанные количества' });
    }

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
      const qty = parseFloat(item.quantity !== undefined ? item.quantity : item.fact_qty);
      if (isNaN(qty) || qty < 0) continue;

      if (item.material_id) {
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
      }

      // Обновляем факт в task_materials
      const supplier = (item.supplier !== undefined && item.supplier !== null) ? String(item.supplier).trim() : null;
      const price = (item.price !== undefined && item.price !== null) ? parseFloat(item.price) : null;
      const total = (item.total_price !== undefined && item.total_price !== null) ? parseFloat(item.total_price) : (price !== null ? Math.round(qty * price) : null);

      if (item.id) {
        await client.query(`
          UPDATE task_materials SET
            fact_qty = $1,
            is_written_off = true,
            written_off_at = NOW(),
            supplier = COALESCE($2, supplier),
            price = COALESCE($3, price),
            total_price = COALESCE($4, total_price)
          WHERE id = $5 AND task_id = $6
        `, [qty, supplier, price, total, item.id, taskId]);
      } else if (item.material_id) {
        await client.query(`
          UPDATE task_materials SET
            fact_qty = $1,
            is_written_off = true,
            written_off_at = NOW(),
            supplier = COALESCE($2, supplier),
            price = COALESCE($3, price),
            total_price = COALESCE($4, total_price)
          WHERE task_id = $5 AND material_id = $6
        `, [qty, supplier, price, total, taskId, item.material_id]);
      }
    }

    // Автоматически суммируем себестоимость списанных материалов и обновляем tasks.tmc
    const { rows: sumRows } = await client.query(`
      SELECT 
        COALESCE(SUM(COALESCE(tm.fact_qty, tm.plan_qty, 0) * COALESCE(tm.price, m.price_default, 0)), 0) AS total_tmc
      FROM task_materials tm
      LEFT JOIN materials m ON tm.material_id = m.id
      WHERE tm.task_id = $1 AND tm.is_written_off = true
    `, [taskId]);
    const totalTmc = parseFloat(sumRows[0]?.total_tmc) || 0;
    if (totalTmc > 0) {
      await client.query('UPDATE tasks SET tmc = $1, updated_at = NOW() WHERE id = $2', [totalTmc, taskId]);
    }

    // Получаем перечень материалов и остатков для формирования закрывающих документов
    const { rows: allMats } = await client.query(`
      SELECT 
        tm.id, tm.pos_num, COALESCE(tm.item_name, m.name) AS name, tm.article, tm.unit,
        tm.plan_qty, tm.fact_qty, 
        GREATEST(0, (COALESCE(tm.plan_qty, 0) - COALESCE(tm.fact_qty, 0))) AS remainder_qty,
        COALESCE(tm.price, m.price_default, 0) AS price,
        COALESCE(tm.total_price, ROUND(COALESCE(tm.fact_qty, 0) * COALESCE(tm.price, m.price_default, 0))) AS total_price,
        tm.supplier
      FROM task_materials tm
      LEFT JOIN materials m ON tm.material_id = m.id
      WHERE tm.task_id = $1
      ORDER BY tm.id ASC
    `, [taskId]);

    // 1. Формируем Акт списания материалов (ТМЦ) в реестре документов заявки
    const tmcActMeta = {
      task_id: taskId,
      total_tmc: totalTmc,
      items_count: allMats.length,
      written_off_by: req.user.username || req.user.id,
      written_off_at: new Date().toISOString()
    };
    const tmcActNum = 'ТМЦ-' + taskId;
    const { rows: existTmcAct } = await client.query(
      `SELECT id FROM task_documents WHERE task_id = $1 AND doc_type = 'tmc_act'`,
      [taskId]
    );
    if (existTmcAct.length) {
      await client.query(`
        UPDATE task_documents SET
          title = $1, doc_number = $2, doc_date = CURRENT_DATE, meta = $3, status = 'approved', updated_at = NOW()
        WHERE id = $4
      `, [`Акт списания материалов на объект (ТМЦ) № ${taskId}`, tmcActNum, JSON.stringify(tmcActMeta), existTmcAct[0].id]);
    } else {
      await client.query(`
        INSERT INTO task_documents (task_id, doc_type, doc_number, doc_date, title, meta, status, created_by)
        VALUES ($1, 'tmc_act', $2, CURRENT_DATE, $3, $4, 'approved', $5)
      `, [taskId, tmcActNum, `Акт списания материалов на объект (ТМЦ) № ${taskId}`, JSON.stringify(tmcActMeta), req.user.id]);
    }

    // 2. Формируем Ведомость остатков ТМЦ к возврату на склад
    const remaindersList = allMats.filter(m => Number(m.remainder_qty) > 0);
    const remActMeta = {
      task_id: taskId,
      remainders: remaindersList,
      remainders_count: remaindersList.length,
      created_at: new Date().toISOString()
    };
    const remActNum = 'ВО-' + taskId;
    const { rows: existRemAct } = await client.query(
      `SELECT id FROM task_documents WHERE task_id = $1 AND doc_type = 'tmc_remainder_act'`,
      [taskId]
    );
    if (existRemAct.length) {
      await client.query(`
        UPDATE task_documents SET
          title = $1, doc_number = $2, doc_date = CURRENT_DATE, meta = $3, status = 'approved', updated_at = NOW()
        WHERE id = $4
      `, [`Ведомость остатков ТМЦ (к возврату на склад) № ${taskId}`, remActNum, JSON.stringify(remActMeta), existRemAct[0].id]);
    } else {
      await client.query(`
        INSERT INTO task_documents (task_id, doc_type, doc_number, doc_date, title, meta, status, created_by)
        VALUES ($1, 'tmc_remainder_act', $2, CURRENT_DATE, $3, $4, 'approved', $5)
      `, [taskId, remActNum, `Ведомость остатков ТМЦ (к возврату на склад) № ${taskId}`, JSON.stringify(remActMeta), req.user.id]);
    }

    await client.query('COMMIT');
    res.json({ success: true, movement_id: movement.id, warehouse_id: warehouseId, total_tmc: totalTmc });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/tasks/:id/materials/accept-custody - электронный акцепт подотчета ТМЦ монтажником
router.post('/tasks/:id/materials/accept-custody', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { rows: taskRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskRows.length === 0) return res.status(404).json({ error: 'Заявка не найдена' });
    const task = taskRows[0];

    const rawData = task.raw_data || task.rawData || {};
    const accepterName = req.user.full_name || req.user.username || task.contractor || 'Монтажник';
    const acceptDate = new Date().toLocaleString('ru-RU');

    rawData.tmcAccepted = true;
    rawData.tmcAcceptedAt = acceptDate;
    rawData.tmcAcceptedBy = accepterName;
    rawData.tmcAcceptedUserId = req.user.id;

    await pool.query(`
      UPDATE tasks 
      SET raw_data = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(rawData), taskId]);

    try {
      await pool.query(`
        INSERT INTO task_history (task_id, changed_by, changes, comment, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [
        taskId,
        req.user.id,
        JSON.stringify({ tmc_custody: { accepted: true, by: accepterName, at: acceptDate } }),
        `Электронный акцепт ТМЦ в подотчет: ${accepterName} принял материальную ответственность`
      ]);
    } catch (_) {}

    res.json({
      success: true,
      tmcAccepted: true,
      tmcAcceptedAt: acceptDate,
      tmcAcceptedBy: accepterName
    });
  } catch (err) {
    console.error('Error accepting TMC custody:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/:id/materials/accept-logist (Утверждение отчёта по ТМЦ логистом — Задача 5.6)
router.post('/tasks/:id/materials/accept-logist', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;
    const { rows: taskRows } = await client.query('SELECT * FROM tasks WHERE id = $1 FOR UPDATE', [taskId]);
    if (!taskRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    const task = taskRows[0];
    let rawData = task.raw_data || task.rawData || {};
    if (typeof rawData === 'string') {
      try { rawData = JSON.parse(rawData); } catch { rawData = {}; }
    }

    const logistName = req.user.full_name || req.user.username || 'Логист';
    const acceptDate = new Date().toLocaleString('ru-RU');

    rawData.tmcLogistAccepted = true;
    rawData.tmcLogistAcceptedAt = acceptDate;
    rawData.tmcLogistAcceptedBy = logistName;
    rawData.tmcLogistAcceptedUserId = req.user.id;

    await client.query(`
      UPDATE tasks
      SET raw_data = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(rawData), taskId]);

    await client.query(`
      UPDATE material_shipments
      SET logist_accepted_by = $1, logist_accepted_at = NOW(), updated_at = NOW()
      WHERE task_id = $2
    `, [req.user.id, taskId]);

    await client.query('COMMIT');
    res.json({
      success: true,
      tmcLogistAccepted: true,
      tmcLogistAcceptedAt: acceptDate,
      tmcLogistAcceptedBy: logistName
    });
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
    `, [taskId, req.file.path, fixUtf8Filename(req.file.originalname), req.file.mimetype, req.file.size, req.user.id]);

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
  if (!['admin', 'director', 'logistics', 'to_engineer'].includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
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
  if (!['admin', 'director', 'logistics', 'to_engineer'].includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
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

// ─── 9. ОТГРУЗКИ МАТЕРИАЛОВ (material_shipments, material_shipment_items — задачи 5.1–5.4) ─────

// GET /api/tasks/:id/shipments
router.get('/tasks/:id/shipments', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { rows: taskRows } = await pool.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
    if (!taskRows.length) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    const { rows } = await pool.query(`
      SELECT s.*,
             u_cr.full_name AS created_by_name,
             u_sh.full_name AS shipped_by_name,
             u_ac.full_name AS accepted_by_name,
             u_lo.full_name AS logist_accepted_by_name,
             COALESCE(COUNT(si.id), 0)::int AS items_count,
             COALESCE(SUM(si.shipped_qty), 0)::numeric AS total_shipped_qty
      FROM material_shipments s
      LEFT JOIN users u_cr ON u_cr.id = s.created_by
      LEFT JOIN users u_sh ON u_sh.id = s.shipped_by
      LEFT JOIN users u_ac ON u_ac.id = s.accepted_by
      LEFT JOIN users u_lo ON u_lo.id = s.logist_accepted_by
      LEFT JOIN material_shipment_items si ON si.shipment_id = s.id
      WHERE s.task_id = $1
      GROUP BY s.id, u_cr.full_name, u_sh.full_name, u_ac.full_name, u_lo.full_name
      ORDER BY s.shipment_date DESC, s.id DESC
    `, [taskId]);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tasks/:id/shipments/:shipmentId
router.get('/tasks/:id/shipments/:shipmentId', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const shipmentId = parseInt(req.params.shipmentId, 10);
    if (!Number.isInteger(shipmentId)) {
      return res.status(400).json({ error: 'Некорректный ID отгрузки' });
    }

    const { rows: sRows } = await pool.query(`
      SELECT s.*,
             u_cr.full_name AS created_by_name,
             u_sh.full_name AS shipped_by_name,
             u_ac.full_name AS accepted_by_name,
             u_lo.full_name AS logist_accepted_by_name
      FROM material_shipments s
      LEFT JOIN users u_cr ON u_cr.id = s.created_by
      LEFT JOIN users u_sh ON u_sh.id = s.shipped_by
      LEFT JOIN users u_ac ON u_ac.id = s.accepted_by
      LEFT JOIN users u_lo ON u_lo.id = s.logist_accepted_by
      WHERE s.id = $1 AND s.task_id = $2
    `, [shipmentId, taskId]);

    if (!sRows.length) {
      return res.status(404).json({ error: 'Отгрузка не найдена' });
    }

    const shipment = sRows[0];

    const { rows: itemRows } = await pool.query(`
      SELECT si.*,
             sc.name_short AS supplier_contractor_name_snapshot
      FROM material_shipment_items si
      LEFT JOIN contractors sc ON sc.id = si.supplier_contractor_id_snapshot
      WHERE si.shipment_id = $1
      ORDER BY si.id ASC
    `, [shipmentId]);

    shipment.items = itemRows;
    res.json(shipment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tasks/:id/shipments
router.post('/tasks/:id/shipments', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;

    const { rows: taskRows } = await client.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
    if (!taskRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    const {
      shipment_number,
      shipment_date,
      status = 'draft',
      carrier = null,
      comment = null,
      items
    } = req.body;

    if (!['draft', 'shipped'].includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недопустимый статус отгрузки при создании (допустимы: draft, shipped)' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Список отгружаемых позиций не может быть пустым' });
    }

    // Проверяем каждую позицию
    const validatedItems = [];
    for (const it of items) {
      const shippedQty = Number(it.shipped_qty);
      if (!Number.isFinite(shippedQty) || shippedQty <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Отгружаемое количество должно быть положительным числом (> 0)' });
      }

      let tiRow = null;
      let tmRow = null;

      if (it.task_item_id) {
        const tiId = parseInt(it.task_item_id, 10);
        const { rows: checkTi } = await client.query('SELECT * FROM task_items WHERE id = $1', [tiId]);
        if (!checkTi.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: `Строка спецификации #${tiId} не найдена` });
        }
        if (checkTi[0].task_id !== taskId) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: `Строка спецификации #${tiId} принадлежит другой заявке` });
        }
        tiRow = checkTi[0];

        // Ищем соответствующую строку в task_materials
        const { rows: checkTm } = await client.query('SELECT * FROM task_materials WHERE task_id = $1 AND task_item_id = $2', [taskId, tiId]);
        if (checkTm.length) tmRow = checkTm[0];
      } else if (it.task_material_id) {
        const tmId = parseInt(it.task_material_id, 10);
        const { rows: checkTm } = await client.query('SELECT * FROM task_materials WHERE id = $1', [tmId]);
        if (!checkTm.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: `Строка материала #${tmId} не найдена` });
        }
        if (checkTm[0].task_id !== taskId) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: `Строка материала #${tmId} принадлежит другой заявке` });
        }
        tmRow = checkTm[0];
        if (tmRow.task_item_id) {
          const { rows: checkTi } = await client.query('SELECT * FROM task_items WHERE id = $1 AND task_id = $2', [tmRow.task_item_id, taskId]);
          if (checkTi.length) tiRow = checkTi[0];
        }
      } else {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Каждая строка должна содержать task_item_id или task_material_id' });
      }

      const itemName = (tiRow && tiRow.work_type) || (tmRow && tmRow.item_name) || 'Материал';
      const article = (tiRow && (tiRow.article_plan || tiRow.article)) || (tmRow && tmRow.article) || null;
      const manufacturer = (tiRow && tiRow.manufacturer) || (tmRow && tmRow.manufacturer) || null;
      const unit = (tiRow && tiRow.unit) || (tmRow && tmRow.unit) || 'шт.';
      const source = (tiRow && tiRow.source) || (tmRow && tmRow.source) || null;
      const supplier = (tiRow && tiRow.supplier) || (tmRow && tmRow.supplier) || null;
      const supplierContractorId = (tiRow && tiRow.supplier_contractor_id) || (tmRow && tmRow.supplier_contractor_id) || null;
      const price = (tiRow && (parseFloat(tiRow.price_customer || tiRow.price_contractor) || 0)) || (tmRow && (parseFloat(tmRow.price) || 0)) || 0;

      validatedItems.push({
        task_item_id: tiRow ? tiRow.id : null,
        task_material_id: tmRow ? tmRow.id : null,
        shipped_qty: shippedQty,
        item_name_snapshot: itemName,
        article_snapshot: article,
        manufacturer_snapshot: manufacturer,
        unit_snapshot: unit,
        source_snapshot: source,
        supplier_snapshot: supplier,
        supplier_contractor_id_snapshot: supplierContractorId,
        price_snapshot: price
      });
    }

    let finalShipmentNumber = shipment_number ? String(shipment_number).trim() : '';
    if (!finalShipmentNumber) {
      const { rows: countRows } = await client.query('SELECT COUNT(*) FROM material_shipments WHERE task_id = $1', [taskId]);
      const nextNum = parseInt(countRows[0].count, 10) + 1;
      finalShipmentNumber = `ОТГ-${taskId}-${String(nextNum).padStart(2, '0')}`;
    }

    const finalShipmentDate = shipment_date ? String(shipment_date).trim() : new Date().toISOString().slice(0, 10);
    const isShipped = status === 'shipped';

    const { rows: sRows } = await client.query(`
      INSERT INTO material_shipments (
        task_id, shipment_number, shipment_date, status, carrier, comment,
        created_by, created_at, shipped_by, shipped_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)
      RETURNING *
    `, [
      taskId,
      finalShipmentNumber,
      finalShipmentDate,
      status,
      carrier ? String(carrier).trim() : null,
      comment ? String(comment).trim() : null,
      req.user.id,
      isShipped ? req.user.id : null,
      isShipped ? new Date() : null
    ]);

    const createdShipment = sRows[0];
    const createdItems = [];

    for (const vIt of validatedItems) {
      const { rows: siRows } = await client.query(`
        INSERT INTO material_shipment_items (
          shipment_id, task_item_id, task_material_id, shipped_qty,
          accepted_qty, fact_qty,
          item_name_snapshot, article_snapshot, manufacturer_snapshot,
          unit_snapshot, source_snapshot, supplier_snapshot,
          supplier_contractor_id_snapshot, price_snapshot
        ) VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        createdShipment.id,
        vIt.task_item_id,
        vIt.task_material_id,
        vIt.shipped_qty,
        vIt.item_name_snapshot,
        vIt.article_snapshot,
        vIt.manufacturer_snapshot,
        vIt.unit_snapshot,
        vIt.source_snapshot,
        vIt.supplier_snapshot,
        vIt.supplier_contractor_id_snapshot,
        vIt.price_snapshot
      ]);
      createdItems.push(siRows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      shipment: { ...createdShipment, items: createdItems }
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// PUT /api/tasks/:id/shipments/:shipmentId
router.put('/tasks/:id/shipments/:shipmentId', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;
    const shipmentId = parseInt(req.params.shipmentId, 10);
    if (!Number.isInteger(shipmentId)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Некорректный ID отгрузки' });
    }

    const { rows: sRows } = await client.query('SELECT * FROM material_shipments WHERE id = $1 AND task_id = $2 FOR UPDATE', [shipmentId, taskId]);
    if (!sRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Отгрузка не найдена' });
    }

    const curShipment = sRows[0];

    // ЗАДАЧА 5.3: Если отгрузка уже переведена в 'shipped' (или последующие), изменение строго запрещено (409 Conflict)
    if (curShipment.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Сформированная отгрузка защищена от изменений' });
    }

    const {
      shipment_number,
      shipment_date,
      carrier,
      comment,
      status,
      items
    } = req.body;

    if (status !== undefined && !['draft', 'shipped'].includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Некорректный статус отгрузки' });
    }

    const newNumber = shipment_number !== undefined ? (String(shipment_number).trim() || curShipment.shipment_number) : curShipment.shipment_number;
    const newDate = shipment_date !== undefined ? (String(shipment_date).trim() || curShipment.shipment_date) : curShipment.shipment_date;
    const newCarrier = carrier !== undefined ? (carrier ? String(carrier).trim() : null) : curShipment.carrier;
    const newComment = comment !== undefined ? (comment ? String(comment).trim() : null) : curShipment.comment;

    const willBeShipped = status === 'shipped';
    const newStatus = willBeShipped ? 'shipped' : 'draft';

    // Если переданы items — обновляем строки
    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Список отгружаемых позиций не может быть пустым' });
      }

      const validatedItems = [];
      for (const it of items) {
        const shippedQty = Number(it.shipped_qty);
        if (!Number.isFinite(shippedQty) || shippedQty <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Отгружаемое количество должно быть положительным числом (> 0)' });
        }

        let tiRow = null;
        let tmRow = null;

        if (it.task_item_id) {
          const tiId = parseInt(it.task_item_id, 10);
          const { rows: checkTi } = await client.query('SELECT * FROM task_items WHERE id = $1', [tiId]);
          if (!checkTi.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Строка спецификации #${tiId} не найдена` });
          }
          if (checkTi[0].task_id !== taskId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: `Строка спецификации #${tiId} принадлежит другой заявке` });
          }
          tiRow = checkTi[0];
          const { rows: checkTm } = await client.query('SELECT * FROM task_materials WHERE task_id = $1 AND task_item_id = $2', [taskId, tiId]);
          if (checkTm.length) tmRow = checkTm[0];
        } else if (it.task_material_id) {
          const tmId = parseInt(it.task_material_id, 10);
          const { rows: checkTm } = await client.query('SELECT * FROM task_materials WHERE id = $1', [tmId]);
          if (!checkTm.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Строка материала #${tmId} не найдена` });
          }
          if (checkTm[0].task_id !== taskId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: `Строка материала #${tmId} принадлежит другой заявке` });
          }
          tmRow = checkTm[0];
          if (tmRow.task_item_id) {
            const { rows: checkTi } = await client.query('SELECT * FROM task_items WHERE id = $1 AND task_id = $2', [tmRow.task_item_id, taskId]);
            if (checkTi.length) tiRow = checkTi[0];
          }
        } else {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Каждая строка должна содержать task_item_id или task_material_id' });
        }

        const itemName = (tiRow && tiRow.work_type) || (tmRow && tmRow.item_name) || 'Материал';
        const article = (tiRow && (tiRow.article_plan || tiRow.article)) || (tmRow && tmRow.article) || null;
        const manufacturer = (tiRow && tiRow.manufacturer) || (tmRow && tmRow.manufacturer) || null;
        const unit = (tiRow && tiRow.unit) || (tmRow && tmRow.unit) || 'шт.';
        const source = (tiRow && tiRow.source) || (tmRow && tmRow.source) || null;
        const supplier = (tiRow && tiRow.supplier) || (tmRow && tmRow.supplier) || null;
        const supplierContractorId = (tiRow && tiRow.supplier_contractor_id) || (tmRow && tmRow.supplier_contractor_id) || null;
        const price = (tiRow && (parseFloat(tiRow.price_customer || tiRow.price_contractor) || 0)) || (tmRow && (parseFloat(tmRow.price) || 0)) || 0;

        validatedItems.push({
          task_item_id: tiRow ? tiRow.id : null,
          task_material_id: tmRow ? tmRow.id : null,
          shipped_qty: shippedQty,
          item_name_snapshot: itemName,
          article_snapshot: article,
          manufacturer_snapshot: manufacturer,
          unit_snapshot: unit,
          source_snapshot: source,
          supplier_snapshot: supplier,
          supplier_contractor_id_snapshot: supplierContractorId,
          price_snapshot: price
        });
      }

      // Удаляем старые строки черновика и вставляем обновленные
      await client.query('DELETE FROM material_shipment_items WHERE shipment_id = $1', [shipmentId]);

      for (const vIt of validatedItems) {
        await client.query(`
          INSERT INTO material_shipment_items (
            shipment_id, task_item_id, task_material_id, shipped_qty,
            accepted_qty, fact_qty,
            item_name_snapshot, article_snapshot, manufacturer_snapshot,
            unit_snapshot, source_snapshot, supplier_snapshot,
            supplier_contractor_id_snapshot, price_snapshot
          ) VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          shipmentId,
          vIt.task_item_id,
          vIt.task_material_id,
          vIt.shipped_qty,
          vIt.item_name_snapshot,
          vIt.article_snapshot,
          vIt.manufacturer_snapshot,
          vIt.unit_snapshot,
          vIt.source_snapshot,
          vIt.supplier_snapshot,
          vIt.supplier_contractor_id_snapshot,
          vIt.price_snapshot
        ]);
      }
    }

    const { rows: updatedSRows } = await client.query(`
      UPDATE material_shipments SET
        shipment_number = $1,
        shipment_date = $2,
        carrier = $3,
        comment = $4,
        status = $5,
        shipped_by = CASE WHEN $6::boolean THEN $7 ELSE shipped_by END,
        shipped_at = CASE WHEN $6::boolean THEN NOW() ELSE shipped_at END,
        updated_at = NOW()
      WHERE id = $8 AND task_id = $9
      RETURNING *
    `, [
      newNumber,
      newDate,
      newCarrier,
      newComment,
      newStatus,
      willBeShipped,
      req.user.id,
      shipmentId,
      taskId
    ]);

    const { rows: finalItems } = await client.query(`
      SELECT si.*, sc.name_short AS supplier_contractor_name_snapshot
      FROM material_shipment_items si
      LEFT JOIN contractors sc ON sc.id = si.supplier_contractor_id_snapshot
      WHERE si.shipment_id = $1
      ORDER BY si.id ASC
    `, [shipmentId]);

    await client.query('COMMIT');
    res.json({
      success: true,
      shipment: { ...updatedSRows[0], items: finalItems }
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/tasks/:id/shipments/:shipmentId
router.delete('/tasks/:id/shipments/:shipmentId', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
  try {
    const taskId = req.params.id;
    const shipmentId = parseInt(req.params.shipmentId, 10);
    if (!Number.isInteger(shipmentId)) {
      return res.status(400).json({ error: 'Некорректный ID отгрузки' });
    }

    const { rows } = await pool.query('SELECT * FROM material_shipments WHERE id = $1 AND task_id = $2', [shipmentId, taskId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Отгрузка не найдена' });
    }

    const shipment = rows[0];

    // ЗАДАЧА 5.3: Запрет удаления отправленной отгрузки (409 Conflict)
    if (shipment.status !== 'draft') {
      return res.status(409).json({ error: 'Нельзя удалить уже отправленную отгрузку' });
    }

    await pool.query('DELETE FROM material_shipments WHERE id = $1 AND task_id = $2', [shipmentId, taskId]);
    res.json({ success: true, message: 'Черновик отгрузки удален' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tasks/:id/shipments/:shipmentId/accept (Акцепт отгрузки подрядчиком — Задача 5.5)
router.post('/tasks/:id/shipments/:shipmentId/accept', authenticateToken, async (req, res) => {
  const allowedRoles = ['worker', 'foreman', 'contractor', 'subcontractor', 'installer', 'master', 'admin', 'director', 'manager', 'to_engineer'];
  if (!req.user || !allowedRoles.includes(String(req.user.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'У вас нет прав на акцепт отгрузки подрядчиком' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;
    const shipmentId = parseInt(req.params.shipmentId, 10);
    if (!Number.isInteger(shipmentId)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Некорректный ID отгрузки' });
    }

    const { rows: sRows } = await client.query(
      'SELECT * FROM material_shipments WHERE id = $1 AND task_id = $2 FOR UPDATE',
      [shipmentId, taskId]
    );
    if (!sRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Отгрузка не найдена' });
    }

    const curShipment = sRows[0];

    // ЗАДАЧА 5.5: Акцепт разрешён ТОЛЬКО для отгрузки со статусом 'shipped'
    if (curShipment.status !== 'shipped') {
      await client.query('ROLLBACK');
      if (curShipment.status === 'draft') {
        return res.status(409).json({ error: 'Нельзя акцептовать черновик отгрузки' });
      }
      return res.status(409).json({ error: 'Отгрузка уже акцептована ранее' });
    }

    const { items, comment, acceptance_comment } = req.body;
    const accComment = (acceptance_comment !== undefined ? acceptance_comment : comment) ? String(acceptance_comment !== undefined ? acceptance_comment : comment).trim() : '';

    const { rows: curItems } = await client.query(
      'SELECT * FROM material_shipment_items WHERE shipment_id = $1 ORDER BY id ASC',
      [shipmentId]
    );

    let hasDiscrepancy = false;
    const itemUpdates = [];

    for (const curIt of curItems) {
      const match = Array.isArray(items) ? items.find(x => Number(x.id) === curIt.id || (x.task_item_id && Number(x.task_item_id) === curIt.task_item_id) || (x.task_material_id && Number(x.task_material_id) === curIt.task_material_id)) : null;

      let accQty = curIt.shipped_qty;
      let discReason = null;

      if (match) {
        if (match.accepted_qty === null || match.accepted_qty === undefined || match.accepted_qty === '') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Принятое количество должно быть указано для всех позиций' });
        }
        const parsed = Number(match.accepted_qty);
        if (!Number.isFinite(parsed) || parsed < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Принятое количество должно быть неотрицательным числом (>= 0)' });
        }
        accQty = parsed;
        discReason = match.discrepancy_reason ? String(match.discrepancy_reason).trim() : null;
      }

      if (Number(accQty) !== Number(curIt.shipped_qty)) {
        hasDiscrepancy = true;
      }

      itemUpdates.push({
        id: curIt.id,
        accepted_qty: accQty,
        discrepancy_reason: discReason
      });
    }

    // Если есть расхождение — комментарий обязателен!
    if (hasDiscrepancy && !accComment) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'При наличии расхождений комментарий акцепта обязателен' });
    }

    const finalStatus = hasDiscrepancy ? 'accepted_discrepancy' : 'accepted';
    const acceptanceResult = hasDiscrepancy ? 'discrepancy' : 'full';

    // Обновляем строки отгрузки (СТРОГО НЕ МЕНЯЯ shipped_qty!)
    for (const u of itemUpdates) {
      await client.query(`
        UPDATE material_shipment_items
        SET accepted_qty = $1, discrepancy_reason = $2
        WHERE id = $3
      `, [u.accepted_qty, u.discrepancy_reason, u.id]);
    }

    // Обновляем шапку отгрузки
    const { rows: updatedShipmentRows } = await client.query(`
      UPDATE material_shipments SET
        status = $1,
        accepted_by = $2,
        accepted_at = NOW(),
        acceptance_result = $3,
        acceptance_comment = $4,
        updated_at = NOW()
      WHERE id = $5 AND task_id = $6
      RETURNING *
    `, [
      finalStatus,
      req.user.id,
      acceptanceResult,
      accComment || null,
      shipmentId,
      taskId
    ]);

    // Синхронизируем флаг акцепта в tasks.raw_data для открытия фактического расхода
    const { rows: taskRows } = await client.query('SELECT raw_data FROM tasks WHERE id = $1', [taskId]);
    if (taskRows.length) {
      let rawData = taskRows[0].raw_data || {};
      if (typeof rawData === 'string') {
        try { rawData = JSON.parse(rawData); } catch { rawData = {}; }
      }
      rawData.tmcAccepted = true;
      if (!rawData.tmcAcceptedAt) rawData.tmcAcceptedAt = new Date().toLocaleString('ru-RU');
      if (!rawData.tmcAcceptedBy) rawData.tmcAcceptedBy = req.user.full_name || req.user.username || 'Исполнитель';
      await client.query('UPDATE tasks SET raw_data = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(rawData), taskId]);
    }

    const { rows: finalItems } = await client.query(
      'SELECT * FROM material_shipment_items WHERE shipment_id = $1 ORDER BY id ASC',
      [shipmentId]
    );

    await client.query('COMMIT');
    res.json({
      success: true,
      shipment: { ...updatedShipmentRows[0], items: finalItems }
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /api/tasks/:id/shipments/:shipmentId/export-excel (Экспорт отгрузки в Excel — Задача 5.7)
router.get('/tasks/:id/shipments/:shipmentId/export-excel', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const shipmentId = parseInt(req.params.shipmentId, 10);
    if (!Number.isInteger(shipmentId)) {
      return res.status(400).json({ error: 'Некорректный ID отгрузки' });
    }

    const { buffer, shipment } = await generateShipmentExcel(taskId, shipmentId);
    const num = (shipment.shipment_number || shipmentId).replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, '_');
    const safeAscii = `Shipment_${taskId}_${shipmentId}.xlsx`;
    const utf8Filename = `Отгрузка_${num}_${taskId}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`);
    res.send(buffer);
  } catch (err) {
    console.error('Error exporting shipment Excel:', err);
    res.status(500).json({ error: 'Ошибка формирования отгрузки в Excel: ' + err.message });
  }
});

export default router;
