/**
 * Validação das imagens públicas do catálogo.
 * CDNs autorizados carregam diretamente; imagens da Imarat usam proxy same-origin.
 */
const CDN_HOSTS = new Set([
  "arquivos-cdn.facilzap.app.br",
  "acdn-us.mitiendanube.com",
]);
const PROXY_ORIGIN = "https://catalogo-interno.invalid";

export function sanitizePublicImageUrl(value, options = {}) {
  if (typeof value !== "string" || !value.trim()) return "";
  const cdnBase = options.cdnBase ?? process.env.CDN_IMAGE_BASE_URL ?? "";

  try {
    const raw = value.trim();
    const proxyUrl = new URL(raw, PROXY_ORIGIN);
    if (proxyUrl.origin === PROXY_ORIGIN && proxyUrl.pathname === "/api/product-image") {
      const path = proxyUrl.searchParams.get("path") || "";
      if (!path.startsWith("/uploads/products/") || path.includes("\\") || path.includes("..")) return "";
      return proxyUrl.pathname + "?path=" + encodeURIComponent(path);
    }

    const base = cdnBase ? (cdnBase.endsWith("/") ? cdnBase : cdnBase + "/") : undefined;
    const url = base ? new URL(raw, base) : new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return "";

    if (url.hostname.toLowerCase() === "imaratperfumaria.com") {
      if (!url.pathname.startsWith("/uploads/products/") || url.search) return "";
      return "/api/product-image?path=" + encodeURIComponent(url.pathname);
    }

    if (!CDN_HOSTS.has(url.hostname.toLowerCase())) return "";
    return url.toString();
  } catch {
    return "";
  }
}
