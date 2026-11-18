import xlsxPkg from 'xlsx';
import { pool } from '../config/db.js';

const XLSX = xlsxPkg.default || xlsxPkg;

const STATUS_LABELS = {
  draft: 'Черновик',
  shipped: 'Отправлено',
  accepted: 'Принято',
  accepted_discrepancy: 'Принято с расхождениями',
  rejected: 'Отклонено',
  pending: 'Не отгружено',
  in_transit: 'В пути (ТК)',
  delivered: 'Доставлено на объект',
  cancelled: 'Отменено'
};

const SOURCE_LABELS = {
  warehouse: 'Склад',
  supplier: 'Поставщик',
  customer: 'Заказчик',
  contractor: 'Подрядчик',
  installer: 'Монтажник'
};

function fmtSource(s) {
  if (!s) return '';
  return SOURCE_LABELS[s] || s;
}

function fmtStatus(st) {
  if (!st) return '';
  return STATUS_LABELS[st] || st;
}

/**
 * Генерация плоской спецификации материалов и оборудования (Приложение № 2) в Excel (Задача 5.7)
 * - Плоская структура строк без горизонтального расширения по поставщикам
 * - Не выводит фактический расход в плановую колонку
 * - Пустые значения остаются пустыми (""), 0 сохраняется числом 0
 * - Читаемая ширина колонок, wrapText и повтор заголовка при печати
 */
