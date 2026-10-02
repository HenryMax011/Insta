const HANDLE = /^@?([A-Za-z0-9._]{1,30})$/;

const ALLOWED_HOSTS = {
  instagram: ['instagram.com', 'www.instagram.com', 'm.instagram.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
};

const POST_PATH = {
  instagram: /^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/,
  tiktok: /^\/(@[A-Za-z0-9._]+\/video\/\d+|[A-Za-z0-9]+)\/?$/,
};

const PROFILE_PATH = {
  instagram: /^\/([A-Za-z0-9._]{1,30})\/?$/,
  tiktok: /^\/@([A-Za-z0-9._]{1,30})\/?$/,
};

const profileUrl = (network, handle) =>
  network === 'instagram' ? `https://www.instagram.com/${handle}/` : `https://www.tiktok.com/@${handle}`;

/**
 * Converte o que o cliente digitou (@usuario ou URL) em uma URL canônica da rede.
 * Retorna null quando o valor não corresponde ao tipo de link exigido pelo serviço.
 */
export function normalizeTarget(raw, network, linkType) {
  if (linkType === 'perfil_ou_post') {
    return normalizeTarget(raw, network, 'post') ?? normalizeTarget(raw, network, 'perfil');
  }

  const value = raw.trim();
  if (/\s/.test(value)) return null;

  if (linkType === 'perfil') {
    const handle = value.match(HANDLE);
    if (handle) return profileUrl(network, handle[1]);
  }

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  if (!ALLOWED_HOSTS[network]?.includes(url.hostname.toLowerCase())) return null;
  if (url.username || url.password || url.port) return null;

  if (linkType === 'perfil') {
    const match = url.pathname.match(PROFILE_PATH[network]);
    return match ? profileUrl(network, match[1]) : null;
  }

  if (!POST_PATH[network].test(url.pathname)) return null;
  return `https://${url.hostname.toLowerCase()}${url.pathname}`;
}
