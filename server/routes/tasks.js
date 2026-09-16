import express from 'express';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadAttachment, UPLOADS_DIR } from '../middleware/upload.js';
import { rowToTask, safeDate, calcPricePerPort, calcTransport, calcTotal, fmtDate, numToWords, buildApp2, buildInvoice, buildAct } from '../services/helpers.js';
import { ID_ROLES, ID_STEPS, ID_STAGES, businessDue, hasRole, canStep, canUndo } from '../services/pipeline.js';
import { createNotification, sendEmail } from '../services/notifications.js';
import { cleanAddressDaData } from '../services/dadata.js';
import { runBackgroundGeocoding } from '../services/geoWorker.js';

const router = express.Router();

let io = null;
router.use((req, res, next) => {
  io = req.app.get('io');
  next();
});

router.get('/tasks/:id/payment-readiness', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Не найдено' })
    const t = rowToTask(rows[0])
    const { rows: photoRows } = await pool.query(
      `SELECT 1 FROM task_attachments WHERE task_id=$1 AND type='photo_report' LIMIT 1`, [req.params.id]
    )
    const { rows: notifRows } = await pool.query(
      `SELECT 1 FROM notifications WHERE link=$1 LIMIT 1`, [req.params.id]
    )
    res.json({
      photoReport: photoRows.length > 0,
      notificationSent: notifRows.length > 0,
      supplierOrderSigned: t.supplierOrderSigned,
      supplierIdUploaded: t.supplierIdUploaded,
      overdueReasonProvided: t.overdueDays > 0 ? !!t.overdueReason : true // причина нужна, только если есть просрочка
    })
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.get('/tasks', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT t.*,
        (SELECT COUNT(*) FROM remarks rm WHERE rm.task_id = t.id AND rm.resolved_at IS NULL)::integer AS open_remarks_count
      FROM tasks t
    `;
    let params = [];

    // Если зашел рабочий (worker), показываем только ЕГО задачи
    if (req.user.role === 'worker') {
      query += ' WHERE t.assignee = $1';
      params.push(req.user.fullName);
    }

    query += ' ORDER BY t.created_at';
    const { rows } = await pool.query(query, params);
    
    // Если рабочий — удаляем финансовую информацию из ответа, чтобы он её не видел
    const tasks = rows.map(r => {
      const task = rowToTask(r);
      if (req.user.role === 'worker') {
        task.amount = 0;
        task.tmc = 0;
        task.extras = 0;
      }
      return task;
    });

    res.json(tasks);
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// Создание одиночной заявки вручную (или через ИИ)
router.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const t = req.body;
    
    // Проверка обязательного поля
    if (!t.id || t.id.trim() === '') {
      return res.status(400).json({ error: 'Номер заявки обязателен' });
    }

    const cleanId = t.id.trim();

    // Проверяем, нет ли уже такой заявки в базе
    const { rows: existing } = await pool.query('SELECT id FROM tasks WHERE id=$1', [cleanId]);
    if (existing.length > 0) {
      return res.status(400).json({ error: `Заявка с номером ${cleanId} уже существует в базе` });
    }

    await pool.query(`
      INSERT INTO tasks (
        id, vsp, manager, contact, region, address, work_type, amount, price_per_unit,
        in_order, fact, date_zayavki, deadline, tech_link, invoice_info, comment,
        status, priority, archived, stage, customer
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'pending', 'medium', false, 'request', $17)
    `, [
      cleanId, 
      t.vsp || null, 
      t.manager || null,
      t.contact || null,
      t.region || null, 
      t.address || null, 
      t.workType || null,
      Number(t.amount) || 0, 
      Number(t.pricePerUnit) || 0,
      Number(t.inOrder) || 0, 
      Number(t.fact) || 0,
      safeDate(t.dateZayavki), 
      safeDate(t.deadline),
      t.techLink || null, 
      t.invoiceInfo || null, 
      t.comment || null,
      t.customer || 'ПАО Сбербанк'
    ]);

    // Сразу после создания пробуем найти координаты в фоне
    runBackgroundGeocoding();

    res.json({ success: true, id: cleanId });
  } catch(e) { 
    console.error('POST task error:', e.message); 
    res.status(500).json({ error: e.message }); 
  }
});

router.put('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const d = req.body
    // --- УМНАЯ АВТОМАТИКА (Связка Этап <-> Статус) ---
    // Выполняем только если меняется либо этап, либо статус
    if (d.stage !== undefined || d.status !== undefined) {
      
      // 1. Авто-статус по этапу
      if (d.stage === 'payment') {
        d.status = (d.status === 'paid') ? 'paid' : 'done';
      }
      else if (d.stage === 'acceptance') {
        d.status = 'done';
      }
      else if (d.stage === 'install' || d.stage === 'control' || d.stage === 'survey') {
        if (d.status === 'pending' || !d.status) d.status = 'progress';
      }
      else if (d.stage === 'request') {
        if (d.status === 'progress' && (!d.fact || Number(d.fact) === 0)) d.status = 'pending';
      }

      // 2. Авто-этап по статусу
      if (d.status === 'cancelled') {
        d.stage = ''; // Сбрасываем этап, если отменили
      }
      else if (d.status === 'paid') {
        d.stage = 'payment'; // Логично, что если оплачено, то это этап оплаты
      }
    }

    if (d.status === 'paid') {
      pool.query(
        `UPDATE invoices SET status='paid' WHERE task_id=$1 AND status IN ('issued','approved')`,
        [req.params.id]
      ).catch(err => console.error('Invoice auto-paid sync error:', err.message));
    }

        // Если меняется исполнитель — подтягиваем организацию, к которой он привязан
    if (d.assignee !== undefined && d.assignee) {
      try {
        const { rows: workerRows } = await pool.query(
          `SELECT c.name_short FROM users u JOIN contractors c ON c.id = u.contractor_id WHERE u.full_name = $1 AND u.role = 'worker' LIMIT 1`,
          [d.assignee]
        );
        if (workerRows[0]) d.contractor = workerRows[0].name_short;
      } catch(e) { console.error('Auto-contractor lookup error:', e.message); }
    }
    if (d.assignee !== undefined && d.assignee) {
      d.assignmentStatus = 'pending';
    }

    await pool.query(`
      UPDATE tasks SET
        region        = COALESCE($2, region),
        address       = COALESCE($3, address),
        work_type     = COALESCE($4, work_type),
        deadline      = $5,
        status        = COALESCE($6, status),
        priority      = COALESCE($7, priority),
        stage         = $8,
        archived      = COALESCE($9, archived),
        
        -- ВОЗВРАЩАЕМ ЗАЩИТУ: Если Канбан прислал пустоту (NULL), оставляем старое значение
        assignee      = COALESCE($10, assignee),
        controller    = COALESCE($11, controller),
        comment       = COALESCE($12, comment),
        contact       = COALESCE($14, contact),
        contractor    = COALESCE($18, contractor),

        distributed_at = $13,
        tech_link     = COALESCE($15, tech_link),
        fact          = COALESCE($16::integer, fact),
        overdue_days  = COALESCE($17::integer, overdue_days),
        in_order      = COALESCE($19::integer, in_order),
        amount        = COALESCE($20::numeric, amount),
        distance_km   = COALESCE($21::numeric, distance_km),
        price_per_unit= COALESCE($22::numeric, price_per_unit),
        id_status     = COALESCE($23, id_status),
        excel_comment = COALESCE($24, excel_comment),
        edo_number    = COALESCE($25, edo_number),
        invoice_info  = COALESCE($26, invoice_info),
        vedo_status   = COALESCE($27, vedo_status),
        history       = COALESCE($28::jsonb, history),
        km_rate       = COALESCE($29::numeric, km_rate),
        tmc           = COALESCE($30::numeric, tmc), 
        extras        = COALESCE($31::numeric, extras),
        supplier_order_signed = COALESCE($32::boolean, supplier_order_signed),
        supplier_id_uploaded  = COALESCE($33::boolean, supplier_id_uploaded),
        overdue_reason        = COALESCE($34, overdue_reason),
        assignment_status     = COALESCE($35, assignment_status),
        customer              = COALESCE($36, customer),
        stage_num             = COALESCE($37::integer, stage_num),
        manager_id            = COALESCE($38::integer, manager_id),
        designer_id           = COALESCE($39::integer, designer_id),
        materials_link        = COALESCE($40, materials_link),
        id_link               = COALESCE($41, id_link),
        stage_due             = $42,
        version               = version + 1,
        updated_at    = NOW()
      WHERE id = $1
    `, [
      req.params.id,
      d.region      || null,
      d.address     || null,
      d.workType    || null,
      safeDate(d.deadline),
      d.status      || null,
      d.priority    || null,
      d.stage       !== undefined ? d.stage : null,
      d.archived    !== undefined ? d.archived : null,
      
      // ИСПРАВЛЕНИЕ ЗДЕСЬ: !== undefined позволяет передать пустую строку "", чтобы ты мог стереть человека
      d.assignee    !== undefined ? d.assignee : null,
      d.controller  !== undefined ? d.controller : null,
      d.comment     !== undefined ? d.comment : null,
      
      safeDate(d.distributedAt),
      
      d.contact     !== undefined ? d.contact : null,
      d.techLink    || null,
      d.fact        !== undefined ? Number(d.fact)        : null,
      d.overdueDays !== undefined ? Number(d.overdueDays) : null,
      d.contractor  !== undefined ? d.contractor : null,
      d.inOrder     !== undefined ? Number(d.inOrder)     : null,
      d.amount      !== undefined ? Number(d.amount)      : null,
      d.distanceKm  !== undefined ? Number(d.distanceKm)  : null,
      d.pricePerUnit!== undefined ? Number(d.pricePerUnit): null,
      d.idStatus    || null,
      d.excelComment|| null,
      d.edoNumber   || null,
      d.invoiceInfo || null,
      d.vedoStatus  || null,
      d._history    ? JSON.stringify(d._history) : null,
      d.kmRate      || null,
      d.tmc         || null, 
      d.extras      || null,
      d.supplierOrderSigned !== undefined ? d.supplierOrderSigned : null,
      d.supplierIdUploaded  !== undefined ? d.supplierIdUploaded  : null,
      d.overdueReason       || null,
      d.assignmentStatus || null,
      d.customer    || null,
      d.stageNum    !== undefined ? Number(d.stageNum) : null,
      d.managerId   !== undefined ? (d.managerId ? Number(d.managerId) : null) : null,
      d.designerId  !== undefined ? (d.designerId ? Number(d.designerId) : null) : null,
      d.materialsLink !== undefined ? d.materialsLink : null,
      d.idLink      !== undefined ? d.idLink : null,
      d.stageDue    ? new Date(d.stageDue) : null
    ]);

    // --- УВЕДОМЛЕНИЯ И EMAIL ДЛЯ ИСПОЛНИТЕЛЯ ---
    if (d.assignee) {
      pool.query('SELECT id, email FROM users WHERE LOWER(TRIM(full_name)) = LOWER($1) OR LOWER(TRIM(username)) = LOWER($1) OR id::text = $1', [d.assignee])
        .then(({ rows }) => {
          if (rows.length > 0) {
            const targetUser = rows[0];

            // 1. Создаем уведомление для колокольчика в системе
            createNotification(
              targetUser.id,
              `📋 Новая заявка: ${req.params.id}`,
              `Вам назначена заявка по адресу: ${d.address || 'Указан в системе'}`,
              req.params.id
            );

            // 2. Если есть email — отправляем письмо
            if (targetUser.email) {
              sendEmail({
                to: targetUser.email,
                subject: `📋 Новая заявка: ${req.params.id}`,
                html: `
                  <div style="font-family: 'Golos Text', sans-serif, Arial; max-width: 500px; padding: 24px; background: #FFF4EE; border-radius: 12px; border: 1px solid #FFEDD5;">
                    <h2 style="color: #FF6200; margin-top: 0;">Вам назначена заявка ${req.params.id}</h2>
                    <p style="font-size: 14px; color: #333;"><b>Адрес объекта:</b> ${d.address || 'Указан в системе'}</p>
                    <p style="font-size: 14px; color: #333;"><b>Тип работ:</b> ${d.workType || '—'}</p>
                    <p style="font-size: 14px; color: #333;"><b>Контакт на объекте:</b> ${d.contact || '—'}</p>
                    <br>
                    <a href="https://app.stockeasy.ru" style="display: inline-block; background: #FF6200; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Открыть в Stockeasy</a>
                  </div>
                `
              });
            }
          }
        }).catch(err => console.error('Notification / Email lookup error:', err));
    }

    res.json({ success: true });
  } catch(e) { console.error('PUT task error:', e.message); res.status(500).json({ error: e.message }) }
});

// ─── ПРИНЯЛ / ОТКАЗАЛСЯ ───────────────────────────────────────────────────────
router.post('/tasks/:id/accept', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT assignee, assignment_status FROM tasks WHERE id=$1', [req.params.id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Заявка не найдена' });
    if (task.assignee !== req.user.fullName) return res.status(403).json({ error: 'Эта заявка назначена не вам' });

    await pool.query(`UPDATE tasks SET assignment_status='accepted' WHERE id=$1`, [req.params.id]);

    pool.query('SELECT id FROM users WHERE role=$1', ['admin']).then(({ rows: admins }) => {
      admins.forEach(a => createNotification(a.id, `✅ Заявка принята: ${req.params.id}`, `${req.user.fullName} принял заявку в работу`, req.params.id));
    }).catch(err => console.error('Admin notify error:', err.message));

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/tasks/:id/decline', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT assignee FROM tasks WHERE id=$1', [req.params.id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Заявка не найдена' });
    if (task.assignee !== req.user.fullName) return res.status(403).json({ error: 'Эта заявка назначена не вам' });

    await pool.query(
      `UPDATE tasks SET assignment_status='declined', assignee='', contractor=NULL WHERE id=$1`,
      [req.params.id]
    );

    pool.query('SELECT id FROM users WHERE role=$1', ['admin']).then(({ rows: admins }) => {
      admins.forEach(a => createNotification(a.id, `❌ Заявка отклонена: ${req.params.id}`, `${req.user.fullName} отказался от заявки — нужно назначить другого исполнителя`, req.params.id));
    }).catch(err => console.error('Admin notify error:', err.message));

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM notifications WHERE link=$1', [req.params.id]);
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── API: ЖИЗНЕННЫЙ ЦИКЛ ИД И ЗАМЕЧАНИЯ СБЕРА ─────────────────────────────────

// Перевод на следующий этап
router.post('/tasks/:id/advance', authenticateToken, async (req, res) => {
  try {
    const { link, designerId, note } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Заявка не найдена' });

    const curStage = Number(task.stage_num) || 0;
    if (curStage >= ID_STEPS.length) {
      return res.status(400).json({ error: 'Заявка уже на финальном этапе' });
    }

    // Проверка прав
    if (!canStep(req.user, task)) {
      return res.status(403).json({ error: 'У вас нет прав для выполнения этого шага' });
    }

    const stepInfo = ID_STEPS[curStage];

    // Шаг 0 (Монтаж начат) -> если нет менеджера, привязываем текущего
    let managerId = task.manager_id;
    if (curStage === 0 && !managerId && hasRole(req.user, 'manager', 'admin', 'leader')) {
      managerId = req.user.id;
    }

    // Шаг 2 (Материалы переданы) -> требуется ссылка или материалы
    let materialsLink = task.materials_link || '';
    if (curStage === 2) {
      const trimmedLink = (link || '').trim();
      if (!trimmedLink && !materialsLink) {
        return res.status(400).json({ error: 'Для передачи материалов укажите ссылку на материалы (диск/архив)' });
      }
      if (trimmedLink) materialsLink = trimmedLink;
    }

    // Шаг 3 (Взял ИД в работу) -> привязываем проектировщика и ставим дедлайн
    let targetDesignerId = task.designer_id;
    let stageDue = task.stage_due;
    if (curStage === 3) {
      if (designerId) targetDesignerId = Number(designerId);
      else if (hasRole(req.user, 'designer')) targetDesignerId = req.user.id;
      stageDue = businessDue(new Date().toISOString(), 3); // 3 рабочих дня
    }

    // Шаг 4 (ИД готова) -> требуется ссылка на готовую ИД
    let idLink = task.id_link || '';
    if (curStage === 4) {
      const trimmedLink = (link || '').trim();
      if (!trimmedLink && !idLink) {
        return res.status(400).json({ error: 'Для подтверждения готовности ИД укажите ссылку на готовую документацию' });
      }
      if (trimmedLink) idLink = trimmedLink;
    }

    // Шаг 6 (Сбер принял ИД) -> БЛОКИРОВКА при наличии открытых замечаний!
    if (curStage === 6) {
      const { rows: unresolved } = await pool.query(
        'SELECT id FROM remarks WHERE task_id=$1 AND resolved_at IS NULL LIMIT 1',
        [req.params.id]
      );
      if (unresolved.length > 0) {
        return res.status(400).json({ error: 'Нельзя принять заявку: сначала устраните открытые замечания Сбера' });
      }
    }

    const nextStage = curStage + 1;

    // Синхронизация статуса
    let newStatus = task.status;
    let newStageText = task.stage;
    if (nextStage === 1) { newStatus = 'progress'; newStageText = 'install'; }
    else if (nextStage === 2) { newStatus = 'progress'; newStageText = 'survey'; }
    else if (nextStage === 3) { newStatus = 'progress'; newStageText = 'control'; }
    else if (nextStage === 4) { newStatus = 'progress'; newStageText = 'control'; }
    else if (nextStage === 5) { newStatus = 'progress'; newStageText = 'control'; }
    else if (nextStage === 6) { newStatus = 'progress'; newStageText = 'acceptance'; }
    else if (nextStage === 7) { newStatus = 'done'; newStageText = 'payment'; }
    else if (nextStage === 8) { newStatus = 'done'; newStageText = 'payment'; }
    else if (nextStage === 9) { newStatus = 'paid'; newStageText = 'payment'; }

    // Лог в историю
    const history = Array.isArray(task.history) ? [...task.history] : [];
    history.push({
      date: new Date().toISOString(),
      user: req.user.fullName || req.user.username,
      userId: req.user.id,
      action: stepInfo.label,
      fromStage: curStage,
      toStage: nextStage,
      link: link || undefined,
      note: note || undefined
    });

    await pool.query(`
      UPDATE tasks SET
        stage_num     = $1,
        status        = $2,
        stage         = $3,
        manager_id    = $4,
        designer_id   = $5,
        materials_link= $6,
        id_link       = $7,
        stage_due     = $8,
        version       = version + 1,
        history       = $9::jsonb,
        updated_at    = NOW()
      WHERE id = $10
    `, [
      nextStage,
      newStatus,
      newStageText,
      managerId,
      targetDesignerId,
      materialsLink,
      idLink,
      stageDue,
      JSON.stringify(history),
      req.params.id
    ]);

    // Уведомления по сокетам и в БД
    const recipientRoles = nextStage === 3 ? ['designer'] :
                           nextStage === 5 ? ['dispatch'] :
                           nextStage === 7 ? ['payments'] : [];
    if (recipientRoles.length > 0) {
      pool.query(
        "SELECT id FROM users WHERE role = ANY($1)",
        [recipientRoles]
      ).then(({ rows: recUsers }) => {
        recUsers.forEach(u => {
          createNotification(
            u.id,
            `📌 Заявка ${task.id}: ${stepInfo.label}`,
            `Переведена на этап: ${ID_STAGES[nextStage]}`,
            task.id
          );
        });
      }).catch(e => console.error('Advance notify error:', e.message));
    }

    const { rows: updatedRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    const updatedTask = rowToTask(updatedRows[0]);
    io.emit('task-updated', updatedTask);
    res.json({ success: true, task: updatedTask, stageNum: nextStage, status: newStatus });
  } catch(e) {
    console.error('Advance error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Откат на предыдущий этап
router.post('/tasks/:id/undo', authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Заявка не найдена' });

    const curStage = Number(task.stage_num) || 0;
    if (curStage <= 0) {
      return res.status(400).json({ error: 'Заявка уже на начальном этапе' });
    }

    if (!canUndo(req.user, task)) {
      return res.status(403).json({ error: 'У вас нет прав для отката этого этапа' });
    }

    const prevStage = curStage - 1;
    const history = Array.isArray(task.history) ? [...task.history] : [];
    history.push({
      date: new Date().toISOString(),
      user: req.user.fullName || req.user.username,
      userId: req.user.id,
      action: `Откат этапа: ${ID_STAGES[curStage]} ➔ ${ID_STAGES[prevStage]}`,
      reason: reason || 'Без указания причины',
      revert: true
    });

    await pool.query(`
      UPDATE tasks SET
        stage_num  = $1,
        version    = version + 1,
        history    = $2::jsonb,
        updated_at = NOW()
      WHERE id = $3
    `, [prevStage, JSON.stringify(history), req.params.id]);

    const { rows: updatedRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    const updatedTask = rowToTask(updatedRows[0]);
    io.emit('task-updated', updatedTask);
    res.json({ success: true, task: updatedTask, stageNum: prevStage });
  } catch(e) {
    console.error('Undo error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Замечания Сбера: список замечаний
router.get('/tasks/:id/remarks', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM remarks WHERE task_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    const remarks = rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      text: r.body || '',
      body: r.body || '',
      doc_link: r.link || '',
      link: r.link || '',
      created_at: r.created_at,
      author_id: r.created_by,
      author_name: r.created_name,
      resolved_at: r.resolved_at,
      resolved_by: r.resolved_by,
      resolver_name: r.resolved_name,
      resolution: r.resolution,
      fixed_doc_link: r.resolution_link,
      resolution_link: r.resolution_link
    }));
    res.json(remarks);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Замечания Сбера: добавить новое замечание
router.post('/tasks/:id/remarks', authenticateToken, async (req, res) => {
  try {
    const text = (req.body?.text || req.body?.body || '').trim();
    const link = (req.body?.link || req.body?.doc_link || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'Текст замечания обязателен' });
    }

    const id = crypto.randomUUID();
    const { rows } = await pool.query(`
      INSERT INTO remarks (id, task_id, body, link, created_by, created_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      id,
      req.params.id,
      text,
      link,
      req.user.id,
      req.user.fullName || req.user.username
    ]);

    const r = rows[0];
    const remark = {
      id: r.id,
      taskId: r.task_id,
      text: r.body || '',
      body: r.body || '',
      doc_link: r.link || '',
      link: r.link || '',
      created_at: r.created_at,
      author_id: r.created_by,
      author_name: r.created_name
    };

    // Уведомление проектировщику
    pool.query('SELECT designer_id FROM tasks WHERE id=$1', [req.params.id]).then(({ rows: tRows }) => {
      if (tRows[0] && tRows[0].designer_id) {
        createNotification(
          tRows[0].designer_id,
          `⚠️ Замечание Сбера: ${req.params.id}`,
          text.slice(0, 100),
          req.params.id
        );
      }
    }).catch(e => console.error('Remark notify error:', e.message));

    io.emit('task-remarks-updated', { taskId: req.params.id, remark });
    res.json({ success: true, remark, id: remark.id, text: remark.text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Замечания Сбера: закрыть (устранить) замечание
router.post('/tasks/:id/remarks/:remarkId/resolve', authenticateToken, async (req, res) => {
  try {
    const resolution = (req.body?.resolution || '').trim();
    const fixedLink = (req.body?.fixedLink || req.body?.resolutionLink || '').trim();
    if (!resolution) {
      return res.status(400).json({ error: 'Укажите, как было устранено замечание' });
    }

    const { rows } = await pool.query(`
      UPDATE remarks SET
        resolution      = $1,
        resolution_link = $2,
        resolved_at     = NOW(),
        resolved_by     = $3,
        resolved_name   = $4
      WHERE id = $5 AND task_id = $6
      RETURNING *
    `, [
      resolution,
      fixedLink,
      req.user.id,
      req.user.fullName || req.user.username,
      req.params.remarkId,
      req.params.id
    ]);

    if (!rows[0]) return res.status(404).json({ error: 'Замечание не найдено' });

    const r = rows[0];
    const remark = {
      id: r.id,
      taskId: r.task_id,
      text: r.body || '',
      body: r.body || '',
      doc_link: r.link || '',
      link: r.link || '',
      created_at: r.created_at,
      author_id: r.created_by,
      author_name: r.created_name,
      resolved_at: r.resolved_at,
      resolved_by: r.resolved_by,
      resolver_name: r.resolved_name,
      resolution: r.resolution,
      fixed_doc_link: r.resolution_link,
      resolution_link: r.resolution_link
    };

    io.emit('task-remarks-updated', { taskId: req.params.id, remark });
    res.json({ success: true, remark, id: remark.id });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: ВЛОЖЕНИЯ ЗАЯВКИ ────────────────────────────────────────────────────


// --- ИИ ПАРСЕР PDF ЗАЯВОК ---
// --- ИИ ПАРСЕР PDF ЗАЯВОК (Асинхронный через WebSockets) ---

router.post('/ai/parse-pdf', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  const io = req.app.get('io');
  console.log('[AI Parser] Запрос получен. Файл:', req.file ? 'Присутствует' : 'ОТСУТСТВУЕТ');

  if (!req.file) return res.status(400).json({ error: 'Файл не загружен или имеет неверный формат' });

  const filePath = req.file.path;
  const userId = req.user.id;

  // Мгновенный ответ браузеру
  res.json({ success: true, message: 'Файл принят. ИИ начал обработку.' });

  try {
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://ai:8000';
    const fileBuffer = fs.readFileSync(filePath);
    fs.unlink(filePath, () => {}); // Удаляем временный файл сразу

    // Формируем отправку файла в ai-service
    const blob = new Blob([fileBuffer], { type: req.file.mimetype });
    const fd = new FormData();
    fd.append('file', blob, req.file.originalname);

    const response = await fetch(`${aiServiceUrl}/parse`, {
      method: 'POST',
      body: fd
    });

    if (!response.ok) {
      throw new Error(`Ошибка от AI-сервиса: ${response.statusText}`);
    }

    // Читаем стриминг от FastAPI построчно
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Оставляем незавершенную строку

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (item.type === 'log') {
            io.to(`user_${userId}`).emit('ai-log', { message: item.message });
          } else if (item.type === 'result') {
            const parsedData = item.data;

            // ИНСТРУМЕНТ 2: Мгновенная стандартизация адреса через DaData
            if (parsedData && parsedData.address) {
              try {
                const cleanGeo = await cleanAddressDaData(parsedData.address, parsedData.region);
                if (cleanGeo && cleanGeo.address) {
                  parsedData.address = cleanGeo.address; // Подставляем официальный адрес
                }
              } catch (geoErr) {
                console.error('[DaData Auto-clean error]:', geoErr.message);
              }
            }

            io.to(`user_${userId}`).emit('ai-parse-result', parsedData);
          } else if (item.type === 'error') {
            io.to(`user_${userId}`).emit('ai-parse-result', { error: item.message });
          }
        } catch (err) {
          console.error('Ошибка разбора строки стрима:', line);
        }
      }
    }
  } catch (e) {
    console.error('[AI Parser Error]:', e.message);
    io.to(`user_${userId}`).emit('ai-parse-result', { error: `Сбой сервиса ИИ: ${e.message}` });
  }
});

// Хелпер: может ли этот пользователь трогать вложения этой заявки
async function canAccessTaskAttachments(user, taskId) {
  if (user.role === 'admin') return true
  const { rows } = await pool.query('SELECT assignee FROM tasks WHERE id = $1', [taskId])
  if (!rows[0]) return false
  return rows[0].assignee === user.fullName
}

router.get('/tasks/:id/attachments', authenticateToken, async (req, res) => {
  try {
    if (!(await canAccessTaskAttachments(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Нет доступа к этой заявке' })
    }
    const { rows } = await pool.query(
      'SELECT id, type, original_name, mime_type, size_bytes, comment, created_at FROM task_attachments WHERE task_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    )
    res.json(rows)
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/tasks/:id/attachments', authenticateToken, uploadAttachment.array('files', 10), async (req, res) => {
  try {
    if (!(await canAccessTaskAttachments(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Нет доступа к этой заявке' })
    }
    const type = req.body.type
    if (!['photo_report', 'scheme', 'act', 'receipt', 'pi_excel', 'order_pdf', 'checklist'].includes(type)) {
      return res.status(400).json({ error: 'Некорректный тип вложения' })
    }
    const inserted = []
    for (const file of req.files) {
      const { rows } = await pool.query(
        `INSERT INTO task_attachments (task_id, type, file_path, original_name, mime_type, size_bytes, uploaded_by, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, type, original_name, mime_type, size_bytes, comment, created_at`,
        [req.params.id, type, file.filename, file.originalname, file.mimetype, file.size, req.user.id, req.body.comment || null]
      )
      inserted.push(rows[0])
    }
    res.json(inserted)
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.get('/attachments/:attachmentId/file', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM task_attachments WHERE id = $1', [req.params.attachmentId])
    const att = rows[0]
    if (!att) return res.status(404).json({ error: 'Файл не найден' })
    if (!(await canAccessTaskAttachments(req.user, att.task_id))) {
      return res.status(403).json({ error: 'Нет доступа' })
    }
    res.sendFile(path.join(UPLOADS_DIR, att.file_path), {
      headers: { 'Content-Disposition': `inline; filename="${encodeURIComponent(att.original_name || att.file_path)}"` }
    })
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.delete('/attachments/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM task_attachments WHERE id = $1', [req.params.attachmentId])
    const att = rows[0]
    if (!att) return res.status(404).json({ error: 'Файл не найден' })
    // Удалять может админ, или сам загрузивший — реши по своему усмотрению
    if (req.user.role !== 'admin' && att.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа' })
    }
    await pool.query('DELETE FROM task_attachments WHERE id = $1', [req.params.attachmentId])
    fs.unlink(path.join(UPLOADS_DIR, att.file_path), () => {}) // не блокируем ответ, если файла вдруг нет
    res.json({ success: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// ─── API: ПРОТОКОЛ ИЗМЕРЕНИЙ (КЖ/ПИ) ─────────────────────────────────────────
router.get('/tasks/:id/ports', authenticateToken, async (req, res) => {
  try {
    if (!(await canAccessTaskAttachments(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Нет доступа к этой заявке' })
    }
    const { rows } = await pool.query(
      'SELECT * FROM task_ports WHERE task_id = $1 ORDER BY id ASC',
      [req.params.id]
    )
    res.json(rows)
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/tasks/:id/ports', authenticateToken, async (req, res) => {
  try {
    if (!(await canAccessTaskAttachments(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Нет доступа к этой заявке' })
    }
    const { portNumber, patchPanel, room, marking, cableLength } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO task_ports (task_id, port_number, patch_panel, room, marking, cable_length)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, portNumber || null, patchPanel || null, room || null, marking || null, cableLength || null]
    )
    res.json(rows[0])
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.put('/ports/:rowId', authenticateToken, async (req, res) => {
  try {
    const { rows: existing } = await pool.query('SELECT task_id FROM task_ports WHERE id=$1', [req.params.rowId]);
    if (!existing[0]) return res.status(404).json({ error: 'Строка не найдена' });
    if (!(await canAccessTaskAttachments(req.user, existing[0].task_id))) {
      return res.status(403).json({ error: 'Нет доступа' })
    }
    const { portNumber, patchPanel, room, marking, cableLength } = req.body;
    const { rows } = await pool.query(
      `UPDATE task_ports SET
        port_number = COALESCE($2, port_number),
        patch_panel = COALESCE($3, patch_panel),
        room = COALESCE($4, room),
        marking = COALESCE($5, marking),
        cable_length = COALESCE($6, cable_length)
       WHERE id=$1 RETURNING *`,
      [req.params.rowId, portNumber, patchPanel, room, marking, cableLength]
    )
    res.json(rows[0])
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.delete('/ports/:rowId', authenticateToken, async (req, res) => {
  try {
    const { rows: existing } = await pool.query('SELECT task_id FROM task_ports WHERE id=$1', [req.params.rowId]);
    if (!existing[0]) return res.status(404).json({ error: 'Строка не найдена' });
    if (!(await canAccessTaskAttachments(req.user, existing[0].task_id))) {
      return res.status(403).json({ error: 'Нет доступа' })
    }
    await pool.query('DELETE FROM task_ports WHERE id=$1', [req.params.rowId]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// ─── API: ЧЕК-ЛИСТ ОБСЛЕДОВАНИЯ ОБЪЕКТА (ТМЦ И ХАРАКТЕРИСТИКИ СКС) ───────────
router.get('/tasks/:id/checklist', authenticateToken, async (req, res) => {
  try {
    if (!(await canAccessTaskAttachments(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Нет доступа к этой заявке' });
    }
    const { rows } = await pool.query(
      'SELECT * FROM task_checklists WHERE task_id = $1 ORDER BY id DESC LIMIT 1',
      [req.params.id]
    );
    res.json(rows[0] || null);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/tasks/:id/checklist', authenticateToken, async (req, res) => {
  try {
    if (!(await canAccessTaskAttachments(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Нет доступа к этой заявке' });
    }

    const b = req.body || {};
    const { rows: existing } = await pool.query('SELECT id FROM task_checklists WHERE task_id = $1', [req.params.id]);

    const params = [
      req.params.id,
      b.inspectionDate || null,
      b.znoNumber || req.params.id,
      b.address || null,
      b.roomName || null,
      b.inspectorName || req.user.fullName || null,
      b.sbsContact || null,
      b.workType || null,
      Number(b.portsInstallQty) || 0,
      Number(b.portsRelocateQty) || 0,
      Number(b.portsDismantleQty) || 0,
      Number(b.portsRestoreQty) || 0,
      b.mountSurface || null,
      Boolean(b.hasFloorHatches),
      Boolean(b.hasDrops),
      b.outletSurface || null,
      Boolean(b.tableExists),
      Boolean(b.workplaceOccupied),
      b.tableInstallDate || null,
      Boolean(b.raisedFloor),
      Number(b.ceilingHeightMm) || 0,
      Boolean(b.hasInterfloorPass),
      Boolean(b.interfloorHasSpace),
      Boolean(b.hasMetalTray),
      Boolean(b.metalTrayHasSpace),
      Boolean(b.hasTrunking),
      b.trunkingBrandSize || null,
      b.trunkingSize || null,
      Boolean(b.trunkingInstallNeeded),
      Number(b.trunkingInstallMeters) || 0,
      Boolean(b.electricSocketsReady),
      b.electricSocketsMountType || null,
      Boolean(b.hasServerRoom),
      b.serverRoomInfo || null,
      Boolean(b.hasTelecomRack),
      b.telecomRackInfo || null,
      Boolean(b.patchPanelInstallNeeded),
      b.freePatchPanelNum || null,
      b.portsMarking || null,
      Boolean(b.materialsNeeded),
      Number(b.matPatchPanelsQty) || 0,
      Number(b.matCableOrganizersQty) || 0,
      Number(b.matKeystoneBlackQty) || 0,
      Number(b.matKeystoneWhiteQty) || 0,
      Number(b.matFaceplatesFramesQty) || 0,
      Number(b.matCableMeters) || 0,
      Number(b.matSurfaceBoxesQty) || 0,
      b.notes || null,
      JSON.stringify(b.rawChecklistData || {}),
      req.user.id
    ];

    let result;
    if (existing && existing.length > 0) {
      // Обновляем существующий чек-лист
      const updateQuery = `
        UPDATE task_checklists SET
          inspection_date = $2, zno_number = $3, address = $4, room_name = $5,
          inspector_name = $6, sbs_contact = $7, work_type = $8,
          ports_install_qty = $9, ports_relocate_qty = $10, ports_dismantle_qty = $11, ports_restore_qty = $12,
          mount_surface = $13, has_floor_hatches = $14, has_drops = $15, outlet_surface = $16,
          table_exists = $17, workplace_occupied = $18, table_install_date = $19, raised_floor = $20,
          ceiling_height_mm = $21, has_interfloor_pass = $22, interfloor_has_space = $23,
          has_metal_tray = $24, metal_tray_has_space = $25, has_trunking = $26, trunking_brand_size = $27,
          trunking_size = $28, trunking_install_needed = $29, trunking_install_meters = $30,
          electric_sockets_ready = $31, electric_sockets_mount_type = $32, has_server_room = $33,
          server_room_info = $34, has_telecom_rack = $35, telecom_rack_info = $36,
          patch_panel_install_needed = $37, free_patch_panel_num = $38, ports_marking = $39,
          materials_needed = $40, mat_patch_panels_qty = $41, mat_cable_organizers_qty = $42,
          mat_keystone_black_qty = $43, mat_keystone_white_qty = $44, mat_faceplates_frames_qty = $45,
          mat_cable_meters = $46, mat_surface_boxes_qty = $47, notes = $48, raw_checklist_data = $49,
          updated_at = NOW()
        WHERE task_id = $1 RETURNING *
      `;
      result = await pool.query(updateQuery, params.slice(0, 49));
    } else {
      // Создаем новую запись
      const insertQuery = `
        INSERT INTO task_checklists (
          task_id, inspection_date, zno_number, address, room_name,
          inspector_name, sbs_contact, work_type,
          ports_install_qty, ports_relocate_qty, ports_dismantle_qty, ports_restore_qty,
          mount_surface, has_floor_hatches, has_drops, outlet_surface,
          table_exists, workplace_occupied, table_install_date, raised_floor,
          ceiling_height_mm, has_interfloor_pass, interfloor_has_space,
          has_metal_tray, metal_tray_has_space, has_trunking, trunking_brand_size,
          trunking_size, trunking_install_needed, trunking_install_meters,
          electric_sockets_ready, electric_sockets_mount_type, has_server_room,
          server_room_info, has_telecom_rack, telecom_rack_info,
          patch_panel_install_needed, free_patch_panel_num, ports_marking,
          materials_needed, mat_patch_panels_qty, mat_cable_organizers_qty,
          mat_keystone_black_qty, mat_keystone_white_qty, mat_faceplates_frames_qty,
          mat_cable_meters, mat_surface_boxes_qty, notes, raw_checklist_data,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44,
          $45, $46, $47, $48, $49, $50
        ) RETURNING *
      `;
      result = await pool.query(insertQuery, params);
    }

    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Эндпоинт для сводной аналитики/прогноза по материалам на основе всех чек-листов
router.get('/checklists/materials-summary', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_checklists,
        SUM(mat_patch_panels_qty) as total_patch_panels,
        SUM(mat_cable_organizers_qty) as total_cable_organizers,
        SUM(mat_keystone_black_qty) as total_keystone_black,
        SUM(mat_keystone_white_qty) as total_keystone_white,
        SUM(mat_faceplates_frames_qty) as total_faceplates,
        SUM(mat_cable_meters) as total_cable_meters,
        SUM(mat_surface_boxes_qty) as total_surface_boxes,
        ROUND(AVG(NULLIF(mat_cable_meters, 0) / NULLIF(ports_install_qty, 0)), 1) as avg_cable_per_port
      FROM task_checklists
    `);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});




router.get('/export/:type/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Заявка не найдена' });
    const task = rowToTask(rows[0]);
    const type = req.params.type;
    const { contractorId, contractorName } = req.query || {};

    let wb, suffix;
    if (type === 'invoice') {
      wb = buildInvoice(task);
      suffix = '_Счёт';
    } else if (type === 'act') {
      wb = buildAct(task);
      suffix = '_Акт';
    } else {
      // Приложение №2: ищем позиции task_items
      let itemsQuery = 'SELECT * FROM task_items WHERE task_id = $1';
      const params = [req.params.id];
      if (contractorId) {
        itemsQuery += ' AND contractor_id = $2';
        params.push(contractorId);
      } else if (contractorName) {
        itemsQuery += ' AND LOWER(contractor_name) = LOWER($2)';
        params.push(contractorName);
      }
      itemsQuery += ' ORDER BY id ASC';
      const itemsRes = await pool.query(itemsQuery, params);
      wb = buildApp2(task, contractorName || null, itemsRes.rows);
      suffix = contractorName ? `_Приложение_2_${contractorName}` : '_Приложение_2';
    }
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = (task.id + suffix + '.xlsx').replace(/[/\\?%*:|"<>]/g, '-');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(filename));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── API: ПОДТАБЛИЦА СОСТАВА РАБОТ (TASK_ITEMS) ──────────────────────────────
router.get('/tasks/:id/items', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ti.*, c.name_short AS contractor_short_name, c.inn AS contractor_inn
       FROM task_items ti
       LEFT JOIN contractors c ON c.id = ti.contractor_id
       WHERE ti.task_id = $1
       ORDER BY ti.id ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tasks/:id/items', authenticateToken, async (req, res) => {
  try {
    const {
      work_type,
      quantity = 1,
      unit = 'шт.',
      price_customer = 0,
      amount_customer = 0,
      contractor_id = null,
      contractor_name = null,
      price_contractor = 0,
      amount_contractor = 0,
      distance_km = 0,
      status = 'pending',
      comment = null
    } = req.body;

    if (!work_type || !work_type.trim()) {
      return res.status(400).json({ error: 'Наименование работы обязательно' });
    }

    const calcAmountCust = Number(amount_customer) || (Number(quantity) * Number(price_customer));
    const calcAmountCont = Number(amount_contractor) || (Number(quantity) * Number(price_contractor));

    const { rows } = await pool.query(
      `INSERT INTO task_items (
        task_id, work_type, quantity, unit,
        price_customer, amount_customer,
        contractor_id, contractor_name,
        price_contractor, amount_contractor,
        distance_km, status, comment
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        req.params.id, work_type.trim(), Number(quantity) || 1, unit || 'шт.',
        Number(price_customer) || 0, calcAmountCust,
        contractor_id ? parseInt(contractor_id, 10) : null, contractor_name ? contractor_name.trim() : null,
        Number(price_contractor) || 0, calcAmountCont,
        Number(distance_km) || 0, status || 'pending', comment || null
      ]
    );

    // Авто-пересчет суммы в tasks
    await pool.query(
      `UPDATE tasks SET amount = COALESCE((SELECT SUM(amount_customer) FROM task_items WHERE task_id = $1), amount) WHERE id = $1`,
      [req.params.id]
    );

    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/tasks/:id/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const {
      work_type,
      quantity,
      unit,
      price_customer,
      amount_customer,
      contractor_id,
      contractor_name,
      price_contractor,
      amount_contractor,
      distance_km,
      status,
      comment
    } = req.body;

    const calcAmountCust = amount_customer !== undefined ? Number(amount_customer) : undefined;
    const calcAmountCont = amount_contractor !== undefined ? Number(amount_contractor) : undefined;

    const { rows } = await pool.query(
      `UPDATE task_items SET
        work_type         = COALESCE($1, work_type),
        quantity          = COALESCE($2, quantity),
        unit              = COALESCE($3, unit),
        price_customer    = COALESCE($4, price_customer),
        amount_customer   = COALESCE($5, amount_customer),
        contractor_id     = $6,
        contractor_name   = COALESCE($7, contractor_name),
        price_contractor  = COALESCE($8, price_contractor),
        amount_contractor = COALESCE($9, amount_contractor),
        distance_km       = COALESCE($10, distance_km),
        status            = COALESCE($11, status),
        comment           = COALESCE($12, comment),
        updated_at        = NOW()
      WHERE id = $13 AND task_id = $14
      RETURNING *`,
      [
        work_type ? work_type.trim() : null,
        quantity !== undefined ? Number(quantity) : null,
        unit || null,
        price_customer !== undefined ? Number(price_customer) : null,
        calcAmountCust,
        contractor_id !== undefined ? (contractor_id ? parseInt(contractor_id, 10) : null) : null,
        contractor_name !== undefined ? (contractor_name ? contractor_name.trim() : null) : null,
        price_contractor !== undefined ? Number(price_contractor) : null,
        calcAmountCont,
        distance_km !== undefined ? Number(distance_km) : null,
        status || null,
        comment !== undefined ? comment : null,
        req.params.itemId,
        req.params.id
      ]
    );

    if (!rows.length) return res.status(404).json({ error: 'Позиция не найдена' });

    // Авто-пересчет суммы в tasks
    await pool.query(
      `UPDATE tasks SET amount = COALESCE((SELECT SUM(amount_customer) FROM task_items WHERE task_id = $1), amount) WHERE id = $1`,
      [req.params.id]
    );

    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/tasks/:id/items/:itemId', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM task_items WHERE id = $1 AND task_id = $2', [req.params.itemId, req.params.id]);
    // Авто-пересчет суммы в tasks
    await pool.query(
      `UPDATE tasks SET amount = COALESCE((SELECT SUM(amount_customer) FROM task_items WHERE task_id = $1), 0) WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Получить все версии счетов/актов по заявке
router.get('/tasks/:id/invoices', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM invoices WHERE task_id = $1 ORDER BY doc_type, version DESC',
      [req.params.id]
    )
    res.json(rows)
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// Выпустить новую версию счёта или акта (замораживает текущие данные заявки)
router.post('/tasks/:id/invoices', authenticateToken, async (req, res) => {
  try {
    const docType = req.body.docType === 'act' ? 'act' : 'invoice'
    const { rows: taskRows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id])
    if (!taskRows.length) return res.status(404).json({ error: 'Заявка не найдена' })
    const task = rowToTask(taskRows[0])

    const { rows: verRows } = await pool.query(
      'SELECT COALESCE(MAX(version),0) as maxv FROM invoices WHERE task_id=$1 AND doc_type=$2',
      [req.params.id, docType]
    )
    const nextVersion = Number(verRows[0].maxv) + 1

    const ports = task.fact || task.inOrder || 0
    const km = Number(task.distanceKm) || 0
    const total = calcTotal(ports, km)

    const { rows } = await pool.query(
      `INSERT INTO invoices (task_id, doc_type, version, status, amount, snapshot, issued_by, issued_at)
       VALUES ($1,$2,$3,'issued',$4,$5,$6,NOW()) RETURNING *`,
      [req.params.id, docType, nextVersion, total, JSON.stringify(task), req.user.id]
    )
    res.json(rows[0])
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// Сменить статус конкретной версии счёта/акта
router.put('/invoices/:invId', authenticateToken, async (req, res) => {
  try {
    const status = req.body.status
    if (!['draft','issued','approved','paid'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус' })
    }
    const approvedAtSql = status === 'approved' ? 'NOW()' : 'approved_at'
    const { rows } = await pool.query(
      `UPDATE invoices SET status=$2, approved_at=${approvedAtSql} WHERE id=$1 RETURNING *`,
      [req.params.invId, status]
    )
    if (!rows.length) return res.status(404).json({ error: 'Не найдено' })
    res.json(rows[0])
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.get('/export/:id', authenticateToken, (req, res) => res.redirect('/api/export/app2/'+req.params.id))

// ─── СТАРЫЕ ЭНДПОИНТЫ (для совместимости) ───────────────────────────────────
router.get('/files', authenticateToken, (req, res) => res.json([]))
router.post('/excel/upload', authenticateToken, (req, res) => res.json({ success: false, error: 'Use /api/excel/import-rows' }))
router.get('/excel/:filename', authenticateToken, (req, res) => res.status(404).json({ error: 'not found' }))


export default router;
