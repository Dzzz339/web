import express from 'express';
import OpenAI from 'openai';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { buildContextForQuery } from '../services/aiFacade.js';

const router = express.Router();

// ─── ИИ-АССИСТЕНТ: провайдер ─────────────────────────────────────────────────
// По умолчанию — локальная модель через Ollama на хост-машине (host.docker.internal для Docker).
// env перекрывает при необходимости.
const AI_BASE_URL = process.env.AI_BASE_URL || 'http://host.docker.internal:11434/v1';
const AI_API_KEY  = process.env.AI_API_KEY  || 'ollama';
const AI_MODEL    = process.env.AI_MODEL    || 'qwen-cpu:latest';
const AI_DAILY_LIMIT = 50; // макс. сообщений (роль=user) в день на пользователя

let _aiClient = null;
function getAiClient() {
  if (!AI_BASE_URL) return null;
  if (!_aiClient) _aiClient = new OpenAI({ baseURL: AI_BASE_URL, apiKey: AI_API_KEY || 'ollama' });
  return _aiClient;
}

// GET /api/ai/health — проверка связи с Ollama и список моделей
router.get('/health', authenticateToken, async (req, res) => {
  const targetUrl = AI_BASE_URL;
  try {
    const client = getAiClient();
    const list = await client.models.list();
    const models = [];
    if (list && list.data) {
      for (const m of list.data) {
        models.push(m.id);
      }
    }
    return res.json({
      status: 'ok',
      baseUrl: targetUrl,
      currentModel: AI_MODEL,
      availableModels: models,
      cpuOnly: true
    });
  } catch (e) {
    // Если host.docker.internal не доступен (напр. локальный запуск вне Docker), пробуем localhost
    if (targetUrl.includes('host.docker.internal')) {
      try {
        const fallbackClient = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: AI_API_KEY });
        const list = await fallbackClient.models.list();
        const models = (list.data || []).map(m => m.id);
        _aiClient = fallbackClient; // переключаемся на рабочий fallback
        return res.json({
          status: 'ok',
          baseUrl: 'http://localhost:11434/v1',
          currentModel: AI_MODEL,
          availableModels: models,
          cpuOnly: true,
          fallback: true
        });
      } catch (_) {}
    }
    return res.json({
      status: 'error',
      baseUrl: targetUrl,
      currentModel: AI_MODEL,
      cpuOnly: true,
      error: e.message || String(e)
    });
  }
});

// SQL-запросы для режима "Аналитика"
async function runAnalyticsSql() {
  const queries = [
    { name: 'Общая статистика', sql: `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='done') AS done,
        COUNT(*) FILTER (WHERE status='progress') AS active,
        COUNT(*) FILTER (WHERE overdue_days > 0) AS overdue,
        SUM(amount) AS revenue
      FROM tasks WHERE archived = false` },
    { name: 'Топ-10 регионов по объёму', sql: `
      SELECT region, COUNT(*) AS cnt, SUM(amount) AS amount
      FROM tasks WHERE archived = false AND region IS NOT NULL
      GROUP BY region ORDER BY cnt DESC LIMIT 10` },
    { name: 'Топ-10 подрядчиков по задержкам', sql: `
      SELECT assignee, COUNT(*) AS total,
        COUNT(*) FILTER (WHERE overdue_days > 0) AS overdue_cnt,
        ROUND(AVG(overdue_days) FILTER (WHERE overdue_days > 0), 1) AS avg_delay_days
      FROM tasks WHERE archived = false AND assignee IS NOT NULL
      GROUP BY assignee HAVING COUNT(*) FILTER (WHERE overdue_days > 0) > 0
      ORDER BY overdue_cnt DESC LIMIT 10` },
    { name: 'Критические просрочки (топ-10)', sql: `
      SELECT id, assignee, region, address, deadline, overdue_days
      FROM tasks WHERE archived = false AND overdue_days > 0
      ORDER BY overdue_days DESC LIMIT 10` },
    { name: 'Статусы задач', sql: `
      SELECT status, COUNT(*) AS cnt FROM tasks WHERE archived = false GROUP BY status` },
    { name: 'Остатки материалов центрального склада (топ-10)', sql: `
      SELECT m.name, sb.quantity, sb.reserved_qty, m.unit
      FROM stock_balances sb
      JOIN materials m ON m.id = sb.material_id
      JOIN warehouses w ON w.id = sb.warehouse_id
      WHERE w.is_central = true
      ORDER BY sb.quantity DESC LIMIT 10` }
  ];
  const results = [];
  for (const q of queries) {
    try {
      const { rows } = await pool.query(q.sql);
      results.push({ section: q.name, rows });
    } catch (e) {
      results.push({ section: q.name, error: e.message });
    }
  }
  return results;
}

