import { spawn } from 'child_process';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import express from 'express'
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import multer from 'multer'
import crypto from 'crypto'
import pg from 'pg'


const sleep = ms => new Promise(res => setTimeout(res, ms));
const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT, 'uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ''
    cb(null, crypto.randomUUID() + ext)
  }
})
const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15МБ на файл
})
const app = express()
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'hahahksdjscndufn4738';

//проерка токена
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Достаем токен из "Bearer <TOKEN>"

  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Невалидный токен' });
    req.user = user; // Записываем данные пользователя (id, role, fullName) в объект запроса
    next();
  });
}


const connectionString = process.env.DATABASE_URL || '';
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || connectionString.includes('@db:') || connectionString.includes('stockeasy-db');
const pool = new Pool({
  connectionString: connectionString,
  // Если база локальная — отключаем SSL, если удаленная (Railway) — оставляем
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use(express.static(ROOT))

app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')))


app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
    const user = rows[0];

    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Неверный пароль' });

    // Создаем токен (в него упаковываем ID, роль и ФИО)
    const token = jwt.sign(
      { id: user.id, role: user.role, fullName: user.full_name, contractorId: user.contractor_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role, fullName: user.full_name } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ИНИЦИАЛИЗАЦИЯ БД ────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'worker', 
      full_name     TEXT,                           
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Создание таблицы подрядчиков
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractors (
      id            SERIAL PRIMARY KEY,
      inn           TEXT UNIQUE NOT NULL, -- ИНН уникален
      kpp           TEXT,
      name_short    TEXT NOT NULL,        -- ИП Иванов И.И. / ООО "Ромашка"
      name_full     TEXT,                 -- Полное наименование
      address_legal TEXT,
      director      TEXT,                 -- ФИО руководителя
      bank_name     TEXT,
      bik           TEXT,
      account_corr  TEXT,                 -- Корр. счет
      account_pay   TEXT,                 -- Расчетный счет
      phone         TEXT,
      email         TEXT,
      status        TEXT DEFAULT 'active', -- active, inactive
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Индекс для быстрого поиска подрядчиков по ИНН и Названию
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contractors_inn ON contractors(inn)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contractors_name ON contractors(name_short)`);

  // Индекс для быстрого поиска при логине
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL`);

  await pool.query(`
    
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      sheet       TEXT,
      region      TEXT,
      address     TEXT,
      work_type   TEXT,
      tip_obj     TEXT,
      gosb        TEXT,
      vsp         TEXT,
      date_zayavki DATE,
      deadline    DATE,
      date_vnesen DATE,
      manager     TEXT,
      contact     TEXT,
      contractor  TEXT,
      in_order    INTEGER DEFAULT 0,
      fact        INTEGER DEFAULT 0,
      obsledovanie TEXT,
      dostup      TEXT,
      data_vyhoda DATE,
      priemka     TEXT,
      oplata      TEXT,
      id_status   TEXT,
      amount      NUMERIC DEFAULT 0,
      distance_km NUMERIC DEFAULT 0,
      price_per_unit NUMERIC DEFAULT 0,
      tech_link   TEXT,
      edo_number  TEXT,
      invoice_info TEXT,
      vedo_status TEXT,
      excel_comment TEXT,
      status      TEXT DEFAULT 'progress',
      priority    TEXT DEFAULT 'low',
      overdue_days INTEGER DEFAULT 0,
      stage       TEXT,
      archived    BOOLEAN DEFAULT false,
      assignee    TEXT,
      controller  TEXT,
      comment     TEXT,
      distributed_at DATE,
      history     JSONB DEFAULT '[]',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      raw_data    JSONB DEFAULT '{}'
    )
  `)

  

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marches (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      base_city   TEXT,
      km_rate     NUMERIC DEFAULT 70,
      points      JSONB DEFAULT '[]',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_meta (
      id          INTEGER PRIMARY KEY DEFAULT 1,
      imported_from TEXT,
      imported_at TIMESTAMPTZ,
      row_count   INTEGER DEFAULT 0
    )
  `)

  await pool.query(`
    INSERT INTO import_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING
  `)

  // Индексы для быстрых запросов
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_region   ON tasks(region)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_sheet    ON tasks(sheet)`)

  // Миграции — добавляем новые колонки если их нет (безопасно для существующей БД)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS date_vnesen DATE`)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}'`)
  await pool.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS km_rate NUMERIC DEFAULT 0')
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tmc NUMERIC DEFAULT 0`)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extras NUMERIC DEFAULT 0`)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS geo_lat TEXT`)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS geo_lon TEXT`)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS clean_address TEXT`)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS supplier_order_signed BOOLEAN DEFAULT false`)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS supplier_id_uploaded BOOLEAN DEFAULT false`)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS overdue_reason TEXT`)
  await pool.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignment_status TEXT DEFAULT NULL')

  // Миграция: добавляем email для пользователей
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);

  // 1. Таблицы для будущего Чата
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id         SERIAL PRIMARY KEY,
      name       TEXT,                                   -- Название (для групп)
      type       TEXT NOT NULL DEFAULT 'direct',         -- 'direct', 'group', 'task'
      task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_members (
      id        SERIAL PRIMARY KEY,
      room_id   INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(room_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id           SERIAL PRIMARY KEY,
      room_id      INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
      sender_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      message_text TEXT NOT NULL,
      attachments  JSONB DEFAULT '[]',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Таблица для Уведомлений (Колокольчик)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      body       TEXT,
      link       TEXT,
      is_read    BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read)`);

    // Таблица для вложений (фото, схемы, акты, чеки)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id            SERIAL PRIMARY KEY,
      task_id       TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      type          TEXT NOT NULL,          -- 'photo_report' | 'scheme' | 'act' | 'receipt'
      file_path     TEXT NOT NULL,
      original_name TEXT,
      mime_type     TEXT,
      size_bytes    INTEGER,
      uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      comment       TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id)`);
  


  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id            SERIAL PRIMARY KEY,
      task_id       TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      doc_type      TEXT NOT NULL DEFAULT 'invoice',  -- 'invoice' | 'act'
      version       INTEGER NOT NULL DEFAULT 1,
      status        TEXT NOT NULL DEFAULT 'draft',    -- draft | issued | approved | paid
      amount        NUMERIC,
      snapshot      JSONB,        -- копия данных задачи на момент выпуска (для истории)
      issued_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      issued_at     TIMESTAMPTZ,
      approved_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoices_task_id ON invoices(task_id)`);
  // Таблица строк протокола измерений (КЖ/ПИ)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_ports (
      id            SERIAL PRIMARY KEY,
      task_id       TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      port_number   TEXT,
      patch_panel   TEXT,
      room          TEXT,
      marking       TEXT,
      cable_length  NUMERIC,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_ports_task_id ON task_ports(task_id)`);

  const userCount = await pool.query('SELECT COUNT(*) FROM users');
  if (parseInt(userCount.rows[0].count) === 0) {
    const bcrypt = await import('bcryptjs');
    const salt = await bcrypt.default.genSalt(10);
    // Хешируем пароль перед сохранением
    const hash = await bcrypt.default.hash('chaykaxxx228', salt); 
    
    await pool.query(
      'INSERT INTO users (username, password_hash, role, full_name) VALUES ($1, $2, $3, $4)',
      ['nikita', hash, 'admin', 'Администратор']
    );
    console.log('Default admin user created');
  }
  runBackgroundGeocoding();
  ensureGeneralChat();
  console.log('DB initialized')
  
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function runPythonCleaner(data) {
  return new Promise((resolve, reject) => {
    const pythonCommand = process.platform === 'win32' ? 'py' : 'python3';
    const python = spawn(pythonCommand, [path.join(__dirname, 'cleaner.py')]);
    let result = '';
    let errorOutput = '';

    python.on('error', (err) => {
      reject(new Error(`Не удалось запустить Python: ${err.message}`));
    });

    // ВОТ ОН, ФИКС EPIPE: Ловим ошибку обрыва канала
    python.stdin.on('error', (err) => {
      console.error('Ошибка передачи данных в Python (EPIPE):', err.message);
    });

    try {
      python.stdin.write(JSON.stringify(data));
      python.stdin.end();
    } catch (e) {
      console.error('Ошибка записи stdin:', e);
    }

    python.stdout.on('data', (data) => { result += data.toString(); });
    python.stderr.on('data', (data) => { errorOutput += data.toString(); });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python упал с кодом ${code}. Ошибка: ${errorOutput}`);
        return reject(new Error('Python не справился с объемом данных (нехватка памяти)'));
      }
      try {
        resolve(JSON.parse(result));
      } catch (e) {
        reject(new Error('Python вернул битый ответ'));
      }
    });
  });
}
function getInitialStage(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'done') return 'payment'
  if (s === 'cancelled') return null
  return 'install'
}

// Конвертируем snake_case из БД в camelCase для фронтенда
function rowToTask(r) {
  return {
    id:           r.id,
    sheet:        r.sheet,
    title:        r.id + (r.address ? ' — ' + r.address.slice(0,80) : ''),
    region:       r.region,
    address:      r.address,
    workType:     r.work_type,
    tipObj:       r.tip_obj,
    gosb:         r.gosb,
    vsp:          r.vsp,
    dateZayavki:  r.date_zayavki   ? new Date(r.date_zayavki).toLocaleDateString('en-CA') : null,
    deadline:     r.deadline       ? new Date(r.deadline).toLocaleDateString('en-CA') : null,
    currentDate:  r.date_vnesen   ? new Date(r.date_vnesen).toLocaleDateString('en-CA') : null,
    manager:      r.manager,
    contact:      r.contact,
    contractor:   r.contractor,
    inOrder:      Number(r.in_order)      || 0,
    fact:         Number(r.fact)          || 0,
    obsledovanie: r.obsledovanie,
    dostup:       r.dostup,
    dataVyhoda:   r.data_vyhoda  ? new Date(r.data_vyhoda).toLocaleDateString('en-CA') : null,
    priemka:      r.priemka,
    oplata:       r.oplata,
    idStatus:     r.id_status,
    amount:       Number(r.amount)        || 0,
    kmRate:       Number(r.km_rate) || 0,
    distanceKm:   Number(r.distance_km)  || 0,
    pricePerUnit: Number(r.price_per_unit)|| 0,
    techLink:     r.tech_link,
    edoNumber:    r.edo_number,
    invoiceInfo:  r.invoice_info,
    vedoStatus:   r.vedo_status,
    excelComment: r.excel_comment,
    status:       r.status,
    priority:     r.priority,
    overdueDays:  Number(r.overdue_days) || 0,
    stage:        r.stage,
    archived:     r.archived,
    assignee:     r.assignee,
    assignmentStatus: r.assignment_status,
    controller:   r.controller,
    comment:      r.comment,
    distributedAt: r.distributed_at ? new Date(r.distributed_at).toLocaleDateString('en-CA') : null,
    _history:     r.history || [],
    rawData:      r.raw_data || {},
    tmc:          Number(r.tmc) || 0,
    extras:       Number(r.extras) || 0,
    supplierOrderSigned: r.supplier_order_signed || false,
    supplierIdUploaded:  r.supplier_id_uploaded || false,
    overdueReason: r.overdue_reason,
  }
}

function safeDate(v) {
  if (!v) return null
  const s = String(v).trim()
  let iso = null
  // YYYY-MM-DD или YYYY-MM-DDTHH:MM:SS
  const isoMatch = s.split('T')[0]
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoMatch)) iso = isoMatch
  // ДД.ММ.ГГГГ
  else {
    const ru = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
    if (ru) iso = `${ru[3]}-${ru[2]}-${ru[1]}`
    else {
      const sl = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
      if (sl) iso = `${sl[3]}-${sl[2]}-${sl[1]}`
    }
  }
  if (!iso) return null
  // Проверяем что дата реально существует (31 июня, 29 февраля и т.п.)
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return iso
}

// ─── STATS & CHAINS ───────────────────────────────────────────────────────────
function computeStats(tasks) {
  const total = tasks.length
  const done = tasks.filter(r => r.status === 'done').length
  const cancelled = tasks.filter(r => r.status === 'cancelled').length
  const overdue = tasks.filter(r => r.overdueDays > 0).length
  const revenue = tasks.reduce((s,r) => s + (Number(r.amount)||0), 0)
  return {
    tasks:   { total, done, pending: total-done-cancelled, cancelled },
    orders:  { total, pending: total-done-cancelled, done },
    supply:  { steps: 6, completed: done, overdue },
    revenue: { total: revenue, month: revenue }
  }
}

function buildChainsFromRows(tasks) {
  const byRegion = {}
  for (const r of tasks) {
    const key = r.region || 'Прочее'
    if (!byRegion[key]) byRegion[key] = []
    byRegion[key].push(r)
  }
  const steps = ['Заявка','Обследование','Монтаж','Контроль','Приёмка','Оплата']
  return Object.entries(byRegion).map(([region, items]) => {
    const total = items.length
    const done = items.filter(i => i.status === 'done').length
    const cancelled = items.filter(i => i.status === 'cancelled').length
    const ratio = total > 0 ? done / total : 0
    const currentStep = Math.min(Math.floor(ratio * steps.length), steps.length - 1)
    return {
      id: region, name: `${region} (${total} заявок)`,
      status: done === total ? 'completed' : 'in_progress',
      steps, currentStep, totalTasks: total, doneTasks: done,
      cancelledTasks: cancelled, inProgressTasks: total - done - cancelled,
      totalAmount: items.reduce((s,i) => s + (Number(i.amount)||0), 0)
    }
  }).sort((a,b) => b.totalTasks - a.totalTasks)
}
function stripAddressNoise(s) {
  if (!s) return '';
  return s
    .split(/ этаж| оф| кв| каб| корп|строение| клиентский| вход| пом/i)[0] // Отрезаем по ключевым словам
    .replace(/[^а-яёa-z0-9\s.,-]/gi, '') // Удаляем спецсимволы
    .trim();
}
async function cleanAddressDaData(address, region) {
  if (!process.env.DADATA_API_KEY || !address || address.length < 5) return null;

  const query = (region ? region + ', ' : '') + address;

  try {
    // Используем метод Подсказок (Suggestions API) - 10к в день бесплатно
    const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Token ${process.env.DADATA_API_KEY}`
      },
      body: JSON.stringify({ query: query, count: 1 })
    });

    if (!response.ok) {
      const err = await response.text();
      console.log(`[DaData Error] Status: ${response.status} | ${err}`);
      return null;
    }

    const result = await response.json();
    if (result && result.suggestions && result.suggestions[0]) {
      const s = result.suggestions[0];
      return {
        lat: s.data.geo_lat,
        lon: s.data.geo_lon,
        address: s.value
      };
    }
  } catch (e) {
    console.error("DaData connection error:", e.message);
  }
  return null;
}


