const { app, BrowserWindow } = require('electron');
const path = require('path');

// 1. ПРИНУДИТЕЛЬНО ВЫРУБАЕМ ТО, НА ЧЕМ СПОТЫКАЮТСЯ ПРОВАЙДЕРЫ В РФ:
app.commandLine.appendSwitch('disable-quic'); // Запрещаем UDP/HTTP3 (убирает TIMED_OUT)
app.commandLine.appendSwitch('disable-features', 'EncryptedClientHello'); // Запрещаем ECH (убирает CONNECTION_RESET)
app.commandLine.appendSwitch('ssl-version-max', 'tls1.2'); // Работаем по чистому TLS 1.2

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    title: 'Stockeasy',
    icon: path.join(__dirname, '../images/logo.ico'),
    autoHideMenuBar: true, // Прячем стандартное браузерное меню сверху
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Загружаем сайт с твоего сервера на лету:
  win.loadURL('https://app.stockeasy.ru');

  // Если связь оборвалась — аккуратная перезагрузка по Ctrl+R или F5
  win.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      win.loadURL('https://app.stockeasy.ru');
    }, 3000);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});