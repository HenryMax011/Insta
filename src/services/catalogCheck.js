import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { consultarSaldoSMM, listarServicosSMM } from './smmProvider.js';

const MIN_MARGIN_PERCENT = 30;

/**
 * Cruza cada variação do catálogo com o serviço correspondente no fornecedor.
 * O `rate` do fornecedor é o preço por 1.000 unidades na moeda da conta dele;
 * SMM_FX_TO_BRL converte para reais quando a conta não estiver em BRL.
 */
export async function verificarCatalogo() {
  const [providerServices, balance] = await Promise.all([
    listarServicosSMM(),
    consultarSaldoSMM().catch(() => null),
  ]);
  const byId = new Map(providerServices.map((s) => [String(s.service), s]));

  const { rows } = await query(`
    SELECT s.id, p.slug, p.name AS product, s.label, s.quantity, s.price_cents, s.provider_service_id, s.drip_runs
      FROM services s
      JOIN products p ON p.id = s.product_id
     WHERE s.active AND p.active
     ORDER BY p.network, p.sort_order, s.quantity`);

  const items = rows.map((variant) => {
    const provider = byId.get(String(variant.provider_service_id));
    const issues = [];
    let costCents = null;
    let marginPercent = null;

    if (!provider) {
      issues.push('Serviço não encontrado no fornecedor');
    } else {
      const runs = variant.drip_runs ?? 1;
      const perRun = Math.round(variant.quantity / runs);
      costCents = Math.round((Number(provider.rate) * perRun * runs * env.SMM_FX_TO_BRL * 100) / 1000);
      marginPercent = Math.round(((variant.price_cents - costCents) / variant.price_cents) * 100);

      const perRunLabel = runs > 1 ? ` por entrega (${perRun} x ${runs})` : '';
      if (perRun < Number(provider.min)) issues.push(`Abaixo do mínimo do fornecedor (${provider.min})${perRunLabel}`);
      if (perRun > Number(provider.max)) issues.push(`Acima do máximo do fornecedor (${provider.max})${perRunLabel}`);
      if (costCents >= variant.price_cents) issues.push('PREJUÍZO: custo maior que o preço de venda');
      else if (marginPercent < MIN_MARGIN_PERCENT) issues.push(`Margem baixa (< ${MIN_MARGIN_PERCENT}%)`);
      if (provider.type && provider.type !== 'Default') {
        issues.push(`Tipo "${provider.type}" exige parâmetros diferentes de link + quantidade`);
      }
    }

    return {
      variantId: variant.id,
      product: variant.slug,
      option: variant.label ?? String(variant.quantity),
      priceCents: variant.price_cents,
      providerServiceId: variant.provider_service_id,
      providerServiceName: provider?.name ?? null,
      costCents,
      marginPercent,
      issues,
    };
  });

  return {
    providerCurrency: balance?.currency ?? null,
    providerBalance: balance?.balance ?? null,
    fxToBrl: env.SMM_FX_TO_BRL,
    ok: items.every((i) => i.issues.length === 0),
    items,
  };
}
