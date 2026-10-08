import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { resolveCityCoordinates } from './cityCoordinates.js';

/**
 * Преобразование даты Excel (число или строка) в формат YYYY-MM-DD
 */
export function excelDateToDateStr(val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') {
    // Excel base date: 1899-12-30 (accounting for 1900 leap year bug)
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }
  const str = String(val).trim();
  const match = str.match(/(\d{2})[./](\d{2})[./](\d{4})/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return null;
}

/**
 * Парсер денежных сумм из текста (например "1 366 362,44", "473 185,76")
 */
export function parseMoney(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).replace(/\s+/g, '').replace(/,/g, '.');
  const m = str.match(/[-+]?\d*\.?\d+/);
  return m ? parseFloat(m[0]) : 0;
}

/**
 * Парсер процентов снижения (например 0.69 или "47,00%")
 */
export function parsePercent(val) {
  if (val === undefined || val === null || val === '' || val === '-') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (str.includes('%')) {
    const num = parseMoney(str.replace('%', ''));
    return num > 0 ? num / 100 : 0;
  }
  return parseMoney(str);
}

/**
 * Автоклассификатор «О чем договор» по предмету работ
 */
export function classifyContract(subject) {
  if (!subject) return 'Прочее';
  const s = subject.toLowerCase();
  if (s.includes('поставка') || s.includes('приобретение') || s.includes('коммутатор') || s.includes('оборудован') || s.includes('кабель')) {
    if (s.includes('монтаж') || s.includes('установк') || s.includes('прокладк') || s.includes('создание') || s.includes('построение')) {
      return 'СМР и Поставка';
    }
    return 'Поставка';
  }
  if (s.includes('пнр') || s.includes('пусконаладоч')) return 'ПНР';
  if (s.includes('скс') || s.includes('лвс') || s.includes('сетей') || s.includes('сети') || s.includes('модернизация')) return 'СМР / СКС и ЛВС';
  if (s.includes('видеонаблюден') || s.includes('свн') || s.includes('камер')) return 'Видеонаблюдение';
  if (s.includes('обслуживан') || s.includes('техобслуж') || s.includes('то ') || s.endsWith(' то')) return 'ТО и Сервис';
  if (s.includes('проект') || s.includes('пир') || s.includes('изыскан')) return 'ПИР / Проектирование';
  if (s.includes('перевозк') || s.includes('транспорт') || s.includes('доставк') || s.includes('погрузк')) return 'Логистика / ПРР';
  if (s.includes('ремонт') || s.includes('монтаж') || s.includes('строитель')) return 'СМР / Монтаж';
  return 'Прочее';
}

/**
 * Парсер многолотовых договоров
 */
export function parseLots(placesRaw, numbersRaw) {
  if (!placesRaw) return [];
  const linesP = String(placesRaw).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const linesN = numbersRaw ? String(numbersRaw).split(/\r?\n/).map(l => l.trim()).filter(Boolean) : [];
  
  const lots = [];
  linesP.forEach((lp, idx) => {
    const lotMatch = lp.match(/лот\s*(\d+)[\s\-:]*(.*)/i);
    const lotNum = lotMatch ? parseInt(lotMatch[1], 10) : idx + 1;
    const lotPlace = lotMatch && lotMatch[2] ? lotMatch[2].trim() : lp;
    
    let lotContractNum = '';
    if (linesN.length) {
      const matchedNumLine = linesN.find(ln => {
        const m = ln.match(/лот\s*(\d+)/i);
        return m && parseInt(m[1], 10) === lotNum;
      });
      if (matchedNumLine) {
        lotContractNum = matchedNumLine.replace(/лот\s*\d+[\s\-:]*/i, '').replace(/^[№N\s]+/, '').trim();
      } else if (linesN[idx]) {
        lotContractNum = linesN[idx].replace(/лот\s*\d+[\s\-:]*/i, '').replace(/^[№N\s]+/, '').trim();
      }
    }
    lots.push({
      lot_number: lotNum,
      place: lotPlace,
      contract_number: lotContractNum
    });
  });
  return lots;
}

/**
 * Парсер дополнительных соглашений (ДС) по регионам
 */
