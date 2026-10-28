import '../config/loadEnv.js';
import express from 'express';
import OpenAI from 'openai';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { buildContextForQuery } from '../services/aiFacade.js';
import { generateAndRunSqlContext } from '../services/aiSqlService.js';

const router = express.Router();

// ─── ИИ-АССИСТЕНТ: провайдер DeepSeek Cloud API / OpenAI-совместимый шлюз ────
function getAiConfig() {
  const url = (process.env.AI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const key = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const model = process.env.AI_MODEL || 'deepseek-flash';
  return { url, key, model };
}

const AI_DAILY_LIMIT = 100; // макс. сообщений в день на пользователя

let _aiClient = null;
let _cachedKey = null;
let _cachedUrl = null;

function getAiClient() {
  const { url, key } = getAiConfig();
  if (!url) return null;
  if (!_aiClient || _cachedKey !== key || _cachedUrl !== url) {
    _cachedKey = key;
    _cachedUrl = url;
    _aiClient = new OpenAI({
      baseURL: url,
      apiKey: key || 'sk-placeholder'
    });
  }
  return _aiClient;
}

// GET /api/ai/health — проверка связи с DeepSeek API и статус ключа
router.get('/health', authenticateToken, async (req, res) => {
  const { url: targetUrl, key, model } = getAiConfig();
  const isDeepSeek = targetUrl.includes('deepseek.com');
  const hasKey = Boolean(key && key !== 'ollama' && key !== 'sk-placeholder');

  try {
    const client = getAiClient();
    let models = [];
    if (hasKey && client) {
      const list = await client.models.list().catch(() => null);
      if (list && list.data) models = list.data.map(m => m.id);
    }
    return res.json({
      status: 'ok',
      provider: isDeepSeek ? 'DeepSeek Cloud' : 'OpenAI-compatible',
      baseUrl: targetUrl,
      currentModel: model,
      hasKey,
      availableModels: models.length ? models : [model, 'deepseek-flash', 'deepseek-reasoner'],
      cpuOnly: false
    });
  } catch (e) {
    return res.json({
      status: hasKey ? 'error' : 'ok',
      provider: isDeepSeek ? 'DeepSeek Cloud' : 'OpenAI Gateway',
      baseUrl: targetUrl,
      currentModel: model,
      hasKey,
      error: e.message || String(e)
    });
  }
});

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

// Получение сводки свободных остатков Центрального склада для расчета по плану БТИ
async function getCentralWarehouseStockSummary() {
  try {
    const { rows } = await pool.query(`
      SELECT m.name, sb.quantity, sb.reserved_qty, (sb.quantity - sb.reserved_qty) AS free_stock, m.unit
      FROM stock_balances sb
      JOIN materials m ON m.id = sb.material_id
      JOIN warehouses w ON w.id = sb.warehouse_id
      WHERE w.is_central = true AND (sb.quantity > 0 OR sb.reserved_qty > 0)
      ORDER BY free_stock DESC
      LIMIT 30
    `);
    if (!rows.length) return 'На Центральном складе свободные остатки не заведены или равны 0.';
    return rows.map(r => `• ${r.name}: физически ${r.quantity} ${r.unit}, бронь ${r.reserved_qty} ${r.unit}, СВОБОДНО ${r.free_stock} ${r.unit}`).join('\n');
  } catch (err) {
    return 'Данные склада недоступны: ' + err.message;
  }
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
6. ЗАПРЕТ ОФФТОПА: Ты — исключительно корпоративный аналитик Stockeasy. Тебе категорически запрещено шутить, писать стихи, обсуждать фильмы или вести разговоры не по теме. На любые нерабочие запросы отвечай: "Я аналитический ассистент Stockeasy и консультирую только по рабочим вопросам: заявки, монтаж, ТМЦ и подрядчики."
7. ПРИВЕТСТВИЯ: Если сообщение пользователя — простое приветствие («привет», «здравствуйте» и т.п.) — кратко и вежливо поздоровайся и спроси, чем можешь помочь по объектам, заявкам или материалам Stockeasy. Категорически НЕ упоминай и не продолжай старые темы из предыдущих сообщений, если пользователь сам о них не спросил.`;

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

// Сборка промпта для фотоконтроля приёмки монтажа (Vision QC)
function buildQcPrompt() {
  return `Ты — строгий ведущий эксперт технадзора СКС и телеком-монтажа (стандарты ПАО Сбербанк, ГОСТ Р 53246-2008).
Твоя задача — детально проанализировать фотографию узла монтажа (серверная стойка, шкаф, патч-панель, розетка, кабель-канал, ввод кабеля, бирки маркировки) и выдать структурированный акт приёмки.

ОБЯЗАТЕЛЬНЫЙ ЧЕК-ЛИСТ ПРОВЕРКИ:
1. 🏷️ Маркировка: наличие читаемых стандартных бирок/наклеек (например, «ССМ 1.1», порт/АРМ). Читается ли текст?
2. 📏 Прокладка и гофра: отсутствие провисаний, натяг без изломов, соблюдение радиусов изгиба.
3. 🪢 Стяжки и бандаж: ровный шаг фиксации стяжками/липучками, кабель не пережат.
4. 🔒 Крышки и фурнитура: закрыты ли крышки коробов, установлены ли заглушки и лицевые панели.
5. ⚡ Заземление и эстетика: наличие шины заземления шкафа (если виден шкаф), чистота узла, отсутствие строительного мусора.

ФОРМАТ ВЫВОДА:
- В первой строке выдели крупно итоговый вердикт:
  • «✅ ПРИНЯТО БЕЗ ЗАМЕЧАНИЙ» (если критических дефектов нет)
  • «⚠️ ТРЕБУЕТСЯ УСТРАНЕНИЕ ЗАМЕЧАНИЙ» (если обнаружены нарушения)
- Краткое описание узла: что изображено на фото.
- Чек-лист проверки с отметками:
  ✅ Пункт пройден — описание
  ❌ Пункт нарушен — конкретный дефект на фото
- Чёткие указания монтажнику: что именно исправить перед повторной сдачей.
Отвечай профессионально, кратко и по делу на русском языке.`;
}

// Сборка промпта для расчета по плану БТИ / фото помещения (Vision BTI / Planning)
function buildBtiPrompt(stockSummary) {
  return `Ты — главный инженер-проектировщик систем видеонаблюдения (СВН), СКУД и телекоммуникаций.
Твоя задача: проанализировать план этажа/БТИ или фото помещения, определить зоны обзора и составить проектную спецификацию оборудования и расходных материалов.

ИНСТРУКЦИЯ ПО АНАЛИЗУ:
1. Определи тип помещения и ключевые зоны:
   - Входная группа / тамбур: узкоугольная камера 4 мм или 6 мм (идентификация лиц).
   - Кассовая зона / зона расчётов: камера 4 мм (контроль купюр и рук).
   - Общий зал / коридор: широкоугольные купольные камеры 2.8 мм (общий обзор).
   - Улица / фасад: цилиндрическая влагозащищенная камера IP67.
2. Рассчитай сопутствующие материалы:
   - Кабель UTP Cat5e: средняя трасса ~35-40 м на каждую камеру + 10% запас.
   - Гофрированная трубка ф20: 70% от длины кабеля.
   - Разъёмы RJ-45 / кронштейны / распаячные коробки: по 1 комплекту на камеру.
3. СВЕРКА СО СКЛАДСКИМИ ОСТАТКАМИ (данные Центрального склада):
${stockSummary}

ФОРМАТ ВЫВОДА:
1. Экспликация зон и предложенные точки установки камер (с фокусом 2.8 мм / 4 мм).
2. Таблица необходимого оборудования и ТМЦ.
3. Блок сверки со складом:
   • 🟢 В наличии на складе (материал, количество, свободно)
   • 🔴 Дефицит / Требуется закупка (чего не хватает и сколько нужно дозаказать).
4. Рекомендации по монтажу и углам обзора.`;
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

// POST /api/ai/chat — единый чат со Стоки с поддержкой текста, Vision (фото) и расчётов
router.post('/chat', authenticateToken, async (req, res) => {
  const { url: targetUrl, key, model: currentModel } = getAiConfig();
  const { message, mode = 'general', cardContext, image, scenario } = req.body || {};
  const text = (message || '').toString().trim();
  if (!text && !image) return res.status(400).json({ error: 'Пустое сообщение' });

  // Дневной лимит сообщений
  const { rows: cntRows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM ai_messages
     WHERE user_id=$1 AND role='user' AND created_at::date = CURRENT_DATE`,
    [req.user.id]
  );
  if (Number(cntRows[0].cnt) >= AI_DAILY_LIMIT) {
    return res.status(429).json({ error: `Достигнут дневной лимит сообщений (${AI_DAILY_LIMIT})` });
  }

  // Проверка настройки API ключа
  if (!key || key === 'sk-placeholder') {
    return res.status(400).json({
      error: 'API-ключ DeepSeek не задан. Укажите ваш ключ в файле .env (параметр AI_API_KEY=sk-...) и перезапустите сервер.'
    });
  }

  const aiClient = getAiClient();
  if (!aiClient) {
    return res.status(500).json({ error: 'AI-клиент не инициализирован. Проверьте AI_BASE_URL в файле .env' });
  }

  // ─── parse_devices: LLM парсит текст → JSON с устройствами/материалами ─────
  if (mode === 'parse_devices') {
    const parseMessages = [
      { role: 'system', content: buildParseDevicesPrompt(text) },
      { role: 'user', content: text }
    ];
    try {
      const completion = await aiClient.chat.completions.create({
        model: currentModel,
        messages: parseMessages,
        temperature: 0.1,
        stream: false
      });
      const raw = (completion.choices[0].message.content || '').trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.json({ success: false, error: 'Модель не вернула JSON: ' + raw.slice(0, 200) });
      const parsed = JSON.parse(jsonMatch[0]);

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
      return res.json({ success: false, error: 'Ошибка парсинга: ' + (e.message || String(e)) });
    }
  }

  // Определение сценария (Фотоконтроль монтажа / План БТИ / Обычный чат)
  const isPureGreeting = !image && /^(?:привет|здравствуй|здравствуйте|добрый\s+(?:день|вечер|утро)|хай|ку|салют|приветик|здорово)[!.,?\s]*$/i.test(text);

  let isQc = scenario === 'qc' || (image && /(?:приемк|приёмк|оцен|фотоконтрол|качество монтаж|дефект|провер|чек-лист|стойк|шкаф|гофр|розетк|маркировк|стяжк)/i.test(text));
  let isBti = scenario === 'bti' || (image && /(?:бти|план|схем|чертеж|чертёж|этаж|планировк|камер|видео|помещени|расчет|расчёт|подбор|смет|сколько)/i.test(text));

  // Если прикреплено фото и ни один сценарий явно не указан
  if (image && !isQc && !isBti) {
    if (/(?:камер|план|схем|расчет|расчёт|сколько|нужно|оборудован)/i.test(text)) {
      isBti = true;
    } else {
      isQc = true;
    }
  }

  let systemPrompt = buildAiSystemPrompt(mode);
  if (isQc) {
    systemPrompt = buildQcPrompt();
  } else if (isBti) {
    const stockSummary = await getCentralWarehouseStockSummary();
    systemPrompt = buildBtiPrompt(stockSummary);
  }

  // Сборка контекста из базы данных при необходимости (только для текстовых запросов без картинок)
  let context = '';
  if (req.user && !isPureGreeting && !isQc && !isBti && !image) {
    try {
      const sqlContext = await generateAndRunSqlContext(text, req.user);
      if (sqlContext) {
        context = sqlContext;
      } else {
        const isSupplyQuery = /(?:склад|тмц|материал|кабель|дефицит|поставк|остат)/i.test(text);
        const [facadeContext, forecastCtx] = await Promise.all([
          buildContextForQuery(text, req.user),
          isSupplyQuery ? runForecastContextSql() : Promise.resolve([])
        ]);
        const supplyText = (forecastCtx || []).map(a =>
          `=== ${a.section} ===\n${a.error ? '[данные недоступны]' : JSON.stringify(a.rows)}`
        ).join('\n');

        context = [facadeContext, supplyText].filter(Boolean).join('\n\n');
      }
    } catch (e) {
      console.error('[AI Context Load Error]:', e.message);
    }
  }

  // Контекст карточки заявки
  let card = '';
  if (cardContext && typeof cardContext === 'string') {
    card = '\n<card_context>\n' + cardContext + '\n</card_context>';
  }

  // Скользящее окно истории (последние 4 сообщения)
  let recentHistory = [];
  if (!isPureGreeting && !isQc && !isBti) {
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
  }

  // Формирование мультимодального пользовательского контента (текст + изображение)
  let userMessageContent = text;
  if (image) {
    const userParts = [];
    if (text) {
      userParts.push({ type: 'text', text });
    } else {
      userParts.push({
        type: 'text',
        text: isQc ? 'Проведи фотоконтроль и приёмку узла монтажа на фотографии по чек-листу.' : (isBti ? 'Проанализируй план/помещение и составь спецификацию оборудования со сверкой со складом.' : 'Опиши и проанализируй это изображение.')
      });
    }
    userParts.push({
      type: 'image_url',
      image_url: {
        url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`
      }
    });
    userMessageContent = userParts;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(context ? [{ role: 'system', content: '<context>\n' + context + '\n</context>' }] : []),
    ...(card ? [{ role: 'system', content: card }] : []),
    ...recentHistory,
    { role: 'user', content: userMessageContent }
  ];

  // Контроллер отмены
  const abortController = new AbortController();
  let clientDisconnected = false;

  req.on('close', () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      abortController.abort();
    }
  });

  // Записываем сообщение пользователя в базу данных (включая миниатюру изображения)
  let userMsgId = null;
  try {
    const userIns = await pool.query(
      `INSERT INTO ai_messages (user_id, mode, role, content, image_url) VALUES ($1,$2,'user',$3,$4) RETURNING id`,
      [req.user.id, mode, text || (isQc ? '📷 Фотоконтроль монтажа' : '📐 Расчёт по плану БТИ'), image || null]
    );
    userMsgId = userIns.rows[0]?.id;
  } catch (err) {
    console.error('[AI Save User Msg Error]:', err.message);
  }

  // Подготавливаем SSE-ответ
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();

  let fullReply = '';
  let fullReasoning = '';
  let tokensUsed = 0;

  try {
    const stream = await aiClient.chat.completions.create({
      model: currentModel,
      messages,
      stream: true,
      temperature: isQc ? 0.1 : 0.2,
      max_tokens: 4500
    }, {
      signal: abortController.signal
    });

    for await (const chunk of stream) {
      if (clientDisconnected || abortController.signal.aborted) {
        break;
      }
      const deltaObj = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
      const content = deltaObj ? (deltaObj.content || '') : '';
      const reasoning = deltaObj ? (deltaObj.reasoning_content || '') : '';

      if (content) {
        fullReply += content;
        res.write('data: ' + JSON.stringify({ delta: content }) + '\n\n');
      } else if (reasoning) {
        fullReasoning += reasoning;
      }

      if (chunk.usage && chunk.usage.total_tokens) {
        tokensUsed = chunk.usage.total_tokens;
      }
    }

    if (!fullReply && fullReasoning) {
      fullReply = fullReasoning;
      res.write('data: ' + JSON.stringify({ delta: fullReply }) + '\n\n');
    }

    // Сохраняем ответ ассистента в базу данных
    let assistantMsgId = null;
    try {
      const asstIns = await pool.query(
        `INSERT INTO ai_messages (user_id, mode, role, content, tokens_used)
         VALUES ($1,$2,'assistant',$3,$4) RETURNING id, created_at`,
        [req.user.id, mode, fullReply || '', tokensUsed]
      );
      assistantMsgId = asstIns.rows[0]?.id;
    } catch (_) {}

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
      } else if (userMsgId) {
        try {
          await pool.query('DELETE FROM ai_messages WHERE id=$1', [userMsgId]);
        } catch (_) {}
      }
      return;
    }

    console.error('[AI Stream Error]:', e.message || e);
    let errMsg = e.message || 'Ошибка генерации ответа';
    if (errMsg.includes('401') || errMsg.includes('Incorrect API key') || errMsg.includes('Authentication')) {
      errMsg = 'Ошибка авторизации API DeepSeek: проверьте правильность ключа AI_API_KEY в файле .env.';
    } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('Connection error') || errMsg.includes('fetch failed')) {
      errMsg = `Не удалось подключиться к серверу DeepSeek (${targetUrl}). Проверьте подключение к интернету или доступность хоста.`;
    }

    try {
      res.write('data: ' + JSON.stringify({ error: errMsg }) + '\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (_) {}

    if (userMsgId && !fullReply) {
      try {
        await pool.query('DELETE FROM ai_messages WHERE id=$1', [userMsgId]);
      } catch (_) {}
    }
  }
});

// GET /api/ai/history — загрузка истории переписки с ИИ и оценок
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const { rows } = await pool.query(
      `SELECT id, mode, role, content, image_url, rating, rating_comment, tokens_used, created_at
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
