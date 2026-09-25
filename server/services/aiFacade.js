import { pool } from '../config/db.js';

// Кеш известных сущностей (регионы, подрядчики) для быстрого извлечения без постоянной нагрузки на базу
let _entityCache = {
  regions: [],
  contractors: [],
  lastUpdated: 0
};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут

/**
 * Загрузка и обновление списка известных регионов и подрядчиков
 */
async function refreshEntityCache() {
  const now = Date.now();
  if (now - _entityCache.lastUpdated < CACHE_TTL_MS && _entityCache.regions.length > 0) {
    return _entityCache;
  }
  try {
    const [regRes, contRes] = await Promise.all([
      pool.query(`
        SELECT DISTINCT region 
        FROM tasks 
        WHERE archived = false AND region IS NOT NULL AND TRIM(region) != ''
      `),
      pool.query(`
        SELECT DISTINCT name FROM (
          SELECT contractor AS name FROM tasks WHERE archived = false AND contractor IS NOT NULL AND TRIM(contractor) != ''
          UNION
          SELECT assignee AS name FROM tasks WHERE archived = false AND assignee IS NOT NULL AND TRIM(assignee) != ''
          UNION
          SELECT name_short AS name FROM contractors WHERE name_short IS NOT NULL AND TRIM(name_short) != ''
        ) c
      `)
    ]);

    _entityCache.regions = regRes.rows.map(r => r.region.trim());
    _entityCache.contractors = contRes.rows.map(r => r.name.trim());
    _entityCache.lastUpdated = now;
  } catch (err) {
    console.error('[AI Facade Cache Error]:', err.message);
  }
  return _entityCache;
}

/**
 * Получение основы (стемминга) для русского слова (простое нормализованное сопоставление)
 */
function getStem(word) {
  if (!word || word.length < 3) return '';
  const clean = word.toLowerCase().replace(/[^а-яa-z0-9]/g, '');
  if (clean.length <= 4) return clean;
  // Срезаем падежные окончания в русском языке
  return clean.replace(/(?:ому|ему|ого|его|ыми|ими|ами|ями|ов|ев|ей|ой|ей|ям|ам|ом|ем|ах|ях|ую|юю|ое|ее|ые|ие|ый|ий|ой|а|я|у|ю|е|о|ы|и)$/i, '');
}

/**
 * Извлечение ключевых сущностей из текста вопроса пользователя
 */
