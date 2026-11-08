import { normalizePublicImagePath } from "../../scripts/public-image-url.mjs";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024;
function sourceBase(source) {
  const value = source === "a" ? process.env.CDN_IMAGE_BASE_URL
    : source === "b" ? process.env.CDN_IMAGE_FALLBACK_BASE_URL
    : source === "p" ? process.env.IMARAT_ORIGIN_URL : "";
  if (!value) return null;
  try {
    const base = new URL(value);
    return base.protocol === "https:" && !base.username && !base.password && !base.search && !base.hash ? base : null;
  } catch { return null; }
}
async function readBodyLimited(response, maxBytes) {
  if (!response.body) return null;
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  if (!size) return null;
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
export default async req => {
  const headers = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Cross-Origin-Resource-Policy": "same-origin" };
  try {
    const requestUrl = new URL(req.url);
    const source = requestUrl.searchParams.get("source") || "";
    const path = normalizePublicImagePath(requestUrl.searchParams.get("path") || "");
    if (!["a", "b", "p"].includes(source) || !path || (source === "p" && !path.startsWith("/uploads/products/"))) {
      return new Response("Requisição inválida", { status: 400, headers });
    }
    const base = sourceBase(source);
    if (!base) return new Response("Imagem indisponível", { status: 503, headers });
    const target = new URL(path, base.origin);
    if (target.origin !== base.origin || target.search || target.hash) return new Response("Requisição inválida", { status: 400, headers });
    const response = await fetch(target, { headers: { "User-Agent": "EmporioAR-Catalog/1.0", Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" }, redirect: "error" });
    if (!response.ok) return new Response("Imagem indisponível", { status: 502, headers });
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) return new Response("Tipo de arquivo não permitido", { status: 415, headers });
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_BYTES) return new Response("Imagem muito grande", { status: 413, headers });
    const bytes = await readBodyLimited(response, MAX_BYTES);
    if (!bytes) return new Response("Imagem inválida ou muito grande", { status: 413, headers });
    return new Response(bytes, { status: 200, headers: { ...headers, "Cache-Control": "public, max-age=86400", "Content-Type": contentType, "Content-Length": String(bytes.byteLength) } });
  } catch {
    return new Response("Imagem temporariamente indisponível", { status: 502, headers });
  }
};
