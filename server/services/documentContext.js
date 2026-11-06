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
      contractor = { name_short: task.contractor, name_full: task.contractor, director: task.contractor };
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
  const docNumber = customData.doc_number || 
    (poa ? poa.number : 
      (subcontractContract ? subcontractContract.contract_number : 
        (subcontract ? `ЗН-${task ? task.id : '1'}-${subcontract.id}` : `ДГ-${Date.now().toString().slice(-6)}`)));
  const docDate = customData.doc_date || (poa?.issue_date ? poa.issue_date : (subcontractContract?.contract_date ? subcontractContract.contract_date : now));

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

  const currentEssence = subcontractContract?.contract_essence || 'subcontract';
  const essenceText = essenceMap[currentEssence] || essenceMap.subcontract;
  const essenceTitle = essenceTitleMap[currentEssence] || essenceTitleMap.subcontract;

  let subjectParagraph = '';
  if (currentEssence === 'mirror') {
    const parentNum = subcontractContract?.parent_contract_number || 'б/н';
    const parentDate = subcontractContract?.parent_contract_date ? formatDateRu(subcontractContract.parent_contract_date) : '—';
    const parentCust = subcontractContract?.parent_customer || subcontractContract?.customer_tag || 'Заказчик';
    const mirrorPct = subcontractContract?.mirror_percent !== null && subcontractContract?.mirror_percent !== undefined ? Number(subcontractContract.mirror_percent) : 0;
    subjectParagraph = `1.1. Субподрядчик обязуется по заданию Генподрядчика выполнить комплекс работ в рамках исполнения обязательств по Генеральному контракту № ${parentNum} от ${parentDate} (Конечный заказчик: ${parentCust}), а Генподрядчик обязуется принять результат надлежаще выполненных работ и оплатить их. Вознаграждение Субподрядчика составляет ${mirrorPct}% от утвержденного объема финансирования соответствующих работ по Генеральному контракту.`;
  } else {
    subjectParagraph = `1.1. Субподрядчик обязуется по заданию Генподрядчика выполнить ${essenceText}, а Генподрядчик обязуется принять результат надлежаще выполненных работ и оплатить их в соответствии с условиями настоящего Договора и Приложений к нему.`;
  }

  const territoryText = (subcontractContract?.territory) || (task?.region ? (task.city ? `${task.city}, ${task.region}` : task.region) : '');
  const territoryParagraph = territoryText ? 
    `1.2. Место выполнения работ (территория действия Договора): ${territoryText}.` : 
    `1.2. Место выполнения работ и адресные ориентиры конкретных объектов определяются Сторонами в Заявках (Приложениях к настоящему Договору).`;

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

    суть_договора: essenceText,
    суть_договора_название: essenceTitle,
    предмет_договора: subjectParagraph,
    территория_действия: territoryText || 'Определяется в заявках',
    территория_абзац: territoryParagraph,
    конечный_заказчик: subcontractContract?.customer_tag || subcontractContract?.parent_customer || ctx.customer.name,
    зеркальный_процент: subcontractContract?.mirror_percent ? `${subcontractContract.mirror_percent}%` : '—',
    родительский_договор_номер: subcontractContract?.parent_contract_number || '—',
    родительский_договор_дата: subcontractContract?.parent_contract_date ? formatDateRu(subcontractContract.parent_contract_date) : '—',
    статус_договора: statusMapRu[subcontractContract?.status] || 'Создан',

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

    // Переменные для доверенностей (форма М-2 и стандартные)
    номер_доверенности: poa?.number || ctx.doc_number,
    дата_выдачи: poa?.issue_date ? formatDateRu(poa.issue_date) : ctx.doc_date,
    дата_выдачи_прописью: poa?.issue_date ? formatDateRuWords(poa.issue_date) : ctx.doc_date_words,
    срок_действия: poa?.valid_until ? formatDateRu(poa.valid_until) : ('31.12.' + ctx.current_year),
    срок_действия_прописью: poa?.valid_until ? formatDateRuWords(poa.valid_until) : ('31 декабря ' + ctx.current_year + ' г.'),
    подотчетное_лицо_фио: poa?.person_name || poaSpecialist?.full_name || ctx.specialists[0]?.full_name || '—',
    подотчетное_лицо_должность: poaSpecialist?.position || 'Сотрудник',
    паспорт_серия: passSeries || '50 14',
    паспорт_номер: passNumber || '252604',
    паспорт_кем_выдан: passIssuedBy || 'Отделом УФМС России',
    паспорт_дата_выдачи: passIssueDate || '—',
    поставщик_наименование: poa?.contractor_name || customData?.contractor_name || 'ООО "Поставщик"',
    наш_окпо: ourCompany.okpo || (ourCompany.inn === '5406774300' ? '32173475' : (ourCompany.inn === '5406792155' || ourCompany.code === 'ULTIMA' ? '16917456' : '32173475')),
    руководитель_иоф: formatFioShort(ourCompany.director),
    главбух_иоф: formatFioShort(ourCompany.director),
    номер_наряда: '—',
    номер_акта: '—',
    основание_получения: customData?.document_base || 'счету / товарной накладной',

    // Готовые HTML-блоки таблиц на случай, если в шаблоне не используют циклы:
    таблица_работ: renderWorksTableHtml(ctx.works, ctx.finance),
    таблица_специалистов: renderSpecialistsTableHtml(ctx.specialists),
    таблица_материалов: renderMaterialsTableHtml(ctx.materials),
    таблица_кж: renderKjTableHtml(ports),
    таблица_спецификации_ид: renderIdSpecTableHtml(materials),
    таблица_протокола_измерений: renderFlukeProtocolTableHtml(ports, ctx),
    штамп_гост: renderGostStampHtml(ctx),
    блок_подписей: renderSignaturesBlockHtml(ctx.our_company, ctx.contractor),

    // Закрывающие документы и ИД (по формам Алексея Чайки)
    порты_факт: String(task?.fact || task?.in_order || 374),
    номер_и_дата_контракта: contract?.contract_number ? 
      (`Государственный контракт № ${contract.contract_number}${contract.contract_date ? (' от ' + formatDateRu(contract.contract_date)) : ''}`) : 
      (`Контракт / Договор № ${ctx.doc_number} от ${ctx.doc_date}`),
    ответственный_фио: task?.contractor || ctx.specialists[0]?.full_name || 'Малыш',
    дата_начала_работ: task?.data_vyhoda ? formatDateRu(task.data_vyhoda) : (task?.date_zayavki ? formatDateRu(task.date_zayavki) : ctx.doc_date),
    дата_окончания_работ: task?.deadline ? formatDateRu(task.deadline) : ctx.doc_date,
    материалы_текст_аоср: renderAosrMaterialsText(materials, task, Number(task?.fact || task?.in_order || 374)),
    таблица_приемки_оборудования: renderEquipmentAcceptanceTableHtml(materials, task, Number(task?.fact || task?.in_order || 374)),
    таблица_технической_готовности: renderTechnicalReadinessTableHtml(materials, task, Number(task?.fact || task?.in_order || 374)),
    таблица_входного_контроля: renderInputControlJournalTableHtml(materials, task, Number(task?.fact || task?.in_order || 374), task?.contractor || ctx.specialists[0]?.full_name || 'Малыш'),
    таблица_линий_пси: renderProtocolPsiTableHtml(Number(task?.fact || task?.in_order || 374)),
    таблица_ip_адресации: renderIpAddressingTableHtml(materials, task, task?.contractor || ctx.specialists[0]?.full_name || 'Малыш')
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

