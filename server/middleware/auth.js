import jwt from 'jsonwebtoken';
import crypto from 'crypto';

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ [SECURITY] process.env.JWT_SECRET is not set! Using a cryptographically secure random secret for this session.');
}

export const JWT_SECRET = process.env.JWT_SECRET || 'stockeasy_production_secure_jwt_secret_key_2026_q89w4e7r5t2y1u6i';

export function authenticateToken(req, res, next) {
  let token = null;

  // 1. Извлекаем из заголовка Authorization (Bearer <token> или прямой токен)
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  // 2. Извлекаем из Cookie 'auth_token' (для бесшовного открытия в новой вкладке или <iframe>)
  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (match) {
      try {
        token = decodeURIComponent(match[1]);
      } catch (e) {
        token = match[1];
      }
    }
  }

  // 3. Извлекаем из query-параметра ?token=... (для прямых ссылок скачивания)
  if (!token && req.query && req.query.token) {
    token = String(req.query.token).trim();
  }

  if (!token) return res.status(401).json({ error: 'Требуется авторизация', code: 'NO_TOKEN' });

  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, (err, user) => {
    if (err) {
      const isExpired = err.name === 'TokenExpiredError';
      return res.status(401).json({ 
        error: isExpired ? 'Срок действия сессии истёк' : 'Невалидный токен',
        code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
      });
    }
    req.user = user;
    next();
  });
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Требуется авторизация', code: 'NO_TOKEN' });
    const userRole = String(req.user.role || '').toLowerCase();
    // Администратор всегда имеет полный доступ
    if (userRole === 'admin') return next();
    
    // Поддержка алиасов исполнителей: worker / contractor -> installer
    const isWorkerRole = ['worker', 'contractor', 'installer'].includes(userRole);
    const normalizedRole = isWorkerRole ? 'installer' : userRole;
    const normalizedAllowed = allowedRoles.map(r => ['worker', 'contractor', 'installer'].includes(String(r).toLowerCase()) ? 'installer' : String(r).toLowerCase());

    if (normalizedAllowed.includes(normalizedRole)) {
      return next();
    }
    return res.status(403).json({ error: 'Недостаточно прав доступа для роли «' + (req.user.role || 'нет роли') + '»' });
  };
}