export function parseAgreementsFromData(placesRaw, numbersRaw, lotsList) {
  const linesPlace = placesRaw ? String(placesRaw).split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  const linesNum = numbersRaw ? String(numbersRaw).split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];

  const isMultiRegion = linesPlace.length > 1 && linesPlace.some(l => /^(?:лот\s*)?\d+[\s\-:.]+/i.test(l));
  const isMultiNum = linesNum.length > 1 && linesNum.some(l => /^(?:лот\s*)?\d+[\s\-:.]+/i.test(l));
  const hasLots = Array.isArray(lotsList) && lotsList.length > 0;

  if (!isMultiRegion && !isMultiNum && !hasLots) {
    return [];
  }

  const map = new Map();

  linesPlace.forEach((lp, idx) => {
    const m = lp.match(/^(?:лот\s*)?(\d+)[\s\-:.]+(.*)/i);
    const num = m ? parseInt(m[1], 10) : idx + 1;
    const reg = m && m[2] ? m[2].trim() : lp;
    if (!map.has(num)) {
      map.set(num, { num, region: reg, extNum: '' });
    } else {
      map.get(num).region = reg;
    }
  });

  linesNum.forEach((ln, idx) => {
    const m = ln.match(/^(?:лот\s*)?(\d+)[\s\-:.]+(.*)/i);
    const num = m ? parseInt(m[1], 10) : idx + 1;
    let ext = m && m[2] ? m[2].trim() : ln;
    ext = ext.replace(/^[№N#\s]+/, '').trim();
    if (!map.has(num)) {
      map.set(num, { num, region: '', extNum: ext });
    } else {
      map.get(num).extNum = ext;
    }
  });

  if (hasLots) {
    lotsList.forEach((lot, idx) => {
      const num = parseInt(lot.lot_number || idx + 1, 10);
      const reg = lot.place || '';
      const ext = String(lot.contract_number || '').replace(/^[№N#\s]+/, '').trim();
      if (!map.has(num)) {
        map.set(num, { num, region: reg, extNum: ext });
      } else {
        const cur = map.get(num);
        if (!cur.region && reg) cur.region = reg;
        if (!cur.extNum && ext) cur.extNum = ext;
      }
    });
  }

  const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
  return sortedKeys.map(k => {
    const item = map.get(k);
    return {
      agreement_number: item.num,
      agreement_code: `ДС-${item.num}`,
      region: item.region || `Регион ${item.num}`,
      city: item.region || '',
      external_number: item.extNum || ''
    };
  });
}

const RU_MONTHS = {
  'январ': 0, 'феврал': 1, 'март': 2, 'апрел': 3, 'ма': 4, 'июн': 5,
  'июл': 6, 'август': 7, 'сентябр': 8, 'октябр': 9, 'ноябр': 10, 'декабр': 11
};

/**
 * Прибавление рабочих дней к дате (пропуская субботы и воскресенья)
 */
export function addWorkingDays(startDate, days) {
  let cur = new Date(startDate.getTime());
  let added = 0;
  while (added < days) {
    cur.setDate(cur.getDate() + 1);
    const dayOfWeek = cur.getDay(); // 0 - воскресенье, 6 - суббота
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return cur;
}

/**
 * Парсер даты из текста на русском языке (DD.MM.YYYY или '11 декабря 2023')
 */
export function parseRussianDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  // 1. DD.MM.YYYY
  const m1 = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m1) {
    const d = parseInt(m1[1], 10);
    const m = parseInt(m1[2], 10) - 1;
    const y = parseInt(m1[3], 10);
    const dt = new Date(Date.UTC(y, m, d));
    return dt.toISOString().split('T')[0];
  }
  // 2. Словесный месяц: '11 декабря 2023'
  const m2 = s.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/iu);
  if (m2) {
    const d = parseInt(m2[1], 10);
    const monStr = m2[2].toLowerCase();
    const y = parseInt(m2[3], 10);
    for (const [key, idx] of Object.entries(RU_MONTHS)) {
      if (monStr.startsWith(key)) {
        const dt = new Date(Date.UTC(y, idx, d));
        return dt.toISOString().split('T')[0];
      }
    }
  }
  return null;
}

/**
 * Умный расчет даты окончания работ (дедлайна)
 * @param {string} raw - Текст срока работ (например: '30 календарных дней', 'до 15.07.2017', '20 рабочих дней')
 * @param {string|Date} contractDateStr - Дата заключения договора (YYYY-MM-DD)
 * @returns {string|null} - Дата в формате YYYY-MM-DD или null
 */
export function computeDeadlineDate(raw, contractDateStr) {
  if (!raw) return null;
  const rawStr = String(raw).trim();
  if (!rawStr || rawStr === '-' || /по заказ/i.test(rawStr)) return null;

  // 1. Ищем явную дату в строке (в скобках, через 'до ...', 'по ...' или просто дату)
  const allDates = [];
  const re = /(\d{1,2}[./]\d{1,2}[./]\d{4})/g;
  let match;
  while ((match = re.exec(rawStr)) !== null) {
    const parsed = parseRussianDate(match[1]);
    if (parsed) allDates.push(parsed);
  }
  if (allDates.length > 0) {
    return allDates[allDates.length - 1]; // Берем финальную указанную дату
  }

  // Проверяем словесную дату типа 'до 11 декабря 2023 года'
  const verbalDate = parseRussianDate(rawStr);
  if (verbalDate) return verbalDate;

  // 2. Если явной даты нет, но известна дата заключения договора
  if (contractDateStr) {
    const baseDate = new Date(contractDateStr);
    if (!isNaN(baseDate.getTime())) {
      // Рабочие дни (например: '20 рабочих дней')
      const workMatch = rawStr.match(/(\d+)\s*(?:рабоч|раб)[^\s]*\s*дн/iu);
      if (workMatch) {
        const days = parseInt(workMatch[1], 10);
        return addWorkingDays(baseDate, days).toISOString().split('T')[0];
      }

      // Календарные дни (например: '30 календарных дней', '120 дней')
      const calMatch = rawStr.match(/(\d+)\s*(?:календарн|календ)[^\s]*\s*дн/iu) || rawStr.match(/(\d+)\s*дн/iu);
      if (calMatch) {
        const days = parseInt(calMatch[1], 10);
        const res = new Date(baseDate.getTime());
        res.setDate(res.getDate() + days);
        return res.toISOString().split('T')[0];
      }

      // Месяцы (например: 'в течение 3 месяцев')
      const monthMatch = rawStr.match(/(\d+)\s*(?:месяц|мес)[^\s]*/iu);
      if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        const res = new Date(baseDate.getTime());
        res.setMonth(res.getMonth() + months);
        return res.toISOString().split('T')[0];
      }
    }
  }

  return null;
}

