import { Router } from 'express';
import { env } from '../config/env.js';
import { runJobs } from '../jobs/scheduler.js';
import { safeEqual } from '../utils/crypto.js';

export const cronRouter = Router();

// A Vercel Cron envia "Authorization: Bearer <CRON_SECRET>"; serviços externos (cron-job.org) usam o mesmo header.
cronRouter.get('/tick', async (req, res) => {
  if (!env.CRON_SECRET) return res.status(404).json({ error: 'Não encontrado', code: 'NOT_FOUND' });
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token || !safeEqual(token, env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Não autorizado', code: 'UNAUTHORIZED' });
  }
  const result = await runJobs();
  res.status(result.ok ? 200 : 500).json(result);
});
