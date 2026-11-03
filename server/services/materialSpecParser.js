import xlsxPkg from 'xlsx';
import crypto from 'crypto';
import { pool } from '../config/db.js';

const XLSX = xlsxPkg.default || xlsxPkg;

/**
 * Парсер Excel-спецификаций ТМЦ и оборудования (ГОСТ / Проектные отделы / Ультима)
 */
export function parseMaterialSpecExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const items = [];

  // Определяем порядок обхода листов
  let sheetNames = wb.SheetNames.filter(name => /спека|специфика|тмц|материал|оборудован|м-15|всо/i.test(name));
  if (sheetNames.length === 0) {
    sheetNames = wb.SheetNames;
  }

  for (const sheetName of sheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows || rows.length < 2) continue;

    // 1. Ищем строку заголовка
    let headerRowIdx = -1;
    let colMap = {
      pos: -1,
      name: -1,
      model: -1,
      article: -1,
      supplier: -1,
      unit: -1,
      qty: -1,
      mass: -1,
      price: -1,
      total: -1,
      note: -1
    };

    for (let r = 0; r < Math.min(25, rows.length); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const curMap = {
        pos: -1,
        name: -1,
        model: -1,
        article: -1,
        supplier: -1,
        unit: -1,
        qty: -1,
        mass: -1,
        price: -1,
        total: -1,
        note: -1
      };
      let matchedKeyFields = 0;

      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (!val) continue;

        if (curMap.pos === -1 && /^(поз\.?|№|п\/п|номер)/i.test(val)) {
          curMap.pos = c;
          matchedKeyFields++;
        } else if (curMap.name === -1 && /(наименование|описание|товар|характеристик|оборудование)/i.test(val)) {
          curMap.name = c;
          matchedKeyFields++;
        } else if (curMap.model === -1 && /(тип|марка|модель|обозначение|документ)/i.test(val)) {
          curMap.model = c;
        } else if (curMap.article === -1 && /(код продукции|код|артикул|штрих)/i.test(val)) {
          curMap.article = c;
        } else if (curMap.supplier === -1 && /(поставщик|завод|изготовитель|производитель)/i.test(val)) {
          curMap.supplier = c;
        } else if (curMap.unit === -1 && /(ед\.?\s*измерен|ед\.?\s*изм|единица)/i.test(val)) {
          curMap.unit = c;
          matchedKeyFields++;
        } else if (curMap.qty === -1 && /(кол\.|кол-во|количество|объем)/i.test(val)) {
          curMap.qty = c;
          matchedKeyFields++;
        } else if (curMap.mass === -1 && /(масса|вес)/i.test(val)) {
          curMap.mass = c;
        } else if (curMap.price === -1 && /(цена|стоимость за|тариф)/i.test(val) && !/всего|итого/i.test(val)) {
          curMap.price = c;
        } else if (curMap.total === -1 && /(сумма|всего|итого)/i.test(val)) {
          curMap.total = c;
        } else if (curMap.note === -1 && /(примечан|комментар)/i.test(val)) {
          curMap.note = c;
        }
      }

      // Если в строке нашлись хотя бы 'наименование' или 'поз' + 'кол' / 'ед'
      if (curMap.name !== -1 && (curMap.qty !== -1 || curMap.pos !== -1 || matchedKeyFields >= 2)) {
        headerRowIdx = r;
        colMap = curMap;
        break;
      }
    }

    if (headerRowIdx === -1 || colMap.name === -1) {
      continue;
    }

    let currentCategory = '';

    // Парсим строки данных ниже заголовка
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      // Полный текст строки для проверок
      const fullRowText = row.map(x => String(x || '')).join(' ').toLowerCase();

      // Пропуск строк штампа ГОСТ и согласований
      if (/разработал|проверил|согласовано|взам\.\s*инв|подп\.\s*и\s*дата|формат\s*а3|стадия\s*лист|ооо\s*"/i.test(fullRowText)) {
        continue;
      }

      // Пропуск служебной строки номеров колонок (1, 2, 3, 4, 5, 6...)
      const nonEmpties = row.filter(x => x !== '' && x !== null && x !== undefined);
      if (nonEmpties.length >= 4 && nonEmpties.every(x => /^\d{1,2}$/.test(String(x).trim()))) {
        continue;
      }

      const rawPos = colMap.pos !== -1 ? String(row[colMap.pos] || '').trim() : '';
      const rawName = colMap.name !== -1 ? String(row[colMap.name] || '').trim() : '';
      const rawModel = colMap.model !== -1 ? String(row[colMap.model] || '').trim() : '';
      const rawArticle = colMap.article !== -1 ? String(row[colMap.article] || '').trim() : '';
      const rawSupplier = colMap.supplier !== -1 ? String(row[colMap.supplier] || '').trim() : '';
      const rawUnit = colMap.unit !== -1 ? String(row[colMap.unit] || '').trim() : '';
      const rawQty = colMap.qty !== -1 ? String(row[colMap.qty] || '').trim() : '';
      const rawMass = colMap.mass !== -1 ? String(row[colMap.mass] || '').trim() : '';
      const rawPrice = colMap.price !== -1 ? String(row[colMap.price] || '').trim() : '';
      const rawTotal = colMap.total !== -1 ? String(row[colMap.total] || '').trim() : '';
      const rawNote = colMap.note !== -1 ? String(row[colMap.note] || '').trim() : '';

      // Строка заголовка раздела (например "1. Оборудование" или "2. Кабельные изделия")
      if (rawName && !rawQty && !rawUnit && !rawPrice && (!rawPos || /^\d+$/.test(rawPos))) {
        currentCategory = rawName;
        continue;
      }

      // Пропуск пустых строк
      if (!rawName) continue;

      // Парсинг количества
      const cleanQtyStr = rawQty.replace(/\s+/g, '').replace(',', '.');
      const qtyNum = parseFloat(cleanQtyStr);
      const planQty = !isNaN(qtyNum) && qtyNum >= 0 ? qtyNum : 0;

      // Если нет количества и нет позиции — пропускаем
      if (planQty === 0 && !rawPos && !rawModel) continue;

      // Парсинг цены и массы
      const cleanPriceStr = rawPrice.replace(/\s+/g, '').replace(',', '.');
      const priceNum = parseFloat(cleanPriceStr);
      const price = !isNaN(priceNum) && priceNum >= 0 ? priceNum : null;

      const cleanMassStr = rawMass.replace(/\s+/g, '').replace(',', '.');
      const massNum = parseFloat(cleanMassStr);
      const massKg = !isNaN(massNum) && massNum >= 0 ? massNum : null;

      const cleanTotalStr = rawTotal.replace(/\s+/g, '').replace(',', '.');
      const totalNum = parseFloat(cleanTotalStr);
      const totalPrice = !isNaN(totalNum) && totalNum >= 0 ? totalNum : (price ? Math.round(planQty * price) : null);

      // Нормализация единицы измерения
      let unit = rawUnit.replace(/\./g, '').trim().toLowerCase();
      if (unit === 'м' || unit === 'метр' || unit === 'метры' || unit === 'пог м') unit = 'м';
      else if (unit === 'шт' || unit === 'штука' || unit === 'штуки') unit = 'шт';
      else if (unit === 'компл' || unit === 'комплект') unit = 'компл';
      else if (unit === 'упак' || unit === 'упаковка') unit = 'упак';
      else if (!unit) unit = 'шт';

      items.push({
        pos_num: rawPos || String(items.length + 1),
        item_name: rawName,
        model: rawModel || null,
        article: rawArticle || null,
        supplier: rawSupplier || null,
        unit: unit,
        plan_qty: planQty,
        mass_kg: massKg,
        price: price,
        total_price: totalPrice,
        note: rawNote || null,
        category: currentCategory || 'Материалы и оборудование',
        sheet_name: sheetName
      });
    }
  }

  return items;
}

