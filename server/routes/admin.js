import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { createDatabaseBackup, listBackups } from '../scripts/backup_db.js';

const router = express.Router();

// Все эндпоинты панели администратора доступны только для ролей admin и director
router.use(authenticateToken);
router.use(requireRole('admin', 'director'));

/**
 * GET /api/admin/health
 * Диагностика состояния сервера, БД и системных ресурсов
 */
router.get('/health', async (req, res) => {
  try {
    const startTime = Date.now();
    const dbRes = await pool.query('SELECT current_database() AS db, version(), pg_database_size(current_database()) AS size_bytes');
    const dbLatencyMs = Date.now() - startTime;

    const rowCountsRes = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM tasks) AS tasks_count,
        (SELECT COUNT(*) FROM contractors) AS contractors_count,
        (SELECT COUNT(*) FROM specialists) AS specialists_count,
        (SELECT COUNT(*) FROM contracts) AS contracts_count,
        (SELECT COUNT(*) FROM users) AS users_count
    `);

    const mem = process.memoryUsage();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        name: dbRes.rows[0].db,
        latencyMs: dbLatencyMs,
        sizeBytes: Number(dbRes.rows[0].size_bytes),
        sizeMb: (Number(dbRes.rows[0].size_bytes) / (1024 * 1024)).toFixed(2)
      },
      counts: {
        tasks: Number(rowCountsRes.rows[0].tasks_count),
        contractors: Number(rowCountsRes.rows[0].contractors_count),
        specialists: Number(rowCountsRes.rows[0].specialists_count),
        contracts: Number(rowCountsRes.rows[0].contracts_count),
        users: Number(rowCountsRes.rows[0].users_count)
      },
      memory: {
        rssMb: (mem.rss / 1024 / 1024).toFixed(1),
        heapUsedMb: (mem.heapUsed / 1024 / 1024).toFixed(1),
        heapTotalMb: (mem.heapTotal / 1024 / 1024).toFixed(1)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка диагностики здоровья системы: ' + err.message });
  }
});

/**
 * GET /api/admin/backups
 * Получить список доступных резервных копий
 */
router.get('/backups', (req, res) => {
  try {
    const list = listBackups();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/backup
 * Создать резервную копию базы данных по требованию
 */
router.post('/backup', async (req, res) => {
  try {
    const backupInfo = await createDatabaseBackup();
    res.json({
      success: true,
      message: 'Резервная копия успешно создана',
      backup: backupInfo
    });
  } catch (err) {
    console.error('Admin backup error:', err);
    res.status(500).json({ error: 'Ошибка создания резервной копии: ' + err.message });
  }
});

export default router;
