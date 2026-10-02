import { pool } from '../src/db/pool.js';
import { verificarCatalogo } from '../src/services/catalogCheck.js';
import { listarServicosSMM } from '../src/services/smmProvider.js';

const brl = (cents) => (cents === null ? '-' : `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`);
const search = process.argv.slice(2).join(' ').toLowerCase();

try {
  if (search) {
    // npm run smm:check -- instagram seguidores  → busca serviços no fornecedor para escolher o ID
    const services = await listarServicosSMM();
    const found = services.filter((s) => `${s.name} ${s.category}`.toLowerCase().includes(search));
    console.table(found.slice(0, 50).map((s) => ({
      id: s.service, nome: s.name, categoria: s.category, 'rate/1000': s.rate, min: s.min, max: s.max, tipo: s.type, refill: s.refill,
    })));
    console.log(`${found.length} serviço(s) encontrado(s) para "${search}".`);
  } else {
    const report = await verificarCatalogo();
    console.log(`Saldo no fornecedor: ${report.providerBalance ?? '?'} ${report.providerCurrency ?? ''} | conversão p/ BRL: x${report.fxToBrl}`);
    if (report.providerCurrency && report.providerCurrency !== 'BRL' && report.fxToBrl === 1) {
      console.warn(`ATENÇÃO: a conta está em ${report.providerCurrency}. Ajuste SMM_FX_TO_BRL no .env para calcular a margem corretamente.`);
    }
    console.table(report.items.map((i) => ({
      produto: i.product, opcao: i.option, venda: brl(i.priceCents), servico: i.providerServiceId,
      custo: brl(i.costCents), margem: i.marginPercent === null ? '-' : `${i.marginPercent}%`, problemas: i.issues.join('; ') || 'ok',
    })));
    console.log(report.ok ? 'Catálogo OK.' : 'Há itens com problema: ajuste preço ou provider_service_id na tabela services.');
    process.exitCode = report.ok ? 0 : 1;
  }
} catch (err) {
  console.error('Falha ao consultar o fornecedor:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
