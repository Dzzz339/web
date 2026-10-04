import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '../..');
export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/**
 * Исправление кодировки имен файлов (Latin-1 mojibake -> правильный UTF-8)
 * Возникает из-за особенностей декодирования multipart заголовков busboy/multer
 */
export function fixUtf8Filename(name) {
  if (!name || typeof name !== 'string') return '';
  try {
    if (/[\u00C0-\u00FF]/.test(name)) {
      const decoded = Buffer.from(name, 'latin1').toString('utf8');
      if (!decoded.includes('\uFFFD') && /[\u0400-\u04FF]/.test(decoded)) {
        return decoded;
      }
    }
  } catch (e) {}
  return name;
}

const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    file.originalname = fixUtf8Filename(file.originalname);
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    file.originalname = fixUtf8Filename(file.originalname);
    const ext = path.extname(file.originalname) || '';
    cb(null, crypto.randomUUID() + ext);
  }
});

export const uploadAttachment = multer({
  storage: attachmentStorage,
  fileFilter: (req, file, cb) => {
    file.originalname = fixUtf8Filename(file.originalname);
    cb(null, true);
  },
  limits: { fileSize: 15 * 1024 * 1024 }
});

export const upload = uploadAttachment;
