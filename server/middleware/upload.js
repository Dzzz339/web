import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '../..');
export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, crypto.randomUUID() + ext);
  }
});

export const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: 15 * 1024 * 1024 }
});
