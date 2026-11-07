const PROXY_ORIGIN = "https://catalogo-interno.invalid";
const IMAGE_SOURCES = new Set(["a", "b", "p"]);

function safeBase(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash ? url : null;
  } catch { return null; }
}

export function normalizePublicImagePath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return "";
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { return ""; }
  if (decoded.includes("%") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded) ||
      decoded.includes("?") || decoded.includes("#") ||
      decoded.split("/").some((part) => part === "." || part === "..") || decoded.length > 2048) return "";
  return decoded;
}

export function normalizeProductImagePath(value) {
  const path = normalizePublicImagePath(value);
  return path.startsWith("/uploads/products/") ? path : "";
}

export function sanitizePublicImageUrl(value, options = {}) {
  if (typeof value !== "string" || !value.trim()) return "";
  const primary = safeBase(options.cdnBase ?? process.env.CDN_IMAGE_BASE_URL ?? "");
  const secondary = safeBase(options.cdnFallbackBase ?? process.env.CDN_IMAGE_FALLBACK_BASE_URL ?? "");
  const product = safeBase(options.productBase ?? process.env.IMARAT_ORIGIN_URL ?? "");
  try {
    const raw = value.trim();
    const existing = new URL(raw, PROXY_ORIGIN);
    if (existing.origin === PROXY_ORIGIN && existing.pathname === "/api/product-image") {
      const source = existing.searchParams.get("source") || "";
      const path = normalizePublicImagePath(existing.searchParams.get("path") || "");
      if (!IMAGE_SOURCES.has(source) || !path || (source === "p" && !path.startsWith("/uploads/products/"))) return "";
      return "/api/product-image?source=" + source + "&path=" + encodeURIComponent(path);
    }
    let url;
    if (/^https:\/\//i.test(raw)) url = new URL(raw);
    else if (raw.startsWith("/uploads/products/") && product) url = new URL(raw, product.origin);
    else if (primary) url = new URL(raw, primary);
    else return "";
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return "";
    for (const [source, base] of [["p", product], ["a", primary], ["b", secondary]]) {
      if (!base || url.origin !== base.origin) continue;
      const path = normalizePublicImagePath(url.pathname);
      if (!path || (source === "p" && !path.startsWith("/uploads/products/"))) return "";
      return "/api/product-image?source=" + source + "&path=" + encodeURIComponent(path);
    }
    return "";
  } catch { return ""; }
}
