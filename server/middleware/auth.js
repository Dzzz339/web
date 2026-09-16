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
