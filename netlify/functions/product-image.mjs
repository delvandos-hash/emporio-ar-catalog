/**
 * Proxy de imagens da Imarat: o navegador recebe somente uma rota do próprio catálogo.
 * Aceita exclusivamente arquivos em /uploads/products/ no host de origem configurado.
 */
import { normalizeProductImagePath } from "../../scripts/public-image-url.mjs";

const ALLOWED_ORIGIN = "https://imaratperfumaria.com";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024;

async function readBodyLimited(response, maxBytes) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (!size) return null;
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export default async (req) => {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
  };

  try {
    const baseValue = process.env.IMARAT_ORIGIN_URL;
    if (!baseValue) {
      console.warn("[product-image] config_missing", { variable: "IMARAT_ORIGIN_URL" });
      return new Response("Imagem indisponível", { status: 503, headers });
    }
    const base = new URL(baseValue);
    if (
      base.origin !== ALLOWED_ORIGIN ||
      base.pathname !== "/" ||
      base.search ||
      base.hash ||
      base.username ||
      base.password
    ) {
      console.warn("[product-image] config_invalid", {
        variable: "IMARAT_ORIGIN_URL",
        originMatches: base.origin === ALLOWED_ORIGIN,
        pathIsRoot: base.pathname === "/",
        hasSearch: Boolean(base.search),
        hasHash: Boolean(base.hash),
        hasCredentials: Boolean(base.username || base.password),
      });
      return new Response("Imagem indisponível", { status: 503, headers });
    }

    const requestUrl = new URL(req.url);
    const path = normalizeProductImagePath(requestUrl.searchParams.get("path") || "");
    if (!path) return new Response("Requisição inválida", { status: 400, headers });

    const target = new URL(path, ALLOWED_ORIGIN);
    if (target.origin !== ALLOWED_ORIGIN || target.search || target.hash || !target.pathname.startsWith("/uploads/products/")) {
      return new Response("Requisição inválida", { status: 400, headers });
    }

    const response = await fetch(target, {
      headers: { "User-Agent": "EmporioAR-Catalog/1.0", Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
      redirect: "error",
    });
    if (!response.ok) {
      console.warn("[product-image] upstream_http_error", {
        status: response.status,
        contentType: response.headers.get("content-type") || null,
        redirected: response.redirected,
      });
      return new Response("Imagem indisponível", { status: 502, headers });
    }

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      console.warn("[product-image] upstream_type_rejected", { contentType: contentType || null });
      return new Response("Tipo de arquivo não permitido", { status: 415, headers });
    }
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_BYTES) {
      console.warn("[product-image] upstream_size_rejected", { declaredSize, maxBytes: MAX_BYTES });
      return new Response("Imagem muito grande", { status: 413, headers });
    }

    const bytes = await readBodyLimited(response, MAX_BYTES);
    if (!bytes) {
      console.warn("[product-image] upstream_body_rejected", { maxBytes: MAX_BYTES });
      return new Response("Imagem inválida ou muito grande", { status: 413, headers });
    }

    console.info("[product-image] success", { contentType, bytes: bytes.byteLength });

    return new Response(bytes, {
      status: 200,
      headers: { ...headers, "Cache-Control": "public, max-age=86400", "Content-Type": contentType, "Content-Length": String(bytes.byteLength) },
    });
  } catch (error) {
    console.error("[product-image] upstream_fetch_failed", {
      errorName: error?.name || "UnknownError",
      causeCode: error?.cause?.code || null,
      causeName: error?.cause?.name || null,
    });
    return new Response("Imagem temporariamente indisponível", { status: 502, headers });
  }
};
