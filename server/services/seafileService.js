import { pool } from '../config/db.js';

const SEAFILE_URL = (process.env.SEAFILE_URL || 'https://cloud.stockeasy.ru').replace(/\/+$/, '');
const SEAFILE_API_TOKEN = process.env.SEAFILE_API_TOKEN || '70485687f98b2d02a37343111d82d4b53d5cdf85';
const SEAFILE_REPO_ID = process.env.SEAFILE_REPO_ID || '3f5c3fab-79a1-476e-8dbc-ba3202d005cc';

export function isSeafileConfigured() {
  return Boolean(SEAFILE_URL && SEAFILE_API_TOKEN && SEAFILE_REPO_ID);
}

function sanitizePathPart(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\\/:*?"<>|#%&{}\\<>*?/$!'":@+`|=]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 50);
}

/**
 * Создает папку объекта в Seafile со стандартной структурой и генерирует публичную ссылку (share-link)
 * @param {Object} task
 * @returns {Promise<{success: boolean, link: string, folderPath: string, uploadLink?: string}>}
 */
export async function createTaskSeafileFolder(task) {
  if (!isSeafileConfigured()) {
    throw new Error('Seafile не настроен на сервере (отсутствует SEAFILE_API_TOKEN или SEAFILE_REPO_ID)');
  }

  const taskId = sanitizePathPart(task.id || 'unknown');
  const taskCity = sanitizePathPart(task.region || task.city || '');
  const taskAddr = sanitizePathPart(task.address || '');
  
  const folderName = `Заявка_${taskId}${taskCity ? '_' + taskCity : ''}${taskAddr ? '_' + taskAddr : ''}`.slice(0, 90);
  const rootDir = '/Объекты';
  const targetFolder = `${rootDir}/${folderName}`;

  const headers = {
    'Authorization': `Token ${SEAFILE_API_TOKEN}`
  };

  // 1. Убеждаемся, что корневая папка /Объекты существует
  try {
    await fetch(`${SEAFILE_URL}/api2/repos/${SEAFILE_REPO_ID}/dir/?p=${encodeURIComponent(rootDir)}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ operation: 'mkdir' })
    });
  } catch (e) {
    // игнорируем ошибку, если уже существует
  }

  // 2. Создаем папку заявки
  const resFolder = await fetch(`${SEAFILE_URL}/api2/repos/${SEAFILE_REPO_ID}/dir/?p=${encodeURIComponent(targetFolder)}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ operation: 'mkdir' })
  });

  if (!resFolder.ok && resFolder.status !== 400) {
    const errText = await resFolder.text();
    console.warn('[Seafile] Mkdir warning:', resFolder.status, errText);
  }

  // 3. Создаем стандартные подпапки для порядка в объекте
  const subfolders = [
    '01_ТЗ_и_Сметы',
    '02_Схемы_и_Проекты',
    '03_Фотоотчет_монтажника',
    '04_Исполнительная_документация_(ИД)'
  ];

  for (const sub of subfolders) {
    try {
      await fetch(`${SEAFILE_URL}/api2/repos/${SEAFILE_REPO_ID}/dir/?p=${encodeURIComponent(`${targetFolder}/${sub}`)}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ operation: 'mkdir' })
      });
    } catch (e) {}
  }

  // 4. Генерируем публичную ссылку (Share Link)
  let shareLink = '';
  try {
    const resShare = await fetch(`${SEAFILE_URL}/api/v2.1/share-links/`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_id: SEAFILE_REPO_ID,
        path: targetFolder + '/',
        permissions: { can_edit: true, can_download: true }
      })
    });
    if (resShare.ok) {
      const dataShare = await resShare.json();
      shareLink = dataShare.link || '';
    } else {
      console.warn('[Seafile] Share link error status:', resShare.status, await resShare.text());
    }
  } catch (err) {
    console.error('[Seafile] Failed to generate share link:', err.message);
  }

  // 5. Опционально генерируем прямую Upload Link для монтажников (загрузка фото без пароля)
  let uploadLink = '';
  try {
    const resUpload = await fetch(`${SEAFILE_URL}/api/v2.1/upload-links/`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_id: SEAFILE_REPO_ID,
        path: targetFolder + '/'
      })
    });
    if (resUpload.ok) {
      const dataUpload = await resUpload.json();
      uploadLink = dataUpload.link || '';
    }
  } catch (err) {
    // upload link опциональна
  }

  const finalLink = shareLink || uploadLink || `${SEAFILE_URL}/#common/lib/${SEAFILE_REPO_ID}${targetFolder}`;

  // 6. Сохраняем ссылку в базу данных для заявки
  await pool.query('UPDATE tasks SET tech_link = $1, updated_at = NOW() WHERE id = $2', [finalLink, task.id]);

  return {
    success: true,
    folderName,
    folderPath: targetFolder,
    link: finalLink,
    shareLink,
    uploadLink
  };
}
