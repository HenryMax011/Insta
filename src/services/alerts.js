import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

// Usado só se o banco falhar; o cooldown normal fica em alert_cooldowns.
const lastSent = new Map();

/** Reserva o envio do alerta `key`. Retorna false se ele já foi enviado dentro do cooldown. */
async function claimCooldown(key, cooldownMs) {
  try {
    const { rowCount } = await query(
      `INSERT INTO alert_cooldowns (key, last_sent_at) VALUES ($1, now())
       ON CONFLICT (key) DO UPDATE SET last_sent_at = now()
        WHERE alert_cooldowns.last_sent_at < now() - make_interval(secs => $2)`,
      [key, cooldownMs / 1000],
    );
    return rowCount > 0;
  } catch (err) {
    logger.warn('Cooldown de alerta sem banco, usando memória', { key, err: err.message });
    const last = lastSent.get(key);
    if (last && Date.now() - last < cooldownMs) return false;
    lastSent.set(key, Date.now());
    return true;
  }
}

export function alertChannels() {
  return {
    telegram: Boolean(env.ALERT_TELEGRAM_BOT_TOKEN && env.ALERT_TELEGRAM_CHAT_ID),
    whatsapp: Boolean(env.ALERT_WHATSAPP_PHONE && env.ALERT_WHATSAPP_APIKEY),
  };
}

async function sendTelegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${env.ALERT_TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.ALERT_TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Telegram respondeu HTTP ${res.status}`);
}

async function sendWhatsapp(text) {
  const url = new URL('https://api.callmebot.com/whatsapp.php');
  url.search = new URLSearchParams({ phone: env.ALERT_WHATSAPP_PHONE, text, apikey: env.ALERT_WHATSAPP_APIKEY });
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`CallMeBot respondeu HTTP ${res.status}`);
}

/**
 * Envia um aviso ao dono da loja pelos canais configurados. Nunca lança.
 * `key` + `cooldownMs` evitam repetir o mesmo aviso (ex.: saldo baixo a cada minuto).
 */
export async function sendAlert(text, { key, cooldownMs = 0 } = {}) {
  if (key && cooldownMs && !(await claimCooldown(key, cooldownMs))) {
    return { sent: false, reason: 'cooldown' };
  }

  const message = `Impulso Social: ${text}`;
  const channels = alertChannels();
  const tasks = [];
  if (channels.telegram) tasks.push(['telegram', sendTelegram(message)]);
  if (channels.whatsapp) tasks.push(['whatsapp', sendWhatsapp(message)]);

  if (!tasks.length) {
    logger.warn('Alerta sem canal configurado', { text });
    return { sent: false, reason: 'Nenhum canal de alerta configurado' };
  }

  const results = await Promise.allSettled(tasks.map(([, task]) => task));
  const delivered = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') delivered.push(tasks[i][0]);
    else logger.error('Falha ao enviar alerta', { channel: tasks[i][0], err: result.reason?.message });
  });
  return { sent: delivered.length > 0, channels: delivered };
}

export async function resetAlertCooldown(key) {
  lastSent.delete(key);
  await query('DELETE FROM alert_cooldowns WHERE key = $1', [key]).catch((err) =>
    logger.warn('Falha ao limpar cooldown de alerta', { key, err: err.message }),
  );
}
