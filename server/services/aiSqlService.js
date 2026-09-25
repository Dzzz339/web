import { pool } from '../config/db.js';
import { getAiClient, AI_MODEL } from './aiFacade.js';

/**
 * Описание безопасных витрин данных Stockeasy для ИИ
 */
const AI_VIEWS_SCHEMA = `
БЕЗОПАСНЫЕ ТАБЛИЦЫ (ВИДЫ) БАЗЫ ДАННЫХ STOCKEASY:

1. v_ai_users (Сотрудники и пользователи платформы):
   - id (INTEGER): уникальный ID
   - full_name (TEXT): ФИО сотрудника (например: 'Елагин Алексей', 'Стоякин В.И.')
   - username (TEXT): логин
   - role (TEXT): роль ('admin' - администратор, 'manager' - менеджер, 'designer' - проектировщик ИД, 'dispatcher' - диспетчер, 'payments' - бухгалтер, 'worker' - монтажник/исполнитель)
   - phone (TEXT): контактный телефон
   - email (TEXT): эл. почта
   - created_at (TIMESTAMPTZ): дата регистрации

2. v_ai_tasks (Заявки и объекты, ТОЛЬКО активные, не в архиве):
   - id (TEXT): номер заявки (например, '1044', '2081')
   - sheet (TEXT): реестр/направление
   - region (TEXT): регион (например: 'Архангельская обл', 'Вологодская обл', 'Санкт-Петербург')
   - address (TEXT): адрес объекта
   - clean_address (TEXT): нормализованный адрес
   - work_type (TEXT): тип работ
   - tip_obj (TEXT): тип объекта (офис, банкомат, отделение)
   - date_zayavki (DATE): дата заявки
   - deadline (DATE): крайний срок выполнения
   - data_vyhoda (DATE): запланированная дата выезда на монтаж
   - manager (TEXT): ФИО менеджера
   - contact (TEXT): контакт куратора объекта
   - contractor (TEXT): назначенный подрядчик / организация
   - assignee (TEXT): исполнитель / монтажник
   - controller (TEXT): контролер качества
   - status (TEXT): статус задачи ('progress' - в работе, 'done' - выполнена)
   - priority (TEXT): приоритет ('low', 'medium', 'high')
   - overdue_days (INTEGER): количество дней просрочки (0 если нет просрочки)
   - stage (TEXT): текущий технологический этап
   - amount (NUMERIC): сумма заявки в рублях
   - priemka (TEXT): статус сдачи монтажа ('готово', 'принято', 'не сдано')
   - oplata (TEXT): статус оплаты заказчиком ('оплачено', 'не оплачено')
   - id_status (TEXT): статус исполнительной документации (ИД)
   - comment (TEXT): замечание или рабочий комментарий
   - excel_comment (TEXT): служебный комментарий

3. v_ai_contractors (Подрядные организации и заказчики):
   - id (INTEGER): ID организации
   - inn (TEXT): ИНН
   - name_short (TEXT): краткое наименование (например: 'ИП Елагин', 'ПАО СБЕРБАНК')
   - name_full (TEXT): полное наименование
   - director (TEXT): директор / руководитель
   - phone (TEXT): телефон
   - email (TEXT): почта
   - status (TEXT): 'active' / 'inactive'
   - type (TEXT): 'customer' (заказчик), 'subcontractor' (подрядчик), 'supplier' (поставщик)

4. v_ai_stock (Остатки материалов на складах):
   - material_name (TEXT): наименование кабеля/оборудования
   - material_code (TEXT): артикул/код
   - category (TEXT): категория ('cable', 'keystone', 'box', 'conduit', 'hardware')
   - unit (TEXT): ед. изм. ('м', 'шт')
   - warehouse_name (TEXT): название склада
   - is_central (BOOLEAN): признак центрального склада
   - total_quantity (NUMERIC): общий остаток
   - reserved_qty (NUMERIC): в резерве под выезды
   - free_stock (NUMERIC): свободно к выдаче

5. v_ai_remarks (Замечания инспекторов по объектам):
   - id (INTEGER): ID замечания
   - task_id (TEXT): номер заявки
   - body (TEXT): текст замечания/брака
   - created_name (TEXT): кто выставил (инспектор)
   - created_at (TIMESTAMPTZ): когда создано
   - resolved_at (TIMESTAMPTZ): когда устранено (если NULL — замечание ОТКРЫТО!)
   - region (TEXT): регион объекта
   - address (TEXT): адрес объекта
   - contractor (TEXT): подрядчик объекта
`;