/**
 * Сохранение распарсенных позиций в task_materials с автонаполнением справочника materials
 */
export async function saveImportedMaterials(taskId, items, { replace = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (replace) {
      // Удаляем только незафиксированные списанием строки
      await client.query(`
        DELETE FROM task_materials 
        WHERE task_id = $1 AND (is_written_off IS FALSE OR is_written_off IS NULL)
      `, [taskId]);
    }

    let savedCount = 0;

    for (const it of items) {
      let materialId = null;

      // 1. Поиск в каталоге materials по артикулу или точному наименованию
      if (it.article) {
        const { rows: byArt } = await client.query(
          `SELECT id FROM materials WHERE LOWER(code) = LOWER($1) LIMIT 1`,
          [it.article.trim()]
        );
        if (byArt.length > 0) materialId = byArt[0].id;
      }

      if (!materialId && it.item_name) {
        const { rows: byName } = await client.query(
          `SELECT id FROM materials WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [it.item_name.trim()]
        );
        if (byName.length > 0) materialId = byName[0].id;
      }

      // 2. Если материал не найден в каталоге — автонаполнение каталога
      if (!materialId && it.item_name) {
        const generatedCode = it.article 
          ? it.article.trim().toUpperCase() 
          : 'MAT-' + crypto.randomBytes(3).toString('hex').toUpperCase();

        const { rows: newMat } = await client.query(`
          INSERT INTO materials (code, name, unit, category, price_default, is_active)
          VALUES ($1, $2, $3, $4, $5, true)
          ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `, [
          generatedCode,
          it.item_name.trim(),
          it.unit || 'шт',
          it.category || 'Спецификация объекта',
          it.price || 0
        ]);
        if (newMat.length > 0) materialId = newMat[0].id;
      }

      // 3. Сохранение в task_materials
      await client.query(`
        INSERT INTO task_materials (
          task_id, material_id, pos_num, item_name, model, article, supplier, unit,
          plan_qty, fact_qty, price, total_price, mass_kg, note, source
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $9, $10, $11, $12, $13, 'excel_spec'
        )
      `, [
        taskId,
        materialId,
        it.pos_num,
        it.item_name,
        it.model,
        it.article,
        it.supplier,
        it.unit,
        it.plan_qty,
        it.price,
        it.total_price,
        it.mass_kg,
        it.note
      ]);

      savedCount++;
    }

    await client.query('COMMIT');
    return { success: true, count: savedCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
