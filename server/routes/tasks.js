import express from 'express';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { pool } from '../config/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { uploadAttachment, UPLOADS_DIR, fixUtf8Filename } from '../middleware/upload.js';
import { rowToTask, safeDate, calcPricePerPort, calcTransport, calcTotal, fmtDate, numToWords, buildApp2, buildInvoice, buildAct } from '../services/helpers.js';
import { ID_ROLES, ID_STEPS, ID_STAGES, businessDue, hasRole, canStep, canUndo } from '../services/pipeline.js';
import { createNotification, sendEmail } from '../services/notifications.js';
import { cleanAddressDaData } from '../services/dadata.js';
import { runBackgroundGeocoding } from '../services/geoWorker.js';
import { syncSingleTaskSubcontract } from '../scripts/sync_task_subcontracts.js';

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
        COALESCE(rm.cnt, 0)::integer AS open_remarks_count
      FROM tasks t
      LEFT JOIN (
        SELECT task_id, COUNT(*) AS cnt
        FROM remarks
        WHERE resolved_at IS NULL
        GROUP BY task_id
      ) rm ON rm.task_id = t.id
    `;
    let params = [];

    const role = String(req.user?.role || '').toLowerCase();
    const isWorker = role === 'worker' || role === 'installer' || role === 'contractor';

    // Если зашел рабочий / монтажник, показываем только ЕГО задачи (по ФИО, логину или субподряду)
    if (isWorker) {
      query += ` WHERE (
        t.assignee = $1 OR 
        t.assignee = $2 OR 
        EXISTS (
          SELECT 1 FROM task_subcontracts sub 
          WHERE sub.task_id = t.id AND (
            sub.installer_fio ILIKE $1 OR 
            sub.installer_fio ILIKE $2 OR
            (sub.specialist_id IS NOT NULL AND sub.specialist_id IN (
              SELECT id FROM specialists WHERE full_name ILIKE $1 OR full_name ILIKE $2
            ))
          )
        )
      )`;
      params.push(req.user.fullName || '', req.user.username || '');
    }

    query += ' ORDER BY t.created_at';
    const { rows } = await pool.query(query, params);
    
    // Если рабочий — скрываем коммерческую/финансовую информацию заказчика
    const tasks = rows.map(r => {
      const task = rowToTask(r);
      if (isWorker) {
        task.amount = 0;
        task.tmc = 0;
        task.extras = 0;
        task.pricePerUnit = 0;
        task.kmRate = 0;
      }
      return task;
    });

    res.json(tasks);
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// Получение одной заявки по ID
router.get('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM remarks rm WHERE rm.task_id = t.id AND rm.resolved_at IS NULL)::integer AS open_remarks_count
      FROM tasks t
      WHERE t.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Заявка не найдена' });

    const task = rowToTask(rows[0]);
    const role = String(req.user?.role || '').toLowerCase();
    const isWorker = role === 'worker' || role === 'installer' || role === 'contractor';

    // Защита от BOLA/IDOR: монтажник может просматривать только свою назначенную задачу
    if (isWorker) {
      const isDirectlyAssigned = (
        (task.assignee && (task.assignee === req.user.fullName || task.assignee === req.user.username)) ||
        (task.contractor && (task.contractor === req.user.fullName || task.contractor === req.user.username))
      );
      if (!isDirectlyAssigned) {
        const { rows: subRows } = await pool.query(
          `SELECT 1 FROM task_subcontracts 
           WHERE task_id = $1 AND (
             installer_fio ILIKE $2 OR installer_fio ILIKE $3 OR
             (specialist_id IS NOT NULL AND specialist_id IN (
               SELECT id FROM specialists WHERE full_name ILIKE $2 OR full_name ILIKE $3
             ))
           ) LIMIT 1`,
          [task.id, req.user.fullName || '', req.user.username || '']
        );
        if (!subRows.length && task.assignee) {
          return res.status(403).json({ error: 'Доступ ограничен: данная заявка назначена другому специалисту' });
        }
      }
      task.amount = 0;
      task.tmc = 0;
      task.extras = 0;
      task.pricePerUnit = 0;
      task.kmRate = 0;
    }

    res.json(task);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Получение чата и сообщений по конкретной заявке
router.get('/tasks/:id/chat', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    let { rows: rooms } = await pool.query(
      "SELECT * FROM chat_rooms WHERE task_id = $1 AND type = 'task' LIMIT 1",
      [taskId]
    );
    let room = rooms[0];
    if (!room) {
      const { rows: taskExists } = await pool.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
      if (!taskExists.length) {
        return res.status(404).json({ error: 'Заявка не найдена' });
      }
      const { rows: newRooms } = await pool.query(
        "INSERT INTO chat_rooms (name, type, task_id) VALUES ($1, 'task', $2) RETURNING *",
        [`Чат по заявке ${taskId}`, taskId]
      );
      room = newRooms[0];
    }
    const { rows: messages } = await pool.query(`
      SELECT m.id, m.room_id, m.sender_id, m.message_text, m.attachments, m.created_at,
             u.full_name, u.username, u.avatar_url, u.role
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = $1
      ORDER BY m.created_at ASC
      LIMIT 250
    `, [room.id]);
    res.json({ room, messages });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Создание одиночной заявки вручную (или через ИИ)
router.post('/tasks', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
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

    let contractId = (t.contractId || t.contract_id) ? Number(t.contractId || t.contract_id) : null;
    let ownCompanyId = (t.ownCompanyId || t.own_company_id) ? Number(t.ownCompanyId || t.own_company_id) : null;
    let customerName = t.customer || null;

    if (contractId) {
      const { rows: cRows } = await pool.query(
        `SELECT id, customer_name, our_entity_name, own_company_id, amount, contact_person, customer_contact, region, delivery_place 
         FROM contracts WHERE id = $1`, [contractId]
      );
      if (cRows.length > 0) {
        const c = cRows[0];
        if (!customerName || customerName === 'ПАО Сбербанк' || customerName.trim() === '') {
          customerName = c.customer_name || customerName;
        }
        if (!ownCompanyId) {
          if (c.own_company_id) {
            ownCompanyId = c.own_company_id;
          } else if (c.our_entity_name) {
            const ent = String(c.our_entity_name).toLowerCase();
            ownCompanyId = ent.includes('к10') ? 2 : (ent.includes('кабельн') ? 1 : 3);
          }
        }
        if ((!t.amount || Number(t.amount) === 0) && c.amount && Number(c.amount) > 0) {
          t.amount = c.amount;
        }
        if (!t.contact && (c.contact_person || c.customer_contact)) {
          t.contact = [c.contact_person, c.customer_contact].filter(Boolean).join(', ');
        }
        if (!t.region && c.region) {
          t.region = c.region;
        }
        if (!t.address && c.delivery_place) {
          t.address = c.delivery_place;
        }
      }
    } else {
      // 1. Поиск по прямому номеру контракта Заказчика (например 5000...) в номере, регионе или ТЗ (Отказ от привязки по 0926-02 - скрин12)
      const rawText = String(t.region || '') + ' ' + String(cleanId) + ' ' + String(t.comment || '');
      const mNum = rawText.match(/\b(5000\d{7}|\d{7,12})\b/);
      if (mNum) {
        const { rows: matchedNum } = await pool.query(`
          SELECT c.id, c.our_entity_name, c.customer_name, ca.id AS matched_ag_id 
          FROM contracts c
          LEFT JOIN contract_agreements ca ON ca.contract_id = c.id AND (ca.external_number ILIKE $1 OR ca.region ILIKE $2)
          WHERE c.contract_number ILIKE $1 OR c.lots::text ILIKE $1 OR c.raw_data::text ILIKE $1 OR ca.external_number ILIKE $1
          LIMIT 1
        `, [`%${mNum[1]}%`, `%${t.region || ''}%`]);
        if (matchedNum.length > 0) {
          contractId = matchedNum[0].id;
          if (matchedNum[0].matched_ag_id && !t.contract_agreement_id) {
            t.contract_agreement_id = matchedNum[0].matched_ag_id;
          }
          if (!customerName) customerName = matchedNum[0].customer_name;
          if (!ownCompanyId) {
            const ent = String(matchedNum[0].our_entity_name || '').toLowerCase();
            ownCompanyId = ent.includes('к10') ? 2 : (ent.includes('кабельн') ? 1 : 3);
          }
        }
      }

      // 2. Поиск по Заказчику + Региону
      if (!contractId && t.region) {
        const { rows: matchedReg } = await pool.query(`
          SELECT c.id, c.our_entity_name, c.customer_name, ca.id AS matched_ag_id
          FROM contracts c
          JOIN contract_agreements ca ON ca.contract_id = c.id
          WHERE (ca.region ILIKE $1 OR ca.city ILIKE $1 OR c.delivery_place ILIKE $1)
            AND ($2::text IS NULL OR c.customer_name ILIKE $2)
          LIMIT 1
        `, [`%${t.region.trim()}%`, customerName ? `%${customerName}%` : null]);
        if (matchedReg.length > 0) {
          contractId = matchedReg[0].id;
          if (matchedReg[0].matched_ag_id && !t.contract_agreement_id) {
            t.contract_agreement_id = matchedReg[0].matched_ag_id;
          }
          if (!customerName) customerName = matchedReg[0].customer_name;
          if (!ownCompanyId) {
            const ent = String(matchedReg[0].our_entity_name || '').toLowerCase();
            ownCompanyId = ent.includes('к10') ? 2 : (ent.includes('кабельн') ? 1 : 3);
          }
        }
      }
    }

    if (!customerName && (cleanId.startsWith('СЗБ-') || cleanId.startsWith('ВВБ-') || cleanId.startsWith('СИБ-') || String(t.sheet || '').includes('Сбер'))) {
      customerName = 'ПАО Сбербанк';
      if (!ownCompanyId) ownCompanyId = 2; // ООО «К10»
    }
    const contractLot = (t.contractLot || t.contract_lot) ? Number(t.contractLot || t.contract_lot) : null;
    const contractAgreementId = (t.contractAgreementId || t.contract_agreement_id) ? Number(t.contractAgreementId || t.contract_agreement_id) : null;
    const effectiveCustomer = customerName || t.customer || (cleanId.startsWith('СЗБ-') || cleanId.startsWith('ВВБ-') || cleanId.startsWith('СИБ-') ? 'ПАО Сбербанк' : '—');
    const contractorVal = t.contractor ? String(t.contractor).trim() : null;
    const assigneeVal = t.assignee ? String(t.assignee).trim() : null;
    const initStatus = (contractorVal || assigneeVal) ? 'progress' : (t.status || 'pending');
    const initMacro = contractorVal ? 'assigned' : 'new';
    const initStageNum = contractorVal ? 1 : 0;

    await pool.query(`
      INSERT INTO tasks (
        id, vsp, manager, contact, region, address, work_type, amount, price_per_unit,
        in_order, fact, date_zayavki, deadline, tech_link, invoice_info, comment,
        status, priority, archived, stage, customer, contract_id, contract_lot, own_company_id, contract_agreement_id,
        contractor, assignee, macro_status, stage_num
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'medium', false, 'request', $18, $19, $20, $21, $22, $23, $24, $25, $26)
    `, [
      cleanId, 
      t.vsp || null, 
      t.manager || null,
      t.contact || null,
      t.region || null, 
      t.address || null, 
      t.workType || null,
      Math.max(0, Number(t.amount) || 0), 
      Math.max(0, Number(t.pricePerUnit) || 0),
      Math.max(0, Number(t.inOrder) || 0), 
      Math.max(0, Number(t.fact) || 0),
      safeDate(t.dateZayavki), 
      safeDate(t.deadline),
      t.techLink || null, 
      t.invoiceInfo || null, 
      t.comment || null,
      initStatus,
      effectiveCustomer,
      contractId,
      contractLot,
      ownCompanyId,
      contractAgreementId,
      contractorVal,
      assigneeVal,
      initMacro,
      initStageNum
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
    const d = req.body;
    const role = req.user ? String(req.user.role || '').toLowerCase() : '';
    const isAdminOrDirector = role === 'admin' || role === 'director';

    const { rows: currentRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!currentRows.length) return res.status(404).json({ error: 'Заявка не найдена' });
    const currentTask = currentRows[0];

    // Защита полей от несанкционированного изменения по ролям
    if (!isAdminOrDirector) {
      if (role === 'worker' || role === 'installer' || role === 'contractor') {
        // Защита от BOLA/IDOR: монтажник может обновлять только свою назначенную задачу
        if (currentTask.assignee && currentTask.assignee !== req.user.fullName) {
          return res.status(403).json({ error: 'Доступ ограничен: данная заявка назначена другому специалисту' });
        }

        const allowed = ['fact', 'dataVyhoda', 'data_vyhoda', 'smrActualEndDate', 'smr_actual_end_date', 'statusSmr', 'status_smr', 'obsledovanie', 'dostup', 'priemka', 'assignmentStatus'];
        for (const k of Object.keys(d)) {
          if (!allowed.includes(k) && k !== '_history' && k !== 'history') {
            delete d[k];
          }
        }
      } else if (role === 'designer') {
        const allowed = ['materialsLink', 'idLink', 'supplierIdUploaded', 'techLink', 'comment', 'idStatus'];
        for (const k of Object.keys(d)) {
          if (!allowed.includes(k) && k !== '_history' && k !== 'history') {
            delete d[k];
          }
        }
      } else if (role === 'logistics') {
        const allowed = ['tmc', 'comment', 'supplierOrderSigned', 'dostup', 'statusSupply'];
        for (const k of Object.keys(d)) {
          if (!allowed.includes(k) && k !== '_history' && k !== 'history') {
            delete d[k];
          }
        }
      } else if (role === 'accountant') {
        const allowed = ['edoNumber', 'invoiceInfo', 'vedoStatus', 'oplata', 'comment', 'statusFinance'];
        for (const k of Object.keys(d)) {
          if (!allowed.includes(k) && k !== '_history' && k !== 'history') {
            delete d[k];
          }
        }
      }
    }
    // Если меняется исполнитель — подтягиваем организацию только если подрядчик еще не был назначен
    if (!d.contractor && d.assignee !== undefined && d.assignee) {
      try {
        const { rows: workerRows } = await pool.query(
          `SELECT c.name_short FROM users u JOIN contractors c ON c.id = u.contractor_id WHERE u.full_name = $1 AND u.role = 'worker' LIMIT 1`,
          [d.assignee]
        );
        if (workerRows[0]) d.contractor = workerRows[0].name_short;
      } catch(e) { console.error('Auto-contractor lookup error:', e.message); }
    }
    if (d.assignee !== undefined && d.assignee && !d.assignmentStatus && !d.assignment_status) {
      d.assignmentStatus = 'pending';
    }

    // Синхронизация macro_status и stage_num
    const macroToStage = {
      new: 0,
      assigned: 1,
      install: 2,
      id_in_progress: 4,
      id_delivered: 5,
      accepted: 7,
      billing: 8,
      paid: 9
    };
    const stageToMacro = (sNum) => {
      const n = parseInt(sNum, 10);
      if (n >= 9) return 'paid';
      if (n >= 8) return 'billing';
      if (n >= 7) return 'accepted';
      if (n >= 5) return 'id_delivered';
      if (n >= 3) return 'id_in_progress';
      if (n >= 2) return 'install';
      if (n >= 1) return 'assigned';
      return 'new';
    };

    let targetStageNum = d.stageNum !== undefined && d.stageNum !== null ? Number(d.stageNum) : null;
    let targetMacroStatus = d.macroStatus || null;

    if (targetMacroStatus && targetStageNum === null) {
      targetStageNum = macroToStage[targetMacroStatus.toLowerCase()] ?? null;
    } else if (targetStageNum !== null && !targetMacroStatus) {
      targetMacroStatus = stageToMacro(targetStageNum);
    }

    const currentContractor = currentTask && currentTask.contractor ? String(currentTask.contractor).trim() : '';
    const hasContractor = d.contractor !== undefined;
    const cleanContractor = hasContractor ? (d.contractor ? String(d.contractor).trim() : null) : null;
    const effectiveContractor = hasContractor ? cleanContractor : (currentContractor || null);

    const currentAssignee = currentTask && currentTask.assignee ? String(currentTask.assignee).trim() : '';
    const hasAssignee = d.assignee !== undefined;
    const cleanAssignee = hasAssignee ? (d.assignee ? String(d.assignee).trim() : null) : null;
    const effectiveAssignee = hasAssignee ? cleanAssignee : (currentAssignee || null);

    // Если на заявке есть подрядчик, а макростатус еще new — автоматически переводим в assigned (Этап 1)
    if (effectiveContractor) {
      if (!targetMacroStatus || targetMacroStatus === 'new') {
        const curMacro = currentTask.macro_status || 'new';
        if (curMacro === 'new') {
          targetMacroStatus = 'assigned';
          if (targetStageNum === null || targetStageNum === 0) targetStageNum = 1;
        }
      }
    } else if (hasContractor && !cleanContractor) {
      // Подрядчик был явно снят с заявки
      if (targetMacroStatus === 'assigned' || (!targetMacroStatus && currentTask.macro_status === 'assigned')) {
        targetMacroStatus = 'new';
        targetStageNum = 0;
      }
    }

    const hasStageNum = targetStageNum !== null;

    // Синхронизация основного статуса задачи (status: pending / progress / done / paid)
    let targetStatus = d.status || null;
    if (!targetStatus) {
      if (targetMacroStatus) {
        const msLow = targetMacroStatus.toLowerCase();
        if (['paid', 'billing', 'accepted', 'done'].includes(msLow)) {
          targetStatus = 'done';
        } else if (['assigned', 'install', 'review', 'id_in_progress', 'id_delivered'].includes(msLow)) {
          targetStatus = 'progress';
        } else if (msLow === 'new') {
          targetStatus = (effectiveContractor || effectiveAssignee) ? 'progress' : 'pending';
        }
      } else if (effectiveContractor || effectiveAssignee) {
        if (currentTask.status === 'pending') {
          targetStatus = 'progress';
        }
      } else if (hasContractor && !cleanContractor && !effectiveAssignee) {
        if (currentTask.status === 'progress' && (!currentTask.macro_status || currentTask.macro_status === 'assigned' || currentTask.macro_status === 'new')) {
          targetStatus = 'pending';
        }
      }
    }

    // Защита от рассинхрона: если у заявки есть подрядчик или ПМ, она не должна висеть в "pending"
    if ((effectiveContractor || effectiveAssignee) && (targetStatus === 'pending' || (!targetStatus && currentTask.status === 'pending'))) {
      targetStatus = 'progress';
    }

    // --- АВТОМАТИЧЕСКАЯ ФИКСАЦИЯ ВСЕХ ИЗМЕНЕНИЙ В ЖУРНАЛ ИСТОРИИ ---
    function formatHistoryValue(val) {
      if (val === null || val === undefined || val === '') return '—';
      if (typeof val === 'boolean') return val ? 'Да' : 'Нет';
      if (val instanceof Date) return val.toLocaleDateString('ru-RU');
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
        return val.slice(0, 10).split('-').reverse().join('.');
      }
      const str = String(val).trim();
      const DICT = {
        pending: 'Не распределено',
        progress: 'В работе',
        done: 'Завершено',
        paid: 'Оплачено',
        cancelled: 'Отменено',
        new: 'Новая заявка',
        assigned: 'Назначен подрядчик',
        install: 'В монтаже (выход на объект)',
        review: 'Проверка СМР',
        id_in_progress: 'Подготовка ИД',
        id_delivered: 'ИД передана заказчику',
        accepted: 'Принято заказчиком',
        billing: 'Выставлен счёт',
        in_progress: 'В процессе монтажа',
        issues: 'Есть замечания'
      };
      return DICT[str.toLowerCase()] || str;
    }

    const newHistoryEntries = [];
    const nowRu = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const authorName = (req.user && (req.user.fullName || req.user.username)) || 'Система';

    const checkChange = (label, oldVal, newVal) => {
      const oldFmt = formatHistoryValue(oldVal);
      const newFmt = formatHistoryValue(newVal);
      if (oldFmt !== newFmt) {
        newHistoryEntries.push({
          date: nowRu,
          author: authorName,
          field: label,
          old: oldFmt,
          new: newFmt
        });
      }
    };

    if (targetStatus !== null && targetStatus !== undefined) checkChange('Статус заявки', currentTask.status, targetStatus);
    if (targetMacroStatus !== null && targetMacroStatus !== undefined) checkChange('Макростатус / Этап', currentTask.macro_status, targetMacroStatus);
    if (targetStageNum !== null && targetStageNum !== undefined) checkChange('Номер этапа', currentTask.stage_num, targetStageNum);
    if (hasContractor) checkChange('Подрядчик', currentTask.contractor, cleanContractor);
    if (d.assignee !== undefined) checkChange('Исполнитель (ПМ)', currentTask.assignee, d.assignee);
    if (d.controller !== undefined) checkChange('Контролёр', currentTask.controller, d.controller);
    if (d.dataVyhoda !== undefined || d.data_vyhoda !== undefined) checkChange('Дата выхода на объект', currentTask.data_vyhoda, safeDate(d.dataVyhoda || d.data_vyhoda));
    if (d.smrActualEndDate !== undefined || d.smr_actual_end_date !== undefined) checkChange('Фактическая дата завершения СМР', currentTask.smr_actual_end_date, safeDate(d.smrActualEndDate || d.smr_actual_end_date));
    if (d.statusSmr !== undefined || d.status_smr !== undefined) checkChange('Статус СМР', currentTask.status_smr, d.statusSmr || d.status_smr);
    if (d.fact !== undefined && d.fact !== null) checkChange('Факт (портов)', currentTask.fact, d.fact !== '' ? Number(d.fact) : null);
    if (d.inOrder !== undefined && d.inOrder !== null) checkChange('В заказе (портов)', currentTask.in_order, d.inOrder !== '' ? Number(d.inOrder) : null);
    if (d.deadline !== undefined) checkChange('Срок окончания работ', currentTask.deadline, safeDate(d.deadline));
    if (d.amount !== undefined && d.amount !== null) checkChange('Сумма договора', currentTask.amount, d.amount !== '' ? Number(d.amount) : null);
    if (d.pricePerUnit !== undefined && d.pricePerUnit !== null) checkChange('Цена за ед.', currentTask.price_per_unit, d.pricePerUnit !== '' ? Number(d.pricePerUnit) : null);
    if (d.kmRate !== undefined && d.kmRate !== null) checkChange('Ставка за км', currentTask.km_rate, d.kmRate !== '' ? Number(d.kmRate) : null);
    if (d.distanceKm !== undefined && d.distanceKm !== null) checkChange('Доплата за удаленность (₽)', currentTask.distance_km, d.distanceKm !== '' ? Number(d.distanceKm) : null);
    if (d.realDistanceKm !== undefined && d.realDistanceKm !== null) checkChange('Километраж дороги (км)', currentTask.real_distance_km, d.realDistanceKm !== '' ? Number(d.realDistanceKm) : null);
    if (d.tmc !== undefined && d.tmc !== null) checkChange('Сумма ТМЦ', currentTask.tmc, d.tmc !== '' ? Number(d.tmc) : null);
    if (d.extras !== undefined && d.extras !== null) checkChange('Дополнительные расходы', currentTask.extras, d.extras !== '' ? Number(d.extras) : null);
    if (d.region !== undefined) checkChange('Регион', currentTask.region, d.region);
    if (d.address !== undefined) checkChange('Адрес объекта', currentTask.address, d.address);
    if (d.workType !== undefined || d.work_type !== undefined) checkChange('Тип работ', currentTask.work_type, d.workType || d.work_type);
    if (d.priority !== undefined) checkChange('Приоритет', currentTask.priority, d.priority);
    if (d.contact !== undefined) checkChange('Контакт на объекте', currentTask.contact, d.contact);
    if (d.comment !== undefined) checkChange('Комментарий', currentTask.comment, d.comment);
    if (d.techLink !== undefined || d.tech_link !== undefined) checkChange('Ссылка на документацию', currentTask.tech_link, d.techLink || d.tech_link);
    if (d.obsledovanie !== undefined) checkChange('Обследование', currentTask.obsledovanie, d.obsledovanie);
    if (d.dostup !== undefined) checkChange('Доступ', currentTask.dostup, d.dostup);
    if (d.priemka !== undefined) checkChange('Приёмка', currentTask.priemka, d.priemka);
    if (d.oplata !== undefined) checkChange('Оплата подрядчику', currentTask.oplata, d.oplata);
    if (d.edoNumber !== undefined || d.edo_number !== undefined) checkChange('№ в ЭДО', currentTask.edo_number, d.edoNumber || d.edo_number);
    if (d.invoiceInfo !== undefined || d.invoice_info !== undefined) checkChange('№ счёта/сумма', currentTask.invoice_info, d.invoiceInfo || d.invoice_info);
    if (d.vedoStatus !== undefined || d.vedo_status !== undefined) checkChange('В ЭДО', currentTask.vedo_status, d.vedoStatus || d.vedo_status);
    if (d.idStatus !== undefined || d.id_status !== undefined) checkChange('Статус ИД', currentTask.id_status, d.idStatus || d.id_status);
    if (d.customer !== undefined) checkChange('Заказчик', currentTask.customer, d.customer);
    if (d.contractId !== undefined || d.contract_id !== undefined) checkChange('Генеральный договор', currentTask.contract_id, d.contractId || d.contract_id);
    if (d.contractAgreementId !== undefined || d.contract_agreement_id !== undefined) checkChange('Доп. соглашение (Лот)', currentTask.contract_agreement_id, d.contractAgreementId || d.contract_agreement_id);
    if (d.ownCompanyId !== undefined || d.own_company_id !== undefined) checkChange('Наше юрлицо', currentTask.own_company_id, d.ownCompanyId || d.own_company_id);
    if (d.materialsLink !== undefined || d.materials_link !== undefined) checkChange('Ссылка на материалы', currentTask.materials_link, d.materialsLink || d.materials_link);
    if (d.idLink !== undefined || d.id_link !== undefined) checkChange('Ссылка на готовую ИД', currentTask.id_link, d.idLink || d.id_link);
    if (d.overdueReason !== undefined) checkChange('Причина просрочки', currentTask.overdue_reason, d.overdueReason);
    if (d.assignmentStatus !== undefined || d.assignment_status !== undefined) checkChange('Статус назначения', currentTask.assignment_status, d.assignmentStatus || d.assignment_status);

    let finalHistory = Array.isArray(currentTask.history) ? [...currentTask.history] : [];
    const clientHist = Array.isArray(d._history) ? d._history : (Array.isArray(d.history) ? d.history : []);
    for (const ch of clientHist) {
      if (ch && ch.field && !finalHistory.some(eh => eh.field === ch.field && eh.date === ch.date)) {
        if (!newHistoryEntries.some(nh => nh.field === ch.field)) {
          finalHistory.push(ch);
        }
      }
    }
    if (newHistoryEntries.length > 0) {
      finalHistory = finalHistory.concat(newHistoryEntries);
    }

const updateFields = [];
    const updateValues = [];
    let pIdx = 1;

    function addField(col, val, typeCast) {
      updateFields.push(`${col} = $${pIdx++}${typeCast ? '::' + typeCast : ''}`);
      updateValues.push(val);
    }

    if (d.region !== undefined) addField('region', d.region || null);
    if (d.address !== undefined) addField('address', d.address || null);
    if (d.workType !== undefined || d.work_type !== undefined) addField('work_type', d.workType || d.work_type || null);
    if (d.deadline !== undefined) addField('deadline', safeDate(d.deadline), 'date');
    if (d.priority !== undefined) addField('priority', d.priority || null);
    if (d.archived !== undefined) addField('archived', Boolean(d.archived), 'boolean');
    if (d.assignee !== undefined) addField('assignee', d.assignee || null);
    if (d.controller !== undefined) addField('controller', d.controller || null);
    if (d.manager !== undefined) addField('manager', d.manager || null);
    if (d.comment !== undefined) addField('comment', d.comment !== null ? String(d.comment) : null);
    if (d.distributedAt !== undefined || d.distributed_at !== undefined) {
      addField('distributed_at', safeDate(d.distributedAt !== undefined ? d.distributedAt : d.distributed_at), 'date');
    }
    if (d.contact !== undefined) addField('contact', d.contact !== null ? String(d.contact) : null);
    if (d.techLink !== undefined || d.tech_link !== undefined) addField('tech_link', (d.techLink || d.tech_link) || null);
    if (d.fact !== undefined && d.fact !== null) addField('fact', d.fact !== '' ? Math.max(0, Number(d.fact) || 0) : null, 'integer');
    if (d.overdueDays !== undefined && d.overdueDays !== null) addField('overdue_days', Math.max(0, Number(d.overdueDays) || 0), 'integer');
    if (hasContractor) addField('contractor', cleanContractor);
    if (d.inOrder !== undefined && d.inOrder !== null) addField('in_order', d.inOrder !== '' ? Math.max(0, Number(d.inOrder) || 0) : null, 'integer');
    if (d.amount !== undefined && d.amount !== null) addField('amount', d.amount !== '' ? Math.max(0, Number(d.amount) || 0) : null, 'numeric');
    if (d.distanceKm !== undefined || d.distance_km !== undefined) {
      const rawD = d.distanceKm !== undefined ? d.distanceKm : d.distance_km;
      addField('distance_km', (rawD !== null && rawD !== '') ? Math.max(0, Number(rawD) || 0) : null, 'numeric');
    }
    if (d.pricePerUnit !== undefined || d.price_per_unit !== undefined) {
      const rawP = d.pricePerUnit !== undefined ? d.pricePerUnit : d.price_per_unit;
      addField('price_per_unit', (rawP !== null && rawP !== '') ? Math.max(0, Number(rawP) || 0) : null, 'numeric');
    }
    if (d.idStatus !== undefined || d.id_status !== undefined) addField('id_status', (d.idStatus || d.id_status) || null);
    if (d.excelComment !== undefined || d.excel_comment !== undefined) {
      const ec = d.excelComment !== undefined ? d.excelComment : d.excel_comment;
      addField('excel_comment', ec !== null ? String(ec) : null);
    }
    if (d.edoNumber !== undefined || d.edo_number !== undefined) {
      const ed = d.edoNumber !== undefined ? d.edoNumber : d.edo_number;
      addField('edo_number', ed !== null ? String(ed) : null);
    }
    if (d.invoiceInfo !== undefined || d.invoice_info !== undefined) {
      const ii = d.invoiceInfo !== undefined ? d.invoiceInfo : d.invoice_info;
      addField('invoice_info', ii !== null ? String(ii) : null);
    }
    if (d.vedoStatus !== undefined || d.vedo_status !== undefined) {
      const vs = d.vedoStatus !== undefined ? d.vedoStatus : d.vedo_status;
      addField('vedo_status', vs !== null ? String(vs) : null);
    }
    if (d.kmRate !== undefined && d.kmRate !== null) addField('km_rate', d.kmRate !== '' ? Math.max(0, Number(d.kmRate) || 0) : null, 'numeric');
    if (d.tmc !== undefined && d.tmc !== null) addField('tmc', d.tmc !== '' ? Math.max(0, Number(d.tmc) || 0) : null, 'numeric');
    if (d.extras !== undefined && d.extras !== null) addField('extras', d.extras !== '' ? Math.max(0, Number(d.extras) || 0) : null, 'numeric');
    if (d.supplierOrderSigned !== undefined) addField('supplier_order_signed', Boolean(d.supplierOrderSigned), 'boolean');
    if (d.supplierIdUploaded !== undefined) addField('supplier_id_uploaded', Boolean(d.supplierIdUploaded), 'boolean');
    if (d.overdueReason !== undefined) addField('overdue_reason', d.overdueReason || null);
    if (d.assignmentStatus !== undefined || d.assignment_status !== undefined) {
      addField('assignment_status', (d.assignmentStatus || d.assignment_status) || null);
    }
    if (d.customer !== undefined) addField('customer', d.customer || null);
    if (d.managerId !== undefined || d.manager_id !== undefined) {
      const mid = d.managerId !== undefined ? d.managerId : d.manager_id;
      addField('manager_id', mid ? Number(mid) : null, 'integer');
    }
    if (d.designerId !== undefined || d.designer_id !== undefined) {
      const did = d.designerId !== undefined ? d.designerId : d.designer_id;
      addField('designer_id', did ? Number(did) : null, 'integer');
    }
    if (d.materialsLink !== undefined || d.materials_link !== undefined) {
      addField('materials_link', (d.materialsLink || d.materials_link) || null);
    }
    if (d.idLink !== undefined || d.id_link !== undefined) {
      addField('id_link', (d.idLink || d.id_link) || null);
    }
    if (d.stageDue !== undefined || d.stage_due !== undefined) {
      addField('stage_due', safeDate(d.stageDue !== undefined ? d.stageDue : d.stage_due), 'timestamptz');
    }
    if (targetMacroStatus) addField('macro_status', targetMacroStatus);
    if (hasStageNum) addField('stage_num', targetStageNum, 'integer');
    if (d.activeProcesses !== undefined) addField('active_processes', JSON.stringify(d.activeProcesses), 'jsonb');
    if (d.customerId !== undefined || d.customer_id !== undefined) {
      const cid = d.customerId !== undefined ? d.customerId : d.customer_id;
      addField('customer_id', cid ? Number(cid) : null, 'integer');
    }
    if (d.contract_id !== undefined || d.contractId !== undefined) {
      const cid = d.contract_id !== undefined ? d.contract_id : d.contractId;
      addField('contract_id', cid ? Number(cid) : null, 'integer');
    }
    if (d.contract_lot !== undefined || d.contractLot !== undefined) {
      const clot = d.contract_lot !== undefined ? d.contract_lot : d.contractLot;
      addField('contract_lot', clot ? Number(clot) : null, 'integer');
    }
    if (d.rawData !== undefined || d.raw_data !== undefined) {
      addField('raw_data', JSON.stringify(d.rawData || d.raw_data), 'jsonb');
    }
    if (d.own_company_id !== undefined || d.ownCompanyId !== undefined) {
      const oid = d.own_company_id !== undefined ? d.own_company_id : d.ownCompanyId;
      addField('own_company_id', oid ? Number(oid) : null, 'integer');
    }
    if (d.contract_agreement_id !== undefined || d.contractAgreementId !== undefined) {
      const aid = d.contract_agreement_id !== undefined ? d.contract_agreement_id : d.contractAgreementId;
      addField('contract_agreement_id', aid ? Number(aid) : null, 'integer');
    }
    if (d.dataVyhoda !== undefined || d.data_vyhoda !== undefined) {
      addField('data_vyhoda', safeDate(d.dataVyhoda !== undefined ? d.dataVyhoda : d.data_vyhoda), 'date');
    }
    if (d.statusSmr !== undefined || d.status_smr !== undefined) {
      addField('status_smr', (d.statusSmr || d.status_smr) || null);
    }
    if (d.obsledovanie !== undefined) addField('obsledovanie', d.obsledovanie !== null ? String(d.obsledovanie) : null);
    if (d.dostup !== undefined) addField('dostup', d.dostup !== null ? String(d.dostup) : null);
    if (d.priemka !== undefined) addField('priemka', d.priemka !== null ? String(d.priemka) : null);
    if (d.smrActualEndDate !== undefined || d.smr_actual_end_date !== undefined) {
      addField('smr_actual_end_date', safeDate(d.smrActualEndDate !== undefined ? d.smrActualEndDate : d.smr_actual_end_date), 'date');
    }
    if (targetStatus) addField('status', targetStatus);
    if (d.realDistanceKm !== undefined || d.real_distance_km !== undefined) {
      const rawRd = d.realDistanceKm !== undefined ? d.realDistanceKm : d.real_distance_km;
      addField('real_distance_km', (rawRd !== null && rawRd !== '') ? Math.max(0, Number(rawRd) || 0) : null, 'numeric');
    }

    // Всегда обновляем историю, версию и updated_at
    addField('history', JSON.stringify(finalHistory.slice(-500)), 'jsonb');
    updateFields.push('version = version + 1');
    updateFields.push('updated_at = NOW()');

    updateValues.push(req.params.id);
    await pool.query(`
      UPDATE tasks SET ${updateFields.join(', ')} WHERE id = $${pIdx}
    `, updateValues);

    // Синхронизация с таблицей contractor_subcontracts при смене или снятии подрядчика
    if (hasContractor) {
      if (cleanContractor) {
        try {
          const { rows: cRows } = await pool.query(
            'SELECT id, inn, phone FROM contractors WHERE LOWER(TRIM(name_short)) = LOWER($1) OR LOWER(TRIM(name_full)) = LOWER($1) LIMIT 1',
            [cleanContractor]
          );
          const cObj = cRows[0] || null;
          const cId = cObj ? cObj.id : null;
          const cInn = cObj ? cObj.inn : null;

          const { rows: existingSubs } = await pool.query(
            'SELECT id FROM contractor_subcontracts WHERE task_id = $1 ORDER BY id DESC LIMIT 1',
            [req.params.id]
          );

          if (existingSubs.length > 0) {
            await pool.query(
              `UPDATE contractor_subcontracts 
               SET contractor_name = $1, contractor_id = $2, contractor_inn = $3, status = 'active', updated_at = NOW() 
               WHERE id = $4`,
              [cleanContractor, cId, cInn, existingSubs[0].id]
            );
          } else {
            await pool.query(
              `INSERT INTO contractor_subcontracts (task_id, contractor_id, contractor_name, contractor_inn, work_type, status)
               VALUES ($1, $2, $3, $4, 'Монтаж СКС', 'active')`,
              [req.params.id, cId, cleanContractor, cInn]
            );
          }
        } catch(subErr) {
          console.error('Error auto-syncing contractor subcontract:', subErr.message);
        }
      } else {
        // Подрядчик снят с заявки
        try {
          await pool.query(
            `UPDATE contractor_subcontracts SET status = 'cancelled', updated_at = NOW() WHERE task_id = $1`,
            [req.params.id]
          );
        } catch(subErr) {
          console.error('Error cancelling subcontract on contractor removal:', subErr.message);
        }
      }
    }

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

    // --- АВТОСИНХРОНИЗАЦИЯ СУБПОДРЯДОВ ПРИ НАЗНАЧЕНИИ ПОДРЯДЧИКА ---
    if (d.contractor !== undefined) {
      syncSingleTaskSubcontract(pool, req.params.id).catch(err => {
        console.error('Auto-sync subcontract error:', err.message);
      });
    }

    const { rows: updatedRows } = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM remarks rm WHERE rm.task_id = t.id AND rm.resolved_at IS NULL)::integer AS open_remarks_count
      FROM tasks t WHERE t.id = $1
    `, [req.params.id]);

    const fullTask = updatedRows[0] ? rowToTask(updatedRows[0]) : null;
    res.json({ success: true, task: fullTask });
  } catch(e) { console.error('PUT task error:', e.message); res.status(500).json({ error: e.message }) }
});