/**
 * Разбор отдельной строки Excel-файла реестра
 */
export function parseContractRow(r) {
  if (!r || !r.some(c => c !== undefined && c !== null && String(c).trim() !== '')) {
    return null;
  }

  // 0: Вн./№
  const internalNumber = r[0] ? String(r[0]).trim() : '';

  // 1: Регион, город, компания
  const regionRaw = r[1] ? String(r[1]).trim() : '';
  const regionLines = regionRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let ourEntityRegion = regionLines[0] || '';
  let ourEntityName = 'ООО «Ультима»';
  if (regionRaw.toLowerCase().includes('к10')) {
    ourEntityName = 'ООО «К10»';
  } else if (/(?:^|[^а-яa-z0-9])кс(?:[^а-яa-z0-9]|$)|кабельн/i.test(regionRaw)) {
    ourEntityName = 'ООО «Кабельные Системы»';
  } else if (regionRaw.toLowerCase().includes('ультима')) {
    ourEntityName = 'ООО «Ультима»';
  }

  // 2: Заказчик
  let customerName = r[2] ? String(r[2]).trim() : '';
  if (!customerName) {
    if (internalNumber.startsWith('0324') || internalNumber.startsWith('0524') || regionRaw.includes('К10')) {
      customerName = 'ПАО «Сбербанк России»';
    } else {
      customerName = 'Не указан';
    }
  }

  // 3: Краткое название работ (Предмет)
  const subject = r[3] ? String(r[3]).trim() : '';
  const contractTypeSummary = classifyContract(subject);

  // 4: Ссылка на закупку
  let zakupkiUrl = r[4] ? String(r[4]).trim() : '';
  if (zakupkiUrl && /^\d+$/.test(zakupkiUrl)) {
    zakupkiUrl = `https://zakupki.gov.ru/epz/order/notice/ea20/view/common-info.html?regNumber=${zakupkiUrl}`;
  }

  // 5: Место поставки
  let deliveryPlace = r[5] ? String(r[5]).trim() : '';

  // 8: Номер контракта & 9: Дата контракта
  const isMultiLot = (r[5] && String(r[5]).toLowerCase().includes('лот')) || (r[8] && String(r[8]).toLowerCase().includes('лот'));
  const lots = isMultiLot ? parseLots(r[5], r[8]) : [];
  const agreements = parseAgreementsFromData(r[5], r[8], lots);

  let contractNumber = r[8] ? String(r[8]).trim() : '';
  let contractDate = null;
  const dateColRaw = r[9];

  let dateLines = [];
  if (typeof dateColRaw === 'number') {
    contractDate = excelDateToDateStr(dateColRaw);
  } else if (dateColRaw) {
    const dateStr = String(dateColRaw).trim();
    dateLines = dateStr.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (dateLines.length > 0) {
      contractDate = excelDateToDateStr(dateLines[0]);
    }
    // Если в 8-й колонке номера не было, но во 2-й строке даты он есть
    if (!contractNumber && dateLines.length > 1) {
      contractNumber = dateLines[1].replace(/^[№N\s]+/, '').trim();
    }
  }

  // Очистка полей для многолотовых договоров / нескольких ДС
  if (agreements.length > 0) {
    const linesP = r[5] ? String(r[5]).split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
    if (linesP.length > 1) {
      const cities = agreements.map(a => a.region).filter(Boolean);
      if (cities.length <= 4) {
        deliveryPlace = cities.join(', ');
      } else {
        deliveryPlace = `${cities.slice(0, 3).join(', ')} и ещё ${cities.length - 3} рег.`;
      }
    }
    const linesN = r[8] ? String(r[8]).split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
    if (linesN.length > 1) {
      contractNumber = `Многолотовый (${agreements.length} ДС)`;
    }
  }

  // 6: Срок выполнения работ
  const deadlineRaw = r[6] ? String(r[6]).trim() : '';
  let deadlineDate = computeDeadlineDate(deadlineRaw, contractDate);
  // Если не найдена дата в сроке выполнения, но в 3-й строке даты контракта указано окончание действия (например: '(31.12.2017)')
  if (!deadlineDate && dateLines.length > 2) {
    const matchEnd = dateLines[2].match(/\((\d{2}[./]\d{2}[./]\d{4})\)/);
    if (matchEnd) deadlineDate = excelDateToDateStr(matchEnd[1]);
  }

  // 7: Срок оплаты (Условия оплаты)
  const paymentTerms = r[7] ? String(r[7]).trim() : '';

  // 10: Обеспечение контракта
  let securityAmount = 0;
  let securityCondition = '';
  const secRaw = r[10];
  if (typeof secRaw === 'number') {
    securityAmount = secRaw;
  } else if (secRaw && secRaw !== '-') {
    const secStr = String(secRaw).trim();
    const moneyMatch = secStr.match(/(\d[\d\s]*[.,]\d{2})/);
    if (moneyMatch) {
      securityAmount = parseMoney(moneyMatch[1]);
      securityCondition = secStr.replace(moneyMatch[1], '').trim();
    } else {
      securityCondition = secStr;
    }
  }

  // 11: % снижения
  const discountPercent = parsePercent(r[11]);

  // 12: Площадка / цена
  let amount = 0;
  let platform = '';
  const priceColRaw = r[12];
  if (typeof priceColRaw === 'number') {
    amount = priceColRaw;
  } else if (priceColRaw && priceColRaw !== '-') {
    const priceStr = String(priceColRaw).trim();
    const lines = priceStr.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    
    // Ищем строку с суммой
    lines.forEach(line => {
      const hasDigit = /\d/.test(line);
      const isPurePlatform = /сбербанк|ртс|еэтп|фабрикант|росэлторг|тэк|газпром/i.test(line) && !/\d{4,}/.test(line.replace(/\s/g, ''));
      if (hasDigit && !isPurePlatform) {
        const parsed = parseMoney(line);
        if (parsed > 0 && amount === 0) amount = parsed;
      } else {
        platform = platform ? `${platform} ${line}` : line;
      }
    });
  }

  // 13: Контакты заказчика
  const contactsRaw = r[13] ? String(r[13]).trim() : '';

  // 14: Гарантийное обязательство / Статус
  const warrantyRaw = r[14] ? String(r[14]).trim() : '';
  let status = 'Действует';
  const wLower = warrantyRaw.toLowerCase();
  if (wLower.includes('завершено')) {
    status = 'Завершен';
  } else if (wLower.includes('ждем оплату') || wLower.includes('оплата')) {
    status = 'Ожидает оплаты';
  } else if (wLower.includes('расторгн')) {
    status = 'Расторгнут';
  }

  return {
    internal_number: internalNumber,
    contract_number: contractNumber,
    contract_date: contractDate,
    contract_type_summary: contractTypeSummary,
    customer_name: customerName,
    our_entity_region: ourEntityRegion,
    our_entity_name: ourEntityName,
    delivery_place: deliveryPlace,
    subject: subject,
    terms_text: '',
    zakupki_url: zakupkiUrl,
    deadline_raw: deadlineRaw,
    deadline_date: deadlineDate,
    payment_terms: paymentTerms,
    security_amount: securityAmount,
    security_condition: securityCondition,
    discount_percent: discountPercent,
    amount: amount,
    platform: platform,
    cloud_url: '',
    contacts_raw: contactsRaw,
    status: status,
    lots: lots,
    agreements: agreements,
    raw_data: {
      original_internal: r[0],
      original_region: r[1],
      original_customer: r[2],
      original_subject: r[3],
      original_link: r[4],
      original_place: r[5],
      original_deadline: r[6],
      original_payment: r[7],
      original_contract_num: r[8],
      original_contract_date: r[9],
      original_security: r[10],
      original_discount: r[11],
      original_platform_price: r[12],
      original_contacts: r[13],
      original_warranty: r[14]
    }
  };
}

