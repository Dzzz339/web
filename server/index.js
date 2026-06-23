import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import pg from 'pg'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const app = express()
const PORT = process.env.PORT || 3000
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use(express.static(ROOT))

app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')))

// ─── ИНИЦИАЛИЗАЦИЯ БД ────────────────────────────────────────────────────────
async function initDB() {
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

  console.log('DB initialized')
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
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
    dateZayavki:  r.date_zayavki   ? String(r.date_zayavki).split('T')[0]   : null,
    deadline:     r.deadline       ? String(r.deadline).split('T')[0]       : null,
    currentDate:  r.date_vnesen   ? String(r.date_vnesen).split('T')[0]   : null,
    manager:      r.manager,
    contact:      r.contact,
    contractor:   r.contractor,
    inOrder:      Number(r.in_order)      || 0,
    fact:         Number(r.fact)          || 0,
    obsledovanie: r.obsledovanie,
    dostup:       r.dostup,
    dataVyhoda:   r.data_vyhoda  ? String(r.data_vyhoda).split('T')[0]  : null,
    priemka:      r.priemka,
    oplata:       r.oplata,
    idStatus:     r.id_status,
    amount:       Number(r.amount)        || 0,
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
    controller:   r.controller,
    comment:      r.comment,
    distributedAt: r.distributed_at ? String(r.distributed_at).split('T')[0] : null,
    _history:     r.history || [],
    rawData:      r.raw_data || {},
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

// ─── API: STATS ───────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE archived = false')
    if (!rows.length) return res.json({ tasks:{total:0,done:0,pending:0,cancelled:0}, orders:{total:0,pending:0}, supply:{steps:6,completed:0,overdue:0}, revenue:{total:0,month:0} })
    res.json(computeStats(rows.map(rowToTask)))
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ─── API: TASKS ───────────────────────────────────────────────────────────────
app.get('/api/tasks', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY created_at')
    res.json(rows.map(rowToTask))
  } catch(e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/tasks', async (req, res) => {
  try {
    const t = req.body
    const id = 'manual_' + Date.now()
    await pool.query(
      `INSERT INTO tasks (id, status, priority, comment, assignee) VALUES ($1,$2,$3,$4,$5)`,
      [id, t.status||'pending', t.priority||'medium', t.comment||t.title||'', t.assignee||'']
    )
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [id])
    res.json(rowToTask(rows[0]))
  } catch(e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const d = req.body
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
        assignee      = COALESCE($10, assignee),
        controller    = COALESCE($11, controller),
        comment       = COALESCE($12, comment),
        distributed_at = $13,
        contact       = COALESCE($14, contact),
        tech_link     = COALESCE($15, tech_link),
        fact          = COALESCE($16::integer, fact),
        overdue_days  = COALESCE($17::integer, overdue_days),
        contractor    = COALESCE($18, contractor),
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
      d.assignee    || null,
      d.controller  || null,
      d.comment     || null,
      safeDate(d.distributedAt),
      d.contact     || null,
      d.techLink    || null,
      d.fact        !== undefined ? Number(d.fact)        : null,
      d.overdueDays !== undefined ? Number(d.overdueDays) : null,
      d.contractor  || null,
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
    ])
    res.json({ success: true })
  } catch(e) { console.error('PUT task error:', e.message); res.status(500).json({ error: e.message }) }
})

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ─── API: CHAINS ──────────────────────────────────────────────────────────────
app.get('/api/chains', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE archived = false')
    if (!rows.length) return res.json([])
    res.json(buildChainsFromRows(rows.map(rowToTask)))
  } catch(e) { res.status(500).json({ error: e.message }) }
})
app.put('/api/chains/:id', (req, res) => res.json({ success: true }))

// ─── API: IMPORT META ─────────────────────────────────────────────────────────
app.get('/api/import-info', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM import_meta WHERE id=1')
    const m = rows[0] || {}
    res.json({ importedFrom: m.imported_from||null, importedAt: m.imported_at||null, rowCount: m.row_count||0 })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ─── API: IMPORT ROWS (батчи от браузера) ────────────────────────────────────
app.post('/api/excel/import-rows', async (req, res) => {
  try {
    const { rows: newBatch, name, isFirst, totalRows } = req.body
    if (!Array.isArray(newBatch)) return res.status(400).json({ error: 'rows must be array' })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      if (isFirst) {
        // Помечаем все существующие активные заявки как "кандидаты на архивацию"
        // через временную колонку — просто выставим archived=true всем,
        // а при вставке новых данных снимем флаг
        await client.query(`UPDATE tasks SET archived = true WHERE archived = false`)
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
            -- Данные из Excel — всегда обновляем
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
            in_order      = EXCLUDED.in_order,
            fact          = EXCLUDED.fact,
            obsledovanie  = EXCLUDED.obsledovanie,
            dostup        = EXCLUDED.dostup,
            data_vyhoda   = EXCLUDED.data_vyhoda,
            priemka       = EXCLUDED.priemka,
            oplata        = EXCLUDED.oplata,
            id_status     = EXCLUDED.id_status,
            amount        = EXCLUDED.amount,
            distance_km   = EXCLUDED.distance_km,
            price_per_unit= EXCLUDED.price_per_unit,
            tech_link     = EXCLUDED.tech_link,
            edo_number    = EXCLUDED.edo_number,
            invoice_info  = EXCLUDED.invoice_info,
            vedo_status   = EXCLUDED.vedo_status,
            excel_comment = EXCLUDED.excel_comment,
            status        = EXCLUDED.status,
            priority      = EXCLUDED.priority,
            overdue_days  = EXCLUDED.overdue_days,
            archived      = false,
            updated_at    = NOW(),
            raw_data      = EXCLUDED.raw_data,
            -- Пользовательские поля — не затираем
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
        ])
      }

      // Последний батч — обновляем метаданные
      const isDone = req.body.isLast === true || !totalRows || (newBatch.length < 500)
      if (isDone && name) {
        const { rows: cnt } = await client.query('SELECT COUNT(*) FROM tasks WHERE archived=false')
        await client.query(`
          UPDATE import_meta SET imported_from=$1, imported_at=NOW(), row_count=$2 WHERE id=1
        `, [name, Number(cnt[0].count)])
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
app.get('/api/marches', async (req, res) => {
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

app.put('/api/marches/:id', async (req, res) => {
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
app.get('/api/geocode', async (req, res) => {
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
app.get('/api/route', async (req, res) => {
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

app.get('/api/export/:type/:id', async (req, res) => {
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

app.get('/api/export/:id', (req, res) => res.redirect('/api/export/app2/'+req.params.id))

// ─── СТАРЫЕ ЭНДПОИНТЫ (для совместимости) ───────────────────────────────────
app.get('/api/files', (req, res) => res.json([]))
app.post('/api/excel/upload', (req, res) => res.json({ success: false, error: 'Use /api/excel/import-rows' }))
app.get('/api/excel/:filename', (req, res) => res.status(404).json({ error: 'not found' }))

// ─── СТАРТ ───────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`Stockeasy: http://localhost:${PORT}`))
}).catch(err => {
  console.error('DB init failed:', err)
  process.exit(1)
})