/**
 * GET /api/roupas-stock?id=PRODUCT_ID
 * Estoque ao vivo Roupas — Sophia Moda e Franny (FacilZap)
 * id pode vir como "123" (Sophia) ou "franny-123" (Franny)
 */
const SOURCES = {
  sophia: {
    // tenta domínio próprio e, se cair, FacilZap
    bases: [
      "https://sophiamoda.com.br",
      "https://facilzap.app.br/sophiamodafemi",
    ],
    base: "https://sophiamoda.com.br",
    loja: "lojavendedoras",
    categories: ["108042", "108328", "108333", "108339", "108338", "379539"],
  },
  franny: {
    base: "https://frannyloja.com.br",
    loja: "62999336607",
    categories: [
      "265229", // Vestido
      "265231", // Conjunto
      "347434", // Blusa
      "265225", // Cropped
      "304447", // Calça
      "265226", // Short
      "265230", // Short Saia
      "265227", // Saia
      "265228", // Body
      "266049", // Jaqueta
    ],
  },
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function parseId(raw) {
  const s = String(raw || "").trim();
  if (s.toLowerCase().startsWith("franny-")) {
    return { source: "franny", id: s.slice(7) };
  }
  return { source: "sophia", id: s };
}

async function warmUp(src) {
  try {
    const res = await fetch(`${src.base}/c/atacado/${src.loja}`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    const cookies = [];
    const list = res.headers.getSetCookie?.() || [];
    for (const c of list) cookies.push(c.split(";")[0]);
    if (!cookies.length) {
      const one = res.headers.get("set-cookie");
      if (one) cookies.push(one.split(";")[0]);
    }
    await res.text().catch(() => {});
    return cookies.join("; ");
  } catch {
    return "";
  }
}

async function fetchCategoryPage(src, catId, page, cookie) {
  const url = `${src.base}/c/atacado/carregar_produtos/${page}/${catId}/${src.loja}?mobile=0`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: src.base.includes("facilzap") ? "https://facilzap.app.br" : src.base,
      Referer: `${src.base}/c/atacado/${src.loja}`,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Cookie: cookie || "",
    },
    body: "",
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text || text.trimStart().startsWith("<") || text.includes("window.location")) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildVariacoes(found) {
  const estoqueMap = found.estoque || {};
  const varDict = found.variacoes || {};
  const variacoes = Object.entries(varDict).map(([vid, vinfo]) => ({
    id: String(vid),
    nome: ((vinfo && vinfo.nome) || "").trim() || String(vid),
    cor: (vinfo && vinfo.cor) || null,
    estoque: Number(estoqueMap[vid] ?? estoqueMap[String(vid)] ?? 0) || 0,
  }));
  const total =
    Number(found.total_estoque) ||
    variacoes.reduce((s, v) => s + v.estoque, 0);
  return { variacoes, total };
}

export default async (req) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=20",
  };

  try {
    const url = new URL(req.url);
    const rawId = url.searchParams.get("id");
    if (!rawId) {
      return new Response(JSON.stringify({ erro: "id obrigatório" }), {
        status: 400,
        headers,
      });
    }

    const { source, id } = parseId(rawId);
    const src = SOURCES[source];
    if (!src || !id) {
      return new Response(JSON.stringify({ erro: "fonte/id inválidos", rawId }), {
        status: 400,
        headers,
      });
    }

    const bases =
      source === "sophia" && Array.isArray(src.bases) && src.bases.length
        ? src.bases
        : [src.base];

    for (const base of bases) {
      const srcTry = { ...src, base };
      const cookie = await warmUp(srcTry);
      let baseUsable = false;

      for (const catId of srcTry.categories) {
        for (let page = 1; page <= 5; page++) {
          let data;
          try {
            data = await fetchCategoryPage(srcTry, catId, page, cookie);
          } catch {
            data = null;
          }
          if (!data) break;
          baseUsable = true;
          const produtos = data.produtos || [];
          if (!produtos.length) break;

          const found = produtos.find((p) => String(p.id) === String(id));
          if (found) {
            const { variacoes, total } = buildVariacoes(found);
            return new Response(
              JSON.stringify({
                id: String(found.id),
                id_origem: source === "franny" ? `franny-${found.id}` : String(found.id),
                fonte: source,
                base,
                nome: found.nome,
                total_estoque: total,
                variacoes,
                atualizado_em: new Date().toISOString(),
              }),
              { status: 200, headers }
            );
          }

          if (produtos.length < 5) break;
        }
      }

      if (baseUsable) {
        for (let page = 1; page <= 8; page++) {
          let data;
          try {
            data = await fetchCategoryPage(srcTry, "todas", page, cookie);
          } catch {
            data = null;
          }
          if (!data) break;
          const produtos = data.produtos || [];
          if (!produtos.length) break;
          const found = produtos.find((p) => String(p.id) === String(id));
          if (found) {
            const { variacoes, total } = buildVariacoes(found);
            return new Response(
              JSON.stringify({
                id: String(found.id),
                id_origem: source === "franny" ? `franny-${found.id}` : String(found.id),
                fonte: source,
                base,
                nome: found.nome,
                total_estoque: total,
                variacoes,
                atualizado_em: new Date().toISOString(),
              }),
              { status: 200, headers }
            );
          }
          if (produtos.length < 5) break;
        }
        // base respondeu mas produto não achado — não tenta FacilZap à toa
        break;
      }
      // base não respondeu JSON → tenta próxima
    }

    return new Response(
      JSON.stringify({ erro: "produto não encontrado", id, fonte: source }),
      { status: 404, headers }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ erro: "falha", mensagem: error.message }),
      { status: 500, headers }
    );
  }
};
