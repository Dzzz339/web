import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../..');
const mobileDir = path.resolve(__dirname, '..');
const wwwDir = path.join(mobileDir, 'www');

console.log('[sync-assets] Подготовка ассетов для мобильного приложения...');

// 1. Создание каталога www
if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}
fs.mkdirSync(wwwDir, { recursive: true });

// Вспомогательная функция рекурсивного копирования
function copyFolderSync(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const stat = fs.lstatSync(path.join(from, element));
    if (stat.isDirectory()) {
      copyFolderSync(path.join(from, element), path.join(to, element));
    } else {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    }
  });
}

// 2. Копирование каталога public (css, js) в www
const publicDir = path.join(rootDir, 'public');
if (fs.existsSync(publicDir)) {
  copyFolderSync(publicDir, wwwDir);
  console.log('[sync-assets] Скопирован каталог public -> www');
}

// 3. Копирование images в www/images
const imagesDir = path.join(rootDir, 'images');
if (fs.existsSync(imagesDir)) {
  copyFolderSync(imagesDir, path.join(wwwDir, 'images'));
  console.log('[sync-assets] Скопированы изображения images -> www/images');
}

// 4. Копирование xlsx.full.min.js
const xlsxPath = path.join(rootDir, 'xlsx.full.min.js');
if (fs.existsSync(xlsxPath)) {
  fs.copyFileSync(xlsxPath, path.join(wwwDir, 'xlsx.full.min.js'));
  console.log('[sync-assets] Скопирован xlsx.full.min.js');
}

// 5. Копирование mobile-bridge.js в www/js/mobile-bridge.js
const bridgeSrc = path.join(mobileDir, 'src', 'mobile-bridge.js');
const jsDir = path.join(wwwDir, 'js');
fs.mkdirSync(jsDir, { recursive: true });
if (fs.existsSync(bridgeSrc)) {
  fs.copyFileSync(bridgeSrc, path.join(jsDir, 'mobile-bridge.js'));
  console.log('[sync-assets] Скопирован js/mobile-bridge.js');
}

// 6. Подготовка и адаптация index.html
const rootIndexPath = path.join(rootDir, 'index.html');
if (fs.existsSync(rootIndexPath)) {
  let html = fs.readFileSync(rootIndexPath, 'utf-8');

  // Внедряем мобильный мост первым в head
  const bridgeScript = '\n  <script src="js/mobile-bridge.js"></script>';
  html = html.replace('<head>', '<head>' + bridgeScript);

  // Делаем пути относительными для локального Android WebView
  html = html.replace(/href="\/css\//g, 'href="css/');
  html = html.replace(/src="\/js\//g, 'src="js/');
  html = html.replace(/src="\/xlsx\.full\.min\.js"/g, 'src="xlsx.full.min.js"');
  
  // Добавляем fallback для socket.io если локально его нет
  html = html.replace(
    '<script src="/socket.io/socket.io.js"></script>',
    '<script src="https://app.stockeasy.ru/socket.io/socket.io.js" onerror="console.warn(\'Socket.io unavailable in offline\')"></script>'
  );

  fs.writeFileSync(path.join(wwwDir, 'index.html'), html, 'utf-8');
  console.log('[sync-assets] Подготовлен www/index.html с внедренным mobile-bridge');
}

console.log('[sync-assets] Все ассеты успешно синхронизированы в mobile/www!');
