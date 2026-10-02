import rateLimit from 'express-rate-limit';

const base = { standardHeaders: 'draft-7', legacyHeaders: false };

export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 120 });

export const checkoutLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 8,
  message: { error: 'Muitas tentativas. Aguarde um minuto e tente novamente.', code: 'RATE_LIMITED' },
});

export const previewLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 20,
  message: { error: 'Muitas consultas de perfil. Aguarde um minuto e tente novamente.', code: 'RATE_LIMITED' },
});

export const adminLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 60 });