// SQL-запросы для прогноза снабжения
async function runForecastContextSql() {
  const queries = [
    { name: 'Ближайшие выходы на монтаж (15 объектов)', sql: `
      SELECT id, region, address, data_vyhoda, deadline, work_type
      FROM tasks
      WHERE archived = false AND (data_vyhoda IS NOT NULL OR deadline IS NOT NULL)
      ORDER BY COALESCE(data_vyhoda, deadline) ASC LIMIT 15` },
    { name: 'Спрос на материалы под запланированные задачи', sql: `
      SELECT m.name, SUM(tm.quantity) AS total_demand, m.unit
      FROM task_materials tm
      JOIN materials m ON m.id = tm.material_id
      JOIN tasks t ON t.id = tm.task_id
      WHERE t.archived = false AND t.status IN ('pending', 'progress')
      GROUP BY m.name, m.unit ORDER BY total_demand DESC LIMIT 15` },
    { name: 'Свободные складские остатки (Центральный склад)', sql: `
      SELECT m.name, sb.quantity, sb.reserved_qty, (sb.quantity - sb.reserved_qty) AS free_stock, m.unit
      FROM stock_balances sb
      JOIN materials m ON m.id = sb.material_id
      JOIN warehouses w ON w.id = sb.warehouse_id
      WHERE w.is_central = true AND (sb.quantity - sb.reserved_qty) > 0
      ORDER BY free_stock DESC LIMIT 15` },
    { name: 'Потенциальный дефицит материалов', sql: `
      SELECT
        m.name,
        COALESCE(dem.total_demand, 0) AS required,
        COALESCE(stk.free_stock, 0) AS free_stock,
        (COALESCE(dem.total_demand, 0) - COALESCE(stk.free_stock, 0)) AS shortage,
        m.unit
      FROM materials m
      JOIN (
        SELECT tm.material_id, SUM(tm.quantity) AS total_demand
        FROM task_materials tm
        JOIN tasks t ON t.id = tm.task_id
        WHERE t.archived = false AND t.status IN ('pending', 'progress')
        GROUP BY tm.material_id
      ) dem ON dem.material_id = m.id
      LEFT JOIN (
        SELECT sb.material_id, (sb.quantity - sb.reserved_qty) AS free_stock
        FROM stock_balances sb
        JOIN warehouses w ON w.id = sb.warehouse_id WHERE w.is_central = true
      ) stk ON stk.material_id = m.id
      WHERE (COALESCE(dem.total_demand, 0) - COALESCE(stk.free_stock, 0)) > 0
      ORDER BY shortage DESC LIMIT 10` },
    { name: 'Заказы поставщикам в пути', sql: `
      SELECT po.order_number, s.name AS supplier, po.expected_delivery_date,
        COUNT(poi.id) AS items_cnt, SUM(poi.quantity) AS total_units
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.status IN ('ordered', 'shipped')
      GROUP BY po.id, po.order_number, s.name, po.expected_delivery_date
      ORDER BY po.expected_delivery_date ASC LIMIT 10` },
    { name: 'Сроки поставки у поставщиков (Lead Time)', sql: `
      SELECT s.name AS supplier, s.lead_time_days, COUNT(DISTINCT poi.material_id) AS catalog_size
      FROM suppliers s
      LEFT JOIN purchase_orders po ON po.supplier_id = s.id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      GROUP BY s.id, s.name, s.lead_time_days ORDER BY s.lead_time_days ASC LIMIT 10` }
  ];
  const results = [];
  for (const q of queries) {
    try {
      const { rows } = await pool.query(q.sql);
      results.push({ section: q.name, rows });
    } catch (e) {
      results.push({ section: q.name, error: e.message });
    }
  }
  return results;
}

