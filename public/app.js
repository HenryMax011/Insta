'use strict';

// ==================== UTILITÁRIOS ====================

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR');
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const money = (cents) => brl.format(cents / 100);

const POLL_INTERVAL_MS = 5000;
const LAST_ORDER_KEY = 'impulso:lastOrderId';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Não foi possível concluir a operação. Tente novamente.');
    err.fields = data.fields || [];
    err.code = data.code;
    throw err;
  }
  return data;
}

// ==================== CONTEÚDO ESTÁTICO ====================

const NETWORKS = {
  instagram: { label: 'Instagram', icon: 'instagram', chip: 'bg-pink-50 text-pink-600' },
  tiktok: { label: 'TikTok', icon: 'tiktok', chip: 'bg-slate-100 text-slate-800' },
};

const CATEGORIES = {
  seguidores: { tagline: 'Mais autoridade e prova social para o perfil.', unit: 'seguidores', gradient: 'from-indigo-500 to-violet-500' },
  curtidas: { tagline: 'Engajamento imediato nas suas postagens.', unit: 'curtidas', gradient: 'from-pink-500 to-rose-500' },
  visualizacoes: { tagline: 'Alcance para Reels e vídeos decolarem.', unit: 'views', gradient: 'from-sky-500 to-indigo-500' },
  stories: { tagline: 'Views reais com alcance nos Insights.', unit: 'views', gradient: 'from-amber-400 to-pink-500' },
  comentarios: { tagline: 'Comentários prontos em português.', unit: 'comentários', gradient: 'from-violet-500 to-fuchsia-500' },
  compartilhamentos: { tagline: 'Leve seu conteúdo para mais pessoas.', unit: 'compart.', gradient: 'from-emerald-500 to-teal-500' },
  reposts: { tagline: 'Republicações que ampliam o alcance.', unit: 'reposts', gradient: 'from-orange-400 to-rose-500' },
  pacote_mensal: { tagline: 'Views automáticas nos Stories o mês todo.', unit: '', gradient: 'from-fuchsia-500 to-indigo-600' },
};

const LINK_FIELD = {
  perfil: {
    label: 'Link ou @ do perfil',
    placeholder: () => '@seuperfil',
    help: () => 'Pode ser o @usuario ou o link completo do perfil.',
  },
  post: {
    label: 'Link da publicação',
    placeholder: (network) =>
      network === 'tiktok' ? 'https://www.tiktok.com/@perfil/video/...' : 'https://www.instagram.com/p/...',
    help: (network) =>
      network === 'tiktok' ? 'Cole o link do vídeo do TikTok.' : 'Cole o link do post ou do Reels (botão "Compartilhar" > "Copiar link").',
  },
  perfil_ou_post: {
    label: 'Link da publicação ou @ do perfil',
    placeholder: () => '@seuperfil ou link da publicação',
    help: () => 'Informando o perfil, usamos a primeira publicação que o sistema identificar.',
  },
};

const BENEFITS = [
  { icon: 'shield', title: 'Compra 100% segura', text: 'Pagamento via PIX processado pelo gateway. Nunca pedimos senha.' },
  { icon: 'bolt', title: 'Entrega automática', text: 'O pedido é enviado assim que o pagamento é confirmado.' },
  { icon: 'tag', title: 'Preço justo', text: 'Quanto maior o pacote, menor o preço por unidade.' },
  { icon: 'support', title: 'Suporte dedicado', text: 'Acompanhamento pelo WhatsApp e e-mail do pedido.' },
];

const FAQ = [
  ['Vocês precisam da minha senha?', 'Não. Nunca pedimos senha. Basta informar o @ do perfil ou o link da publicação.'],
  ['Quanto tempo demora a entrega?', 'A entrega começa automaticamente logo após a confirmação do PIX, normalmente em poucos minutos. Pacotes maiores são entregues de forma gradual para parecer mais natural.'],
  ['Meu perfil precisa estar público?', 'Sim. Mantenha o perfil público do pagamento até o fim da entrega, senão o sistema não consegue enviar o pedido.'],
  ['Como acompanho meu pedido?', 'Depois do pagamento você recebe um código. Use-o em "Acompanhar pedido", no topo do site.'],
  ['O pagamento é seguro?', 'Sim. O PIX é gerado por um gateway de pagamento regulamentado e a confirmação é automática. Não armazenamos dados bancários.'],
  ['E se algo der errado com o pedido?', 'Nossa equipe monitora todos os pedidos. Se houver qualquer problema na entrega, entramos em contato pelo WhatsApp informado.'],
];

const STEPS = ['Pacote', 'Dados', 'Pagamento', 'Pronto'];

