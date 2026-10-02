import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Rota não encontrada', code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Dados inválidos',
      code: 'VALIDATION_ERROR',
      fields: err.issues.map((i) => ({ field: i.path.join('.') || '_', message: i.message })),
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON malformado', code: 'INVALID_JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload muito grande', code: 'PAYLOAD_TOO_LARGE' });
  }

  logger.error('Erro não tratado', { path: req.path, err: err.message, stack: err.stack });
  res.status(500).json({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' });
}
