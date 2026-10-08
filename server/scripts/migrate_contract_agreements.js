import { pool } from '../config/db.js';

export async function migrateContractAgreements() {
  console.log('--- Начинаем миграцию дополнительных соглашений (ДС) ---');

  // 1. Создаем таблицу и индексы если еще нет
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_agreements (
      id                 SERIAL PRIMARY KEY,
      contract_id        INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      agreement_number   INTEGER NOT NULL DEFAULT 1,
      agreement_code     TEXT,
      external_number    TEXT,
      region             TEXT NOT NULL,
      city               TEXT,
      price_unit         NUMERIC DEFAULT 0,
      price_list         JSONB DEFAULT '[]',
      amount             NUMERIC DEFAULT 0,
      status             TEXT DEFAULT 'active',
      comment            TEXT,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      updated_at         TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_contract_agreements_contract_id ON contract_agreements(contract_id);
    CREATE INDEX IF NOT EXISTS idx_contract_agreements_region ON contract_agreements(region);
    CREATE INDEX IF NOT EXISTS idx_contract_agreements_ext_num ON contract_agreements(external_number);
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS contract_agreement_id INTEGER REFERENCES contract_agreements(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_contract_agreement_id ON tasks(contract_agreement_id);
  `);
  console.log('Таблица contract_agreements проверена/создана');

  // 2. Находим все договоры, содержащие списки регионов или номеров
  const { rows: contracts } = await pool.query(`
    SELECT id, internal_number, contract_number, delivery_place, lots, customer_name
    FROM contracts
    ORDER BY id ASC
  `);

  let totalAgreementsCreated = 0;

  for (const c of contracts) {
    const linesPlace = String(c.delivery_place || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const linesNum = String(c.contract_number || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    // Проверяем наличие нумерации вида "1 - Город", "1. Город", "Лот 1"
    const isMultiRegion = linesPlace.length > 1 && linesPlace.some(l => /^(?:лот\s*)?\d+[\s\-:.]+/i.test(l));
    const isMultiNum = linesNum.length > 1 && linesNum.some(l => /^(?:лот\s*)?\d+[\s\-:.]+/i.test(l));

    let lotsList = [];
    try {
      lotsList = typeof c.lots === 'string' ? JSON.parse(c.lots) : (c.lots || []);
    } catch (e) {}

    if (isMultiRegion || isMultiNum || (Array.isArray(lotsList) && lotsList.length > 0)) {
      console.log(`Обработка контракта #${c.id} (${c.internal_number})...`);

      // Собираем карту по номерам соглашений
      const agreementsMap = new Map();

      // 1. Из строк delivery_place
      linesPlace.forEach((lp, idx) => {
        const m = lp.match(/^(?:лот\s*)?(\d+)[\s\-:.]+(.*)/i);
        const num = m ? parseInt(m[1], 10) : idx + 1;
        const reg = m && m[2] ? m[2].trim() : lp;
        if (!agreementsMap.has(num)) {
          agreementsMap.set(num, { num, region: reg, extNum: '' });
        } else {
          agreementsMap.get(num).region = reg;
        }
      });

      // 2. Из строк contract_number
      linesNum.forEach((ln, idx) => {
        const m = ln.match(/^(?:лот\s*)?(\d+)[\s\-:.]+(.*)/i);
        const num = m ? parseInt(m[1], 10) : idx + 1;
        let ext = m && m[2] ? m[2].trim() : ln;
        ext = ext.replace(/^[№N#\s]+/, '').trim();
        if (!agreementsMap.has(num)) {
          agreementsMap.set(num, { num, region: '', extNum: ext });
        } else {
          agreementsMap.get(num).extNum = ext;
        }
      });

      // 3. Из lots если были
      if (Array.isArray(lotsList) && lotsList.length > 0) {
        lotsList.forEach((lot, idx) => {
          const num = parseInt(lot.lot_number || idx + 1, 10);
          const reg = lot.place || '';
          const ext = String(lot.contract_number || '').replace(/^[№N#\s]+/, '').trim();
          if (!agreementsMap.has(num)) {
            agreementsMap.set(num, { num, region: reg, extNum: ext });
          } else {
            const cur = agreementsMap.get(num);
            if (!cur.region && reg) cur.region = reg;
            if (!cur.extNum && ext) cur.extNum = ext;
          }
        });
      }

      // Сохраняем в contract_agreements
      const sortedKeys = Array.from(agreementsMap.keys()).sort((a, b) => a - b);
      for (const num of sortedKeys) {
        const ag = agreementsMap.get(num);
        if (!ag.region && !ag.extNum) continue;

        // Проверяем существующую запись
        const existing = await pool.query(`
          SELECT id FROM contract_agreements
          WHERE contract_id = $1 AND agreement_number = $2
          LIMIT 1
        `, [c.id, num]);

        const agCode = `ДС-${num}`;
        const regionName = ag.region || `Регион ${num}`;
        const extNumber = ag.extNum || '';

        if (existing.rows.length === 0) {
          await pool.query(`
            INSERT INTO contract_agreements (
              contract_id, agreement_number, agreement_code, external_number,
              region, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())
          `, [c.id, num, agCode, extNumber, regionName]);
          totalAgreementsCreated++;
        } else {
          await pool.query(`
            UPDATE contract_agreements SET
              agreement_code = $1,
              external_number = COALESCE(NULLIF($2, ''), external_number),
              region = COALESCE(NULLIF($3, ''), region),
              updated_at = NOW()
            WHERE id = $4
          `, [agCode, extNumber, regionName, existing.rows[0].id]);
        }
      }

      // Обновляем сам контракт: приводим к чистому виду
      // Чистим c.contract_number от полотна строк
      let cleanNum = c.contract_number;
      if (linesNum.length > 1) {
        // Оставляем только первый или краткое обозначение
        cleanNum = `Многолотовый (${sortedKeys.length} ДС)`;
      }
      let cleanPlace = c.delivery_place;
      if (linesPlace.length > 1) {
        // Формируем краткий перечень первых 3 городов + сколько всего
        const cities = sortedKeys.map(k => agreementsMap.get(k).region).filter(Boolean);
        if (cities.length <= 4) {
          cleanPlace = cities.join(', ');
        } else {
          cleanPlace = `${cities.slice(0, 3).join(', ')} и ещё ${cities.length - 3} рег.`;
        }
      }

      await pool.query(`
        UPDATE contracts SET
          contract_number = $1,
          delivery_place = $2
        WHERE id = $3
      `, [cleanNum, cleanPlace, c.id]);

      console.log(`✓ Для контракта #${c.id} (${c.internal_number}) сформировано ${sortedKeys.length} ДС`);
    }
  }

  console.log(`✅ Миграция ДС завершена. Создано/актуализировано записей: ${totalAgreementsCreated}`);

  // 4. Запускаем автоматическую привязку заявок к ДС по регионам и номерам (с приоритетом точных 4-значных кодов и годов)
  console.log('--- Запуск умной автолинковки заявок к ДС ---');
  const { rows: allAgreements } = await pool.query(`
    SELECT ca.id as agreement_id, ca.contract_id, ca.agreement_number, ca.external_number, ca.region,
           c.internal_number
    FROM contract_agreements ca
    JOIN contracts c ON c.id = ca.contract_id
    ORDER BY c.internal_number DESC, ca.agreement_number ASC
  `);

  let tasksLinkedCount = 0;

  // ПАСС 1: Точное совпадение по 4 цифрам номера ДС в ID заявки (например, ББ-5376-... -> 50005595376)
  for (const ag of allAgreements) {
    const extNum = ag.external_number ? ag.external_number.trim() : '';
    const suffix4 = extNum.length >= 4 ? extNum.slice(-4) : '';
    if (suffix4 && suffix4.length === 4) {
      const sqlExact = `
        UPDATE tasks t SET
          contract_id = $1,
          contract_agreement_id = $2,
          contract_lot = $3
        WHERE (t.id ILIKE $4 OR t.region ILIKE $5 OR t.raw_data::text ILIKE $5)
        RETURNING t.id
      `;
      const resExact = await pool.query(sqlExact, [
        ag.contract_id, ag.agreement_id, ag.agreement_number,
        `%${suffix4}%`,
        `%${extNum}%`
      ]);
      if (resExact.rows.length > 0) {
        tasksLinkedCount += resExact.rows.length;
        console.log(`[ПАСС 1 Точный код ${suffix4}] Привязано ${resExact.rows.length} заявок к ДС #${ag.agreement_number} (${ag.region}) контракта ${ag.internal_number}`);
      }
    }
  }

  // ПАСС 2: Сопоставление по региону с учетом года договора и года заявки
  for (const ag of allAgreements) {
    const regWord = ag.region.trim();
    if (!regWord || regWord.length < 3) continue;

    const mYear = String(ag.internal_number).match(/^\d{2}(\d{2})-/);
    const contractYear = mYear ? `20${mYear[1]}` : null;

    let yearFilter = '';
    const params = [ag.contract_id, ag.agreement_id, ag.agreement_number, `%${regWord}%`];
    if (contractYear) {
      params.push(`%${contractYear}%`);
      params.push(contractYear);
      yearFilter = `AND (t.sheet ILIKE $5 OR EXTRACT(YEAR FROM t.date_zayavki)::text = $6)`;
    }

    const sqlRegion = `
      UPDATE tasks t SET
        contract_id = $1,
        contract_agreement_id = $2,
        contract_lot = $3
      WHERE t.contract_agreement_id IS NULL
        AND (t.region ILIKE $4 OR t.address ILIKE $4)
        ${yearFilter}
      RETURNING t.id
    `;
    const resReg = await pool.query(sqlRegion, params);
    if (resReg.rows.length > 0) {
      tasksLinkedCount += resReg.rows.length;
      console.log(`[ПАСС 2 Регион ${regWord} ${contractYear || ''}] Привязано ${resReg.rows.length} заявок к ДС #${ag.agreement_number} контракта ${ag.internal_number}`);
    }
  }

  console.log(`✅ Привязка завершена! Всего привязано/перелинковано заявок к ДС: ${tasksLinkedCount}`);
  return { totalAgreementsCreated, tasksLinkedCount };
}

// Запуск напрямую из CLI
if (process.argv[1].endsWith('migrate_contract_agreements.js')) {
  migrateContractAgreements()
    .then(() => pool.end())
    .catch(err => {
      console.error('Ошибка миграции:', err);
      pool.end();
    });
}
