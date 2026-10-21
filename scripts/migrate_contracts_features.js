import { pool } from '../server/config/db.js';

async function migrate() {
  console.log('Migrating contracts table with new fields...');
  await pool.query(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS closing_priority TEXT DEFAULT 'P3'`);
  await pool.query(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS closing_docs_plan_date DATE DEFAULT NULL`);
  await pool.query(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_law_type TEXT DEFAULT '223-ФЗ'`);
  await pool.query(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payments JSONB DEFAULT '[]'`);
  await pool.query(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS penalties JSONB DEFAULT '{"amount": 0, "status": "none", "comment": ""}'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contracts_closing_priority ON contracts(closing_priority)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contracts_contract_law_type ON contracts(contract_law_type)`);

  // Fill default values for existing rows if null
  await pool.query(`UPDATE contracts SET closing_priority = 'P3' WHERE closing_priority IS NULL`);
  await pool.query(`UPDATE contracts SET contract_law_type = '223-ФЗ' WHERE contract_law_type IS NULL`);
  await pool.query(`UPDATE contracts SET payments = '[]'::jsonb WHERE payments IS NULL`);
  await pool.query(`UPDATE contracts SET penalties = '{"amount": 0, "status": "none", "comment": ""}'::jsonb WHERE penalties IS NULL`);

  console.log('Migration completed successfully!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
