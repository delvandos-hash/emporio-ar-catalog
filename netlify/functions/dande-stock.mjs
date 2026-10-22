/**
 * GET /api/dande-stock?id=PRODUCT_ID&url=https://dandejoias.com/produtos/...
 * Estoque ao vivo Dande Joias (Nuvemshop)
 * Preferir `url` (página do produto). Fallback: busca por id.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function decodeEntities(s) {
  return String(s || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

function parseVariantsFromHtml(html, id) {
  // 1) data-variants near product id
  if (id) {
    const idx = html.indexOf(`data-product-id="${id}"`);
    if (idx >= 0) {
      const chunk = html.slice(Math.max(0, idx - 800), idx + 12000);
      const vm = chunk.match(/data-variants="([^"]*)"/);
      if (vm) {
        try {
          return JSON.parse(decodeEntities(vm[1]));
        } catch {}
      }
    }
  }
  // 2) any data-variants on product page (detail page usually one product)
  const all = [...html.matchAll(/data-variants="([^"]*)"/g)];
  for (const m of all) {
    try {
      const variants = JSON.parse(decodeEntities(m[1]));
      if (Array.isArray(variants) && variants.length) {
        if (!id) return variants;
        if (variants.some((v) => String(v.product_id) === String(id))) return variants;
      }
    } catch {}
  }
  if (all.length) {
    try {
      return JSON.parse(decodeEntities(all[0][1]));
    } catch {}
  }
  return null;
}

function toVariacoes(variants) {
  return (variants || []).map((v) => {
    const opts = [v.option0, v.option1, v.option2].filter(Boolean);
    return {
      id: String(v.id || ""),
      nome: opts.length ? opts.join(" / ") : v.sku || "Único",
      sku: v.sku || "",
      estoque: Number(v.stock) || 0,
    };
  });
}

export default async (req) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=20",
  };

  try {
    const urlObj = new URL(req.url);
    const id = urlObj.searchParams.get("id");
    let productUrl = urlObj.searchParams.get("url") || "";

    if (!id && !productUrl) {
      return new Response(JSON.stringify({ erro: "id ou url obrigatório" }), {
        status: 400,
        headers,
      });
    }

    if (productUrl) {
      try {
        productUrl = decodeURIComponent(productUrl);
      } catch {}
      if (productUrl.startsWith("//")) productUrl = "https:" + productUrl;
      if (!productUrl.startsWith("http")) {
        productUrl = "https://dandejoias.com/" + productUrl.replace(/^\//, "");
      }
    }

    let html = "";
    if (productUrl && productUrl.includes("dandejoias.com")) {
      const res = await fetch(productUrl, {
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "pt-BR,pt;q=0.9" },
      });
      if (res.ok) html = await res.text();
    }

    // Fallback search by id
    if (!html && id) {
      const searchUrl = `https://dandejoias.com/search/?q=${encodeURIComponent(id)}`;
      const res = await fetch(searchUrl, {
        headers: { "User-Agent": UA, Accept: "text/html" },
      });
      if (res.ok) html = await res.text();
    }

    if (!html) {
      return new Response(JSON.stringify({ erro: "página não carregou", id, url: productUrl }), {
        status: 502,
        headers,
      });
    }

    const variants = parseVariantsFromHtml(html, id);
    if (!variants) {
      return new Response(
        JSON.stringify({ erro: "produto não encontrado", id, url: productUrl }),
        { status: 404, headers }
      );
    }

    const variacoes = toVariacoes(variants);
    const total = variacoes.reduce((s, v) => s + v.estoque, 0);

    return new Response(
      JSON.stringify({
        id,
        total_estoque: total,
        variacoes,
        atualizado_em: new Date().toISOString(),
      }),
      { status: 200, headers }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ erro: "falha", mensagem: error.message }),
      { status: 500, headers }
    );
  }
};
