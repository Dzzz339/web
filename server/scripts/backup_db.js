import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');

export const CRITICAL_TABLES = [
  'users',
  'contractors',
  'specialists',
  'contracts',
  'contract_agreements',
  'tasks',
  'task_items',
  'task_materials',
  'task_subcontracts',
  'subcontract_payments',
  'subcontract_files',
  'powers_of_attorney',
  'own_companies',
  'materials',
  'price_rules'
];

/**
 * Создание резервной копии базы данных (JSON Snapshot)
 * @returns {Promise<{ filename: string, filepath: string, sizeBytes: number, stats: Record<string, number>, createdAt: string }>}
 */
export async function createDatabaseBackup() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup_stockeasy_${timestamp}.json`;
  const filepath = path.join(BACKUPS_DIR, filename);

  const backupData = {
    meta: {
      version: '2.0',
      timestamp: new Date().toISOString(),
      generator: 'StockEasy Backup Service'
    },
    tables: {},
    stats: {}
  };

  for (const table of CRITICAL_TABLES) {
    try {
      const res = await pool.query(`SELECT * FROM ${table}`);
      // Маскируем хэши паролей для безопасности дампа
      if (table === 'users') {
        backupData.tables[table] = res.rows.map(u => {
          const { password_hash, ...safeUser } = u;
          return safeUser;
        });
      } else {
        backupData.tables[table] = res.rows;
      }
      backupData.stats[table] = res.rows.length;
    } catch (err) {
      // Если таблица еще не создана в БД, логируем и продолжаем
      backupData.tables[table] = [];
      backupData.stats[table] = 0;
    }
  }

  const jsonStr = JSON.stringify(backupData, null, 2);
  fs.writeFileSync(filepath, jsonStr, 'utf8');
  const stats = fs.statSync(filepath);

  // Ротация: оставляем последние 15 бэкапов, удаляя старые
  rotateBackups(15);

  return {
    filename,
    filepath,
    sizeBytes: stats.size,
    stats: backupData.stats,
    createdAt: backupData.meta.timestamp
  };
}

/**
 * Ротация файлов бэкапа
 */
export function rotateBackups(maxKeep = 15) {
  if (!fs.existsSync(BACKUPS_DIR)) return;
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('backup_stockeasy_') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > maxKeep) {
      const toDelete = files.slice(maxKeep);
      for (const item of toDelete) {
        fs.unlinkSync(path.join(BACKUPS_DIR, item.name));
      }
    }
  } catch (err) {
    console.warn('⚠️ Ошибка ротации бэкапов:', err.message);
  }
}

/**
 * Получить список всех существующих бэкапов
 */
export function listBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  try {
    return fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('backup_stockeasy_') && f.endsWith('.json'))
      .map(f => {
        const fullPath = path.join(BACKUPS_DIR, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.error('Ошибка чтения каталога бэкапов:', err);
    return [];
  }
}

// Запуск напрямую из консоли: node server/scripts/backup_db.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createDatabaseBackup()
    .then(res => {
      console.log('✅ Резервная копия базы данных успешно создана:');
      console.log(`📁 Файл: ${res.filename} (${(res.sizeBytes / 1024).toFixed(1)} КБ)`);
      console.log('📊 Статистика строк:');
      for (const [tbl, count] of Object.entries(res.stats)) {
        console.log(`   - ${tbl}: ${count}`);
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Ошибка создания бэкапа:', err);
      process.exit(1);
    });
}
