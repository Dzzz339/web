
export function formatDaysWordsRu(num, grammaticalCase = 'nom') {
  const n = parseInt(num, 10) || 0;
  const nomUnits = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const nomTeens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const nomTens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];

  const genUnits = ['', 'одного', 'двух', 'трех', 'четырех', 'пяти', 'шести', 'семи', 'восьми', 'девяти'];
  const genTeens = ['десяти', 'одиннадцати', 'двенадцати', 'тринадцати', 'четырнадцати', 'пятнадцати', 'шестнадцати', 'семнадцати', 'восемнадцати', 'девятнадцати'];
  const genTens = ['', '', 'двадцати', 'тридцати', 'сорока', 'пятидесяти', 'шестидесяти', 'семидесяти', 'восьмидесяти', 'девяноста'];

  let res = '';
  if (grammaticalCase === 'gen') {
    if (n < 10) res = genUnits[n] || '';
    else if (n < 20) res = genTeens[n - 10];
    else if (n < 100) {
      const t = Math.floor(n / 10);
      const u = n % 10;
      res = genTens[t] + (u ? ' ' + genUnits[u] : '');
    } else res = String(n);
    return res.trim();
  } else {
    if (n < 10) res = nomUnits[n] || '';
    else if (n < 20) res = nomTeens[n - 10];
    else if (n < 100) {
      const t = Math.floor(n / 10);
      const u = n % 10;
      res = nomTens[t] + (u ? ' ' + nomUnits[u] : '');
    } else res = String(n);
    res = res.trim();
    return res ? (res.charAt(0).toUpperCase() + res.slice(1)) : '';
  }
}

// server/services/documentContext.js
// Единый движок контекста данных и шаблонизации документов Stockeasy
import { formatSumWordsRu } from './docxGenerator.js';

