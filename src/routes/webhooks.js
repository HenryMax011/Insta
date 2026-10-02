import { Router } from 'express';
import { gateway } from '../services/paymentGateway.js';
import { handlePaymentNotification } from '../services/fulfillment.js';
import { logger } from '../utils/logger.js';

export const webhooksRouter = Router();

// O gateway reenvia a notificação enquanto não receber 2xx, por isso erros
// transitórios (banco fora, API do gateway lenta) retornam 500 de propósito.
webhooksRouter.post('/payment', async (req, res) => {
  if (!gateway.verifyWebhook(req)) {
    logger.warn('Webhook com assinatura inválida', { ip: req.ip });
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  const transactionId = gateway.extractTransactionId(req);
  if (!transactionId) return res.sendStatus(200);

  await handlePaymentNotification(transactionId);
  res.sendStatus(200);
});
