import express from 'express';
import OpenAI from 'openai';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// ─── ИИ-АССИСТЕНТ: провайдер ─────────────────────────────────────────────────
// По умолчанию — локальная модель через Ollama на хост-машине (host.docker.internal для Docker).
// env перекрывает при необходимости.
const AI_BASE_URL = process.env.AI_BASE_URL || 'http://host.docker.internal:11434/v1';
const AI_API_KEY  = process.env.AI_API_KEY  || 'ollama';
const AI_MODEL    = process.env.AI_MODEL    || 'qwen2.5:14b';
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
    { name: 'По регионам (топ-10)', sql: `
      SELECT region, COUNT(*) AS cnt, SUM(amount) AS revenue,
        COUNT(*) FILTER (WHERE overdue_days > 0) AS overdue
      FROM tasks WHERE archived = false
      GROUP BY region ORDER BY cnt DESC LIMIT 10` },
    { name: 'По подрядчикам (топ-10)', sql: `
      SELECT contractor, COUNT(*) AS cnt, AVG(overdue_days) AS avg_overdue
      FROM tasks WHERE archived = false AND contractor IS NOT NULL
      GROUP BY contractor ORDER BY cnt DESC LIMIT 10` },
    { name: 'Просроченные (топ-10)', sql: `
      SELECT id, region, address, deadline, overdue_days, assignee
      FROM tasks WHERE overdue_days > 0 AND archived = false
      ORDER BY overdue_days DESC LIMIT 10` },
    { name: 'По статусам', sql: `
      SELECT status, COUNT(*) AS cnt, SUM(amount) AS revenue
      FROM tasks WHERE archived = false GROUP BY status` },
    { name: 'Остатки материалов на центральном складе', sql: `
      SELECT m.code, m.name, sb.quantity, sb.reserved_qty, (sb.quantity - sb.reserved_qty) AS free_qty, m.unit
      FROM stock_balances sb
      JOIN warehouses w ON sb.warehouse_id = w.id
      JOIN materials m ON sb.material_id = m.id
      WHERE w.type = 'central'
      ORDER BY sb.quantity DESC LIMIT 10` },
    { name: 'Материалы с дефицитом или ниже нормы', sql: `
      SELECT m.code, m.name, sb.quantity, m.min_stock_alert, m.unit
      FROM stock_balances sb
      JOIN warehouses w ON sb.warehouse_id = w.id
      JOIN materials m ON sb.material_id = m.id
      WHERE w.type = 'central' AND sb.quantity <= m.min_stock_alert
      LIMIT 10` }
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

