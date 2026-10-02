import { z } from 'zod';

const FORBIDDEN_CHARS = /[<>"'`\\]|[\u0000-\u001F\u007F]/;

export const checkoutSchema = z
  .object({
    serviceId: z.coerce.number().int().positive(),
    link: z
      .string({ required_error: 'Informe o link ou @ do perfil' })
      .trim()
      .min(2, 'Informe o link ou @ do perfil')
      .max(300, 'Link muito longo')
      .refine((v) => !FORBIDDEN_CHARS.test(v), 'O link contém caracteres não permitidos'),
    email: z
      .string({ required_error: 'Informe o e-mail' })
      .trim()
      .toLowerCase()
      .max(254)
      .email('E-mail inválido'),
    whatsapp: z
      .string({ required_error: 'Informe o WhatsApp' })
      .max(25)
      .transform((v) => v.replace(/\D/g, ''))
      .refine((v) => /^(55)?[1-9]{2}9?\d{8}$/.test(v), 'WhatsApp inválido. Use DDD + número')
      .transform((v) => (v.length <= 11 ? `55${v}` : v)),
  })
  .strict();

export const profilePreviewSchema = checkoutSchema
  .pick({ serviceId: true, link: true })
  .extend({ fresh: z.boolean().optional() })
  .strict();

export const uuidParam = z.string().uuid('ID inválido');

export const slugParam = z.string().regex(/^[a-z0-9-]{1,60}$/, 'Produto inválido');

export const adminOrdersQuery = z.object({
  status: z
    .enum(['aguardando_pagamento', 'pago', 'processando', 'enviado', 'concluido', 'parcial', 'erro_automacao', 'cancelado'])
    .optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
