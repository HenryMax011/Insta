import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { safeEqual } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

/**
 * Contrato comum a todos os gateways:
 *   createPixCharge({ orderId, amountCents, description, payerEmail })
 *     -> { transactionId, status, copiaECola, qrCodeBase64, expiresAt }
 *   getPayment(transactionId) -> { transactionId, status, paidAmountCents, externalReference, raw }
 *   verifyWebhook(req) -> boolean
 *   extractTransactionId(req) -> string | null
 *
 * status normalizado: pendente | aprovado | expirado | recusado | reembolsado
 */

const expirationDate = () => new Date(Date.now() + env.PIX_EXPIRATION_MINUTES * 60_000);

// ------------------------------------------------------------------
// Mercado Pago (API v1/orders, Checkout Transparente com PIX)
// https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix
// ------------------------------------------------------------------
const MP_API = 'https://api.mercadopago.com';

const MP_STATUS = {
  created: 'pendente',
  processing: 'pendente',
  action_required: 'pendente',
  processed: 'aprovado',
  canceled: 'expirado',
  expired: 'expirado',
  failed: 'recusado',
  refunded: 'reembolsado',
  charged_back: 'reembolsado',
};

// A API de Orders só aceita vencimento do PIX entre 30 minutos e 30 dias.
const MP_MIN_EXPIRATION_MINUTES = 30;

const toCents = (value) => Math.round(Number(value ?? 0) * 100);

async function mpRequest(path, { method = 'GET', body, idempotencyKey } = {}) {
  const res = await fetch(`${MP_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey && { 'X-Idempotency-Key': idempotencyKey }),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('Erro na API do Mercado Pago', { path, status: res.status, message: data?.message, cause: data?.cause });
    throw new AppError(502, 'Falha ao comunicar com o gateway de pagamento', 'GATEWAY_ERROR');
  }
  return data;
}

const mercadoPago = {
  name: 'mercadopago',

  async createPixCharge({ orderId, amountCents, payerEmail }) {
    const minutes = Math.max(env.PIX_EXPIRATION_MINUTES, MP_MIN_EXPIRATION_MINUTES);
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    const amount = (amountCents / 100).toFixed(2);
    const data = await mpRequest('/v1/orders', {
      method: 'POST',
      idempotencyKey: orderId,
      body: {
        type: 'online',
        processing_mode: 'automatic',
        total_amount: amount,
        external_reference: orderId,
        transactions: {
          payments: [
            {
              amount,
              payment_method: { id: 'pix', type: 'bank_transfer' },
              expiration_time: `PT${minutes}M`,
            },
          ],
        },
        // Só com credenciais de teste: o Mercado Pago aprova sozinho o PIX de pagadores "APRO".
        payer: { email: payerEmail, ...(env.MP_TEST_AUTO_APPROVE && { first_name: 'APRO' }) },
      },
    });

    const pix = data.transactions?.payments?.[0]?.payment_method;
    if (!pix?.qr_code || !pix?.qr_code_base64) {
      throw new AppError(502, 'O gateway não retornou o QR Code PIX', 'GATEWAY_ERROR');
    }

    return {
      transactionId: String(data.id),
      status: MP_STATUS[data.status] ?? 'pendente',
      copiaECola: pix.qr_code,
      qrCodeBase64: pix.qr_code_base64,
      expiresAt,
    };
  },

  async getPayment(transactionId) {
    const data = await mpRequest(`/v1/orders/${encodeURIComponent(transactionId)}`);
    const payment = data.transactions?.payments?.[0];
    return {
      transactionId: String(data.id),
      status: MP_STATUS[data.status] ?? 'pendente',
      paidAmountCents: toCents(data.total_paid_amount ?? payment?.paid_amount),
      externalReference: data.external_reference ?? null,
      raw: {
        id: data.id,
        status: data.status,
        status_detail: data.status_detail,
        total_amount: data.total_amount,
        total_paid_amount: data.total_paid_amount,
        payment_id: payment?.id,
        payment_status: payment?.status,
        external_reference: data.external_reference,
      },
    };
  },

  extractTransactionId(req) {
    const type = req.body?.type ?? req.query.type;
    if (type !== 'order') return null;
    const id = req.query['data.id'] ?? req.body?.data?.id;
    return id && /^ORD[0-9A-Z]{10,40}$/.test(String(id)) ? String(id) : null;
  },

  // https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
  verifyWebhook(req) {
    const signature = req.get('x-signature');
    const requestId = req.get('x-request-id');
    const dataId = req.query['data.id'];
    if (!signature || !requestId || !dataId) return false;

    const parts = Object.fromEntries(
      signature.split(',').map((part) => part.split('=').map((s) => s.trim())),
    );
    if (!parts.ts || !parts.v1) return false;

    const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
    const expected = crypto.createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifest).digest('hex');
    return safeEqual(expected, parts.v1);
  },
};

// ------------------------------------------------------------------
// Mock (desenvolvimento): gera um PIX fictício e considera qualquer
// notificação de uma transação existente como "aprovada".
// ------------------------------------------------------------------
const mock = {
  name: 'mock',

  async createPixCharge({ orderId, amountCents }) {
    const transactionId = `mock_${crypto.randomUUID()}`;
    const copiaECola = `PIX-DE-TESTE|pedido=${orderId}|valor=${(amountCents / 100).toFixed(2)}`;
    const dataUrl = await QRCode.toDataURL(copiaECola, { margin: 1, width: 300 });
    return {
      transactionId,
      status: 'pendente',
      copiaECola,
      qrCodeBase64: dataUrl.split(',')[1],
      expiresAt: expirationDate(),
    };
  },

  async getPayment(transactionId) {
    const { rows } = await query(
      'SELECT order_id, amount_cents FROM payments WHERE gateway_transaction_id = $1',
      [transactionId],
    );
    if (!rows[0]) throw new AppError(404, 'Transação mock não encontrada', 'NOT_FOUND');
    return {
      transactionId,
      status: 'aprovado',
      paidAmountCents: rows[0].amount_cents,
      externalReference: rows[0].order_id,
      raw: { mock: true },
    };
  },

  extractTransactionId(req) {
    const id = req.body?.data?.id;
    return typeof id === 'string' && /^mock_[0-9a-f-]{36}$/.test(id) ? id : null;
  },

  verifyWebhook() {
    return true;
  },
};

export const gateway = env.PAYMENT_PROVIDER === 'mercadopago' ? mercadoPago : mock;