// ─── ПРИНЯЛ / ОТКАЗАЛСЯ (ВХОДНОЙ КОНТРОЛЬ) ───────────────────────────────────
router.post('/tasks/:id/accept', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT assignee, assignment_status, history FROM tasks WHERE id=$1', [req.params.id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Заявка не найдена' });
    const isManager = ['admin', 'director', 'manager', 'to_engineer'].includes(req.user.role);
    if (!isManager && task.assignee && task.assignee !== req.user.fullName && task.assignee !== req.user.username) {
      return res.status(403).json({ error: 'Эта заявка назначена не вам' });
    }

    const { assignee, controller, own_company_id, tech_link } = req.body || {};
    const nowRu = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const authorName = (req.user && (req.user.fullName || req.user.username)) || 'Система';
    let hist = Array.isArray(task.history) ? [...task.history] : [];
    hist.push({
      date: nowRu,
      author: authorName,
      field: 'Входной контроль',
      old: task.assignment_status || 'Ожидает входного контроля',
      new: `Принято в работу (ПМ: ${assignee || task.assignee || authorName})`
    });

    await pool.query(`
      UPDATE tasks 
      SET 
        assignment_status = 'accepted',
        assignee          = COALESCE(NULLIF($2, ''), assignee),
        controller        = COALESCE(NULLIF($3, ''), controller),
        own_company_id    = COALESCE($4::integer, own_company_id),
        tech_link         = COALESCE(NULLIF($5, ''), tech_link),
        status            = CASE WHEN status IN ('new', 'pending', 'cancelled') THEN 'progress' ELSE status END,
        stage_num         = CASE WHEN stage_num = 0 THEN 1 ELSE stage_num END,
        history           = $6::jsonb,
        updated_at        = NOW()
      WHERE id = $1
    `, [
      req.params.id,
      assignee,
      controller,
      own_company_id ? Number(own_company_id) : null,
      tech_link,
      JSON.stringify(hist.slice(-500))
    ]);

    pool.query('SELECT id FROM users WHERE role=$1', ['admin']).then(({ rows: admins }) => {
      admins.forEach(a => createNotification(a.id, `✅ Заявка принята: ${req.params.id}`, `${req.user.fullName} принял заявку в работу`, req.params.id));
    }).catch(err => console.error('Admin notify error:', err.message));

    const { rows: updatedRows } = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM remarks rm WHERE rm.task_id = t.id AND rm.resolved_at IS NULL)::integer AS open_remarks_count
      FROM tasks t WHERE t.id = $1
    `, [req.params.id]);

    const fullTask = updatedRows[0] ? rowToTask(updatedRows[0]) : null;
    res.json({ success: true, task: fullTask });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/tasks/:id/decline', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT assignee, history, assignment_status FROM tasks WHERE id=$1', [req.params.id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Заявка не найдена' });
    const isManager = ['admin', 'director', 'manager', 'to_engineer'].includes(req.user.role);
    if (!isManager && task.assignee && task.assignee !== req.user.fullName && task.assignee !== req.user.username) {
      return res.status(403).json({ error: 'Эта заявка назначена не вам' });
    }

    const reason = req.body && req.body.reason ? String(req.body.reason).trim() : '';
    const nowRu = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const authorName = (req.user && (req.user.fullName || req.user.username)) || 'Система';
    let hist = Array.isArray(task.history) ? [...task.history] : [];
    hist.push({
      date: nowRu,
      author: authorName,
      field: 'Входной контроль',
      old: task.assignment_status || 'Ожидает входного контроля',
      new: 'Отклонено' + (reason ? ': ' + reason : '')
    });

    await pool.query(
      `UPDATE tasks SET assignment_status='declined', overdue_reason = COALESCE(NULLIF($2, ''), overdue_reason), status = 'cancelled', history = $3::jsonb, updated_at = NOW() WHERE id=$1`,
      [req.params.id, reason, JSON.stringify(hist.slice(-500))]
    );

    pool.query('SELECT id FROM users WHERE role=$1', ['admin']).then(({ rows: admins }) => {
      admins.forEach(a => createNotification(a.id, `❌ Заявка отклонена: ${req.params.id}`, `${req.user.fullName} отклонил заявку${reason ? ': ' + reason : ''}`, req.params.id));
    }).catch(err => console.error('Admin notify error:', err.message));

    const { rows: updatedRows } = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM remarks rm WHERE rm.task_id = t.id AND rm.resolved_at IS NULL)::integer AS open_remarks_count
      FROM tasks t WHERE t.id = $1
    `, [req.params.id]);

    const fullTask = updatedRows[0] ? rowToTask(updatedRows[0]) : null;
    res.json({ success: true, task: fullTask });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.delete('/tasks/:id', authenticateToken, requireRole('admin', 'director'), async (req, res) => {
  try {
    await pool.query('DELETE FROM notifications WHERE link=$1', [req.params.id]);
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── API: ЖИЗНЕННЫЙ ЦИКЛ ИД И ЗАМЕЧАНИЯ СБЕРА ─────────────────────────────────

// ─── API: НОВЫЕ КОНТЕКСТНЫЕ ДЕЙСТВИЯ (ЗАВЕРШЕНИЕ СМР, ИД, ОПЛАТА) ─────────────────────────────────

// 1. Монтажник отчитывается о сдаче СМР
router.post('/tasks/:id/smr/submit', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Заявка не найдена' });

    const author = req.user ? (req.user.fullName || req.user.username) : 'Монтажник';
    const hist = rows[0].history || [];
    hist.push({
      date: new Date().toLocaleString('ru-RU'),
      author: author,
      field: 'СМР',
      old: rows[0].status_smr || 'in_progress',
      new: 'Сдано на проверку куратору'
    });

    await pool.query(
      "UPDATE tasks SET status_smr = 'review', history = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [req.params.id, JSON.stringify(hist)]
    );
    res.json({ success: true, status_smr: 'review' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Менеджер / Руководитель принимает СМР (разрешает оплату монтажнику и передачу Заказчику)
router.post('/tasks/:id/smr/accept', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Заявка не найдена' });

    const author = req.user ? (req.user.fullName || req.user.username) : 'Менеджер';
    const hist = rows[0].history || [];
    hist.push({
      date: new Date().toLocaleString('ru-RU'),
      author: author,
      field: 'СМР',
      old: rows[0].status_smr || 'review',
      new: 'Принято куратором (оплата монтажнику разрешена)'
    });

    await pool.query(
      "UPDATE tasks SET status_smr = 'done', macro_status = 'smr_done', history = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [req.params.id, JSON.stringify(hist)]
    );
    res.json({ success: true, status_smr: 'done' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Менеджер возвращает СМР на доработку
router.post('/tasks/:id/smr/reject', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Заявка не найдена' });

    const reason = (req.body && req.body.reason) ? req.body.reason.trim() : 'Замечания по монтажу';
    const author = req.user ? (req.user.fullName || req.user.username) : 'Менеджер';
    const hist = rows[0].history || [];
    hist.push({
      date: new Date().toLocaleString('ru-RU'),
      author: author,
      field: 'СМР',
      old: rows[0].status_smr || 'review',
      new: 'Возврат на доработку: ' + reason
    });

    await pool.query(
      "UPDATE tasks SET status_smr = 'in_progress', history = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [req.params.id, JSON.stringify(hist)]
    );
    res.json({ success: true, status_smr: 'in_progress' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Сохраняем обратную совместимость для complete
router.post('/tasks/:id/smr/complete', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Заявка не найдена' });
    
    await pool.query(
      "UPDATE tasks SET status_smr = 'done', macro_status = 'smr_done', updated_at = NOW() WHERE id = $1",
      [req.params.id]
    );
    res.json({ success: true, status_smr: 'done' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tasks/:id/id/review', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Заявка не найдена' });
    const nowRu = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const authorName = (req.user && (req.user.fullName || req.user.username)) || 'Система';
    let hist = Array.isArray(rows[0].history) ? [...rows[0].history] : [];
    hist.push({ date: nowRu, author: authorName, field: 'Статус ИД', old: rows[0].status_id || '—', new: 'На согласовании (review)' });

    await pool.query(
      "UPDATE tasks SET status_id = 'review', macro_status = 'review', history = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [req.params.id, JSON.stringify(hist.slice(-500))]
    );
    const { rows: updatedRows } = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM remarks rm WHERE rm.task_id = t.id AND rm.resolved_at IS NULL)::integer AS open_remarks_count
      FROM tasks t WHERE t.id = $1
    `, [req.params.id]);

    const fullTask = updatedRows[0] ? rowToTask(updatedRows[0]) : null;
    res.json({ success: true, task: fullTask });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tasks/:id/finance/paid', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Заявка не найдена' });
    const nowRu = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const authorName = (req.user && (req.user.fullName || req.user.username)) || 'Система';
    let hist = Array.isArray(rows[0].history) ? [...rows[0].history] : [];
    hist.push({ date: nowRu, author: authorName, field: 'Финансы / Оплата', old: 'В процессе', new: 'Оплачено Заказчиком и подрядчику' });

    await pool.query(
      "UPDATE tasks SET status_payment_customer = 'paid', status_payment_sub = 'paid', macro_status = 'paid', history = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [req.params.id, JSON.stringify(hist.slice(-500))]
    );
    const { rows: updatedRows } = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM remarks rm WHERE rm.task_id = t.id AND rm.resolved_at IS NULL)::integer AS open_remarks_count
      FROM tasks t WHERE t.id = $1
    `, [req.params.id]);

    const fullTask = updatedRows[0] ? rowToTask(updatedRows[0]) : null;
    res.json({ success: true, task: fullTask });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

// Отмена заявки с обязательным указанием причины
router.post('/tasks/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Укажите причину отмены заявки' });
    }
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Заявка не найдена' });

    if (!hasRole(req.user, 'admin', 'leader', 'manager', 'dispatch')) {
      return res.status(403).json({ error: 'У вас нет прав для отмены заявки' });
    }

    const history = Array.isArray(task.history) ? [...task.history] : [];
    history.push({
      date: new Date().toISOString(),
      user: req.user.fullName || req.user.username,
      userId: req.user.id,
      action: 'Отмена заявки',
      note: reason.trim()
    });

    await pool.query(`
      UPDATE tasks SET
        status = 'cancelled',
        overdue_reason = $2,
        history = $3::jsonb,
        updated_at = NOW()
      WHERE id = $1
    `, [req.params.id, reason.trim(), JSON.stringify(history)]);

    const { rows: updatedRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    const updatedTask = rowToTask(updatedRows[0]);
    io.emit('task-updated', updatedTask);
    res.json({ success: true, task: updatedTask, status: 'cancelled' });
  } catch(e) {
    console.error('Cancel error:', e.message);
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
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (['admin', 'director', 'manager', 'logistics', 'designer', 'accountant', 'to_engineer'].includes(role)) return true;
  const { rows } = await pool.query('SELECT assignee FROM tasks WHERE id = $1', [taskId]);
  if (!rows[0]) return false;
  return rows[0].assignee === user.fullName;
}

router.get('/tasks/:id/attachments', authenticateToken, async (req, res) => {
  try {
    if (!(await canAccessTaskAttachments(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Нет доступа к этой заявке' });
    }
    const { rows } = await pool.query(
      'SELECT id, type, original_name, mime_type, size_bytes, comment, created_at, false AS from_contract, NULL::integer AS contract_id FROM task_attachments WHERE task_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    for (const a of rows) {
      const fixedName = fixUtf8Filename(a.original_name);
      if (fixedName && fixedName !== a.original_name) {
        a.original_name = fixedName;
        pool.query('UPDATE task_attachments SET original_name = $1 WHERE id = $2', [fixedName, a.id]).catch(() => {});
      }
    }

    // Подтягиваем вложения Генерального контракта (ТЗ, проект, смета)
    const { rows: tRows } = await pool.query('SELECT contract_id FROM tasks WHERE id = $1', [req.params.id]);
    if (tRows.length && tRows[0].contract_id) {
      const cId = tRows[0].contract_id;
      const { rows: cAtts } = await pool.query(`
        SELECT id, attachment_type AS type, original_name, mime_type, file_size AS size_bytes, comment, created_at, true AS from_contract, contract_id
        FROM contract_attachments
        WHERE contract_id = $1
        ORDER BY created_at DESC
      `, [cId]);
      for (const ca of cAtts) {
        ca.original_name = fixUtf8Filename(ca.original_name);
        rows.push(ca);
      }
    }

    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
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
      const cleanOriginalName = fixUtf8Filename(file.originalname);
      const { rows } = await pool.query(
        `INSERT INTO task_attachments (task_id, type, file_path, original_name, mime_type, size_bytes, uploaded_by, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, type, original_name, mime_type, size_bytes, comment, created_at`,
        [req.params.id, type, file.filename, cleanOriginalName, file.mimetype, file.size, req.user.id, req.body.comment || null]
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
    const cleanName = fixUtf8Filename(att.original_name || att.file_path);
    res.sendFile(path.join(UPLOADS_DIR, att.file_path), {
      headers: { 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(cleanName)}` }
    })
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.delete('/attachments/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM task_attachments WHERE id = $1', [req.params.attachmentId])
    const att = rows[0]
    if (!att) return res.status(404).json({ error: 'Файл не найден' })
    const role = String(req.user?.role || '').toLowerCase();
    // Удалять может админ, руководитель, или сам загрузивший
    if (!['admin', 'director'].includes(role) && att.uploaded_by !== req.user.id) {
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
    const { portNumber, patchPanel, room, marking, cableLength, cabinet, unit, crimping, testingStatus } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO task_ports (task_id, port_number, patch_panel, room, marking, cable_length, cabinet, unit, crimping, testing_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        req.params.id,
        portNumber || null,
        patchPanel || null,
        room || null,
        marking || null,
        cableLength !== undefined && cableLength !== '' ? Number(cableLength) : null,
        cabinet || null,
        unit || null,
        crimping || null,
        testingStatus || null
      ]
    )
    res.json(rows[0])
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/tasks/:id/ports/batch', authenticateToken, async (req, res) => {
  try {
    if (!(await canAccessTaskAttachments(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Нет доступа к этой заявке' });
    }
    const { ports, replaceExisting } = req.body;
    if (!Array.isArray(ports)) return res.status(400).json({ error: 'ports must be an array' });

    if (replaceExisting) {
      await pool.query('DELETE FROM task_ports WHERE task_id = $1', [req.params.id]);
    }

    const inserted = [];
    for (const p of ports) {
      const { rows } = await pool.query(
        `INSERT INTO task_ports (task_id, port_number, patch_panel, room, marking, cable_length, cabinet, unit, crimping, testing_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          req.params.id,
          p.portNumber || p.port_number || null,
          p.patchPanel || p.patch_panel || null,
          p.room || null,
          p.marking || null,
          (p.cableLength != null && p.cableLength !== '') ? Number(p.cableLength) : ((p.cable_length != null && p.cable_length !== '') ? Number(p.cable_length) : null),
          p.cabinet || null,
          p.unit || null,
          p.crimping || null,
          p.testingStatus || p.testing_status || null
        ]
      );
      if (rows[0]) inserted.push(rows[0]);
    }
    res.json({ success: true, count: inserted.length, rows: inserted });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/ports/:rowId', authenticateToken, async (req, res) => {
  try {
    const { rows: existing } = await pool.query('SELECT task_id FROM task_ports WHERE id=$1', [req.params.rowId]);
    if (!existing[0]) return res.status(404).json({ error: 'Строка не найдена' });
    if (!(await canAccessTaskAttachments(req.user, existing[0].task_id))) {
      return res.status(403).json({ error: 'Нет доступа' })
    }
    const { portNumber, patchPanel, room, marking, cableLength, cabinet, unit, crimping, testingStatus } = req.body;
    const { rows } = await pool.query(
      `UPDATE task_ports SET
        port_number   = CASE WHEN $2::boolean THEN $3 ELSE port_number END,
        patch_panel   = CASE WHEN $4::boolean THEN $5 ELSE patch_panel END,
        room          = CASE WHEN $6::boolean THEN $7 ELSE room END,
        marking       = CASE WHEN $8::boolean THEN $9 ELSE marking END,
        cable_length  = CASE WHEN $10::boolean THEN $11::numeric ELSE cable_length END,
        cabinet       = CASE WHEN $12::boolean THEN $13 ELSE cabinet END,
        unit          = CASE WHEN $14::boolean THEN $15 ELSE unit END,
        crimping      = CASE WHEN $16::boolean THEN $17 ELSE crimping END,
        testing_status= CASE WHEN $18::boolean THEN $19 ELSE testing_status END
       WHERE id=$1 RETURNING *`,
      [
        req.params.rowId,
        portNumber !== undefined, portNumber || null,
        patchPanel !== undefined, patchPanel || null,
        room !== undefined, room || null,
        marking !== undefined, marking || null,
        cableLength !== undefined, (cableLength !== '' && cableLength !== null) ? Number(cableLength) : null,
        cabinet !== undefined, cabinet || null,
        unit !== undefined, unit || null,
        crimping !== undefined, crimping || null,
        testingStatus !== undefined, testingStatus || null
      ]
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
    const { rows: updatedRows } = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM remarks rm WHERE rm.task_id = t.id AND rm.resolved_at IS NULL)::integer AS open_remarks_count
      FROM tasks t WHERE t.id = $1
    `, [req.params.id]);

    const fullTask = updatedRows[0] ? rowToTask(updatedRows[0]) : null;
    res.json({ success: true, task: fullTask });
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
    const targetContractor = (contractorName && contractorName.trim()) || (task.contractor && task.contractor.trim()) || null;

    let wb, suffix;
    if (type === 'invoice') {
      wb = buildInvoice(task, targetContractor);
      suffix = targetContractor ? `_Счёт_${targetContractor}` : '_Счёт';
    } else if (type === 'act') {
      wb = buildAct(task, targetContractor);
      suffix = targetContractor ? `_Акт_${targetContractor}` : '_Акт';
    } else {
      // Приложение №2: ищем позиции task_items
      let itemsQuery = 'SELECT * FROM task_items WHERE task_id = $1';
      const params = [req.params.id];
      if (contractorId) {
        itemsQuery += ' AND contractor_id = $2';
        params.push(contractorId);
      } else if (targetContractor) {
        itemsQuery += ' AND (LOWER(TRIM(contractor_name)) = LOWER(TRIM($2)) OR contractor_name IS NULL)';
        params.push(targetContractor);
      }
      itemsQuery += ' ORDER BY id ASC';
      const itemsRes = await pool.query(itemsQuery, params);
      wb = buildApp2(task, targetContractor, itemsRes.rows);
      suffix = targetContractor ? `_Приложение_2_${targetContractor}` : '_Приложение_2';
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

router.post('/tasks/:id/items', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
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
      comment = null,
      article = null,
      supplier = null
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
        distance_km, status, comment,
        article, supplier
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`,
      [
        req.params.id, work_type.trim(), Number(quantity) || 1, unit || 'шт.',
        Number(price_customer) || 0, calcAmountCust,
        contractor_id ? parseInt(contractor_id, 10) : null, contractor_name ? contractor_name.trim() : null,
        Number(price_contractor) || 0, calcAmountCont,
        Number(distance_km) || 0, status || 'pending', comment || null,
        article ? String(article).trim() : null, supplier ? String(supplier).trim() : null
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

router.post('/tasks/:id/items/batch', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
  try {
    const { items, replaceExisting } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

    if (replaceExisting) {
      await pool.query('DELETE FROM task_items WHERE task_id = $1', [req.params.id]);
    }

    const inserted = [];
    for (const it of items) {
      const name = String(it.work_type || it.name || '').trim();
      if (!name) continue;
      const qty = Number(it.quantity || it.qty || 1) || 1;
      const unit = it.unit || 'шт.';
      const priceCust = Number(it.price_customer || it.priceCustomer || 0) || 0;
      const amountCust = Number(it.amount_customer || it.amountCustomer || (qty * priceCust)) || 0;
      const priceCont = Number(it.price_contractor || it.priceContractor || 0) || 0;
      const amountCont = Number(it.amount_contractor || it.amountContractor || (qty * priceCont)) || 0;
      const article = it.article ? String(it.article).trim() : null;
      const supplier = it.supplier ? String(it.supplier).trim() : null;

      const { rows } = await pool.query(
        `INSERT INTO task_items (
          task_id, work_type, quantity, unit,
          price_customer, amount_customer,
          contractor_id, contractor_name,
          price_contractor, amount_contractor,
          article, supplier, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')
        RETURNING *`,
        [
          req.params.id, name, qty, unit,
          priceCust, amountCust,
          it.contractor_id || null, it.contractor_name || null,
          priceCont, amountCont,
          article, supplier
        ]
      );
      if (rows[0]) inserted.push(rows[0]);
    }

    await pool.query(
      `UPDATE tasks SET amount = COALESCE((SELECT SUM(amount_customer) FROM task_items WHERE task_id = $1), amount) WHERE id = $1`,
      [req.params.id]
    );

    res.json({ success: true, count: inserted.length, rows: inserted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/tasks/:id/items/:itemId', authenticateToken, requireRole('admin', 'director', 'manager', 'logistics', 'to_engineer'), async (req, res) => {
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
      comment,
      article,
      supplier
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
        article           = CASE WHEN $15::boolean THEN $13 ELSE article END,
        supplier          = CASE WHEN $16::boolean THEN $14 ELSE supplier END,
        updated_at        = NOW()
      WHERE id = $17 AND task_id = $18
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
        article ? String(article).trim() : null,
        supplier ? String(supplier).trim() : null,
        article !== undefined,
        supplier !== undefined,
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

router.delete('/tasks/:id/items/:itemId', authenticateToken, requireRole('admin', 'director', 'manager'), async (req, res) => {
  try {
    await pool.query('DELETE FROM task_items WHERE id = $1 AND task_id = $2', [req.params.itemId, req.params.id]);
    // Авто-пересчет суммы в tasks
    await pool.query(
      `UPDATE tasks SET amount = COALESCE((SELECT SUM(amount_customer) FROM task_items WHERE task_id = $1), 0) WHERE id = $1`,
      [req.params.id]
    );
    const { rows: updatedRows } = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM remarks rm WHERE rm.task_id = t.id AND rm.resolved_at IS NULL)::integer AS open_remarks_count
      FROM tasks t WHERE t.id = $1
    `, [req.params.id]);

    const fullTask = updatedRows[0] ? rowToTask(updatedRows[0]) : null;
    res.json({ success: true, task: fullTask });
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
