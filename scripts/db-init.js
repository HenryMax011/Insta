import { readFile } from 'node:fs/promises';
import { pool } from '../src/db/pool.js';

const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');

try {
  await pool.query(sql);
  console.log('Schema aplicado com sucesso.');
} catch (err) {
  console.error('Falha ao aplicar schema:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
