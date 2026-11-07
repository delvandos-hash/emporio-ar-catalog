/**
 * Validação das imagens públicas do catálogo.
 * CDNs autorizados carregam diretamente; imagens da Imarat usam proxy same-origin.
 */
const CDN_HOSTS = new Set([
  "arquivos-cdn.facilzap.app.br",
  "acdn-us.mitiendanube.com",
]);
const PROXY_ORIGIN = "https://catalogo-interno.invalid";
const PRODUCT_PATH_PREFIX = "/uploads/products/";

export function normalizeProductImagePath(value) {
  if (typeof value !== "string" || !value.startsWith(PRODUCT_PATH_PREFIX)) return "";
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "";
  }
  if (
    decoded.includes("%") ||
    decoded.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(decoded) ||
    decoded.split("/").some((part) => part === "." || part === "..")
  ) return "";

  try {
    const url = new URL(decoded, PROXY_ORIGIN);
    if (url.origin !== PROXY_ORIGIN || url.search || url.hash || !url.pathname.startsWith(PRODUCT_PATH_PREFIX)) return "";
    return url.pathname;
  } catch {
    return "";
  }
}

export function sanitizePublicImageUrl(value, options = {}) {
  if (typeof value !== "string" || !value.trim()) return "";
  const cdnBase = options.cdnBase ?? process.env.CDN_IMAGE_BASE_URL ?? "";

  try {
    const raw = value.trim();
    const proxyUrl = new URL(raw, PROXY_ORIGIN);
    if (proxyUrl.origin === PROXY_ORIGIN && proxyUrl.pathname === "/api/product-image") {
      const path = normalizeProductImagePath(proxyUrl.searchParams.get("path") || "");
      if (!path) return "";
      return proxyUrl.pathname + "?path=" + encodeURIComponent(path);
    }

    const base = cdnBase ? (cdnBase.endsWith("/") ? cdnBase : cdnBase + "/") : undefined;
    const url = base ? new URL(raw, base) : new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return "";

    if (url.hostname.toLowerCase() === "imaratperfumaria.com") {
      if (!url.pathname.startsWith(PRODUCT_PATH_PREFIX) || url.search) return "";
      const path = normalizeProductImagePath(url.pathname);
      if (!path) return "";
      return "/api/product-image?path=" + encodeURIComponent(path);
    }

    if (!CDN_HOSTS.has(url.hostname.toLowerCase())) return "";
    return url.toString();
  } catch {
    return "";
  }
}
