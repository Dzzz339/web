// server/services/documentContext.js
// Единый движок контекста данных и шаблонизации документов Stockeasy
import { formatSumWordsRu, parseCalculationItems } from './docxGenerator.js';

export function formatDateRu(dateVal) {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export function formatDateRuWords(dateVal) {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const d = dateVal ? new Date(dateVal) : new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()] || 'января';
  const year = d.getFullYear();
  return `«${day}» ${month} ${year} г.`;
}

export function formatMoney(val) {
  const num = Number(val || 0);
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}

/**
 * Сбор полного контекста переменных из базы данных для формирования документа
 */
export async function collectDocumentContext({ pool, taskId, contractId, subcontractId, customData = {} }) {
  let task = null;
  let contract = null;
  let subcontract = null;
  let contractor = {};
  let ourCompany = {};
  let materials = [];
  let ports = [];
  let calculationLines = [];

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
  let ownId = (subcontract && subcontract.own_company_id) || (task && task.own_company_id) || (contract && contract.own_company_id);
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
  if (!ownId) {
    const oc = await pool.query("SELECT id FROM own_companies WHERE is_default = true OR code = 'KS' ORDER BY id ASC LIMIT 1");
    if (oc.rows.length) ownId = oc.rows[0].id;
  }
  if (ownId) {
    const ocRes = await pool.query('SELECT * FROM own_companies WHERE id = $1', [ownId]);
    if (ocRes.rows.length > 0) {
      ourCompany = ocRes.rows[0];
    }
  }

  // 5. Загрузка подрядчика
  let contractorId = (subcontract && subcontract.contractor_id);
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
      contractor = { name_short: task.contractor, name_full: task.contractor, director: task.contractor };
    }
  }

  // Договор с подрядчиком (рамочный)
  let linkedContractorContract = {};
  if (subcontract && subcontract.contractor_contract_id) {
    const ccRes = await pool.query('SELECT * FROM contractor_contracts WHERE id = $1', [subcontract.contractor_contract_id]);
    if (ccRes.rows.length) linkedContractorContract = ccRes.rows[0];
  }
  if (!linkedContractorContract.id && contractor.id) {
    const ccRes = await pool.query('SELECT * FROM contractor_contracts WHERE contractor_id = $1 ORDER BY id DESC LIMIT 1', [contractor.id]);
    if (ccRes.rows.length) linkedContractorContract = ccRes.rows[0];
  }

  // 6. Материалы и порты (если есть задача)
  if (taskId) {
    const mRes = await pool.query(`
      SELECT tm.*, m.name, m.code, m.unit, m.price_default
      FROM task_materials tm
      LEFT JOIN materials m ON tm.material_id = m.id
      WHERE tm.task_id = $1
      ORDER BY tm.id ASC
    `, [taskId]);
    materials = mRes.rows;

    const pRes = await pool.query('SELECT * FROM task_ports WHERE task_id = $1 ORDER BY id ASC', [taskId]);
    ports = pRes.rows;
  }

  // 7. Расчетные строки работ (смета)
  calculationLines = parseCalculationItems(subcontract || {}, task || {});

  // 8. Финансовые итоги
  let totalAmount = 0;
  if (subcontract && subcontract.price_agreed !== null && subcontract.price_agreed !== undefined && Number(subcontract.price_agreed) > 0) {
    totalAmount = Number(subcontract.price_agreed);
  } else if (calculationLines.length > 0) {
    totalAmount = calculationLines.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
  } else if (task && task.price_per_unit) {
    totalAmount = Number(task.price_per_unit);
  } else if (task && task.amount) {
    totalAmount = Number(task.amount);
  }

  // 9. Специалисты
  let specialists = [];
  if (customData.specialists && Array.isArray(customData.specialists) && customData.specialists.length > 0) {
    specialists = customData.specialists;
  } else if (subcontract && subcontract.installer_fio) {
    specialists.push({
      num: 1,
      full_name: subcontract.installer_fio,
      passport: subcontract.installer_passport || '—',
      phone: subcontract.installer_phone || '—',
      auto: subcontract.auto_number || '—',
      role: 'Старший монтажник'
    });
  }

  const now = new Date();
  const docNumber = customData.doc_number || (subcontract ? `ЗН-${task ? task.id : '1'}-${subcontract.id}` : `ДГ-${Date.now().toString().slice(-6)}`);
  const docDate = customData.doc_date || now;

  // Формируем структурированный словарь контекста
  const ctx = {
    // Система / общие
    doc_number: docNumber,
    doc_date: formatDateRu(docDate),
    doc_date_words: formatDateRuWords(docDate),
    current_date: formatDateRu(now),
    current_date_words: formatDateRuWords(now),
    current_year: String(now.getFullYear()),
    city: task?.city || ourCompany?.city || 'г. Москва',

    // Наша компания (Генподрядчик / Исполнитель)
    our_company: {
      name: ourCompany.name_short || 'ООО «Кабельные Сети»',
      name_full: ourCompany.name_full || 'Общество с ограниченной ответственностью «Кабельные Сети»',
      inn: ourCompany.inn || '7728491024',
      kpp: ourCompany.kpp || '772801001',
      ogrn: ourCompany.ogrn || '1197746682010',
      address_legal: ourCompany.address_legal || '117246, г. Москва, Научный проезд, д. 10',
      director: ourCompany.director || 'Иванов А.А.',
      director_title: ourCompany.director_title || 'Генеральный директор',
      phone: ourCompany.phone || '+7 (495) 000-00-00',
      bank_name: ourCompany.bank_name || 'ПАО Сбербанк',
      bik: ourCompany.bik || '044525225',
      account_pay: ourCompany.account_pay || '40702810000000000000',
      account_corr: ourCompany.account_corr || '30101810400000000225'
    },

    // Подрядчик / Исполнитель
    contractor: {
      name: contractor.name_short || (subcontract?.contractor_name) || (task?.contractor) || 'ИП Иванов И.И.',
      name_full: contractor.name_full || contractor.name_short || 'Индивидуальный предприниматель',
      inn: contractor.inn || (subcontract?.contractor_inn) || '—',
      kpp: contractor.kpp || '—',
      ogrn: contractor.ogrn || contractor.ogrnip || '—',
      address_legal: contractor.address_legal || 'Адрес подрядчика не указан',
      director: contractor.director || contractor.name_short || 'Руководитель',
      phone: contractor.phone || subcontract?.installer_phone || '—',
      bank_name: contractor.bank_name || '—',
      bik: contractor.bik || '—',
      account_pay: contractor.account_pay || '—',
      account_corr: contractor.account_corr || '—',
      contract_number: linkedContractorContract.contract_number || contractor.contract_number || 'б/н',
      contract_date: linkedContractorContract.contract_date ? formatDateRu(linkedContractorContract.contract_date) : formatDateRu(now)
    },

    // Заказчик (Сторона 1 по контракту)
    customer: {
      name: (contract?.customer) || (task?.customer) || 'ПАО Сбербанк',
      inn: contract?.customer_inn || '7707083893',
      address: contract?.customer_address || 'г. Москва, ул. Вавилова, д. 19',
      contact: task?.contact || contract?.contact_person || '—'
    },

    // Объект и заявка
    task: {
      id: task?.id || '—',
      vsp: task?.vsp || '—',
      address: task?.address || '—',
      city: task?.city || '—',
      region: task?.region || '—',
      work_type: task?.work_type || 'СКС',
      tip_obj: task?.tip_obj || 'Отделение банка',
      deadline: task?.deadline ? formatDateRu(task.deadline) : '—',
      deadline_words: task?.deadline ? formatDateRuWords(task.deadline) : '—',
      order_date: task?.date_zayavki ? formatDateRu(task.date_zayavki) : formatDateRu(now),
      purchase_id: task?.purchase_id || contract?.purchase_id || '—'
    },

    // Контракт
    contract: {
      id: contract?.id || '—',
      number: contract?.contract_number || '—',
      date: contract?.contract_date ? formatDateRu(contract.contract_date) : '—',
      title: contract?.title || 'Договор подряда',
      purchase_id: contract?.purchase_id || task?.purchase_id || '—',
      law_type: contract?.contract_law_type || '223-ФЗ'
    },

    // Субподряд
    subcontract: {
      id: subcontract?.id || '—',
      number: subcontract?.subcontract_number || docNumber,
      status: subcontract?.status || 'active',
      ports_count: String(subcontract?.ports_count || task?.fact || task?.in_order || 0),
      distance_km: String(subcontract?.distance_km || task?.distance_km || 0)
    },

    // Финансы
    finance: {
      total_amount: totalAmount,
      total_amount_formatted: formatMoney(totalAmount),
      total_amount_words: formatSumWordsRu(totalAmount),
      vat_text: 'НДС не облагается в связи с применением УСН',
      margin: task?.margin ? formatMoney(task.margin) : '—'
    },

    // Массивы данных для итераций
    works: calculationLines.map((w, idx) => ({
      num: idx + 1,
      title: w.title,
      unit: w.unit,
      qty: w.qty,
      price: w.price,
      price_formatted: formatMoney(w.price),
      total: w.total,
      total_formatted: formatMoney(w.total)
    })),

    specialists: specialists.map((s, idx) => ({
      num: idx + 1,
      full_name: s.full_name || 'Специалист СМР',
      passport: s.passport || s.passport_series_number || '—',
      phone: s.phone || '—',
      role: s.role || 'Монтажник',
      auto: s.auto || s.auto_number || '—'
    })),

    materials: materials.map((m, idx) => ({
      num: idx + 1,
      name: m.name || 'Материал СКС',
      code: m.code || '—',
      unit: m.unit || 'шт.',
      qty: m.quantity || 1,
      price: m.price_default || 0,
      price_formatted: formatMoney(m.price_default || 0),
      total: Number(m.quantity || 1) * Number(m.price_default || 0),
      total_formatted: formatMoney(Number(m.quantity || 1) * Number(m.price_default || 0))
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
    сумма_числом: String(ctx.finance.total_amount),
    сумма_прописью: ctx.finance.total_amount_words,
    ндс_инфо: ctx.finance.vat_text,

    фио_монтажника: ctx.specialists[0]?.full_name || '—',
    паспорт_монтажника: ctx.specialists[0]?.passport || '—',
    телефон_монтажника: ctx.specialists[0]?.phone || '—',
    госномер_авто: ctx.specialists[0]?.auto || '—',

    // Готовые HTML-блоки таблиц на случай, если в шаблоне не используют циклы:
    таблица_работ: renderWorksTableHtml(ctx.works, ctx.finance),
    таблица_специалистов: renderSpecialistsTableHtml(ctx.specialists),
    таблица_материалов: renderMaterialsTableHtml(ctx.materials),
    блок_подписей: renderSignaturesBlockHtml(ctx.our_company, ctx.contractor)
  };

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
  if (!works.length) {
    rowsHtml = '<tr><td colspan="6" style="text-align:center;padding:8px">Монтажные работы СКС по объекту (1 компл.)</td></tr>';
  } else {
    works.forEach(w => {
      rowsHtml += `
        <tr>
          <td style="border:1px solid #000;padding:5px 6px;text-align:center">${w.num}</td>
          <td style="border:1px solid #000;padding:5px 8px;text-align:left">${w.title}</td>
          <td style="border:1px solid #000;padding:5px 6px;text-align:center">${w.unit}</td>
          <td style="border:1px solid #000;padding:5px 6px;text-align:right">${w.qty}</td>
          <td style="border:1px solid #000;padding:5px 6px;text-align:right">${w.price_formatted}</td>
          <td style="border:1px solid #000;padding:5px 6px;text-align:right;font-weight:600">${w.total_formatted}</td>
        </tr>
      `;
    });
  }

  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;border:1px solid #000">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:6px;width:30px;text-align:center">№</th>
          <th style="border:1px solid #000;padding:6px;text-align:left">Наименование работ / услуг</th>
          <th style="border:1px solid #000;padding:6px;width:45px;text-align:center">Ед. изм.</th>
          <th style="border:1px solid #000;padding:6px;width:55px;text-align:right">Кол-во</th>
          <th style="border:1px solid #000;padding:6px;width:85px;text-align:right">Цена</th>
          <th style="border:1px solid #000;padding:6px;width:95px;text-align:right">Стоимость</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr style="font-weight:700;background:#fafafa">
          <td colspan="5" style="border:1px solid #000;padding:6px 8px;text-align:right">ИТОГО:</td>
          <td style="border:1px solid #000;padding:6px;text-align:right;font-size:13px">${finance.total_amount_formatted || '0 ₽'}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function renderSpecialistsTableHtml(specialists = []) {
  if (!specialists.length) {
    return '<p style="font-style:italic;color:#666">Список специалистов уточняется</p>';
  }
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
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;border:1px solid #000">
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
  if (!materials.length) {
    return '<p style="font-style:italic;color:#666">Материалы предоставляются заказчиком / подрядчиком по месту выполнения работ</p>';
  }
  let rowsHtml = '';
  let totalSum = 0;
  materials.forEach(m => {
    totalSum += Number(m.total || 0);
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:5px 6px;text-align:center">${m.num}</td>
        <td style="border:1px solid #000;padding:5px 8px">${m.name}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:center">${m.code}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:center">${m.unit}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:right">${m.qty}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:right">${m.price_formatted}</td>
        <td style="border:1px solid #000;padding:5px 6px;text-align:right;font-weight:600">${m.total_formatted}</td>
      </tr>
    `;
  });

  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;border:1px solid #000">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:6px;width:30px;text-align:center">№</th>
          <th style="border:1px solid #000;padding:6px;text-align:left">Наименование ТМЦ</th>
          <th style="border:1px solid #000;padding:6px;width:80px;text-align:center">Артикул</th>
          <th style="border:1px solid #000;padding:6px;width:45px;text-align:center">Ед. изм.</th>
          <th style="border:1px solid #000;padding:6px;width:55px;text-align:right">Кол-во</th>
          <th style="border:1px solid #000;padding:6px;width:85px;text-align:right">Цена</th>
          <th style="border:1px solid #000;padding:6px;width:95px;text-align:right">Сумма</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr style="font-weight:700;background:#fafafa">
          <td colspan="6" style="border:1px solid #000;padding:6px 8px;text-align:right">ИТОГО ТМЦ:</td>
          <td style="border:1px solid #000;padding:6px;text-align:right;font-size:13px">${formatMoney(totalSum)}</td>
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
          ${our.director_title || 'Директор'}: _________________ / ${our.director} /
        </div>
        <div style="margin-top:6px;font-size:11px;color:#666">М.П.</div>
      </div>

      <div style="width:47%;border-top:1px solid #000;padding-top:8px">
        <p style="font-weight:700;margin:0 0 4px 0">ОТ ПОДРЯДЧИКА / ИСПОЛНИТЕЛЯ:</p>
        <p style="margin:0 0 2px 0"><b>${contractor.name_full || contractor.name}</b></p>
        <p style="margin:0 0 2px 0">ИНН: ${contractor.inn}</p>
        <p style="margin:0 0 12px 0">Адрес: ${contractor.address_legal}</p>
        <div style="margin-top:20px">
          Подпись: _________________ / ${contractor.director || contractor.name} /
        </div>
        <div style="margin-top:6px;font-size:11px;color:#666">М.П.</div>
      </div>
    </div>
  `;
}