// Ícones outline 24x24 estáticos — nenhum dado do usuário é interpolado aqui.
const ICONS = {
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>',
  tiktok: '<path fill="currentColor" stroke="none" d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z"/>',
  seguidores: '<path d="M15 19.13a9.38 9.38 0 0 0 2.63.37 9.34 9.34 0 0 0 4.12-.95 4.13 4.13 0 0 0-7.53-2.5M15 19.13v-.01c0-1.11-.29-2.16-.79-3.07M15 19.13v.1A12.32 12.32 0 0 1 8.62 21c-2.33 0-4.51-.65-6.37-1.77v-.1a6.38 6.38 0 0 1 11.96-3.08M12 6.38a3.38 3.38 0 1 1-6.75 0 3.38 3.38 0 0 1 6.75 0Zm8.25 2.25a2.63 2.63 0 1 1-5.25 0 2.63 2.63 0 0 1 5.25 0Z"/>',
  curtidas: '<path d="M21 8.25c0-2.49-2.1-4.5-4.69-4.5-1.93 0-3.6 1.13-4.31 2.73-.72-1.6-2.38-2.73-4.31-2.73C5.1 3.75 3 5.76 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"/>',
  visualizacoes: '<path d="M5.25 5.65c0-.86.92-1.4 1.67-.99l11.54 6.35a1.13 1.13 0 0 1 0 1.97L6.92 19.33a1.13 1.13 0 0 1-1.67-.98V5.65Z"/>',
  stories: '<path d="M2.04 12.32a1 1 0 0 1 0-.64C3.42 7.51 7.36 4.5 12 4.5c4.64 0 8.57 3 9.96 7.18.07.2.07.43 0 .64C20.58 16.49 16.64 19.5 12 19.5c-4.64 0-8.57-3-9.96-7.18Z"/><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>',
  comentarios: '<path d="M21 12c0 4.56-4.03 8.25-9 8.25a9.76 9.76 0 0 1-2.56-.34 5.97 5.97 0 0 1-4.03 1.06 4.48 4.48 0 0 0 .98-2.03c.09-.45-.13-.9-.47-1.22C3.93 16.18 3 14.19 3 12c0-4.56 4.03-8.25 9-8.25s9 3.69 9 8.25Z"/><path d="M8.25 12h.01M12 12h.01M15.75 12h.01" stroke-width="2.5"/>',
  compartilhamentos: '<path d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15"/>',
  reposts: '<path d="M16.02 9.35h4.99M2.99 19.64v-4.99m0 0h4.99m-4.99 0 3.18 3.18a8.25 8.25 0 0 0 13.8-3.7M4.03 9.87a8.25 8.25 0 0 1 13.8-3.7l3.18 3.18m0-4.99v4.99"/>',
  pacote_mensal: '<path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>',
  shield: '<path d="M9 12.75 11.25 15 15 9.75m-3-7.04A11.96 11.96 0 0 1 3.6 6 11.99 11.99 0 0 0 3 9.75c0 5.59 3.82 10.29 9 11.62 5.18-1.33 9-6.03 9-11.62 0-1.31-.21-2.57-.6-3.75h-.15c-3.2 0-6.1-1.25-8.25-3.29Z"/>',
  bolt: '<path d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"/>',
  tag: '<path d="M9.57 3H5.25A2.25 2.25 0 0 0 3 5.25v4.32c0 .6.24 1.17.66 1.59l9.58 9.58c.7.7 1.78.87 2.61.33a18.1 18.1 0 0 0 5.22-5.22c.54-.83.37-1.91-.33-2.61L11.16 3.66A2.25 2.25 0 0 0 9.57 3Z"/><path d="M6 6h.01" stroke-width="3"/>',
  support: '<path d="M8.63 12h.01M12 12h.01M15.38 12h.01" stroke-width="2.5"/><path d="M2.25 12.76c0 1.6 1.12 2.99 2.7 3.22 1.08.16 2.18.28 3.3.37V21l4.16-4.16c.24-.24.56-.37.9-.38a48.3 48.3 0 0 0 5.83-.48c1.58-.23 2.7-1.62 2.7-3.22V6.74c0-1.6-1.12-2.99-2.7-3.22A48.4 48.4 0 0 0 12 3c-2.39 0-4.74.18-7.04.52-1.58.23-2.71 1.62-2.71 3.22v6.02Z"/>',
  phone: '<path d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"/>',
  mail: '<path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.24a2.25 2.25 0 0 1-1.07 1.92l-7.5 4.61a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.92V6.75"/>',
  link: '<path d="M13.19 8.69a4.5 4.5 0 0 1 1.24 7.24l-4.5 4.5a4.5 4.5 0 0 1-6.36-6.36l1.76-1.76m13.35-.62 1.76-1.76a4.5 4.5 0 0 0-6.36-6.36l-4.5 4.5a4.5 4.5 0 0 0 1.24 7.24"/>',
  lock: '<path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/>',
  check: '<path d="m4.5 12.75 6 6 9-13.5"/>',
  copy: '<path d="M15.75 17.25v3.38c0 .62-.5 1.12-1.12 1.12H4.87c-.62 0-1.12-.5-1.12-1.12V7.88c0-.62.5-1.13 1.12-1.13h1.88m9 10.5h3.38c.62 0 1.12-.5 1.12-1.13V4.88c0-.63-.5-1.13-1.12-1.13H9.37c-.62 0-1.12.5-1.12 1.13v1.87m7.5 10.5H9.37c-.62 0-1.12-.5-1.12-1.12V6.75"/>',
  clock: '<path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>',
  search: '<path d="m21 21-5.2-5.2m0 0A7.5 7.5 0 1 0 5.2 5.2a7.5 7.5 0 0 0 10.6 10.6Z"/>',
  arrow: '<path d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>',
  chevron: '<path d="m19.5 8.25-7.5 7.5-7.5-7.5"/>',
  plus: '<path d="M12 4.5v15m7.5-7.5h-15" stroke-width="2.2"/>',
  x: '<path d="M6 18 18 6M6 6l12 12"/>',
  verified: '<circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none"/><path d="m8.25 12.25 2.5 2.5 5-5.5" stroke="#fff" stroke-width="2.2"/>',
  refresh: '<path d="M16.02 9.35h4.99V4.36M21.01 9.35l-3.18-3.18a8.25 8.25 0 0 0-13.8 3.7m-1.04 4.78H2.99v4.99m0-4.99 3.18 3.18a8.25 8.25 0 0 0 13.8-3.7"/>',
  qr: '<path d="M3.75 4.88c0-.62.5-1.13 1.13-1.13h4.5c.62 0 1.12.5 1.12 1.13v4.5c0 .62-.5 1.12-1.12 1.12h-4.5c-.63 0-1.13-.5-1.13-1.12v-4.5ZM3.75 14.63c0-.63.5-1.13 1.13-1.13h4.5c.62 0 1.12.5 1.12 1.13v4.5c0 .62-.5 1.12-1.12 1.12h-4.5c-.63 0-1.13-.5-1.13-1.12v-4.5ZM13.5 4.88c0-.62.5-1.13 1.13-1.13h4.5c.62 0 1.12.5 1.12 1.13v4.5c0 .62-.5 1.12-1.12 1.12h-4.5c-.63 0-1.13-.5-1.13-1.12v-4.5Z"/><path d="M13.5 13.5h.75v.75h-.75zM13.5 19.5h.75v.75h-.75zM19.5 13.5h.75v.75h-.75zM19.5 19.5h.75v.75h-.75zM16.5 16.5h.75v.75h-.75z"/>',
  sparkles: '<path d="M9.81 15.9 9 18.75l-.81-2.85a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.85-.81a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.81 2.85a4.5 4.5 0 0 0 3.09 3.09l2.85.81-2.85.81a4.5 4.5 0 0 0-3.09 3.09ZM18.26 8.72 18 9.75l-.26-1.03a3.38 3.38 0 0 0-2.46-2.46L14.25 6l1.03-.26a3.38 3.38 0 0 0 2.46-2.46L18 2.25l.26 1.03a3.38 3.38 0 0 0 2.46 2.46l1.03.26-1.03.26a3.38 3.38 0 0 0-2.46 2.46Z"/>',
  warning: '<path d="M12 9v3.75m-9.3 3.38c-.87 1.5.22 3.37 1.95 3.37h14.7c1.73 0 2.82-1.87 1.95-3.37L13.95 3.38c-.87-1.5-3.03-1.5-3.9 0L2.7 16.13ZM12 15.75h.01"/>',
};

function icon(name, className = 'h-6 w-6') {
  const wrapper = document.createElement('span');
  wrapper.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
  const svg = wrapper.firstElementChild;
  svg.setAttribute('class', className);
  return svg;
}

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => node.replaceWith(icon(node.dataset.icon, node.className)));
}

function toast(message, tone = 'default') {
  const tones = { default: 'bg-slate-900', success: 'bg-emerald-600', error: 'bg-red-600' };
  const item = el('div', `pointer-events-auto fade-up flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${tones[tone]}`);
  item.append(icon(tone === 'error' ? 'warning' : 'check', 'h-4 w-4 shrink-0'), el('span', '', message));
  $('#toasts').append(item);
  setTimeout(() => item.remove(), 3500);
}

// ==================== ESTADO ====================

const state = {
  view: null,
  products: null,
  filter: 'todos',
  product: null,
  variant: null,
  orderId: null,
  pollTimer: null,
  countdownTimer: null,
  pendingScroll: null,
  pendingCheckout: null,
  previewRequest: 0,
};