export async function extractEntities(queryText) {
  const text = (queryText || '').toLowerCase();
  const cache = await refreshEntityCache();

  let matchedRegion = null;
  let matchedContractor = null;
  let matchedTaskId = null;

  // 1. Поиск конкретного номера заявки (#123, № 123, заявка 123)
  const taskMatch = text.match(/(?:заявк[а-я]*|объект[а-я]*|номер[а-я]*|\#|№)\s*(\d{1,8})/i);
  if (taskMatch) {
    matchedTaskId = taskMatch[1];
  }

  // 2. Поиск региона
  for (const reg of cache.regions) {
    const regLower = reg.toLowerCase();
    // Прямое вхождение названия региона
    if (text.includes(regLower)) {
      matchedRegion = reg;
      break;
    }
    // Поиск по корням слов (например "архангельск" найдет "по архангельску")
    const words = regLower.split(/[\s,.-]+/);
    for (const w of words) {
      const stem = getStem(w);
      if (stem.length >= 4) {
        const regex = new RegExp(`\\b${stem}[а-я]*\\b`, 'i');
        if (regex.test(text)) {
          matchedRegion = reg;
          break;
        }
      }
    }
    if (matchedRegion) break;
  }

  // 3. Поиск подрядчика / исполнителя
  for (const cont of cache.contractors) {
    const contLower = cont.toLowerCase();
    if (contLower.length >= 3 && text.includes(contLower)) {
      matchedContractor = cont;
      break;
    }
    const words = contLower.split(/[\s,.-]+/);
    for (const w of words) {
      const stem = getStem(w);
      if (stem.length >= 4) {
        const regex = new RegExp(`\\b${stem}[а-я]*\\b`, 'i');
        if (regex.test(text)) {
          matchedContractor = cont;
          break;
        }
      }
    }
    if (matchedContractor) break;
  }

  // Определение тематических акцентов вопроса
  const isUnfinished = /(невыполнен|не\s*сделан|не\s*закрыт|в\s*работе|осталось|сколько\s*висит|сколько\s*не)/i.test(text);
  const isPayment = /(оплат|неоплат|деньг|долг|счет|расчет|сумму|штраф|выплат)/i.test(text);
  const isRemarks = /(замечани|претензи|брак|ошибк|штраф|недочет)/i.test(text);

  return {
    region: matchedRegion,
    contractor: matchedContractor,
    taskId: matchedTaskId,
    isUnfinished,
    isPayment,
    isRemarks
  };
}

/**
 * Безопасный расчет аналитики по региону (все суммы и счетчики вычисляются в PostgreSQL)
 */
export async function getRegionSummary(regionName) {
  try {
    const pattern = `%${regionName}%`;
    const aggSql = `
      SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(amount), 0) AS total_amount,

        -- 1. Физический монтаж
        COUNT(*) FILTER (
          WHERE status = 'done' 
          OR LOWER(COALESCE(priemka, '')) IN ('готово', 'принято')
        ) AS physical_done_count,
        COUNT(*) FILTER (
          WHERE status != 'done' 
          AND LOWER(COALESCE(priemka, '')) NOT IN ('готово', 'принято')
        ) AS physical_pending_count,
        COALESCE(SUM(amount) FILTER (
          WHERE status != 'done' 
          AND LOWER(COALESCE(priemka, '')) NOT IN ('готово', 'принято')
        ), 0) AS physical_pending_amount,

        -- 2. Финансовое закрытие (Оплата)
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(oplata, '')) LIKE '%оплачен%'
        ) AS paid_count,
        COALESCE(SUM(amount) FILTER (
          WHERE LOWER(COALESCE(oplata, '')) LIKE '%оплачен%'
        ), 0) AS paid_amount,

        -- 3. Зависшие: монтаж готов, но оплата заказчиком НЕ произведена
        COUNT(*) FILTER (
          (status = 'done' OR LOWER(COALESCE(priemka, '')) IN ('готово', 'принято'))
          AND (oplata IS NULL OR LOWER(COALESCE(oplata, '')) NOT LIKE '%оплачен%')
        ) AS hung_unpaid_count,
        COALESCE(SUM(amount) FILTER (
          (status = 'done' OR LOWER(COALESCE(priemka, '')) IN ('готово', 'принято'))
          AND (oplata IS NULL OR LOWER(COALESCE(oplata, '')) NOT LIKE '%оплачен%')
        ), 0) AS hung_unpaid_amount,

        -- 4. Замечания, штрафы и просрочки
        COUNT(*) FILTER (WHERE overdue_days > 0) AS overdue_count,
        COUNT(*) FILTER (
          WHERE (comment IS NOT NULL AND TRIM(comment) != '') 
          OR (excel_comment IS NOT NULL AND TRIM(excel_comment) != '')
        ) AS remarks_count
      FROM tasks
      WHERE archived = false AND region ILIKE $1
    `;

    const { rows: aggRows } = await pool.query(aggSql, [pattern]);
    const agg = aggRows[0] || {};

    // Выборка конкретных заявок по региону (с приоритетом проблемных и зависших)
    const tasksSql = `
      SELECT 
        id, address, status, priemka, oplata, id_status, amount, overdue_days, 
        assignee, contractor, comment, excel_comment
      FROM tasks
      WHERE archived = false AND region ILIKE $1
      ORDER BY 
        CASE 
          WHEN (status = 'done' OR LOWER(COALESCE(priemka, '')) IN ('готово', 'принято')) 
               AND (oplata IS NULL OR LOWER(COALESCE(oplata, '')) NOT LIKE '%оплачен%') THEN 1
          WHEN overdue_days > 0 THEN 2
          WHEN status != 'done' THEN 3
          ELSE 4 
        END,
        id DESC
      LIMIT 12
    `;
    const { rows: sampleTasks } = await pool.query(tasksSql, [pattern]);

    // Открытые замечания из таблицы remarks для объектов этого региона
    const remarksSql = `
      SELECT r.task_id, r.body, r.created_name, r.created_at
      FROM remarks r
      JOIN tasks t ON t.id = r.task_id
      WHERE t.archived = false AND t.region ILIKE $1 AND r.resolved_at IS NULL
      ORDER BY r.created_at DESC
      LIMIT 5
    `;
    let openRemarks = [];
    try {
      const { rows: remRows } = await pool.query(remarksSql, [pattern]);
      openRemarks = remRows;
    } catch (_) {}

    return {
      regionName,
      agg,
      sampleTasks,
      openRemarks
    };
  } catch (err) {
    console.error(`[AI Facade Error getRegionSummary(${regionName})]:`, err.message);
    return { error: 'Данные по региону временно недоступны' };
  }
}

/**
 * Безопасный расчет аналитики по подрядчику / исполнителю
 */
export async function getContractorSummary(contractorName) {
  try {
    const pattern = `%${contractorName}%`;
    const aggSql = `
      SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(amount), 0) AS total_amount,

        -- 1. Выполнено подрядчиком (подрядчик сдал монтаж и данные для ИД)
        COUNT(*) FILTER (
          status = 'done' 
          OR LOWER(COALESCE(priemka, '')) IN ('готово', 'принято')
          OR LOWER(COALESCE(oplata, '')) LIKE '%оплачен%'
        ) AS contractor_done_count,

        -- 2. В процессе у подрядчика (до сдачи монтажа)
        COUNT(*) FILTER (
          status != 'done' 
          AND LOWER(COALESCE(priemka, '')) NOT IN ('готово', 'принято')
          AND LOWER(COALESCE(oplata, '')) NOT LIKE '%оплачен%'
        ) AS contractor_in_work_count,
        COALESCE(SUM(amount) FILTER (
          status != 'done' 
          AND LOWER(COALESCE(priemka, '')) NOT IN ('готово', 'принято')
          AND LOWER(COALESCE(oplata, '')) NOT LIKE '%оплачен%'
        ), 0) AS contractor_in_work_amount,

        -- 3. Закрыто компанией (оплачено)
        COUNT(*) FILTER (
          LOWER(COALESCE(oplata, '')) LIKE '%оплачен%'
        ) AS firm_paid_count,
        COALESCE(SUM(amount) FILTER (
          LOWER(COALESCE(oplata, '')) LIKE '%оплачен%'
        ), 0) AS firm_paid_amount,

        -- 4. Зависло без оплаты (подрядчик сдал монтаж, но компания не получила оплату/согласование)
        COUNT(*) FILTER (
          (status = 'done' OR LOWER(COALESCE(priemka, '')) IN ('готово', 'принято'))
          AND (oplata IS NULL OR LOWER(COALESCE(oplata, '')) NOT LIKE '%оплачен%')
        ) AS hung_unpaid_count,
        COALESCE(SUM(amount) FILTER (
          (status = 'done' OR LOWER(COALESCE(priemka, '')) IN ('готово', 'принято'))
          AND (oplata IS NULL OR LOWER(COALESCE(oplata, '')) NOT LIKE '%оплачен%')
        ), 0) AS hung_unpaid_amount,

        -- 5. Просрочки и замечания
        COUNT(*) FILTER (WHERE overdue_days > 0) AS overdue_count,
        COUNT(*) FILTER (
          WHERE (comment IS NOT NULL AND TRIM(comment) != '') 
          OR (excel_comment IS NOT NULL AND TRIM(excel_comment) != '')
        ) AS remarks_count
      FROM tasks
      WHERE archived = false AND (contractor ILIKE $1 OR assignee ILIKE $1)
    `;

    const { rows: aggRows } = await pool.query(aggSql, [pattern]);
    const agg = aggRows[0] || {};

    // Выборка всех или большинства заявок этого подрядчика
    const tasksSql = `
      SELECT 
        id, region, address, status, priemka, oplata, id_status, amount, overdue_days, 
        comment, excel_comment
      FROM tasks
      WHERE archived = false AND (contractor ILIKE $1 OR assignee ILIKE $1)
      ORDER BY 
        CASE 
          WHEN (status = 'done' OR LOWER(COALESCE(priemka, '')) IN ('готово', 'принято')) 
               AND (oplata IS NULL OR LOWER(COALESCE(oplata, '')) NOT LIKE '%оплачен%') THEN 1
          WHEN overdue_days > 0 THEN 2
          ELSE 3 
        END,
        id DESC
      LIMIT 15
    `;
    const { rows: sampleTasks } = await pool.query(tasksSql, [pattern]);

    return {
      contractorName,
      agg,
      sampleTasks
    };
  } catch (err) {
    console.error(`[AI Facade Error getContractorSummary(${contractorName})]:`, err.message);
    return { error: 'Данные по подрядчику временно недоступны' };
  }
}

/**
 * Получение информации по конкретной заявке (по номеру ID)
 */
export async function getTaskDetail(taskId) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tasks WHERE id = $1 AND archived = false LIMIT 1`,
      [String(taskId)]
    );
    if (!rows.length) return null;
    return rows[0];
  } catch (err) {
    console.error(`[AI Facade Error getTaskDetail(${taskId})]:`, err.message);
    return null;
  }
}

/**
 * Общая аналитическая сводка (если конкретный регион или подрядчик не запрошены)
 */
export async function getGlobalSummary() {
  try {
    const [generalStats, regionsBreakdown, overdueContractors] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status='done') AS done,
          COUNT(*) FILTER (WHERE status='progress') AS active,
          COUNT(*) FILTER (WHERE overdue_days > 0) AS overdue,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(oplata, '')) LIKE '%оплачен%') AS paid_cnt,
          COALESCE(SUM(amount), 0) AS total_revenue,
          COALESCE(SUM(amount) FILTER (WHERE LOWER(COALESCE(oplata, '')) LIKE '%оплачен%'), 0) AS paid_revenue
        FROM tasks WHERE archived = false
      `),
      pool.query(`
        SELECT 
          region, 
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status != 'done' AND LOWER(COALESCE(priemka, '')) NOT IN ('готово', 'принято')) AS pending_cnt,
          COUNT(*) FILTER (WHERE (status = 'done' OR LOWER(COALESCE(priemka, '')) IN ('готово', 'принято')) AND (oplata IS NULL OR LOWER(COALESCE(oplata, '')) NOT LIKE '%оплачен%')) AS hung_cnt,
          COALESCE(SUM(amount), 0) AS amount
        FROM tasks 
        WHERE archived = false AND region IS NOT NULL AND TRIM(region) != ''
        GROUP BY region 
        ORDER BY total DESC 
        LIMIT 25
      `),
      pool.query(`
        SELECT 
          COALESCE(contractor, assignee) AS name, 
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE overdue_days > 0) AS overdue_cnt,
          ROUND(AVG(overdue_days) FILTER (WHERE overdue_days > 0), 1) AS avg_delay_days
        FROM tasks 
        WHERE archived = false AND (contractor IS NOT NULL OR assignee IS NOT NULL)
        GROUP BY COALESCE(contractor, assignee)
        HAVING COUNT(*) FILTER (WHERE overdue_days > 0) > 0
        ORDER BY overdue_cnt DESC 
        LIMIT 10
      `)
    ]);

    return {
      general: generalStats.rows[0] || {},
      regions: regionsBreakdown.rows || [],
      overdueContractors: overdueContractors.rows || []
    };
  } catch (err) {
    console.error('[AI Facade Error getGlobalSummary]:', err.message);
    return { error: 'Сводные данные временно недоступны' };
  }
}