// Получить список всех пользователей
app.get('/api/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.username, u.role, u.full_name, u.email, u.contractor_id, u.created_at, c.name_short AS contractor_name
      FROM users u
      LEFT JOIN contractors c ON c.id = u.contractor_id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Создать нового пользователя
app.post('/api/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    const { username, password, role, fullName, email, contractorId } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    
    await pool.query(
      'INSERT INTO users (username, password_hash, role, full_name, email, contractor_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [username, hash, role, fullName, email || null, contractorId || null]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Обновить данные пользователя (только для Админа)
app.put('/api/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    const { username, password, role, fullName, email, contractorId } = req.body;
    let query = 'UPDATE users SET username = $1, role = $2, full_name = $3, email = $4, contractor_id = $5';
    let params = [username, role, fullName, email || null, contractorId || null];

    // Если передан новый пароль — хешируем и обновляем его
    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      query += ', password_hash = $' + (params.length + 1);
      params.push(hash);
    }

    query += ' WHERE id = $' + (params.length + 1);
    params.push(req.params.id);

    await pool.query(query, params);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Удалить пользователя
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


async function createNotification(userId, title, body, link) {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)',
      [userId, title, body || '', link || null]
    );
  } catch(e) { console.error('Notification creation error:', e.message); }
}

// Получить список уведомлений текущего пользователя
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Пометить все как прочитанные
app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// API: ПОДРЯДЧИКИ (CONTRACTORS)
// ==========================================