// ==================== HOME ====================

async function loadProducts() {
  if (!state.products) state.products = (await api('/api/products')).products;
  return state.products;
}

function renderSkeletonGrid() {
  $('#products-grid').replaceChildren(
    ...Array.from({ length: 6 }, () => el('div', 'skeleton-dark h-64 rounded-3xl')),
  );
}

async function renderHome() {
  showView('home');
  if (!state.products) renderSkeletonGrid();

  try {
    await loadProducts();
  } catch (err) {
    $('#products-grid').replaceChildren(el('p', 'col-span-full text-sm font-medium text-red-500', err.message));
    return;
  }

  renderFilter();
  renderProductsGrid();

  if (state.pendingScroll) {
    document.getElementById(state.pendingScroll)?.scrollIntoView({ behavior: 'smooth' });
    state.pendingScroll = null;
  }
}

function renderFilter() {
  const container = $('#network-filter');
  if (!container.childElementCount) {
    const options = [['todos', 'Todos'], ...Object.entries(NETWORKS).map(([key, meta]) => [key, meta.label])];
    const indicator = el('span', 'filter-indicator absolute top-1.5 bottom-1.5 left-0 rounded-full bg-gradient-to-r from-fuchsia-600 via-pink-500 to-orange-400 shadow-lg shadow-fuchsia-900/40 transition-all duration-500 ease-[cubic-bezier(.2,.8,.2,1)]');
    container.append(
      indicator,
      ...options.map(([key, label]) => {
        const count = key === 'todos' ? state.products.length : state.products.filter((p) => p.network === key).length;
        const button = el('button', 'relative z-10 flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-sm font-bold transition-colors duration-300 sm:gap-2 sm:px-5');
        button.type = 'button';
        button.dataset.filter = key;
        button.setAttribute('role', 'tab');
        if (NETWORKS[key]) button.append(icon(NETWORKS[key].icon, 'h-4 w-4'));
        button.append(el('span', '', label), el('span', 'filter-count rounded-full px-1.5 text-[11px] tabular-nums', String(count)));
        button.addEventListener('click', () => {
          if (state.filter === key) return;
          state.filter = key;
          renderFilter();
          renderProductsGrid();
        });
        return button;
      }),
    );
    new ResizeObserver(() => renderFilter()).observe(container);
  }

  let activeButton = null;
  container.querySelectorAll('[data-filter]').forEach((button) => {
    const active = button.dataset.filter === state.filter;
    if (active) activeButton = button;
    button.setAttribute('aria-selected', String(active));
    button.classList.toggle('text-white', active);
    button.classList.toggle('text-white/55', !active);
    button.classList.toggle('hover:text-white', !active);
    const count = button.querySelector('.filter-count');
    count.classList.toggle('bg-white/20', active);
    count.classList.toggle('bg-white/[0.06]', !active);
  });
  const indicator = container.querySelector('.filter-indicator');
  indicator.style.width = `${activeButton.offsetWidth}px`;
  indicator.style.transform = `translateX(${activeButton.offsetLeft}px)`;
}

function renderProductsGrid() {
  const products = state.products.filter((p) => state.filter === 'todos' || p.network === state.filter);
  $('#products-grid').replaceChildren(
    ...products.map((product, index) => {
      const category = CATEGORIES[product.category] ?? CATEGORIES.seguidores;
      const network = NETWORKS[product.network];

      const card = el(
        'a',
        'reveal spotlight card-dark group relative flex flex-col rounded-3xl p-7 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-fuchsia-950/60',
      );
      card.href = `#/produto/${encodeURIComponent(product.slug)}`;
      card.style.setProperty('--d', `${(index % 3) * 90}ms`);

      const top = el('div', 'flex items-start justify-between');
      const tileWrap = el('span', 'relative');
      const glow = el('span', `absolute inset-0 rounded-2xl bg-gradient-to-br opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100 ${category.gradient}`);
      const tile = el('span', `wiggle relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br text-white ring-1 ring-white/20 ${category.gradient}`);
      tile.append(icon(product.category, 'h-7 w-7'));
      tileWrap.append(glow, tile);
      const chip = el('span', 'inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs font-bold text-white/70 ring-1 ring-white/10');
      if (network) chip.append(icon(network.icon, 'h-3.5 w-3.5'), el('span', '', network.label));
      top.append(tileWrap, chip);

      const unit = category.unit ? `${product.fromQuantity.toLocaleString('pt-BR')} ${category.unit}` : 'plano mensal';
      const original = product.discountPercent > 0 ? Math.round(product.fromPriceCents / (1 - product.discountPercent / 100)) : null;

      const priceRow = el('div', 'flex items-center gap-2 whitespace-nowrap');
      priceRow.append(el('span', 'text-[11px] font-bold uppercase tracking-widest text-white/40', 'a partir de'));
      if (original) {
        priceRow.append(
          el('s', 'text-xs font-semibold text-white/35', money(original)),
          el('span', 'rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[11px] font-extrabold text-emerald-300', `-${product.discountPercent}%`),
        );
      }

      const bottom = el('div', 'mt-auto flex items-end justify-between gap-3 border-t border-white/[0.07] pt-5');
      const price = el('div');
      price.append(
        priceRow,
        el('p', 'mt-1 text-3xl font-extrabold tracking-tight text-white', money(product.fromPriceCents)),
        el('p', 'text-xs text-white/45', `pacote com ${unit}`),
      );
      const buy = el('span', 'grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/[0.07] text-white ring-1 ring-white/15 transition duration-300 group-hover:scale-110 group-hover:bg-gradient-to-br group-hover:from-fuchsia-600 group-hover:to-orange-400 group-hover:shadow-lg group-hover:shadow-fuchsia-900/50 group-hover:ring-transparent');
      buy.setAttribute('aria-hidden', 'true');
      buy.append(icon('arrow', 'h-5 w-5 transition-transform duration-300 group-hover:-rotate-45'));
      bottom.append(price, buy);

      card.append(
        top,
        el('h3', 'mt-6 text-xl font-extrabold tracking-tight text-white', product.name),
        el('p', 'mt-1.5 mb-6 text-sm leading-relaxed text-white/55', category.tagline),
        bottom,
      );
      return card;
    }),
  );
  observeReveal($('#products-grid'));
}

function renderBenefits() {
  $('#benefits').replaceChildren(
    ...BENEFITS.map((item, index) => {
      const card = el('div', 'reveal spotlight card-dark group relative rounded-3xl p-6 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-fuchsia-950/60');
      card.style.setProperty('--d', `${index * 100}ms`);
      const tile = el('span', 'wiggle grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.06] text-pink-300 ring-1 ring-white/10 transition-colors duration-300 group-hover:bg-gradient-to-br group-hover:from-fuchsia-600 group-hover:to-orange-400 group-hover:text-white group-hover:ring-transparent');
      tile.append(icon(item.icon, 'h-6 w-6'));
      card.append(
        tile,
        el('h3', 'mt-5 font-extrabold tracking-tight text-white', item.title),
        el('p', 'mt-1.5 text-sm leading-relaxed text-white/55', item.text),
      );
      return card;
    }),
  );

  $('#info-list').replaceChildren(
    ...BENEFITS.map((item) => {
      const li = el('li', 'flex items-start gap-3');
      const tile = el('span', 'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600');
      tile.append(icon(item.icon, 'h-5 w-5'));
      const text = el('div');
      text.append(el('p', 'text-sm font-bold text-slate-800', item.title), el('p', 'text-xs leading-relaxed text-slate-500', item.text));
      li.append(tile, text);
      return li;
    }),
  );
}