export async function generateMaterialSpecExcel(taskId) {
  const { rows: taskRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (!taskRows.length) {
    throw new Error(`Заявка ${taskId} не найдена`);
  }
  const task = taskRows[0];

  // 1. Позиции спецификации (сначала task_items, если пусто — task_materials)
  let { rows: items } = await pool.query(`
    SELECT 
      ti.id,
      ti.work_type AS name,
      ti.quantity,
      ti.unit,
      ti.price_customer,
      ti.amount_customer,
      ti.price_contractor,
      ti.amount_contractor,
      COALESCE(ti.article_plan, ti.article) AS article,
      ti.manufacturer,
      ti.source,
      COALESCE(sc.name_short, ti.supplier) AS supplier,
      ti.shipment_method,
      ti.comment
    FROM task_items ti
    LEFT JOIN contractors sc ON ti.supplier_contractor_id = sc.id
    WHERE ti.task_id = $1
    ORDER BY ti.id ASC
  `, [taskId]);

  if (!items.length) {
    const { rows: matRows } = await pool.query(`
      SELECT 
        tm.id,
        COALESCE(tm.item_name, m.name) AS name,
        tm.plan_qty AS quantity,
        COALESCE(tm.unit, m.unit, 'шт.') AS unit,
        tm.price AS price_customer,
        tm.total_price AS amount_customer,
        tm.price AS price_contractor,
        tm.total_price AS amount_contractor,
        COALESCE(tm.article, m.code) AS article,
        COALESCE(tm.manufacturer, m.manufacturer) AS manufacturer,
        tm.source,
        COALESCE(sc.name_short, tm.supplier) AS supplier,
        tm.shipment_method,
        tm.note AS comment
      FROM task_materials tm
      LEFT JOIN materials m ON tm.material_id = m.id
      LEFT JOIN contractors sc ON tm.supplier_contractor_id = sc.id
      WHERE tm.task_id = $1
      ORDER BY tm.id ASC
    `, [taskId]);
    items = matRows;
  }

  // 2. Формируем строки для листа «Спецификация ТМЦ»
  const wsData = [];

  // Шапка документа
  wsData.push([`ПРИЛОЖЕНИЕ № 2 к Заказ-наряду № ${task.id}`]);
  wsData.push(['СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ, ИЗДЕЛИЙ И МАТЕРИАЛОВ (ТМЦ)']);
  wsData.push([`Объект: ${task.title || task.address || ''}`]);
  wsData.push([`Заказчик: ${task.customer || ''} | Подрядчик: ${task.contractor || ''} | Дата: ${new Date().toLocaleDateString('ru-RU')}`]);
  wsData.push([]); // Пустая строка-разделитель

  // Заголовки таблицы — строго плоские колонки (без разбивки поставщиков по горизонтали)
  const headerRow = [
    '№ п/п',
    'Наименование оборудования и материалов',
    'Артикул',
    'Производитель',
    'Ед. изм.',
    'Количество (план)',
    'Источник',
    'Поставщик',
    'Способ доставки',
    'Комментарий'
  ];
  wsData.push(headerRow);

  let totalQtyAll = 0;

  items.forEach((it, idx) => {
    let qtyVal = '';
    if (it.quantity !== null && it.quantity !== undefined && String(it.quantity).trim() !== '') {
      const parsed = Number(it.quantity);
      if (Number.isFinite(parsed)) {
        qtyVal = parsed;
        totalQtyAll += parsed;
      }
    }

    const row = [
      idx + 1,
      it.name || '',
      it.article || '',
      it.manufacturer || '',
      it.unit || 'шт.',
      qtyVal,
      fmtSource(it.source),
      it.supplier || '',
      it.shipment_method || '',
      it.comment || ''
    ];

    wsData.push(row);
  });

  // Строка ИТОГО
  const totalRow = [
    'ИТОГО',
    '',
    '',
    '',
    '',
    totalQtyAll,
    '',
    '',
    '',
    ''
  ];
  wsData.push(totalRow);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Настройка ширины колонок для аккуратного отображения и печати
  ws['!cols'] = [
    { wch: 6 },   // №
    { wch: 45 },  // Наименование
    { wch: 20 },  // Артикул
    { wch: 20 },  // Производитель
    { wch: 10 },  // Ед. изм.
    { wch: 18 },  // Количество (план)
    { wch: 16 },  // Источник
    { wch: 28 },  // Поставщик
    { wch: 22 },  // Способ доставки
    { wch: 32 }   // Комментарий
  ];

  // Повтор заголовка таблицы (строка 6, 1-based) при печати и альбомная ориентация
  ws['!pageSetup'] = { orientation: 'landscape', paperSize: 9 };
  ws['!printHeader'] = [6, 6];

  // Применяем перенос строк wrapText ко всем заполненным ячейкам
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:J1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[cellRef]) {
        if (!ws[cellRef].s) ws[cellRef].s = {};
        ws[cellRef].s.alignment = { wrapText: true, vertical: 'center' };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Спецификация ТМЦ');

  // Если по заявке сформированы отгрузки — добавляем второй лист «Отгрузки ТМЦ»
  const { rows: shipments } = await pool.query(`
    SELECT
      s.*,
      uc.full_name AS creator_name,
      us.full_name AS shipper_name,
      ua.full_name AS accepter_name
    FROM material_shipments s
    LEFT JOIN users uc ON s.created_by = uc.id
    LEFT JOIN users us ON s.shipped_by = us.id
    LEFT JOIN users ua ON s.accepted_by = ua.id
    WHERE s.task_id = $1
    ORDER BY s.id ASC
  `, [taskId]);

  if (shipments.length > 0) {
    const wsShipData = [];
    wsShipData.push([`РЕЕСТР ОТГРУЗОК ТМЦ к Заказ-наряду № ${task.id}`]);
    wsShipData.push([`Всего сформировано отгрузок: ${shipments.length}`]);
    wsShipData.push([]);

    for (const sh of shipments) {
      wsShipData.push([
        `Отгрузка № ${sh.shipment_number}`,
        `Дата: ${sh.shipment_date ? new Date(sh.shipment_date).toLocaleDateString('ru-RU') : ''}`,
        `Статус: ${fmtStatus(sh.status)}`,
        `Перевозчик: ${sh.carrier || ''}`,
        `Сформировал: ${sh.creator_name || ''}`,
        `Отправил: ${sh.shipper_name || ''}`,
        sh.accepted_at ? `Принял: ${sh.accepter_name || ''} (${new Date(sh.accepted_at).toLocaleDateString('ru-RU')})` : ''
      ]);

      wsShipData.push([
        '№',
        'Наименование ТМЦ',
        'Артикул',
        'Производитель',
        'Ед.',
        'Отгружено',
        'Принято',
        'Источник',
        'Поставщик',
        'Цена (₽)',
        'Примечание'
      ]);

      const { rows: sItems } = await pool.query(`
        SELECT * FROM material_shipment_items WHERE shipment_id = $1 ORDER BY id ASC
      `, [sh.id]);

      sItems.forEach((si, sIdx) => {
        const shQty = Number(si.shipped_qty);
        const acQty = si.accepted_qty !== null && si.accepted_qty !== undefined ? Number(si.accepted_qty) : '';
        wsShipData.push([
          sIdx + 1,
          si.item_name_snapshot || '',
          si.article_snapshot || '',
          si.manufacturer_snapshot || '',
          si.unit_snapshot || 'шт.',
          Number.isFinite(shQty) ? shQty : '',
          Number.isFinite(acQty) ? acQty : '',
          fmtSource(si.source_snapshot),
          si.supplier_snapshot || '',
          si.price_snapshot !== null ? Number(si.price_snapshot) : '',
          si.discrepancy_reason || ''
        ]);
      });

      wsShipData.push([]); // пустая строка между отгрузками
    }

    const wsShip = XLSX.utils.aoa_to_sheet(wsShipData);
    wsShip['!cols'] = [
      { wch: 6 },
      { wch: 40 },
      { wch: 18 },
      { wch: 18 },
      { wch: 8 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 24 },
      { wch: 14 },
      { wch: 28 }
    ];
    XLSX.utils.book_append_sheet(wb, wsShip, 'Отгрузки ТМЦ');
  }

  // Задаем глобальные Print_Titles в метаданных книги
  wb.Workbook = {
    Names: [
      { Name: '_xlnm.Print_Titles', Ref: `'Спецификация ТМЦ'!$6:$6` }
    ]
  };

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, count: items.length, totalQty: totalQtyAll };
}

