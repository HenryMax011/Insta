'use strict';

const $ = (selector) => document.querySelector(selector);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const money = (cents) => brl.format(cents / 100);

const TOKEN_KEY = 'impulso:adminToken';
const PAGE_SIZE = 30;
const REFRESH_MS = 30_000;

const STATUS = {
  aguardando_pagamento: ['Aguardando PIX', 'bg-white/[0.06] text-white/60'],
  pago: ['Pago', 'bg-sky-400/15 text-sky-300'],
  processando: ['Processando', 'bg-sky-400/15 text-sky-300'],
  enviado: ['Em entrega', 'bg-violet-400/15 text-violet-300'],
  concluido: ['Concluído', 'bg-emerald-400/15 text-emerald-300'],
  parcial: ['Parcial', 'bg-amber-400/15 text-amber-300'],
  erro_automacao: ['Erro na automação', 'bg-red-500/15 text-red-300'],
  cancelado: ['Cancelado', 'bg-white/[0.04] text-white/40'],
};
const TABS = ['todos', 'erro_automacao', 'pago', 'enviado', 'concluido', 'parcial', 'aguardando_pagamento', 'cancelado'];

const state = { filter: 'todos', search: '', offset: 0, orders: [], counts: {}, timer: null, searchTimer: null };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function toast(message, tone = 'default') {
  const tones = { default: 'bg-slate-800', success: 'bg-emerald-600', error: 'bg-red-600' };
  const item = el('div', `pointer-events-auto rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${tones[tone]}`, message);
  $('#toasts').append(item);
  setTimeout(() => item.remove(), 4000);
}