function renderFaq() {
  $('#faq-list').replaceChildren(
    ...FAQ.map(([question, answer], index) => {
      const details = el('details', 'faq-item reveal card-dark group relative rounded-2xl open:shadow-2xl open:shadow-fuchsia-950/50');
      details.style.setProperty('--d', `${index * 60}ms`);
      details.setAttribute('name', 'faq');
      const summary = el('summary', 'flex cursor-pointer items-center gap-5 px-6 py-5 sm:px-7 sm:py-6');
      const number = el('span', 'faq-num font-display w-9 shrink-0 text-3xl font-semibold leading-none', String(index + 1).padStart(2, '0'));
      const text = el('span', 'flex-1 font-bold text-white/85 transition-colors group-hover:text-white group-open:text-white sm:text-[17px]', question);
      const plusWrap = el('span', 'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10 transition-colors duration-300 group-open:bg-gradient-to-br group-open:from-fuchsia-600 group-open:to-orange-400 group-open:ring-transparent');
      plusWrap.append(icon('plus', 'faq-plus h-4 w-4 text-white'));
      summary.append(number, text, plusWrap);
      details.append(summary, el('p', 'px-6 pb-6 text-[15px] leading-relaxed text-white/60 sm:pr-7 sm:pl-[5.5rem]', answer));
      return details;
    }),
  );
}

async function renderFooterServices() {
  try {
    const products = await loadProducts();
    for (const network of Object.keys(NETWORKS)) {
      $(`#footer-${network}`).replaceChildren(
        ...products
          .filter((p) => p.network === network)
          .slice(0, 6)
          .map((p) => {
            const li = el('li');
            const a = el('a', 'footer-link', p.name);
            a.href = `#/produto/${encodeURIComponent(p.slug)}`;
            li.append(a);
            return li;
          }),
      );
    }
  } catch {
    // O rodapé é secundário; a home exibe o erro de carregamento.
  }
}

// ==================== PRODUTO ====================

async function renderProduct(slug) {
  showView('product');
  resetPurchase();
  $('#product-skeleton').classList.remove('hidden');
  $('#product-header').classList.add('hidden');
  $('#variants').replaceChildren(...Array.from({ length: 8 }, () => el('div', 'skeleton h-24 rounded-2xl')));

  let product;
  try {
    product = (await api(`/api/products/${encodeURIComponent(slug)}`)).product;
  } catch (err) {
    toast(err.message, 'error');
    location.hash = '#/';
    return;
  }

  state.product = product;
  const category = CATEGORIES[product.category] ?? CATEGORIES.seguidores;
  const network = NETWORKS[product.network];
  document.title = `${product.title} — Impulso Social`;

  renderBreadcrumb(product);

  $('#product-icon').className = `grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${category.gradient}`;
  $('#product-icon').replaceChildren(icon(product.category, 'h-7 w-7'));
  $('#summary-icon').className = `grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white ${category.gradient}`;
  $('#summary-icon').replaceChildren(icon(product.category, 'h-5 w-5'));
  $('#product-network').textContent = network?.label ?? product.network;
  $('#product-title').textContent = product.title;
  $('#summary-product').textContent = `${product.name} ${network?.label ?? ''}`.trim();

  renderDescription(product.description);
  const examples = product.examples ?? [];
  $('#product-examples').classList.toggle('hidden', examples.length === 0);
  $('#product-examples-list').replaceChildren(
    ...examples.map((text) => el('li', 'rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2 text-sm text-slate-700', text)),
  );

  const isPackage = product.variants.some((v) => v.label);
  $('#variant-title').textContent = isPackage ? 'Escolha o pacote' : 'Escolha a quantidade';
  $('#variant-hint').textContent = isPackage ? '' : 'Pacotes maiores saem mais baratos por unidade';
  $('#variant-hint').classList.toggle('sm:block', !isPackage);

  const linkField = LINK_FIELD[product.linkType];
  $('#link-label').textContent = linkField.label;
  $('#link').placeholder = linkField.placeholder(product.network);
  $('#link-help').textContent = linkField.help(product.network);

  $('#product-skeleton').classList.add('hidden');
  $('#product-header').classList.remove('hidden');

  selectVariant(product.variants.find((v) => v.highlight) ?? product.variants[0]);
}

function renderBreadcrumb(product) {
  const crumbs = [
    { label: 'Início', href: '#/' },
    { label: NETWORKS[product.network]?.label ?? product.network, href: '#/' },
    { label: product.name },
  ];
  const list = $('#breadcrumb');
  list.replaceChildren();
  crumbs.forEach((crumb, i) => {
    if (i > 0) list.append(el('li', 'text-slate-300', '/'));
    const li = el('li');
    if (crumb.href) {
      const a = el('a', 'font-medium transition hover:text-indigo-600', crumb.label);
      a.href = crumb.href;
      li.append(a);
    } else {
      li.append(el('span', 'font-semibold text-slate-700', crumb.label));
      li.setAttribute('aria-current', 'page');
    }
    list.append(li);
  });
}

// Trechos entre [[ ]] recebem o sublinhado em gradiente; o restante entra como texto puro.
function renderDescription(description) {
  const container = $('#product-description');
  container.replaceChildren();
  for (const paragraph of description.split(/\n\s*\n/)) {
    const p = el('p');
    paragraph.split(/\[\[(.+?)\]\]/).forEach((part, index) => {
      if (!part) return;
      p.append(index % 2 ? el('span', 'hl font-semibold text-slate-800', part) : document.createTextNode(part));
    });
    container.append(p);
  }
}

function renderFeatures() {
  const features = [...(state.product.features ?? [])];
  if (state.variant?.description) features.push(state.variant.description);
  const list = $('#product-features');
  list.replaceChildren(
    ...features.map((text) => {
      const li = el('li', 'flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700');
      li.append(icon('check', 'h-4 w-4 shrink-0 text-emerald-500'), el('span', '', text));
      return li;
    }),
  );
  list.classList.toggle('hidden', features.length === 0);
}

function variantLabel(variant) {
  if (variant.label) return variant.label;
  const unit = CATEGORIES[state.product.category]?.unit;
  return `${num.format(variant.quantity)}${unit ? ` ${unit}` : ''}`;
}

function fromPriceCents(priceCents) {
  const { discountPercent } = state.product;
  return discountPercent > 0 ? Math.round(priceCents / (1 - discountPercent / 100)) : null;
}

