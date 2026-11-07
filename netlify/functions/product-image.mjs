/**
 * Proxy de imagens da Imarat: o navegador recebe somente uma rota do próprio catálogo.
 * Aceita exclusivamente arquivos em /uploads/products/ no host de origem configurado.
 */
const ALLOWED_ORIGIN_HOST = "imaratperfumaria.com";
const ALLOWED_PATH_PREFIX = "/uploads/products/";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024;

export default async (req) => {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=86400",
    "Cross-Origin-Resource-Policy": "same-origin",
  };

  try {
    const baseValue = process.env.IMARAT_ORIGIN_URL;
    if (!baseValue) return new Response("Imagem indisponível", { status: 503, headers });
    const base = new URL(baseValue);
    if (base.protocol !== "https:" || base.hostname.toLowerCase() !== ALLOWED_ORIGIN_HOST) {
      return new Response("Imagem indisponível", { status: 503, headers });
    }

    const requestUrl = new URL(req.url);
    const path = requestUrl.searchParams.get("path") || "";
    if (!path.startsWith(ALLOWED_PATH_PREFIX) || path.includes("\\") || path.includes("..")) {
      return new Response("Requisição inválida", { status: 400, headers });
    }

    const target = new URL(path, base.origin);
    if (target.origin !== base.origin || target.search || target.hash) {
      return new Response("Requisição inválida", { status: 400, headers });
    }

    const response = await fetch(target, {
      headers: { "User-Agent": "EmporioAR-Catalog/1.0", Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
      redirect: "error",
    });
    if (!response.ok) return new Response("Imagem indisponível", { status: 502, headers });

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) return new Response("Tipo de arquivo não permitido", { status: 415, headers });

    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) {
      return new Response("Imagem inválida", { status: 413, headers });
    }

    return new Response(bytes, {
      status: 200,
      headers: { ...headers, "Content-Type": contentType, "Content-Length": String(bytes.byteLength) },
    });
  } catch {
    return new Response("Imagem temporariamente indisponível", { status: 502, headers });
  }
};