/**
 * Валидатор SQL-запроса, сгенерированного ИИ
 */
export function validateAiSql(sqlQuery) {
  if (!sqlQuery || typeof sqlQuery !== 'string') {
    return { valid: false, error: 'Пустой запрос' };
  }

  // Очистка от markdown-оберток ```sql ... ```
  let clean = sqlQuery.trim()
    .replace(/^```(?:sql)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Удаляем точку с запятой в конце
  clean = clean.replace(/;+\s*$/, '').trim();

  if (clean.toUpperCase() === 'NONE' || clean.length < 6) {
    return { valid: false, isNone: true };
  }

  // 1. Должен начинаться строго с SELECT
  if (!clean.toUpperCase().startsWith('SELECT')) {
    return { valid: false, error: 'Разрешены только запросы на чтение (SELECT)' };
  }

  // 2. Блокировка опасных ключевых слов и инъекций
  const forbiddenPattern = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXEC|EXECUTE|PG_SLEEP|INTO|COPY|FILE|SYSTEM)\b|;|--|\/\*/i;
  if (forbiddenPattern.test(clean)) {
    return { valid: false, error: 'Обнаружены недопустимые операторы модификации данных' };
  }

  // 3. Проверка источников: разрешены ТОЛЬКО безопасные витрины v_ai_*
  const allowedViews = ['v_ai_users', 'v_ai_tasks', 'v_ai_contractors', 'v_ai_stock', 'v_ai_remarks'];
  const fromJoinRegex = /\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)/gi;
  let match;
  let sourcesFound = 0;
  while ((match = fromJoinRegex.exec(clean)) !== null) {
    const table = match[1].toLowerCase();
    if (!allowedViews.includes(table)) {
      return { valid: false, error: `Доступ к таблице "${table}" запрещен. Разрешены только витрины v_ai_*` };
    }
    sourcesFound++;
  }

  if (sourcesFound === 0) {
    return { valid: false, error: 'В запросе не указана ни одна разрешенная витрина данных' };
  }

  // 4. Ограничение количества строк (не более 40 строк)
  if (!/\bLIMIT\s+\d+/i.test(clean)) {
    clean += ' LIMIT 30';
  }

  return { valid: true, sql: clean };
}

/**
 * Безопасное выполнение SQL-запроса в PostgreSQL с таймаутом
 */
export async function executeAiSql(validSql) {
  const client = await pool.connect();
  try {
    // Таймаут выполнения запроса 3 секунды, чтобы исключить зависания
    await client.query('SET LOCAL statement_timeout = 3000');
    const res = await client.query(validSql);
    return {
      success: true,
      rows: res.rows || [],
      rowCount: res.rowCount || 0
    };
  } catch (err) {
    console.error('[AI SQL Execute Error]:', err.message, '| Query:', validSql);
    return {
      success: false,
      error: err.message
    };
  } finally {
    client.release();
  }
}

/**
 * Генерация и выполнение безопасного SQL-запроса по вопросу пользователя
 */
export async function generateAndRunSqlContext(userQuery, user) {
  if (!userQuery || typeof userQuery !== 'string') return null;
  const q = userQuery.trim();

  // Приветствия и общие фразы не требуют обращения к БД
  if (/^(?:привет|здравствуй|здравствуйте|добрый\s+(?:день|вечер|утро)|хай|ку|салют|приветик|спасибо|благодарю)[!.,?\s]*$/i.test(q)) {
    return null;
  }

  const aiClient = getAiClient();
  if (!aiClient) return null;

  const systemPrompt = `Ты — экспертный SQL-аналитик для корпоративной базы данных PostgreSQL платформы Stockeasy.
Твоя задача: по вопросу пользователя составить ТОЧНЫЙ и БЕЗОПАСНЫЙ запрос SELECT к витринам данных.

${AI_VIEWS_SCHEMA}

ПРАВИЛА ГЕНЕРАЦИИ SQL (ОБЯЗАТЕЛЬНЫ):
1. Используй ТОЛЬКО витрины: v_ai_users, v_ai_tasks, v_ai_contractors, v_ai_stock, v_ai_remarks. Других таблиц не существует.
2. Никаких INSERT, UPDATE, DELETE, DROP, ALTER. Строго один SELECT.
3. Поиск по фамилиям, именам, городам делай НЕЧУВСТВИТЕЛЬНЫМ к регистру через ILIKE и символы %:
   - Если спросили про сотрудника или подрядчика (например, Елагин, Стоякин, Иванов):
     Ищи по v_ai_users (full_name ILIKE '%елагин%' OR username ILIKE '%елагин%') 
     И/ИЛИ по v_ai_tasks (contractor ILIKE '%елагин%' OR assignee ILIKE '%елагин%' OR manager ILIKE '%елагин%').
   - Если спросили "какие есть сотрудники" или "кто работает":
     SELECT id, full_name, username, role, phone FROM v_ai_users ORDER BY role, full_name LIMIT 30
   - Если спросили "сколько заявок выполнил [Имя]":
     SELECT 
       COUNT(*) AS total_count,
       COUNT(*) FILTER (WHERE status = 'done' OR LOWER(COALESCE(priemka, '')) IN ('готово', 'принято') OR LOWER(COALESCE(oplata, '')) LIKE '%оплачен%') AS done_count,
       COUNT(*) FILTER (WHERE status != 'done' AND LOWER(COALESCE(priemka, '')) NOT IN ('готово', 'принято')) AS in_work_count,
       COALESCE(SUM(amount), 0) AS total_amount
     FROM v_ai_tasks 
     WHERE contractor ILIKE '%[корень_фамилии]%' OR assignee ILIKE '%[корень_фамилии]%' OR manager ILIKE '%[корень_фамилии]%'
   - Если спросили остатки по материалу или складу:
     SELECT material_name, warehouse_name, free_stock, unit FROM v_ai_stock WHERE material_name ILIKE '%[материал]%' LIMIT 20
4. Если вопрос НЕ относится к данным из базы (например, "как настроить роутер Mikrotik", "напиши письмо заказчику") — верни строго одно слово: NONE.
5. Формат ответа: ТОЛЬКО чистый SQL запрос в одну строку или блок. Без пояснений, без markdown-кавычек, без точки с запятой.`;

  try {
    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: q }
      ],
      temperature: 0.0,
      max_tokens: 300
    });

    const rawSql = (completion.choices[0]?.message?.content || '').trim();
    if (!rawSql || rawSql.toUpperCase() === 'NONE') {
      return null;
    }

    const validation = validateAiSql(rawSql);
    if (!validation.valid) {
      if (validation.isNone) return null;
      console.warn('[AI SQL Validation Warning]:', validation.error, '| Raw:', rawSql);
      return null;
    }

    const execResult = await executeAiSql(validation.sql);
    if (!execResult.success) {
      return `=== ОШИБКА ЗАПРОСА К БАЗЕ ДАННЫХ ===\nЗапрос: ${validation.sql}\nОшибка: ${execResult.error}`;
    }

    const rows = execResult.rows;
    if (rows.length === 0) {
      return `=== РЕЗУЛЬТАТ ЗАПРОСА К БАЗЕ ДАННЫХ ===
Запрос: ${validation.sql}
По данному запросу в системе Stockeasy найдено ровно 0 записей (данные отсутствуют).
ИНСТРУКЦИЯ ДЛЯ ОТВЕТА: Четко ответь пользователю, что по его запросу в базе данных числится 0 записей. Не говори, что не хватает информации, прямо назови точный результат: 0.`;
    }

    return `=== АКТУАЛЬНЫЕ ДАННЫЕ ИЗ БАЗЫ ДАННЫХ STOCKEASY (SQL) ===
Запрос к витрине: ${validation.sql}
Найдено записей: ${rows.length}
Данные:
${JSON.stringify(rows, null, 2)}
ИНСТРУКЦИЯ ДЛЯ ОТВЕТА: Опирайся на приведенные выше точные данные из базы данных. Ответь кратко, понятно и по-русски, с указанием конкретных имен, цифр и статусов. Номера заявок указывай в квадратных скобках (например [#1234]).`;
  } catch (err) {
    console.error('[AI SQL Context Generation Error]:', err.message);
    return null;
  }
}
