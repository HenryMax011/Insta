import { isServerless } from '../config/env.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { gateway } from './paymentGateway.js';
import { enviarOrdemSMM } from './smmProvider.js';
import { sendAlert } from './alerts.js';

const TERMINAL_FAILURES = ['expirado', 'recusado', 'reembolsado'];

/**
 * Processa uma notificação do gateway. O payload do webhook nunca é usado como
 * fonte de verdade: o status é sempre reconsultado na API do gateway.
 * É idempotente — notificações repetidas não geram despacho duplicado.
 */
export async function handlePaymentNotification(transactionId) {
  const { rows } = await query(
    'SELECT id, order_id, amount_cents, status FROM payments WHERE gateway_transaction_id = $1',
    [transactionId],
  );
  const payment = rows[0];
  if (!payment) {
    logger.warn('Notificação para transação desconhecida', { transactionId });
    return;
  }

  const remote = await gateway.getPayment(transactionId);

  await query(
    'INSERT INTO payment_events (payment_id, gateway_transaction_id, status, payload) VALUES ($1, $2, $3, $4)',
    [payment.id, transactionId, remote.status, JSON.stringify(remote.raw ?? {})],
  );

  if (remote.externalReference && remote.externalReference !== payment.order_id) {
    logger.error('external_reference divergente do pedido', { transactionId, orderId: payment.order_id });
    return;
  }

  if (remote.status === 'aprovado') {
    if (remote.paidAmountCents < payment.amount_cents) {
      logger.error('Valor pago menor que o valor do pedido', {
        transactionId,
        esperado: payment.amount_cents,
        pago: remote.paidAmountCents,
      });
      return;
    }

    const approved = await query(
      `UPDATE payments SET status = 'aprovado', paid_amount_cents = $2, paid_at = now()
        WHERE id = $1 AND status <> 'aprovado' RETURNING id`,
      [payment.id, remote.paidAmountCents],
    );
    if (approved.rowCount === 0) return;

    // 'cancelado' entra aqui porque o job de expiração pode ter rodado segundos antes do PIX ser pago.
    await query(
      `UPDATE orders SET status = 'pago' WHERE id = $1 AND status IN ('aguardando_pagamento', 'cancelado')`,
      [payment.order_id],
    );
    logger.info('Pagamento aprovado', { orderId: payment.order_id, transactionId });

    await dispatchAfterPayment(payment.order_id);
    return;
  }

  if (TERMINAL_FAILURES.includes(remote.status)) {
    await query(`UPDATE payments SET status = $2 WHERE id = $1 AND status = 'pendente'`, [payment.id, remote.status]);
    await query(`UPDATE orders SET status = 'cancelado' WHERE id = $1 AND status = 'aguardando_pagamento'`, [
      payment.order_id,
    ]);
  }
}

/**
 * Envia o pedido ao fornecedor SMM. Só atua sobre pedidos 'pago' ou 'erro_automacao'
 * (reenvio manual); o UPDATE ... RETURNING funciona como trava contra envio duplicado.
 */
export async function despacharPedido(orderId) {
  const { rows } = await query(
    `UPDATE orders o
        SET status = 'processando', dispatch_attempts = o.dispatch_attempts + 1
       FROM services s
      WHERE o.id = $1 AND o.service_id = s.id AND o.status IN ('pago', 'erro_automacao')
  RETURNING o.id, o.link, o.quantity, s.provider_service_id, s.drip_runs, s.drip_interval_minutes`,
    [orderId],
  );
  const order = rows[0];
  if (!order) return { dispatched: false, reason: 'Pedido não está apto para envio' };

  try {
    const providerOrderId = await enviarOrdemSMM(order.link, order.quantity, order.provider_service_id, {
      runs: order.drip_runs,
      interval: order.drip_interval_minutes,
    });
    await query(
      `UPDATE orders
          SET status = 'enviado', provider_order_id = $2, provider_error = NULL, provider_error_code = NULL,
              dispatched_at = now()
        WHERE id = $1`,
      [orderId, providerOrderId],
    );
    return { dispatched: true, providerOrderId };
  } catch (err) {
    logger.error('Erro na automação SMM', { orderId, code: err.code, err: err.message, provider: err.providerMessage });
    await query(
      `UPDATE orders SET status = 'erro_automacao', provider_error = $2, provider_error_code = $3 WHERE id = $1`,
      [orderId, err.message.slice(0, 500), String(err.code ?? 'SMM_ERROR').slice(0, 40)],
    );
    const noBalance = err.code === 'SMM_NO_BALANCE';
    sendAlert(
      noBalance
        ? 'pedido pago parado por falta de saldo no SMM Hub. Recarregue o saldo: ele será reenviado automaticamente.'
        : `pedido ${orderId.slice(0, 8)} falhou ao enviar ao SMM Hub (${err.message}). Confira no painel admin.`,
      noBalance ? { key: 'dispatch-no-balance', cooldownMs: 30 * 60_000 } : {},
    );
    return { dispatched: false, reason: err.message, code: err.code };
  }
}

// Em serverless a função pode ser congelada logo após responder, então o despacho precisa terminar antes.
async function dispatchAfterPayment(orderId) {
  const run = () =>
    despacharPedido(orderId).catch((err) =>
      logger.error('Falha inesperada no despacho após pagamento', { orderId, err: err.message }),
    );
  if (isServerless) await run();
  else setImmediate(run);
}
