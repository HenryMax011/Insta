import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { consultarSaldoSMM } from './smmProvider.js';
import { resetAlertCooldown, sendAlert } from './alerts.js';

const LOW_BALANCE_ALERT = 'low-balance';
const LOW_BALANCE_COOLDOWN_MS = 6 * 60 * 60_000;
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

let snapshot = null;

/** Último saldo consultado, em reais: { balanceBrl, currency, low, checkedAt, error } */
export function lastBalance() {
  return snapshot;
}

export async function checkBalance({ maxAgeMs = 0 } = {}) {
  if (snapshot && !snapshot.error && Date.now() - snapshot.checkedAt < maxAgeMs) return snapshot;

  try {
    const data = await consultarSaldoSMM();
    const balanceBrl = Number(data.balance) * env.SMM_FX_TO_BRL;
    if (!Number.isFinite(balanceBrl)) throw new Error('Saldo inválido retornado pelo fornecedor');

    const low = balanceBrl < env.LOW_BALANCE_THRESHOLD;
    snapshot = { balanceBrl, currency: data.currency ?? 'BRL', low, checkedAt: Date.now(), error: null };

    if (low) {
      await sendAlert(
        `saldo baixo no SMM Hub: ${brl.format(balanceBrl)} (limite ${brl.format(env.LOW_BALANCE_THRESHOLD)}). Recarregue para os pedidos não ficarem parados.`,
        { key: LOW_BALANCE_ALERT, cooldownMs: LOW_BALANCE_COOLDOWN_MS },
      );
    } else {
      await resetAlertCooldown(LOW_BALANCE_ALERT);
    }
  } catch (err) {
    logger.warn('Falha ao consultar saldo do fornecedor', { err: err.message });
    snapshot = { ...(snapshot ?? {}), checkedAt: Date.now(), error: err.message };
  }
  return snapshot;
}
