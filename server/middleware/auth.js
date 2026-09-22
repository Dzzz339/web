import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'hahahksdjscndufn4738';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Невалидный токен' });
    req.user = user;
    next();
  });
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Требуется авторизация' });
    const userRole = String(req.user.role || '').toLowerCase();
    // Администратор всегда имеет полный доступ
    if (userRole === 'admin') return next();
    
    // Поддержка алиаса worker -> installer
    const normalizedRole = userRole === 'worker' ? 'installer' : userRole;
    const normalizedAllowed = allowedRoles.map(r => String(r).toLowerCase() === 'worker' ? 'installer' : String(r).toLowerCase());

    if (normalizedAllowed.includes(normalizedRole)) {
      return next();
    }
    return res.status(403).json({ error: 'Недостаточно прав доступа для роли «' + (req.user.role || 'нет роли') + '»' });
  };
}