/**
 * Формирование итогового текстового контекста для подачи в LLM
 */
export async function buildContextForQuery(queryText, user) {
  if (!user || user.role !== 'admin') {
    return '';
  }

  const entities = await extractEntities(queryText);
  const contextParts = [];

  // 1. Если запрошена конкретная заявка по номеру (#12345)
  if (entities.taskId) {
    const task = await getTaskDetail(entities.taskId);
    if (task) {
      contextParts.push(`=== КАРТОЧКА ЗАЯВКИ #${task.id} ===
Адрес: ${task.region || ''}, ${task.address || ''}
Статус: ${task.status || 'progress'}, Этап: ${task.stage || '—'}
Приемка: ${task.priemka || 'не сдано'}, Оплата: ${task.oplata || 'не оплачено'}
Статус ИД: ${task.id_status || '—'}
Сумма: ${Number(task.amount || 0).toLocaleString('ru-RU')} руб.
Подрядчик: ${task.contractor || task.assignee || '—'}
Срок (дедлайн): ${task.deadline || '—'}, Просрочка: ${task.overdue_days || 0} дн.
Замечания/комментарий: ${task.comment || task.excel_comment || 'нет'}`);
    }
  }

  // 2. Если в вопросе упомянут конкретный регион
  if (entities.region) {
    const regData = await getRegionSummary(entities.region);
    if (regData.error) {
      contextParts.push(`=== СРЕЗ ПО РЕГИОНУ: ${entities.region} ===\n[${regData.error}]`);
    } else {
      const a = regData.agg;
      const totalAmount = Number(a.total_amount || 0).toLocaleString('ru-RU');
      const physPendingAmt = Number(a.physical_pending_amount || 0).toLocaleString('ru-RU');
      const paidAmt = Number(a.paid_amount || 0).toLocaleString('ru-RU');
      const hungAmt = Number(a.hung_unpaid_amount || 0).toLocaleString('ru-RU');

      let text = `=== ДЕТАЛЬНЫЙ АНАЛИТИЧЕСКИЙ СРЕЗ ПО РЕГИОНУ: ${regData.regionName} ===
Всего заявок в регионе: ${a.total_count} на общую сумму ${totalAmount} руб.

[Вариант 1: Физическое выполнение монтажа подрядчиками]
• Выполнено монтажом (статус "готово" / "принято"): ${a.physical_done_count} заявок
• Накопительно НЕ выполнено монтажом (в работе/обследовании): ${a.physical_pending_count} заявок на сумму ${physPendingAmt} руб.

[Вариант 2: Финансовое и документальное закрытие компанией]
• Полностью закрыто и оплачено фирме: ${a.paid_count} заявок на сумму ${paidAmt} руб.
• Зависли без оплаты (монтаж выполнен, но оплата не получена): ${a.hung_unpaid_count} заявок на сумму ${hungAmt} руб.

[Злободневные маркеры руководства]
• Заявок с просрочкой дедлайна: ${a.overdue_count}
• Заявок с замечаниями/претензиями: ${a.remarks_count}

[Конкретные заявки региона (для ссылок в ответе)]:`;

      if (regData.sampleTasks && regData.sampleTasks.length) {
        regData.sampleTasks.forEach(t => {
          const isPaid = (t.oplata || '').toLowerCase().includes('оплачен');
          const isDone = (t.status === 'done') || ['готово', 'принято'].includes((t.priemka || '').toLowerCase());
          const remark = t.comment || t.excel_comment || '';
          text += `\n• Заявка #${t.id}: ${t.address || '—'} | Монтаж: ${isDone ? 'готов' : 'в работе'} | Оплата: ${isPaid ? 'оплачено' : 'НЕ ОПЛАЧЕНО'} | Сумма: ${Number(t.amount || 0).toLocaleString('ru-RU')} руб. | Просрочка: ${t.overdue_days || 0} дн.${remark ? ' | Замечание: ' + remark : ''}`;
        });
      }

      if (regData.openRemarks && regData.openRemarks.length) {
        text += `\n[Открытые замечания инспекторов]:\n` + 
          regData.openRemarks.map(r => `• К заявке #${r.task_id} от ${r.created_name}: ${r.body}`).join('\n');
      }

      contextParts.push(text);
    }
  }

  // 3. Если в вопросе упомянут конкретный подрядчик
  if (entities.contractor) {
    const contData = await getContractorSummary(entities.contractor);
    if (contData.error) {
      contextParts.push(`=== СРЕЗ ПО ПОДРЯДЧИКУ: ${entities.contractor} ===\n[${contData.error}]`);
    } else {
      const a = contData.agg;
      const totalAmt = Number(a.total_amount || 0).toLocaleString('ru-RU');
      const paidAmt = Number(a.firm_paid_amount || 0).toLocaleString('ru-RU');
      const hungAmt = Number(a.hung_unpaid_amount || 0).toLocaleString('ru-RU');

      let text = `=== ДЕТАЛЬНЫЙ АНАЛИТИЧЕСКИЙ СРЕЗ ПО ПОДРЯДЧИКУ: ${contData.contractorName} ===
Всего числится на подрядчике: ${a.total_count} заявок на сумму ${totalAmt} руб.

[Выполнение подрядчиком (отвечает за монтаж и сдачу исходных данных ИД)]
• Подрядчик свою работу ВЫПОЛНИЛ: ${a.contractor_done_count} из ${a.total_count} заявок (статусы "готово", "принято", "оплачено")
• В процессе монтажа у подрядчика: ${a.contractor_in_work_count} заявок

[Закрытие компанией (финансовое получение оплаты от заказчика)]
• Компанией закрыто и оплачено: ${a.firm_paid_count} заявок на сумму ${paidAmt} руб.
• Зависли без оплаты (подрядчик сдал, но оплата заказчика не получена): ${a.hung_unpaid_count} заявок на сумму ${hungAmt} руб.
• Заявок с просрочкой: ${a.overdue_count}

[Список заявок подрядчика]:`;

      if (contData.sampleTasks && contData.sampleTasks.length) {
        contData.sampleTasks.forEach(t => {
          const isPaid = (t.oplata || '').toLowerCase().includes('оплачен');
          const isDone = (t.status === 'done') || ['готово', 'принято'].includes((t.priemka || '').toLowerCase());
          const remark = t.comment || t.excel_comment || '';
          text += `\n• Заявка #${t.id} [${t.region || ''}]: ${t.address || '—'} | Монтаж: ${isDone ? 'готово (подрядчик сдал)' : 'в работе'} | Оплата компании: ${isPaid ? 'оплачена' : 'НЕ ОПЛАЧЕНА (повисла)'} | Сумма: ${Number(t.amount || 0).toLocaleString('ru-RU')} руб.${remark ? ' | Замечание: ' + remark : ''}`;
        });
      }

      contextParts.push(text);
    }
  }

  // 4. Если конкретные сущности не найдены или вопрос общий — добавляем общую сводку
  if (!entities.region && !entities.contractor && !entities.taskId) {
    const globalData = await getGlobalSummary();
    if (!globalData.error) {
      const g = globalData.general;
      const totalRev = Number(g.total_revenue || 0).toLocaleString('ru-RU');
      const paidRev = Number(g.paid_revenue || 0).toLocaleString('ru-RU');

      let text = `=== ОБЩАЯ СВОДКА ПО ПЛАТФОРМЕ ===
Всего заявок в системе: ${g.total} на общую сумму ${totalRev} руб.
Выполнено монтажом: ${g.done}, в работе: ${g.active}, просрочено: ${g.overdue}
Оплачено: ${g.paid_cnt} заявок на сумму ${paidRev} руб.

[Сводка по регионам (заявки, невыполненные, зависшие без оплаты)]:`;

      if (globalData.regions && globalData.regions.length) {
        globalData.regions.slice(0, 15).forEach(r => {
          text += `\n• ${r.region}: всего ${r.total} (в монтаже: ${r.pending_cnt}, зависли без оплаты: ${r.hung_cnt}, сумма: ${Number(r.amount || 0).toLocaleString('ru-RU')} руб.)`;
        });
      }

      if (globalData.overdueContractors && globalData.overdueContractors.length) {
        text += `\n[Подрядчики с наибольшими просрочками]:\n` +
          globalData.overdueContractors.map(c => `• ${c.name}: ${c.overdue_cnt} просрочек из ${c.total} (средняя задержка: ${c.avg_delay_days} дн.)`).join('\n');
      }

      contextParts.push(text);
    }
  }

  return contextParts.join('\n\n');
}
