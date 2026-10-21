/**
 * GET /api/dande-stock?id=PRODUCT_ID
 * Estoque ao vivo Dande Joias (Nuvemshop)
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

export default async (req) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=30",
  };
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return new Response(JSON.stringify({ erro: "id obrigatório" }), {
        status: 400,
        headers,
      });
    }

    // Busca página de produto via search na loja (listing com data-product-id)
    // Tentativa: página de busca por id não existe; usamos sitemap-like product URL from storefront
    // Estratégia: fetch search all and find - too heavy.
    // Better: product pages are at /produtos/SLUG/ - we don't have slug.
    // Use Nuvemshop storefront search API if available.

    const searchUrl = `https://dandejoias.com/search/?q=${encodeURIComponent(id)}`;
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    const html = await res.text();

    // Find product block with matching id
    const re = new RegExp(
      `data-product-id=["']${id}["'][\\s\\S]{0,4000}?data-variants="([^"]*)"`,
      "i"
    );
    let m = html.match(re);
    // alternate order: variants before id nearby
    if (!m) {
      const idx = html.indexOf(`data-product-id="${id}"`);
      if (idx >= 0) {
        const chunk = html.slice(Math.max(0, idx - 500), idx + 5000);
        const vm = chunk.match(/data-variants="([^"]*)"/);
        if (vm) m = [null, vm[1]];
      }
    }

    if (!m) {
      return new Response(
        JSON.stringify({ erro: "produto não encontrado", id }),
        { status: 404, headers }
      );
    }

    let variants = [];
    try {
      variants = JSON.parse(decodeEntities(m[1]));
    } catch {
      return new Response(
        JSON.stringify({ erro: "variantes inválidas", id }),
        { status: 500, headers }
      );
    }

    const variacoes = (variants || []).map((v) => {
      const opts = [v.option0, v.option1, v.option2].filter(Boolean);
      return {
        id: String(v.id || ""),
        nome: opts.length ? opts.join(" / ") : v.sku || "Único",
        sku: v.sku || "",
        estoque: Number(v.stock) || 0,
      };
    });
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
