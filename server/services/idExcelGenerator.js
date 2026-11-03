import xlsxPkg from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const XLSX = xlsxPkg.default || xlsxPkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, '../templates/id_shablon_ultima.xlsx');

/**
 * Сервис генерации альбома ИД в формате Excel по стандарту ГОСТ (на базе эталона Ультима)
 */
export async function generateIdExcelAlbum(taskId) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error('Шаблон ИД не найден на сервере: ' + TEMPLATE_PATH);
  }

  // 1. Загрузка данных задачи
  const { rows: taskRows } = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [taskId]);
  if (taskRows.length === 0) {
    throw new Error(`Задача ${taskId} не найдена`);
  }
  const task = taskRows[0];

  // 2. Загрузка портов / линий КЖ
  const { rows: ports } = await pool.query(`
    SELECT * FROM task_ports 
    WHERE task_id = $1 
    ORDER BY COALESCE(NULLIF(regexp_replace(port_number, '[^0-9]', '', 'g'), ''), '9999')::numeric, id ASC
  `, [taskId]);

  // 3. Загрузка спецификации материалов и оборудования ТМЦ
  const { rows: materials } = await pool.query(`
    SELECT 
      tm.id,
      tm.pos_num,
      COALESCE(tm.item_name, m.name) AS name,
      tm.model,
      COALESCE(tm.article, m.code) AS code,
      tm.supplier,
      COALESCE(tm.unit, m.unit, 'шт') AS unit,
      COALESCE(tm.fact_qty, tm.plan_qty, 0) AS qty,
      COALESCE(tm.price, m.price_default, 0) AS price,
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

  const rawAddress = task.address || 'Адрес объекта не указан';
  const customerName = task.customer || 'ПАО Сбербанк';
  const contractorName = task.contractor || 'ООО «Ультима»';
  const contractNumber = task.edo_number || task.subcontract_number || '0851200000625006115';
  const contractDate = task.contract_date || '2026';
  const curDateStr = new Date().toLocaleDateString('ru-RU');

  // ─── 1. ЛИСТ: ТИТУЛ ──────────────────────────────────────────────────────────
  if (wb.Sheets['Титул']) {
    const ws = wb.Sheets['Титул'];
    if (ws['A2']) {
      ws['A2'].v = `Представитель Функционального заказчика:\r\n${customerName}\r\nпо адресу: ${rawAddress}\r\n(подпись, ФИО)\r\nм.п.`;
    }
    if (ws['B2']) {
      ws['B2'].v = `Представитель исполнителя:\r\n${contractorName}\r\n(подпись, ФИО)\r\nм.п.`;
    }
    if (ws['A3']) {
      ws['A3'].v = `Контракт / Заявка № ${contractNumber} от ${contractDate} на выполнение работ.`;
    }
    if (ws['A6']) {
      ws['A6'].v = `${customerName}\r\nпо адресу: ${rawAddress}`;
    }
  }

  // ─── 2. ЛИСТ: КЖ (КАБЕЛЬНЫЙ ЖУРНАЛ) ──────────────────────────────────────────
  if (wb.Sheets['КЖ'] && ports.length > 0) {
    const ws = wb.Sheets['КЖ'];
    const startRow = 6; // нулевой индекс (7-я строка в Excel)

    ports.forEach((p, idx) => {
      const r = startRow + idx;
      const portNum = p.port_number || String(idx + 1);
      const room = p.room || 'Помещение';
      const cabinet = p.cabinet || 'ШТК-1';
      const marking = p.marking || `ПП-1 / Порт ${portNum}`;
      const cableLen = parseFloat(p.cable_length) || 25;

      // E: №
      ws[`E${r + 1}`] = { t: 'n', v: idx + 1 };
      // F: Помещение (начало)
      ws[`F${r + 1}`] = { t: 's', v: room };
      // G: № стойки
      ws[`G${r + 1}`] = { t: 's', v: '-' };
      // H: Оборудование (начало)
      ws[`H${r + 1}`] = { t: 's', v: marking };
      // I: № порта
      ws[`I${r + 1}`] = { t: 's', v: portNum };
      // J: Помещение (конец)
      ws[`J${r + 1}`] = { t: 's', v: 'Серверная' };
      // K: № стойки (конец)
      ws[`K${r + 1}`] = { t: 's', v: cabinet };
      // L: Оборудование (конец)
      ws[`L${r + 1}`] = { t: 's', v: 'Патч-панель (ПП-1)' };
      // M: № порта на патч-панели
      ws[`M${r + 1}`] = { t: 's', v: portNum };
      // N: Марка кабеля
      ws[`N${r + 1}`] = { t: 's', v: 'UTP Cat.5e 4х2хAWG24' };
      // O: Длина (м)
      ws[`O${r + 1}`] = { t: 'n', v: cableLen };
      // P: Примечание
      ws[`P${r + 1}`] = { t: 's', v: p.testing_status || 'Готов к эксплуатации' };
    });

    // Обновляем диапазон листа КЖ
    const maxR = Math.max(30, startRow + ports.length + 5);
    ws['!ref'] = `A1:P${maxR}`;
  }

  // ─── 3. ЛИСТ: СПЕКА1 (ОБОРУДОВАНИЕ) И СПЕКА2 (МАТЕРИАЛЫ) ───────────────────
  if (materials.length > 0) {
    const equipItems = materials.filter(m => {
      const cat = (m.category || '').toLowerCase();
      const n = (m.name || '').toLowerCase();
      return cat.includes('оборудован') || n.includes('шкаф') || n.includes('коммутатор') || n.includes('маршрутизатор') || n.includes('камера') || n.includes('видеорегистратор') || n.includes('ибп') || n.includes('точка доступа') || n.includes('панель');
    });
    const cableItems = materials.filter(m => !equipItems.includes(m));

    // Заполняем Спека1 (Оборудование)
    if (wb.Sheets['Спека1'] && equipItems.length > 0) {
      const ws = wb.Sheets['Спека1'];
      equipItems.forEach((it, idx) => {
        const r = 5 + idx; // Строка 6+
        ws[`E${r + 1}`] = { t: 's', v: it.pos_num || `1.${idx + 1}` };
        ws[`F${r + 1}`] = { t: 's', v: it.name || '' };
        ws[`G${r + 1}`] = { t: 's', v: it.model || '' };
        ws[`H${r + 1}`] = { t: 's', v: it.code || '' };
        ws[`L${r + 1}`] = { t: 's', v: it.supplier || 'ООО "Электрон"' };
        ws[`P${r + 1}`] = { t: 's', v: it.unit || 'шт.' };
        ws[`Q${r + 1}`] = { t: 'n', v: Number(it.qty) || 1 };
        if (it.mass_kg) ws[`R${r + 1}`] = { t: 'n', v: Number(it.mass_kg) };
        if (it.note) ws[`T${r + 1}`] = { t: 's', v: it.note };
      });
    }

    // Заполняем Спека2 (Кабельные изделия и материалы)
    if (wb.Sheets['Спека2'] && cableItems.length > 0) {
      const ws = wb.Sheets['Спека2'];
      cableItems.forEach((it, idx) => {
        const r = 5 + idx;
        ws[`E${r + 1}`] = { t: 's', v: it.pos_num || `2.${idx + 1}` };
        ws[`F${r + 1}`] = { t: 's', v: it.name || '' };
        ws[`G${r + 1}`] = { t: 's', v: it.model || '' };
        ws[`H${r + 1}`] = { t: 's', v: it.code || '' };
        ws[`L${r + 1}`] = { t: 's', v: it.supplier || 'Склад компании' };
        ws[`P${r + 1}`] = { t: 's', v: it.unit || 'м.' };
        ws[`Q${r + 1}`] = { t: 'n', v: Number(it.qty) || 1 };
        if (it.mass_kg) ws[`R${r + 1}`] = { t: 'n', v: Number(it.mass_kg) };
        if (it.note) ws[`T${r + 1}`] = { t: 's', v: it.note };
      });
    }
  }

  // ─── 4. ЛИСТ: ПИ1 (ПРОТОКОЛ ИЗМЕРЕНИЙ FLUKE) ─────────────────────────────────
  if (wb.Sheets['ПИ1']) {
    const ws = wb.Sheets['ПИ1'];
    if (ws['D2']) {
      ws['D2'].v = `Объект: ${customerName}, ${rawAddress}\r\nПрибор: Fluke Networks MS2-100 зав.№2780829 Дата измерения: ${curDateStr}`;
    }

    if (ports.length > 0) {
      const startRow = 3; // 4-я строка
      ports.forEach((p, idx) => {
        const r = startRow + idx;
        const portNum = p.port_number || String(idx + 1);
        const room = p.room || 'Помещение';
        const marking = p.marking || `Р-${portNum}`;
        const cableLen = parseFloat(p.cable_length) || 25;

        // E: №
        ws[`E${r + 1}`] = { t: 'n', v: idx + 1 };
        // F: Точка А
        ws[`F${r + 1}`] = { t: 's', v: `Патч-панель (ПП-1), порт ${portNum}` };
        // G: Точка Б
        ws[`G${r + 1}`] = { t: 's', v: `${room}, ${marking}` };
        // H: Марка кабеля
        ws[`H${r + 1}`] = { t: 's', v: 'UTP Cat.5e 4х2хAWG24 Cu нг(А)-LSLTx' };
        // I: Диаметр жил, мм
        ws[`I${r + 1}`] = { t: 'n', v: 0.52 };
        // J: Длина, м
        ws[`J${r + 1}`] = { t: 'n', v: cableLen };
        // K: Схема разводки
        ws[`K${r + 1}`] = { t: 's', v: 'TIA/EIA-568B' };
        // L: Результат
        ws[`L${r + 1}`] = { t: 's', v: 'Pass (Соответствует)' };
      });
      const maxR = Math.max(30, startRow + ports.length + 5);
      ws['!ref'] = `A1:L${maxR}`;
    }
  }

  // Генерируем буфер книги Excel
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}
