/**
 * Validação centralizada das imagens públicas do catálogo.
 * Aceita somente HTTPS e hosts de CDN explicitamente aprovados.
 */
function normalizeHost(value) {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function sanitizePublicImageUrl(value, options = {}) {
  if (typeof value !== "string" || !value.trim()) return "";
  const cdnBase = options.cdnBase ?? process.env.CDN_IMAGE_BASE_URL ?? "";
  const configuredHosts = options.allowedHosts
    ?? (process.env.PUBLIC_IMAGE_HOSTS || "").split(",").map((host) => host.trim()).filter(Boolean);
  const allowedHosts = new Set(configuredHosts.map(normalizeHost).filter(Boolean));
  const cdnHost = cdnBase ? normalizeHost(cdnBase) : "";
  if (cdnHost) allowedHosts.add(cdnHost);

  try {
    const raw = value.trim();
    const base = cdnBase ? (cdnBase.endsWith("/") ? cdnBase : cdnBase + "/") : undefined;
    const url = base ? new URL(raw, base) : new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (!allowedHosts.has(url.hostname.toLowerCase())) return "";
    return url.toString();
  } catch {
    return "";
  }
}
