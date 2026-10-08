import { pool } from '../config/db.js';
import { resolveCityCoordinates } from '../services/cityCoordinates.js';

export async function populateAgreementCoordinates() {
  console.log('[Geo] Запуск наполнения координат для contract_agreements...');

  const { rows } = await pool.query(`
    SELECT id, region, city 
    FROM contract_agreements 
    WHERE geo_lat IS NULL OR geo_lon IS NULL
  `);

  console.log(`[Geo] Найдено ${rows.length} соглашений без координат`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const ag of rows) {
    const loc = ag.city || ag.region || '';
    const res = resolveCityCoordinates(loc);

    if (res) {
      await pool.query(`
        UPDATE contract_agreements 
        SET geo_lat = $1, geo_lon = $2 
        WHERE id = $3
      `, [res.lat, res.lon, ag.id]);
      updatedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`[Geo] Успешно проставлены координаты для: ${updatedCount} ДС`);
  console.log(`[Geo] Пропущено (не распознаны локации): ${skippedCount}`);

  // Проверяем статистику
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(geo_lat) as with_coords,
      ROUND(COUNT(geo_lat)::numeric / COUNT(*) * 100, 1) as pct
    FROM contract_agreements
  `);
  console.log(`[Geo] Итого в базе: ${stats.rows[0].with_coords} из ${stats.rows[0].total} (${stats.rows[0].pct}%) имеют координаты`);

  return { updatedCount, skippedCount };
}

// Запуск только при прямом вызове из командной строки
if (process.argv[1] && process.argv[1].includes('populate_agreement_coords.js')) {
  populateAgreementCoordinates().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('[Geo] Ошибка:', err);
    process.exit(1);
  });
}
