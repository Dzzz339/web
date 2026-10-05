// server/services/subcontractDmsService.js
// Сервис управления собственной структурой юрлиц («Собственные»),
// рамочными договорами подряда, дифференцированными прайс-листами и авторасчётом стоимости СМР.

export async function initSubcontractDms(pool) {
  // 1. Собственные юридические лица группы («Собственные»)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS own_companies (
      id              SERIAL PRIMARY KEY,
      code            TEXT UNIQUE NOT NULL,
      name_short      TEXT NOT NULL,
      name_full       TEXT NOT NULL,
      inn             TEXT NOT NULL,
      kpp             TEXT,
      ogrn            TEXT,
      director        TEXT NOT NULL,
      director_title  TEXT DEFAULT 'Директор',
      address_legal   TEXT NOT NULL,
      address_postal  TEXT,
      phone           TEXT,
      email           TEXT,
      bank_name       TEXT,
      bik             TEXT,
      account_pay     TEXT,
      account_corr    TEXT,
      vat_mode        TEXT DEFAULT 'with_vat',
      is_default      BOOLEAN DEFAULT false,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_own_companies_code ON own_companies(code)`);

  // 2. Справочник рамочных договоров с подрядчиками
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractor_contracts (
      id                  SERIAL PRIMARY KEY,
      contractor_id       INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
      own_company_id      INTEGER REFERENCES own_companies(id) ON DELETE SET NULL,
      contract_number     TEXT NOT NULL,
      contract_date       DATE NOT NULL DEFAULT CURRENT_DATE,
      title               TEXT,
      customer_tag        TEXT,
      subject             TEXT,
      territory           TEXT,
      valid_from          DATE,
      valid_to            DATE,
      status              TEXT DEFAULT 'active',
      scan_url            TEXT DEFAULT '',
      terms_json          JSONB DEFAULT '{}',
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contractor_contracts_contractor ON contractor_contracts(contractor_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contractor_contracts_own_company ON contractor_contracts(own_company_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contractor_contracts_customer_tag ON contractor_contracts(customer_tag)`);

  // 3. Справочник прайс-листов (Приложения №1 - Протоколы договорной цены)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractor_price_lists (
      id              SERIAL PRIMARY KEY,
      contract_id     INTEGER NOT NULL REFERENCES contractor_contracts(id) ON DELETE CASCADE,
      name            TEXT NOT NULL DEFAULT 'Приложение №1 (Протокол согласования цены)',
      customer_tag    TEXT,
      region          TEXT,
      is_active       BOOLEAN DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_price_lists_contract ON contractor_price_lists(contract_id)`);

  // 4. Позиции прайс-листа с дифференцированной шкалой объема (до 3 ед / более 3 ед, км, суточные)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_list_items (
      id                  SERIAL PRIMARY KEY,
      price_list_id       INTEGER NOT NULL REFERENCES contractor_price_lists(id) ON DELETE CASCADE,
      work_code           TEXT,
      work_name           TEXT NOT NULL,
      unit                TEXT DEFAULT 'шт',
      price_tier_1        NUMERIC DEFAULT 0,
      price_tier_2        NUMERIC DEFAULT 0,
      tier_threshold      NUMERIC DEFAULT 3,
      is_variable_cost    BOOLEAN DEFAULT false,
      comment             TEXT,
      sort_order          INTEGER DEFAULT 0,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_price_items_list ON price_list_items(price_list_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_price_items_code ON price_list_items(work_code)`);

  // 5. Расширение таблицы task_subcontracts (связка с собственным юрлицом, договором, прайсом и деталями расчёта)
  await pool.query(`ALTER TABLE task_subcontracts ADD COLUMN IF NOT EXISTS own_company_id INTEGER REFERENCES own_companies(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE task_subcontracts ADD COLUMN IF NOT EXISTS contractor_contract_id INTEGER REFERENCES contractor_contracts(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE task_subcontracts ADD COLUMN IF NOT EXISTS price_list_id INTEGER REFERENCES contractor_price_lists(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE task_subcontracts ADD COLUMN IF NOT EXISTS calculation_details JSONB DEFAULT '{}'`);
  await pool.query(`ALTER TABLE task_subcontracts ADD COLUMN IF NOT EXISTS ports_count INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE task_subcontracts ADD COLUMN IF NOT EXISTS distance_km NUMERIC DEFAULT 0`);

  // 6. Расширение таблицы tasks
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS own_company_id INTEGER REFERENCES own_companies(id) ON DELETE SET NULL`);

  // 7. Посев начальных данных
  await seedInitialData(pool);
}

async function seedInitialData(pool) {
  // 1. Посев трех собственных юрлиц
  const ownList = [
    {
      code: 'KS',
      name_short: 'ООО "Кабельные Системы"',
      name_full: 'Общество с ограниченной ответственностью "Кабельные Системы"',
      inn: '5406774300',
      kpp: '540601001',
      ogrn: '1135476082260',
      director: 'Городович Милана Владимировна',
      director_title: 'Директор',
      address_legal: '630099, г. Новосибирск, ул. Орджоникидзе, 40, оф. 3517',
      address_postal: '630099, г. Новосибирск, ул. Орджоникидзе, 40, оф. 3517',
      bank_name: 'Филиал «Новосибирский» АО «АЛЬФА-БАНК»',
      bik: '045004774',
      account_pay: '40702810223130000540',
      account_corr: '30101810600000000774',
      vat_mode: 'with_vat',
      is_default: true
    },
    {
      code: 'K10',
      name_short: 'ООО "К10"',
      name_full: 'Общество с ограниченной ответственностью "К10"',
      inn: '5401995659',
      kpp: '547301001',
      ogrn: '1195476081234',
      director: 'Городович Илья Олегович',
      director_title: 'Директор',
      address_legal: '630090, г. Новосибирск, пр-кт Академика Лаврентьева, д. 2/2, оф. 126',
      address_postal: '630090, г. Новосибирск, пр-кт Академика Лаврентьева, д. 2/2, оф. 126',
      phone: '8-913-948-22-22',
      bank_name: 'ПАО Сбербанк России «Сибирский банк»',
      bik: '045004641',
      account_pay: '40702810244050054706',
      account_corr: '30101810500000000641',
      vat_mode: 'without_vat',
      is_default: false
    },
    {
      code: 'ULTIMA',
      name_short: 'ООО "Ультима"',
      name_full: 'Общество с ограниченной ответственностью "Ультима"',
      inn: '7810754890',
      kpp: '781001001',
      ogrn: '1197847089123',
      director: 'Чайка Алексей Владимирович',
      director_title: 'Директор',
      address_legal: '196084, г. Санкт-Петербург, Московский пр-кт, д. 100, лит. А',
      address_postal: '196084, г. Санкт-Петербург, Московский пр-кт, д. 100, лит. А',
      phone: '+7 (812) 380-00-00',
      email: 'info@stockeasy.ru',
      bank_name: 'ПАО СБЕРБАНК г. Москва',
      bik: '044525225',
      account_pay: '40702810938000012345',
      account_corr: '30101810400000000225',
      vat_mode: 'with_vat',
      is_default: false
    }
  ];

  const ownMap = {};
  for (const c of ownList) {
    const res = await pool.query(`
      INSERT INTO own_companies (
        code, name_short, name_full, inn, kpp, ogrn, director, director_title,
        address_legal, address_postal, phone, email, bank_name, bik, account_pay, account_corr, vat_mode, is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (code) DO UPDATE SET
        name_short = EXCLUDED.name_short,
        name_full = EXCLUDED.name_full,
        inn = EXCLUDED.inn,
        director = EXCLUDED.director,
        address_legal = EXCLUDED.address_legal,
        bank_name = EXCLUDED.bank_name,
        bik = EXCLUDED.bik,
        account_pay = EXCLUDED.account_pay,
        account_corr = EXCLUDED.account_corr
      RETURNING id, code
    `, [
      c.code, c.name_short, c.name_full, c.inn, c.kpp, c.ogrn, c.director, c.director_title,
      c.address_legal, c.address_postal, c.phone, c.email, c.bank_name, c.bik, c.account_pay, c.account_corr, c.vat_mode, c.is_default
    ]);
    ownMap[c.code] = res.rows[0].id;
  }

  // 2. Проверяем наличие ключевых подрядчиков из ТЗ (Хомич, Елагин)
  let khomichId = null;
  const khRes = await pool.query(`SELECT id FROM contractors WHERE inn = '720408256480' OR name_short ILIKE '%Хомич%' LIMIT 1`);
  if (khRes.rows.length) {
    khomichId = khRes.rows[0].id;
    await pool.query(`
      UPDATE contractors SET
        name_short = 'СЗ Хомич Александр Иванович',
        name_full = 'Самозанятый гражданин РФ Хомич Александр Иванович',
        inn = '720408256480',
        phone = '+7 (929) 264-60-88',
        director = 'Хомич А.И.',
        address_legal = 'г. Тюмень, ул. Пышминская, д. 56а',
        bank_name = 'ПАО Сбербанк',
        bik = '047102651',
        account_pay = '40817810567103597215',
        account_corr = '30101810800000000651',
        type = 'subcontractor'
      WHERE id = $1
    `, [khomichId]);
  } else {
    const ins = await pool.query(`
      INSERT INTO contractors (name_short, name_full, inn, phone, director, address_legal, bank_name, bik, account_pay, account_corr, type)
      VALUES (
        'СЗ Хомич Александр Иванович',
        'Самозанятый гражданин РФ Хомич Александр Иванович',
        '720408256480',
        '+7 (929) 264-60-88',
        'Хомич А.И.',
        'г. Тюмень, ул. Пышминская, д. 56а',
        'ПАО Сбербанк',
        '047102651',
        '40817810567103597215',
        '30101810800000000651',
        'subcontractor'
      )
      RETURNING id
    `);
    khomichId = ins.rows[0].id;
  }

  let elaginId = null;
  const elRes = await pool.query(`SELECT id FROM contractors WHERE inn = '290200191820' OR name_short ILIKE '%Елагин%' LIMIT 1`);
  if (elRes.rows.length) {
    elaginId = elRes.rows[0].id;
    await pool.query(`
      UPDATE contractors SET
        name_short = 'СЗ Елагин Владимир Игоревич',
        name_full = 'Самозанятый гражданин РФ Елагин Владимир Игоревич',
        inn = '290200191820',
        phone = '8-921-290-70-17',
        email = 'vovanfan@yandex.ru',
        director = 'Елагин В.И.',
        address_legal = 'Архангельская обл., г. Северодвинск, ул. Капитана Воронина, д. 14, кв. 10',
        bank_name = 'Архангельское отделение №8637 ПАО Сбербанк',
        bik = '041117601',
        account_pay = '40817810504008171804',
        type = 'subcontractor'
      WHERE id = $1
    `, [elaginId]);
  } else {
    const ins = await pool.query(`
      INSERT INTO contractors (name_short, name_full, inn, phone, email, director, address_legal, bank_name, bik, account_pay, type)
      VALUES (
        'СЗ Елагин Владимир Игоревич',
        'Самозанятый гражданин РФ Елагин Владимир Игоревич',
        '290200191820',
        '8-921-290-70-17',
        'vovanfan@yandex.ru',
        'Елагин В.И.',
        'Архангельская обл., г. Северодвинск, ул. Капитана Воронина, д. 14, кв. 10',
        'Архангельское отделение №8637 ПАО Сбербанк',
        '041117601',
        '40817810504008171804',
        'subcontractor'
      )
      RETURNING id
    `);
    elaginId = ins.rows[0].id;
  }

  // 3. Посев договоров для Хомича:
  // А) Хомич ↔ К10 (Сбербанк)
  const khK10Contract = await ensureContract({
    pool,
    contractorId: khomichId,
    ownCompanyId: ownMap['K10'],
    contractNumber: 'СКС Сб',
    contractDate: '2026-04-08',
    title: 'Договор подряда К10 (Сбер) - СЗ Хомич',
    customerTag: 'ПАО Сбербанк',
    subject: 'Модернизация и обслуживание СКС в отделениях «Сбера»',
    territory: 'Тюменская обл., не далее 100км от обл. центра',
    validFrom: '2026-04-08',
    validTo: '2026-12-31'
  });

  // Б) Хомич ↔ КС (Кабельные Системы - СФР)
  const khKsContract = await ensureContract({
    pool,
    contractorId: khomichId,
    ownCompanyId: ownMap['KS'],
    contractNumber: '01/07/26-Т',
    contractDate: '2026-07-01',
    title: 'Договор субподряда КС - СЗ Хомич (СФР / Разовые)',
    customerTag: 'ОСФР',
    subject: 'Монтажные и пусконаладочные работы СКС на объектах',
    territory: 'Тюменская область',
    validFrom: '2026-07-01',
    validTo: '2027-06-30'
  });

  // В) Елагин ↔ К10 (Сбербанк)
  const elK10Contract = await ensureContract({
    pool,
    contractorId: elaginId,
    ownCompanyId: ownMap['K10'],
    contractNumber: 'СКС СЗ 090626',
    contractDate: '2026-06-09',
    title: 'Договор подряда К10 (Сбер) - СЗ Елагин',
    customerTag: 'ПАО Сбербанк',
    subject: 'Модернизация и обслуживание СКС в отделениях «Сбера»',
    territory: 'г. Архангельск, Архангельская область (до 100км)',
    validFrom: '2026-06-09',
    validTo: '2026-12-31'
  });

  // 4. Посев прайс-листов из протоколов ТЗ (Приложение №1)
  const standardPriceItems = [
    { work_code: 'port_5e', work_name: 'Базовая стоимость работ 1(один) порт СКС 5е', unit: 'шт', tier1: 3000, tier2: 2500, threshold: 3, sort: 1 },
    { work_code: 'port_6', work_name: 'Базовая стоимость работ 1(один) порт СКС 6', unit: 'шт', tier1: 3500, tier2: 3000, threshold: 3, sort: 2 },
    { work_code: 'port_6a', work_name: 'Базовая стоимость работ 1(один) порт СКС 6А', unit: 'шт', tier1: 3500, tier2: 3000, threshold: 3, sort: 3 },
    { work_code: 'port_optics', work_name: 'Базовая стоимость работ 1(один) дуплексный оптический порт (2 волокна) OS2/OM3', unit: 'шт', tier1: 3500, tier2: 3000, threshold: 3, sort: 4 },
    { work_code: 'port_reinstall', work_name: 'Базовая стоимость за демонтаж с последующим монтажом СКС, за порт', unit: 'шт', tier1: 1200, tier2: 1000, threshold: 3, sort: 5 },
    { work_code: 'port_move', work_name: 'Базовая стоимость работ за перемещение/восстановление ранее используемых портов в пределах помещения (за порт)', unit: 'шт', tier1: 1700, tier2: 1500, threshold: 3, sort: 6 },
    { work_code: 'tksh_42u', work_name: 'Стоимость монтажа напольного ТКШ 42-47/48U 800х800', unit: 'шт', tier1: 10000, tier2: 10000, threshold: 1, sort: 7 },
    { work_code: 'tksh_32u', work_name: 'Стоимость монтажа напольного ТКШ 32U 600х600, 800х600, 800х800', unit: 'шт', tier1: 8000, tier2: 8000, threshold: 1, sort: 8 },
    { work_code: 'tksh_18u', work_name: 'Стоимость монтажа навесного ТКШ 18-22U 600х600', unit: 'шт', tier1: 6500, tier2: 6500, threshold: 1, sort: 9 },
    { work_code: 'tksh_swap', work_name: 'Демонтаж существующего ТКШ и смонтированного в него оборудования СКС, с последующим монтажом в новый ТКШ', unit: 'шт', tier1: 10000, tier2: 10000, threshold: 1, sort: 10 },
    { work_code: 'tksh_reterminate', work_name: 'Базовая стоимость работ за демонтаж/монтаж портов при замене ТКШ (за порт если нужно перешивать панель)', unit: 'шт', tier1: 500, tier2: 500, threshold: 1, sort: 11 },
    { work_code: 'tksh_demount_42u', work_name: 'Стоимость демонтажа напольного ТКШ 42U', unit: 'шт', tier1: 7000, tier2: 7000, threshold: 1, sort: 12 },
    { work_code: 'tksh_demount_32u', work_name: 'Стоимость демонтажа напольного ТКШ 24U-40U', unit: 'шт', tier1: 6000, tier2: 6000, threshold: 1, sort: 13 },
    { work_code: 'tksh_demount_18u', work_name: 'Стоимость демонтажа навесного ТКШ размером до 22U', unit: 'шт', tier1: 5000, tier2: 5000, threshold: 1, sort: 14 },
    { work_code: 'tksh_demount_simple', work_name: 'Демонтаж существующего ТКШ и смонтированного в него оборудования СКС', unit: 'шт', tier1: 2000, tier2: 2000, threshold: 1, sort: 15 },
    { work_code: 'tksh_mod_600', work_name: 'Модернизация существующего шкафа шириной 600мм', unit: 'шт', tier1: 3000, tier2: 3000, threshold: 1, sort: 16 },
    { work_code: 'tksh_mod_800', work_name: 'Модернизация существующего шкафа шириной 800мм', unit: 'шт', tier1: 3000, tier2: 3000, threshold: 1, sort: 17 },
    { work_code: 'km_rate', work_name: 'Выезд свыше 10 км', unit: 'км', tier1: 12, tier2: 12, threshold: 1, sort: 18 },
    { work_code: 'delivery', work_name: 'Доставка шкафов от 32U и больших объемов материалов', unit: 'по факту затрат', tier1: 0, tier2: 0, threshold: 1, is_var: true, sort: 19 },
    { work_code: 'daily_rate', work_name: 'Оплата суточных - 700р/чел/день', unit: 'по факту затрат', tier1: 700, tier2: 700, threshold: 1, is_var: true, sort: 20 },
    { work_code: 'hotel_rate', work_name: 'Проживание в случае командировки', unit: 'по факту затрат', tier1: 0, tier2: 0, threshold: 1, is_var: true, sort: 21 }
  ];

  if (khK10Contract) {
    await seedPriceList(pool, khK10Contract.id, 'Приложение №1 (Протокол согласования цены для Сбера)', 'ПАО Сбербанк', standardPriceItems);
  }
  if (elK10Contract) {
    await seedPriceList(pool, elK10Contract.id, 'Приложение №1 (Протокол согласования цены для Сбера)', 'ПАО Сбербанк', standardPriceItems);
  }
}

async function ensureContract({ pool, contractorId, ownCompanyId, contractNumber, contractDate, title, customerTag, subject, territory, validFrom, validTo }) {
  const existing = await pool.query(
    `SELECT id FROM contractor_contracts WHERE contractor_id = $1 AND contract_number = $2 LIMIT 1`,
    [contractorId, contractNumber]
  );
  if (existing.rows.length) {
    await pool.query(`
      UPDATE contractor_contracts SET
        own_company_id = $1, contract_date = $2, title = $3, customer_tag = $4,
        subject = $5, territory = $6, valid_from = $7, valid_to = $8, updated_at = NOW()
      WHERE id = $9
    `, [ownCompanyId, contractDate, title, customerTag, subject, territory, validFrom, validTo, existing.rows[0].id]);
    return existing.rows[0];
  }
  const ins = await pool.query(`
    INSERT INTO contractor_contracts (
      contractor_id, own_company_id, contract_number, contract_date, title,
      customer_tag, subject, territory, valid_from, valid_to
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
  `, [contractorId, ownCompanyId, contractNumber, contractDate, title, customerTag, subject, territory, validFrom, validTo]);
  return ins.rows[0];
}

async function seedPriceList(pool, contractId, name, customerTag, items) {
  let plRes = await pool.query(
    `SELECT id FROM contractor_price_lists WHERE contract_id = $1 LIMIT 1`,
    [contractId]
  );
  let priceListId;
  if (!plRes.rows.length) {
    const ins = await pool.query(
      `INSERT INTO contractor_price_lists (contract_id, name, customer_tag, is_active)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [contractId, name, customerTag]
    );
    priceListId = ins.rows[0].id;
  } else {
    priceListId = plRes.rows[0].id;
  }

  // Заполняем позиции
  for (const it of items) {
    const itExists = await pool.query(
      `SELECT id FROM price_list_items WHERE price_list_id = $1 AND work_code = $2 LIMIT 1`,
      [priceListId, it.work_code]
    );
    if (!itExists.rows.length) {
      await pool.query(`
        INSERT INTO price_list_items (
          price_list_id, work_code, work_name, unit, price_tier_1, price_tier_2, tier_threshold, is_variable_cost, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        priceListId, it.work_code, it.work_name, it.unit, it.tier1, it.tier2, it.threshold, it.is_var || false, it.sort
      ]);
    }
  }
}

// Калькулятор субподряда по правилам Алексея (порты по шкале + км свыше 10 км + шкафы)
export async function calculateSubcontractAmount(pool, { contractorId, contractorContractId, customerTag, ports = 0, portType = 'port_5e', distanceKm = 0, cabinetType = null, extraItems = [] }) {
  // 1. Ищем подходящий договор и прайс
  let query = `
    SELECT p.id AS price_list_id, c.id AS contract_id, c.own_company_id, c.contract_number, oc.name_short AS own_company_name
    FROM contractor_contracts c
    JOIN contractor_price_lists p ON p.contract_id = c.id AND p.is_active = true
    LEFT JOIN own_companies oc ON c.own_company_id = oc.id
  `;
  const params = [];
  if (contractorContractId) {
    query += ` WHERE c.id = $1 LIMIT 1`;
    params.push(contractorContractId);
  } else {
    query += ` WHERE c.contractor_id = $1 AND c.status = 'active'`;
    params.push(contractorId);
    if (customerTag) {
      query += ` ORDER BY (c.customer_tag ILIKE $2) DESC, c.id DESC LIMIT 1`;
      params.push(`%${customerTag}%`);
    } else {
      query += ` ORDER BY c.id DESC LIMIT 1`;
    }
  }

  const found = await pool.query(query, params);
  if (!found.rows.length) {
    return {
      success: false,
      message: 'Действующий прайс-лист для подрядчика не найден'
    };
  }

  const { price_list_id, contract_id, own_company_id, contract_number, own_company_name } = found.rows[0];

  // 2. Получаем строки прайса
  const itemsRes = await pool.query(
    `SELECT * FROM price_list_items WHERE price_list_id = $1 ORDER BY sort_order ASC`,
    [price_list_id]
  );
  const items = itemsRes.rows;
  const itemsMap = {};
  items.forEach(it => { itemsMap[it.work_code] = it; });

  const calculation = {
    contractId: contract_id,
    contractNumber: contract_number,
    ownCompanyId: own_company_id,
    ownCompanyName: own_company_name,
    priceListId: price_list_id,
    lines: [],
    totalWorksAmount: 0,
    transportAmount: 0,
    totalAmount: 0
  };

  // Порты
  const numPorts = Number(ports) || 0;
  if (numPorts > 0) {
    const portItem = itemsMap[portType] || itemsMap['port_5e'];
    if (portItem) {
      const threshold = Number(portItem.tier_threshold) || 3;
      const unitPrice = numPorts > threshold ? Number(portItem.price_tier_2) : Number(portItem.price_tier_1);
      const sum = numPorts * unitPrice;
      calculation.lines.push({
        work_code: portItem.work_code,
        work_name: portItem.work_name,
        quantity: numPorts,
        unit: portItem.unit,
        unit_price: unitPrice,
        amount: sum,
        tier: numPorts > threshold ? 2 : 1
      });
      calculation.totalWorksAmount += sum;
    }
  }

  // Шкаф (ТКШ)
  if (cabinetType && itemsMap[cabinetType]) {
    const cabItem = itemsMap[cabinetType];
    const unitPrice = Number(cabItem.price_tier_1) || 0;
    calculation.lines.push({
      work_code: cabItem.work_code,
      work_name: cabItem.work_name,
      quantity: 1,
      unit: cabItem.unit,
      unit_price: unitPrice,
      amount: unitPrice
    });
    calculation.totalWorksAmount += unitPrice;
  }

  // Километраж (свыше 10 км в обе стороны или в одну сторону по прайсу)
  const km = Number(distanceKm) || 0;
  if (km > 10 && itemsMap['km_rate']) {
    const kmItem = itemsMap['km_rate'];
    const billableKm = km - 10;
    const kmTariff = Number(kmItem.price_tier_1) || 12;
    const kmCost = billableKm * kmTariff;
    calculation.lines.push({
      work_code: 'km_rate',
      work_name: `Транспортные расходы (свыше 10 км: ${billableKm} км × ${kmTariff} ₽)`,
      quantity: billableKm,
      unit: 'км',
      unit_price: kmTariff,
      amount: kmCost
    });
    calculation.transportAmount += kmCost;
  }

  calculation.totalAmount = calculation.totalWorksAmount + calculation.transportAmount;

  return {
    success: true,
    calculation
  };
}
