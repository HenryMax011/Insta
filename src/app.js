import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { apiLimiter } from './middlewares/rateLimits.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import { publicRouter } from './routes/public.js';
import { webhooksRouter } from './routes/webhooks.js';
import { adminRouter } from './routes/admin.js';
import { cronRouter } from './routes/cron.js';
import path from 'path';

export function createApp() {
  const app = express();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Rota para abrir o Painel Admin
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
  });

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
        },
      },
    }),
  );

  app.use('/api', cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()), methods: ['GET', 'POST'] }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (req, res) => res.json({ ok: true }));

  // Webhooks ficam fora do rate limit geral para não perder notificações do gateway.
  app.use('/api/webhooks', webhooksRouter);
  app.use('/api/cron', cronRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', apiLimiter, publicRouter);

  app.use(
    express.static(fileURLToPath(new URL('../public', import.meta.url)), {
      extensions: ['html'],
      // Sem cache local para HTML/JS/CSS: o navegador revalida (ETag) e sempre pega a versão publicada
      setHeaders: (res, filePath) => {
        if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