async function api(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) ?? ''}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    logout('Token inválido ou expirado.');
    throw new Error('Não autorizado');
  }
  if (!res.ok) {
    const err = new Error(data.error || data.reason || `Erro HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

// ==================== LOGIN ====================

function showLogin(message) {
  $('#app').classList.add('hidden');
  $('#login').classList.replace('hidden', 'flex');
  $('#login-error').textContent = message ?? '';
  $('#login-error').classList.toggle('hidden', !message);
  $('#token').focus();
}

function logout(message) {
  sessionStorage.removeItem(TOKEN_KEY);
  clearInterval(state.timer);
  showLogin(message);
}

async function login(event) {
  event.preventDefault();
  const token = $('#token').value.trim().replace(/^ADMIN_TOKEN\s*=\s*/i, '').replace(/^["']|["']$/g, '').trim();
  sessionStorage.setItem(TOKEN_KEY, token);
  try {
    await api('/summary');
  } catch (err) {
    if (sessionStorage.getItem(TOKEN_KEY)) {
      showLogin(`Não foi possível entrar: ${err.message}. Confira se o servidor está rodando e tente de novo.`);
    }
    return;
  }
  $('#token').value = '';
  startApp();
}

function startApp() {
  $('#login').classList.add('hidden');
  $('#login').classList.remove('flex');
  $('#app').classList.remove('hidden');
  refreshAll();
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    if (!document.hidden) refreshAll({ silent: true });
  }, REFRESH_MS);
}

// ==================== RESUMO ====================

function statCard(label, value, hint, tone = '') {
  const card = el('div', `card rounded-2xl p-4 ${tone}`);
  card.append(el('p', 'text-xs font-semibold uppercase tracking-wider text-white/45', label), el('p', 'mt-2 text-2xl font-extrabold tabular-nums', value));
  if (hint) card.append(el('p', 'mt-1 text-xs text-white/45', hint));
  return card;
}

function banner(tone, title, text) {
  const tones = {
    error: 'border-red-400/30 bg-red-500/10 text-red-200',
    warning: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
  };
  const box = el('div', `rounded-2xl border p-4 ${tones[tone]}`);
  box.append(el('p', 'text-sm font-bold', title), el('p', 'mt-1 text-sm opacity-80', text));
  return box;
}

function renderSummary(summary) {
  const { balance, sales, statusCounts, lowBalanceThreshold, alertChannels } = summary;
  state.counts = statusCounts;
  const errors = statusCounts.erro_automacao ?? 0;
  const inDelivery = (statusCounts.pago ?? 0) + (statusCounts.processando ?? 0) + (statusCounts.enviado ?? 0);

  const balanceText = balance?.balanceBrl != null ? brl.format(balance.balanceBrl) : '—';
  const balanceHint = balance?.error
    ? `Erro ao consultar: ${balance.error}`
    : balance?.low ? `Abaixo do limite de ${brl.format(lowBalanceThreshold)}` : `Alerta abaixo de ${brl.format(lowBalanceThreshold)}`;

  $('#stats').replaceChildren(
    statCard('Saldo SMM Hub', balanceText, balanceHint, balance?.low || balance?.error ? 'ring-1 ring-red-400/40' : ''),
    statCard('Vendas hoje', money(sales.today_cents), `${sales.today_orders} pedido(s) pagos`),
    statCard('Últimos 30 dias', money(sales.month_cents), `${sales.month_orders} pedido(s) pagos`),
    statCard('Precisam de atenção', String(errors), `${inDelivery} em andamento`, errors ? 'ring-1 ring-red-400/40' : ''),
  );

  const banners = [];
  if (balance?.low) {
    banners.push(banner('error', `Saldo baixo no SMM Hub: ${balanceText}`,
      'Recarregue o saldo no SMM Hub. Pedidos parados por falta de saldo são reenviados automaticamente em até 5 minutos após a recarga.'));
  }
  if (errors) {
    banners.push(banner('warning', `${errors} pedido(s) com erro na automação`,
      'Os parados por falta de saldo voltam sozinhos após a recarga. Os demais precisam de conferência e reenvio manual (filtro "Erro na automação").'));
  }
  $('#banners').replaceChildren(...banners);
  $('#banners').classList.toggle('mb-4', banners.length > 0);

  const channels = Object.entries(alertChannels).filter(([, on]) => on).map(([name]) => (name === 'telegram' ? 'Telegram' : 'WhatsApp'));
  $('#alert-status').textContent = channels.length
    ? `Ativos: ${channels.join(' e ')}. Você é avisado de saldo baixo e pedidos com erro.`
    : 'Nenhum canal configurado. Preencha ALERT_TELEGRAM_* ou ALERT_WHATSAPP_* no .env para receber avisos.';
  $('#test-alert').disabled = !channels.length;
  $('#test-alert').classList.toggle('opacity-40', !channels.length);

  renderTabs();
}

// ==================== PEDIDOS ====================

function renderTabs() {
  const total = Object.values(state.counts).reduce((a, b) => a + b, 0);
  $('#tabs').replaceChildren(
    ...TABS.map((key) => {
      const active = state.filter === key;
      const count = key === 'todos' ? total : state.counts[key] ?? 0;
      const label = key === 'todos' ? 'Todos' : STATUS[key][0];
      const button = el('button', `shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${active ? 'bg-gradient-to-r from-fuchsia-600 to-orange-400 text-white' : 'bg-white/[0.05] text-white/60 hover:text-white'}`);
      button.type = 'button';
      button.append(el('span', '', label), el('span', `ml-1.5 rounded-full px-1.5 text-xs ${active ? 'bg-white/20' : 'bg-white/[0.07]'} ${key === 'erro_automacao' && count ? 'text-red-300' : ''}`, String(count)));
      button.addEventListener('click', () => {
        state.filter = key;
        renderTabs();
        loadOrders();
      });
      return button;
    }),
  );
}

function detail(label, value, href) {
  const row = el('div', 'min-w-0');
  row.append(el('p', 'text-[11px] font-semibold uppercase tracking-wider text-white/35', label));
  if (href) {
    const a = el('a', 'block truncate text-sm text-pink-300 hover:underline', value);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    row.append(a);
  } else {
    row.append(el('p', 'truncate text-sm text-white/80', value ?? '—'));
  }
  return row;
}

function orderCard(order) {
  const [label, tone] = STATUS[order.status] ?? [order.status, 'bg-white/10'];
  const card = el('article', 'card rounded-2xl p-4');

  const top = el('div', 'flex flex-wrap items-center gap-x-3 gap-y-2');
  top.append(
    el('span', `rounded-full px-2.5 py-1 text-xs font-bold ${tone}`, label),
    el('p', 'font-bold', order.service_name),
    el('p', 'text-sm text-white/45', dateTime.format(new Date(order.created_at))),
    el('p', 'ml-auto font-extrabold tabular-nums', money(order.amount_cents)),
  );

  const whatsapp = order.contact_whatsapp ? `https://wa.me/${order.contact_whatsapp}` : null;
  const grid = el('div', 'mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4');
  grid.append(
    detail('Link', order.link, /^https:\/\//.test(order.link) ? order.link : null),
    detail('Cliente', order.contact_email),
    detail('WhatsApp', order.contact_whatsapp, whatsapp),
    detail('Fornecedor', order.provider_order_id
      ? `#${order.provider_order_id}${order.provider_status ? ` · ${order.provider_status}` : ''}${order.provider_remains ? ` · faltam ${order.provider_remains}` : ''}`
      : '—'),
  );
  card.append(top, grid);

  if (order.provider_error) {
    const noBalance = order.provider_error_code === 'SMM_NO_BALANCE';
    const box = el('div', `mt-3 rounded-xl border p-3 text-sm ${noBalance ? 'border-amber-400/25 bg-amber-400/[0.07] text-amber-100' : 'border-red-400/25 bg-red-500/[0.07] text-red-200'}`);
    box.append(el('p', 'font-semibold', order.provider_error));
    if (noBalance && order.status === 'erro_automacao') box.append(el('p', 'mt-1 text-xs opacity-75', 'Será reenviado automaticamente quando houver saldo no SMM Hub.'));
    card.append(box);
  }

  const actions = el('div', 'mt-3 flex flex-wrap items-center gap-2');
  if (order.status === 'erro_automacao') {
    const resend = el('button', 'rounded-lg bg-gradient-to-r from-fuchsia-600 to-orange-400 px-3.5 py-2 text-sm font-bold transition hover:brightness-110', 'Reenviar ao SMM Hub');
    resend.type = 'button';
    resend.addEventListener('click', () => resendOrder(order, resend));
    actions.append(resend);
  }
  const copy = el('button', 'rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 transition hover:text-white', `Código ${order.id.slice(0, 8)}… (copiar)`);
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(order.id).catch(() => {});
    toast('Código do pedido copiado', 'success');
  });
  actions.append(copy);
  if (order.dispatch_attempts > 1) actions.append(el('span', 'text-xs text-white/40', `${order.dispatch_attempts} tentativas de envio`));
  card.append(actions);
  return card;
}

