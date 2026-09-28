import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { importContractsFromExcel } from '../services/contractsImporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..');

const excelPath = path.join(ROOT, 'Reestr_kontraktov_ot_14_10_2017.xlsx');

async function run() {
  console.log('--- Начинаем импорт реестра договоров ---');
  console.log('Путь к файлу:', excelPath);
  try {
    const res = await importContractsFromExcel(excelPath, pool);
    console.log('✅ Импорт успешно завершен!');
    console.log(`Всего обработано: ${res.totalParsed}`);
    console.log(`Добавлено новых договоров: ${res.importedCount}`);
    console.log(`Обновлено договоров: ${res.updatedCount}`);
    console.log(`Многолотовых договоров: ${res.multiLotCount}`);
  } catch (err) {
    console.error('❌ Ошибка импорта:', err);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === __filename) {
  run();
}