function renderVariants() {
  const variants = state.product.variants;
  const isPackage = variants.some((v) => v.label);
  const baseUnit = variants[0].priceCents / variants[0].quantity;
  const unit = CATEGORIES[state.product.category]?.unit ?? '';

  $('#variants').replaceChildren(
    ...variants.map((variant) => {
      const selected = variant.id === state.variant?.id;
      const button = el(
        'button',
        `relative flex flex-col items-center justify-center rounded-2xl px-3 py-5 text-center transition duration-300 ${
          selected
            ? 'variant-selected -translate-y-0.5'
            : 'border-2 border-white/[0.07] bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]'
        }`,
      );
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(selected));

      if (variant.highlight) {
        button.append(
          el('span', 'absolute -top-2.5 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow', 'Mais vendido'),
        );
      }

      if (isPackage) {
        button.append(el('span', 'text-base font-extrabold text-white', variant.label));
      } else {
        button.append(
          el('span', 'text-2xl font-extrabold leading-none tracking-tight text-white', num.format(variant.quantity)),
          el('span', 'mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40', unit),
        );
      }
      button.append(el('span', `mt-2.5 text-sm font-extrabold ${selected ? 'text-pink-300' : 'text-white/70'}`, money(variant.priceCents)));

      const savings = Math.round((1 - variant.priceCents / variant.quantity / baseUnit) * 100);
      if (!isPackage && savings >= 5) {
        button.append(el('span', 'mt-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300', `-${savings}% por unid.`));
      }

      if (selected) {
        const check = el('span', 'absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-fuchsia-600 to-orange-400 text-white');
        check.append(icon('check', 'h-3 w-3'));
        button.append(check);
      }

      button.addEventListener('click', () => selectVariant(variant));
      return button;
    }),
  );
}

function selectVariant(variant) {
  state.variant = variant;
  renderVariants();
  renderFeatures();

  const from = fromPriceCents(variant.priceCents);
  $('#price-from-row').classList.toggle('hidden', !from);
  $('#summary-from-row').classList.toggle('hidden', !from);
  $('#summary-savings-row').classList.toggle('hidden', !from);
  if (from) {
    $('#price-from').textContent = money(from);
    $('#price-discount').textContent = `-${state.product.discountPercent}%`;
    $('#summary-from').textContent = money(from);
    $('#summary-savings').textContent = `- ${money(from - variant.priceCents)}`;
  }

  $('#price-to').textContent = money(variant.priceCents);
  $('#summary-variant').textContent = variantLabel(variant);
  $('#summary-total').textContent = money(variant.priceCents);
  $('#mobile-variant').textContent = variantLabel(variant);
  $('#mobile-total').textContent = money(variant.priceCents);
}

// ==================== ETAPAS ====================

function setStep(current) {
  $('#steps').replaceChildren(
    ...STEPS.map((label, index) => {
      const step = index + 1;
      const done = step < current || (current === STEPS.length && step === current);
      const active = step === current && !done;
      const li = el('li', 'flex flex-col items-center gap-1.5 sm:flex-row sm:justify-center sm:gap-2');
      const dot = el(
        'span',
        `grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold transition ${
          done
            ? 'bg-emerald-500 text-white'
            : active
              ? 'bg-gradient-to-br from-fuchsia-600 to-orange-400 text-white ring-4 ring-fuchsia-500/20'
              : 'bg-white/[0.04] text-white/40 ring-1 ring-white/10'
        }`,
      );
      if (done) dot.append(icon('check', 'h-4 w-4'));
      else dot.textContent = String(step);
      li.append(dot, el('span', done || active ? 'text-white' : 'text-white/40', label));
      if (active) li.setAttribute('aria-current', 'step');
      return li;
    }),
  );
  state.step = current;
}

// ==================== CHECKOUT ====================

function formatWhatsapp(value) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function clearErrors() {
  $$('[data-error-for]').forEach((p) => {
    p.textContent = '';
    p.classList.add('hidden');
  });
  $$('#checkout-form input').forEach((i) => i.removeAttribute('aria-invalid'));
  $('#form-error').classList.add('hidden');
}

function showFieldError(field, message) {
  const target = document.querySelector(`[data-error-for="${field}"]`);
  if (!target) return false;
  target.textContent = message;
  target.classList.remove('hidden');
  document.getElementById(field)?.setAttribute('aria-invalid', 'true');
  return true;
}

function focusFirstError() {
  const field = document.querySelector('#checkout-form [aria-invalid="true"]');
  if (field) {
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field.focus({ preventScroll: true });
  }
}

function validateLocally(payload) {
  const errors = [];
  if (payload.link.length < 2) errors.push(['link', 'Informe o link ou @']);
  if (!/^\d{10,11}$/.test(payload.whatsapp.replace(/\D/g, ''))) errors.push(['whatsapp', 'Informe DDD + número']);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) errors.push(['email', 'E-mail inválido']);
  errors.forEach(([field, message]) => showFieldError(field, message));
  return errors.length === 0;
}