// Получить список всех подрядчиков (только для Админа)
app.get('/api/contractors', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    const { rows } = await pool.query('SELECT * FROM contractors ORDER BY name_short ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Создать нового подрядчика
app.post('/api/contractors', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    const d = req.body;
    const { rows } = await pool.query(`
      INSERT INTO contractors (
        inn, kpp, name_short, name_full, address_legal, director, 
        bank_name, bik, account_corr, account_pay, phone, email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      d.inn, d.kpp || null, d.name_short, d.name_full || null, d.address_legal || null, d.director || null,
      d.bank_name || null, d.bik || null, d.account_corr || null, d.account_pay || null, d.phone || null, d.email || null
    ]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Обновить данные подрядчика
app.put('/api/contractors/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    const d = req.body;
    await pool.query(`
      UPDATE contractors SET
        inn = COALESCE($2, inn),
        kpp = COALESCE($3, kpp),
        name_short = COALESCE($4, name_short),
        name_full = COALESCE($5, name_full),
        address_legal = COALESCE($6, address_legal),
        director = COALESCE($7, director),
        bank_name = COALESCE($8, bank_name),
        bik = COALESCE($9, bik),
        account_corr = COALESCE($10, account_corr),
        account_pay = COALESCE($11, account_pay),
        phone = COALESCE($12, phone),
        email = COALESCE($13, email),
        status = COALESCE($14, status),
        updated_at = NOW()
      WHERE id = $1
    `, [
      req.params.id, d.inn, d.kpp, d.name_short, d.name_full, d.address_legal, d.director,
      d.bank_name, d.bik, d.account_corr, d.account_pay, d.phone, d.email, d.status
    ]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Удалить подрядчика
app.delete('/api/contractors/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    await pool.query('DELETE FROM contractors WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// Запрос к DaData по ИНН компании (Party)
app.get('/api/dadata/party', authenticateToken, async (req, res) => {
  const inn = req.query.inn;
  if (!inn || !process.env.DADATA_API_KEY) return res.json(null);
  
  try {
    const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Token ${process.env.DADATA_API_KEY}`
      },
      body: JSON.stringify({ query: inn, count: 1 })
    });

    if (!response.ok) throw new Error(await response.text());
    
    const result = await response.json();
    if (result && result.suggestions && result.suggestions[0]) {
      const s = result.suggestions[0].data;
      res.json({
        inn: s.inn,
        kpp: s.kpp || '',
        name_short: s.name.short_with_opf || s.name.short || result.suggestions[0].value,
        name_full: s.name.full_with_opf || s.name.full || '',
        address_legal: s.address ? s.address.value : '',
        director: s.management ? s.management.name : ''
      });
    } else {
      res.json(null);
    }
  } catch (e) {
    console.error("DaData Party error:", e.message);
    res.json(null);
  }
});

