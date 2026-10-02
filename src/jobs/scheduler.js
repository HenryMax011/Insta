import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { despacharPedido, handlePaymentNotification } from '../services/fulfillment.js';
import { gateway } from '../services/paymentGateway.js';
import { consultarStatusSMM } from '../services/smmProvider.js';
import { checkBalance } from '../services/balanceMonitor.js';
import { sendAlert } from '../services/alerts.js';

const PROVIDER_STATUS_MAP = {
  completed: 'concluido',
  partial: 'parcial',
  canceled: 'erro_automacao',
  cancelled: 'erro_automacao',
};

// Rede de segurança caso o webhook não chegue ou falhe: reconsulta os PIX pendentes na API do gateway.
// O mock fica de fora porque o getPayment dele aprova qualquer transação.
async function reconcilePendingPayments() {
  if (gateway.name !== 'mercadopago') return;
  const { rows } = await query(`
    SELECT gateway_transaction_id FROM payments
     WHERE status = 'pendente' AND gateway = 'mercadopago' AND created_at < now() - interval '20 seconds'
     ORDER BY created_at LIMIT 20`);
  for (const { gateway_transaction_id: transactionId } of rows) {
    try {
      await handlePaymentNotification(transactionId);
    } catch (err) {
      logger.warn('Falha ao reconsultar pagamento pendente', { transactionId, err: err.message });
    }
  }
}

async function expirePendingPayments() {
  const { rowCount } = await query(`
    WITH expired AS (
      UPDATE payments SET status = 'expirado'
       WHERE status = 'pendente' AND expires_at < now() - interval '2 minutes'
   RETURNING order_id
    )
    UPDATE orders SET status = 'cancelado'
     WHERE id IN (SELECT order_id FROM expired) AND status = 'aguardando_pagamento'`);
  if (rowCount) logger.info('Pedidos cancelados por PIX expirado', { total: rowCount });
}

// Pedidos pagos cujo despacho em background não chegou a rodar (ex.: restart do servidor).
async function redispatchOrphans() {
  const { rows } = await query(`
    SELECT id FROM orders
     WHERE status = 'pago' AND updated_at < now() - interval '1 minute'
     ORDER BY updated_at LIMIT 20`);
  for (const { id } of rows) await despacharPedido(id);
}

// Não reenviamos automaticamente: o fornecedor pode ter aceitado o pedido antes da queda.
async function flagStuckDispatches() {
  await query(`
    UPDATE orders
       SET status = 'erro_automacao',
           provider_error = 'Envio interrompido em estado incerto. Confira no painel do fornecedor antes de reenviar.'
     WHERE status = 'processando' AND updated_at < now() - interval '10 minutes'`);
}

async function syncProviderStatuses() {
  const { rows } = await query(`
    SELECT id, provider_order_id FROM orders
     WHERE status = 'enviado' AND provider_order_id IS NOT NULL
     ORDER BY updated_at LIMIT 100`);
  if (!rows.length) return;

  const statuses = await consultarStatusSMM(rows.map((r) => r.provider_order_id));

  for (const order of rows) {
    const info = statuses[order.provider_order_id];
    if (!info || info.error) continue;

    const providerStatus = String(info.status ?? '').slice(0, 40);
    const newStatus = PROVIDER_STATUS_MAP[providerStatus.toLowerCase()] ?? null;
    const remains = Number.isFinite(Number(info.remains)) ? Number(info.remains) : null;

    await query(
      `UPDATE orders
          SET provider_status = $2,
              provider_remains = $3,
              status = COALESCE($4::varchar, status),
              completed_at = CASE WHEN $4::varchar IN ('concluido', 'parcial') THEN now() ELSE completed_at END,
              provider_error = CASE WHEN $4::varchar = 'erro_automacao' THEN 'Pedido cancelado pelo fornecedor' ELSE provider_error END
        WHERE id = $1 AND status = 'enviado'`,
      [order.id, providerStatus, remains, newStatus],
    );
  }
}

const NO_BALANCE_RETRY_EVERY_MS = 5 * 60_000;
let lastNoBalanceRetry = 0;

// Seguro reenviar: com SMM_NO_BALANCE o fornecedor recusou o pedido, então não há risco de duplicar.
async function retryNoBalanceOrders() {
  if (Date.now() - lastNoBalanceRetry < NO_BALANCE_RETRY_EVERY_MS) return;
  const { rows } = await query(`
    SELECT id FROM orders
     WHERE status = 'erro_automacao' AND provider_error_code = 'SMM_NO_BALANCE'
     ORDER BY created_at LIMIT 10`);
  if (!rows.length) return;
  lastNoBalanceRetry = Date.now();

  const balance = await checkBalance();
  if (balance.error || !(balance.balanceBrl > 0)) return;

  let resent = 0;
  for (const { id } of rows) {
    const result = await despacharPedido(id);
    if (!result.dispatched) break;
    resent += 1;
  }
  if (resent) {
    logger.info('Pedidos reenviados após recarga de saldo', { total: resent });
    await sendAlert(`${resent} pedido(s) parados por falta de saldo foram reenviados automaticamente.`);
  }
}

async function monitorBalance() {
  await checkBalance({ maxAgeMs: env.BALANCE_CHECK_MINUTES * 60_000 - 5_000 });
}

let running = false;

/** Uma rodada das tarefas periódicas. Chamada pelo timer local ou por GET /api/cron/tick (Vercel). */
export async function runJobs() {
  if (running) return { ok: true, skipped: true };
  running = true;
  try {
    await reconcilePendingPayments();
    await expirePendingPayments();
    await redispatchOrphans();
    await flagStuckDispatches();
    await syncProviderStatuses();
    await retryNoBalanceOrders();
    await monitorBalance();
    return { ok: true };
  } catch (err) {
    logger.error('Falha no job periódico', { err: err.message });
    return { ok: false, error: err.message };
  } finally {
    running = false;
  }
}

export function startJobs() {
  const timer = setInterval(runJobs, env.JOB_INTERVAL_SECONDS * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
