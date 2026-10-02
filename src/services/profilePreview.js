import { logger } from '../utils/logger.js';

// Instagram e TikTok só entregam os dados públicos do perfil no HTML para crawlers conhecidos.
const CRAWLER_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TIMEOUT_MS = 6000;
const TOTAL_TIMEOUT_MS = 12_000;
const MAX_IMAGE_BYTES = 400_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;

const IMAGE_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com'];
const TIKTOK_HOSTS = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'];

const cache = new Map();

async function fetchText(url, userAgent) {
  const res = await fetch(url, {
    headers: { 'user-agent': userAgent, 'accept-language': 'pt-BR,pt;q=0.9' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, url: res.url, html: await res.text() };
}

const decodeEntities = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

function meta(html, property) {
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)="${property}"[^>]+content="([^"]*)"`));
  return match ? decodeEntities(match[1]) : null;
}

function jsonField(source, key) {
  const match = source.match(new RegExp(`"${key}":("(?:[^"\\\\]|\\\\.)*"|-?\\d+|true|false|null)`));
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

function isAllowedImage(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && IMAGE_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// Devolve a imagem como data URI: o CDN das redes bloqueia hotlink e a CSP só libera data: para imagens externas.
async function toDataUri(url) {
  if (!url || !isAllowedImage(url)) return null;
  try {
    const res = await fetch(url, { headers: { 'user-agent': BROWSER_UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^image\/(jpeg|png|webp|gif)/.test(type)) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) return null;
    return `data:${type.split(';')[0]};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function parseCount(text) {
  if (!text) return null;
  const digits = text.replace(/[.,]/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

async function instagramProfile(username) {
  const { status, html } = await fetchText(`https://www.instagram.com/${username}/`, CRAWLER_UA);
  if (status === 404) return { status: 'not_found' };

  const start = html.indexOf('"xig_user_by_igid_v2":{');
  const block = start >= 0 ? html.slice(start, start + 8000) : html;
  const found = jsonField(block, 'username');
  const isPrivate = jsonField(block, 'is_private');
  if (typeof found !== 'string' || found.toLowerCase() !== username.toLowerCase() || typeof isPrivate !== 'boolean') {
    return { status: html.includes('og:title') ? 'unavailable' : 'not_found' };
  }

  const posts = (meta(html, 'og:description') ?? '').match(/([\d.,]+)\s+(?:posts|publica)/i)?.[1];
  return {
    status: 'ok',
    username: found,
    fullName: jsonField(block, 'full_name') || null,
    verified: jsonField(block, 'is_verified') === true,
    isPrivate,
    followers: jsonField(block, 'follower_count') ?? null,
    following: jsonField(block, 'following_count') ?? null,
    posts: parseCount(posts),
    avatarUrl: jsonField(block, 'profile_pic_url') ?? null,
  };
}

async function tiktokProfile(username) {
  const { status, html } = await fetchText(`https://www.tiktok.com/@${username}`, BROWSER_UA);
  if (status === 404) return { status: 'not_found' };

  const raw = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/)?.[1];
  let info;
  try {
    info = JSON.parse(raw).__DEFAULT_SCOPE__['webapp.user-detail'];
  } catch {
    return { status: 'unavailable' };
  }
  const user = info?.userInfo?.user;
  if (!user?.uniqueId) return { status: info?.statusCode ? 'not_found' : 'unavailable' };

  const stats = info.userInfo.stats ?? {};
  return {
    status: 'ok',
    username: user.uniqueId,
    fullName: user.nickname || null,
    verified: user.verified === true,
    isPrivate: user.privateAccount === true,
    followers: stats.followerCount ?? null,
    following: stats.followingCount ?? null,
    posts: stats.videoCount ?? null,
    avatarUrl: user.avatarMedium ?? user.avatarThumb ?? null,
  };
}

/** Descobre o @ dono do link (já normalizado por normalizeTarget) e, se for publicação, a miniatura dela. */
async function resolveTarget(link, network) {
  const url = new URL(link);

  if (network === 'instagram') {
    const profile = url.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/$/);
    if (profile) return { username: profile[1] };

    const { html } = await fetchText(link, CRAWLER_UA);
    const owner = (meta(html, 'og:url') ?? '').match(/instagram\.com\/([A-Za-z0-9._]{1,30})\/(?:p|reel|tv)\//)?.[1];
    return owner ? { username: owner, postThumbUrl: meta(html, 'og:image') } : null;
  }

  let path = url.pathname;
  if (!path.startsWith('/@')) {
    const { url: finalUrl } = await fetchText(link, BROWSER_UA);
    const resolved = new URL(finalUrl);
    if (!TIKTOK_HOSTS.includes(resolved.hostname)) return null;
    path = resolved.pathname;
  }
  const handle = path.match(/^\/@([A-Za-z0-9._]{1,30})(?:\/|$)/)?.[1];
  return handle ? { username: handle, isPost: path.includes('/video/') } : null;
}

async function lookup(link, network) {
  const target = await resolveTarget(link, network);
  if (!target) return { status: 'unavailable' };

  const profile = await (network === 'instagram' ? instagramProfile : tiktokProfile)(target.username);
  if (profile.status !== 'ok') return { ...profile, username: target.username };

  const { avatarUrl, ...data } = profile;
  const [avatar, postThumb] = await Promise.all([toDataUri(avatarUrl), toDataUri(target.postThumbUrl)]);
  return { ...data, avatar, postThumb, isPost: Boolean(target.postThumbUrl || target.isPost) };
}

/**
 * Prévia pública do perfil para o cliente confirmar que o link é dele e que o perfil está aberto.
 * Nunca lança: falhas de rede ou bloqueio das redes viram { status: 'unavailable' }.
 */
export async function getProfilePreview(link, network, { fresh = false } = {}) {
  const key = `${network}:${link}`;
  const cached = cache.get(key);
  if (!fresh && cached && cached.expires > Date.now()) return cached.value;

  let value;
  try {
    value = await Promise.race([
      lookup(link, network),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo esgotado')), TOTAL_TIMEOUT_MS)),
    ]);
  } catch (err) {
    logger.warn('Falha ao consultar prévia do perfil', { network, error: err.message });
    value = { status: 'unavailable' };
  }
  value = { network, ...value };

  if (value.status !== 'unavailable') {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  }
  return value;
}
