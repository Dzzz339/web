import { pool } from '../config/db.js';

const DADATA_TOKEN = process.env.DADATA_API_KEY || '5312de9ffa05f9a68cc381ddbb8484385f032bd8';

async function fetchDadataParty(query) {
  if (!query || query.trim().length < 2) return null;
  const cleanQ = query.trim().replace(/\r?\n|\r/g, ' ');

  // Strategy 1: Direct query
  try {
    const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Token ' + DADATA_TOKEN
      },
      body: JSON.stringify({ query: cleanQ, count: 1 })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.suggestions && data.suggestions[0]) return data.suggestions[0];
    }
  } catch (e) {}

  // Strategy 2: If starts with ОПФР or УПФР, try replacing with ОСФР (reorganized in 2023)
  if (/^[ОУ]ПФР/i.test(cleanQ)) {
    const osfrQ = cleanQ.replace(/^[ОУ]ПФР/i, 'ОСФР');
    try {
      const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Token ' + DADATA_TOKEN
        },
        body: JSON.stringify({ query: osfrQ, count: 1 })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.suggestions && data.suggestions[0]) return data.suggestions[0];
      }
    } catch (e) {}
  }

  // Strategy 3: Remove quotes if present
  if (cleanQ.includes('"') || cleanQ.includes('«')) {
    const unquoted = cleanQ.replace(/["«»]/g, ' ').replace(/\s+/g, ' ').trim();
    try {
      const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Token ' + DADATA_TOKEN
        },
        body: JSON.stringify({ query: unquoted, count: 1 })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.suggestions && data.suggestions[0]) return data.suggestions[0];
      }
    } catch (e) {}
  }

  return null;
}

async function repointForeignKeys(sourceId, targetId) {
  // users
  await pool.query('UPDATE users SET contractor_id = $1 WHERE contractor_id = $2', [targetId, sourceId]);
  // contracts
  await pool.query('UPDATE contracts SET customer_id = $1 WHERE customer_id = $2', [targetId, sourceId]);
  // tasks
  await pool.query('UPDATE tasks SET customer_id = $1 WHERE customer_id = $2', [targetId, sourceId]);
  // contractor_contracts
  await pool.query('UPDATE contractor_contracts SET contractor_id = $1 WHERE contractor_id = $2', [targetId, sourceId]);
  // task_subcontracts
  await pool.query('UPDATE task_subcontracts SET contractor_id = $1 WHERE contractor_id = $2', [targetId, sourceId]);
  // specialists
  await pool.query('UPDATE specialists SET contractor_id = $1 WHERE contractor_id = $2', [targetId, sourceId]);
  // powers_of_attorney
  await pool.query('UPDATE powers_of_attorney SET contractor_id = $1 WHERE contractor_id = $2', [targetId, sourceId]);
  // warehouses
  await pool.query('UPDATE warehouses SET contractor_id = $1 WHERE contractor_id = $2', [targetId, sourceId]);
  // task_items
  await pool.query('UPDATE task_items SET contractor_id = $1 WHERE contractor_id = $2', [targetId, sourceId]);
}

async function run() {
  console.log('[Normalize] Starting organization cleanup & DaData enrichment...');

  // Ensure inn is nullable
  await pool.query('ALTER TABLE contractors ALTER COLUMN inn DROP NOT NULL');

  // Select all contractors with invalid INN
  const { rows } = await pool.query(`
    SELECT id, name_short, name_full, inn, type, status
    FROM contractors
    WHERE inn LIKE 'CUST-%' OR inn LIKE 'SUB-%' OR inn !~ '^[0-9]{10}$' AND inn !~ '^[0-9]{12}$'
    ORDER BY id ASC
  `);

  console.log(`[Normalize] Found ${rows.length} contractors with pseudo or invalid INN`);

  let resolvedCount = 0;
  let mergedCount = 0;
  let clearedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    const rawName = c.name_short || c.name_full || '';

    // Small delay to be polite to DaData rate limits (20 req/sec)
    if (i > 0 && i % 10 === 0) {
      await new Promise(r => setTimeout(r, 200));
      process.stdout.write(`Processed ${i}/${rows.length} (resolved: ${resolvedCount}, merged: ${mergedCount}, cleared: ${clearedCount})\r`);
    }

    const sugg = await fetchDadataParty(rawName);

    if (sugg && sugg.data && sugg.data.inn && /^\d{10}(\d{2})?$/.test(sugg.data.inn)) {
      const realInn = sugg.data.inn;
      const kpp = sugg.data.kpp || null;
      const ogrn = sugg.data.ogrn || null;
      const nameShort = (sugg.data.name && (sugg.data.name.short_with_opf || sugg.data.name.short)) || sugg.value || rawName;
      const nameFull = (sugg.data.name && (sugg.data.name.full_with_opf || sugg.data.name.full)) || sugg.value;
      const addressLegal = (sugg.data.address && sugg.data.address.value) || null;
      const director = (sugg.data.management && sugg.data.management.name) || null;

      // Check if another contractor already exists with this real INN
      const { rows: existing } = await pool.query(
        'SELECT id, name_short FROM contractors WHERE inn = $1 AND id <> $2 LIMIT 1',
        [realInn, c.id]
      );

      if (existing.length > 0) {
        // Merge into existing canonical contractor
        const targetId = existing[0].id;
        await repointForeignKeys(c.id, targetId);
        await pool.query('DELETE FROM contractors WHERE id = $1', [c.id]);
        mergedCount++;
      } else {
        // Update current contractor with verified details
        await pool.query(`
          UPDATE contractors
          SET inn = $1, kpp = $2, ogrn = $3, name_short = $4, name_full = $5,
              address_legal = COALESCE($6, address_legal),
              director = COALESCE($7, director)
          WHERE id = $8
        `, [realInn, kpp, ogrn, nameShort, nameFull, addressLegal, director, c.id]);
        resolvedCount++;
      }
    } else {
      // Not found in DaData: clear pseudo-INN so it is clean NULL
      await pool.query('UPDATE contractors SET inn = NULL WHERE id = $1', [c.id]);
      clearedCount++;
    }
  }

  console.log(`\n[Normalize] Done! Results:`);
  console.log(`  - Verified and updated with real INN: ${resolvedCount}`);
  console.log(`  - Merged duplicates into canonical: ${mergedCount}`);
  console.log(`  - Pseudo-INN cleared to NULL (not found in DaData): ${clearedCount}`);

  // Also deduplicate identical customer names with inn IS NULL
  console.log('[Normalize] Checking for duplicates with NULL INN and identical names...');
  const { rows: dupes } = await pool.query(`
    SELECT LOWER(TRIM(name_short)) as norm_name, array_agg(id ORDER BY id ASC) as ids
    FROM contractors
    WHERE inn IS NULL
    GROUP BY LOWER(TRIM(name_short))
    HAVING count(*) > 1
  `);

  let nameMerged = 0;
  for (const dupe of dupes) {
    const keepId = dupe.ids[0];
    const dropIds = dupe.ids.slice(1);
    for (const dropId of dropIds) {
      await repointForeignKeys(dropId, keepId);
      await pool.query('DELETE FROM contractors WHERE id = $1', [dropId]);
      nameMerged++;
    }
  }
  console.log(`  - Merged ${nameMerged} additional duplicate contractors by identical name`);

  process.exit(0);
}

run().catch(err => {
  console.error('[Normalize] Fatal error:', err);
  process.exit(1);
});
