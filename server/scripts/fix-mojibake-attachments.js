import pg from 'pg';
import { fixUtf8Filename } from '../middleware/upload.js';

const connectionStrings = [
  process.env.DATABASE_URL,
  'postgres://postgres:postgres@localhost:5432/stockeasy_db',
  'postgres://postgres:postgres@localhost:5432/stockeasy_demo',
  'postgres://postgres:M9L4E22DPU4sUrU3tAnN@localhost:5433/stockeasy_db'
].filter(Boolean);

// Unique connection strings
const uniqueUrls = [...new Set(connectionStrings)];

for (const url of uniqueUrls) {
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    const { rows: test } = await pool.query('SELECT 1');
    const dbName = url.split('/').pop().split('?')[0];
    console.log(`\n[FixMojibake] Проверка базы данных: ${dbName}...`);

    // 1. Проверяем contract_attachments
    try {
      const { rows: cAtts } = await pool.query('SELECT id, original_name FROM contract_attachments');
      let fixedCount = 0;
      for (const a of cAtts) {
        const clean = fixUtf8Filename(a.original_name);
        if (clean && clean !== a.original_name) {
          await pool.query('UPDATE contract_attachments SET original_name = $1 WHERE id = $2', [clean, a.id]);
          console.log(`  contract_attachment #${a.id}: "${a.original_name}" -> "${clean}"`);
          fixedCount++;
        }
      }
      console.log(`  contract_attachments: проверено ${cAtts.length}, исправлено ${fixedCount}`);
    } catch (err) {
      if (!err.message.includes('не существует') && !err.message.includes('does not exist')) {
        console.error('  Ошибка contract_attachments:', err.message);
      }
    }

    // 2. Проверяем task_attachments
    try {
      const { rows: tAtts } = await pool.query('SELECT id, original_name FROM task_attachments');
      let fixedCount = 0;
      for (const a of tAtts) {
        const clean = fixUtf8Filename(a.original_name);
        if (clean && clean !== a.original_name) {
          await pool.query('UPDATE task_attachments SET original_name = $1 WHERE id = $2', [clean, a.id]);
          console.log(`  task_attachment #${a.id}: "${a.original_name}" -> "${clean}"`);
          fixedCount++;
        }
      }
      console.log(`  task_attachments: проверено ${tAtts.length}, исправлено ${fixedCount}`);
    } catch (err) {
      if (!err.message.includes('не существует') && !err.message.includes('does not exist')) {
        console.error('  Ошибка task_attachments:', err.message);
      }
    }

  } catch (err) {
    // Cannot connect to this instance/port (expected for unused fallback ports)
  } finally {
    await pool.end().catch(() => {});
  }
}

console.log('\n[FixMojibake] Проверка и исправление завершены!');