// Сборка универсального system-промпта для Стоки
function buildAiSystemPrompt(mode) {
  const RULES = `
ЖЁСТКИЕ ПРАВИЛА ВЫВОДА (обязательны):
1. НЕ рассуждай вслух и не выдавай внутренние размышления перед ответом. Пиши ТОЛЬКО итоговый ответ.
2. Отвечай максимально КРАТКО, четко и по существу (3-7 предложений, если не требуется подробная таблица или список).
3. Пиши ТОЛЬКО на русском. ЗАПРЕЩЕНО смешивать языки, использовать китайские/иероглифические символы или беспричинно вставлять английские слова. Не выдумывай несуществующие слова.
4. Не придумывай факты, цифры и названия. Опирайся строго на предоставленные данные из <context> и <card_context>. Все числа бери готовыми из контекста, не пересчитывай самостоятельно. Если данных нет — честно скажи об этом.
5. При упоминании конкретных заявок обязательно указывай их номер в квадратных скобках, например [#12345].
6. ЗАПРЕТ ОФФТОПА: Ты — исключительно корпоративный аналитик Stockeasy. Тебе категорически запрещено шутить, писать стихи, обсуждать фильмы или вести разговоры не по теме. На любые нерабочие запросы отвечай: "Я аналитический ассистент Stockeasy и консультирую только по рабочим вопросам: заявки, монтаж, ТМЦ и подрядчики."`;

  return `Ты — Стоки, единый универсальный интеллектуальный помощник и аналитик платформы Stockeasy для монтажных телеком-подрядчиков (ключевой заказчик — ПАО Сбербанк).
Твоё имя — Стоки. Ты объединяешь в себе все направления работы компании:

1. БИЗНЕС-ПРАВИЛА И АНАЛИТИКА ПО ЗАЯВКАМ (ДЛЯ РУКОВОДСТВА):
- «НЕВЫПОЛНЕННЫЕ ЗАЯВКИ»: для руководства невыполненными считаются задачи накопительно ДО получения статуса "готово" или "принято". Всегда давай ответ в ДВУХ СРЕЗАХ:
  • Вариант 1 (монтаж): фактически в работе у монтажников до сдачи монтажа.
  • Вариант 2 (финансы/документы): закрытие компанией, включая готовые монтажом, но не принятые или не оплаченные заказчиком.
- ЗЛОБОДНЕВНЫЕ ВОПРОСЫ РУКОВОДСТВА: при анализе региона или подрядчика всегда отдельно подсвечивай: неоплаты, наличие замечаний/штрафов и срывы сроков.
- ОЦЕНКА РАБОТЫ ПОДРЯДЧИКА:
  • Подрядчик отвечает за монтаж и предоставление исходных данных для ИД. Как только заявка перешла в "готово", "принято" или "оплачено" — подрядчик свою работу ВЫПОЛНИЛ.
  • Для компании заявка считается полностью завершенной только при получении статуса "оплачено".
  • Если у подрядчика заявка в статусе "готово", но оплаты нет — четко разделяй: "Подрядчик свою работу сдал, но заявка повисла у заказчика/на согласовании без оплаты".

2. СНАБЖЕНИЕ И ПРОГНОЗ:
- Опирайся на данные о ближайших датах выезда (data_vyhoda/deadline), спецификациях, складских остатках и закупках в пути из <context>. Предупреждай о дефицитах кабеля и пассивного оборудования под график выездов с учетом Lead Times поставщиков.

3. ТЕХНИЧЕСКАЯ ЭКСПЕРТИЗА И СТАНДАРТЫ:
- Эксперт по монтажу телеком-сетей, стандартам СКС/ЛВС, заземлению шкафов, прокладке фасадных и внутренних трасс, маркировке и сдаче объектов ПАО Сбербанк.

4. СМЕТНЫЙ РАСЧЕТ И МАТЕРИАЛЫ:
- Нормы: UTP Cat5e ~35м на АРМ, 40м на точку Wi-Fi, 30м на камеру, 60м на стойку; гофра 70% от кабеля; по 1 модулю RJ-45 и патч-корду на порт; патч-панели 24 порта.

5. АВТОМАТИЗАЦИЯ И ТИПОВЫЕ СЦЕНАРИИ (WORKFLOW):
- Ты глубоко знаешь встроенный конструктор автоматизации Stockeasy (кнопка «⚡ Автоматизация» и «🎛️ Полная автоматизация»).

6. ОПЕРАТИВНАЯ ПОМОЩЬ:
- Составление деловых писем кураторам, инструкций монтажникам, разбор замечаний по конкретным заявкам из <card_context>.

Держись делового, практичного и доброжелательного тона.` + RULES;
}

