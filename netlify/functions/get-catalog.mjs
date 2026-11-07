/**
 * API /api/catalogo — busca o catálogo no Gist atual
 */
export default async (req, context) => {
  const gistRawUrl =
    "https://gist.githubusercontent.com/delvandos-hash/11918b7196b3ee6a0d8a91739167b312/raw/catalogo.json";

  try {
    const response = await fetch(gistRawUrl, {
      headers: { "User-Agent": "EmporioAR-Catalog/1.0" }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          erro: "Falha ao buscar no Gist",
          status: response.status,
          statusText: response.statusText
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    const data = await response.json();
    const privateKeys = new Set(['original','custo','precocusto','preco_custo','cost','costprice','precobase','preco_base']);
    const sanitize = (value) => {
      if (Array.isArray(value)) return value.map(sanitize);
      if (!value || typeof value !== 'object') return value;
      const clean = {};
      for (const [key, child] of Object.entries(value)) {
        if (privateKeys.has(key.toLowerCase())) continue;
        if (key.toLowerCase() === 'url_origem' && typeof child === 'string') {
          try { const sourceUrl = new URL(child); clean[key] = sourceUrl.pathname + sourceUrl.search; }
          catch { clean[key] = child; }
        } else {
          clean[key] = sanitize(child);
        }
      }
      return clean;
    };
    const publicData = sanitize(data);

    return new Response(JSON.stringify(publicData), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        erro: "Falha inesperada",
        mensagem: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
};
