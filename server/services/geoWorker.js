import { pool } from '../config/db.js';
import { cleanAddressDaData, stripAddressNoise } from './dadata.js';

const sleep = ms => new Promise(res => setTimeout(res, ms));

let isGeocodingRunning = false;

export async function runBackgroundGeocoding() {
  if (isGeocodingRunning) return;
  isGeocodingRunning = true;
  console.log('[GeoWorker] Фоновый робот геокодирования запущен...');

  try {
    while (true) {
      // Находим 5 заявок без координат (у которых geo_lat пустой)
      const { rows } = await pool.query(
        "SELECT id, address, region FROM tasks WHERE (geo_lat IS NULL OR geo_lat = '') AND address IS NOT NULL AND length(trim(address)) > 3 AND archived = false LIMIT 5"
      );

      if (!rows.length) {
        console.log('[GeoWorker] Все адреса успешно обработаны!');
        break;
      }

      for (const task of rows) {
        let geoData = await cleanAddressDaData(task.address, task.region);
        await sleep(250);

        if (!geoData) {
          const cleanerAddr = stripAddressNoise(task.address);
          if (cleanerAddr !== task.address) {
            geoData = await cleanAddressDaData(cleanerAddr, task.region);
            await sleep(250);
          }
        }

        if (geoData) {
          await pool.query(
            "UPDATE tasks SET geo_lat = $1, geo_lon = $2, clean_address = $3 WHERE id = $4",
            [geoData.lat, geoData.lon, geoData.address, task.id]
          );
          console.log(`[GeoWorker] Найдено: ${task.id} -> ${geoData.address}`);
        } else {
          // Чтобы не мучать DaData по 100 раз ненайденным адресом, ставим пометку NONE
          await pool.query("UPDATE tasks SET geo_lat = 'NONE' WHERE id = $1", [task.id]);
        }
      }
    }
  } catch (e) {
    console.error("[GeoWorker Error]:", e.message);
  } finally {
    isGeocodingRunning = false;
  }
}