/**
 * Генерация документа конкретной отгрузки в Excel (Задача 5.7)
 * - Шапка: номер, дата, перевозчик, статус, автор формирования, отправитель, получатель
 * - Таблица строк из снимка material_shipment_items
 * - Пустые значения не маскируются дефисами
 */
export async function generateShipmentExcel(taskId, shipmentId) {
  const { rows: taskRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (!taskRows.length) {
    throw new Error(`Заявка ${taskId} не найдена`);
  }
  const task = taskRows[0];

  const { rows: shipRows } = await pool.query(`
    SELECT
      s.*,
      uc.full_name AS creator_name,
      us.full_name AS shipper_name,
      ua.full_name AS accepter_name
    FROM material_shipments s
    LEFT JOIN users uc ON s.created_by = uc.id
    LEFT JOIN users us ON s.shipped_by = us.id
    LEFT JOIN users ua ON s.accepted_by = ua.id
    WHERE s.id = $1 AND s.task_id = $2
  `, [shipmentId, taskId]);

  if (!shipRows.length) {
    throw new Error(`Отгрузка #${shipmentId} не найдена в заявке ${taskId}`);
  }
  const shipment = shipRows[0];

  const { rows: items } = await pool.query(`
    SELECT
      si.*,
      sc.name_short AS supplier_contractor_name
    FROM material_shipment_items si
    LEFT JOIN contractors sc ON si.supplier_contractor_id_snapshot = sc.id
    WHERE si.shipment_id = $1
    ORDER BY si.id ASC
  `, [shipmentId]);

  const wsData = [];

  wsData.push([`ОТГРУЗКА МАТЕРИАЛОВ № ${shipment.shipment_number}`]);
  wsData.push([`Заказ-наряд / Заявка: ${task.id} | Объект: ${task.title || task.address || ''}`]);
  wsData.push([`Дата отгрузки: ${shipment.shipment_date ? new Date(shipment.shipment_date).toLocaleDateString('ru-RU') : ''} | Статус: ${fmtStatus(shipment.status)}`]);
  wsData.push([`Перевозчик / Способ доставки: ${shipment.carrier || ''}${shipment.waybill_number ? ` | № ТТН / накладной: ${shipment.waybill_number}` : ''}`]);
  if (shipment.delivery_cost && Number(shipment.delivery_cost) > 0) {
    wsData.push([`Стоимость доставки: ${Number(shipment.delivery_cost)} ₽`]);
  }
  wsData.push([`Сформировал: ${shipment.creator_name || ''} | Отправил: ${shipment.shipper_name || ''}`]);

  if (shipment.accepted_at) {
    const accDate = new Date(shipment.accepted_at).toLocaleString('ru-RU');
    const accResult = shipment.acceptance_result === 'full' ? 'Принято полностью' : (shipment.acceptance_result === 'discrepancy' ? 'Принято с расхождениями' : (shipment.acceptance_result || ''));
    wsData.push([`Принял: ${shipment.accepter_name || ''} (${accDate}) | Результат: ${accResult}`]);
    if (shipment.acceptance_comment) {
      wsData.push([`Комментарий приёмки: ${shipment.acceptance_comment}`]);
    }
  }
  if (shipment.comment) {
    wsData.push([`Примечание к отгрузке: ${shipment.comment}`]);
  }

  wsData.push([]); // пустая строка перед таблицей

  const headerRow = [
    '№ п/п',
    'Наименование оборудования и материалов',
    'Артикул',
    'Производитель',
    'Ед. изм.',
    'Количество (отгружено)',
    'Количество (принято)',
    'Источник',
    'Поставщик',
    'Цена за ед. (₽)',
    'Сумма (₽)',
    'Примечание / расхождение'
  ];
  wsData.push(headerRow);

  let totalShippedQty = 0;
  let totalAcceptedQty = 0;
  let hasAnyAccepted = false;
  let hasAnyPrice = false;
  let totalSum = 0;

  items.forEach((it, idx) => {
    const shQty = Number(it.shipped_qty) || 0;
    totalShippedQty += shQty;

    let acQtyVal = '';
    if (it.accepted_qty !== null && it.accepted_qty !== undefined && String(it.accepted_qty).trim() !== '') {
      const parsedAc = Number(it.accepted_qty);
      if (Number.isFinite(parsedAc)) {
        acQtyVal = parsedAc;
        totalAcceptedQty += parsedAc;
        hasAnyAccepted = true;
      }
    }

    let priceVal = '';
    let itemSumVal = '';
    if (it.price_snapshot !== null && it.price_snapshot !== undefined && String(it.price_snapshot).trim() !== '') {
      const parsedPrice = Number(it.price_snapshot);
      if (Number.isFinite(parsedPrice) && parsedPrice >= 0) {
        priceVal = parsedPrice;
        const itemSum = Math.round(shQty * parsedPrice);
        itemSumVal = itemSum;
        totalSum += itemSum;
        hasAnyPrice = true;
      }
    }

    const row = [
      idx + 1,
      it.item_name_snapshot || '',
      it.article_snapshot || '',
      it.manufacturer_snapshot || '',
      it.unit_snapshot || 'шт.',
      shQty,
      acQtyVal,
      fmtSource(it.source_snapshot),
      it.supplier_contractor_name || it.supplier_snapshot || '',
      priceVal,
      itemSumVal,
      it.discrepancy_reason || ''
    ];

    wsData.push(row);
  });

  // Строка ИТОГО
  const totalRow = [
    'ИТОГО',
    '',
    '',
    '',
    '',
    totalShippedQty,
    hasAnyAccepted ? totalAcceptedQty : '',
    '',
    '',
    '',
    hasAnyPrice ? totalSum : '',
    ''
  ];
  wsData.push(totalRow);

  if (shipment.delivery_cost && Number(shipment.delivery_cost) > 0) {
    const delCost = Number(shipment.delivery_cost);
    wsData.push([
      'Доставка (ТК)',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      delCost,
      shipment.waybill_number ? `ТТН: ${shipment.waybill_number}` : ''
    ]);
    wsData.push([
      'ИТОГО С ДОСТАВКОЙ',
      '',
      '',
      '',
      '',
      totalShippedQty,
      hasAnyAccepted ? totalAcceptedQty : '',
      '',
      '',
      '',
      hasAnyPrice ? (totalSum + delCost) : delCost,
      ''
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 6 },   // №
    { wch: 45 },  // Наименование
    { wch: 18 },  // Артикул
    { wch: 20 },  // Производитель
    { wch: 10 },  // Ед. изм.
    { wch: 22 },  // Отгружено
    { wch: 22 },  // Принято
    { wch: 16 },  // Источник
    { wch: 26 },  // Поставщик
    { wch: 16 },  // Цена
    { wch: 18 },  // Сумма
    { wch: 30 }   // Примечание
  ];

  ws['!pageSetup'] = { orientation: 'landscape', paperSize: 9 };
  const headerLineIndex = wsData.findIndex(r => r[0] === '№ п/п') + 1;
  if (headerLineIndex > 0) {
    ws['!printHeader'] = [headerLineIndex, headerLineIndex];
    wb.Workbook = {
      Names: [
        { Name: '_xlnm.Print_Titles', Ref: `'Отгрузка ТМЦ'!$${headerLineIndex}:$${headerLineIndex}` }
      ]
    };
  }

  // WrapText
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:L1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[cellRef]) {
        if (!ws[cellRef].s) ws[cellRef].s = {};
        ws[cellRef].s.alignment = { wrapText: true, vertical: 'center' };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Отгрузка ТМЦ');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, shipment, count: items.length };
}
