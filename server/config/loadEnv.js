import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, '../../.env');

export function loadEnvFile() {
  if (!fs.existsSync(rootEnvPath)) return;
  try {
    const content = fs.readFileSync(rootEnvPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && (!process.env[key] || process.env[key] === '')) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.warn('[Env] Предупреждение при чтении .env:', err.message);
  }
}

loadEnvFile();
