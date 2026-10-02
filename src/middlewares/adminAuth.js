import { env } from '../config/env.js';
import { safeEqual } from '../utils/crypto.js';

export function adminAuth(req, res, next) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token || !safeEqual(token, env.ADMIN_TOKEN)) {
    return res.status(401).json({ error: 'Não autorizado', code: 'UNAUTHORIZED' });
  }
  next();
}
