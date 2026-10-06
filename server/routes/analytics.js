import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { computeStats, buildChainsFromRows, rowToTask, safeDate } from '../services/helpers.js';
import { cleanData, getInitialStage } from '../services/pipeline.js';
import { runBackgroundGeocoding } from '../services/geoWorker.js';

const router = express.Router();

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(CASE WHEN status = 'done' THEN 1 END)::int AS done,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int AS cancelled,
        COUNT(CASE WHEN overdue_days > 0 THEN 1 END)::int AS overdue,
        COALESCE(SUM(amount), 0)::numeric AS revenue
      FROM tasks 
      WHERE archived = false
    `);
    const r = rows[0] || {};
    const total = Number(r.total) || 0;
    const done = Number(r.done) || 0;
    const cancelled = Number(r.cancelled) || 0;
    const overdue = Number(r.overdue) || 0;
    const revenue = Number(r.revenue) || 0;
    const pending = total - done - cancelled;

    res.json({
      tasks:   { total, done, pending, cancelled },
      orders:  { total, pending, done },
      supply:  { steps: 6, completed: done, overdue },
      revenue: { total: revenue, month: revenue }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Сводная аналитика дашборда с группировками по Заказчикам, Исполнителям, Оплатам
router.get('/stats/overview', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE archived = false');
    const tasks = rows.map(rowToTask);

    // 1. По Заказчикам
    const byCustomer = {};
    // 2. По Исполнителям / Подрядчикам
    const byExecutor = {};
    // 3. Финансы (Оплаты нам vs Оплаты наши)
    let totalRevenueFromCustomer = 0; // Нам причитается
    let totalPaidFromCustomer = 0;    // Нам оплачено
    let totalPayToSubcontractors = 0; // Наша оплата подрядчикам
    let totalMaterialsTmc = 0;        // Затраты на материалы

    // 4. Календарь (дедлайны по месяцам/неделям)
    const calendarDeadlines = {};

    tasks.forEach(t => {
      const cust = t.customer || 'ПАО Сбербанк';
      if (!byCustomer[cust]) {
        byCustomer[cust] = { name: cust, count: 0, done: 0, overdue: 0, totalAmount: 0 };
      }
      byCustomer[cust].count++;
      if (t.status === 'done') byCustomer[cust].done++;
      if (t.overdueDays > 0) byCustomer[cust].overdue++;
      byCustomer[cust].totalAmount += (t.amount || 0);

      const exec = t.assignee || t.contractor || 'Не назначен';
      if (!byExecutor[exec]) {
        byExecutor[exec] = { name: exec, count: 0, done: 0, inWork: 0, ports: 0, pay: 0 };
      }
      byExecutor[exec].count++;
      if (t.status === 'done') byExecutor[exec].done++;
      else byExecutor[exec].inWork++;
      byExecutor[exec].ports += (t.fact || t.inOrder || 0);

      const workPay = Math.round((t.fact || t.inOrder || 0) * (t.pricePerUnit || 0));
      const transportPay = Number(t.distanceKm || 0);
      const extrasPay = Number(t.extras || 0);
      const subTotal = workPay + transportPay + extrasPay;
      byExecutor[exec].pay += subTotal;

      totalRevenueFromCustomer += (t.amount || 0);
      if (t.status === 'done' && (t.oplata || '').toLowerCase().includes('оплач')) {
        totalPaidFromCustomer += (t.amount || 0);
      }
      totalPayToSubcontractors += subTotal;
      totalMaterialsTmc += (t.tmc || 0);

      if (t.deadline) {
        const monthKey = t.deadline.slice(0, 7); // YYYY-MM
        if (!calendarDeadlines[monthKey]) calendarDeadlines[monthKey] = { month: monthKey, total: 0, overdue: 0 };
        calendarDeadlines[monthKey].total++;
        if (t.overdueDays > 0) calendarDeadlines[monthKey].overdue++;
      }
    });

    res.json({
      customers: Object.values(byCustomer).sort((a,b) => b.count - a.count),
      executors: Object.values(byExecutor).sort((a,b) => b.count - a.count),
      finance: {
        customerTotal: totalRevenueFromCustomer,
        customerPaid: totalPaidFromCustomer,
        customerDebt: Math.max(0, totalRevenueFromCustomer - totalPaidFromCustomer),
        subcontractorsPay: totalPayToSubcontractors,
        materialsTmc: totalMaterialsTmc,
        grossMargin: totalRevenueFromCustomer - totalPayToSubcontractors - totalMaterialsTmc
      },
      calendar: Object.values(calendarDeadlines).sort((a,b) => a.month.localeCompare(b.month))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/chains', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COALESCE(NULLIF(TRIM(region), ''), 'Прочее') AS region,
        COUNT(*)::int AS total_tasks,
        COUNT(CASE WHEN status = 'done' THEN 1 END)::int AS done_tasks,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int AS cancelled_tasks,
        COALESCE(SUM(amount), 0)::numeric AS total_amount
      FROM tasks 
      WHERE archived = false
      GROUP BY COALESCE(NULLIF(TRIM(region), ''), 'Прочее')
      ORDER BY total_tasks DESC
    `);
    const steps = ['Заявка','Обследование','Монтаж','Контроль','Приёмка','Оплата'];
    const chains = rows.map(r => {
      const total = Number(r.total_tasks) || 0;
      const done = Number(r.done_tasks) || 0;
      const cancelled = Number(r.cancelled_tasks) || 0;
      const ratio = total > 0 ? done / total : 0;
      const currentStep = Math.min(Math.floor(ratio * steps.length), steps.length - 1);
      return {
        id: r.region,
        name: `${r.region} (${total} заявок)`,
        status: done === total ? 'completed' : 'in_progress',
        steps,
        currentStep,
        totalTasks: total,
        doneTasks: done,
        cancelledTasks: cancelled,
        inProgressTasks: total - done - cancelled,
        totalAmount: Number(r.total_amount) || 0
      };
    });
    res.json(chains);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/chains/:id', authenticateToken, (req, res) => res.json({ success: true }));

