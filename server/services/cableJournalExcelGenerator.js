import xlsxPkg from 'xlsx';
import { pool } from '../config/db.js';

const XLSX = xlsxPkg.default || xlsxPkg;

/**
 * Сервис генерации эталонного Кабельного Журнала (КЖ) и Протокола измерений Fluke в Excel
 * Реализует структуру KZh.xlsx Алексея и разделение документов.
 */

// 1. Генерация Кабельного журнала по эталону KZh.xlsx
export async function generateCableJournalExcel(taskId) {
  const { rows: taskRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  const task = taskRows[0] || { id: taskId };

  const { rows: ports } = await pool.query(`
    SELECT * FROM task_ports
    WHERE task_id = $1
    ORDER BY id ASC
  `, [taskId]);

  const wsData = [];

  // Заголовок листа
  wsData.push([
    '№ п/п',
    'Шкаф (начало линии)',
    'Юнит',
    'Этаж шкафа',
    'ПП №',
    'ПП порт',
    'Маркировка линии',
    'Марка кабеля',
    'Длина линии, м',
    'Корпус / этаж',
    'Окончание линии (РМ)',
    'Маркировка розетки РМ',
    'Подтверждено монтажником',
    'Статус теста',
    'Примечание'
  ]);

  ports.forEach((p, idx) => {
    const cableLength = p.cable_length === null || p.cable_length === undefined || p.cable_length === '' ? '' : Number(p.cable_length);
    wsData.push([
      idx + 1,
      p.cabinet ?? '',
      p.unit ?? '',
      p.floor ?? '',
      p.patch_panel ?? '',
      p.port_number ?? '',
      p.marking ?? '',
      p.cable_mark ?? '',
      Number.isFinite(cableLength) ? cableLength : '',
      p.building ?? '',
      p.room ?? '',
      p.outlet_marking ?? '',
      '',
      p.testing_status ?? '',
      p.notes ?? ''
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 6 },   // №
    { wch: 28 },  // Шкаф
    { wch: 8 },   // Юнит
    { wch: 10 },  // Этаж шкафа
    { wch: 8 },   // ПП №
    { wch: 9 },   // Порт ПП
    { wch: 14 },  // Маркировка линии
    { wch: 25 },  // Марка кабеля
    { wch: 14 },  // Длина
    { wch: 14 },  // Корпус / этаж
    { wch: 24 },  // Окончание линии
    { wch: 18 },  // Маркировка РМ
    { wch: 16 },  // Подтверждено
    { wch: 12 },  // Тест
    { wch: 20 }   // Примечание
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Кабельный журнал');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// 2. Генерация официального Протокола испытаний Fluke MS2-100
export async function generateFlukeProtocolExcel(taskId) {
  const { rows: taskRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  const task = taskRows[0] || { id: taskId };

  const { rows: ports } = await pool.query(`
    SELECT * FROM task_ports
    WHERE task_id = $1
    ORDER BY id ASC
  `, [taskId]);

  const wsData = [];

  // Шапка протокола
  wsData.push(['ПРОТОКОЛ ПРИЕМО-СДАТОЧНЫХ ИСПЫТАНИЙ СТРУКТУРИРОВАННОЙ КАБЕЛЬНОЙ СИСТЕМЫ (СКС)']);
  wsData.push([`Объект: ${task.title || task.address || ''}`]);
  wsData.push([`Заказчик: ${task.customer || ''} | Договор / Заказ-наряд №: ${task.id}`]);
  wsData.push([]);

  // Заголовки таблицы
  wsData.push([
    '№ п/п',
    'Маркировка линии',
    'Шкаф (кросс)',
    'Патч-панель',
    'Порт ПП',
    'Розетка РМ',
    'Тип линии',
    'Длина (м)',
    'Схема разводки (Wiremap)',
    'Результат теста',
    'Статус линии',
    'Оператор'
  ]);

  ports.forEach((p, idx) => {
    const cableLength = p.cable_length === null || p.cable_length === undefined || p.cable_length === '' ? '' : Number(p.cable_length);
    wsData.push([
      idx + 1,
      p.marking ?? '',
      p.cabinet ?? '',
      p.patch_panel ?? '',
      p.port_number ?? '',
      p.outlet_marking ?? '',
      p.line_type ?? '',
      Number.isFinite(cableLength) ? cableLength : '',
      p.wiremap ?? p.wire_map ?? p.crimping ?? '',
      p.testing_status ?? '',
      p.line_status ?? '',
      p.operator ?? ''
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 6 },   // №
    { wch: 16 },  // Маркировка
    { wch: 14 },  // Шкаф
    { wch: 12 },  // ПП
    { wch: 9 },   // Порт
    { wch: 16 },  // Розетка
    { wch: 18 },  // Тип
    { wch: 12 },  // Длина
    { wch: 34 },  // Wiremap
    { wch: 14 },  // Результат
    { wch: 22 },  // Статус
    { wch: 22 }   // Оператор
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Протокол Fluke');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