// Запрос к DaData по БИК банка
app.get('/api/dadata/bank', authenticateToken, async (req, res) => {
  const bik = req.query.bik;
  if (!bik || !process.env.DADATA_API_KEY) return res.json(null);
  
  try {
    const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/bank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Token ${process.env.DADATA_API_KEY}`
      },
      body: JSON.stringify({ query: bik, count: 1 })
    });

    if (!response.ok) throw new Error(await response.text());
    
    const result = await response.json();
    if (result && result.suggestions && result.suggestions[0]) {
      const s = result.suggestions[0].data;
      res.json({
        bank_name: result.suggestions[0].value, // Название банка
        bik: s.bik,
        account_corr: s.correspondent_account || '' // Корр. счет
      });
    } else {
      res.json(null);
    }
  } catch (e) {
    console.error("DaData Bank error:", e.message);
    res.json(null);
  }
});


// Живой поиск компаний по Названию или ИНН через DaData Suggestions
app.get('/api/dadata/suggest-party', authenticateToken, async (req, res) => {
  const query = req.query.query;
  if (!query || query.trim().length < 3 || !process.env.DADATA_API_KEY) return res.json([]);

  try {
    const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Token ${process.env.DADATA_API_KEY}`
      },
      body: JSON.stringify({ query: query, count: 5 }) // Возвращаем 5 лучших совпадений
    });

    if (!response.ok) throw new Error(await response.text());

    const result = await response.json();
    const suggestions = (result.suggestions || []).map(s => {
      const d = s.data || {};
      return {
        value: s.value, // Полная строка (название + ИНН)
        inn: d.inn || '',
        kpp: d.kpp || '',
        name_short: (d.name && (d.name.short_with_opf || d.name.short)) || s.value,
        name_full: (d.name && (d.name.full_with_opf || d.name.full)) || '',
        address_legal: d.address ? d.address.value : '',
        director: d.management ? d.management.name : ''
      };
    });

    res.json(suggestions);
  } catch (e) {
    console.error("DaData Suggest Party error:", e.message);
    res.json([]);
  }
});

// --- ФОНОВЫЙ РОБОТ ГЕОКОДИРОВАНИЯ ---
let isGeocodingRunning = false;

async function runBackgroundGeocoding() {
  if (isGeocodingRunning) return;
  isGeocodingRunning = true;
  console.log('[GeoWorker] Фоновый робот геокодирования запущен...');

  try {
    while (true) {
      // Находим 5 заявок без координат (у которых geo_lat пустой)
      const { rows } = await pool.query(
        "SELECT id, address, region FROM tasks WHERE (geo_lat IS NULL OR geo_lat = '') AND address IS NOT NULL AND length(trim(address)) > 3 AND archived = false LIMIT 5"
      );

      if (!rows.length) {
        console.log('[GeoWorker] Все адреса успешно обработаны!');
        break;
      }

      for (const task of rows) {
        let geoData = await cleanAddressDaData(task.address, task.region);
        await sleep(250);

        if (!geoData) {
          const cleanerAddr = stripAddressNoise(task.address);
          if (cleanerAddr !== task.address) {
            geoData = await cleanAddressDaData(cleanerAddr, task.region);
            await sleep(250);
          }
        }

        if (geoData) {
          await pool.query(
            "UPDATE tasks SET geo_lat = $1, geo_lon = $2, clean_address = $3 WHERE id = $4",
            [geoData.lat, geoData.lon, geoData.address, task.id]
          );
          console.log(`[GeoWorker] Найдено: ${task.id} -> ${geoData.address}`);
        } else {
          // Чтобы не мучать DaData по 100 раз ненайденным адресом, ставим пометку NONE
          await pool.query("UPDATE tasks SET geo_lat = 'NONE' WHERE id = $1", [task.id]);
        }
      }
    }
  } catch (e) {
    console.error("[GeoWorker Error]:", e.message);
  } finally {
    isGeocodingRunning = false;
  }
}

// ==========================================
// API & WEBSOCKETS: ЕДИНЫЙ МЕССЕНДЖЕР
// ==========================================

// Авто-создание «Общего чата» компании при старте
async function ensureGeneralChat() {
  try {
    const { rows } = await pool.query("SELECT id FROM chat_rooms WHERE type = 'group' AND name = 'Общий чат'");
    if (rows.length === 0) {
      await pool.query("INSERT INTO chat_rooms (name, type) VALUES ('Общий чат', 'group')");
      console.log('[Chat] Создан Общий чат компании');
    }
  } catch(e) { console.error('General chat error:', e.message); }
}

