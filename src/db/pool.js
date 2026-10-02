import pg from 'pg';
import { env, isServerless } from '../config/env.js';
import { logger } from '../utils/logger.js';

// O PGlite local (npm run db:local, porta 5544) derruba conexões com consultas simultâneas.
const isPglite = /:5544\//.test(env.DATABASE_URL);
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(env.DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  // Supabase e outros bancos gerenciados exigem SSL; o certificado do pooler não vem de uma CA pública.
  ssl: isLocal ? false : { rejectUnauthorized: false },
  // Na Vercel cada instância da função abre o próprio pool: poucas conexões para não esgotar o banco.
  max: isPglite ? 1 : isServerless ? 3 : 10,
  idleTimeoutMillis: isServerless ? 10_000 : 30_000,
});

pool.on('error', (err) => logger.error('Erro inesperado no pool do PostgreSQL', { err: err.message }));

export const query = (text, params) => pool.query(text, params);

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
