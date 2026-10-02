import 'dotenv/config';
import { z } from 'zod';

export const isServerless = Boolean(process.env.VERCEL);

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    PUBLIC_URL: z.string().url(),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    DATABASE_URL: z.string().min(1),

    PAYMENT_PROVIDER: z.enum(['mercadopago', 'mock']).default('mock'),
    MP_ACCESS_TOKEN: optionalString,
    MP_WEBHOOK_SECRET: optionalString,
    MP_TEST_AUTO_APPROVE: bool,
    PIX_EXPIRATION_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),

    SMM_API_URL: optionalString.pipe(z.string().url().optional()),
    SMM_API_KEY: optionalString,
    SMM_MOCK: bool,
    SMM_MOCK_FAIL: bool,
    SMM_FX_TO_BRL: z.coerce.number().positive().default(1),

    ADMIN_TOKEN: z.string().min(32, 'ADMIN_TOKEN precisa ter no mínimo 32 caracteres'),
    JOB_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),
    // Protege GET /api/cron/tick, que roda as tarefas periódicas quando não há processo contínuo (Vercel).
    CRON_SECRET: optionalString.pipe(z.string().min(32, 'CRON_SECRET precisa ter no mínimo 32 caracteres').optional()),

    LOW_BALANCE_THRESHOLD: z.coerce.number().min(0).default(50),
    BALANCE_CHECK_MINUTES: z.coerce.number().int().min(1).default(10),
    ALERT_TELEGRAM_BOT_TOKEN: optionalString,
    ALERT_TELEGRAM_CHAT_ID: optionalString,
    ALERT_WHATSAPP_PHONE: optionalString,
    ALERT_WHATSAPP_APIKEY: optionalString,
  })
  .superRefine((e, ctx) => {
    const require = (field, reason) => {
      if (!e[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `obrigatório ${reason}` });
    };
    if (e.PAYMENT_PROVIDER === 'mercadopago') {
      require('MP_ACCESS_TOKEN', 'quando PAYMENT_PROVIDER=mercadopago');
      require('MP_WEBHOOK_SECRET', 'quando PAYMENT_PROVIDER=mercadopago');
    }
    if (!e.SMM_MOCK) {
      require('SMM_API_URL', 'quando SMM_MOCK=false');
      require('SMM_API_KEY', 'quando SMM_MOCK=false');
    }
    if (e.NODE_ENV === 'production' && (e.PAYMENT_PROVIDER === 'mock' || e.SMM_MOCK || e.MP_TEST_AUTO_APPROVE)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['NODE_ENV'], message: 'modos mock/teste não são permitidos em produção' });
    }
    if (isServerless) require('CRON_SECRET', 'na Vercel, para as tarefas periódicas rodarem');
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  if (isServerless) throw new Error('Variáveis de ambiente inválidas');
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
