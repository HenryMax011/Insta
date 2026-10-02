import { Router } from 'express';
import { query } from '../db/pool.js';
import { adminAuth } from '../middlewares/adminAuth.js';
import { adminLimiter } from '../middlewares/rateLimits.js';
import { despacharPedido } from '../services/fulfillment.js';
import { consultarSaldoSMM, listarServicosSMM } from '../services/smmProvider.js';
import { verificarCatalogo } from '../services/catalogCheck.js';
import { adminOrdersQuery, uuidParam } from '../validators/schemas.js';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { checkBalance } from '../services/balanceMonitor.js';
import { alertChannels, sendAlert } from '../services/alerts.js';

export const adminRouter = Router();

adminRouter.use(adminLimiter, adminAuth);

adminRouter.get('/orders', async (req, res) => {
  const { status, q, limit, offset } = adminOrdersQuery.parse(req.query);
  const search = q ? `%${q.replace(/[%_\\]/g, '\\$&')}%` : null;
  const { rows } = await query(
    `SELECT o.id, o.status, o.network, o.service_name, o.link, o.quantity, o.amount_cents,
            o.contact_email, o.contact_whatsapp, o.provider_order_id, o.provider_status,
            o.provider_remains, o.provider_error, o.provider_error_code, o.dispatch_attempts,
            o.created_at, o.updated_at,
            p.status AS payment_status, p.gateway_transaction_id, p.paid_at
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
      WHERE ($1::varchar IS NULL OR o.status = $1::varchar)
        AND ($4::varchar IS NULL OR o.id::text ILIKE $4 OR o.contact_email ILIKE $4
             OR o.link ILIKE $4 OR o.contact_whatsapp ILIKE $4 OR o.provider_order_id ILIKE $4)
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3`,
    [status ?? null, limit, offset, search],
  );
  res.json({ orders: rows, limit, offset });
});

const PAID_STATUSES = `('pago', 'processando', 'enviado', 'concluido', 'parcial', 'erro_automacao')`;

adminRouter.get('/summary', async (req, res) => {
  const balancePromise = checkBalance({ maxAgeMs: 60_000 });
  const counts = await query(`SELECT status, COUNT(*)::int AS total FROM orders GROUP BY status`);
  const sales = await query(`
    SELECT COALESCE(SUM(amount_cents) FILTER (WHERE created_at >= date_trunc('day', now())), 0)::int AS today_cents,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today_orders,
           COALESCE(SUM(amount_cents) FILTER (WHERE created_at >= now() - interval '30 days'), 0)::int AS month_cents,
           COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS month_orders
      FROM orders WHERE status IN ${PAID_STATUSES}`);
  const balance = await balancePromise;
  res.json({
    statusCounts: Object.fromEntries(counts.rows.map((r) => [r.status, r.total])),
    sales: sales.rows[0],
    balance,
    lowBalanceThreshold: env.LOW_BALANCE_THRESHOLD,
    alertChannels: alertChannels(),
  });
});

adminRouter.post('/alerts/test', async (req, res) => {
  const result = await sendAlert('teste de alerta do painel admin. Se você recebeu esta mensagem, os avisos estão funcionando.');
  res.status(result.sent ? 200 : 400).json(result);
});

adminRouter.post('/orders/:id/resend', async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const { rows } = await query('SELECT status FROM orders WHERE id = $1', [id]);
  if (!rows[0]) throw new AppError(404, 'Pedido não encontrado', 'NOT_FOUND');
  if (rows[0].status !== 'erro_automacao') {
    throw new AppError(409, `Apenas pedidos com "Erro na Automação" podem ser reenviados (atual: ${rows[0].status})`, 'INVALID_STATUS');
  }

  const result = await despacharPedido(id);
  res.status(result.dispatched ? 200 : 502).json(result);
});

const fromProvider = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, err.message, err.code ?? 'SMM_ERROR');
  }
};

adminRouter.get('/smm/balance', fromProvider(() => consultarSaldoSMM()));

adminRouter.get(
  '/smm/services',
  fromProvider(async (req) => {
    const search = String(req.query.q ?? '').toLowerCase().slice(0, 60);
    const services = await listarServicosSMM();
    return { services: search ? services.filter((s) => `${s.name} ${s.category}`.toLowerCase().includes(search)) : services };
  }),
);

adminRouter.get('/smm/catalog-check', fromProvider(() => verificarCatalogo()));