// Сборка промпта для расчёта материалов (parse_devices)
function buildParseDevicesPrompt(text) {
  return `Ты — эксперт по монтажу телекоммуникационных сетей и сметному расчету. Твоя задача: из текста заявки или сметы извлечь список оборудования и рассчитать точный перечень материалов.

НОРМЫ РАСХОДА МАТЕРИАЛОВ:
- Кабель UTP Cat5e: 35м на АРМ, 40м на WiFi/точку доступа, 30м на камеру, 25м на сенсор/датчик, 60м на серверную стойку (или фактический метраж из сметы)
- Гофра (гофрированная трубка) ф16-ф25: 70% от длины кабеля (округлять вверх до ближайших 10м)
- Модуль RG-45 кейстоун: по числу портов/АРМ (1 модуль = 1 порт)
- Патч-корд UTP Cat5e 2м: по числу портов (1 патч-корд = 1 порт)
- Патч-корд UTP Cat5e 1м: по числу портов для шкафа
- Табличка/наклейка идентификации: 1 шт на каждый АРМ/точку/объект
- Распределительная коробка/ящик: 1 шт на каждые 12 портов (округлять вверх)
- Кабель-канал/лоток: 1м на каждый метр прокладки кабеля (если указано)
- Патч-панель 19" 24 порта: 1 шт на каждые 24 порта

ФОРМАТ ОТВЕТА — ТОЛЬКО JSON, без каких-либо пояснений до или после:
{
  "parsed": { "название_устройства": количество },
  "materials": { "название_материала, ед. изм.": количество }
}

Примеры устройств: АРМ, WiFi, точка доступа, камера, серверная стойка, маршрутизатор, коммутатор, датчик, контроллер.
Примеры материалов: "Кабель UTP 5Е, м", "Гофра ф16..ф25, м", "Модуль RG45 кейстоун, шт", "Патч-корд 2м, шт", "Патч-корд 1м, шт", "Табличка, шт", "Распред. коробка, шт", "Кабель-канал 40х25, м".

Если в тексте нет информации об устройствах — верни { "parsed": {}, "materials": {} }.
Отвечай ТОЛЬКО валидным JSON. Без markdown-обёрток, без комментариев.`;
}

