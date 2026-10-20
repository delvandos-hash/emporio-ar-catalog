/**
 * GET /api/roupas-stock?id=PRODUCT_ID
 * Busca estoque atualizado do produto na fonte (Sophia Moda / FacilZap)
 */
const LOJA_ID = "62982459275";
const CATEGORIES = [
  "108042", // VESTIDOS
  "108328", // MACACÃO
  "108333", // CONJUNTOS
  "108339", // BLUSA
  "108338", // CALÇA
  "379539", // URBANA JEANS
];

async function fetchCategoryPage(catId, page = 1) {
  const url = `https://sophiamoda.com.br/c/atacado/carregar_produtos/${page}/${catId}/${LOJA_ID}?mobile=0`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; EmporioAR/1.0)",
      Referer: "https://sophiamoda.com.br/",
    },
    body: JSON.stringify({ pagina_especifica: "categoria" }),
  });
  if (!res.ok) return null;
  return res.json();
}

export default async (req, context) => {
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

    // Percorre categorias até achar o produto (poucas páginas)
    for (const catId of CATEGORIES) {
      for (let page = 1; page <= 3; page++) {
        const data = await fetchCategoryPage(catId, page);
        if (!data || data.acao === "sem_mais_produtos" || !data.produtos?.length) break;

        const found = data.produtos.find((p) => String(p.id) === String(id));
        if (found) {
          const estoqueMap = found.estoque || {};
          const varDict = found.variacoes || {};
          const variacoes = Object.entries(varDict).map(([vid, vinfo]) => ({
            id: vid,
            nome: (vinfo.nome || "").trim(),
            cor: vinfo.cor || null,
            estoque: Number(estoqueMap[vid] ?? estoqueMap[String(vid)] ?? 0) || 0,
          }));
          const total = Number(found.total_estoque) || variacoes.reduce((s, v) => s + v.estoque, 0);

          return new Response(
            JSON.stringify({
              id: found.id,
              nome: found.nome,
              total_estoque: total,
              variacoes,
              atualizado_em: new Date().toISOString(),
            }),
            { status: 200, headers }
          );
        }
      }
    }

    return new Response(JSON.stringify({ erro: "produto não encontrado", id }), {
      status: 404,
      headers,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ erro: "falha", mensagem: error.message }),
      { status: 500, headers }
    );
  }
};