function setSubmitting(submitting) {
  $$('[data-submit]').forEach((button) => {
    button.disabled = submitting;
  });
  $$('[data-submit-label]').forEach((label) => {
    label.textContent = submitting ? 'Gerando PIX...' : 'Comprar agora';
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!state.variant) return;
  clearErrors();

  const payload = {
    serviceId: state.variant.id,
    link: $('#link').value.trim(),
    whatsapp: $('#whatsapp').value,
    email: $('#email').value.trim(),
  };
  if (!validateLocally(payload)) {
    focusFirstError();
    return;
  }

  state.pendingCheckout = payload;
  openProfileModal();
  loadProfilePreview();
}

function showCheckoutError(err) {
  const shown = err.fields.map((f) => showFieldError(f.field, f.message)).some(Boolean);
  if (shown || (err.code === 'INVALID_LINK' && showFieldError('link', err.message))) {
    focusFirstError();
  } else {
    $('#form-error').textContent = err.message;
    $('#form-error').classList.remove('hidden');
    toast(err.message, 'error');
  }
}

async function submitCheckout(payload) {
  setSubmitting(true);
  try {
    const data = await api('/api/checkout', { method: 'POST', body: JSON.stringify(payload) });
    localStorage.setItem(LAST_ORDER_KEY, data.orderId);
    showPix(data);
  } catch (err) {
    showCheckoutError(err);
  } finally {
    setSubmitting(false);
  }
}

// ==================== CONFIRMAÇÃO DO PERFIL ====================

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

function openProfileModal() {
  const modal = $('#profile-modal');
  modal.classList.replace('hidden', 'flex');
  modal.removeAttribute('data-open');
  void modal.offsetWidth;
  modal.setAttribute('data-open', '');
  document.body.style.overflow = 'hidden';
}

function closeProfileModal({ focusLink = false } = {}) {
  state.previewRequest += 1;
  $('#profile-modal').classList.replace('flex', 'hidden');
  document.body.style.overflow = '';
  if (focusLink) {
    const link = $('#link');
    link.scrollIntoView({ behavior: 'smooth', block: 'center' });
    link.focus({ preventScroll: true });
    link.select();
  }
}

async function loadProfilePreview({ fresh = false } = {}) {
  const payload = state.pendingCheckout;
  const request = ++state.previewRequest;
  renderPreviewLoading();
  try {
    const preview = await api('/api/profile-preview', {
      method: 'POST',
      body: JSON.stringify({ serviceId: payload.serviceId, link: payload.link, fresh }),
    });
    if (request !== state.previewRequest) return;
    renderPreview(preview);
  } catch (err) {
    if (request !== state.previewRequest) return;
    if (err.code === 'INVALID_LINK' || err.fields.length) {
      closeProfileModal();
      showCheckoutError(err);
    } else {
      renderPreview({ status: 'unavailable', network: state.product?.network, message: err.message });
    }
  }
}

function renderPreviewLoading() {
  const title = el('h2', 'text-lg font-bold', 'Buscando seu perfil...');
  title.id = 'profile-modal-title';
  const wrap = el('div', 'flex flex-col items-center gap-4 py-10 text-center');
  wrap.append(
    el('div', 'modal-spin h-12 w-12 rounded-full border-[3px] border-white/10 border-t-pink-400'),
    title,
    el('p', 'text-sm text-white/55', 'Isso leva só alguns segundos.'),
  );
  $('#profile-modal-body').replaceChildren(wrap);
}

function modalButton(label, variant, onClick, iconName) {
  const styles = {
    primary: 'btn-shine bg-gradient-to-r from-fuchsia-600 via-pink-500 to-orange-400 text-white shadow-lg shadow-fuchsia-950/50 hover:brightness-110',
    secondary: 'border border-white/15 bg-white/[0.04] text-white/85 hover:bg-white/10',
  };
  const button = el('button', `inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold transition ${styles[variant]}`);
  button.type = 'button';
  if (iconName) button.append(icon(iconName, 'h-4 w-4'));
  button.append(el('span', '', label));
  button.addEventListener('click', onClick);
  return button;
}

function previewProfileCard(preview) {
  const network = NETWORKS[preview.network] ?? NETWORKS.instagram;
  const card = el('div', 'flex items-center gap-4');

  const ring = el('div', `avatar-ring shrink-0 rounded-full p-[3px] ${preview.isPrivate ? 'is-private' : ''}`);
  const inner = el('div', 'relative h-[72px] w-[72px] overflow-hidden rounded-full border-[3px] border-[#120d19] bg-white/10');
  if (preview.avatar) {
    const img = el('img', 'h-full w-full object-cover');
    img.src = preview.avatar;
    img.alt = '';
    inner.append(img);
  } else {
    inner.append(el('span', 'grid h-full w-full place-items-center text-2xl font-bold text-white/60', (preview.username ?? '?').slice(0, 1).toUpperCase()));
  }
  ring.append(inner);

  const info = el('div', 'min-w-0');
  const handleRow = el('div', 'flex items-center gap-1.5');
  handleRow.append(el('p', 'truncate text-lg font-bold', preview.username ?? ''));
  if (preview.verified) handleRow.append(icon('verified', 'h-[18px] w-[18px] shrink-0 text-sky-400'));
  if (preview.isPrivate) handleRow.append(icon('lock', 'h-4 w-4 shrink-0 text-amber-300'));
  info.append(handleRow);
  if (preview.fullName) info.append(el('p', 'truncate text-sm text-white/55', preview.fullName));
  const chip = el('span', 'mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-2.5 py-1 text-xs font-semibold text-white/75 ring-1 ring-white/10');
  chip.append(icon(network.icon, 'h-3.5 w-3.5'), el('span', '', network.label));
  info.append(chip);

  card.append(ring, info);
  return card;
}

function previewStats(preview) {
  const items = [
    [preview.posts, preview.network === 'tiktok' ? 'vídeos' : 'posts'],
    [preview.followers, 'seguidores'],
    [preview.following, 'seguindo'],
  ];
  const grid = el('dl', 'mt-5 grid grid-cols-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] py-3 text-center');
  items.forEach(([value, label], i) => {
    const cell = el('div', `flex flex-col-reverse ${i ? 'border-l border-white/[0.07]' : ''}`);
    cell.append(
      el('dt', 'text-xs text-white/50', label),
      el('dd', 'text-base font-extrabold tabular-nums', value == null ? '—' : compact.format(value)),
    );
    grid.append(cell);
  });
  return grid;
}

function previewNotice(tone, title, text) {
  const tones = {
    warning: ['border-amber-400/25 bg-amber-400/[0.08]', 'text-amber-300', 'lock'],
    error: ['border-red-400/25 bg-red-500/[0.08]', 'text-red-300', 'warning'],
    info: ['border-white/10 bg-white/[0.04]', 'text-pink-300', 'warning'],
  };
  const [box, accent, iconName] = tones[tone];
  const notice = el('div', `mt-5 flex gap-3 rounded-2xl border p-4 ${box}`);
  const body = el('div', 'min-w-0');
  body.append(el('p', `text-sm font-bold ${accent}`, title));
  if (typeof text === 'string') body.append(el('p', 'mt-1 text-[13px] leading-relaxed text-white/65', text));
  else body.append(text);
  notice.append(icon(iconName, `mt-0.5 h-5 w-5 shrink-0 ${accent}`), body);
  return notice;
}

function privateSteps(network) {
  const steps = network === 'tiktok'
    ? ['Abra o TikTok e vá no seu perfil', 'Toque em ☰ > Configurações e privacidade > Privacidade', 'Desative "Conta privada"']
    : ['Abra o Instagram e vá no seu perfil', 'Toque em ☰ > Privacidade da conta', 'Desative "Conta privada"'];
  const list = el('ol', 'mt-2 space-y-1.5 text-[13px] text-white/70');
  steps.forEach((step, i) => {
    const li = el('li', 'flex gap-2');
    li.append(el('span', 'grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-400/15 text-[11px] font-bold text-amber-300', String(i + 1)), el('span', '', step));
    list.append(li);
  });
  const wrap = el('div');
  wrap.append(el('p', 'mt-1 text-[13px] leading-relaxed text-white/65', 'Com o perfil privado não conseguimos entregar o pedido. Altere para público e verifique de novo:'), list);
  return wrap;
}

function renderPreview(preview) {
  const body = $('#profile-modal-body');
  const title = el('h2', 'pr-8 text-center text-[11px] font-bold uppercase tracking-[0.3em] text-pink-300/90');
  title.id = 'profile-modal-title';
  const nodes = [title];
  const actions = el('div', 'mt-6 flex flex-col gap-2.5');
  const fixLink = () => closeProfileModal({ focusLink: true });
  const proceed = () => {
    const payload = state.pendingCheckout;
    closeProfileModal();
    submitCheckout(payload);
  };

  if (preview.status === 'ok') {
    title.textContent = preview.isPrivate ? 'Perfil privado' : 'Confirme seu perfil';
    const profile = el('div', 'mt-5');
    profile.append(previewProfileCard(preview), previewStats(preview));
    if (preview.postThumb) {
      const post = el('div', 'mt-4 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-2.5');
      const img = el('img', 'h-16 w-16 shrink-0 rounded-xl object-cover');
      img.src = preview.postThumb;
      img.alt = 'Publicação selecionada';
      const text = el('div', 'min-w-0');
      text.append(el('p', 'text-sm font-bold', 'Publicação selecionada'), el('p', 'text-xs text-white/50', 'O pedido será entregue nesta publicação.'));
      post.append(img, text);
      profile.append(post);
    }
    nodes.push(profile);

    if (preview.isPrivate) {
      nodes.push(previewNotice('warning', 'Seu perfil está privado', privateSteps(preview.network)));
      actions.append(
        modalButton('Já deixei público, verificar', 'primary', () => loadProfilePreview({ fresh: true }), 'refresh'),
        modalButton('Usar outro link', 'secondary', fixLink),
      );
    } else {
      nodes.push(el('p', 'mt-5 text-center text-sm text-white/65', preview.isPost ? 'Esta publicação é sua?' : 'Este é o seu perfil?'));
      actions.append(
        modalButton('Sim, continuar para o PIX', 'primary', proceed, 'check'),
        modalButton('Não, corrigir link', 'secondary', fixLink),
      );
    }
  } else if (preview.status === 'not_found') {
    title.textContent = 'Perfil não encontrado';
    nodes.push(previewNotice('error', `Não encontramos ${preview.username ? `@${preview.username}` : 'esse perfil'}`, 'Confira se o @ ou o link está escrito corretamente.'));
    actions.append(modalButton('Corrigir link', 'primary', fixLink));
  } else {
    title.textContent = 'Confirme seu perfil';
    nodes.push(previewNotice(
      'info',
      'Não conseguimos carregar a prévia agora',
      `Confira se o link "${state.pendingCheckout.link}" está certo e se o perfil está público antes de continuar.`,
    ));
    actions.append(
      modalButton('Continuar mesmo assim', 'primary', proceed),
      modalButton('Corrigir link', 'secondary', fixLink),
    );
  }

  nodes.push(actions);
  body.replaceChildren(...nodes);
  actions.querySelector('button')?.focus({ preventScroll: true });
}

function showArea(name) {
  for (const area of ['purchase', 'pix', 'success', 'expired']) {
    $(`#${area}-area`).classList.toggle('hidden', area !== name);
  }
  const buying = name === 'purchase';
  $('#mobile-bar').classList.toggle('hidden', !buying);
  $$('aside [data-submit]').forEach((b) => b.classList.toggle('lg:flex', buying));

  const status = $('#summary-status');
  const messages = {
    pix: ['Aguardando pagamento do PIX', 'bg-amber-50 text-amber-700'],
    success: ['Pagamento aprovado', 'bg-emerald-50 text-emerald-700'],
    expired: ['PIX expirado', 'bg-slate-100 text-slate-600'],
  };
  status.classList.toggle('hidden', buying);
  if (!buying) {
    status.textContent = messages[name][0];
    status.className = `mt-5 rounded-2xl p-3 text-center text-sm font-bold ${messages[name][1]}`;
  }
}

function resetPurchase() {
  stopTimers();
  state.orderId = null;
  clearErrors();
  showArea('purchase');
  setStep(1);
}

function showPix(data) {
  state.orderId = data.orderId;
  $('#pix-amount').textContent = money(data.amountCents);
  $('#pix-qr').src = `data:image/png;base64,${data.pix.qrCodeBase64}`;
  $('#pix-code').value = data.pix.copiaECola;
  showArea('pix');
  setStep(3);
  $('#pix-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
  startCountdown(new Date(data.pix.expiresAt));
  startPolling();
}

function startCountdown(expiresAt) {
  clearInterval(state.countdownTimer);
  const total = Math.max(1, expiresAt.getTime() - Date.now());
  const tick = () => {
    const remaining = Math.max(0, expiresAt.getTime() - Date.now());
    const minutes = String(Math.floor(remaining / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
    $('#pix-countdown').textContent = `${minutes}:${seconds}`;
    $('#pix-progress').style.width = `${(remaining / total) * 100}%`;
    if (remaining === 0) clearInterval(state.countdownTimer);
  };
  tick();
  state.countdownTimer = setInterval(tick, 1000);
}

function startPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try {
      const order = await api(`/api/orders/${encodeURIComponent(state.orderId)}`);
      if (order.paymentStatus === 'aprovado') {
        stopTimers();
        $('#success-order-id').textContent = order.orderId;
        $('#success-track-link').href = `#/pedido/${order.orderId}`;
        showArea('success');
        setStep(4);
        toast('Pagamento aprovado!', 'success');
      } else if (['expirado', 'recusado'].includes(order.paymentStatus)) {
        stopTimers();
        showArea('expired');
        setStep(2);
      }
    } catch {
      // Falha de rede pontual: tenta novamente no próximo ciclo.
    }
  }, POLL_INTERVAL_MS);
}

function stopTimers() {
  clearInterval(state.pollTimer);
  clearInterval(state.countdownTimer);
}

async function copyPixCode() {
  const input = $('#pix-code');
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand('copy');
  }
  $('#copy-label').textContent = 'Copiado!';
  toast('Código PIX copiado. Cole no app do seu banco.', 'success');
  setTimeout(() => {
    $('#copy-label').textContent = 'Copiar';
  }, 2500);
}

