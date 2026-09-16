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

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.set('io', io);

// Порт 3001 по умолчанию для изолированной среды рефакторинга
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Статика
app.use(express.static(ROOT));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

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