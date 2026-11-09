import xlsxPkg from 'xlsx';
import { pool } from '../config/db.js';

const XLSX = xlsxPkg.default || xlsxPkg;

/**
 * Генерация спецификации материалов и оборудования (Приложение № 2) в Excel
 * Реализует требования Алексея:
 * 1. Четкая структура: Приложение № 2 (Спецификация ТМЦ).
 * 2. Раскладка поставщиков по колонкам (если поставщиков несколько, их количества разносятся в отдельные столбцы).
 * 3. Логистические параметры: статус отгрузки, ТК / перевозчик, дата отгрузки.
 * 4. Итоговая себестоимость и суммы.
 */
export async function generateMaterialSpecExcel(taskId) {
  // 1. Получаем данные заявки
  const { rows: taskRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (!taskRows.length) {
    throw new Error(`Заявка ${taskId} не найдена`);
  }
  const task = taskRows[0];

  // 2. Получаем позиции спецификации (сперва task_items, при отсутствии — task_materials)
  let { rows: items } = await pool.query(`
    SELECT 
      id, work_type AS name, quantity, unit,
      price_customer, amount_customer,
      price_contractor, amount_contractor,
      article, article_plan, article_fact,
      supplier, status, shipment_date, shipment_method, comment
    FROM task_items
    WHERE task_id = $1
    ORDER BY id ASC
  `, [taskId]);

  if (!items.length) {
    const { rows: matRows } = await pool.query(`
      SELECT 
        id, item_name AS name, COALESCE(fact_qty, plan_qty, 1) AS quantity, COALESCE(unit, 'шт') AS unit,
        price AS price_customer, total_price AS amount_customer,
        price AS price_contractor, total_price AS amount_contractor,
        article, article AS article_plan, NULL AS article_fact,
        supplier, (CASE WHEN is_written_off THEN 'delivered' ELSE 'pending' END) AS status,
        NULL AS shipment_date, NULL AS shipment_method, note AS comment
      FROM task_materials
      WHERE task_id = $1
      ORDER BY id ASC
    `, [taskId]);
    items = matRows;
  }

  // 3. Выявляем уникальных поставщиков
  const supplierSet = new Set();
  items.forEach(it => {
    const s = (it.supplier || '').trim();
    if (s) supplierSet.add(s);
  });
  const suppliers = Array.from(supplierSet);
  if (suppliers.length === 0) suppliers.push('Склад компании');

  // 4. Формируем строки для листа Excel
  const wsData = [];

  // Шапка документа
  wsData.push([`ПРИЛОЖЕНИЕ № 2 к Заказ-наряду № ${task.id}`]);
  wsData.push(['СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ, ИЗДЕЛИЙ И МАТЕРИАЛОВ (ТМЦ)']);
  wsData.push([`Объект: ${task.title || task.address || '—'}`]);
  wsData.push([`Заказчик: ${task.customer || '—'} | Подрядчик: ${task.contractor || '—'} | Дата: ${new Date().toLocaleDateString('ru-RU')}`]);
  wsData.push([]); // Пустая строка-разделитель

  // Заголовки таблицы
  const headerRow = [
    '№ п/п',
    'Наименование оборудования и материалов',
    'Артикул (план)',
    'Артикул (факт)',
    'Ед. изм.',
    'Всего кол-во'
  ];

  // Колонки по поставщикам (если поставщиков > 1 или 1)
  suppliers.forEach(s => {
    headerRow.push(`Кол-во: ${s}`);
  });

  headerRow.push(
    'Цена за ед. (₽)',
    'Сумма (₽)',
    'Статус отгрузки',
    'ТК / Логистика',
    'Дата отгрузки',
    'Примечание'
  );

  wsData.push(headerRow);

  // Статусы на русском
  const statusLabels = {
    pending: 'Не отгружено',
    in_transit: 'В пути (ТК)',
    delivered: 'Доставлено на объект',
    cancelled: 'Отменено'
  };

  let totalQtyAll = 0;
  let totalSumAll = 0;
  const supplierTotals = {};
  suppliers.forEach(s => { supplierTotals[s] = 0; });

  items.forEach((it, idx) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.price_contractor || it.price_customer || 0);
    const sum = Number(it.amount_contractor || it.amount_customer || (qty * price));
    const itSupp = (it.supplier || '').trim();
    const stLabel = statusLabels[it.status] || it.status || 'Не отгружено';
    const sDate = it.shipment_date ? new Date(it.shipment_date).toLocaleDateString('ru-RU') : '—';
    const sMethod = it.shipment_method || '—';

    totalQtyAll += qty;
    totalSumAll += sum;

    const row = [
      idx + 1,
      it.name || 'Материал',
      it.article_plan || it.article || '—',
      it.article_fact || '—',
      it.unit || 'шт.',
      qty
    ];

    // Разносим количество по колонкам поставщиков
    suppliers.forEach(s => {
      if (itSupp.toLowerCase() === s.toLowerCase() || (suppliers.length === 1 && !itSupp)) {
        row.push(qty);
        supplierTotals[s] += qty;
      } else {
        row.push(0);
      }
    });

    row.push(
      price,
      sum,
      stLabel,
      sMethod,
      sDate,
      it.comment || ''
    );

    wsData.push(row);
  });

  // Строка ИТОГО
  const totalRow = [
    'ИТОГО',
    '',
    '',
    '',
    '',
    totalQtyAll
  ];
  suppliers.forEach(s => {
    totalRow.push(supplierTotals[s]);
  });
  totalRow.push(
    '',
    totalSumAll,
    '',
    '',
    '',
    ''
  );
  wsData.push(totalRow);

  // 5. Создание книги Excel и листа
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Настройка ширины колонок
  const colWidths = [
    { wch: 6 },   // №
    { wch: 42 },  // Название
    { wch: 18 },  // Артикул план
    { wch: 18 },  // Артикул факт
    { wch: 9 },   // Ед.
    { wch: 13 }   // Всего
  ];
  suppliers.forEach(() => {
    colWidths.push({ wch: 18 }); // Колонка каждого поставщика
  });
  colWidths.push(
    { wch: 14 },  // Цена
    { wch: 16 },  // Сумма
    { wch: 18 },  // Статус
    { wch: 18 },  // ТК
    { wch: 14 },  // Дата
    { wch: 24 }   // Примечание
  );
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Спецификация ТМЦ');

  // Генерация бинарного буфера
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, count: items.length, totalSum: totalSumAll };
}