export function formatDateRu(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export function formatDateRuWords(dateVal) {
  if (!dateVal) return '';
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `«${day}» ${month} ${year} г.`;
}

export function formatMoney(val) {
  if (val === null || val === undefined || val === '') return '';
  const num = Number(val);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function explicitCalculationLines(subcontract = {}, task = {}) {
  let details = subcontract.calculation_details;
  if (typeof details === 'string') {
    try { details = JSON.parse(details); } catch { details = {}; }
  }
  if (!details || typeof details !== 'object') details = {};

  const normalizeLine = (line) => {
    const qty = numberOrNull(line.qty ?? line.count);
    const price = numberOrNull(line.price);
    const explicitTotal = numberOrNull(line.total);
    return {
      title: line.title || line.name || '',
      unit: line.unit || '',
      qty,
      price,
      total: explicitTotal !== null ? explicitTotal : (qty !== null && price !== null ? qty * price : null)
    };
  };

  const lines = [];
  if (Array.isArray(details.lines) && details.lines.length > 0) {
    details.lines.forEach(l => lines.push(normalizeLine(l)));
  }

  // Дополнительно: строки сторонних исполнителей / доп. работ субподряда
  if (Array.isArray(details.third_party_lines) && details.third_party_lines.length > 0) {
    details.third_party_lines.forEach(tp => {
      const amt = numberOrNull(tp.amount ?? tp.total);
      if (amt !== null && amt > 0) {
        lines.push({
          title: tp.title || tp.name || 'Дополнительные работы/услуги',
          unit: tp.unit || 'усл.',
          qty: numberOrNull(tp.qty ?? tp.count) || 1,
          price: amt,
          total: amt
        });
      }
    });
  }

  let rawData = task.raw_data || task.rawData || {};
  if (typeof rawData === 'string') {
    try { rawData = JSON.parse(rawData); } catch { rawData = {}; }
  }
  const extraExpenses = Array.isArray(rawData.extraExpensesList)
    ? rawData.extraExpensesList.filter((item) => item.payer_mode === 'through_contractor')
    : [];
  if (extraExpenses.length > 0) {
    extraExpenses.forEach((item) => {
      const amount = numberOrNull(item.amount);
      lines.push({
        title: item.title || '',
        unit: item.unit || 'усл.',
        qty: numberOrNull(item.qty ?? item.count) || 1,
        price: amount,
        total: amount
      });
    });
  } else if (numberOrNull(details.extraExpenses) !== null) {
    const amount = numberOrNull(details.extraExpenses);
    lines.push({
      title: details.extraExpensesComment || 'Дополнительные согласованные монтажные работы',
      unit: details.extraExpensesUnit || 'усл.',
      qty: numberOrNull(details.extraExpensesQty) || 1,
      price: amount,
      total: amount
    });
  }
  return lines;
}

export function formatFioShort(fullName) {
  if (!fullName) return '';
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`;
  return `${parts[0]} ${parts[1][0]}. ${parts[2][0]}.`;
}

/**
 * Сбор полного контекста переменных из базы данных для формирования документа
 */
export async function collectDocumentContext({ pool, taskId, contractId, subcontractId, subcontractContractId, poaId, customData = {} }) {
  let task = null;
  let contract = null;
  let subcontract = null;
  let subcontractContract = null;
  let poa = null;
  let poaSpecialist = null;
  let contractor = {};
  let ourCompany = {};
  let materials = [];
  let ports = [];
  let calculationLines = [];

  // -1. Загрузка доверенности (если передан poaId)
  if (poaId) {
    const poaRes = await pool.query(`
      SELECT p.*, s.full_name as spec_full_name, s.phone as spec_phone, s.position as spec_position,
             s.passport_series_number, s.passport_issued_by, s.passport_issue_date, s.passport_raw
      FROM powers_of_attorney p
      LEFT JOIN specialists s ON s.id = p.specialist_id
      WHERE p.id = $1
    `, [poaId]);
    if (poaRes.rows.length > 0) {
      poa = poaRes.rows[0];
      if (poa.organization) {
        const orgClean = poa.organization.replace(/["'«»]/g, '').trim();
        const orgMatch = await pool.query(
          `SELECT * FROM own_companies WHERE name_short ILIKE $1 OR name_full ILIKE $1 OR code ILIKE $1 ORDER BY id ASC LIMIT 1`,
          [`%${orgClean}%`]
        );
        if (orgMatch.rows.length > 0) {
          ourCompany = orgMatch.rows[0];
        }
      }
      if (poa.person_name) {
        const specMatch = await pool.query(
          `SELECT * FROM specialists WHERE full_name ILIKE $1 OR id = $2 LIMIT 1`,
          [`%${poa.person_name.trim()}%`, poa.specialist_id || -1]
        );
        if (specMatch.rows.length > 0) {
          poaSpecialist = specMatch.rows[0];
        }
      }
    }
  }

  // 0. Загрузка договора субподряда (если открыт из реестра договоров субподряда)
  if (subcontractContractId) {
    const ccRes = await pool.query(`
      SELECT
        cc.*,
        COALESCE(pc.internal_number, pc.contract_number) AS parent_contract_number,
        pc.contract_date AS parent_contract_date,
        COALESCE(pc.subject, pc.contract_type_summary) AS parent_contract_title,
        pc.customer_name AS parent_customer
      FROM contractor_contracts cc
      LEFT JOIN contracts pc ON cc.parent_contract_id = pc.id
      WHERE cc.id = $1
    `, [subcontractContractId]);
    if (ccRes.rows.length > 0) {
      subcontractContract = ccRes.rows[0];
      if (!contractId && subcontractContract.parent_contract_id) {
        contractId = subcontractContract.parent_contract_id;
      }
    }
  }

  // 1. Загрузка задачи (если передана)
  if (taskId) {
    const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskRes.rows.length > 0) {
      task = taskRes.rows[0];
      if (!contractId && task.contract_id) {
        contractId = task.contract_id;
      }
    }
  }

  // 2. Загрузка субподряда
  if (subcontractId) {
    const subRes = await pool.query('SELECT * FROM task_subcontracts WHERE id = $1', [subcontractId]);
    if (subRes.rows.length > 0) {
      subcontract = subRes.rows[0];
      if (!taskId && subcontract.task_id) {
        taskId = subcontract.task_id;
        const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
        if (taskRes.rows.length > 0) task = taskRes.rows[0];
      }
    }
  } else if (taskId) {
    const subRes = await pool.query(
      'SELECT * FROM task_subcontracts WHERE task_id = $1 ORDER BY id DESC LIMIT 1',
      [taskId]
    );
    if (subRes.rows.length > 0) {
      subcontract = subRes.rows[0];
      subcontractId = subcontract.id;
    }
  }

  // 3. Загрузка контракта
  if (contractId) {
    const cntRes = await pool.query('SELECT * FROM contracts WHERE id = $1', [contractId]);
    if (cntRes.rows.length > 0) {
      contract = cntRes.rows[0];
    }
  }

  // 4. Загрузка нашей организации (Генподрядчик / Исполнитель)
  let ownId = (subcontractContract && subcontractContract.own_company_id) ||
              (subcontract && subcontract.own_company_id) ||
              (task && task.own_company_id) ||
              (contract && contract.own_company_id);
  if (!ownId && contract && contract.our_entity_name) {
    const ent = String(contract.our_entity_name).toLowerCase();
    if (ent.includes('к10')) {
      const oc = await pool.query("SELECT id FROM own_companies WHERE code = 'K10' LIMIT 1");
      if (oc.rows.length) ownId = oc.rows[0].id;
    } else if (ent.includes('кабельн')) {
      const oc = await pool.query("SELECT id FROM own_companies WHERE code = 'KS' LIMIT 1");
      if (oc.rows.length) ownId = oc.rows[0].id;
    } else if (ent.includes('ультим')) {
      const oc = await pool.query("SELECT id FROM own_companies WHERE code = 'ULTIMA' LIMIT 1");
      if (oc.rows.length) ownId = oc.rows[0].id;
    }
  }
  if (ownId) {
    const ocRes = await pool.query('SELECT * FROM own_companies WHERE id = $1', [ownId]);
    if (ocRes.rows.length > 0) {
      ourCompany = ocRes.rows[0];
    }
  }

  // 5. Загрузка подрядчика
  let contractorId = (subcontractContract && subcontractContract.contractor_id) ||
                     (subcontract && subcontract.contractor_id);
  if (contractorId) {
    const cRes = await pool.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
    if (cRes.rows.length > 0) contractor = cRes.rows[0];
  } else if (task && task.contractor) {
    const cRes = await pool.query(
      'SELECT * FROM contractors WHERE LOWER(TRIM(name_short)) = LOWER(TRIM($1)) OR LOWER(TRIM(name_full)) = LOWER(TRIM($1)) LIMIT 1',
      [task.contractor.trim()]
    );
    if (cRes.rows.length > 0) {
      contractor = cRes.rows[0];
    } else {
      contractor = { name_short: task.contractor, name_full: task.contractor };
    }
  }

  // Договор с подрядчиком (рамочный)
  let linkedContractorContract = subcontractContract || {};
  if (!linkedContractorContract.id && subcontract && subcontract.contractor_contract_id) {
    const ccRes = await pool.query('SELECT * FROM contractor_contracts WHERE id = $1', [subcontract.contractor_contract_id]);
    if (ccRes.rows.length) linkedContractorContract = ccRes.rows[0];
  }
  if (!linkedContractorContract.id && contractor.id) {
    const ccRes = await pool.query('SELECT * FROM contractor_contracts WHERE contractor_id = $1 ORDER BY id DESC LIMIT 1', [contractor.id]);
    if (ccRes.rows.length) linkedContractorContract = ccRes.rows[0];
  }
  if (!linkedContractorContract.id && contractor.id) {
    const cRes = await pool.query('SELECT * FROM contracts WHERE customer_id = $1 ORDER BY id DESC LIMIT 1', [contractor.id]);
    if (cRes.rows.length) {
      linkedContractorContract = cRes.rows[0];
    }
  }

  // 6. Материалы и порты (если есть задача)
  if (taskId) {
    const mRes = await pool.query(`
      SELECT tm.*,
             COALESCE(tm.item_name, m.name) AS name,
             COALESCE(tm.article, m.code) AS code,
             COALESCE(tm.unit, m.unit) AS unit,
             COALESCE(tm.price, m.price_default) AS price,
             m.price_default
      FROM task_materials tm
      LEFT JOIN materials m ON tm.material_id = m.id
      WHERE tm.task_id = $1
      ORDER BY tm.id ASC
    `, [taskId]);
    materials = mRes.rows;

    const pRes = await pool.query('SELECT * FROM task_ports WHERE task_id = $1 ORDER BY id ASC', [taskId]);
    ports = pRes.rows;
  }

  // 7. Только явно сохранённые расчетные строки и фактические дополнительные расходы
  calculationLines = explicitCalculationLines(subcontract || {}, task || {});

  // 8. Финансовые итоги и параметры Заявки (Заказ-наряда) к договору субподряда
  let totalAmount = null;
  const agreedAmount = numberOrNull(subcontract?.price_agreed);
  const unitPrice = numberOrNull(task?.price_per_unit);
  const taskAmount = numberOrNull(task?.amount);
  const lineTotals = calculationLines.map((item) => numberOrNull(item.total)).filter((value) => value !== null);

  // Общая сумма Заявки: согласованная цена или сумма по строкам калькулятора
  if (agreedAmount !== null && agreedAmount > 0) {
    totalAmount = agreedAmount;
  } else if (lineTotals.length > 0) {
    totalAmount = lineTotals.reduce((acc, value) => acc + value, 0);
  } else if (unitPrice !== null && unitPrice !== 0) {
    totalAmount = unitPrice;
  } else if (taskAmount !== null && taskAmount !== 0) {
    totalAmount = taskAmount;
  }

  // Параметры Заявки / Заказ-наряда
  const subDetails = (subcontract && subcontract.calculation_details) || {};
  const orderParams = customData.order_params || customData.orderParams || subDetails.order_params || (task && task.raw_data && task.raw_data.orderParams) || {};
  const appendixNum = parseInt(orderParams.appendix_num, 10) || 2;
  const orderNum = parseInt(orderParams.order_num, 10) || (subcontract ? subcontract.id : 1);
  const workDays = parseInt(orderParams.work_days, 10) || 5;
  const paymentDays = parseInt(orderParams.payment_days, 10) || 15;
  const hasAdvance = Boolean(orderParams.has_advance);
  const advancePct = parseFloat(orderParams.advance_pct) || (hasAdvance ? 45 : 0);
  const advanceAmount = orderParams.advance_amount !== undefined && orderParams.advance_amount !== null
    ? parseFloat(orderParams.advance_amount)
    : (hasAdvance && totalAmount ? Math.round(totalAmount * (advancePct / 100)) : 0);
  const advanceDays = parseInt(orderParams.advance_days, 10) || 3;
  const hasInterim = Boolean(orderParams.has_interim);
  const interimPct = parseFloat(orderParams.interim_pct) || 0;
  const interimAmount = parseFloat(orderParams.interim_amount) || 0;
  const finalPct = Math.max(0, 100 - advancePct - interimPct);
  const finalAmount = Math.max(0, (totalAmount || 0) - advanceAmount - interimAmount);

  function getSumWordsOnly(val) {
    if (!val) return 'ноль';
    const full = formatSumWordsRu(val);
    const m = full.match(/\(([^)]+)\)/);
    return m ? m[1].trim() : full;
  }

  const workDaysWords = formatDaysWordsRu(workDays, 'nom');
  const paymentDaysWords = formatDaysWordsRu(paymentDays, 'gen');
  const totalAmountWordsOnly = getSumWordsOnly(totalAmount);
  const advanceAmountWordsOnly = getSumWordsOnly(advanceAmount);
  const finalAmountWordsOnly = getSumWordsOnly(finalAmount);

  function formatMoneyNum(val) {
    const num = Number(val || 0);
    return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  let paymentClauseText = '';
  if (hasAdvance && advanceAmount > 0) {
    paymentClauseText = `Оплата производится путем перечисления денежных средств: авансовый платеж в размере ${advancePct}% от суммы Заявки (${formatMoneyNum(advanceAmount)} (${advanceAmountWordsOnly}) рублей 00 копеек) перечисляется в течение ${advanceDays} банковских дней с момента подписания Заявки; окончательный расчет в размере ${finalPct}% (${formatMoneyNum(finalAmount)} (${finalAmountWordsOnly}) рублей 00 копеек) производится в течение ${paymentDays} (${paymentDaysWords}) календарных дней после приемки выполненных работ и подписания двустороннего акта сдачи-приемки.`;
  } else {
    paymentClauseText = `Оплата производится путем перечисления денежных средств в размере 100% от указанной в п. 2 суммы (${formatMoneyNum(totalAmount || 0)} (${totalAmountWordsOnly}) рублей 00 копеек) в течение ${paymentDays} (${paymentDaysWords}) календарных дней после приемки выполненных работ и подписания двустороннего акта сдачи-приемки.`;
  }

  const vatMode = customData.vat_text || (subDetails.tax_details && subDetails.tax_details.mode) || linkedContractorContract.vat_text || '';
  let vatTextRu = 'НДС не облагается';
  if (vatMode.includes('20') || vatMode === 'osno_20') {
    const vatSum = totalAmount ? Math.round(totalAmount * (20 / 120) * 100) / 100 : 0;
    vatTextRu = `в т.ч. НДС 20% (${formatMoneyNum(vatSum)} руб.)`;
  } else if (vatMode.includes('5') || vatMode === 'usn_5') {
    const vatSum = totalAmount ? Math.round(totalAmount * (5 / 105) * 100) / 100 : 0;
    vatTextRu = `в т.ч. НДС 5% (${formatMoneyNum(vatSum)} руб.)`;
  } else if (vatMode.includes('7') || vatMode === 'usn_7') {
    const vatSum = totalAmount ? Math.round(totalAmount * (7 / 107) * 100) / 100 : 0;
    vatTextRu = `в т.ч. НДС 7% (${formatMoneyNum(vatSum)} руб.)`;
  }

  // Таблица работ в HTML
  let worksTableRowsHtml = calculationLines.map((it, idx) => {
    const qty = it.qty !== undefined ? it.qty : 1;
    const price = it.price !== undefined ? it.price : it.total;
    const total = it.total !== undefined ? it.total : (qty * price);
    return `<tr>
      <td style="border:1px solid #000;padding:4px 6px;text-align:center">${idx + 1}</td>
      <td style="border:1px solid #000;padding:4px 6px">${it.name || it.title || 'Работы по объекту'}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:center">${it.unit || 'шт'}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:center">${qty}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:right">${formatMoneyNum(price)}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:right">${formatMoneyNum(total)}</td>
    </tr>`;
  }).join('');

  const worksTableHtml = `<table style="width:100%;border-collapse:collapse;border:1px solid #000;font-size:12px;margin:8px 0">
    <thead>
      <tr style="background:#f3f4f6;font-weight:700">
        <th style="border:1px solid #000;padding:4px 6px;width:35px;text-align:center">№</th>
        <th style="border:1px solid #000;padding:4px 6px;text-align:left">Наименование работ / затрат</th>
        <th style="border:1px solid #000;padding:4px 6px;width:55px;text-align:center">Ед. изм.</th>
        <th style="border:1px solid #000;padding:4px 6px;width:55px;text-align:center">Кол-во</th>
        <th style="border:1px solid #000;padding:4px 6px;width:85px;text-align:right">Цена, руб.</th>
        <th style="border:1px solid #000;padding:4px 6px;width:95px;text-align:right">Стоимость, руб.</th>
      </tr>
    </thead>
    <tbody>${worksTableRowsHtml}</tbody>
    <tfoot>
      <tr style="font-weight:700;background:#f9fafb">
        <td colspan="5" style="border:1px solid #000;padding:5px 6px;text-align:right">Итого:</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:right">${formatMoneyNum(totalAmount || 0)}</td>
      </tr>
    </tfoot>
  </table>`;

  // 9. Специалисты
  let specialists = [];
  if (customData.specialists && Array.isArray(customData.specialists) && customData.specialists.length > 0) {
    specialists = customData.specialists;
  } else if (subcontract && subcontract.installer_fio) {
    specialists.push({
      num: 1,
      full_name: subcontract.installer_fio,
      passport: subcontract.installer_passport || '',
      phone: subcontract.installer_phone || '',
      auto: subcontract.auto_number || '',
      role: subcontract.installer_role || ''
    });
  }

  const now = new Date();
  const docNumber = customData.doc_number || poa?.number || subcontractContract?.contract_number || subcontract?.subcontract_number || '';
  const docDate = customData.doc_date || poa?.issue_date || subcontractContract?.contract_date || '';

  // Паспортные данные для доверенностей и пропусков
  const specObj = poaSpecialist || poa;
  let passRaw = (specObj && (specObj.passport_raw || specObj.passport_series_number)) || '';
  let passSeries = '';
  let passNumber = '';
  let passIssuedBy = (specObj && specObj.passport_issued_by) || '';
  let passIssueDate = (specObj && specObj.passport_issue_date) || '';

  if (specObj && specObj.passport_series_number) {
    const numClean = String(specObj.passport_series_number).replace(/[№#]/g, '').trim();
    const parts = numClean.split(/\s+/);
    if (parts.length >= 2) {
      if (parts.length === 2 && parts[0].length === 4) {
        passSeries = `${parts[0].slice(0, 2)} ${parts[0].slice(2, 4)}`;
        passNumber = parts[1];
      } else {
        passSeries = parts.slice(0, -1).join(' ');
        passNumber = parts[parts.length - 1];
      }
    } else if (numClean.length === 10) {
      passSeries = `${numClean.slice(0, 2)} ${numClean.slice(2, 4)}`;
      passNumber = numClean.slice(4);
    } else {
      passNumber = numClean;
    }
  }

  if (passRaw && (!passIssuedBy || !passIssueDate)) {
    const mIssued = passRaw.match(/выдан\s+([^,]+)/i) || passRaw.match(/(?:ГУ\s*МВД|Отдел(?:ом)?\s*УФМС|ТП\s*№|УВД)[^,\.]+/i);
    if (mIssued && !passIssuedBy) passIssuedBy = mIssued[0].trim();
    const mDate = passRaw.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (mDate && !passIssueDate) passIssueDate = mDate[1];
  }

  // Суть договора и предмет по требованиям руководства
  const essenceMap = {
    subcontract: 'выполнение комплекса строительно-монтажных и пусконаладочных работ',
    design: 'выполнение проектно-изыскательских работ (ПИР)',
    supply: 'поставку оборудования, кабельной продукции и расходных материалов',
    services: 'оказание телекоммуникационных и сопутствующих услуг',
    mirror: 'выполнение комплекса работ в рамках зеркального субподряда',
    cooperation: 'совместную деятельность и научно-техническое сотрудничество',
    sales: 'куплю-продажу материально-технических ценностей'
  };

  const essenceTitleMap = {
    subcontract: 'на выполнение строительно-монтажных работ',
    design: 'на выполнение проектно-изыскательских работ (ПИР)',
    supply: 'поставки оборудования и материалов',
    services: 'возмездного оказания услуг',
    mirror: 'зеркального субподряда',
    cooperation: 'о совместной деятельности и сотрудничестве',
    sales: 'купли-продажи'
  };

  const currentEssence = subcontractContract?.contract_essence || '';
  const essenceText = essenceMap[currentEssence] || '';
  const essenceTitle = essenceTitleMap[currentEssence] || '';

  let subjectParagraph = '';
  if (subcontractContract && currentEssence === 'mirror') {
    const parentNum = subcontractContract.parent_contract_number || '';
    const parentDate = subcontractContract.parent_contract_date ? formatDateRu(subcontractContract.parent_contract_date) : '';
    const parentCust = subcontractContract.parent_customer || subcontractContract.customer_tag || '';
    const mirrorPct = numberOrNull(subcontractContract.mirror_percent);
    subjectParagraph = `1.1. Субподрядчик обязуется по заданию Генподрядчика выполнить комплекс работ в рамках исполнения обязательств по Генеральному контракту № ${parentNum} от ${parentDate} (Конечный заказчик: ${parentCust}), а Генподрядчик обязуется принять результат надлежаще выполненных работ и оплатить их. Вознаграждение Субподрядчика составляет ${mirrorPct === null ? '' : mirrorPct + '%'} от утвержденного объема финансирования соответствующих работ по Генеральному контракту.`;
  } else if (subcontractContract && essenceText) {
    subjectParagraph = `1.1. Субподрядчик обязуется по заданию Генподрядчика выполнить ${essenceText}, а Генподрядчик обязуется принять результат надлежаще выполненных работ и оплатить их в соответствии с условиями настоящего Договора и Приложений к нему.`;
  }

  const territoryText = (subcontractContract?.territory) || (task?.region ? (task.city ? `${task.city}, ${task.region}` : task.region) : '');
  const territoryParagraph = territoryText ? `1.2. Место выполнения работ (территория действия Договора): ${territoryText}.` : '';

  const statusMapRu = {
    created: 'Создан',
    agreed: 'Согласован',
    sent: 'Передан на подпись',
    signed: 'Подписан',
    terminated: 'Расторгнут',
    active: 'Действует',
    pending: 'На согласовании',
    completed: 'Завершен'
  };

  // Формируем структурированный словарь контекста
  const ctx = {
    // Система / общие
    doc_number: docNumber,
    doc_date: formatDateRu(docDate),
    doc_date_words: formatDateRuWords(docDate),
    current_date: formatDateRu(now),
    current_date_words: formatDateRuWords(now),
    current_year: String(now.getFullYear()),
    city: task?.city || ourCompany?.city || '',

    // Наша компания (Генподрядчик / Исполнитель)
    our_company: {
      name: ourCompany.name_short || '',
      name_full: ourCompany.name_full || '',
      inn: ourCompany.inn || '',
      kpp: ourCompany.kpp || '',
      ogrn: ourCompany.ogrn || '',
      address_legal: ourCompany.address_legal || '',
      director: ourCompany.director || '',
      director_title: ourCompany.director_title || '',
      phone: ourCompany.phone || '',
      bank_name: ourCompany.bank_name || '',
      bik: ourCompany.bik || '',
      account_pay: ourCompany.account_pay || '',
      account_corr: ourCompany.account_corr || ''
    },

    // Подрядчик / Исполнитель
    contractor: {
      name: contractor.name_short || subcontract?.contractor_name || task?.contractor || '',
      name_full: contractor.name_full || contractor.name_short || task?.contractor || '',
      inn: contractor.inn || subcontract?.contractor_inn || '',
      kpp: contractor.kpp || '',
      ogrn: contractor.ogrn || contractor.ogrnip || '',
      address_legal: contractor.address_legal || '',
      director: contractor.director || '',
      phone: contractor.phone || subcontract?.installer_phone || '',
      bank_name: contractor.bank_name || '',
      bik: contractor.bik || '',
      account_pay: contractor.account_pay || '',
      account_corr: contractor.account_corr || '',
      contract_number: linkedContractorContract.contract_number || contractor.contract_number || '',
      contract_date: linkedContractorContract.contract_date ? formatDateRu(linkedContractorContract.contract_date) : ''
    },

    // Заказчик (Сторона 1 по контракту)
    customer: {
      name: contract?.customer || (['—', '–', '-'].includes(String(task?.customer || '').trim()) ? '' : task?.customer) || '',
      inn: contract?.customer_inn || '',
      address: contract?.customer_address || '',
      contact: task?.contact || contract?.contact_person || ''
    },

    // Объект и заявка
    task: {
      id: task?.id || '',
      vsp: task?.vsp || '',
      address: task?.address || '',
      city: task?.city || '',
      region: task?.region || '',
      work_type: task?.work_type || '',
      tip_obj: task?.tip_obj || '',
      deadline: task?.deadline ? formatDateRu(task.deadline) : '',
      deadline_words: task?.deadline ? formatDateRuWords(task.deadline) : '',
      order_date: task?.date_zayavki ? formatDateRu(task.date_zayavki) : '',
      purchase_id: task?.purchase_id || contract?.purchase_id || ''
    },

    // Контракт
    contract: {
      id: contract?.id || '',
      number: contract?.contract_number || '',
      date: contract?.contract_date ? formatDateRu(contract.contract_date) : '',
      title: contract?.title || '',
      subject: contract?.subject || '',
      purchase_id: contract?.purchase_id || task?.purchase_id || '',
      law_type: contract?.contract_law_type || ''
    },

    // Субподряд
    subcontract: {
      id: subcontract?.id || '',
      number: subcontract?.subcontract_number || docNumber,
      status: subcontract?.status || '',
      ports_count: String(subcontract?.ports_count ?? (task?.fact !== null && task?.fact !== undefined && task?.fact !== '' ? task.fact : '')),
      distance_km: String(subcontract?.distance_km ?? task?.distance_km ?? '')
    },

    // Финансы
    finance: {
      total_amount: totalAmount,
      total_amount_formatted: formatMoney(totalAmount),
      total_amount_words: totalAmount === null ? '' : formatSumWordsRu(totalAmount),
      vat_text: customData.vat_text || subcontractContract?.vat_text || '',
      margin: numberOrNull(task?.margin) === null ? '' : formatMoney(task.margin)
    },

    // Массивы данных для итераций
    works: calculationLines.map((w, idx) => ({
      num: idx + 1,
      title: w.title || '',
      unit: w.unit || '',
      qty: numberOrNull(w.qty),
      price: numberOrNull(w.price),
      price_formatted: formatMoney(w.price),
      total: numberOrNull(w.total),
      total_formatted: formatMoney(w.total)
    })),

    specialists: specialists.map((s, idx) => ({
      num: idx + 1,
      full_name: s.full_name || '',
      passport: s.passport || s.passport_series_number || '',
      phone: s.phone || '',
      role: s.role || '',
      auto: s.auto || s.auto_number || ''
    })),

    materials: materials.map((m, idx) => {
      const qty = numberOrNull(m.fact_qty ?? m.quantity);
      const price = numberOrNull(m.price ?? m.price_default);
      const total = qty !== null && price !== null ? qty * price : null;
      return {
        num: idx + 1,
        name: m.item_name || m.name || '',
        code: m.article || m.code || '',
        unit: m.unit || '',
        qty,
        price,
        price_formatted: formatMoney(price),
        total,
        total_formatted: formatMoney(total)
      };
    }),

    ports: ports.map((p, idx) => ({
      num: idx + 1,
      port_number: p.port_number || '',
      marking: p.marking || '',
      room: p.room || '',
      cabinet: p.cabinet || '',
      unit: p.unit || '',
      patch_panel: p.patch_panel || '',
      cable_mark: p.cable_mark || '',
      cable_length: numberOrNull(p.cable_length),
      testing_status: p.testing_status || '',
      wiremap: p.wiremap || p.wire_map || p.crimping || ''
    }))
  };

  // Создаем плоские русскоязычные псевдонимы (для удобства составления шаблонов в UI)
  ctx.плоские_переменные = {
    номер_документа: ctx.doc_number,
    дата_документа: ctx.doc_date,
    дата_документа_прописью: ctx.doc_date_words,
    текущая_дата: ctx.current_date,
    текущий_год: ctx.current_year,
    город: ctx.city,

    наш_заказчик: ctx.customer.name,
    наш_заказчик_инн: ctx.customer.inn,
    наш_заказчик_адрес: ctx.customer.address,

    наша_организация: ctx.our_company.name,
    наша_организация_полная: ctx.our_company.name_full,
    наш_инн: ctx.our_company.inn,
    наш_кпп: ctx.our_company.kpp,
    наш_огрн: ctx.our_company.ogrn,
    наш_директор: ctx.our_company.director,
    наш_директор_должность: ctx.our_company.director_title,
    наш_адрес: ctx.our_company.address_legal,
    наш_телефон: ctx.our_company.phone,
    наш_банк: ctx.our_company.bank_name,
    наш_бик: ctx.our_company.bik,
    наш_расчетный_счет: ctx.our_company.account_pay,
    наш_корр_счет: ctx.our_company.account_corr,

    подрядчик_наименование: ctx.contractor.name,
    подрядчик_наименование_полное: ctx.contractor.name_full,
    подрядчик_инн: ctx.contractor.inn,
    подрядчик_кпп: ctx.contractor.kpp,
    подрядчик_директор: ctx.contractor.director,
    подрядчик_адрес: ctx.contractor.address_legal,
    подрядчик_телефон: ctx.contractor.phone,
    подрядчик_банк: ctx.contractor.bank_name,
    подрядчик_бик: ctx.contractor.bik,
    подрядчик_расчетный_счет: ctx.contractor.account_pay,
    подрядчик_корр_счет: ctx.contractor.account_corr,
    номер_договора_подрядчика: ctx.contractor.contract_number,
    дата_договора_подрядчика: ctx.contractor.contract_date,

    суть_договора: essenceText,
    суть_договора_название: essenceTitle,
    предмет_договора: subjectParagraph,
    территория_действия: territoryText,
    территория_абзац: territoryParagraph,
    конечный_заказчик: subcontractContract?.customer_tag || subcontractContract?.parent_customer || ctx.customer.name,
    зеркальный_процент: numberOrNull(subcontractContract?.mirror_percent) === null ? '' : `${subcontractContract.mirror_percent}%`,
    родительский_договор_номер: subcontractContract?.parent_contract_number || '',
    родительский_договор_дата: subcontractContract?.parent_contract_date ? formatDateRu(subcontractContract.parent_contract_date) : '',
    статус_договора: statusMapRu[subcontractContract?.status] || '',

    номер_заявки: ctx.task.id,
    номер_всп: ctx.task.vsp,
    адрес_объекта: ctx.task.address,
    тип_объекта: ctx.task.tip_obj,
    вид_работ: ctx.task.work_type,
    срок_выполнения: ctx.task.deadline,
    срок_выполнения_прописью: ctx.task.deadline_words,
    дата_заявки: ctx.task.order_date,

    номер_контракта: ctx.contract.number,
    дата_контракта: ctx.contract.date,
    закон_контракта: ctx.contract.law_type,
    идентификатор_закупки: ctx.task.purchase_id,

    сумма: ctx.finance.total_amount_formatted,
    сумма_числом: ctx.finance.total_amount === null ? '' : String(ctx.finance.total_amount),
    сумма_прописью: ctx.finance.total_amount_words,
    ндс_инфо: ctx.finance.vat_text,

    фио_монтажника: ctx.specialists[0]?.full_name || '',
    паспорт_монтажника: ctx.specialists[0]?.passport || '',
    телефон_монтажника: ctx.specialists[0]?.phone || '',
    госномер_авто: ctx.specialists[0]?.auto || '',

    // Переменные для Заявки (Приложения) к Договору субподряда (Заказчик Алексей)
    номер_приложения: String(appendixNum),
    номер_договора_субподряда: linkedContractorContract.contract_number || contractor.contract_number || 'б/н',
    дата_договора_субподряда: linkedContractorContract.contract_date ? formatDateRu(linkedContractorContract.contract_date) : (contractor.contract_date ? formatDateRu(contractor.contract_date) : ''),
    дата_договора_субподряда_прописью: linkedContractorContract.contract_date ? formatDateRuWords(linkedContractorContract.contract_date) : (contractor.contract_date ? formatDateRuWords(contractor.contract_date) : ''),
    номер_заявки_к_договору: String(orderNum),
    предмет_контракта: (contract && contract.subject) || task?.work_type || subcontract?.work_type || 'Монтаж СКС и пусконаладочные работы',
    предмет_и_адрес_объекта: `${(contract && contract.subject) || task?.work_type || subcontract?.work_type || 'Монтаж СКС и пусконаладочные работы'} по адресу: ${ctx.task.address || ''}`,
    общая_сумма_заявки_числом: totalAmount === null ? '' : formatMoneyNum(totalAmount),
    общая_сумма_заявки_прописью: totalAmountWordsOnly,
    текст_ндс: vatTextRu,
    срок_выполнения_дней: String(workDays),
    срок_выполнения_дней_прописью: workDaysWords,
    срок_оплаты_дней: String(paymentDays),
    срок_оплаты_дней_прописью: paymentDaysWords,
    текст_пункта_оплаты: paymentClauseText,
    таблица_работ_html: worksTableHtml,
    таблица_работ: worksTableHtml,
    сумма_аванса_числом: advanceAmount > 0 ? formatMoneyNum(advanceAmount) : '',
    сумма_аванса_прописью: advanceAmount > 0 ? advanceAmountWordsOnly : '',
    процент_аванса: String(advancePct),

    // Переменные для доверенностей (форма М-2 и стандартные)
    номер_доверенности: poa?.number || ctx.doc_number,
    дата_выдачи: poa?.issue_date ? formatDateRu(poa.issue_date) : ctx.doc_date,
    дата_выдачи_прописью: poa?.issue_date ? formatDateRuWords(poa.issue_date) : ctx.doc_date_words,
    срок_действия: poa?.valid_until ? formatDateRu(poa.valid_until) : '',
    срок_действия_прописью: poa?.valid_until ? formatDateRuWords(poa.valid_until) : '',
    подотчетное_лицо_фио: poa?.person_name || poaSpecialist?.full_name || ctx.specialists[0]?.full_name || '',
    подотчетное_лицо_должность: poaSpecialist?.position || '',
    паспорт_серия: passSeries,
    паспорт_номер: passNumber,
    паспорт_кем_выдан: passIssuedBy,
    паспорт_дата_выдачи: passIssueDate ? formatDateRu(passIssueDate) : '',
    поставщик_наименование: poa?.contractor_name || customData?.contractor_name || '',
    наш_окпо: ourCompany.okpo || '',
    руководитель_иоф: formatFioShort(ourCompany.director),
    главбух_иоф: formatFioShort(ourCompany.chief_accountant),
    номер_наряда: customData?.work_order_number || '',
    номер_акта: customData?.act_number || '',
    основание_получения: customData?.document_base || '',

    // Готовые HTML-блоки таблиц на случай, если в шаблоне не используют циклы:
    таблица_работ: renderWorksTableHtml(ctx.works, ctx.finance),
    таблица_специалистов: renderSpecialistsTableHtml(ctx.specialists),
    таблица_материалов: renderMaterialsTableHtml(ctx.materials),
    таблица_кж: renderKjTableHtml(ports),
    таблица_спецификации_ид: renderIdSpecTableHtml(materials),
    таблица_протокола_измерений: renderFlukeProtocolTableHtml(ports, ctx),
    штамп_гост: renderGostStampHtml(ctx),
    блок_подписей: renderSignaturesBlockHtml(ctx.our_company, ctx.contractor),

    // Закрывающие документы и ИД
    порты_факт: (task?.fact !== null && task?.fact !== undefined && task?.fact !== '') ? String(task.fact) : '',
    число_портов_кж: String(ports.length),
    число_портов_факт: (task?.fact !== null && task?.fact !== undefined && task?.fact !== '') ? String(task.fact) : '',
    номер_и_дата_контракта: contract?.contract_number ?
      `Государственный контракт № ${contract.contract_number}${contract.contract_date ? ' от ' + formatDateRu(contract.contract_date) : ''}` : '',
    ответственный_фио: ctx.specialists[0]?.full_name || '',
    дата_начала_работ: task?.data_vyhoda ? formatDateRu(task.data_vyhoda) : '',
    дата_окончания_работ: task?.smr_actual_end_date ? formatDateRu(task.smr_actual_end_date) : '',
    материалы_текст_аоср: renderAosrMaterialsText(materials),
    таблица_приемки_оборудования: renderEquipmentAcceptanceTableHtml(materials),
    таблица_технической_готовности: renderTechnicalReadinessTableHtml(materials),
    таблица_входного_контроля: renderInputControlJournalTableHtml(materials, task, ctx.specialists[0]?.full_name || ''),
    таблица_линий_пси: renderProtocolPsiTableHtml(ports),
    таблица_ip_адресации: renderIpAddressingTableHtml(materials)
  };

  // Копируем все плоские переменные в корень ctx для прямого доступа
  Object.assign(ctx, ctx.плоские_переменные);

  return ctx;
}

/**
 * Подстановка переменных и развертывание циклов в шаблоне HTML
 */
export function renderTemplateHtml(templateHtml, context) {
  let res = String(templateHtml || '');

  // 1. Развертывание циклов: {{#works}}...{{/works}}
  res = res.replace(/\{\{#works\}\}([\s\S]*?)\{\{\/works\}\}/g, (_, inner) => {
    if (!Array.isArray(context.works) || !context.works.length) return '';
    return context.works.map(w => replaceItemTokens(inner, w)).join('');
  });

  // {{#specialists}}...{{/specialists}}
  res = res.replace(/\{\{#specialists\}\}([\s\S]*?)\{\{\/specialists\}\}/g, (_, inner) => {
    if (!Array.isArray(context.specialists) || !context.specialists.length) return '';
    return context.specialists.map(s => replaceItemTokens(inner, s)).join('');
  });

  // {{#materials}}...{{/materials}}
  res = res.replace(/\{\{#materials\}\}([\s\S]*?)\{\{\/materials\}\}/g, (_, inner) => {
    if (!Array.isArray(context.materials) || !context.materials.length) return '';
    return context.materials.map(m => replaceItemTokens(inner, m)).join('');
  });

  // 2. Подстановка плоских русских переменных: {{номер_заявки}}, {{сумма_прописью}} и т.д.
  if (context.плоские_переменные) {
    for (const [key, val] of Object.entries(context.плоские_переменные)) {
      const reg = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      res = res.replace(reg, val !== undefined && val !== null ? String(val) : '');
    }
  }

  // 3. Подстановка точечных переменных: {{our_company.name}}, {{contractor.inn}} и т.д.
  res = res.replace(/\{\{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\}\}/g, (match, p1, p2) => {
    if (context[p1] && context[p1][p2] !== undefined && context[p1][p2] !== null) {
      return String(context[p1][p2]);
    }
    return match;
  });

  // 4. Одиночные переменные: {{doc_number}}, {{doc_date}}
  res = res.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, p1) => {
    if (context[p1] !== undefined && context[p1] !== null && typeof context[p1] !== 'object') {
      return String(context[p1]);
    }
    return match;
  });

  return res;
}

function replaceItemTokens(templateStr, itemObj) {
  let s = templateStr;
  for (const [k, v] of Object.entries(itemObj)) {
    const reg = new RegExp(`\\{\\{${k}\\}\\}`, 'gi');
    s = s.replace(reg, v !== undefined && v !== null ? String(v) : '');
  }
  return s;
}

// Вспомогательные генераторы аккуратных таблиц для вставки в документы
function renderWorksTableHtml(works = [], finance = {}) {
  let rowsHtml = '';
  works.forEach(w => {
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:5px 6px;text-align:center">${w.num}</td>
        <td style="border:1px solid #000;padding:5px 8px;text-align:left">${w.title}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:center;white-space:nowrap">${w.unit}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:right">${w.qty ?? ''}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:right;white-space:nowrap">${w.price_formatted}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:right;font-weight:600;white-space:nowrap">${w.total_formatted}</td>
      </tr>
    `;
  });

  return `
    <table class="grid-table" style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;border:1px solid #000;box-sizing:border-box">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:6px;width:28px;text-align:center">№</th>
          <th style="border:1px solid #000;padding:6px 8px;text-align:left">Наименование работ / услуг</th>
          <th style="border:1px solid #000;padding:6px;width:75px;text-align:center;white-space:nowrap">Ед. изм.</th>
          <th style="border:1px solid #000;padding:6px;width:50px;text-align:right">Кол-во</th>
          <th style="border:1px solid #000;padding:6px;width:80px;text-align:right;white-space:nowrap">Цена</th>
          <th style="border:1px solid #000;padding:6px;width:90px;text-align:right;white-space:nowrap">Стоимость</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr style="font-weight:700;background:#fafafa">
          <td colspan="5" style="border:1px solid #000;padding:6px 8px;text-align:right">ИТОГО:</td>
          <td style="border:1px solid #000;padding:6px;text-align:right;font-size:13px;white-space:nowrap">${finance.total_amount_formatted || ''}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function renderSpecialistsTableHtml(specialists = []) {
  let rowsHtml = '';
  specialists.forEach(s => {
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:5px 6px;text-align:center">${s.num}</td>
        <td style="border:1px solid #000;padding:5px 8px;font-weight:600">${s.full_name}</td>
        <td style="border:1px solid #000;padding:5px 8px;text-align:center">${s.passport}</td>
        <td style="border:1px solid #000;padding:5px 8px;text-align:center">${s.phone}</td>
        <td style="border:1px solid #000;padding:5px 8px;text-align:center">${s.auto}</td>
        <td style="border:1px solid #000;padding:5px 8px">${s.role}</td>
      </tr>
    `;
  });

  return `
    <table class="grid-table" style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;border:1px solid #000;box-sizing:border-box">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:6px;width:30px;text-align:center">№</th>
          <th style="border:1px solid #000;padding:6px;text-align:left">ФИО сотрудника</th>
          <th style="border:1px solid #000;padding:6px;text-align:center">Паспортные данные</th>
          <th style="border:1px solid #000;padding:6px;text-align:center">Телефон</th>
          <th style="border:1px solid #000;padding:6px;text-align:center">Госномер авто</th>
          <th style="border:1px solid #000;padding:6px;text-align:left">Должность / Допуск</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

function renderMaterialsTableHtml(materials = []) {
  let rowsHtml = '';
  let totalSum = null;
  materials.forEach(m => {
    if (m.total !== null && m.total !== undefined) totalSum = (totalSum ?? 0) + Number(m.total);
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:5px 6px;text-align:center">${m.num}</td>
        <td style="border:1px solid #000;padding:5px 8px">${m.name}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:center">${m.code}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:center;white-space:nowrap">${m.unit}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:right">${m.qty ?? ''}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:right;white-space:nowrap">${m.price_formatted}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:right;font-weight:600;white-space:nowrap">${m.total_formatted}</td>
      </tr>
    `;
  });

  return `
    <table class="grid-table" style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;border:1px solid #000;box-sizing:border-box">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:6px;width:30px;text-align:center">№</th>
          <th style="border:1px solid #000;padding:6px;text-align:left">Наименование ТМЦ</th>
          <th style="border:1px solid #000;padding:6px;width:80px;text-align:center">Артикул</th>
          <th style="border:1px solid #000;padding:6px;width:70px;text-align:center;white-space:nowrap">Ед. изм.</th>
          <th style="border:1px solid #000;padding:6px;width:55px;text-align:right">Кол-во</th>
          <th style="border:1px solid #000;padding:6px;width:85px;text-align:right;white-space:nowrap">Цена</th>
          <th style="border:1px solid #000;padding:6px;width:95px;text-align:right;white-space:nowrap">Сумма</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr style="font-weight:700;background:#fafafa">
          <td colspan="6" style="border:1px solid #000;padding:6px 8px;text-align:right">ИТОГО ТМЦ:</td>
          <td style="border:1px solid #000;padding:6px;text-align:right;font-size:13px;white-space:nowrap">${formatMoney(totalSum)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function renderSignaturesBlockHtml(our, contractor) {
  return `
    <div style="margin-top:30px;display:flex;justify-content:space-between;font-size:12px;page-break-inside:avoid">
      <div style="width:47%;border-top:1px solid #000;padding-top:8px">
        <p style="font-weight:700;margin:0 0 4px 0">ОТ ЗАКАЗЧИКА / ГЕНПОДРЯДЧИКА:</p>
        <p style="margin:0 0 2px 0"><b>${our.name_full || our.name}</b></p>
        <p style="margin:0 0 2px 0">ИНН: ${our.inn} / КПП: ${our.kpp}</p>
        <p style="margin:0 0 12px 0">Адрес: ${our.address_legal}</p>
        <div style="margin-top:20px">
          ${our.director_title || ''}: _________________ / ${our.director || ''} /
        </div>
        <div style="margin-top:6px;font-size:11px;color:#666">М.П.</div>
      </div>

      <div style="width:47%;border-top:1px solid #000;padding-top:8px">
        <p style="font-weight:700;margin:0 0 4px 0">ОТ ПОДРЯДЧИКА / ИСПОЛНИТЕЛЯ:</p>
        <p style="margin:0 0 2px 0"><b>${contractor.name_full || contractor.name}</b></p>
        <p style="margin:0 0 2px 0">ИНН: ${contractor.inn}</p>
        <p style="margin:0 0 12px 0">Адрес: ${contractor.address_legal}</p>
        <div style="margin-top:20px">
          Подпись: _________________ / ${contractor.director || ''} /
        </div>
        <div style="margin-top:6px;font-size:11px;color:#666">М.П.</div>
      </div>
    </div>
  `;
}

function renderKjTableHtml(ports = []) {
  let rowsHtml = '';
  ports.forEach((p, idx) => {
    const cableLength = numberOrNull(p.cable_length);
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px">${p.room ?? ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${p.marking ?? ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${p.port_number ?? ''}</td>
        <td style="border:1px solid #000;padding:4px">${p.cabinet ?? ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${p.patch_panel ?? ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${p.cable_mark ?? ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right">${cableLength ?? ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${p.testing_status ?? ''}</td>
      </tr>
    `;
  });

  return `
    <table class="grid-table" style="width:100%;border-collapse:collapse;font-size:11px;margin:10px 0;border:1px solid #000;box-sizing:border-box">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th rowspan="2" style="border:1px solid #000;padding:4px;width:25px;text-align:center">№</th>
          <th colspan="3" style="border:1px solid #000;padding:4px;text-align:center">Начало трассы</th>
          <th colspan="2" style="border:1px solid #000;padding:4px;text-align:center">Конец трассы</th>
          <th rowspan="2" style="border:1px solid #000;padding:4px;text-align:center">Марка кабеля</th>
          <th rowspan="2" style="border:1px solid #000;padding:4px;width:50px;text-align:right">Длина, м</th>
          <th rowspan="2" style="border:1px solid #000;padding:4px;text-align:center">Статус</th>
        </tr>
        <tr style="background:#f9fafb;font-weight:700">
          <th style="border:1px solid #000;padding:4px;text-align:left">Помещение</th>
          <th style="border:1px solid #000;padding:4px;text-align:center">Маркировка</th>
          <th style="border:1px solid #000;padding:4px;text-align:center">№ порта</th>
          <th style="border:1px solid #000;padding:4px;text-align:left">Помещение / Шкаф</th>
          <th style="border:1px solid #000;padding:4px;text-align:center">Патч-панель</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function renderIdSpecTableHtml(materials = []) {
  let rowsHtml = '';
  materials.forEach(m => {
    const qty = numberOrNull(m.fact_qty ?? m.quantity ?? m.qty);
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center">${m.pos_num ?? ''}</td>
        <td style="border:1px solid #000;padding:4px">${m.item_name || m.name || ''}</td>
        <td style="border:1px solid #000;padding:4px">${m.model || ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${m.article || m.code || ''}</td>
        <td style="border:1px solid #000;padding:4px">${m.supplier || ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${m.unit || ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right">${qty ?? ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${m.note || ''}</td>
      </tr>
    `;
  });

  return `
    <table class="grid-table" style="width:100%;border-collapse:collapse;font-size:11px;margin:10px 0;border:1px solid #000;box-sizing:border-box">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:4px;width:30px;text-align:center">Поз.</th>
          <th style="border:1px solid #000;padding:4px;text-align:left">Наименование и техническая характеристика</th>
          <th style="border:1px solid #000;padding:4px;text-align:left">Тип, марка</th>
          <th style="border:1px solid #000;padding:4px;text-align:center">Код / Артикул</th>
          <th style="border:1px solid #000;padding:4px;text-align:left">Поставщик</th>
          <th style="border:1px solid #000;padding:4px;width:40px;text-align:center">Ед.</th>
          <th style="border:1px solid #000;padding:4px;width:50px;text-align:right">Кол-во</th>
          <th style="border:1px solid #000;padding:4px;text-align:center">Примечание</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function renderFlukeProtocolTableHtml(ports = [], ctx = {}) {
  let rowsHtml = '';
  ports.forEach((p, idx) => {
    const cableLength = numberOrNull(p.cable_length);
    const pointA = [p.patch_panel, p.port_number].filter(value => value !== null && value !== undefined && value !== '').join(' / ');
    const pointB = [p.room, p.outlet_marking || p.marking].filter(value => value !== null && value !== undefined && value !== '').join(', ');
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px">${pointA}</td>
        <td style="border:1px solid #000;padding:4px">${pointB}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${p.cable_mark ?? ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right">${cableLength ?? ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${p.wiremap ?? p.wire_map ?? p.crimping ?? ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${p.testing_status ?? ''}</td>
      </tr>
    `;
  });

  return `
    <table class="grid-table" style="width:100%;border-collapse:collapse;font-size:11px;margin:10px 0;border:1px solid #000;box-sizing:border-box">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:4px;width:30px;text-align:center">№</th>
          <th style="border:1px solid #000;padding:4px;text-align:left">Точка А (Коммутационный узел)</th>
          <th style="border:1px solid #000;padding:4px;text-align:left">Точка Б (Рабочее место)</th>
          <th style="border:1px solid #000;padding:4px;text-align:center">Кабель</th>
          <th style="border:1px solid #000;padding:4px;width:60px;text-align:right">Длина, м</th>
          <th style="border:1px solid #000;padding:4px;width:90px;text-align:center">Схема расшивки</th>
          <th style="border:1px solid #000;padding:4px;width:70px;text-align:center">Результат</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function renderGostStampHtml(ctx = {}) {
  const objName = ctx.task?.address || '';
  const orgName = ctx.our_company?.name || '';
  return `
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:20px;border:2px solid #000">
      <tr>
        <td style="border:1px solid #000;padding:3px;width:55px;font-weight:700">Изм.</td>
        <td style="border:1px solid #000;padding:3px;width:30px">Кол.</td>
        <td style="border:1px solid #000;padding:3px;width:40px">Лист</td>
        <td style="border:1px solid #000;padding:3px;width:60px">№ док.</td>
        <td style="border:1px solid #000;padding:3px;width:55px">Подп.</td>
        <td style="border:1px solid #000;padding:3px;width:55px">Дата</td>
        <td rowspan="3" colspan="2" style="border:1px solid #000;padding:6px;text-align:center;font-weight:700;font-size:11px">
          ${objName}<br/>
          <span style="font-size:9.5px;font-weight:normal">${ctx.task?.work_type || ''}</span>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid #000;padding:3px">Разработал</td>
        <td colspan="2" style="border:1px solid #000;padding:3px;font-weight:700"></td>
        <td style="border:1px solid #000;padding:3px"></td>
        <td style="border:1px solid #000;padding:3px">${ctx.doc_date || ''}</td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid #000;padding:3px">Проверил</td>
        <td colspan="2" style="border:1px solid #000;padding:3px;font-weight:700"></td>
        <td style="border:1px solid #000;padding:3px"></td>
        <td style="border:1px solid #000;padding:3px">${ctx.doc_date || ''}</td>
      </tr>
      <tr>
        <td colspan="4" style="border:1px solid #000;padding:4px;font-weight:700;text-align:center">Исполнительная документация (ИД)</td>
        <td style="border:1px solid #000;padding:4px;text-align:center"><b>Стадия</b><br/>И</td>
        <td style="border:1px solid #000;padding:4px;text-align:center"><b>Лист</b><br/>1</td>
        <td style="border:1px solid #000;padding:4px;text-align:center"><b>Листов</b><br/></td>
        <td style="border:1px solid #000;padding:4px;text-align:center;font-weight:700;font-size:11px">${orgName}</td>
      </tr>
    </table>
  `;
}

function renderAosrMaterialsText(materials = []) {
  return materials.map(m => {
    const name = m.item_name || m.name || '';
    if (!name) return '';
    const qty = numberOrNull(m.fact_qty ?? m.quantity);
    const amount = qty === null ? '' : ` — ${qty}${m.unit ? ' ' + m.unit : ''}`;
    return name + amount;
  }).filter(Boolean).join(', ');
}

function renderEquipmentAcceptanceTableHtml(materials = []) {
  let rowsHtml = '';
  materials.forEach((m, idx) => {
    const qty = numberOrNull(m.fact_qty ?? m.quantity);
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:5px;text-align:center">${idx + 1}</td>
        <td style="border:1px solid #000;padding:5px">${[m.item_name || m.name, m.model].filter(Boolean).join(', ')}</td>
        <td style="border:1px solid #000;padding:5px;text-align:center">${m.serial_number || m.serial || ''}</td>
        <td style="border:1px solid #000;padding:5px;text-align:center">${qty ?? ''}</td>
        <td style="border:1px solid #000;padding:5px">${m.installation_location || m.location || ''}</td>
      </tr>
    `;
  });

  return `
    <table class="grid-table" style="width:100%;border-collapse:collapse;font-size:11px;margin:12px 0;border:1px solid #000;box-sizing:border-box">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:6px;width:35px;text-align:center">№ п/п</th>
          <th style="border:1px solid #000;padding:6px;text-align:left">Наименование оборудования, марка, тип</th>
          <th style="border:1px solid #000;padding:6px;width:140px;text-align:center">Заводской номер</th>
          <th style="border:1px solid #000;padding:6px;width:60px;text-align:center">Кол-во</th>
          <th style="border:1px solid #000;padding:6px;width:150px;text-align:left">Место установки</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function renderTechnicalReadinessTableHtml(materials = []) {
  const rowsHtml = materials.map(m => {
    const plan = numberOrNull(m.plan_qty);
    const fact = numberOrNull(m.fact_qty ?? m.quantity);
    return `
      <tr>
        <td style="border:1px solid #000;padding:5px">${m.item_name || m.name || ''}</td>
        <td style="border:1px solid #000;padding:5px;text-align:center">${m.unit || ''}</td>
        <td style="border:1px solid #000;padding:5px;text-align:right">${plan ?? ''}</td>
        <td style="border:1px solid #000;padding:5px;text-align:right">${fact ?? ''}</td>
        <td style="border:1px solid #000;padding:5px;text-align:center">${m.note || ''}</td>
      </tr>
    `;
  }).join('');
  return `
    <table class="grid-table" style="width:100%;border-collapse:collapse;font-size:11px;margin:12px 0;border:1px solid #000;box-sizing:border-box">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:6px;text-align:left">Наименование этапа работ</th>
          <th style="border:1px solid #000;padding:6px;width:55px;text-align:center">Ед. изм.</th>
          <th style="border:1px solid #000;padding:6px;width:80px;text-align:right">Объем по проекту</th>
          <th style="border:1px solid #000;padding:6px;width:80px;text-align:right">Выполнено по факту</th>
          <th style="border:1px solid #000;padding:6px;width:130px;text-align:center">Примечание</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function renderInputControlJournalTableHtml(materials = [], task = {}, installer = '') {
  const rowsHtml = materials.map((m, idx) => {
    const qty = numberOrNull(m.fact_qty ?? m.quantity);
    const controlDate = m.control_date || m.input_control_date;
    return `
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${controlDate ? formatDateRu(controlDate) : ''}</td>
        <td style="border:1px solid #000;padding:4px">${m.item_name || m.name || ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right">${qty === null ? '' : `${qty}${m.unit ? ' ' + m.unit : ''}`}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${m.quality_document || m.certificate || ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${m.control_result || ''}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${m.control_responsible || installer || ''}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="grid-table" style="width:100%;border-collapse:collapse;font-size:11px;margin:12px 0;border:1px solid #000;box-sizing:border-box">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:5px;width:30px;text-align:center">№</th>
          <th style="border:1px solid #000;padding:5px;width:75px;text-align:center">Дата</th>
          <th style="border:1px solid #000;padding:5px;text-align:left">Наименование материала / оборудования</th>
          <th style="border:1px solid #000;padding:5px;width:60px;text-align:right">Кол-во</th>
          <th style="border:1px solid #000;padding:5px;width:140px;text-align:center">Документ о качестве</th>
          <th style="border:1px solid #000;padding:5px;width:65px;text-align:center">Результат</th>
          <th style="border:1px solid #000;padding:5px;width:95px;text-align:center">Ответственный</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function renderProtocolPsiTableHtml(ports = []) {
  let rowsHtml = '';
  ports.forEach((p, idx) => {
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:3px;text-align:center">${idx + 1}</td>
        <td style="border:1px solid #000;padding:3px;text-align:center">${p.cabinet || p.patch_panel || ''}</td>
        <td style="border:1px solid #000;padding:3px;text-align:center">${p.outlet_marking || p.marking || p.port_number || ''}</td>
        <td style="border:1px solid #000;padding:3px;text-align:center">${p.wiremap || p.wire_map || p.crimping || ''}</td>
        <td style="border:1px solid #000;padding:3px;text-align:center">${p.testing_status || ''}</td>
      </tr>
    `;
  });

  return `
    <table class="grid-table" style="width:100%;border-collapse:collapse;font-size:11px;margin:10px 0;border:1px solid #000;box-sizing:border-box">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th rowspan="2" style="border:1px solid #000;padding:4px;width:35px;text-align:center">№ п/п</th>
          <th colspan="2" style="border:1px solid #000;padding:4px;text-align:center">Идентификатор порта</th>
          <th rowspan="2" style="border:1px solid #000;padding:4px;text-align:center">Схема разводки (Т568В)</th>
          <th rowspan="2" style="border:1px solid #000;padding:4px;width:80px;text-align:center">Результат</th>
        </tr>
        <tr style="background:#f9fafb;font-weight:700">
          <th style="border:1px solid #000;padding:4px;width:70px;text-align:center">начало</th>
          <th style="border:1px solid #000;padding:4px;width:70px;text-align:center">конец</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function renderIpAddressingTableHtml(materials = []) {
  let rowsHtml = '';
  materials.filter(m => m.hostname || m.ip_address || m.ip || m.mask || m.gateway).forEach((m, idx) => {
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px;font-family:monospace;font-weight:700" contenteditable="true">${m.hostname || ''}</td>
        <td style="border:1px solid #000;padding:4px" contenteditable="true">${m.model || m.item_name || m.name || ''}</td>
        <td style="border:1px solid #000;padding:4px;font-family:monospace;text-align:center" contenteditable="true">${m.ip_address || m.ip || ''}</td>
        <td style="border:1px solid #000;padding:4px;font-family:monospace;text-align:center" contenteditable="true">${m.mask || ''}</td>
        <td style="border:1px solid #000;padding:4px;font-family:monospace;text-align:center" contenteditable="true">${m.gateway || ''}</td>
      </tr>
    `;
  });

  return `
    <table class="grid-table" style="width:100%;border-collapse:collapse;font-size:11px;margin:12px 0;border:1px solid #000;box-sizing:border-box">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:6px;width:35px;text-align:center">№ п/п</th>
          <th style="border:1px solid #000;padding:6px;text-align:left">Имя устройства (Hostname)</th>
          <th style="border:1px solid #000;padding:6px;text-align:left">Модель оборудования</th>
          <th style="border:1px solid #000;padding:6px;width:115px;text-align:center">IP управления</th>
          <th style="border:1px solid #000;padding:6px;width:105px;text-align:center">Маска</th>
          <th style="border:1px solid #000;padding:6px;width:115px;text-align:center">Шлюз</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}