// POST /api/ai/chat — чат с ИИ-ассистентом (единый режим Стоки с поддержкой parse_devices)
router.post('/chat', authenticateToken, async (req, res) => {
  const { message, mode = 'general', cardContext } = req.body || {};
  const text = (message || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'Пустое сообщение' });

  // Дневной лимит сообщений
  const { rows: cntRows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM ai_messages
     WHERE user_id=$1 AND role='user' AND created_at::date = CURRENT_DATE`,
    [req.user.id]
  );
  if (Number(cntRows[0].cnt) >= AI_DAILY_LIMIT) {
    return res.status(429).json({ error: `Достигнут дневной лимит сообщений (${AI_DAILY_LIMIT})` });
  }

  const aiClient = getAiClient();
  if (!aiClient) {
    return res.status(500).json({ error: 'AI не настроен (проверьте AI_BASE_URL/AI_API_KEY)' });
  }

  // ─── parse_devices: LLM парсит текст → JSON с устройствами/материалами ─────
  if (mode === 'parse_devices') {
    const parseMessages = [
      { role: 'system', content: buildParseDevicesPrompt(text) },
      { role: 'user', content: text }
    ];
    try {
      const completion = await aiClient.chat.completions.create({
        model: AI_MODEL,
        messages: parseMessages,
        temperature: 0.1,
        stream: false,
        extra_body: {
          options: {
            num_gpu: 0
          }
        }
      });
      const raw = (completion.choices[0].message.content || '').trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.json({ success: false, error: 'Модель не вернула JSON: ' + raw.slice(0, 200) });
      const parsed = JSON.parse(jsonMatch[0]);
      // Сохраняем в историю
      await pool.query(
        `INSERT INTO ai_messages (user_id, mode, role, content) VALUES ($1,'parse_devices','user',$2)`,
        [req.user.id, text]
      );
      const asstIns = await pool.query(
        `INSERT INTO ai_messages (user_id, mode, role, content, tokens_used) VALUES ($1,'parse_devices','assistant',$2,$3) RETURNING id`,
        [req.user.id, JSON.stringify(parsed), completion.usage?.total_tokens || 0]
      );
      return res.json({
        success: true,
        messageId: asstIns.rows[0]?.id,
        reply: parsed.reply || parsed.comment || 'Рассчитан перечень материалов по нормам СКС на основе оборудования:',
        parsed: parsed.parsed || {},
        materials: parsed.materials || {}
      });
    } catch (e) {
      console.error('[AI Parse Error]:', e.message || e);
      let errMsg = e.message || 'Ошибка парсинга';
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('Connection error') || errMsg.includes('fetch failed')) {
        errMsg = `Не удалось подключиться к Ollama (${AI_BASE_URL}). Убедитесь, что Ollama запущена на сервере (порт 11434), разрешены внешние подключения (OLLAMA_HOST=0.0.0.0), и на сервере выполнен 'docker compose up -d'. Детали: ${errMsg}`;
      }
      return res.json({ success: false, error: errMsg });
    }
  }

  // Собираем точечный или сводный срез базы данных через безопасный фасад
  let context = '';
  if (req.user) {
    try {
      const isSupplyQuery = /(?:склад|тмц|материал|кабель|дефицит|поставк|остат)/i.test(text);
      const [facadeContext, forecastCtx] = await Promise.all([
        buildContextForQuery(text, req.user),
        isSupplyQuery ? runForecastContextSql() : Promise.resolve([])
      ]);
      const supplyText = (forecastCtx || []).map(a =>
        `=== ${a.section} ===\n${a.error ? '[данные недоступны]' : JSON.stringify(a.rows)}`
      ).join('\n');

      context = [facadeContext, supplyText].filter(Boolean).join('\n\n');
    } catch (e) {
      console.error('[AI Context Load Error]:', e.message);
    }
  }

  // Встроенный контекст заявки (если передан с фронтенда)
  let card = '';
  if (cardContext && typeof cardContext === 'string') {
    card = '\n<card_context>\n' + cardContext + '\n</card_context>';
  }

  // Скользящее окно истории (последние 4 сообщения) для связности диалога без переполнения контекста
  let recentHistory = [];
  try {
    const { rows: historyRows } = await pool.query(
      `SELECT role, content FROM ai_messages
       WHERE user_id = $1 AND mode = $2
       ORDER BY id DESC LIMIT 4`,
      [req.user.id, mode]
    );
    recentHistory = historyRows.reverse().map(r => ({
      role: r.role,
      content: (r.content || '').slice(0, 800)
    }));
  } catch (_) {}

  const messages = [
    { role: 'system', content: buildAiSystemPrompt(mode) },
    ...(context ? [{ role: 'system', content: '<context>\n' + context + '\n</context>' }] : []),
    ...(card ? [{ role: 'system', content: card }] : []),
    ...recentHistory,
    { role: 'user', content: text }
  ];

  // Контроллер отмены для остановки запроса при разрыве или явной остановке пользователем
  const abortController = new AbortController();
  let clientDisconnected = false;

  req.on('close', () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      abortController.abort();
    }
  });

  // Записываем сообщение пользователя сразу (чтобы лимит учёлся даже при обрыве)
  const userIns = await pool.query(
    `INSERT INTO ai_messages (user_id, mode, role, content) VALUES ($1,$2,'user',$3) RETURNING id`,
    [req.user.id, mode, text]
  );
  const userMsgId = userIns.rows[0].id;

  // Подготавливаем SSE-ответ
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();

  let fullReply = '';
  let tokensUsed = 0;

  try {
    const stream = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages,
      stream: true,
      temperature: 0.3,
      max_tokens: 700,
      extra_body: {
        options: {
          num_gpu: 0
        }
      }
    }, {
      signal: abortController.signal
    });

    for await (const chunk of stream) {
      if (clientDisconnected || abortController.signal.aborted) {
        break;
      }
      const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta
        ? (chunk.choices[0].delta.content || '')
        : '';
      if (delta) {
        fullReply += delta;
        res.write('data: ' + JSON.stringify({ delta }) + '\n\n');
      }
      if (chunk.usage && chunk.usage.total_tokens) {
        tokensUsed = chunk.usage.total_tokens;
      }
    }

    // Сохраняем ответ ассистента в базу данных
    const asstIns = await pool.query(
      `INSERT INTO ai_messages (user_id, mode, role, content, tokens_used)
       VALUES ($1,$2,'assistant',$3,$4) RETURNING id, created_at`,
      [req.user.id, mode, fullReply || '', tokensUsed]
    );
    const assistantMsgId = asstIns.rows[0]?.id;

    res.write('data: ' + JSON.stringify({ done: true, messageId: assistantMsgId }) + '\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    if (clientDisconnected || abortController.signal.aborted || e.name === 'AbortError') {
      console.log(`[AI Stream] Генерация остановлена пользователем (user_id: ${req.user.id})`);
      if (fullReply && fullReply.trim()) {
        try {
          await pool.query(
            `INSERT INTO ai_messages (user_id, mode, role, content, tokens_used)
             VALUES ($1,$2,'assistant',$3,$4)`,
            [req.user.id, mode, fullReply.trim() + ' [генерация остановлена]', tokensUsed]
          );
        } catch (_) {}
      } else {
        try {
          await pool.query('DELETE FROM ai_messages WHERE id=$1', [userMsgId]);
        } catch (_) {}
      }
      return;
    }

    console.error('[AI Stream Error]:', e.message || e);
    let errMsg = e.message || 'Ошибка генерации ответа';
    if (errMsg.includes('ECONNREFUSED') || errMsg.includes('Connection error') || errMsg.includes('fetch failed')) {
      errMsg = `Не удалось подключиться к Ollama (${AI_BASE_URL}). Убедитесь, что Ollama запущена на сервере (порт 11434), установлена системная переменная OLLAMA_HOST=0.0.0.0, и на сервере выполнен 'docker compose up -d'. Детали: ${errMsg}`;
    }
    try {
      res.write('data: ' + JSON.stringify({ error: errMsg }) + '\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (_) {}
    await pool.query('DELETE FROM ai_messages WHERE id=$1', [userMsgId]);
  }
});

// GET /api/ai/history — загрузка истории переписки с ИИ и оценок
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const { rows } = await pool.query(
      `SELECT id, mode, role, content, rating, rating_comment, tokens_used, created_at
       FROM ai_messages
       WHERE user_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [req.user.id, limit]
    );
    rows.reverse();
    return res.json({ success: true, messages: rows });
  } catch (e) {
    console.error('[AI History Error]:', e);
    return res.status(500).json({ error: 'Ошибка загрузки истории сообщений' });
  }
});

// POST /api/ai/messages/:id/rate — поставить отметку ответу ИИ (like / dislike / null)
router.post('/messages/:id/rate', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body || {};

  if (rating !== null && rating !== undefined && !['like', 'dislike'].includes(rating)) {
    return res.status(400).json({ error: 'Неверное значение оценки (ожидается: like, dislike или null)' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE ai_messages
       SET rating = $1, rating_comment = $2, updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING id, role, rating, rating_comment`,
      [rating || null, comment || null, id, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    return res.json({ success: true, message: rows[0] });
  } catch (e) {
    console.error('[AI Rate Error]:', e);
    return res.status(500).json({ error: 'Ошибка сохранения оценки' });
  }
});

// DELETE /api/ai/history — очистить историю диалога с ИИ
router.delete('/history', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM ai_messages WHERE user_id = $1', [req.user.id]);
    return res.json({ success: true });
  } catch (e) {
    console.error('[AI Clear History Error]:', e);
    return res.status(500).json({ error: 'Не удалось очистить историю' });
  }
});

export default router;