function renderOrders(hasMore) {
  const list = $('#orders');
  if (!state.orders.length) {
    list.replaceChildren(el('p', 'card rounded-2xl p-8 text-center text-sm text-white/50', 'Nenhum pedido encontrado.'));
  } else {
    list.replaceChildren(...state.orders.map(orderCard));
  }
  $('#load-more').classList.toggle('hidden', !hasMore);
}

async function loadOrders({ append = false } = {}) {
  state.offset = append ? state.offset + PAGE_SIZE : 0;
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(state.offset) });
  if (state.filter !== 'todos') params.set('status', state.filter);
  if (state.search) params.set('q', state.search);
  const { orders } = await api(`/orders?${params}`);
  state.orders = append ? [...state.orders, ...orders] : orders;
  renderOrders(orders.length === PAGE_SIZE);
}

async function resendOrder(order, button) {
  const safe = order.provider_error_code === 'SMM_NO_BALANCE';
  if (!safe && !confirm('Antes de reenviar, confira no painel do SMM Hub se este pedido não foi criado lá (para não pagar duas vezes). Reenviar agora?')) return;
  button.disabled = true;
  button.textContent = 'Enviando...';
  try {
    const result = await api(`/orders/${order.id}/resend`, { method: 'POST' });
    toast(`Pedido enviado ao SMM Hub (#${result.providerOrderId})`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
  refreshAll({ silent: true });
}

async function refreshAll({ silent = false } = {}) {
  const button = $('#refresh');
  button.disabled = true;
  try {
    const [summary] = await Promise.all([api('/summary'), loadOrders()]);
    renderSummary(summary);
    $('#updated-at').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (err) {
    if (!silent && err.message !== 'Não autorizado') toast(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function testAlert() {
  const button = $('#test-alert');
  button.disabled = true;
  try {
    const result = await api('/alerts/test', { method: 'POST' });
    toast(`Alerta enviado por ${result.channels.join(' e ')}`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

// ==================== INICIALIZAÇÃO ====================

$('#login-form').addEventListener('submit', login);
$('#logout').addEventListener('click', () => logout());
$('#refresh').addEventListener('click', () => refreshAll());
$('#test-alert').addEventListener('click', testAlert);
$('#load-more').addEventListener('click', () => loadOrders({ append: true }).catch((err) => toast(err.message, 'error')));
$('#search').addEventListener('input', (e) => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    state.search = e.target.value.trim();
    loadOrders().catch((err) => toast(err.message, 'error'));
  }, 350);
});

if (sessionStorage.getItem(TOKEN_KEY)) startApp();
else showLogin();
