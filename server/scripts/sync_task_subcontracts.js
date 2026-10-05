import pg from 'pg';

export async function syncSubcontractsForTasks(pool) {
  // 1. Get all tasks with a contractor
  const { rows: tasks } = await pool.query(`
    SELECT id, contractor, work_type, deadline, status, amount 
    FROM tasks 
    WHERE contractor IS NOT NULL AND TRIM(contractor) != ''
  `);

  console.log(`[SyncSubcontracts] Found ${tasks.length} tasks with contractor`);

  let synced = 0;
  let created = 0;

  for (const t of tasks) {
    const rawContr = t.contractor.trim();
    if (!rawContr) continue;

    // Check if task already has a subcontract
    const { rows: existingSubs } = await pool.query(
      `SELECT id, contractor_id FROM task_subcontracts WHERE task_id = $1 LIMIT 1`,
      [t.id]
    );

    // Find contractor in contractors table
    let contrId = null;
    let contrName = rawContr;

    // Try exact match first
    const { rows: exactMatches } = await pool.query(
      `SELECT id, name_short, inn FROM contractors 
       WHERE LOWER(TRIM(name_short)) = LOWER(TRIM($1)) OR LOWER(TRIM(name_full)) = LOWER(TRIM($1)) 
       LIMIT 1`,
      [rawContr]
    );

    if (exactMatches.length > 0) {
      contrId = exactMatches[0].id;
      contrName = exactMatches[0].name_short;
    } else {
      // Try fuzzy match by first significant word
      const cleanWord = rawContr.replace(/^(?:ИП|ООО|СЗ|АО|ЗАО)\s+/i, '').replace(/^[А-Я]\./, '').split(/[\s.]+/)[0];
      if (cleanWord && cleanWord.length >= 3) {
        const { rows: fuzzyMatches } = await pool.query(
          `SELECT id, name_short FROM contractors 
           WHERE (name_short ILIKE $1 OR name_full ILIKE $1) AND type != 'customer'
           LIMIT 1`,
          [`%${cleanWord}%`]
        );
        if (fuzzyMatches.length > 0) {
          contrId = fuzzyMatches[0].id;
          contrName = fuzzyMatches[0].name_short;
        }
      }
    }

    // If still no contractor in contractors table, insert one
    if (!contrId) {
      const syntheticInn = 'SUB-' + Math.abs(hashCode(rawContr)).toString().slice(0, 10);
      try {
        const { rows: newContr } = await pool.query(
          `INSERT INTO contractors (name_short, name_full, inn, type, status)
           VALUES ($1, $1, $2, 'subcontractor', 'active')
           ON CONFLICT (inn) DO UPDATE SET name_short = EXCLUDED.name_short
           RETURNING id, name_short`,
          [rawContr, syntheticInn]
        );
        if (newContr.length > 0) {
          contrId = newContr[0].id;
          contrName = newContr[0].name_short;
        }
      } catch (e) {
        console.warn(`Could not insert contractor for "${rawContr}":`, e.message);
      }
    }

    // Check if we can find a matching specialist (installer)
    let specId = null;
    let specFio = null;
    let specPhone = null;
    let specPass = null;
    let specAuto = null;

    const firstWord = rawContr.replace(/^(?:ИП|ООО|СЗ|АО|ЗАО)\s+/i, '').replace(/^[А-Я]\./, '').split(/[\s.]+/)[0];
    if (firstWord && firstWord.length >= 3) {
      const { rows: matchedSpecs } = await pool.query(
        `SELECT id, full_name, phone, passport_raw, passport_series_number, auto_number 
         FROM specialists 
         WHERE full_name ILIKE $1 
         ORDER BY id ASC LIMIT 1`,
        [`%${firstWord}%`]
      );
      if (matchedSpecs.length > 0) {
        const sp = matchedSpecs[0];
        specId = sp.id;
        specFio = sp.full_name;
        specPhone = sp.phone;
        specPass = sp.passport_raw || sp.passport_series_number;
        specAuto = sp.auto_number;
      }
    }

    const subStatus = (t.status === 'done') ? 'smr_done' : (t.status === 'progress' ? 'in_progress' : 'assigned');
    const workType = t.work_type || 'Монтаж СКС';
    const priceAgreed = Number(t.amount) || 0;

    if (existingSubs.length > 0) {
      // Update existing subcontract if contractor_id or contractor_name was missing
      await pool.query(
        `UPDATE task_subcontracts 
         SET contractor_id = COALESCE(contractor_id, $1),
             contractor_name = COALESCE(contractor_name, $2)
         WHERE id = $3`,
        [contrId, contrName, existingSubs[0].id]
      );
      synced++;
    } else {
      // Create subcontract
      await pool.query(
        `INSERT INTO task_subcontracts (
          task_id, contractor_id, contractor_name, work_type, status,
          deadline, price_agreed, specialist_id, installer_fio,
          installer_phone, installer_passport, auto_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          t.id,
          contrId,
          contrName,
          workType,
          subStatus,
          t.deadline || null,
          priceAgreed,
          specId,
          specFio,
          specPhone,
          specPass,
          specAuto
        ]
      );
      created++;
    }
  }

  console.log(`[SyncSubcontracts] Done: created ${created} new subcontracts, synced ${synced} existing.`);
  return { created, synced, total: tasks.length };
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export async function syncSingleTaskSubcontract(pool, taskId) {
  const { rows } = await pool.query(
    `SELECT id, contractor, work_type, deadline, status, amount FROM tasks WHERE id = $1`,
    [taskId]
  );
  if (!rows.length) return null;
  const t = rows[0];
  const rawContr = (t.contractor || '').trim();
  if (!rawContr) return null;

  const { rows: existingSubs } = await pool.query(
    `SELECT id, contractor_id FROM task_subcontracts WHERE task_id = $1 LIMIT 1`,
    [t.id]
  );

  let contrId = null;
  let contrName = rawContr;

  const { rows: exactMatches } = await pool.query(
    `SELECT id, name_short, inn FROM contractors 
     WHERE LOWER(TRIM(name_short)) = LOWER(TRIM($1)) OR LOWER(TRIM(name_full)) = LOWER(TRIM($1)) 
     LIMIT 1`,
    [rawContr]
  );

  if (exactMatches.length > 0) {
    contrId = exactMatches[0].id;
    contrName = exactMatches[0].name_short;
  } else {
    const cleanWord = rawContr.replace(/^(?:ИП|ООО|СЗ|АО|ЗАО)\s+/i, '').replace(/^[А-Я]\./, '').split(/[\s.]+/)[0];
    if (cleanWord && cleanWord.length >= 3) {
      const { rows: fuzzyMatches } = await pool.query(
        `SELECT id, name_short FROM contractors 
         WHERE (name_short ILIKE $1 OR name_full ILIKE $1) AND type != 'customer'
         LIMIT 1`,
        [`%${cleanWord}%`]
      );
      if (fuzzyMatches.length > 0) {
        contrId = fuzzyMatches[0].id;
        contrName = fuzzyMatches[0].name_short;
      }
    }
  }

  if (!contrId) {
    const syntheticInn = 'SUB-' + Math.abs(hashCode(rawContr)).toString().slice(0, 10);
    try {
      const { rows: newContr } = await pool.query(
        `INSERT INTO contractors (name_short, name_full, inn, type, status)
         VALUES ($1, $1, $2, 'subcontractor', 'active')
         ON CONFLICT (inn) DO UPDATE SET name_short = EXCLUDED.name_short
         RETURNING id, name_short`,
        [rawContr, syntheticInn]
      );
      if (newContr.length > 0) {
        contrId = newContr[0].id;
        contrName = newContr[0].name_short;
      }
    } catch (e) {
      console.warn(`Could not insert contractor for "${rawContr}":`, e.message);
    }
  }

  let specId = null, specFio = null, specPhone = null, specPass = null, specAuto = null;
  const firstWord = rawContr.replace(/^(?:ИП|ООО|СЗ|АО|ЗАО)\s+/i, '').replace(/^[А-Я]\./, '').split(/[\s.]+/)[0];
  if (firstWord && firstWord.length >= 3) {
    const { rows: matchedSpecs } = await pool.query(
      `SELECT id, full_name, phone, passport_raw, passport_series_number, auto_number 
       FROM specialists 
       WHERE full_name ILIKE $1 
       ORDER BY id ASC LIMIT 1`,
      [`%${firstWord}%`]
    );
    if (matchedSpecs.length > 0) {
      const sp = matchedSpecs[0];
      specId = sp.id;
      specFio = sp.full_name;
      specPhone = sp.phone;
      specPass = sp.passport_raw || sp.passport_series_number;
      specAuto = sp.auto_number;
    }
  }

  const subStatus = (t.status === 'done') ? 'smr_done' : (t.status === 'progress' ? 'in_progress' : 'assigned');
  const workType = t.work_type || 'Монтаж СКС';
  const priceAgreed = Number(t.amount) || 0;

  if (existingSubs.length > 0) {
    const { rows: updated } = await pool.query(
      `UPDATE task_subcontracts 
       SET contractor_id = COALESCE(contractor_id, $1),
           contractor_name = COALESCE(contractor_name, $2)
       WHERE id = $3
       RETURNING *`,
      [contrId, contrName, existingSubs[0].id]
    );
    return updated[0];
  } else {
    const { rows: created } = await pool.query(
      `INSERT INTO task_subcontracts (
        task_id, contractor_id, contractor_name, work_type, status,
        deadline, price_agreed, specialist_id, installer_fio,
        installer_phone, installer_passport, auto_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        t.id,
        contrId,
        contrName,
        workType,
        subStatus,
        t.deadline || null,
        priceAgreed,
        specId,
        specFio,
        specPhone,
        specPass,
        specAuto
      ]
    );
    return created[0];
  }
}

// Standalone execution
if (process.argv[1] && process.argv[1].includes('sync_task_subcontracts')) {
  const pool = new pg.Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/stockeasy_db' });
  syncSubcontractsForTasks(pool)
    .then(res => {
      console.log('Result:', res);
      return pool.end();
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
