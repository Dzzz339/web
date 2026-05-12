import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const app = express()
const PORT = 3000
const DB_FILE = path.join(ROOT, 'db.json')

app.use(cors())
app.use(express.json({ limit: '200mb' }))
app.use(express.urlencoded({ limit: '200mb', extended: true }))
app.use(express.static(ROOT))

app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'))
})

function readDB() {
  if (!fs.existsSync(DB_FILE)) return { rows: [], importedFrom: null, importedAt: null }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
}
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)) }

// Определяем начальный этап заявки на основе статуса из Excel
function getInitialStage(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'done') return 'payment';
  if (s === 'cancelled') return null;
  return 'install'; // По умолчанию для всех новых или "в работе"
}

// ---------- Парсинг Сводных таблиц ----------
function parseSvodnye(workbook) {
  const sheetNames = workbook.SheetNames.filter(n => n.startsWith('Заявки'))
  const allRows = []
  for (const name of sheetNames) {
    const ws = workbook.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
    for (const row of rows) {
      const rawStatus = (row['Статус'] || '').toString().trim().toLowerCase()
      let status = 'progress'
      if (rawStatus.includes('готов')) status = 'done'
      else if (rawStatus.includes('отмен') || rawStatus.includes('стоп')) status = 'cancelled'

      const num = (row['Номер'] || '').toString().trim()
      if (!num) continue

      const overdue = parseFloat(row['Кол-во дней просрочки']) || 0
      let priority = 'low'
      if (overdue > 30) priority = 'high'
      else if (overdue > 0) priority = 'medium'

      const amount = parseFloat(row['Сумма договора '] || row['Сумма договора']) || 0

      let deadline = null
      const rawDeadline = row['Дата окончания работ']
      if (rawDeadline instanceof Date) deadline = rawDeadline.toISOString().split('T')[0]
      else if (typeof rawDeadline === 'number') {
        const d = XLSX.SSF.parse_date_code(rawDeadline)
        if (d) deadline = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
      } else if (rawDeadline) deadline = rawDeadline.toString()

      allRows.push({
        id: num,
        title: num + (row['Адрес'] ? ' — ' + row['Адрес'].toString().replace(/\n/g,' ').slice(0,80) : ''),
        region: (row['Регион'] || '').toString().replace(/\n/g,' ').split(' ')[0],
        address: (row['Адрес'] || '').toString().replace(/\n/g,' '),
        workType: (row['ТИП РАБОТ '] || row['ТИП РАБОТ'] || '').toString().trim(),
        contractor: (row['Подрядчик, контакты '] || row['Подрядчик, контакты'] || '').toString().trim(),
        manager: (row['Менеджер Сбера'] || '').toString().trim(),
        status, priority, deadline, overdueDays: overdue,
        amount, inOrder: parseFloat(row['В заказе']) || 0,
        fact: parseFloat(row['Факт']) || 0, sheet: name
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
app.get('/api/stats', (req, res) => {
  const db = readDB()
  if (db.rows && db.rows.length > 0) return res.json(computeStats(db.rows))
  res.json({ tasks:{total:0,done:0,pending:0,cancelled:0}, orders:{total:0,pending:0}, supply:{steps:6,completed:0,overdue:0}, revenue:{total:0,month:0} })
})

app.get('/api/tasks', (req, res) => { const db = readDB(); res.json(db.rows || []) })
app.post('/api/tasks', (req, res) => {
  const db = readDB(); if (!db.rows) db.rows = []
  const task = { id: 'manual_'+Date.now(), ...req.body, status: req.body.status||'pending' }
  db.rows.push(task); writeDB(db); res.json(task)
})
app.put('/api/tasks/:id', (req, res) => {
  const db = readDB(); const arr = db.rows||[]
  const idx = arr.findIndex(t => String(t.id)===req.params.id)
  if (idx !== -1) arr[idx] = {...arr[idx], ...req.body}
  db.rows = arr; writeDB(db); res.json({success:true})
})
app.delete('/api/tasks/:id', (req, res) => {
  const db = readDB(); db.rows = (db.rows||[]).filter(t => String(t.id)!==req.params.id)
  writeDB(db); res.json({success:true})
})

app.get('/api/chains', (req, res) => {
  const db = readDB()
  if (db.rows && db.rows.length > 0) return res.json(buildChainsFromRows(db.rows))
  res.json([])
})
app.put('/api/chains/:id', (req, res) => res.json({success:true}))

app.get('/api/import-info', (req, res) => {
  const db = readDB()
  res.json({ importedFrom: db.importedFrom||null, importedAt: db.importedAt||null, rowCount: (db.rows||[]).length })
})

app.get('/api/files', (req, res) => {
  const dir = path.join(ROOT, 'uploads')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true})
  res.json(fs.readdirSync(dir).filter(f => f.endsWith('.xlsx')||f.endsWith('.xls')))
})

app.get('/api/excel/:filename', (req, res) => {
  try {
    const filePath = path.join(ROOT, 'uploads', req.params.filename)
    if (!fs.existsSync(filePath)) return res.status(404).json({error:'File not found'})
    const workbook = XLSX.readFile(filePath, {cellDates:true})
    const sheets = {}
    workbook.SheetNames.forEach(name => { sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], {header:1,defval:null}) })
    res.json({name: req.params.filename, sheets})
  } catch(e) { res.status(500).json({error:e.message}) }
})

app.post('/api/excel/upload', (req, res) => {
  try {
    const { file, name } = req.body
    const dir = path.join(ROOT, 'uploads')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true})
    const filePath = path.join(dir, name||'upload.xlsx')
    const buffer = Buffer.from(file, 'base64')
    fs.writeFileSync(filePath, buffer)
    console.log('Uploaded:', name, buffer.length, 'bytes')

    const workbook = XLSX.readFile(filePath, {cellDates:true})
    const isSvodnye = workbook.SheetNames.some(n => n.startsWith('Заявки'))
    if (isSvodnye) {
      const newRows = parseSvodnye(workbook) // Данные, которые только что распарсили из Excel
      const db = readDB()
      const oldRows = db.rows || []

      // 1. Создаем карту старых данных для быстрого поиска по ID
      const oldMap = {}
      oldRows.forEach(row => {
        if (row.id) oldMap[row.id] = row
      })

      // 2. Поля, которые мы НЕ берем из Excel, а храним в своей БД (Editable)
      const EDITABLE = ['assignee', 'controller', 'comment', 'contact', 'techLink', 'distributedAt', '_history', 'stage', 'archived']

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
      writeDB(db)

      console.log('Smart-imported:', newRows.length, 'new/updated,', mergedRows.length - newRows.length, 'archived')
      return res.json({success:true, name, autoImported:true, rowCount:newRows.length})
    }
    res.json({success:true, name, autoImported:false})
  } catch(e) { console.error('Upload error:', e.message); res.status(500).json({error:e.message}) }
})

