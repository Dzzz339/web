// server/scripts/seedSberTariffs.js
// Скрипт миграции и сидирования официальных тарифов Сбербанка на 2026 год (37 регионов)
// и генерации базовых прайсов субподряда.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const row = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        row.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

export async function initCustomerTariffsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_tariffs (
      id SERIAL PRIMARY KEY,
      customer_tag TEXT DEFAULT 'ПАО Сбербанк',
      contract_agreement_number TEXT,
      contract_title TEXT DEFAULT 'Контракт Сбербанк 2026 (3 категория)',
      region TEXT NOT NULL,
      work_category TEXT NOT NULL,
      work_name TEXT NOT NULL,
      tier_range TEXT,
      unit TEXT DEFAULT 'порт',
      price NUMERIC NOT NULL,
      min_qty NUMERIC DEFAULT 0,
      max_qty NUMERIC DEFAULT 999999,
      location_name TEXT,
      is_remote_location BOOLEAN DEFAULT false,
      recommended_subcontract_price NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_customer_tariffs_region ON customer_tariffs(region);
    CREATE INDEX IF NOT EXISTS idx_customer_tariffs_category ON customer_tariffs(work_category);
    CREATE INDEX IF NOT EXISTS idx_customer_tariffs_work_name ON customer_tariffs(work_name);
    CREATE INDEX IF NOT EXISTS idx_customer_tariffs_remote ON customer_tariffs(is_remote_location);
  `);
}

function detectWorkCategory(workName) {
  const wLower = workName.toLowerCase();
  if (wLower.includes('логистическ') || wLower.includes('выезд')) {
    if (wLower.includes('россия,') || wLower.includes('район') || wLower.includes('пгт') || wLower.includes(' г.') || wLower.includes(' с.')) {
      return 'Логистика (удаленные НП)';
    }
    return 'Логистика (расстояние)';
  }
  if (wLower.includes('оптическ') || wLower.includes('волокн') || wLower.includes('os2') || wLower.includes('om3')) {
    return 'Оптика';
  }
  if (wLower.includes('шкаф') || wLower.includes('стойк')) {
    return 'Шкафы';
  }
  if (wLower.includes('демонтаж') || wLower.includes('перемещение')) {
    return 'Демонтаж и реконструкция';
  }
  if (wLower.includes('патч-панел') || wLower.includes('органайзер') || wLower.includes('организатор')) {
    return 'Патч-панели и аксессуары';
  }
  if (wLower.includes('материалов заказчика')) {
    return 'Монтаж из давальческих ТМЦ';
  }
  return 'СКС';
}

function detectTierRange(workName) {
  if (/до\s*48\s*порт/i.test(workName)) return 'до 48';
  if (/от\s*49\s*до\s*96/i.test(workName)) return '49-96';
  if (/от\s*97\s*до\s*144/i.test(workName)) return '97-144';
  if (/от\s*145/i.test(workName) || /более\s*144/i.test(workName)) return '145+';
  if (/до\s*50\s*км/i.test(workName)) return '0-50 км';
  if (/от\s*50\s*до\s*100\s*км/i.test(workName)) return '50-100 км';
  if (/от\s*100\s*до\s*200\s*км/i.test(workName)) return '100-200 км';
  if (/от\s*200\s*до\s*300\s*км/i.test(workName)) return '200-300 км';
  if (/от\s*300/i.test(workName)) return 'более 300 км';
  return 'фиксированный';
}

function detectUnit(workName) {
  const wLower = workName.toLowerCase();
  if (wLower.includes('порт')) return 'порт';
  if (wLower.includes('шкаф')) return 'шт';
  if (wLower.includes('выезд') || wLower.includes('логистик')) return 'выезд';
  if (wLower.includes('км')) return 'км';
  return 'шт';
}

function calculateRecommendedSubPrice(category, price, tierRange) {
  // Стандартная маржа генерального подрядчика: 55-65%
  // Субподрядчику выплачивается ~35-45% от тарифа Заказчика, округленно
  if (category === 'СКС') {
    return Math.round(price * 0.35 / 50) * 50; // например 13337 * 0.35 = 4668 -> 4650
  }
  if (category === 'Оптика') {
    return Math.round(price * 0.38 / 100) * 100;
  }
  if (category === 'Шкафы') {
    return Math.round(price * 0.35 / 100) * 100;
  }
  if (category.includes('Логистика')) {
    // В логистике субподрядчику отдаем большую часть (50-60%) на бензин/амортизацию
    return Math.round(price * 0.55 / 100) * 100;
  }
  return Math.round(price * 0.40 / 50) * 50;
}

// Карта соответствия удаленных населенных пунктов регионам из таблицы
const REGION_SUBREGION_MAP = {
  'Чита': ['Забайкальский', 'Чита', 'Чара', 'Могоча', 'Борзя'],
  'Улан-Удэ': ['Бурятия', 'Нижнеангарск', 'Таксимо', 'Северобайкальск'],
  'Томск': ['Томск', 'Стрежевой', 'Александровское', 'Каргасок', 'Васюган', 'Кедровый', 'Парабель'],
  'Анадырь': ['Анадырь', 'Чукотк', 'Билибино', 'Певек', 'Эгвекинот', 'Провидения'],
  'Ханты-Мансийск Сургут': ['Ханты', 'ХМАО', 'Сургут', 'Югра', 'Когалым', 'Радужный', 'Нягань', 'Урай', 'Белоярский', 'Мегион', 'Лангепас', 'Пыть-Ях'],
  'Н Уренгой Салехард': ['Ямало', 'ЯНАО', 'Салехард', 'Уренгой', 'Надым', 'Лабытнанги', 'Тарко-Сале', 'Муравленко', 'Губкинский', 'Пурпе'],
  'Горно-Алтайск': ['Алтай', 'Кош-Агач', 'Улаган', 'Усть-Кокса', 'Онгудай'],
  'Кемерово': ['Кемеров', 'Кузбасс', 'Таштагол', 'Шерегеш', 'Тисуль', 'Мариинск'],
  'Красноярск': ['Красноярск', 'Норильск', 'Дудинка', 'Енисейск', 'Лесосибирск', 'Богучаны', 'Кодинск', 'Туруханск'],
  'Мурманск': ['Мурманск', 'Заполярный', 'Никель', 'Кандалакша', 'Ковдор', 'Умба', 'Ловозеро'],
  'Кызыл': ['Тыва', 'Тува', 'Кызыл', 'Ак-Довурак', 'Шагонар', 'Чадан'],
  'Сыктывкар': ['Коми', 'Сыктывкар', 'Нарьян-Мар', 'Воркута', 'Печора', 'Усинск', 'Инта', 'Ухта', 'Сосногорск', 'Вуктыл', 'Емва'],
  'Петрозаводск': ['Карелия', 'Петрозаводск', 'Костомукша', 'Сегежа', 'Сортавала', 'Кемь', 'Беломорск', 'Пудож', 'Калевала'],
  'Великий Новгород': ['Новгород', 'Боровичи', 'Старая Русса', 'Валдай', 'Чудово', 'Пестово', 'Крестецкий', 'Усть-Волма'],
  'Вологда': ['Волог', 'Череповец', 'Великий Устюг', 'Сокол', 'Вытегра', 'Тотьма'],
  'Архангельск': ['Архангельск', 'Северодвинск', 'Котлас', 'Коряжма', 'Мирный', 'Онега', 'Вельск', 'Няндома', 'Мезень'],
  'Калининград': ['Калининград', 'Советск', 'Черняховск', 'Балтийск', 'Гусев'],
  'Смоленск': ['Смоленск', 'Вязьма', 'Рославль', 'Ярцево', 'Сафоново'],
  'Псков': ['Псков', 'Великие Луки', 'Остров', 'Невель', 'Опочка', 'Печоры']
};

function resolveRemoteRegion(workName, currentSectionRegion, allRegions) {
  const wLower = workName.toLowerCase();
  for (const [regName, keywords] of Object.entries(REGION_SUBREGION_MAP)) {
    if (keywords.some(k => wLower.includes(k.toLowerCase()))) {
      const found = allRegions.find(r => r.toLowerCase() === regName.toLowerCase() || r.toLowerCase().includes(regName.toLowerCase()));
      if (found) return found;
    }
  }
  return currentSectionRegion || 'Чита';
}

export async function seedSberTariffs() {
  console.log('[SeedSberTariffs] Starting customer tariffs database population...');
  await initCustomerTariffsTable();

  // Ищем файл данных в нескольких возможных путях
  const candidates = [
    path.join(__dirname, '../../scratch/sber_2026_data.csv'),
    'C:/Users/n.chajka/.gemini/antigravity/brain/85cf2232-7289-47c4-933d-97a58bbfedb9/scratch/sber_2026_data.csv',
    path.join(process.cwd(), 'scratch/sber_2026_data.csv')
  ];

  let csvPath = candidates.find(p => fs.existsSync(p));
  if (!csvPath) {
    console.warn('[SeedSberTariffs] CSV file sber_2026_data.csv not found in candidate paths.');
    return;
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(content);
  if (!rows || rows.length < 3) {
    console.warn('[SeedSberTariffs] Invalid CSV content or insufficient rows.');
    return;
  }

  const regions = rows[0].slice(1).map(r => r.replace(/^"+|"+$/g, '').trim());
  const contractNumbers = rows[1].slice(1).map(c => c.replace(/^"+|"+$/g, '').trim());

  console.log(`[SeedSberTariffs] Found ${regions.length} regions in Sberbank 2026 tariff schedule.`);

  // Очищаем существующие тарифы Сбера перед полным обновлением
  await pool.query(`DELETE FROM customer_tariffs WHERE customer_tag = 'ПАО Сбербанк'`);

  let insertedCount = 0;
  let currentSectionRegion = null;
  let isRemoteSection = false;

  for (let rIdx = 2; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const workName = row[0].replace(/^"+|"+$/g, '').trim();
    if (!workName) continue;

    if (workName.includes('ЛОГИСТИЧЕСКАЯ СОСТАВЛЯЮЩАЯ')) {
      isRemoteSection = false;
      continue;
    }

    // Проверяем, не является ли строка названием региона-секции для удаленных НП
    const matchedRegion = regions.find(r => r.toLowerCase() === workName.toLowerCase()) ||
                          Object.keys(REGION_SUBREGION_MAP).find(r => r.toLowerCase() === workName.toLowerCase());
    if (matchedRegion) {
      currentSectionRegion = matchedRegion;
      isRemoteSection = true;
      continue;
    }

    const category = detectWorkCategory(workName);
    const tierRange = detectTierRange(workName);
    const unit = detectUnit(workName);

    if (category === 'Логистика (удаленные НП)') {
      // Это строка конкретного удаленного населенного пункта
      const targetRegion = resolveRemoteRegion(workName, currentSectionRegion, regions);
      const regIdx = regions.findIndex(r => r === targetRegion);
      const contractNum = regIdx !== -1 ? contractNumbers[regIdx] : (contractNumbers[0] || 'ГК-СБЕР-2026');

      // Ищем значение цены (в колонке 1 или в соответствующей колонке)
      let priceVal = null;
      for (let c = 1; c < row.length; c++) {
        if (row[c] && row[c] !== '-' && row[c] !== '') {
          const p = parseFloat(row[c].replace(/\s+/g, '').replace(',', '.'));
          if (!isNaN(p) && p > 0) {
            priceVal = p;
            break;
          }
        }
      }

      if (priceVal && priceVal > 0) {
        const locationName = workName.replace(/Стоимость логистической составляющей за один выезд работы в/i, '').replace(/Россия,?\s*/i, '').trim();
        const recommendedSubPrice = calculateRecommendedSubPrice(category, priceVal, tierRange);

        await pool.query(`
          INSERT INTO customer_tariffs (
            customer_tag, contract_agreement_number, contract_title, region,
            work_category, work_name, tier_range, unit, price,
            min_qty, max_qty, location_name, is_remote_location, recommended_subcontract_price
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          'ПАО Сбербанк',
          contractNum,
          'Контракт Сбербанк 2026 (3 категория)',
          targetRegion,
          category,
          workName,
          tierRange,
          unit,
          priceVal,
          0,
          999999,
          locationName,
          true,
          recommendedSubPrice
        ]);
        insertedCount++;
      }
    } else {
      // Это стандартная позиция СМР или логистики по расстоянию для всех регионов
      for (let cIdx = 0; cIdx < regions.length; cIdx++) {
        const region = regions[cIdx];
        const contractNum = contractNumbers[cIdx];
        const valStr = row[cIdx + 1];
        if (!valStr || valStr === '-' || valStr === '') continue;

        const priceVal = parseFloat(valStr.replace(/\s+/g, '').replace(',', '.'));
        if (isNaN(priceVal) || priceVal <= 0) continue;

        let minQty = 0;
        let maxQty = 999999;
        if (tierRange === 'до 48') { minQty = 1; maxQty = 48; }
        else if (tierRange === '49-96') { minQty = 49; maxQty = 96; }
        else if (tierRange === '97-144') { minQty = 97; maxQty = 144; }
        else if (tierRange === '145+') { minQty = 145; maxQty = 999999; }
        else if (tierRange === '0-50 км') { minQty = 0; maxQty = 50; }
        else if (tierRange === '50-100 км') { minQty = 50; maxQty = 100; }
        else if (tierRange === '100-200 км') { minQty = 100; maxQty = 200; }
        else if (tierRange === '200-300 км') { minQty = 200; maxQty = 300; }

        const recommendedSubPrice = calculateRecommendedSubPrice(category, priceVal, tierRange);

        await pool.query(`
          INSERT INTO customer_tariffs (
            customer_tag, contract_agreement_number, contract_title, region,
            work_category, work_name, tier_range, unit, price,
            min_qty, max_qty, location_name, is_remote_location, recommended_subcontract_price
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          'ПАО Сбербанк',
          contractNum,
          'Контракт Сбербанк 2026 (3 категория)',
          region,
          category,
          workName,
          tierRange,
          unit,
          priceVal,
          minQty,
          maxQty,
          null,
          false,
          recommendedSubPrice
        ]);
        insertedCount++;
      }
    }
  }

  console.log(`[SeedSberTariffs] Successfully seeded ${insertedCount} customer tariffs into DB!`);

  // Теперь создаем/обновляем базовые региональные прайсы субподряда на 2026 год
  await seedSubcontractBasePriceLists();
}

/**
 * Создание базовых прайсов субподряда 2026 года на основе тарифов Заказчика
 */
async function seedSubcontractBasePriceLists() {
  console.log('[SeedSberTariffs] Seeding regional subcontract price lists for 2026...');

  const regionalPackages = [
    {
      name: 'Базовый прайс субподряда 2026 — Северо-Запад (СПб, ЛО, Карелия, Мурманск, Архангельск, Коми)',
      customer_tag: 'ПАО Сбербанк (Северо-Запад)',
      region: 'Северо-Западный ФО',
      sampleRegion: 'Санкт-Петербург',
      items: [
        { code: 'PORT_5E_LE48', name: 'Монтаж порта СКС кат. 5е (до 48 портов)', unit: 'порт', p1: 3800, p2: 3200, thresh: 48, comment: 'Тариф Сбера: 8 624 ₽' },
        { code: 'PORT_5E_49_96', name: 'Монтаж порта СКС кат. 5е (от 49 до 96 портов)', unit: 'порт', p1: 3200, p2: 2900, thresh: 96, comment: 'Тариф Сбера: 7 600 ₽' },
        { code: 'PORT_OPT_OS2', name: 'Монтаж оптического дуплексного порта OS2', unit: 'порт', p1: 8500, p2: 7500, thresh: 48, comment: 'Тариф Сбера: 21 560 ₽' },
        { code: 'CAB_42U_INSTALL', name: 'Сборка и установка шкафа напольного 42U', unit: 'шт', p1: 14000, p2: 12000, thresh: 1, comment: 'Тариф Сбера: 39 900 ₽' },
        { code: 'CAB_32U_INSTALL', name: 'Сборка и установка шкафа напольного 32U', unit: 'шт', p1: 11000, p2: 9500, thresh: 1, comment: 'Тариф Сбера: 34 650 ₽' },
        { code: 'CAB_WALL_INSTALL', name: 'Монтаж шкафа настенного до 18U', unit: 'шт', p1: 5500, p2: 4500, thresh: 2, comment: 'Тариф Сбера: 13 475 ₽' },
        { code: 'DEMOUNT_PORT', name: 'Демонтаж порта СКС без сохранения', unit: 'порт', p1: 1100, p2: 900, thresh: 48, comment: 'Тариф Сбера: 3 234 ₽' },
        { code: 'ROAD_KM', name: 'Компенсация удаленности (за 1 км пути)', unit: 'км', p1: 45, p2: 40, thresh: 100, is_variable: true, comment: 'По сетке километража' },
        { code: 'DIEM_PER_DAY', name: 'Суточные расходы монтажников (в командировке)', unit: 'сутки', p1: 1500, p2: 1500, thresh: 1, comment: 'Питание и проживание' }
      ]
    },
    {
      name: 'Базовый прайс субподряда 2026 — Сибирь и Дальний Восток (Чита, Бурятия, Томск, Кузбасс, Красноярск)',
      customer_tag: 'ПАО Сбербанк (Сибирь и ДВ)',
      region: 'Сибирь и Дальний Восток',
      sampleRegion: 'Чита',
      items: [
        { code: 'PORT_5E_LE48', name: 'Монтаж порта СКС кат. 5е (до 48 портов)', unit: 'порт', p1: 4600, p2: 4000, thresh: 48, comment: 'Тариф Сбера: 13 337.50 ₽' },
        { code: 'PORT_5E_49_96', name: 'Монтаж порта СКС кат. 5е (от 49 до 96 портов)', unit: 'порт', p1: 4000, p2: 3600, thresh: 96, comment: 'Тариф Сбера: 11 500 ₽' },
        { code: 'PORT_OPT_OS2', name: 'Монтаж оптического дуплексного порта OS2', unit: 'порт', p1: 9800, p2: 8900, thresh: 48, comment: 'Тариф Сбера: 26 141.50 ₽' },
        { code: 'CAB_42U_INSTALL', name: 'Сборка и установка шкафа напольного 42U', unit: 'шт', p1: 16000, p2: 14000, thresh: 1, comment: 'Тариф Сбера: 44 550 ₽' },
        { code: 'CAB_32U_INSTALL', name: 'Сборка и установка шкафа напольного 32U', unit: 'шт', p1: 12500, p2: 11000, thresh: 1, comment: 'Тариф Сбера: 35 890 ₽' },
        { code: 'CAB_WALL_INSTALL', name: 'Монтаж шкафа настенного до 18U', unit: 'шт', p1: 6500, p2: 5500, thresh: 2, comment: 'Тариф Сбера: 20 273 ₽' },
        { code: 'DEMOUNT_PORT', name: 'Демонтаж порта СКС без сохранения', unit: 'порт', p1: 1600, p2: 1300, thresh: 48, comment: 'Тариф Сбера: 5 121.60 ₽' },
        { code: 'ROAD_KM', name: 'Компенсация удаленности (за 1 км пути)', unit: 'км', p1: 55, p2: 50, thresh: 100, is_variable: true, comment: 'По сетке километража Сибири' },
        { code: 'DIEM_PER_DAY', name: 'Суточные расходы монтажников (в командировке)', unit: 'сутки', p1: 2000, p2: 2000, thresh: 1, comment: 'Питание и проживание' }
      ]
    },
    {
      name: 'Базовый прайс субподряда 2026 — Крайний Север (ЯНАО, ХМАО, Салехард, Новый Уренгой, Сургут, Анадырь)',
      customer_tag: 'ПАО Сбербанк (Крайний Север)',
      region: 'ЯНАО / ХМАО / Чукотка',
      sampleRegion: 'Н Уренгой Салехард',
      items: [
        { code: 'PORT_5E_LE48', name: 'Монтаж порта СКС кат. 5е (до 48 портов)', unit: 'порт', p1: 6500, p2: 5800, thresh: 48, comment: 'Тариф Сбера: 17 000 ₽ / Анадырь: 39 550 ₽' },
        { code: 'PORT_5E_49_96', name: 'Монтаж порта СКС кат. 5е (от 49 до 96 портов)', unit: 'порт', p1: 5800, p2: 5200, thresh: 96, comment: 'Северные коэффициенты' },
        { code: 'PORT_OPT_OS2', name: 'Монтаж оптического дуплексного порта OS2', unit: 'порт', p1: 12000, p2: 10500, thresh: 48, comment: 'Тариф Сбера: 24 225 ₽' },
        { code: 'CAB_42U_INSTALL', name: 'Сборка и установка шкафа напольного 42U', unit: 'шт', p1: 22000, p2: 19000, thresh: 1, comment: 'Тариф Сбера: 46 732 ₽' },
        { code: 'CAB_32U_INSTALL', name: 'Сборка и установка шкафа напольного 32U', unit: 'шт', p1: 18000, p2: 15500, thresh: 1, comment: 'Тариф Сбера: 37 000 ₽' },
        { code: 'CAB_WALL_INSTALL', name: 'Монтаж шкафа настенного до 18U', unit: 'шт', p1: 9000, p2: 7500, thresh: 2, comment: 'Тариф Сбера: 21 250 ₽' },
        { code: 'DEMOUNT_PORT', name: 'Демонтаж порта СКС без сохранения', unit: 'порт', p1: 2200, p2: 1800, thresh: 48, comment: 'Тариф Сбера: 5 100 ₽' },
        { code: 'ROAD_KM', name: 'Компенсация удаленности по зимнику / трассе (за 1 км)', unit: 'км', p1: 85, p2: 75, thresh: 100, is_variable: true, comment: 'Северный километраж' },
        { code: 'DIEM_PER_DAY', name: 'Суточные расходы монтажников (Крайний Север)', unit: 'сутки', p1: 3000, p2: 3000, thresh: 1, comment: 'Повышенные суточные' }
      ]
    },
    {
      name: 'Базовый прайс субподряда 2026 — Центр и Поволжье (Калуга, Тверь, Тула, Смоленск, Курск, Ижевск, Пермь)',
      customer_tag: 'ПАО Сбербанк (Центр и Поволжье)',
      region: 'Центральный и Приволжский ФО',
      sampleRegion: 'Калуга',
      items: [
        { code: 'PORT_5E_LE48', name: 'Монтаж порта СКС кат. 5е (до 48 портов)', unit: 'порт', p1: 3500, p2: 3000, thresh: 48, comment: 'Тариф Сбера: 8 624 ₽' },
        { code: 'PORT_5E_49_96', name: 'Монтаж порта СКС кат. 5е (от 49 до 96 портов)', unit: 'порт', p1: 3000, p2: 2700, thresh: 96, comment: 'Тариф Сбера: 7 600 ₽' },
        { code: 'PORT_OPT_OS2', name: 'Монтаж оптического дуплексного порта OS2', unit: 'порт', p1: 7800, p2: 7000, thresh: 48, comment: 'Тариф Сбера: 21 560 ₽' },
        { code: 'CAB_42U_INSTALL', name: 'Сборка и установка шкафа напольного 42U', unit: 'шт', p1: 13000, p2: 11000, thresh: 1, comment: 'Тариф Сбера: 39 900 ₽' },
        { code: 'CAB_32U_INSTALL', name: 'Сборка и установка шкафа напольного 32U', unit: 'шт', p1: 10500, p2: 9000, thresh: 1, comment: 'Тариф Сбера: 29 400 ₽' },
        { code: 'CAB_WALL_INSTALL', name: 'Монтаж шкафа настенного до 18U', unit: 'шт', p1: 5000, p2: 4200, thresh: 2, comment: 'Тариф Сбера: 13 475 ₽' },
        { code: 'DEMOUNT_PORT', name: 'Демонтаж порта СКС без сохранения', unit: 'порт', p1: 1100, p2: 900, thresh: 48, comment: 'Тариф Сбера: 3 234 ₽' },
        { code: 'ROAD_KM', name: 'Компенсация удаленности (за 1 км пути)', unit: 'км', p1: 40, p2: 35, thresh: 100, is_variable: true, comment: 'Центральный регион' },
        { code: 'DIEM_PER_DAY', name: 'Суточные расходы монтажников', unit: 'сутки', p1: 1500, p2: 1500, thresh: 1, comment: 'Питание и проживание' }
      ]
    },
    {
      name: 'Базовый прайс субподряда 2026 — Юг и Новые территории (Луганск, Донецк, Крым, Симферополь)',
      customer_tag: 'ПАО Сбербанк (Юг и Новые территории)',
      region: 'Южный ФО / Новые территории',
      sampleRegion: 'Луганск',
      items: [
        { code: 'PORT_5E_LE48', name: 'Монтаж порта СКС кат. 5е (до 48 портов)', unit: 'порт', p1: 6000, p2: 5200, thresh: 48, comment: 'Тариф Сбера: 22 750 ₽ / Донецк: 23 750 ₽' },
        { code: 'PORT_5E_49_96', name: 'Монтаж порта СКС кат. 5е (от 49 до 96 портов)', unit: 'порт', p1: 5200, p2: 4600, thresh: 96, comment: 'Специальный тариф региона' },
        { code: 'PORT_OPT_OS2', name: 'Монтаж оптического дуплексного порта OS2', unit: 'порт', p1: 11000, p2: 9800, thresh: 48, comment: 'Тариф Сбера: 37 310 ₽' },
        { code: 'CAB_42U_INSTALL', name: 'Сборка и установка шкафа напольного 42U', unit: 'шт', p1: 18000, p2: 15500, thresh: 1, comment: 'Тариф Сбера: 46 732 ₽' },
        { code: 'CAB_32U_INSTALL', name: 'Сборка и установка шкафа напольного 32U', unit: 'шт', p1: 14500, p2: 12500, thresh: 1, comment: 'Тариф Сбера: 38 220 ₽' },
        { code: 'CAB_WALL_INSTALL', name: 'Монтаж шкафа настенного до 18U', unit: 'шт', p1: 8500, p2: 7000, thresh: 2, comment: 'Тариф Сбера: 28 009 ₽' },
        { code: 'DEMOUNT_PORT', name: 'Демонтаж порта СКС без сохранения', unit: 'порт', p1: 2000, p2: 1600, thresh: 48, comment: 'Тариф Сбера: 7 076 ₽' },
        { code: 'ROAD_KM', name: 'Компенсация удаленности (за 1 км пути)', unit: 'км', p1: 60, p2: 50, thresh: 100, is_variable: true, comment: 'Повышенный тариф логистики' },
        { code: 'DIEM_PER_DAY', name: 'Суточные расходы монтажников (Южные регионы)', unit: 'сутки', p1: 2500, p2: 2500, thresh: 1, comment: 'Суточные' }
      ]
    }
  ];

  for (const pkg of regionalPackages) {
    // Проверяем, существует ли уже такой прайс
    const existRes = await pool.query(`SELECT id FROM contractor_price_lists WHERE name = $1 LIMIT 1`, [pkg.name]);
    let plId;
    if (existRes.rows.length) {
      plId = existRes.rows[0].id;
      await pool.query(`UPDATE contractor_price_lists SET customer_tag = $1, region = $2, is_active = true WHERE id = $3`, [
        pkg.customer_tag, pkg.region, plId
      ]);
    } else {
      const insRes = await pool.query(`
        INSERT INTO contractor_price_lists (name, customer_tag, region, is_active, is_default)
        VALUES ($1, $2, $3, true, false)
        RETURNING id
      `, [pkg.name, pkg.customer_tag, pkg.region]);
      plId = insRes.rows[0].id;
    }

    // Очищаем и перезаполняем позиции для этого базового прайса
    await pool.query(`DELETE FROM price_list_items WHERE price_list_id = $1`, [plId]);

    for (let idx = 0; idx < pkg.items.length; idx++) {
      const it = pkg.items[idx];
      await pool.query(`
        INSERT INTO price_list_items (
          price_list_id, work_code, work_name, unit, price_tier_1, price_tier_2,
          tier_threshold, is_variable_cost, comment, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        plId,
        it.code,
        it.name,
        it.unit,
        it.p1,
        it.p2,
        it.thresh || 3,
        it.is_variable || false,
        it.comment || '',
        idx + 1
      ]);
    }
  }

  console.log('[SeedSberTariffs] Regional subcontract price lists populated successfully!');
}

// Запуск напрямую через node
if (process.argv[1] && process.argv[1].endsWith('seedSberTariffs.js')) {
  seedSberTariffs()
    .then(() => {
      console.log('[SeedSberTariffs] Done!');
      process.exit(0);
    })
    .catch(err => {
      console.error('[SeedSberTariffs] Fatal error:', err);
      process.exit(1);
    });
}
