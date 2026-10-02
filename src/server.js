import { env } from './config/env.js';
import { createApp } from './app.js';
import { pool } from './db/pool.js';
import { startJobs } from './jobs/scheduler.js';
import { logger } from './utils/logger.js';

await pool.query('SELECT 1');

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info('Servidor iniciado', {
    url: `http://localhost:${env.PORT}`,
    gateway: env.PAYMENT_PROVIDER,
    smm: env.SMM_MOCK ? 'mock' : 'real',
  });
});

const stopJobs = startJobs();

async function shutdown(signal) {
  logger.info('Encerrando servidor', { signal });
  stopJobs();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => logger.error('unhandledRejection', { err: err?.message ?? String(err) }));
