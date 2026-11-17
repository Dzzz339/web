import xlsxPkg from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const XLSX = xlsxPkg.default || xlsxPkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, '../templates/id_shablon_ultima.xlsx');

function clearCells(ws, range) {
  const decoded = XLSX.utils.decode_range(range);
  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
      if (!cell) continue;
      delete cell.v;
      delete cell.w;
      delete cell.t;
      delete cell.f;
    }
  }
}

function setCell(ws, address, value) {
  if (value === null || value === undefined || value === '') {
    clearCells(ws, address);
    return;
  }
  const previous = ws[address] || {};
  ws[address] = {
    ...previous,
    t: typeof value === 'number' ? 'n' : 's',
    v: value
  };
  delete ws[address].w;
  delete ws[address].f;
}

/**
 * Сервис генерации альбома ИД в формате Excel по стандарту ГОСТ (на базе эталона Ультима)
 */
export async function generateIdExcelAlbum(taskId, customPool = null) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error('Шаблон ИД не найден на сервере: ' + TEMPLATE_PATH);
  }

  const activePool = customPool || pool;

  // 1. Загрузка данных задачи
  const { rows: taskRows } = await activePool.query(`SELECT * FROM tasks WHERE id = $1`, [taskId]);
  if (taskRows.length === 0) {
    throw new Error(`Задача ${taskId} не найдена`);
  }
  const task = taskRows[0];

  // 2. Загрузка портов / линий КЖ
  const { rows: ports } = await activePool.query(`
    SELECT * FROM task_ports 
    WHERE task_id = $1 
    ORDER BY COALESCE(NULLIF(regexp_replace(port_number, '[^0-9]', '', 'g'), ''), '9999')::numeric, id ASC
  `, [taskId]);

  // 3. Загрузка спецификации материалов и оборудования ТМЦ
  const { rows: materials } = await activePool.query(`
    SELECT 
      tm.id,
      tm.pos_num,
      COALESCE(tm.item_name, m.name) AS name,
      tm.model,
      COALESCE(tm.article, m.code) AS code,
      tm.supplier,
      COALESCE(tm.unit, m.unit) AS unit,
      tm.fact_qty AS qty,
      COALESCE(tm.price, m.price_default) AS price,
      tm.mass_kg,
      tm.note,
      m.category
    FROM task_materials tm
    LEFT JOIN materials m ON tm.material_id = m.id
    WHERE tm.task_id = $1
    ORDER BY COALESCE(NULLIF(regexp_replace(tm.pos_num, '[^0-9.]', '', 'g'), ''), '9999')::numeric ASC NULLS LAST, tm.id ASC
  `, [taskId]);

  // 4. Открываем эталонную книгу
  const wb = XLSX.readFile(TEMPLATE_PATH, { cellStyles: true });

  const rawAddress = task.address || '';
  const customerName = ['—', '–', '-'].includes(String(task.customer || '').trim()) ? '' : (task.customer || '');
  const contractorName = task.contractor || '';
  const contractNumber = task.edo_number || task.subcontract_number || '';
  const contractDate = task.contract_date || '';
  const objectName = [customerName, rawAddress].filter(Boolean).join('\r\n');

  // ─── 1. ЛИСТ: ТИТУЛ ──────────────────────────────────────────────────────────
  if (wb.Sheets['Титул']) {
    const ws = wb.Sheets['Титул'];
    clearCells(ws, 'A2:C4');
    clearCells(ws, 'A6:C6');
    clearCells(ws, 'A19:C19');
    setCell(ws, 'A2', `Представитель Функционального заказчика:\r\n${customerName}\r\nпо адресу: ${rawAddress}\r\n(подпись, ФИО)\r\nм.п.`);
    setCell(ws, 'B2', `Представитель исполнителя:\r\n${contractorName}\r\n(подпись, ФИО)\r\nм.п.`);
    setCell(ws, 'A3', contractNumber || contractDate ? `Контракт / Заявка № ${contractNumber} от ${contractDate} на выполнение работ.` : '');
    setCell(ws, 'A4', task.work_type);
    setCell(ws, 'A6', objectName);
  }

  // ─── 2. ЛИСТ: КЖ (КАБЕЛЬНЫЙ ЖУРНАЛ) ──────────────────────────────────────────
  if (wb.Sheets['КЖ']) {
    const ws = wb.Sheets['КЖ'];
    const startRow = 6; // нулевой индекс (7-я строка в Excel)
    clearCells(ws, 'E6:AA31');
    for (const address of ['Q39', 'Q40', 'V36', 'V39', 'Y42']) clearCells(ws, address);

    ports.forEach((p, idx) => {
      const row = startRow + idx + 1;
      const cableLength = p.cable_length === null || p.cable_length === undefined || p.cable_length === '' ? null : Number(p.cable_length);
      setCell(ws, `E${row}`, idx + 1);
      setCell(ws, `F${row}`, p.room);
      setCell(ws, `G${row}`, '');
      setCell(ws, `H${row}`, p.marking);
      setCell(ws, `I${row}`, p.port_number);
      setCell(ws, `J${row}`, p.building);
      setCell(ws, `K${row}`, p.cabinet);
      setCell(ws, `L${row}`, p.patch_panel);
      setCell(ws, `M${row}`, p.port_number);
      setCell(ws, `N${row}`, p.cable_mark);
      setCell(ws, `O${row}`, Number.isFinite(cableLength) ? cableLength : null);
      setCell(ws, `P${row}`, p.testing_status);
    });
  }

  // ─── 3. ЛИСТ: СПЕКА1 (ОБОРУДОВАНИЕ) И СПЕКА2 (МАТЕРИАЛЫ) ───────────────────
  const equipItems = materials.filter(m => {
    const cat = (m.category || '').toLowerCase();
    const n = (m.name || '').toLowerCase();
    return cat.includes('оборудован') || n.includes('шкаф') || n.includes('коммутатор') || n.includes('маршрутизатор') || n.includes('камера') || n.includes('видеорегистратор') || n.includes('ибп') || n.includes('точка доступа') || n.includes('панель');
  });
  const cableItems = materials.filter(m => !equipItems.includes(m));

  if (wb.Sheets['Спека1']) {
    const ws = wb.Sheets['Спека1'];
    clearCells(ws, 'E6:T19');
    for (const address of ['J27', 'J28', 'O24', 'O27', 'S30']) clearCells(ws, address);
    equipItems.forEach((it, idx) => {
      const row = idx + 6;
      const qty = it.qty === null || it.qty === undefined || it.qty === '' ? null : Number(it.qty);
      const mass = it.mass_kg === null || it.mass_kg === undefined || it.mass_kg === '' ? null : Number(it.mass_kg);
      setCell(ws, `E${row}`, it.pos_num);
      setCell(ws, `F${row}`, it.name);
      setCell(ws, `G${row}`, it.model);
      setCell(ws, `H${row}`, it.code);
      setCell(ws, `L${row}`, it.supplier);
      setCell(ws, `P${row}`, it.unit);
      setCell(ws, `Q${row}`, Number.isFinite(qty) ? qty : null);
      setCell(ws, `R${row}`, Number.isFinite(mass) ? mass : null);
      setCell(ws, `T${row}`, it.note);
    });
  }

  if (wb.Sheets['Спека2']) {
    const ws = wb.Sheets['Спека2'];
    clearCells(ws, 'E6:T29');
    for (const address of ['J37', 'J38', 'O34', 'O37', 'S40']) clearCells(ws, address);
    cableItems.forEach((it, idx) => {
      const row = idx + 6;
      const qty = it.qty === null || it.qty === undefined || it.qty === '' ? null : Number(it.qty);
      const mass = it.mass_kg === null || it.mass_kg === undefined || it.mass_kg === '' ? null : Number(it.mass_kg);
      setCell(ws, `E${row}`, it.pos_num);
      setCell(ws, `F${row}`, it.name);
      setCell(ws, `G${row}`, it.model);
      setCell(ws, `H${row}`, it.code);
      setCell(ws, `L${row}`, it.supplier);
      setCell(ws, `P${row}`, it.unit);
      setCell(ws, `Q${row}`, Number.isFinite(qty) ? qty : null);
      setCell(ws, `R${row}`, Number.isFinite(mass) ? mass : null);
      setCell(ws, `T${row}`, it.note);
    });
  }

  // ─── 4. ЛИСТ: ПИ1 (ПРОТОКОЛ ИЗМЕРЕНИЙ FLUKE) ─────────────────────────────────
  if (wb.Sheets['ПИ1']) {
    const ws = wb.Sheets['ПИ1'];
    clearCells(ws, 'E4:L28');
    clearCells(ws, 'D30');
    setCell(ws, 'D2', `Объект: ${customerName}${rawAddress ? `, ${rawAddress}` : ''}`);

    ports.forEach((p, idx) => {
      const row = idx + 4;
      const cableLength = p.cable_length === null || p.cable_length === undefined || p.cable_length === '' ? null : Number(p.cable_length);
      setCell(ws, `E${row}`, idx + 1);
      setCell(ws, `F${row}`, [p.patch_panel, p.port_number].filter(value => value !== null && value !== undefined && value !== '').join(' / '));
      setCell(ws, `G${row}`, [p.room, p.outlet_marking || p.marking].filter(value => value !== null && value !== undefined && value !== '').join(', '));
      setCell(ws, `H${row}`, p.cable_mark);
      setCell(ws, `I${row}`, p.conductor_diameter);
      setCell(ws, `J${row}`, Number.isFinite(cableLength) ? cableLength : null);
      setCell(ws, `K${row}`, p.crimping);
      setCell(ws, `L${row}`, p.testing_status);
    });
  }

  // Остальные листы эталона содержат данные конкретного чужого объекта.
  for (const sheetName of ['Общие данные', 'ТехРешения', 'ЛВС']) {
    if (wb.Sheets[sheetName]) clearCells(wb.Sheets[sheetName], 'E2');
  }
  if (wb.Sheets['Расчет ИБП']) {
    const ws = wb.Sheets['Расчет ИБП'];
    clearCells(ws, 'E4:I6');
    clearCells(ws, 'E11:M15');
    clearCells(ws, 'M16:M17');
    clearCells(ws, 'E18');
  }
  if (wb.Sheets['КЖ-сумм']) clearCells(wb.Sheets['КЖ-сумм'], 'E7:Z19');
  if (wb.Sheets['ППСИ']) {
    const ws = wb.Sheets['ППСИ'];
    setCell(ws, 'A1', 'Протокол приёмо-сдаточных испытаний\r\nСформированной ИТ-инфраструктуры.');
    clearCells(ws, 'A30');
    clearCells(ws, 'A32:A33');
    clearCells(ws, 'C33');
  }
  if (wb.Sheets['ВСО']) clearCells(wb.Sheets['ВСО'], 'A4:D55');

  const stampCells = [
    ['Содержание', 'K31', 'K34', 'G34:G35', 'L37'],
    ['Общие данные', 'K11', 'K14', 'G14:G15', 'L17'],
    ['ТехРешения', 'K11', 'K14', 'G14:G15', 'L17'],
    ['ЛВС', 'K11', 'K14', 'G14:G15', 'L18'],
    ['СтруктСхема', 'L10', 'L13', 'H13:H14', 'M16'],
    ['Планировки', 'L10', 'L13', 'H13:H14', 'M16'],
    ['Схема ВТШ', 'L10', 'L13', 'H13:H14', 'M16'],
    ['Таблица соединений', 'L10', 'L13', 'H13:H14', 'M16'],
    ['Схема соединений', 'L10', 'L13', 'H13:H14', 'M16'],
    ['ПринцСхемаЭП', 'L10', 'L13', 'H13:H14', 'M16'],
    ['Схема ВЭС', 'K11', 'K14', 'G14:G15', 'L17'],
    ['Расчет ИБП', 'L23', 'L26', 'G26:G27', 'N29'],
    ['КЖ-сумм', 'U27', 'U30', 'P30:P31', 'X33']
  ];
  for (const [sheetName, projectCell, objectCell, authorRange, companyCell] of stampCells) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    setCell(ws, projectCell, task.work_type);
    setCell(ws, objectCell, objectName);
    clearCells(ws, authorRange);
    setCell(ws, companyCell, contractorName);
  }

  // Генерируем буфер книги Excel
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}