// ==================== ACOMPANHAR PEDIDO ====================

const TRACK_STEPS = ['Pedido criado', 'Pagamento aprovado', 'Em entrega', 'Concluído'];
const TONES = {
  amber: 'bg-amber-50 text-amber-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  slate: 'bg-slate-100 text-slate-600',
};

function trackProgress(status) {
  switch (status) {
    case 'aguardando_pagamento': return { step: 1, tone: 'amber', label: 'Aguardando pagamento' };
    case 'pago':
    case 'processando': return { step: 2, tone: 'indigo', label: 'Processando' };
    case 'erro_automacao': return { step: 2, tone: 'amber', label: 'Em análise pela equipe' };
    case 'enviado': return { step: 3, tone: 'indigo', label: 'Em entrega' };
    case 'concluido': return { step: 4, tone: 'emerald', label: 'Concluído' };
    case 'parcial': return { step: 4, tone: 'amber', label: 'Concluído parcialmente' };
    default: return { step: 0, tone: 'slate', label: 'Cancelado (PIX não pago)' };
  }
}

function renderOrderView(orderId) {
  showView('order');
  const input = $('#track-input');
  input.value = orderId ?? localStorage.getItem(LAST_ORDER_KEY) ?? '';
  $('#track-result').classList.add('hidden');
  $('#track-error').classList.add('hidden');
  if (orderId) lookupOrder(orderId);
}

