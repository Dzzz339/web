import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDB } from './config/db.js';
import { ROOT, UPLOADS_DIR } from './middleware/upload.js';
import { runBackgroundGeocoding } from './services/geoWorker.js';
import { ensureGeneralChat, setupChatSocket } from './sockets/chat.js';

import compression from 'compression';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import contractorsRoutes from './routes/contractors.js';
import notificationsRoutes from './routes/notifications.js';
import chatsRoutes from './routes/chats.js';
import analyticsRoutes from './routes/analytics.js';
import marchesRoutes from './routes/marches.js';
import tasksRoutes from './routes/tasks.js';
import directoriesRoutes from './routes/directories.js';
import aiRoutes from './routes/ai.js';
import supplyRoutes from './routes/supply.js';
import automationRoutes from './routes/automation.js';
import subcontractsRoutes from './routes/subcontracts.js';
import documentsRoutes from './routes/documents.js';
import contractsRoutes from './routes/contracts.js';
import subcontractDmsRoutes from './routes/subcontractDms.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.set('io', io);

// Порт 3001 по умолчанию для изолированной среды рефакторинга
const PORT = process.env.PORT || 3001;

// Базовые заголовки безопасности HTTP
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors());
// GZIP-сжатие всех ответов сервера (уменьшает передаваемый JSON с 26 МБ до 2.7 МБ)
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    // Никогда не сжимаем SSE-стримы ИИ-чата и логов, чтобы текст шел по буквам в реальном времени
    if (req.headers['accept'] && req.headers['accept'].includes('text/event-stream')) return false;
    if (req.path && (req.path.includes('/stream') || req.path.includes('/parse'))) return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Статика: тяжелые неизменяемые библиотеки кэшируем, скрипты приложения держим свежими
const staticOptions = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('xlsx.full.min.js') || filePath.match(/\.(png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$/i)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
};
app.use(express.static(ROOT, staticOptions));
app.use(express.static(path.join(ROOT, 'public'), staticOptions));

// Файлы загрузок отдаются с CSP-песочницей (изоляция скриптов и предотвращение Stored XSS)
app.use('/uploads', (req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox;");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(UPLOADS_DIR));

app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

// Маршруты API
app.use('/api', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api', contractorsRoutes);
app.use('/api', notificationsRoutes);
app.use('/api', chatsRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', marchesRoutes);
app.use('/api', tasksRoutes);
app.use('/api', directoriesRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api', supplyRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api', subcontractsRoutes);
app.use('/api', documentsRoutes);
app.use('/api', contractsRoutes);
app.use('/api', subcontractDmsRoutes);

// Инициализация WebSockets чата
setupChatSocket(io);

// Запуск сервера
initDB().then(async () => {
  await ensureGeneralChat();
  runBackgroundGeocoding();
  server.listen(PORT, () => console.log(`Stockeasy (refactored): http://localhost:${PORT}`));
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});