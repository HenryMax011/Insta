import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Cliente da API padrão de painéis SMM (v2).
 * Todas as ações são POST para a mesma URL, com `key` + `action` + parâmetros.
 * Resposta de sucesso: JSON (ex.: { "order": 23501 }). Falha: { "error": "..." }.
 */

export class SmmError extends Error {
  constructor(message, { code = 'SMM_ERROR', providerMessage } = {}) {
    super(message);
    this.code = code;
    this.providerMessage = providerMessage;
  }
}

function classifyProviderError(message) {
  const text = String(message);
  if (/balance|funds|saldo/i.test(text)) {
    return new SmmError('Saldo insuficiente no fornecedor', { code: 'SMM_NO_BALANCE', providerMessage: text });
  }
  if (/service/i.test(text)) {
    return new SmmError('Serviço inválido ou desativado no fornecedor', { code: 'SMM_INVALID_SERVICE', providerMessage: text });
  }
  if (/link|url|private/i.test(text)) {
    return new SmmError('Link recusado pelo fornecedor (perfil privado ou inválido?)', { code: 'SMM_INVALID_LINK', providerMessage: text });
  }
  if (/quantity|minimum|maximum/i.test(text)) {
    return new SmmError('Quantidade fora dos limites do fornecedor', { code: 'SMM_INVALID_QUANTITY', providerMessage: text });
  }
  return new SmmError(`Fornecedor recusou o pedido: ${text}`, { providerMessage: text });
}

let mockSequence = 100_000;

// Espelha os serviços do SMM Hub usados no seed do catálogo.
const MOCK_SERVICES = [
  ['1067', 'Instagram - Seguidores Brasileiros R30', 'IG ◦ SEGUIDORES BRASILEIROS', '25.00', '10', '5500'],
  ['120', 'Instagram - Curtidas Brasileiras R30', 'IG ◦ CURTIDAS BRASILEIRAS', '3.00', '10', '7500'],
  ['800', 'Instagram - Visualizações Brasileiras Reels', 'IG ◦ VISUALIZAÇÕES PARA POSTAGEM', '0.80', '100', '2147483647'],
  ['1006', 'Instagram - Visualizações Brasileiras em Story', 'IG ◦ SERVIÇOS PARA STORYS', '4.90', '50', '20000'],
  ['123', 'Instagram - Visualizações Mundiais Em Story', 'IG ◦ SERVIÇOS PARA STORYS', '0.60', '10', '200000'],
  ['992', 'Instagram - Comentários Brasileiros Aleatórios', 'IG ◦ COMENTÁRIOS BRASILEIROS', '65.00', '1', '50000'],
  ['140', 'Instagram - Compartilhamentos Brasileiros', 'IG ◦ MÉTRICAS E OUTROS', '3.25', '10', '10000000'],
  ['943', 'Instagram - Repostagem Mundiais R30', 'IG ◦ REPOSTAGEM', '4.79', '1', '1000000'],
  ['940', 'Tiktok - Seguidores Brasileiros Orgânicos R30', 'TK ◦ SEGUIDORES', '30.00', '1', '1000000'],
  ['913', 'Tiktok - Curtidas Brasileiras R30', 'TK ◦ CURTIDAS', '2.89', '10', '10000000'],
  ['876', 'TikTok - Visualizações Mundiais Em Vídeo', 'TK ◦ VISUALIZAÇÕES PARA VÍDEOS', '0.17', '100', '2147483647'],
].map(([service, name, category, rate, min, max]) => ({ service, name, type: 'Default', category, rate, min, max, refill: false, cancel: false }));

function mockResponse(params) {
  if (env.SMM_MOCK_FAIL) return { error: 'Not enough funds on balance' };
  switch (params.action) {
    case 'add':
      return { order: ++mockSequence };
    case 'status':
      return Object.fromEntries(
        params.orders.split(',').map((id) => [id, { status: 'Completed', remains: '0', charge: '0.50', currency: 'BRL' }]),
      );
    case 'balance':
      return { balance: '100.00', currency: 'BRL' };
    case 'services':
      return MOCK_SERVICES;
    default:
      return { error: 'Incorrect request' };
  }
}

async function callProvider(params) {
  if (env.SMM_MOCK) return checkResponse(mockResponse(params));

  let res;
  try {
    res = await fetch(env.SMM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ key: env.SMM_API_KEY, ...params }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new SmmError(`Fornecedor indisponível: ${err.name === 'TimeoutError' ? 'tempo esgotado' : err.message}`, {
      code: 'SMM_UNAVAILABLE',
    });
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SmmError(`Resposta inválida do fornecedor (HTTP ${res.status})`, { code: 'SMM_BAD_RESPONSE' });
  }
  if (!res.ok && !data?.error) {
    throw new SmmError(`Fornecedor respondeu HTTP ${res.status}`, { code: 'SMM_UNAVAILABLE' });
  }
  return checkResponse(data);
}

function checkResponse(data) {
  if (data?.error) throw classifyProviderError(data.error);
  return data;
}

/**
 * Cria o pedido no fornecedor e retorna o ID do pedido dele (campo `order`).
 * A persistência do ID fica em `fulfillment.despacharPedido`, que controla a transição de status.
 * Com drip-feed, a API espera `quantity` por entrega: o total é dividido por `runs`.
 */
export async function enviarOrdemSMM(link, quantidade, serviceId, { runs, interval } = {}) {
  const params = { action: 'add', service: String(serviceId), link };
  if (runs) {
    params.quantity = String(Math.round(quantidade / runs));
    params.runs = String(runs);
    params.interval = String(interval);
  } else {
    params.quantity = String(quantidade);
  }
  const data = await callProvider(params);

  if (data.order === undefined || data.order === null) {
    throw new SmmError('Fornecedor não retornou o ID do pedido', { code: 'SMM_BAD_RESPONSE' });
  }

  logger.info('Pedido criado no fornecedor SMM', { providerOrderId: data.order, serviceId, quantidade });
  return String(data.order);
}

/** Consulta até 100 pedidos de uma vez. Retorna { [providerOrderId]: { status, remains } }. */
export async function consultarStatusSMM(providerOrderIds) {
  if (!providerOrderIds.length) return {};
  const data = await callProvider({ action: 'status', orders: providerOrderIds.slice(0, 100).join(',') });
  return data;
}

export async function consultarSaldoSMM() {
  return callProvider({ action: 'balance' });
}

/** Catálogo do fornecedor: [{ service, name, type, category, rate (por 1.000), min, max, refill, cancel }] */
export async function listarServicosSMM() {
  const data = await callProvider({ action: 'services' });
  if (!Array.isArray(data)) throw new SmmError('Lista de serviços inválida', { code: 'SMM_BAD_RESPONSE' });
  return data;
}