// ─── API: ЖУРНАЛ ИСТОРИИ ИМПОРТОВ (BATCHES) ──────────────────────────────────
router.get('/import/batches', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, file_name, user_name, imported_at, total_rows, new_tasks_count, updated_tasks_count, status
      FROM import_batches
      ORDER BY imported_at DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/import/batches/:id/tasks', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, region, address, work_type, contractor, amount, date_zayavki, first_imported_at
      FROM tasks
      WHERE import_batch_id = $1
      ORDER BY id
      LIMIT 200
    `, [req.params.id]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── API: IMPORT META ─────────────────────────────────────────────────────────
router.get('/import-info', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM import_meta WHERE id=1');
    const m = rows[0] || {};
    res.json({ importedFrom: m.imported_from||null, importedAt: m.imported_at||null, rowCount: m.row_count||0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── API: IMPORT ROWS (батчи от браузера) ────────────────────────────────────
router.post('/excel/import-rows', authenticateToken, requireRole('admin', 'director', 'manager'), async (req, res) => {
  try {
    let { rows: newBatch, name, isFirst, totalRows, batchId } = req.body;
    newBatch = await cleanData(newBatch);
    if (!Array.isArray(newBatch)) return res.status(400).json({ error: 'rows must be array' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let currentBatchId = batchId;
      if (isFirst || !currentBatchId) {
        const authorName = req.user?.fullName || req.user?.username || 'Администратор';

        const { rows: bRows } = await client.query(`
          INSERT INTO import_batches (file_name, user_name, total_rows, imported_at, status)
          VALUES ($1, $2, $3, NOW(), 'processing')
          RETURNING id
        `, [name || 'Реестр.xlsx', authorName, Number(totalRows) || 0]);
        currentBatchId = bRows[0].id;
      }

      // Upsert каждой заявки из батча
      for (const t of newBatch) {
        await client.query(`
          INSERT INTO tasks (
            id, sheet, region, address, work_type, tip_obj, gosb, vsp,
            date_zayavki, deadline, date_vnesen, manager, contact, contractor,
            in_order, fact, obsledovanie, dostup, data_vyhoda, priemka, oplata,
            id_status, amount, distance_km, price_per_unit,
            tech_link, edo_number, invoice_info, vedo_status, excel_comment,
            status, priority, overdue_days, stage, archived, raw_data,
            import_source, first_imported_at, last_imported_at, import_batch_id
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,
            $9,$10,$11,$12,$13,$14,
            $15,$16,$17,$18,$19,$20,$21,
            $22,$23,$24,$25,
            $26,$27,$28,$29,$30,
            $31,$32,$33,$34,false,$35,
            $36, NOW(), NOW(), $37
          )
          ON CONFLICT (id) DO UPDATE SET
            import_source = COALESCE(tasks.import_source, EXCLUDED.import_source),
            last_imported_at = NOW(),
            import_batch_id  = EXCLUDED.import_batch_id,
            sheet         = EXCLUDED.sheet,
            region        = EXCLUDED.region,
            address       = EXCLUDED.address,
            work_type     = EXCLUDED.work_type,
            tip_obj       = EXCLUDED.tip_obj,
            gosb          = EXCLUDED.gosb,
            vsp           = EXCLUDED.vsp,
            date_zayavki  = EXCLUDED.date_zayavki,
            deadline      = EXCLUDED.deadline,
            date_vnesen   = EXCLUDED.date_vnesen,
            manager       = EXCLUDED.manager,
            in_order       = COALESCE(NULLIF(tasks.in_order, 0), EXCLUDED.in_order),
            fact           = COALESCE(NULLIF(tasks.fact, 0), EXCLUDED.fact),
            amount         = COALESCE(NULLIF(tasks.amount, 0), EXCLUDED.amount),
            distance_km    = COALESCE(NULLIF(tasks.distance_km, 0), EXCLUDED.distance_km),
            price_per_unit = COALESCE(NULLIF(tasks.price_per_unit, 0), EXCLUDED.price_per_unit),
            tmc           = COALESCE(NULLIF(tasks.tmc, 0), tasks.tmc),
            extras        = COALESCE(NULLIF(tasks.extras, 0), tasks.extras),
            obsledovanie  = EXCLUDED.obsledovanie,
            dostup        = EXCLUDED.dostup,
            data_vyhoda   = EXCLUDED.data_vyhoda,
            priemka       = EXCLUDED.priemka,
            oplata        = EXCLUDED.oplata,
            id_status     = EXCLUDED.id_status,
            tech_link     = EXCLUDED.tech_link,
            edo_number    = EXCLUDED.edo_number,
            invoice_info  = EXCLUDED.invoice_info,
            vedo_status   = EXCLUDED.vedo_status,
            excel_comment = EXCLUDED.excel_comment,
            status        = CASE WHEN tasks.status IN ('done', 'paid', 'cancelled') THEN tasks.status ELSE EXCLUDED.status END,
            priority      = EXCLUDED.priority,
            overdue_days  = EXCLUDED.overdue_days,
            archived      = false,
            updated_at    = NOW(),
            raw_data      = EXCLUDED.raw_data,
            contact       = COALESCE(NULLIF(tasks.contact, ''),    EXCLUDED.contact),
            contractor    = COALESCE(NULLIF(tasks.contractor, ''), EXCLUDED.contractor),
            stage         = COALESCE(tasks.stage,                  EXCLUDED.stage),
            assignee      = tasks.assignee,
            controller    = tasks.controller,
            comment       = tasks.comment,
            distributed_at= tasks.distributed_at,
            history       = tasks.history
        `, [
          t.id, t.sheet, t.region, t.address, t.workType, t.tipObj, t.gosb, t.vsp,
          safeDate(t.dateZayavki), safeDate(t.deadline), safeDate(t.currentDate), t.manager, t.contact, t.contractor,
          Number(t.inOrder)||0, Number(t.fact)||0, t.obsledovanie, t.dostup,
          safeDate(t.dataVyhoda), t.priemka, t.oplata,
          t.idStatus, Number(t.amount)||0, Number(t.distanceKm)||0, Number(t.pricePerUnit)||0,
          t.techLink, t.edoNumber, t.invoiceInfo, t.vedoStatus, t.excelComment,
          t.status||'progress', t.priority||'low', Number(t.overdueDays)||0,
          t.stage || getInitialStage(t.status, t),
          JSON.stringify(t.rawData || {}),
          name || 'Реестр.xlsx',
          currentBatchId
        ]);

        if (Array.isArray(t.items) && t.items.length > 0) {
          await client.query('DELETE FROM task_items WHERE task_id = $1', [t.id]);
          for (const item of t.items) {
            const q = Number(item.quantity) || 1;
            const priceCust = Number(item.priceCustomer) || 0;
            const amountCust = Number(item.amountCustomer) || (q * priceCust);
            const contractor = item.contractor ? String(item.contractor).trim() : null;
            await client.query(
              `INSERT INTO task_items (
                task_id, work_type, quantity, unit,
                price_customer, amount_customer,
                contractor_name, distance_km, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
              [
                t.id, item.workType || 'Работа', q, item.unit || 'шт.',
                priceCust, amountCust, contractor, Number(item.distanceKm) || 0
              ]
            );
          }
        }
      }

      // Последний батч — обновляем метаданные
      const isDone = req.body.isLast === true || !totalRows || (newBatch.length < 500);
      if (isDone) {
        if (name) {
          const { rows: cnt } = await client.query('SELECT COUNT(*) FROM tasks WHERE archived=false');
          await client.query(`
            UPDATE import_meta SET imported_from=$1, imported_at=NOW(), row_count=$2 WHERE id=1
          `, [name, Number(cnt[0].count)]);
        }

        if (currentBatchId) {
          const { rows: bStats } = await client.query(`
            SELECT 
              COUNT(*) as total_in_batch,
              COUNT(CASE WHEN first_imported_at >= NOW() - INTERVAL '15 minutes' THEN 1 END) as new_count
            FROM tasks WHERE import_batch_id = $1
          `, [currentBatchId]);
          const tot = Number(bStats[0]?.total_in_batch || 0);
          const nCnt = Number(bStats[0]?.new_count || 0);
          const uCnt = tot > nCnt ? (tot - nCnt) : 0;

          await client.query(`
            UPDATE import_batches SET
              total_rows = $1,
              new_tasks_count = $2,
              updated_tasks_count = $3,
              status = 'completed',
              imported_at = NOW()
            WHERE id = $4
          `, [tot || totalRows || 0, nCnt, uCnt, currentBatchId]);
        }

        runBackgroundGeocoding();
      }

      await client.query('COMMIT');
      res.json({ success: true, done: isDone, batchId: currentBatchId });
    } catch(e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch(e) {
    console.error('import-rows error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
