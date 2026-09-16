import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { computeStats, buildChainsFromRows, rowToTask, safeDate } from '../services/helpers.js';
import { cleanData, getInitialStage } from '../services/pipeline.js';
import { runBackgroundGeocoding } from '../services/geoWorker.js';

const router = express.Router();

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE archived = false');
    if (!rows.length) return res.json({ tasks:{total:0,done:0,pending:0,cancelled:0}, orders:{total:0,pending:0}, supply:{steps:6,completed:0,overdue:0}, revenue:{total:0,month:0} });
    res.json(computeStats(rows.map(rowToTask)));
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
    const { rows } = await pool.query('SELECT * FROM tasks WHERE archived = false');
    res.json(buildChainsFromRows(rows.map(rowToTask)));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/chains/:id', authenticateToken, (req, res) => res.json({ success: true }));

// ─── API: IMPORT META ─────────────────────────────────────────────────────────
router.get('/import-info', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM import_meta WHERE id=1');
    const m = rows[0] || {};
    res.json({ importedFrom: m.imported_from||null, importedAt: m.imported_at||null, rowCount: m.row_count||0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── API: IMPORT ROWS (батчи от браузера) ────────────────────────────────────
router.post('/excel/import-rows', async (req, res) => {
  try {
    let { rows: newBatch, name, isFirst, totalRows } = req.body;
    newBatch = await cleanData(newBatch);
    if (!Array.isArray(newBatch)) return res.status(400).json({ error: 'rows must be array' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert каждой заявки из батча
      for (const t of newBatch) {
        await client.query(`
          INSERT INTO tasks (
            id, sheet, region, address, work_type, tip_obj, gosb, vsp,
            date_zayavki, deadline, date_vnesen, manager, contact, contractor,
            in_order, fact, obsledovanie, dostup, data_vyhoda, priemka, oplata,
            id_status, amount, distance_km, price_per_unit,
            tech_link, edo_number, invoice_info, vedo_status, excel_comment,
            status, priority, overdue_days, stage, archived, raw_data
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,
            $9,$10,$11,$12,$13,$14,
            $15,$16,$17,$18,$19,$20,$21,
            $22,$23,$24,$25,
            $26,$27,$28,$29,$30,
            $31,$32,$33,$34,false,$35
          )
          ON CONFLICT (id) DO UPDATE SET
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
          JSON.stringify(t.rawData || {})
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
      if (isDone && name) {
        const { rows: cnt } = await client.query('SELECT COUNT(*) FROM tasks WHERE archived=false');
        await client.query(`
          UPDATE import_meta SET imported_from=$1, imported_at=NOW(), row_count=$2 WHERE id=1
        `, [name, Number(cnt[0].count)]);
        runBackgroundGeocoding();
      }

      await client.query('COMMIT');
      res.json({ success: true, done: isDone });
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