// Получить список всех диалогов текущего пользователя
app.get('/api/chats', authenticateToken, async (req, res) => {
  try {
    // 1. Все пользователи (для создания ЛС 1-на-1)
    const { rows: users } = await pool.query('SELECT id, username, role, full_name FROM users WHERE id != $1', [req.user.id]);
    
    // 2. Общий чат
    const { rows: general } = await pool.query("SELECT id, name, type FROM chat_rooms WHERE type = 'group' LIMIT 1");
    
    res.json({ users, generalChat: general[0] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Получить сообщения комнаты
app.get('/api/chats/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.id, m.room_id, m.sender_id, m.message_text, m.created_at, u.full_name, u.username
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = $1
      ORDER BY m.created_at ASC
      LIMIT 100
    `, [req.params.roomId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Получить или создать ЛС с конкретным пользователем
app.post('/api/chats/direct', authenticateToken, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    
    // Ищем существующую комнату 1-на-1 между этими пользователями
    const { rows: existing } = await pool.query(`
      SELECT r.id 
      FROM chat_rooms r
      JOIN chat_members m1 ON m1.room_id = r.id AND m1.user_id = $1
      JOIN chat_members m2 ON m2.room_id = r.id AND m2.user_id = $2
      WHERE r.type = 'direct'
      LIMIT 1
    `, [req.user.id, targetUserId]);

    if (existing.length > 0) {
      return res.json({ roomId: existing[0].id });
    }

    // Если комнаты нет — создаем
    const { rows: newRoom } = await pool.query("INSERT INTO chat_rooms (type) VALUES ('direct') RETURNING id");
    const roomId = newRoom[0].id;

    await pool.query('INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2), ($1, $3)', [roomId, req.user.id, targetUserId]);
    res.json({ roomId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// WebSockets подсоединение и умная адресация
io.on('connection', (socket) => {
  
  // При подключении привязываем сокет к персональному каналу пользователя
  socket.on('init-user', async (userId) => {
    if (!userId) return;
    socket.userId = userId;
    socket.join(`user_${userId}`); // Личный канал пользователя (например, user_3)

    // Автоматически подключаем пользователя ко всем его комнатам
    try {
      const { rows } = await pool.query('SELECT room_id FROM chat_members WHERE user_id = $1', [userId]);
      rows.forEach(r => socket.join(`room_${r.room_id}`));
      
      const { rows: gen } = await pool.query("SELECT id FROM chat_rooms WHERE type = 'group' LIMIT 1");
      if (gen.length) socket.join(`room_${gen[0].id}`);
    } catch(e) {}
  });

  socket.on('join-room', (roomId) => {
    if (roomId) socket.join(`room_${roomId}`);
  });

  // Отправка сообщения
  socket.on('send-message', async (data) => {
    if (!data.text || !data.roomId || !data.senderId) return;

    try {
      // 1. Сохраняем сообщение в базу
      const { rows } = await pool.query(
        'INSERT INTO chat_messages (room_id, sender_id, message_text) VALUES ($1, $2, $3) RETURNING *',
        [data.roomId, data.senderId, data.text]
      );
      
      const { rows: userRows } = await pool.query('SELECT full_name, username FROM users WHERE id = $1', [data.senderId]);
      const senderName = userRows[0] ? (userRows[0].full_name || userRows[0].username) : 'Пользователь';

      const msg = {
        ...rows[0],
        full_name: senderName,
        username: userRows[0] ? userRows[0].username : ''
      };

      // 2. Отправляем сообщение в комнату чата по WebSockets
      io.to(`room_${data.roomId}`).emit('new-message', msg);

      // 3. Если это личный диалог (1-на-1) — отправляем получателю Email и Колокольчик
      const { rows: roomRows } = await pool.query('SELECT type FROM chat_rooms WHERE id = $1', [data.roomId]);
      
      if (roomRows.length > 0 && roomRows[0].type === 'direct') {
        // Находим получателя (того, кто НЕ является отправителем)
        const { rows: recipients } = await pool.query(`
          SELECT u.id, u.email, u.full_name 
          FROM chat_members cm 
          JOIN users u ON u.id = cm.user_id 
          WHERE cm.room_id = $1 AND cm.user_id != $2
        `, [data.roomId, data.senderId]);

        recipients.forEach(recipient => {
          // А. Создаем уведомление в Колокольчик 🔔
          createNotification(
            recipient.id,
            `💬 Сообщение от ${senderName}`,
            data.text.slice(0, 90),
            'chat'
          );

          // Б. Отправляем Email (если у получателя указан адрес)
          if (recipient.email) {
            sendEmail({
              to: recipient.email,
              subject: `💬 Новое сообщение от ${senderName}`,
              html: `
                <div style="font-family: 'Golos Text', sans-serif, Arial; max-width: 500px; padding: 24px; background: #FFF4EE; border-radius: 12px; border: 1px solid #FFEDD5;">
                  <h3 style="color: #FF6200; margin-top: 0;">Новое сообщение от ${senderName}</h3>
                  <div style="font-size: 14px; color: #333; background: #ffffff; padding: 14px; border-radius: 8px; border: 1px solid #E4E4E7; margin: 12px 0;">
                    "${data.text}"
                  </div>
                  <br>
                  <a href="https://app.stockeasy.ru" style="display: inline-block; background: #FF6200; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Ответить в Stockeasy</a>
                </div>
              `
            });
          }
        });
      }
    } catch(e) { console.error('Socket message error:', e.message); }
  });
});



// ─── API: STATS ───────────────────────────────────────────────────────────────
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE archived = false')
    if (!rows.length) return res.json({ tasks:{total:0,done:0,pending:0,cancelled:0}, orders:{total:0,pending:0}, supply:{steps:6,completed:0,overdue:0}, revenue:{total:0,month:0} })
    res.json(computeStats(rows.map(rowToTask)))
  } catch(e) { res.status(500).json({ error: e.message }) }
})


app.get('/api/tasks/:id/payment-readiness', authenticateToken, async (req, res) => {
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

// Универсальная функция отправки писем через Resend
async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Stockeasy <robot@stockeasy.ru>',
        to: [to],
        subject: subject,
        html: html
      })
    });
    const data = await res.json();
    console.log('[Email Sent]:', data);
    return data;
  } catch (e) {
    console.error('[Email Error]:', e.message);
  }
}


// ─── API: TASKS ───────────────────────────────────────────────────────────────
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT * FROM tasks';
    let params = [];

    // Если зашел рабочий (worker), показываем только ЕГО задачи
    if (req.user.role === 'worker') {
      query += ' WHERE assignee = $1';
      params.push(req.user.fullName);
    }

    query += ' ORDER BY created_at';
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
app.post('/api/tasks', authenticateToken, async (req, res) => {
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
        id, region, address, work_type, amount, price_per_unit,
        in_order, fact, date_zayavki, deadline, tech_link, invoice_info, comment,
        status, priority, archived, stage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', 'medium', false, 'request')
    `, [
      cleanId, 
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
      t.comment || null
    ]);

    // Сразу после создания пробуем найти координаты в фоне
    runBackgroundGeocoding();

    res.json({ success: true, id: cleanId });
  } catch(e) { 
    console.error('POST task error:', e.message); 
    res.status(500).json({ error: e.message }); 
  }
});

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const d = req.body
    // --- УМНАЯ АВТОМАТИКА (Связка Этап <-> Статус) ---
    // Выполняем только если меняется либо этап, либо статус
    if (d.stage !== undefined || d.status !== undefined) {
      
      // 1. Авто-статус по этапу
      if (d.stage === 'payment' || d.stage === 'acceptance') {
        d.status = 'done'; 
        // Если уже был оплачен, не откатываем на "просто готово"
        if (d.status === 'paid') d.status = 'paid';
      }
      else if (d.stage === 'install' || d.stage === 'control' || d.stage === 'survey') {
        if (d.status === 'pending') d.status = 'progress';
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
      d.assignmentStatus || null
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
app.post('/api/tasks/:id/accept', authenticateToken, async (req, res) => {
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

app.post('/api/tasks/:id/decline', authenticateToken, async (req, res) => {
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

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ─── API: ВЛОЖЕНИЯ ЗАЯВКИ ────────────────────────────────────────────────────


// --- ИИ ПАРСЕР PDF ЗАЯВОК ---
app.post('/api/ai/parse-pdf', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  const filePath = req.file.path; // Куда multer сохранил файл
  // ИСПРАВЛЕННЫЙ ПУТЬ: /opt/venv/bin/python3
  const pythonCommand = process.platform === 'win32' ? 'py' : 'python3';

  const python = spawn(pythonCommand, [path.join(__dirname, 'ai_parser.py'), filePath]);
  
  let result = '';
  let errorOutput = '';

  // ЗАЩИТА ОТ КРАША СЕРВЕРА
  python.on('error', (err) => {
    console.error('Не удалось запустить ai_parser.py:', err);
    fs.unlink(filePath, () => {}); // удаляем файл
    if (!res.headersSent) res.status(500).json({ error: `Ошибка запуска Питона: ${err.message}` });
  });

  python.stdout.on('data', (data) => { result += data.toString(); });
  python.stderr.on('data', (data) => { errorOutput += data.toString(); });

  python.on('close', (code) => {
    fs.unlink(filePath, () => {}); // удаляем временный файл

    if (code !== 0) {
      console.error('AI Parser Error:', errorOutput);
      if (!res.headersSent) res.status(500).json({ error: `Сбой Python (код ${code}): ${errorOutput}` });
      return;
    }

    try {
      // БРОНЕЖИЛЕТ ДЛЯ JSON: отрезаем любые Warning'и от Питона
      const jsonStart = result.indexOf('{');
      const jsonEnd = result.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('JSON не найден в ответе');
      }
      
      const cleanJson = result.substring(jsonStart, jsonEnd + 1);
      const parsedData = JSON.parse(cleanJson);
      
      if (parsedData.error) return res.status(400).json({ error: parsedData.error });
      
      if (!res.headersSent) res.json(parsedData);
    } catch (e) {
      console.error('AI Parser JSON Error:', result);
      if (!res.headersSent) res.status(500).json({ error: 'Нейросеть вернула невалидный ответ' });
    }
  });
});

// Хелпер: может ли этот пользователь трогать вложения этой заявки
async function canAccessTaskAttachments(user, taskId) {
  if (user.role === 'admin') return true
  const { rows } = await pool.query('SELECT assignee FROM tasks WHERE id = $1', [taskId])
  if (!rows[0]) return false
  return rows[0].assignee === user.fullName
}

app.get('/api/tasks/:id/attachments', authenticateToken, async (req, res) => {
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

app.post('/api/tasks/:id/attachments', authenticateToken, uploadAttachment.array('files', 10), async (req, res) => {
  try {
    if (!(await canAccessTaskAttachments(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Нет доступа к этой заявке' })
    }
    const type = req.body.type
    if (!['photo_report', 'scheme', 'act', 'receipt', 'pi_excel'].includes(type)) {
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

app.get('/api/attachments/:attachmentId/file', authenticateToken, async (req, res) => {
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

app.delete('/api/attachments/:attachmentId', authenticateToken, async (req, res) => {
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
app.get('/api/tasks/:id/ports', authenticateToken, async (req, res) => {
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

app.post('/api/tasks/:id/ports', authenticateToken, async (req, res) => {
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

app.put('/api/ports/:rowId', authenticateToken, async (req, res) => {
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

app.delete('/api/ports/:rowId', authenticateToken, async (req, res) => {
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

// ─── API: CHAINS ──────────────────────────────────────────────────────────────
app.get('/api/chains', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE archived = false')
    if (!rows.length) return res.json([])
    res.json(buildChainsFromRows(rows.map(rowToTask)))
  } catch(e) { res.status(500).json({ error: e.message }) }
})
app.put('/api/chains/:id', authenticateToken, (req, res) => res.json({ success: true }))

// ─── API: IMPORT META ─────────────────────────────────────────────────────────
app.get('/api/import-info', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM import_meta WHERE id=1')
    const m = rows[0] || {}
    res.json({ importedFrom: m.imported_from||null, importedAt: m.imported_at||null, rowCount: m.row_count||0 })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ─── API: IMPORT ROWS (батчи от браузера) ────────────────────────────────────
app.post('/api/excel/import-rows', async (req, res) => {
  try {
    let { rows: newBatch, name, isFirst, totalRows } = req.body
    newBatch = await runPythonCleaner(newBatch);
    if (!Array.isArray(newBatch)) return res.status(400).json({ error: 'rows must be array' })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      
      
      const batchIds = newBatch.map(t => t.id);
      const { rows: existingRows } = await client.query('SELECT id, geo_lat FROM tasks WHERE id = ANY($1)', [batchIds]);
      const geoMap = new Map(existingRows.map(r => [r.id, r.geo_lat]));


      // Upsert каждой заявки из батча
      // Молниеносная вставка каждой заявки из батча
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
          t.stage || getInitialStage(t.status),
          JSON.stringify(t.rawData || {})
        ]);
      }

      // Последний батч — обновляем метаданные
      const isDone = req.body.isLast === true || !totalRows || (newBatch.length < 500)
      if (isDone && name) {
        const { rows: cnt } = await client.query('SELECT COUNT(*) FROM tasks WHERE archived=false')
        await client.query(`
          UPDATE import_meta SET imported_from=$1, imported_at=NOW(), row_count=$2 WHERE id=1
        `, [name, Number(cnt[0].count)]);
        runBackgroundGeocoding();
      }

      await client.query('COMMIT')
      res.json({ success: true, done: isDone })
    } catch(e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  } catch(e) {
    console.error('import-rows error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ─── API: MARCHES ─────────────────────────────────────────────────────────────
app.get('/api/marches', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM marches ORDER BY created_at')
    res.json(rows.map(r => ({
      id: r.id, name: r.name, baseCity: r.base_city,
      kmRate: Number(r.km_rate), points: r.points || [], createdAt: r.created_at
    })))
  } catch(e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/marches', async (req, res) => {
  try {
    const id = 'march_' + Date.now()
    const { rows } = await pool.query(
      `INSERT INTO marches (id, name, base_city, km_rate) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, req.body.name||'Новый маршрут', req.body.baseCity||'', Number(req.body.kmRate)||70]
    )
    const r = rows[0]
    res.json({ id: r.id, name: r.name, baseCity: r.base_city, kmRate: Number(r.km_rate), points: [], createdAt: r.created_at })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/marches/:id', authenticateToken, async (req, res) => {
  try {
    const d = req.body
    await pool.query(`
      UPDATE marches SET
        name      = COALESCE($2, name),
        base_city = COALESCE($3, base_city),
        km_rate   = COALESCE($4::numeric, km_rate),
        points    = COALESCE($5::jsonb, points)
      WHERE id = $1
    `, [req.params.id, d.name||null, d.baseCity||null, d.kmRate ? Number(d.kmRate) : null,
        d.points !== undefined ? JSON.stringify(d.points) : null])
    res.json({ success: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/marches/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM marches WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ─── API: ГЕОКОДИРОВАНИЕ ──────────────────────────────────────────────────────
app.get('/api/geocode', authenticateToken, async (req, res) => {
  const q = req.query.q
  if (!q) return res.json([])
  res.setHeader('Cache-Control', 'no-store')
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&accept-language=ru&q=${encodeURIComponent(q)}`
    const r = await fetch(url, { headers: { 'User-Agent': 'Stockeasy/1.0 (internal logistics app)', 'Accept-Language': 'ru' } })
    res.json(await r.json())
  } catch(e) { res.json([]) }
})

// ─── API: OSRM МАРШРУТ ───────────────────────────────────────────────────────
app.get('/api/route', authenticateToken, async (req, res) => {
  const coords = req.query.coords
  if (!coords) return res.status(400).json({ error: 'coords required' })
  res.setHeader('Cache-Control', 'no-store')
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`
    const r = await fetch(url, { headers: { 'User-Agent': 'Stockeasy/1.0' } })
    const data = await r.json()
    if (!data.routes?.[0]) return res.json({ error: 'no route' })
    const route = data.routes[0]
    res.json({ distance_km: Math.round(route.distance/100)/10, duration_min: Math.round(route.duration/60), geometry: route.geometry })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ─── EXPORT DOCUMENTS ────────────────────────────────────────────────────────
function calcPricePerPort(ports) { return ports >= 3 ? 3750 : ports === 2 ? 4250 : 5000 }
function calcTransport(km) {
  if (!km || km <= 0) return 0
  if (km > 200) return km*2*35
  if (km > 100) return km*2*30
  if (km > 50)  return km*2*25
  if (km > 10)  return km*2*15
  return 0
}
function calcTotal(ports, km) { return calcTransport(km) + calcPricePerPort(ports)*ports }
function fmtDate(d) {
  if (!d) return new Date().toLocaleDateString('ru-RU')
  try { return new Date(d).toLocaleDateString('ru-RU') } catch { return String(d) }
}
function numToWords(n) {
  if (!n) return 'Ноль рублей 00 копеек.'
  n = Math.round(n)
  const e1f=['','одна','две','три','четыре','пять','шесть','семь','восемь','девять']
  const e1m=['','один','два','три','четыре','пять','шесть','семь','восемь','девять']
  const e2=['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать']
  const e3=['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто']
  const e4=['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот']
  function morph(n,one,two,five){ if(n%100>=11&&n%100<=19)return five; if(n%10===1)return one; if(n%10>=2&&n%10<=4)return two; return five }
  function block(n,fem){ const arr=fem?e1f:e1m; let r=''; const h=Math.floor(n/100); if(h)r+=e4[h]+' '; const t=Math.floor((n%100)/10),u=n%10; if(t===1)return r+e2[u]+' '; if(t)r+=e3[t]+' '; if(u)r+=arr[u]+' '; return r }
  const m=Math.floor(n/1000000),th=Math.floor((n%1000000)/1000),r=n%1000
  let res=''
  if(m) res+=block(m,false)+morph(m,'миллион','миллиона','миллионов')+' '
  if(th)res+=block(th,true)+morph(th,'тысяча','тысячи','тысяч')+' '
  if(r) res+=block(r,false)
  res=res.trim()
  return res.charAt(0).toUpperCase()+res.slice(1)+' рублей  00 копеек.'
}

function buildApp2(task) {
  const wb=XLSX.utils.book_new(),ports=task.fact||task.inOrder||0,km=Number(task.distanceKm)||0
  const ppp=calcPricePerPort(ports),tr=calcTransport(km),total=calcTotal(ports,km)
  const data=[
    ['Приложение №2'],['к Договору № _____ от "__" _______ 202_г.'],['Заявка на выполнение работ'],
    ['исполнитель работ',task.assignee||task.contractor||'—'],['дата распределения',task.distributedAt||fmtDate()],
    ['куратор от Заказчика',task.manager||'—'],['1. Содержание заявки, контактная и техническая информация, сроки выполнения'],
    ['Регион (договор)',task.region||'—'],['Номер заявки',task.id],['Дата заявки',task.deadline||'—'],
    ['Срок выполнения',task.deadline||'—'],['Кол-во дней просрочки',task.overdueDays||0],
    ['Адрес выполнения работ',task.address||'—'],['Контакт / сопровождающий',task.contact||task.contractor||'—'],
    ['ТИП РАБОТ',task.workType||'—'],['Ссылка на Тех.Информацию',task.techLink||'—'],
    ['Количество портов'],['В заказе',task.inOrder||0],['Фактически',task.fact||0],
    ['Комментарий',task.comment||''],['2. Стоимость работ и транспортные расходы'],
    ['Удалённость, км',km],['Стоимость за ед., руб.',ppp],['Транспортные расходы, руб.',tr],['Общая стоимость, руб.',total],[],
    ['От Заказчика','','','Директор __________________ /И.О. Городович/'],
    ['От Подрядчика','','','гр. РФ _________________ / ___________________ /'],
  ]
  const ws=XLSX.utils.aoa_to_sheet(data); ws['!cols']=[{wch:28},{wch:52},{wch:8},{wch:20}]
  XLSX.utils.book_append_sheet(wb,ws,'Приложение №2'); return wb
}

function buildInvoice(task) {
  const wb=XLSX.utils.book_new(),ports=task.fact||task.inOrder||0,km=Number(task.distanceKm)||0
  const ppp=calcPricePerPort(ports),tr=calcTransport(km),total=calcTotal(ports,km)
  const desc=`Работы по заявке ${task.id} ${task.address||''} ${task.workType||''}, цена ${ppp} рублей, ${tr} руб. компенсация транспортных расходов.`
  const data=[
    ['Подрядчик','','Заказчик'],[task.contractor||task.assignee||'—','','ПАО Сбербанк России'],
    [],[],[],[],[],
    ['Счёт на оплату №',task.id,'от',fmtDate(task.deadline)],
    ['№','Товары и услуги','Кол-во','Цена, руб.','Сумма, руб.'],[1,desc,1,total,total],
    ['Всего наименований 1 на сумму','',total,'',''],[numToWords(total)],[],[],
    ['От Подрядчика','','','','гр. РФ _________________ / ___________________ /'],
  ]
  const ws=XLSX.utils.aoa_to_sheet(data); ws['!cols']=[{wch:5},{wch:70},{wch:8},{wch:14},{wch:14}]
  XLSX.utils.book_append_sheet(wb,ws,'Счёт'); return wb
}

function buildAct(task) {
  const wb=XLSX.utils.book_new(),ports=task.fact||task.inOrder||0,km=Number(task.distanceKm)||0
  const ppp=calcPricePerPort(ports),tr=calcTransport(km),total=calcTotal(ports,km)
  const desc=`Работы по заявке ${task.id} ${task.address||''} ${task.workType||''}, цена ${ppp} рублей, ${tr} руб. компенсация транспортных расходов.`
  const actRows=[
    [`АКТ № ${task.id}`,'','','от',fmtDate(task.deadline)],['','приёмки выполненных работ'],
    ['','к Договору № _____ от "__" _______ 202_г.'],['Заказчик'],['','ПАО Сбербанк России'],
    ['Исполнитель'],['',task.contractor||task.assignee||'—'],
    ['Основание',`Договор №_____  от ${fmtDate(task.deadline)}`],[],
    ['№','Товары и услуги','Кол-во','Цена, руб.','Сумма, руб.'],[1,desc,1,total,total],
    ['Всего наименований 1 на сумму','',total],[numToWords(total)],[],
    ['От Заказчика','','','','Директор __________________ /И.О. Городович/'],
    ['От Подрядчика','','','','гр. РФ _________________ / ___________________ /'],[],[],
  ]
  const data=[...actRows,['─────────────────────── линия отреза ───────────────────────'],[],[...actRows]]
  const ws=XLSX.utils.aoa_to_sheet(data); ws['!cols']=[{wch:12},{wch:60},{wch:8},{wch:14},{wch:14}]
  XLSX.utils.book_append_sheet(wb,ws,'АКТ'); return wb
}

app.get('/api/export/:type/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Заявка не найдена' })
    const task = rowToTask(rows[0])
    const type = req.params.type
    let wb, suffix
    if (type==='invoice'){ wb=buildInvoice(task); suffix='_Счёт' }
    else if(type==='act'){ wb=buildAct(task);     suffix='_Акт' }
    else                 { wb=buildApp2(task);    suffix='_Приложение_2' }
    const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'})
    const filename=(task.id+suffix+'.xlsx').replace(/\//g,'-')
    res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(filename))
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.send(buf)
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// Получить все версии счетов/актов по заявке
app.get('/api/tasks/:id/invoices', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM invoices WHERE task_id = $1 ORDER BY doc_type, version DESC',
      [req.params.id]
    )
    res.json(rows)
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// Выпустить новую версию счёта или акта (замораживает текущие данные заявки)
app.post('/api/tasks/:id/invoices', authenticateToken, async (req, res) => {
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
app.put('/api/invoices/:invId', authenticateToken, async (req, res) => {
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

app.get('/api/export/:id', authenticateToken, (req, res) => res.redirect('/api/export/app2/'+req.params.id))

// ─── СТАРЫЕ ЭНДПОИНТЫ (для совместимости) ───────────────────────────────────
app.get('/api/files', authenticateToken, (req, res) => res.json([]))
app.post('/api/excel/upload', authenticateToken, (req, res) => res.json({ success: false, error: 'Use /api/excel/import-rows' }))
app.get('/api/excel/:filename', authenticateToken, (req, res) => res.status(404).json({ error: 'not found' }))

// ─── СТАРТ ───────────────────────────────────────────────────────────────────
initDB().then(() => {
  server.listen(PORT, () => console.log(`Stockeasy: http://localhost:${PORT}`))
}).catch(err => {
  console.error('DB init failed:', err)
  process.exit(1)
})