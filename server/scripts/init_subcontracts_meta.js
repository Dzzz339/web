import { pool } from '../config/db.js';

async function initSubcontractsMeta() {
  console.log('[1/4] Altering contractor_price_lists schema...');
  await pool.query(`ALTER TABLE contractor_price_lists ALTER COLUMN contract_id DROP NOT NULL`);
  await pool.query(`ALTER TABLE contractor_price_lists ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE contractor_price_lists ADD COLUMN IF NOT EXISTS contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL`);

  console.log('[2/4] Linking contractor_id in contractor_price_lists from contractor_contracts...');
  await pool.query(`
    UPDATE contractor_price_lists pl
    SET contractor_id = cc.contractor_id
    FROM contractor_contracts cc
    WHERE pl.contract_id = cc.id AND pl.contractor_id IS NULL
  `);

  console.log('[3/4] Ensuring default general price list...');
  const defRes = await pool.query(`SELECT id FROM contractor_price_lists WHERE is_default = true LIMIT 1`);
  let defPlId;
  if (!defRes.rows.length) {
    const ins = await pool.query(`
      INSERT INTO contractor_price_lists (name, customer_tag, region, is_active, is_default)
      VALUES ('Базовый типовой прайс-лист субподряда (СКС / СМР)', 'Типовой (по умолчанию)', 'Все регионы', true, true)
      RETURNING id
    `);
    defPlId = ins.rows[0].id;
  } else {
    defPlId = defRes.rows[0].id;
  }

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
    { work_code: 'km_city', work_name: 'Выезд внутри города (<10 км)', unit: 'выезд', tier1: 300, tier2: 300, threshold: 1, sort: 18 },
    { work_code: 'km_rate', work_name: 'Выезд свыше 10 км (за 1 км)', unit: 'км', tier1: 12, tier2: 12, threshold: 1, sort: 19 },
    { work_code: 'delivery', work_name: 'Доставка шкафов от 32U и больших объемов материалов', unit: 'по факту', tier1: 0, tier2: 0, threshold: 1, sort: 20 },
    { work_code: 'daily_rate', work_name: 'Оплата суточных - 700р/чел/день', unit: 'чел/день', tier1: 700, tier2: 700, threshold: 1, sort: 21 },
    { work_code: 'hotel_rate', work_name: 'Проживание в случае командировки', unit: 'по факту', tier1: 0, tier2: 0, threshold: 1, sort: 22 }
  ];

  for (const it of standardPriceItems) {
    const itExists = await pool.query(
      `SELECT id FROM price_list_items WHERE price_list_id = $1 AND work_code = $2 LIMIT 1`,
      [defPlId, it.work_code]
    );
    if (!itExists.rows.length) {
      await pool.query(`
        INSERT INTO price_list_items (
          price_list_id, work_code, work_name, unit, price_tier_1, price_tier_2, tier_threshold, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [defPlId, it.work_code, it.work_name, it.unit, it.tier1, it.tier2, it.threshold, it.sort]);
    }
  }

  console.log('[4/4] Checking sample contractor Vygovskaya V.A....');
  let vygId = null;
  const vygRes = await pool.query(`SELECT id FROM contractors WHERE name_short ILIKE '%Выговск%' LIMIT 1`);
  if (!vygRes.rows.length) {
    const ins = await pool.query(`
      INSERT INTO contractors (name_short, name_full, inn, phone, director, address_legal, type)
      VALUES (
        'ИП Выговская Вера Александровна',
        'Индивидуальный предприниматель Выговская Вера Александровна',
        '753612345678',
        '+7 (924) 500-11-22',
        'Выговская В.А.',
        'Забайкальский край, г. Чита, ул. Ленина, д. 40',
        'subcontractor'
      ) RETURNING id
    `);
    vygId = ins.rows[0].id;
  } else {
    vygId = vygRes.rows[0].id;
  }

  // Ensure contract for Vygovskaya with KS
  const ksRes = await pool.query(`SELECT id FROM own_companies WHERE code = 'KS' LIMIT 1`);
  const ksId = ksRes.rows[0] ? ksRes.rows[0].id : null;
  const vygContractRes = await pool.query(`SELECT id FROM contractor_contracts WHERE contractor_id = $1 LIMIT 1`, [vygId]);
  if (!vygContractRes.rows.length && vygId && ksId) {
    const insC = await pool.query(`
      INSERT INTO contractor_contracts (
        contractor_id, own_company_id, contract_number, contract_date, title,
        customer_tag, subject, territory, status
      ) VALUES (
        $1, $2, 'СЗ-75-0626', '2026-06-01', 'Договор субподряда КС - ИП Выговская (Забайкальский край)',
        'ОСФР, разовые объекты', 'Монтаж СКС и пусконаладочные работы', 'Забайкальский край', 'active'
      ) RETURNING id
    `, [vygId, ksId]);
    const cId = insC.rows[0].id;
    const insPl = await pool.query(`
      INSERT INTO contractor_price_lists (contract_id, contractor_id, name, customer_tag, region, is_active)
      VALUES ($1, $2, 'Протокол договорной цены - ИП Выговская (Забайкалье)', 'СФР / Забайкалье', 'Забайкальский край', true)
      RETURNING id
    `, [cId, vygId]);
    const plId = insPl.rows[0].id;
    for (const it of standardPriceItems) {
      await pool.query(`
        INSERT INTO price_list_items (price_list_id, work_code, work_name, unit, price_tier_1, price_tier_2, tier_threshold, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [plId, it.work_code, it.work_name, it.unit, it.tier1, it.tier2, it.threshold, it.sort]);
    }
  }

  console.log('Done! All subcontract schemas and seeds are ready.');
  process.exit(0);
}

initSubcontractsMeta().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
