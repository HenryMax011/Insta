import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { gateway } from '../services/paymentGateway.js';
import { getProfilePreview } from '../services/profilePreview.js';
import { checkoutLimiter, previewLimiter } from '../middlewares/rateLimits.js';
import { checkoutSchema, profilePreviewSchema, slugParam, uuidParam } from '../validators/schemas.js';
import { normalizeTarget } from '../utils/target.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const publicRouter = Router();

const INVALID_LINK_MESSAGE = {
  perfil: 'Informe um @ ou link de perfil válido da rede selecionada',
  post: 'Informe o link de uma postagem válida da rede selecionada',
  perfil_ou_post: 'Informe o link de uma postagem ou do perfil da rede selecionada',
};

publicRouter.get('/products', async (req, res) => {
  const { rows } = await query(`
    SELECT p.slug, p.network, p.category, p.name, p.discount_percent AS "discountPercent",
           MIN(s.price_cents)::int AS "fromPriceCents", MIN(s.quantity)::int AS "fromQuantity"
      FROM products p
      JOIN services s ON s.product_id = p.id AND s.active
     WHERE p.active
     GROUP BY p.id
     ORDER BY p.network, p.sort_order`);
  res.json({ products: rows });
});

publicRouter.get('/products/:slug', async (req, res) => {
  const slug = slugParam.parse(req.params.slug);
  const { rows } = await query(
    `SELECT p.slug, p.network, p.category, p.name, p.title, p.description, p.examples, p.features,
            p.link_type AS "linkType", p.discount_percent AS "discountPercent",
            COALESCE(json_agg(json_build_object(
              'id', s.id, 'label', s.label, 'description', s.description,
              'quantity', s.quantity, 'priceCents', s.price_cents, 'highlight', s.highlight
            ) ORDER BY s.quantity) FILTER (WHERE s.id IS NOT NULL), '[]') AS variants
       FROM products p
       LEFT JOIN services s ON s.product_id = p.id AND s.active
      WHERE p.slug = $1 AND p.active
      GROUP BY p.id`,
    [slug],
  );
  if (!rows[0] || rows[0].variants.length === 0) throw new AppError(404, 'Produto não encontrado', 'NOT_FOUND');
  res.json({ product: rows[0] });
});

publicRouter.post('/profile-preview', previewLimiter, async (req, res) => {
  const input = profilePreviewSchema.parse(req.body);
  const { rows } = await query(
    `SELECT p.network, p.link_type
       FROM services s
       JOIN products p ON p.id = s.product_id
      WHERE s.id = $1 AND s.active AND p.active`,
    [input.serviceId],
  );
  const service = rows[0];
  if (!service) throw new AppError(404, 'Pacote não encontrado', 'SERVICE_NOT_FOUND');

  const link = normalizeTarget(input.link, service.network, service.link_type);
  if (!link) throw new AppError(400, INVALID_LINK_MESSAGE[service.link_type], 'INVALID_LINK');

  res.json(await getProfilePreview(link, service.network, { fresh: input.fresh }));
});

publicRouter.post('/checkout', checkoutLimiter, async (req, res) => {
  const input = checkoutSchema.parse(req.body);

  const { rows } = await query(
    `SELECT s.id, s.label, s.quantity, s.price_cents, p.name AS product_name, p.network, p.link_type
       FROM services s
       JOIN products p ON p.id = s.product_id
      WHERE s.id = $1 AND s.active AND p.active`,
    [input.serviceId],
  );
  const variant = rows[0];
  if (!variant) throw new AppError(404, 'Pacote não encontrado', 'SERVICE_NOT_FOUND');

  const service = {
    ...variant,
    name: variant.label
      ? `${variant.product_name} ${variant.label}`
      : `${variant.quantity} ${variant.product_name}`,
  };

  const link = normalizeTarget(input.link, service.network, service.link_type);
  if (!link) throw new AppError(400, INVALID_LINK_MESSAGE[service.link_type], 'INVALID_LINK');

  // O valor é sempre calculado no servidor a partir do catálogo, nunca recebido do front-end.
  const order = await withTransaction(async (client) => {
    const customer = await client.query(
      `INSERT INTO customers (email, whatsapp) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET whatsapp = EXCLUDED.whatsapp
       RETURNING id`,
      [input.email, input.whatsapp],
    );
    const created = await client.query(
      `INSERT INTO orders (customer_id, service_id, network, service_name, link, quantity, amount_cents,
                           contact_email, contact_whatsapp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, amount_cents`,
      [
        customer.rows[0].id,
        service.id,
        service.network,
        service.name,
        link,
        service.quantity,
        service.price_cents,
        input.email,
        input.whatsapp,
      ],
    );
    return created.rows[0];
  });

  let charge;
  try {
    charge = await gateway.createPixCharge({
      orderId: order.id,
      amountCents: order.amount_cents,
      description: service.name,
      payerEmail: input.email,
    });
  } catch (err) {
    await query(`UPDATE orders SET status = 'cancelado' WHERE id = $1`, [order.id]);
    throw err;
  }

  await query(
    `INSERT INTO payments (order_id, gateway, gateway_transaction_id, status, amount_cents,
                           pix_copia_cola, pix_qr_base64, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      order.id,
      gateway.name,
      charge.transactionId,
      charge.status,
      order.amount_cents,
      charge.copiaECola,
      charge.qrCodeBase64,
      charge.expiresAt,
    ],
  );

  logger.info('Cobrança PIX criada', { orderId: order.id, transactionId: charge.transactionId });

  res.status(201).json({
    orderId: order.id,
    amountCents: order.amount_cents,
    transactionId: charge.transactionId,
    pix: {
      copiaECola: charge.copiaECola,
      qrCodeBase64: charge.qrCodeBase64,
      expiresAt: charge.expiresAt,
    },
  });
});

// O UUID v4 do pedido é imprevisível, então funciona como token de consulta; não expomos dados pessoais.
publicRouter.get('/orders/:id', async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const { rows } = await query(
    `SELECT o.id, o.status, o.service_name, o.quantity, o.amount_cents, o.created_at,
            p.status AS payment_status, p.expires_at
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
      WHERE o.id = $1`,
    [id],
  );
  const order = rows[0];
  if (!order) throw new AppError(404, 'Pedido não encontrado', 'NOT_FOUND');

  res.json({
    orderId: order.id,
    status: order.status,
    paymentStatus: order.payment_status,
    serviceName: order.service_name,
    quantity: order.quantity,
    amountCents: order.amount_cents,
    expiresAt: order.expires_at,
    createdAt: order.created_at,
  });
});