async function lookupOrder(orderId) {
  const error = $('#track-error');
  const result = $('#track-result');
  error.classList.add('hidden');

  if (!UUID_RE.test(orderId)) {
    error.textContent = 'Código inválido. Confira e tente novamente.';
    error.classList.remove('hidden');
    return;
  }

  result.classList.remove('hidden');
  result.replaceChildren(el('div', 'skeleton h-40 rounded-2xl'));

  let order;
  try {
    order = await api(`/api/orders/${encodeURIComponent(orderId)}`);
  } catch (err) {
    result.classList.add('hidden');
    error.textContent = err.message;
    error.classList.remove('hidden');
    return;
  }

  const progress = trackProgress(order.status);
  const header = el('div', 'flex flex-wrap items-start justify-between gap-3');
  const info = el('div');
  info.append(
    el('p', 'text-xs font-bold uppercase tracking-widest text-slate-400', 'Pedido'),
    el('p', 'mt-1 text-lg font-extrabold text-slate-900', order.serviceName),
    el('p', 'text-sm', `${money(order.amountCents)} · ${dateTime.format(new Date(order.createdAt))}`),
  );
  header.append(info, el('span', `rounded-full px-3 py-1 text-xs font-extrabold ${TONES[progress.tone]}`, progress.label));

  const timeline = el('ol', 'mt-8 space-y-0');
  TRACK_STEPS.forEach((label, index) => {
    const step = index + 1;
    const done = progress.step >= step;
    const li = el('li', 'relative flex gap-4 pb-8 last:pb-0');
    if (index < TRACK_STEPS.length - 1) {
      li.append(el('span', `absolute top-8 left-[15px] h-[calc(100%-2rem)] w-0.5 ${progress.step > step ? 'bg-emerald-400' : 'bg-slate-200'}`));
    }
    const dot = el('span', `relative grid h-8 w-8 shrink-0 place-items-center rounded-full ${done ? 'bg-emerald-500 text-white' : 'bg-white text-slate-300 ring-2 ring-slate-200'}`);
    dot.append(icon(done ? 'check' : 'clock', 'h-4 w-4'));
    li.append(dot, el('p', `pt-1 font-bold ${done ? 'text-slate-800' : 'text-slate-400'}`, label));
    timeline.append(li);
  });

  result.replaceChildren(header, timeline);
  if (progress.step === 0) {
    result.append(el('p', 'mt-6 rounded-2xl bg-slate-50 p-4 text-sm', 'Este pedido foi cancelado porque o PIX não foi pago dentro do prazo. Você pode fazer um novo pedido a qualquer momento.'));
  }
}

// ==================== ANIMAÇÕES ====================

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      entry.target.querySelectorAll('[data-count]').forEach(animateCounter);
      revealObserver.unobserve(entry.target);
    }
  },
  { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
);

function observeReveal(root = document) {
  root.querySelectorAll('.reveal:not(.in)').forEach((node) => revealObserver.observe(node));
}

function animateCounter(node) {
  const to = Number(node.dataset.count);
  const from = Number(node.dataset.countFrom ?? 0);
  if (REDUCED_MOTION) {
    node.textContent = String(to);
    return;
  }
  const duration = 1600;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - progress) ** 3;
    node.textContent = String(Math.round(from + (to - from) * eased));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function startHeroRotator() {
  const word = $('#hero-word');
  const words = ['seguidores', 'curtidas', 'visualizações', 'comentários'];
  if (REDUCED_MOTION) return;
  let index = 0;
  setInterval(() => {
    if (document.hidden || state.view !== 'home') return;
    word.classList.remove('word-in');
    word.classList.add('word-out');
    word.addEventListener(
      'animationend',
      () => {
        index = (index + 1) % words.length;
        word.textContent = words[index];
        word.classList.replace('word-out', 'word-in');
      },
      { once: true },
    );
  }, 2600);
}

function setupMotion() {
  const track = $('.marquee-track');
  const list = track.firstElementChild;
  const copy = list.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  track.append(copy);

  const bubbles = $('#cta-bubbles');
  for (let i = 0; i < 12; i++) {
    const bubble = icon('curtidas', 'bubble');
    bubble.setAttribute('fill', 'currentColor');
    const size = 14 + ((i * 7) % 18);
    Object.assign(bubble.style, {
      left: `${(i * 83) % 100}%`,
      width: `${size}px`,
      height: `${size}px`,
      animationDuration: `${6 + ((i * 5) % 6)}s`,
      animationDelay: `${-((i * 1.3) % 8)}s`,
    });
    bubbles.append(bubble);
  }

  document.addEventListener('pointermove', (event) => {
    const card = event.target.closest('.spotlight');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    card.style.setProperty('--my', `${event.clientY - rect.top}px`);
  });

  $('#back-to-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' }));
  window.addEventListener('scroll', updateHeader, { passive: true });
  window.addEventListener('resize', updateHeader, { passive: true });

  startHeroRotator();
  observeReveal();
}

function updateHeader() {
  const hero = $('#hero');
  const header = $('#site-header');
  header.setAttribute('data-dark', '');
  header.toggleAttribute('data-over-hero', state.view === 'home' && window.scrollY < hero.offsetHeight - 64);
}

// ==================== ROTEAMENTO ====================

function showView(name) {
  window.scrollTo({ top: 0 });
  state.view = name;
  if (!$('#profile-modal').classList.contains('hidden')) closeProfileModal();
  for (const view of ['home', 'product', 'order']) $(`#view-${view}`).classList.toggle('hidden', view !== name);
  updateHeader();
}

function goTo(sectionId) {
  if (state.view !== 'home') {
    state.pendingScroll = sectionId;
    location.hash = '#/';
    return;
  }
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
}

function route() {
  stopTimers();
  const hash = location.hash;
  const product = hash.match(/^#\/produto\/([a-z0-9-]{1,60})$/);
  const order = hash.match(/^#\/pedido(?:\/([0-9a-f-]{36}))?$/i);

  if (product) return renderProduct(product[1]);
  if (order) {
    document.title = 'Acompanhar pedido — Impulso Social';
    return renderOrderView(order[1]);
  }
  document.title = 'Impulso Social — Seguidores, curtidas e visualizações com entrega automática';
  return renderHome();
}

function init() {
  hydrateIcons();
  renderBenefits();
  renderFaq();
  renderFooterServices();
  setupMotion();
  $('#year').textContent = String(new Date().getFullYear());

  $$('[data-goto]').forEach((button) => button.addEventListener('click', () => {
    const network = button.dataset.network;
    if (network && state.filter !== network) {
      state.filter = network;
      if (state.products.length) {
        renderFilter();
        renderProductsGrid();
      }
    }
    goTo(button.dataset.goto);
  }));

  $$('[data-modal-close]').forEach((node) => node.addEventListener('click', () => closeProfileModal()));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#profile-modal').classList.contains('hidden')) closeProfileModal();
  });

  $('#checkout-form').addEventListener('submit', handleSubmit);
  $('#checkout-form').addEventListener('focusin', () => {
    if (state.step === 1) setStep(2);
  });
  $('#whatsapp').addEventListener('input', (e) => {
    e.target.value = formatWhatsapp(e.target.value);
  });
  $('#copy-btn').addEventListener('click', copyPixCode);
  $('#retry-btn').addEventListener('click', () => {
    resetPurchase();
    setStep(2);
    $('#purchase-area').scrollIntoView({ behavior: 'smooth' });
  });

  $('#track-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const id = $('#track-input').value.trim().toLowerCase();
    if (!UUID_RE.test(id) || location.hash === `#/pedido/${id}`) lookupOrder(id);
    else location.hash = `#/pedido/${id}`;
  });

  window.addEventListener('hashchange', route);
  route();
}

init();