// ─── EXPORT: Generate Приложение №2 xlsx (pure Node.js, no Python) ──────────

app.get('/api/export/:id', (req, res) => {
  try {
    const db = readDB()
    const task = (db.rows || []).find(r => String(r.id) === req.params.id)
    if (!task) return res.status(404).json({ error: 'Заявка не найдена' })

    const wb = XLSX.utils.book_new()

    const title = [
      ['Приложение №2'],
      ['к Договору'],
      [''],
      ['АКТ ПРИЁМКИ ВЫПОЛНЕННЫХ РАБОТ'],
      [''],
    ]
    const info = [
      ['Номер заявки',    task.id],
      ['Регион',          task.region     || '—'],
      ['Адрес объекта',   task.address    || '—'],
      ['Тип работ',       task.workType   || '—'],
      ['Подрядчик',       task.contractor || '—'],
      ['Менеджер',        task.manager    || '—'],
      ['Статус',          task.status === 'done' ? 'Выполнено' : task.status === 'cancelled' ? 'Отменено' : 'В работе'],
      ['Срок выполнения', task.deadline   || '—'],
      ['Дней просрочки',  task.overdueDays || 0],
      [''],
    ]
    const tableHeader = [['№ п/п', 'Наименование работ', 'Ед. изм.', 'В заказе', 'Факт', 'Сумма, руб.']]
    const tableRow    = [[1, task.workType || '—', 'шт.', task.inOrder || 0, task.fact || 0, task.amount || 0]]
    const tableFooter = [
      [''],
      ['', '', '', '', 'Итого:',        task.amount || 0],
      ['', '', '', '', 'НДС (20%):',    Math.round((task.amount || 0) * 0.2)],
      ['', '', '', '', 'Итого с НДС:',  Math.round((task.amount || 0) * 1.2)],
      [''],
    ]
    const signatures = [
      ['Сдал:', '', '', '', 'Принял:', ''],
      [''],
      ['(подпись)', '', '', '', '(подпись)', ''],
      [''],
      ['Дата: ________________', '', '', '', 'Дата: ________________', ''],
    ]

    const wsData = [...title, ...info, ...tableHeader, ...tableRow, ...tableFooter, ...signatures]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 14 }, { wch: 45 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }]

    XLSX.utils.book_append_sheet(wb, ws, 'Приложение №2')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = (task.id + '_Приложение_2.xlsx').replace(/\//g, '-')
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(filename))
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.send(buf)
  } catch (e) {
    console.error('Export error:', e)
    res.status(500).json({ error: e.message })
  }
})

app.listen(PORT, () => console.log(`Stockeasy: http://localhost:${PORT}`))