/**
 * Основная функция импорта в PostgreSQL
 */
export async function importContractsFromExcel(filePath, pool) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл не найден: ${filePath}`);
  }

  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  let totalParsed = 0;
  let importedCount = 0;
  let updatedCount = 0;
  let multiLotCount = 0;
  const customerMap = new Map();

  // 1. Сначала загрузим существующих заказчиков из contractors
  const { rows: existingContractors } = await pool.query(`
    SELECT id, name_short, inn FROM contractors WHERE type = 'customer'
  `);
  existingContractors.forEach(c => {
    customerMap.set(c.name_short.trim().toLowerCase(), c.id);
  });

  // 2. Проходим по всем строкам Excel
  for (let i = 1; i < rows.length; i++) {
    const item = parseContractRow(rows[i]);
    if (!item || !item.internal_number) continue;

    totalParsed++;
    if ((item.lots && item.lots.length > 0) || (item.agreements && item.agreements.length > 0)) multiLotCount++;

    // Привязываем заказчика или создаем нового
    let customerId = null;
    const custKey = item.customer_name.trim().toLowerCase();
    if (customerMap.has(custKey)) {
      customerId = customerMap.get(custKey);
    } else if (item.customer_name && item.customer_name !== 'Не указан') {
      try {
        const innPseudo = 'CUST-' + Math.floor(1000000000 + Math.random() * 9000000000);
        const { rows: newCust } = await pool.query(`
          INSERT INTO contractors (name_short, name_full, inn, type, status)
          VALUES ($1, $2, $3, 'customer', 'active')
          ON CONFLICT (inn) DO NOTHING
          RETURNING id
        `, [item.customer_name, item.customer_name, innPseudo]);
        if (newCust && newCust.length > 0) {
          customerId = newCust[0].id;
          customerMap.set(custKey, customerId);
        }
      } catch (err) {
        console.warn(`Could not create customer ${item.customer_name}:`, err.message);
      }
    }

    // Сохраняем договор
    try {
      const existing = await pool.query(`
        SELECT id FROM contracts WHERE internal_number = $1 LIMIT 1
      `, [item.internal_number]);

      let contractId = null;

      if (existing.rows.length > 0) {
        contractId = existing.rows[0].id;
        await pool.query(`
          UPDATE contracts SET
            contract_number = COALESCE(NULLIF($1, ''), contract_number),
            contract_date = COALESCE($2, contract_date),
            contract_type_summary = $3,
            customer_name = $4,
            customer_id = COALESCE($5, customer_id),
            our_entity_region = $6,
            our_entity_name = $7,
            delivery_place = $8,
            subject = $9,
            zakupki_url = COALESCE(NULLIF($10, ''), zakupki_url),
            deadline_raw = $11,
            deadline_date = COALESCE($12, deadline_date),
            payment_terms = COALESCE(NULLIF($13, ''), payment_terms),
            security_amount = $14,
            security_condition = $15,
            discount_percent = $16,
            amount = $17,
            platform = $18,
            contacts_raw = $19,
            status = $20,
            lots = $21,
            raw_data = $22,
            updated_at = NOW()
          WHERE internal_number = $23
        `, [
          item.contract_number, item.contract_date, item.contract_type_summary,
          item.customer_name, customerId, item.our_entity_region, item.our_entity_name,
          item.delivery_place, item.subject, item.zakupki_url, item.deadline_raw,
          item.deadline_date, item.payment_terms, item.security_amount, item.security_condition,
          item.discount_percent, item.amount, item.platform, item.contacts_raw,
          item.status, JSON.stringify(item.lots), JSON.stringify(item.raw_data),
          item.internal_number
        ]);
        updatedCount++;
      } else {
        const ins = await pool.query(`
          INSERT INTO contracts (
            internal_number, contract_number, contract_date, contract_type_summary,
            customer_name, customer_id, our_entity_region, our_entity_name,
            delivery_place, subject, terms_text, zakupki_url,
            deadline_raw, deadline_date, payment_terms,
            security_amount, security_condition, discount_percent, amount,
            platform, cloud_url, contacts_raw, status, lots, raw_data
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '', $11,
            $12, $13, $14, $15, $16, $17, $18, $19, '', $20, $21, $22, $23
          ) RETURNING id
        `, [
          item.internal_number, item.contract_number, item.contract_date, item.contract_type_summary,
          item.customer_name, customerId, item.our_entity_region, item.our_entity_name,
          item.delivery_place, item.subject, item.zakupki_url,
          item.deadline_raw, item.deadline_date, item.payment_terms,
          item.security_amount, item.security_condition, item.discount_percent, item.amount,
          item.platform, item.contacts_raw, item.status, JSON.stringify(item.lots), JSON.stringify(item.raw_data)
        ]);
        contractId = ins.rows[0].id;
        importedCount++;
      }

      // Сохраняем дополнительные соглашения по регионам
      if (contractId && item.agreements && item.agreements.length > 0) {
        for (const ag of item.agreements) {
          const exAg = await pool.query(
            'SELECT id FROM contract_agreements WHERE contract_id = $1 AND agreement_number = $2 LIMIT 1',
            [contractId, ag.agreement_number]
          );
          const coords = resolveCityCoordinates(ag.city || ag.region) || resolveCityCoordinates(ag.region);
          const geoLat = coords ? coords.lat : null;
          const geoLon = coords ? coords.lon : null;

          if (exAg.rows.length === 0) {
            await pool.query(`
              INSERT INTO contract_agreements (
                contract_id, agreement_number, agreement_code, external_number,
                region, city, geo_lat, geo_lon, status, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW(), NOW())
            `, [contractId, ag.agreement_number, ag.agreement_code, ag.external_number, ag.region, ag.city, geoLat, geoLon]);
          } else {
            await pool.query(`
              UPDATE contract_agreements SET
                agreement_code = $1,
                external_number = COALESCE(NULLIF($2, ''), external_number),
                region = COALESCE(NULLIF($3, ''), region),
                city = COALESCE(NULLIF($4, ''), city),
                geo_lat = COALESCE(geo_lat, $5),
                geo_lon = COALESCE(geo_lon, $6),
                updated_at = NOW()
              WHERE id = $7
            `, [ag.agreement_code, ag.external_number, ag.region, ag.city, geoLat, geoLon, exAg.rows[0].id]);
          }
        }
      }
    } catch (err) {
      console.error(`Error saving contract ${item.internal_number}:`, err.message);
    }
  }

  return {
    totalParsed,
    importedCount,
    updatedCount,
    multiLotCount
  };
}
