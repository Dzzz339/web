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
        remainder: -1,
        mass: -1,
        price: -1,
        total: -1,
        note: -1,
        supplierCols: []
      };
      let matchedKeyFields = 0;

      for (let c = 0; c < row.length; c++) {
        const rawVal = String(row[c] || '').trim();
        const val = rawVal.toLowerCase().replace(/\s+/g, ' ');
        if (!val) continue;

        if (curMap.pos === -1 && /^(№|поз|п\/|номер)/i.test(val)) {
          curMap.pos = c;
          matchedKeyFields++;
        } else if (curMap.name === -1 && /(наименование|описание|товар|характеристик|номенклатур|материал|оборудование)/i.test(val)) {
          curMap.name = c;
          matchedKeyFields++;
        } else if (curMap.unit === -1 && /(ед\.?\s*из|ед\.?\s*изм|единиц|измерен)/i.test(val)) {
          curMap.unit = c;
          matchedKeyFields++;
        } else if (curMap.qty === -1 && /(кол|кол-в|количество|объем|план)/i.test(val)) {
          curMap.qty = c;
          matchedKeyFields++;
        } else if (curMap.article === -1 && /(код|артикул|марка|модель|тип|обозначен)/i.test(val)) {
          curMap.article = c;
        } else if (curMap.supplier === -1 && /(поставщик|завод|изготовитель|производитель)/i.test(val)) {
          curMap.supplier = c;
        } else if (curMap.remainder === -1 && /(остаток|не закрыто)/i.test(val)) {
          curMap.remainder = c;
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

      // Если между name и unit есть нераспознанная колонка (например, пустой заголовок артикула)
      if (curMap.name !== -1 && curMap.unit !== -1 && curMap.article === -1) {
        if (curMap.unit - curMap.name === 2) {
          curMap.article = curMap.name + 1;
        }
      }

      // Динамические колонки поставщиков справа от qty (НСК, Инсистем, ЭТМ...)
      if (curMap.qty !== -1) {
        for (let c = curMap.qty + 1; c < row.length; c++) {
          if (c === curMap.remainder || c === curMap.price || c === curMap.total || c === curMap.note) continue;
          const rawName = String(row[c] || '').trim();
          if (!rawName) continue;
          let suppName = rawName;
          if (/^инсист/i.test(suppName)) suppName = 'Инсистем';
          else if (/^нск/i.test(suppName)) suppName = 'НСК (Кабельные Системы)';
          else if (/^этм/i.test(suppName)) suppName = 'ЭТМ';
          curMap.supplierCols.push({ colIdx: c, name: suppName });
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
      let rawArticle = colMap.article !== -1 ? String(row[colMap.article] || '').trim() : '';
      let rawSupplier = colMap.supplier !== -1 ? String(row[colMap.supplier] || '').trim() : '';
      const rawUnit = colMap.unit !== -1 ? String(row[colMap.unit] || '').trim() : '';
      const rawQty = colMap.qty !== -1 ? String(row[colMap.qty] || '').trim() : '';
      const rawMass = colMap.mass !== -1 ? String(row[colMap.mass] || '').trim() : '';
      const rawPrice = colMap.price !== -1 ? String(row[colMap.price] || '').trim() : '';
      const rawTotal = colMap.total !== -1 ? String(row[colMap.total] || '').trim() : '';
      const rawNote = colMap.note !== -1 ? String(row[colMap.note] || '').trim() : '';

      // Если в строке есть динамические колонки поставщиков (НСК, Инсистем, ЭТМ)
      if (colMap.supplierCols && colMap.supplierCols.length > 0) {
        const suppBreakdown = [];
        for (const sc of colMap.supplierCols) {
          const val = parseFloat(String(row[sc.colIdx] || '').replace(',', '.'));
          if (!isNaN(val) && val > 0) {
            suppBreakdown.push({ supplier: sc.name, qty: val });
          }
        }
        if (suppBreakdown.length === 1) {
          rawSupplier = suppBreakdown[0].supplier;
        } else if (suppBreakdown.length > 1) {
          suppBreakdown.sort((a, b) => b.qty - a.qty);
          rawSupplier = suppBreakdown.map(s => `${s.supplier} (${s.qty})`).join(', ');
        }
      }

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

      // 3. Сохранение или обогащение существующей строки в task_materials
      const { rows: existingRows } = await client.query(`
        SELECT id FROM task_materials 
        WHERE task_id = $1 AND (
          (pos_num IS NOT NULL AND pos_num = $2) OR 
          LOWER(TRIM(COALESCE(item_name, ''))) = LOWER(TRIM($3))
        )
        LIMIT 1
      `, [taskId, it.pos_num, it.item_name]);

      if (existingRows.length > 0) {
        // Обогащаем данными снабжения: артикул, модель, поставщик, цена
        await client.query(`
          UPDATE task_materials SET
            article = COALESCE($1, article),
            model = COALESCE($2, model),
            supplier = COALESCE($3, supplier),
            unit = COALESCE($4, unit),
            plan_qty = CASE WHEN $5 > 0 THEN $5 ELSE plan_qty END,
            price = COALESCE($6, price),
            total_price = COALESCE($7, total_price),
            material_id = COALESCE($8, material_id)
          WHERE id = $9
        `, [
          it.article,
          it.model,
          it.supplier,
          it.unit,
          it.plan_qty,
          it.price,
          it.total_price,
          materialId,
          existingRows[0].id
        ]);
      } else {
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
      }

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
