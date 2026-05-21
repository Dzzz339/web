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
app.use(express.json({ limit: '200mb' }))
app.use(express.urlencoded({ limit: '200mb', extended: true }))
app.use(express.static(ROOT))

app.get('/', async (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'))
})



// Создаём таблицу при старте, если её нет
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appdata (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL
    )
  `)
  // Вставляем пустую запись если таблица только создана
  await pool.query(`
    INSERT INTO appdata (id, data) 
    VALUES (1, '{"rows":[],"importedFrom":null,"importedAt":null}')
    ON CONFLICT (id) DO NOTHING
  `)
}

async function readDB() {
  const res = await pool.query('SELECT data FROM appdata WHERE id = 1')
  return res.rows[0].data
}

async function writeDB(data) {
  await pool.query(
    'UPDATE appdata SET data = $1 WHERE id = 1',
    [JSON.stringify(data)]
  )
}

// Определяем начальный этап заявки на основе статуса из Excel
function getInitialStage(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'done') return 'payment';
  if (s === 'cancelled') return null;
  return 'install'; // По умолчанию для всех новых или "в работе"
}

// ---------- Парсинг Сводных таблиц — динамический, без хардкода ----------
function parseSvodnye(workbook) {
  const sheetNames = workbook.SheetNames.filter(n => n.startsWith('Заявки'))
  const allRows = []

  // Нормализуем ключ колонки: убираем лишние пробелы, приводим к нижнему регистру
  function normKey(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
  }

  // Ищем колонку по нескольким возможным названиям
  function findCol(row, ...variants) {
    for (const v of variants) {
      const nv = normKey(v)
      for (const [k, val] of Object.entries(row)) {
        if (normKey(k) === nv && val !== null && val !== undefined && String(val).trim() !== '') {
          return val
        }
      }
    }
    return null
  }

  function strVal(v) {
    if (v === null || v === undefined) return ''
    return String(v).replace(/\n/g, ' ').trim()
  }

  function parseDate(v) {
    if (!v) return null
    if (v instanceof Date) return v.toISOString().split('T')[0]
    if (typeof v === 'number') {
      const d = XLSX.SSF.parse_date_code(v)
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
    }
    const s = String(v).split(' ')[0]
    return s || null
  }

  function parseNum(v) {
    if (v === null || v === undefined) return 0
    if (typeof v === 'number') return v
    const s = String(v).replace(/\s/g, '').replace(',', '.')
    if (s.startsWith('=')) return 0 // формула — пропускаем
    return parseFloat(s) || 0
  }

  for (const name of sheetNames) {
    const ws = workbook.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null })

    for (const row of rows) {
      const num = strVal(findCol(row, 'Номер', 'номер')).trim()
      if (!num) continue

      // Статус
      const rawStatus = strVal(findCol(row, 'Статус', 'статус')).toLowerCase()
      let status = 'progress'
      if (rawStatus.includes('готов')) status = 'done'
      else if (rawStatus.includes('отмен') || rawStatus.includes('стоп')) status = 'cancelled'

      // Просрочка и приоритет
      const overdue = parseNum(findCol(row, 'Кол-во дней просрочки', 'дней просрочки', 'просрочка'))
      let priority = 'low'
      if (overdue > 30) priority = 'high'
      else if (overdue > 0) priority = 'medium'

      // Сумма — либо прямо из колонки, либо считаем
      let amount = parseNum(findCol(row, 'Сумма договора', 'Сумма договора '))
      if (!amount) {
        const dist = parseNum(findCol(row, ' Удаленность', 'Удаленность', 'Удалённость'))
        const ppu  = parseNum(findCol(row, 'Стоимость за ед.', 'Стоимость за ед'))
        const fact = parseNum(findCol(row, 'Факт'))
        if (ppu && fact) amount = dist + ppu * fact
      }

      // Удалённость — может быть в метрах (большие числа > 1000) или км
      const rawDist = parseNum(findCol(row, ' Удаленность', 'Удаленность', 'Удалённость'))
      const distanceKm = rawDist > 1000 ? Math.round(rawDist / 1000) : rawDist

      // Регион — берём до первого пробела/запятой/переноса
      const rawRegion = strVal(findCol(row, 'Регион'))
      const region = rawRegion.split(/[\s,\n]/)[0].trim()

      // Собираем ВСЕ оставшиеся колонки в rawFields — для полноты
      const rawFields = {}
      for (const [k, v] of Object.entries(row)) {
        const nk = normKey(k)
        if (nk && nk !== ' ' && v !== null && v !== undefined) {
          rawFields[k.trim()] = strVal(v)
        }
      }

      allRows.push({
        id:           num,
        title:        num + (findCol(row,'Адрес') ? ' — ' + strVal(findCol(row,'Адрес')).slice(0,80) : ''),
        sheet:        name,

        // Основные поля из Excel
        region,
        address:      strVal(findCol(row, 'Адрес')),
        workType:     strVal(findCol(row, 'ТИП РАБОТ', 'ТИП РАБОТ ', 'тип работ')),
        tipObj:       strVal(findCol(row, 'ТИП', 'Тип объекта')),  // тип объекта (ОТДЕЛЕНИЕ/КИЦ/...)
        gosb:         strVal(findCol(row, '№ ГОСБ', 'ГОСБ')),
        vsp:          strVal(findCol(row, '№ВСП', '№ ВСП', 'ВСП')),

        // Даты
        dateZayavki:  parseDate(findCol(row, 'Дата заявки')),
        deadline:     parseDate(findCol(row, 'Дата окончания работ')),

        // Люди
        manager:      strVal(findCol(row, 'Менеджер Сбера', 'Менеджер Сбера ')),
        contact:      strVal(findCol(row, 'Контакт')),             // физлицо на объекте
        contractor:   strVal(findCol(row, 'Подрядчик, контакты', 'Подрядчик, контакты ', 'Подрядчик')),

        // Работы
        inOrder:      parseNum(findCol(row, 'В заказе')),
        fact:         parseNum(findCol(row, 'Факт')),
        obsledovanie: strVal(findCol(row, 'Обследование')),
        dostup:       strVal(findCol(row, 'Доступ')),
        dataVyhoda:   parseDate(findCol(row, 'Дата выхода')),
        priemka:      strVal(findCol(row, 'Приемка(фото),отпрвленно пректировщикам', 'Приёмка', 'Приемка')),
        oplata:       strVal(findCol(row, 'Оплата подрядчику', 'Оплата')),
        idStatus:     strVal(findCol(row, 'ИД', 'ИД ')),          // статус ИД (ГОТОВА и т.п.)

        // Финансы
        amount,
        distanceKm,
        pricePerUnit: parseNum(findCol(row, 'Стоимость за ед.', 'Стоимость за ед')),

        // Ссылки и документы
        techLink:     strVal(findCol(row, 'Ссылка на Тех.Информацию', 'Ссылка на Тех.Информацию ')),
        edoNumber:    strVal(findCol(row, '№ докумета в ЭДО', '№ документа в ЭДО', '№ докумета в ЭДО ')),
        invoiceInfo:  strVal(findCol(row, '№ счета/сумма', '№ счета/сумма ')),
        vedoStatus:   strVal(findCol(row, 'В ЭДО')),
        excelComment: strVal(findCol(row, 'Комментарий')),

        // Системные
        status, priority, overdueDays: overdue,
      })
    }
  }
  return allRows
}

function buildChainsFromRows(rows) {
  const byRegion = {}
  for (const r of rows) {
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
      totalAmount: items.reduce((s,i) => s + (i.amount||0), 0)
    }
  }).sort((a,b) => b.totalTasks - a.totalTasks)
}

function computeStats(rows) {
  const total = rows.length
  const done = rows.filter(r => r.status === 'done').length
  const cancelled = rows.filter(r => r.status === 'cancelled').length
  const overdue = rows.filter(r => r.overdueDays > 0).length
  const revenue = rows.reduce((s,r) => s + (r.amount||0), 0)
  return {
    tasks: { total, done, pending: total-done-cancelled, cancelled },
    orders: { total, pending: total-done-cancelled, done },
    supply: { steps: 6, completed: done, overdue },
    revenue: { total: revenue, month: revenue }
  }
}

// ---------- API ----------
app.get('/api/stats', async (req, res) => {
  const db = await readDB()
  if (db.rows && db.rows.length > 0) return res.json(computeStats(db.rows))
  res.json({ tasks:{total:0,done:0,pending:0,cancelled:0}, orders:{total:0,pending:0}, supply:{steps:6,completed:0,overdue:0}, revenue:{total:0,month:0} })
})

app.get('/api/tasks', async (req, res) => { const db = await readDB(); res.json(db.rows || []) })
app.post('/api/tasks', async (req, res) => {
  const db = await readDB(); if (!db.rows) db.rows = []
  const task = { id: 'manual_'+Date.now(), ...req.body, status: req.body.status||'pending' }
  db.rows.push(task); await writeDB(db); res.json(task)
})
app.put('/api/tasks/:id', async (req, res) => {
  const db = await readDB(); const arr = db.rows||[]
  const idx = arr.findIndex(t => String(t.id)===req.params.id)
  if (idx !== -1) arr[idx] = {...arr[idx], ...req.body}
  db.rows = arr; await writeDB(db); res.json({success:true})
})
app.delete('/api/tasks/:id', async (req, res) => {
  const db = await readDB(); db.rows = (db.rows||[]).filter(t => String(t.id)!==req.params.id)
  await writeDB(db); res.json({success:true})
})

app.get('/api/chains', async (req, res) => {
  const db = await readDB()
  if (db.rows && db.rows.length > 0) return res.json(buildChainsFromRows(db.rows))
  res.json([])
})
app.put('/api/chains/:id', async (req, res) => res.json({success:true}))

app.get('/api/import-info', async (req, res) => {
  const db = await readDB()
  res.json({ importedFrom: db.importedFrom||null, importedAt: db.importedAt||null, rowCount: (db.rows||[]).length })
})

app.get('/api/files', async (req, res) => {
  const dir = path.join(ROOT, 'uploads')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true})
  res.json(fs.readdirSync(dir).filter(f => f.endsWith('.xlsx')||f.endsWith('.xls')))
})

app.get('/api/excel/:filename', async (req, res) => {
  try {
    const filePath = path.join(ROOT, 'uploads', req.params.filename)
    if (!fs.existsSync(filePath)) return res.status(404).json({error:'File not found'})
    const workbook = XLSX.readFile(filePath, {cellDates:true})
    const sheets = {}
    workbook.SheetNames.forEach(name => { sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], {header:1,defval:null}) })
    res.json({name: req.params.filename, sheets})
  } catch(e) { res.status(500).json({error:e.message}) }
})

app.post('/api/excel/upload', async (req, res) => {
  try {
    const { file, name } = req.body
    const dir = path.join(ROOT, 'uploads')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true})
    const filePath = path.join(dir, name||'upload.xlsx')
    const buffer = Buffer.from(file, 'base64')
    fs.writeFileSync(filePath, buffer)
    console.log('Uploaded:', name, buffer.length, 'bytes')

    const workbook = XLSX.readFile(filePath, {cellDates:true, cellFormula:false, raw:false})
    if (isSvodnye) {
      const newRows = parseSvodnye(workbook) // Данные, которые только что распарсили из Excel
      const db = await readDB()
      const oldRows = db.rows || []

      // 1. Создаем карту старых данных для быстрого поиска по ID
      const oldMap = {}
      oldRows.forEach(row => {
        if (row.id) oldMap[row.id] = row
      })

      // 2. Поля, которые мы НЕ берем из Excel, а храним в своей БД (Editable)
      // contact, techLink, excelComment, edoNumber — теперь приходят из Excel, поэтому их нет в списке
      const EDITABLE = ['assignee', 'controller', 'comment', 'distributedAt', '_history', 'stage', 'archived']

      // 3. Формируем новый список (Мержим данные)
      const mergedRows = newRows.map(nr => {
        const old = oldMap[nr.id]
        if (old) {
          // Заявка уже была: берем новые данные из Excel, но накладываем поверх старые Editable-поля
          const merged = { ...nr }
          EDITABLE.forEach(field => {
            if (old[field] !== undefined) merged[field] = old[field]
          })
          merged.archived = false // Если пришла в новом файле — значит активна
          if (!merged.stage) merged.stage = getInitialStage(nr.status)
          return merged
        } else {
          // Совсем новая заявка: назначаем стадию и помечаем как не архивную
          return { 
            ...nr, 
            archived: false, 
            stage: getInitialStage(nr.status) 
          }
        }
      })

      // 4. Обработка пропавших заявок (Архивация)
      const newIds = new Set(newRows.map(r => r.id))
      oldRows.forEach(oldRow => {
        if (oldRow.id && !newIds.has(oldRow.id)) {
          // Этой заявки нет в новом файле — помечаем как архивную и добавляем в хвост
          // Если она уже была архивная, просто оставляем как есть
          if (!oldRow.archived) {
            mergedRows.push({ ...oldRow, archived: true })
          } else {
            mergedRows.push(oldRow)
          }
        }
      })

      // 5. Записываем обновленный массив в БД
      db.rows = mergedRows
      db.importedFrom = name
      db.importedAt = new Date().toISOString()
      await writeDB(db)

      console.log('Smart-imported:', newRows.length, 'new/updated,', mergedRows.length - newRows.length, 'archived')
      return res.json({success:true, name, autoImported:true, rowCount:newRows.length})
    }
    res.json({success:true, name, autoImported:false})
  } catch(e) { console.error('Upload error:', e.message); res.status(500).json({error:e.message}) }
})

// ─── EXPORT: Generate Приложение №2 xlsx (pure Node.js, no Python) ──────────

// ─── Helpers ─────────────────────────────────────────────────────────────────
// ─── Тарифная логика из шаблонов ББ-5376 ────────────────────────────────────
function calcPricePerPort(ports) {
  // =IF(B22>=3,3750,IF(B22=2,4250,5000))
  if (ports >= 3) return 3750
  if (ports === 2) return 4250
  return 5000
}
function calcTransport(km) {
  // =IF(B26>200,B26*2*35, IF(B26<=200,B26>100,B26*2*30, ...))
  if (!km || km <= 0) return 0
  if (km > 200) return km * 2 * 35
  if (km > 100) return km * 2 * 30
  if (km > 50)  return km * 2 * 25
  if (km > 10)  return km * 2 * 15
  return 0
}
function calcTotal(ports, km) {
  return calcTransport(km) + calcPricePerPort(ports) * ports
}
function fmtDate(d) {
  if (!d) return new Date().toLocaleDateString('ru-RU')
  try { return new Date(d).toLocaleDateString('ru-RU') } catch { return String(d) }
}
function numToWords(n) {
  if (!n) return 'Ноль рублей 00 копеек.'
  n = Math.round(n)
  const e1f = ['','одна','две','три','четыре','пять','шесть','семь','восемь','девять']
  const e1m = ['','один','два','три','четыре','пять','шесть','семь','восемь','девять']
  const e2  = ['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать']
  const e3  = ['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто']
  const e4  = ['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот']
  function morph(n, one, two, five) {
    if (n % 100 >= 11 && n % 100 <= 19) return five
    if (n % 10 === 1) return one
    if (n % 10 >= 2 && n % 10 <= 4) return two
    return five
  }
  function block(n, fem) {
    const arr = fem ? e1f : e1m
    let r = ''
    const h = Math.floor(n/100); if(h) r += e4[h]+' '
    const t = Math.floor((n%100)/10), u = n%10
    if (t===1) return r + e2[u] + ' '
    if (t) r += e3[t]+' '
    if (u) r += arr[u]+' '
    return r
  }
  const m  = Math.floor(n/1000000)
  const th = Math.floor((n%1000000)/1000)
  const r  = n%1000
  let res = ''
  if (m)  res += block(m,false)  + morph(m,'миллион','миллиона','миллионов') + ' '
  if (th) res += block(th,true)  + morph(th,'тысяча','тысячи','тысяч') + ' '
  if (r)  res += block(r,false)
  res = res.trim()
  return res.charAt(0).toUpperCase() + res.slice(1) + ' рублей  00 копеек.'
}

// ─── Построители документов по шаблону ББ-5376 ───────────────────────────────
function buildApp2(task) {
  const wb = XLSX.utils.book_new()
  const ports = task.fact || task.inOrder || 0
  const km    = Number(task.distanceKm) || 0
  const ppp   = calcPricePerPort(ports)
  const tr    = calcTransport(km)
  const total = calcTotal(ports, km)
  const data = [
    ['Приложение №2'],
    ['к Договору № _____ от "__" _______ 202_г.'],
    ['Заявка на выполнение работ'],
    ['исполнитель работ', task.assignee || task.contractor || '—'],
    ['дата распределения', task.distributedAt || fmtDate()],
    ['куратор от Заказчика', task.manager || '—'],
    ['1. Содержание заявки, контактная и техническая информация, сроки выполнения'],
    ['Регион (договор)', task.region || '—'],
    ['Номер заявки', task.id],
    ['Дата заявки', task.deadline || '—'],
    ['Срок выполнения', task.deadline || '—'],
    ['Кол-во дней просрочки', task.overdueDays || 0],
    ['Адрес выполнения работ', task.address || '—'],
    ['Контакт / сопровождающий', task.contact || task.contractor || '—'],
    ['ТИП РАБОТ', task.workType || '—'],
    ['Ссылка на Тех.Информацию', task.techLink || '—'],
    ['Количество портов'],
    ['В заказе', task.inOrder || 0],
    ['Фактически', task.fact || 0],
    ['Комментарий', task.comment || ''],
    ['2. Стоимость работ и транспортные расходы'],
    ['Удалённость, км', km],
    ['Стоимость за ед., руб.', ppp],
    ['Транспортные расходы, руб.', tr],
    ['Общая стоимость, руб.', total],
    [],
    ['От Заказчика', '', '', 'Директор __________________ /И.О. Городович/'],
    ['От Подрядчика', '', '', 'гр. РФ _________________ / ___________________ /'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{wch:28},{wch:52},{wch:8},{wch:20}]
  XLSX.utils.book_append_sheet(wb, ws, 'Приложение №2')
  return wb
}

function buildInvoice(task) {
  const wb = XLSX.utils.book_new()
  const ports = task.fact || task.inOrder || 0
  const km    = Number(task.distanceKm) || 0
  const ppp   = calcPricePerPort(ports)
  const tr    = calcTransport(km)
  const total = calcTotal(ports, km)
  const desc  = `Работы по заявке ${task.id} ${task.address||''} ${task.workType||''}, цена ${ppp} рублей, ${tr} руб. компенсация транспортных расходов.`
  const data = [
    ['Подрядчик', '', 'Заказчик'],
    [task.contractor || task.assignee || '—', '', 'ПАО Сбербанк России'],
    [],[], [],[], [],
    ['Счёт на оплату №', task.id, 'от', fmtDate(task.deadline)],
    ['№', 'Товары и услуги', 'Кол-во', 'Цена, руб.', 'Сумма, руб.'],
    [1, desc, 1, total, total],
    ['Всего наименований 1 на сумму', '', total, '', ''],
    [numToWords(total)],
    [],
    [],
    ['От Подрядчика', '', '', '', 'гр. РФ _________________ / ___________________ /'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{wch:5},{wch:70},{wch:8},{wch:14},{wch:14}]
  XLSX.utils.book_append_sheet(wb, ws, 'Счёт')
  return wb
}

function buildAct(task) {
  const wb = XLSX.utils.book_new()
  const ports = task.fact || task.inOrder || 0
  const km    = Number(task.distanceKm) || 0
  const ppp   = calcPricePerPort(ports)
  const tr    = calcTransport(km)
  const total = calcTotal(ports, km)
  const desc  = `Работы по заявке ${task.id} ${task.address||''} ${task.workType||''}, цена ${ppp} рублей, ${tr} руб. компенсация транспортных расходов.`
  const actRows = [
    [`АКТ № ${task.id}`, '', '', 'от', fmtDate(task.deadline)],
    ['', 'приёмки выполненных работ'],
    ['', 'к Договору № _____ от "__" _______ 202_г.'],
    ['Заказчик'], ['', 'ПАО Сбербанк России'],
    ['Исполнитель'], ['', task.contractor || task.assignee || '—'],
    ['Основание', `Договор №_____  от ${fmtDate(task.deadline)}`],
    [],
    ['№', 'Товары и услуги', 'Кол-во', 'Цена, руб.', 'Сумма, руб.'],
    [1, desc, 1, total, total],
    ['Всего наименований 1 на сумму', '', total],
    [numToWords(total)],
    [],
    ['От Заказчика', '', '', '', 'Директор __________________ /И.О. Городович/'],
    ['От Подрядчика', '', '', '', 'гр. РФ _________________ / ___________________ /'],
    [], [],
  ]
  const data = [
    ...actRows,
    ['─────────────────────── линия отреза ───────────────────────'],
    [],
    ...actRows,
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{wch:12},{wch:60},{wch:8},{wch:14},{wch:14}]
  XLSX.utils.book_append_sheet(wb, ws, 'АКТ')
  return wb
}

// ─── API экспорта документов ──────────────────────────────────────────────────
app.get('/api/export/:type/:id', async (req, res) => {
  try {
    const db   = await readDB()
    const task = (db.rows || []).find(r => String(r.id) === req.params.id)
    if (!task) return res.status(404).json({ error: 'Заявка не найдена' })
    const type = req.params.type
    let wb, suffix
    if (type === 'invoice') { wb = buildInvoice(task); suffix = '_Счёт' }
    else if (type === 'act'){ wb = buildAct(task);     suffix = '_Акт' }
    else                    { wb = buildApp2(task);    suffix = '_Приложение_2' }
    const buf      = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = (task.id + suffix + '.xlsx').replace(/\//g, '-')
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(filename))
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.send(buf)
  } catch(e) {
    console.error('Export error:', e)
    res.status(500).json({ error: e.message })
  }
})

// Обратная совместимость
app.get('/api/export/:id', async (req, res) => {
  res.redirect('/api/export/app2/' + req.params.id)
})

// ─── API: Марши ───────────────────────────────────────────────────────────────
app.get('/api/marches', async (req, res) => {
  const db = await readDB()
  res.json(db.marches || [])
})

app.post('/api/marches', async (req, res) => {
  const db = await readDB()
  if (!db.marches) db.marches = []
  const march = {
    id: 'march_' + Date.now(),
    name: req.body.name || 'Новый маршрут',
    baseCity: req.body.baseCity || '',
    kmRate: Number(req.body.kmRate) || 70,
    createdAt: new Date().toISOString(),
    points: []
  }
  db.marches.push(march)
  await writeDB(db)
  res.json(march)
})

app.put('/api/marches/:id', async (req, res) => {
  const db = await readDB()
  const arr = db.marches || []
  const idx = arr.findIndex(m => m.id === req.params.id)
  if (idx !== -1) arr[idx] = { ...arr[idx], ...req.body, id: arr[idx].id }
  db.marches = arr
  await writeDB(db)
  res.json({ success: true })
})

app.delete('/api/marches/:id', async (req, res) => {
  const db = await readDB()
  db.marches = (db.marches || []).filter(m => m.id !== req.params.id)
  await writeDB(db)
  res.json({ success: true })
})

// ─── API: Геокодирование (прокси через сервер — нужен User-Agent для Nominatim) ─
app.get('/api/geocode', async (req, res) => {
  const q = req.query.q
  if (!q) return res.json([])
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&accept-language=ru&q=${encodeURIComponent(q)}`
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Stockeasy/1.0 (internal logistics app)',
        'Accept-Language': 'ru'
      }
    })
    const data = await r.json()
    res.json(data)
  } catch (e) {
    console.error('Geocode error:', e.message)
    res.json([])
  }
})

// ─── API: OSRM — расстояние и маршрут по дорогам ─────────────────────────────
app.get('/api/route', async (req, res) => {
  const coords = req.query.coords
  if (!coords) return res.status(400).json({ error: 'coords required' })
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Stockeasy/1.0 (internal logistics app)' }
    })
    const data = await r.json()
    if (!data.routes || !data.routes[0]) return res.json({ error: 'no route' })
    const route = data.routes[0]
    res.json({
      distance_km: Math.round(route.distance / 100) / 10,
      duration_min: Math.round(route.duration / 60),
      geometry: route.geometry
    })
  } catch (e) {
    console.error('OSRM error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Stockeasy: http://localhost:${PORT}`)
  })
}).catch(err => {
  console.error('DB init failed:', err)
})