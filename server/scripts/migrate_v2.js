import { pool } from '../config/db.js';

async function migrate() {
  console.log('Starting migration of legacy tasks to V2 architecture (parallel statuses)...');
  try {
    const query = `
      UPDATE tasks
      SET
        status_smr = CASE
          WHEN stage_num >= 3 THEN 'done'
          WHEN stage_num = 2 THEN 'in_progress'
          ELSE 'pending'
        END,
        status_id = CASE
          WHEN stage_num >= 7 THEN 'done'
          WHEN stage_num >= 5 THEN 'review'
          WHEN stage_num >= 3 THEN 'in_progress'
          ELSE 'pending'
        END,
        status_acts = CASE
          WHEN stage_num >= 7 THEN 'signed'
          ELSE 'pending'
        END,
        status_payment_customer = CASE
          WHEN stage_num >= 9 OR macro_status = 'paid' THEN 'paid'
          ELSE 'pending'
        END,
        status_payment_sub = CASE
          WHEN stage_num >= 9 OR macro_status = 'paid' THEN 'paid'
          ELSE 'pending'
        END,
        status_supply = CASE
          WHEN stage_num >= 3 THEN 'delivered'
          ELSE 'none'
        END
    `;

    const result = await pool.query(query);
    console.log(`Migration complete. Successfully updated ${result.rowCount} tasks.`);
  } catch (e) {
    console.error('Migration failed:', e);
  } finally {
    await pool.end();
  }
}

migrate();