// SQL-запросы для режима "Снабжение и прогноз"
async function runForecastContextSql() {
  const queries = [
    { name: 'Ближайшие проекты и даты выхода (монтаж)', sql: `
      SELECT t.id, t.region, t.address, t.data_vyhoda, t.deadline, t.in_order, t.contractor,
        COALESCE(json_agg(json_build_object('code', m.code, 'name', m.name, 'plan_qty', tm.plan_qty, 'fact_qty', tm.fact_qty)) FILTER (WHERE m.id IS NOT NULL), '[]') AS materials
      FROM tasks t
      LEFT JOIN task_materials tm ON tm.task_id = t.id AND tm.is_written_off = false
      LEFT JOIN materials m ON tm.material_id = m.id
      WHERE t.archived = false AND t.status IN ('progress', 'pending')
      GROUP BY t.id, t.region, t.address, t.data_vyhoda, t.deadline, t.in_order, t.contractor
      ORDER BY COALESCE(t.data_vyhoda, t.deadline, '2099-01-01') ASC LIMIT 10` },
    { name: 'Текущие свободные остатки (Центральный склад)', sql: `
      SELECT m.code, m.name, sb.quantity, sb.reserved_qty, (sb.quantity - sb.reserved_qty) AS free_stock, sb.in_transit_qty, m.unit, m.package_unit
      FROM stock_balances sb
      JOIN warehouses w ON sb.warehouse_id = w.id
      JOIN materials m ON sb.material_id = m.id
      WHERE w.type = 'central'
      ORDER BY m.name ASC LIMIT 15` },
    { name: 'Критический дефицит ТМЦ под активные заявки', sql: `
      SELECT m.code, m.name, m.unit, m.package_qty, m.package_unit,
        SUM(tm.plan_qty - tm.fact_qty) AS total_demand,
        COALESCE(sb_agg.free_qty, 0) AS free_stock
      FROM task_materials tm
      JOIN materials m ON tm.material_id = m.id
      JOIN tasks t ON tm.task_id = t.id AND t.archived = false AND t.status IN ('progress', 'pending')
      LEFT JOIN (
        SELECT material_id, SUM(quantity - reserved_qty) AS free_qty
        FROM stock_balances JOIN warehouses w ON stock_balances.warehouse_id = w.id
        WHERE w.type = 'central'
        GROUP BY material_id
      ) sb_agg ON sb_agg.material_id = m.id
      WHERE tm.is_written_off = false
      GROUP BY m.id, m.code, m.name, m.unit, m.package_qty, m.package_unit, sb_agg.free_qty
      HAVING SUM(tm.plan_qty - tm.fact_qty) > COALESCE(sb_agg.free_qty, 0)` },
    { name: 'Заказы поставщикам в пути', sql: `
      SELECT po.order_number, s.name AS supplier, po.expected_delivery_date, po.status,
        m.name AS material, poi.quantity, m.unit
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      JOIN materials m ON poi.material_id = m.id
      WHERE po.status IN ('ordered', 'in_transit')
      ORDER BY po.expected_delivery_date ASC LIMIT 10` },
    { name: 'Поставщики и сроки поставки (Lead Times)', sql: `
      SELECT name, lead_time_days, contact, phone FROM suppliers WHERE is_active = true` }
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
4. Не придумывай факты, цифры и названия. Опирайся строго на предоставленные данные из <context> и <card_context>. Если данных нет — честно скажи об этом.
5. Числа и факты называй точно по данным базы, без домыслов.`;

  return `Ты — Стоки, единый универсальный интеллектуальный помощник и аналитик платформы Stockeasy для монтажных телеком-подрядчиков (ключевой заказчик — ПАО Сбербанк).
Твоё имя — Стоки. Ты объединяешь в себе все направления работы компании:

1. АНАЛИТИКА И СТАТИСТИКА:
- Опирайся на живые данные из <context> (статистика по 6700+ заявкам, распределение по регионам, срывы дедлайнов подрядчиками, просроченные объекты, сумма договоров amount).

2. СНАБЖЕНИЕ И ПРОГНОЗ:
- Опирайся на данные о ближайших датах выезда (data_vyhoda/deadline), спецификациях, складских остатках и закупках в пути из <context>. Предупреждай о дефицитах кабеля и пассивного оборудования под график выездов с учетом Lead Times поставщиков.

3. ТЕХНИЧЕСКАЯ ЭКСПЕРТИЗА И СТАНДАРТЫ:
- Эксперт по монтажу телеком-сетей, стандартам СКС/ЛВС, заземлению шкафов, прокладке фасадных и внутренних трасс, маркировке и сдаче объектов ПАО Сбербанк.

4. СМЕТНЫЙ РАСЧЕТ И МАТЕРИАЛЫ:
- Нормы: UTP Cat5e ~35м на АРМ, 40м на точку Wi-Fi, 30м на камеру, 60м на стойку; гофра 70% от кабеля; по 1 модулю RJ-45 и патч-корду на порт; патч-панели 24 порта.

5. ОПЕРАТИВНАЯ ПОМОЩЬ:
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
      await pool.query(
        `INSERT INTO ai_messages (user_id, mode, role, content, tokens_used) VALUES ($1,'parse_devices','assistant',$2,$3)`,
        [req.user.id, JSON.stringify(parsed), completion.usage?.total_tokens || 0]
      );
      return res.json({
        success: true,
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

  // Собираем полный живой срез базы данных (аналитика + снабжение и прогноз) для администраторов
  let context = '';
  if (req.user && req.user.role === 'admin') {
    try {
      const [analytics, forecastCtx] = await Promise.all([
        runAnalyticsSql(),
        runForecastContextSql()
      ]);
      const allSections = [...(analytics || []), ...(forecastCtx || [])];
      context = allSections.map(a =>
        `=== ${a.section} ===\n${a.error ? '[ошибка: ' + a.error + ']' : JSON.stringify(a.rows)}`
      ).join('\n');
    } catch (e) {
      console.error('[AI Context Load Error]:', e.message);
    }
  }

  // Встроенный контекст заявки (если передан с фронтенда)
  let card = '';
  if (cardContext && typeof cardContext === 'string') {
    card = '\n<card_context>\n' + cardContext + '\n</card_context>';
  }

  const messages = [
    { role: 'system', content: buildAiSystemPrompt(mode) },
    ...(context ? [{ role: 'system', content: '<context>\n' + context + '\n</context>' }] : []),
    ...(card ? [{ role: 'system', content: card }] : []),
    { role: 'user', content: text }
  ];

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
      extra_body: {
        options: {
          num_gpu: 0
        }
      }
    });

    for await (const chunk of stream) {
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

    res.write('data: [DONE]\n\n');
    res.end();

    // Сохраняем ответ ассистента
    await pool.query(
      `INSERT INTO ai_messages (user_id, mode, role, content, tokens_used)
       VALUES ($1,$2,'assistant',$3,$4)`,
      [req.user.id, mode, fullReply || '', tokensUsed]
    );
  } catch (e) {
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

export default router;