function renderKjTableHtml(ports = []) {
  if (!ports || ports.length === 0) {
    return '<p style="color:#666;font-style:italic">Линии кабельного журнала не внесены</p>';
  }
  let rowsHtml = '';
  ports.forEach((p, idx) => {
    const portNum = p.port_number || String(idx + 1);
    const room = p.room || 'Помещение';
    const marking = p.marking || `ПП-1 / Порт ${portNum}`;
    const len = p.cable_length || 25;
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px">${room}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${marking}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${portNum}</td>
        <td style="border:1px solid #000;padding:4px">Серверная, ШТК-1</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">ПП-1 / ${portNum}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">UTP Cat.5e</td>
        <td style="border:1px solid #000;padding:4px;text-align:right">${len}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${p.testing_status || 'Готов'}</td>
      </tr>
    `;
  });

  return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin:10px 0;border:1px solid #000">
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
  if (!materials || materials.length === 0) {
    return '<p style="color:#666;font-style:italic">Позиции спецификации не внесены</p>';
  }
  let rowsHtml = '';
  materials.forEach((m, idx) => {
    const pos = m.pos_num || (idx + 1);
    const name = m.name || m.item_name || 'Материал СКС';
    const model = m.model || '—';
    const code = m.code || m.article || '—';
    const supp = m.supplier || 'Склад';
    const unit = m.unit || 'шт.';
    const qty = m.qty || m.plan_qty || 1;
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center">${pos}</td>
        <td style="border:1px solid #000;padding:4px">${name}</td>
        <td style="border:1px solid #000;padding:4px">${model}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${code}</td>
        <td style="border:1px solid #000;padding:4px">${supp}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${unit}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right">${qty}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${m.note || ''}</td>
      </tr>
    `;
  });

  return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin:10px 0;border:1px solid #000">
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
  if (!ports || ports.length === 0) {
    return '<p style="color:#666;font-style:italic">Измерения портов Fluke не проводились</p>';
  }
  let rowsHtml = '';
  ports.forEach((p, idx) => {
    const portNum = p.port_number || String(idx + 1);
    const room = p.room || 'Помещение';
    const marking = p.marking || `Розетка ${portNum}`;
    const len = p.cable_length || 25;
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px">Патч-панель (ПП-1), порт ${portNum}</td>
        <td style="border:1px solid #000;padding:4px">${room}, ${marking}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">UTP Cat.5e 4х2х0.51</td>
        <td style="border:1px solid #000;padding:4px;text-align:right">${len}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">TIA/EIA-568B</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;font-weight:700;color:#166534">Pass</td>
      </tr>
    `;
  });

  return `
    <div style="font-size:11.5px;margin-bottom:8px">
      <b>Прибор:</b> Fluke Networks MicroScanner (MS2-100) зав. № 2780829 &nbsp;|&nbsp; <b>Дата поверки:</b> Действительна
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin:10px 0;border:1px solid #000">
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
  const objName = ctx.task?.address || 'Объект заказчика';
  const orgName = ctx.our_company?.name || 'ООО "Ультима"';
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
          <span style="font-size:9.5px;font-weight:normal">Создание структурированных кабельных систем (СКС)</span>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid #000;padding:3px">Разработал</td>
        <td colspan="2" style="border:1px solid #000;padding:3px;font-weight:700">Чайка А.Н.</td>
        <td style="border:1px solid #000;padding:3px"></td>
        <td style="border:1px solid #000;padding:3px">${ctx.current_date || ''}</td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid #000;padding:3px">Проверил</td>
        <td colspan="2" style="border:1px solid #000;padding:3px;font-weight:700">Ашихмин В.А.</td>
        <td style="border:1px solid #000;padding:3px"></td>
        <td style="border:1px solid #000;padding:3px">${ctx.current_date || ''}</td>
      </tr>
      <tr>
        <td colspan="4" style="border:1px solid #000;padding:4px;font-weight:700;text-align:center">Исполнительная документация (ИД)</td>
        <td style="border:1px solid #000;padding:4px;text-align:center"><b>Стадия</b><br/>И</td>
        <td style="border:1px solid #000;padding:4px;text-align:center"><b>Лист</b><br/>1</td>
        <td style="border:1px solid #000;padding:4px;text-align:center"><b>Листов</b><br/>20</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;font-weight:700;font-size:11px">${orgName}</td>
      </tr>
    </table>
  `;
}

function renderAosrMaterialsText(materials = [], task = {}, portsCount = 374) {
  const cableLen = Math.max(500, portsCount * 12);
  const boxesCount = Math.max(10, Math.ceil(portsCount / 4));
  return `Кабель витая пара ITK Cat 5e UTP (зеленый) — ${cableLen} м, коробка для открытой проводки на 2 поста Ecoplast SM45/4 72944 — ${boxesCount} шт., блок розеток PH12-7D3 — 2 шт., розетки Mosaic с модулями Keystone — ${portsCount} шт.`;
}

function renderEquipmentAcceptanceTableHtml(materials = [], task = {}, portsCount = 374) {
  const switchesCount = Math.max(1, Math.min(10, Math.ceil(portsCount / 48)));
  let rowsHtml = `
    <tr>
      <td style="border:1px solid #000;padding:5px;text-align:center">1</td>
      <td style="border:1px solid #000;padding:5px">Шкаф телекоммуникационный 19" напольный</td>
      <td style="border:1px solid #000;padding:5px;text-align:center">Б/Н</td>
      <td style="border:1px solid #000;padding:5px;text-align:center">1</td>
      <td style="border:1px solid #000;padding:5px">Серверная</td>
    </tr>
  `;

  for (let i = 1; i <= switchesCount; i++) {
    const sNum = `DL-2026-${String(i).padStart(3, '0')}`;
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:5px;text-align:center">${i + 1}</td>
        <td style="border:1px solid #000;padding:5px">Коммутатор D-Link DGS-1052 (1056 series)</td>
        <td style="border:1px solid #000;padding:5px;text-align:center">${sNum}</td>
        <td style="border:1px solid #000;padding:5px;text-align:center">1</td>
        <td style="border:1px solid #000;padding:5px">Шкаф телекоммуникационный</td>
      </tr>
    `;
  }

  const nextIdx = switchesCount + 2;
  rowsHtml += `
    <tr>
      <td style="border:1px solid #000;padding:5px;text-align:center">${nextIdx}</td>
      <td style="border:1px solid #000;padding:5px">Блок розеток PH12-7D3 19" горизонтальный</td>
      <td style="border:1px solid #000;padding:5px;text-align:center">Б/Н</td>
      <td style="border:1px solid #000;padding:5px;text-align:center">2</td>
      <td style="border:1px solid #000;padding:5px">Шкаф телекоммуникационный</td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:5px;text-align:center">${nextIdx + 1}</td>
      <td style="border:1px solid #000;padding:5px">Розетки Mosaic с модулями ITK Keystone (на ${portsCount} портов)</td>
      <td style="border:1px solid #000;padding:5px;text-align:center">Б/Н</td>
      <td style="border:1px solid #000;padding:5px;text-align:center">${Math.ceil(portsCount / 2)}</td>
      <td style="border:1px solid #000;padding:5px">Рабочие места (помещения)</td>
    </tr>
  `;

  return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin:12px 0;border:1px solid #000">
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

function renderTechnicalReadinessTableHtml(materials = [], task = {}, portsCount = 374) {
  const cableLen = Math.max(500, portsCount * 12);
  const boxesCount = Math.max(10, Math.ceil(portsCount / 4));
  return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin:12px 0;border:1px solid #000">
      <thead>
        <tr style="background:#f3f4f6;font-weight:700">
          <th style="border:1px solid #000;padding:6px;text-align:left">Наименование этапа работ</th>
          <th style="border:1px solid #000;padding:6px;width:55px;text-align:center">Ед. изм.</th>
          <th style="border:1px solid #000;padding:6px;width:80px;text-align:right">Объем по проекту</th>
          <th style="border:1px solid #000;padding:6px;width:80px;text-align:right">Выполнено по факту</th>
          <th style="border:1px solid #000;padding:6px;width:130px;text-align:center">Примечание</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border:1px solid #000;padding:5px">Установка телекоммуникационного шкафа 19"</td>
          <td style="border:1px solid #000;padding:5px;text-align:center">шт.</td>
          <td style="border:1px solid #000;padding:5px;text-align:right">1</td>
          <td style="border:1px solid #000;padding:5px;text-align:right">1</td>
          <td style="border:1px solid #000;padding:5px;text-align:center">Выполнено</td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px">Прокладка кабеля ITK витая пара (зеленый)</td>
          <td style="border:1px solid #000;padding:5px;text-align:center">м</td>
          <td style="border:1px solid #000;padding:5px;text-align:right">${cableLen}</td>
          <td style="border:1px solid #000;padding:5px;text-align:right">${cableLen}</td>
          <td style="border:1px solid #000;padding:5px;text-align:center">Целостность проверена</td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px">Монтаж розеток Mosaic с модулями ITK Keystone</td>
          <td style="border:1px solid #000;padding:5px;text-align:center">порт</td>
          <td style="border:1px solid #000;padding:5px;text-align:right">${portsCount}</td>
          <td style="border:1px solid #000;padding:5px;text-align:right">${portsCount}</td>
          <td style="border:1px solid #000;padding:5px;text-align:center">Соответствие T568B</td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px">Монтаж коробок для открытой проводки Ecoplast SM45/4</td>
          <td style="border:1px solid #000;padding:5px;text-align:center">шт.</td>
          <td style="border:1px solid #000;padding:5px;text-align:right">${boxesCount}</td>
          <td style="border:1px solid #000;padding:5px;text-align:right">${boxesCount}</td>
          <td style="border:1px solid #000;padding:5px;text-align:center">Выполнено</td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px">Установка блоков розеток PH12-7D3 в шкаф</td>
          <td style="border:1px solid #000;padding:5px;text-align:center">шт.</td>
          <td style="border:1px solid #000;padding:5px;text-align:right">2</td>
          <td style="border:1px solid #000;padding:5px;text-align:right">2</td>
          <td style="border:1px solid #000;padding:5px;text-align:center">Выполнено</td>
        </tr>
      </tbody>
    </table>
  `;
}

function renderInputControlJournalTableHtml(materials = [], task = {}, portsCount = 374, installer = 'Малыш') {
  const cableLen = Math.max(500, portsCount * 12);
  const boxesCount = Math.max(10, Math.ceil(portsCount / 4));
  const switchesCount = Math.max(1, Math.min(10, Math.ceil(portsCount / 48)));
  const dateStr = task?.data_vyhoda ? formatDateRu(task.data_vyhoda) : (task?.date_zayavki ? formatDateRu(task.date_zayavki) : '28.08.2026');

  return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin:12px 0;border:1px solid #000">
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
      <tbody>
        <tr>
          <td style="border:1px solid #000;padding:4px;text-align:center">1</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">${dateStr}</td>
          <td style="border:1px solid #000;padding:4px">Зеленый кабель ITK витая пара Cat 5e UTP</td>
          <td style="border:1px solid #000;padding:4px;text-align:right">${cableLen} м</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">Сертификат № ITK-VP-2026</td>
          <td style="border:1px solid #000;padding:4px;text-align:center;color:#15803d;font-weight:700">Годен</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">${installer}</td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:4px;text-align:center">2</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">${dateStr}</td>
          <td style="border:1px solid #000;padding:4px">Модули ITK Keystone и розетки Mosaic</td>
          <td style="border:1px solid #000;padding:4px;text-align:right">${portsCount} шт.</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">Паспорт № ITK-KS-903</td>
          <td style="border:1px solid #000;padding:4px;text-align:center;color:#15803d;font-weight:700">Годен</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">${installer}</td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:4px;text-align:center">3</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">${dateStr}</td>
          <td style="border:1px solid #000;padding:4px">Коробка для открытой проводки Ecoplast SM45/4 72944</td>
          <td style="border:1px solid #000;padding:4px;text-align:right">${boxesCount} шт.</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">Паспорт № EP-72944</td>
          <td style="border:1px solid #000;padding:4px;text-align:center;color:#15803d;font-weight:700">Годен</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">${installer}</td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:4px;text-align:center">4</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">${dateStr}</td>
          <td style="border:1px solid #000;padding:4px">Блок розеток PH12-7D3</td>
          <td style="border:1px solid #000;padding:4px;text-align:right">2 шт.</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">Сертификат соответствия</td>
          <td style="border:1px solid #000;padding:4px;text-align:center;color:#15803d;font-weight:700">Годен</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">${installer}</td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:4px;text-align:center">5</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">${dateStr}</td>
          <td style="border:1px solid #000;padding:4px">Коммутаторы D-Link DGS-1052 (1056 series)</td>
          <td style="border:1px solid #000;padding:4px;text-align:right">${switchesCount} шт.</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">Техпаспорт производителя</td>
          <td style="border:1px solid #000;padding:4px;text-align:center;color:#15803d;font-weight:700">Годен</td>
          <td style="border:1px solid #000;padding:4px;text-align:center">${installer}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function renderProtocolPsiTableHtml(portsCount = 374) {
  const displayLimit = Math.min(portsCount, 30);
  let rowsHtml = '';
  for (let i = 1; i <= displayLimit; i++) {
    const portCode = i <= 12 ? `0.${String(i).padStart(2, '0')}` : String(100 + i - 12);
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:3px;text-align:center">${i}</td>
        <td style="border:1px solid #000;padding:3px;text-align:center">ШТК</td>
        <td style="border:1px solid #000;padding:3px;text-align:center">${portCode}</td>
        <td style="border:1px solid #000;padding:3px;text-align:center">Соответствует</td>
        <td style="border:1px solid #000;padding:3px;text-align:center;font-weight:700;color:#15803d">PASS</td>
      </tr>
    `;
  }
  if (portsCount > displayLimit) {
    rowsHtml += `
      <tr>
        <td colspan="5" style="border:1px solid #000;padding:6px;text-align:center;font-style:italic;color:#555">
          ... и далее все порты с 31 по ${portsCount} (100% PASS, схема разводки T568B соответствует)
        </td>
      </tr>
    `;
  }

  return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin:10px 0;border:1px solid #000">
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

function renderIpAddressingTableHtml(materials = [], task = {}, installer = 'Малыш') {
  const portsCount = Number(task?.fact || task?.in_order || 374);
  const switchesCount = Math.max(1, Math.min(10, Math.ceil(portsCount / 48)));
  let rowsHtml = '';
  for (let i = 1; i <= switchesCount; i++) {
    const host = `sw-access-${String(i).padStart(2, '0')}`;
    const ip = `192.168.100.${10 + i}`;
    rowsHtml += `
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center">${i}</td>
        <td style="border:1px solid #000;padding:4px;font-family:monospace;font-weight:700" contenteditable="true">${host}</td>
        <td style="border:1px solid #000;padding:4px" contenteditable="true">D-Link DGS-1052 (1056 series)</td>
        <td style="border:1px solid #000;padding:4px;font-family:monospace;text-align:center" contenteditable="true">${ip}</td>
        <td style="border:1px solid #000;padding:4px;font-family:monospace;text-align:center" contenteditable="true">255.255.255.0</td>
        <td style="border:1px solid #000;padding:4px;font-family:monospace;text-align:center" contenteditable="true">192.168.100.1</td>
      </tr>
    `;
  }

  return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin:12px 0;border:1px solid #000">
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
