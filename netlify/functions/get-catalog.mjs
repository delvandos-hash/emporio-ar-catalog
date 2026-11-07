/**
 * API /api/catalogo — busca o catálogo no Gist e remove dados internos
 * antes de entregar qualquer conteúdo ao navegador.
 */
const GIST_RAW_URL =
  "https://gist.githubusercontent.com/delvandos-hash/11918b7196b3ee6a0d8a91739167b312/raw/catalogo.json";

const PRIVATE_KEYS = new Set([
  "original", "custo", "precocusto", "preco_custo", "cost", "costprice",
  "precobase", "preco_base", "baseprice", "sourceurl", "supplierurl",
  "fornecedorurl", "urlfornecedor"
]);

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;

  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (PRIVATE_KEYS.has(normalizedKey)) continue;

    if (normalizedKey === "urlorigem" && typeof child === "string") {
      const raw = child.trim();
      if (/^(https?:)?\/\//i.test(raw)) {
        try {
          const parsed = new URL(raw.startsWith("//") ? "https:" + raw : raw);
          clean[key] = parsed.pathname + parsed.search;
        } catch {
          // URL absoluta inválida: omite em vez de devolver o valor original.
        }
      } else {
        clean[key] = raw;
      }
      continue;
    }

    clean[key] = sanitize(child);
  }
  return clean;
}

function jsonResponse(payload, status, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=60" : "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

export default async () => {
  try {
    const response = await fetch(GIST_RAW_URL, {
      headers: { "User-Agent": "EmporioAR-Catalog/1.0" },
      redirect: "error"
    });

    if (!response.ok) {
      return jsonResponse({ erro: "Catálogo temporariamente indisponível." }, 502);
    }

    const data = await response.json();
    return jsonResponse(sanitize(data), 200);
  } catch {
    // Não expõe URL de origem, status interno, stack ou mensagem do provedor.
    return jsonResponse({ erro: "Catálogo temporariamente indisponível." }, 502);
  }
};
