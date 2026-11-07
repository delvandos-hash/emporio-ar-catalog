/**
 * GET /api/dande-stock?id=PRODUCT_ID&url=PRODUCT_PATH
 * Estoque ao vivo Dande Joias (Nuvemshop)
 * Preferir `url` (página do produto). Fallback: busca por id.
 */
import { createHash } from "node:crypto";

const DANDE_BASE = process.env.DANDE_BASE_URL;
const DANDE_CATEGORIES = [
  { path: "/acessorios-de-cabelos/", nome: "Acessórios de Cabelo" },
  { path: "/aneis1/", nome: "Anéis" },
  { path: "/braceletes/", nome: "Braceletes" },
  { path: "/brincos/", nome: "Brincos" },
  { path: "/colares/", nome: "Colares" },
  { path: "/conjuntos/", nome: "Conjuntos" },
  { path: "/lancamentos/", nome: "Lançamentos" },
  { path: "/masculinos/", nome: "Masculinos" },
  { path: "/prata-925/", nome: "Prata 925" },
  { path: "/pulseiras/", nome: "Pulseiras" },
  { path: "/semijoia-italiana/", nome: "Semijoia Italiana" },
  { path: "/tornozeleiras/", nome: "Tornozeleiras" },
];
function makeStockRef(id) {
  return "s_" + createHash("sha256").update("acessorios|" + String(id)).digest("hex").slice(0, 24);
}
function normCategory(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function findProductUrl(html, id) {
  const namePos = html.indexOf(`data-store="product-item-name-${id}"`);
  if (namePos < 0) return "";
  const window = html.slice(Math.max(0, namePos - 3000), namePos + 400);
  const match = window.match(/href="((?:https:\/\/dandejoias\.com)?\/produtos\/[^"]+)"/i);
  if (!match) return "";
  return match[1].startsWith("/") ? new URL(match[1], DANDE_BASE).toString() : match[1];
}
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
  if (id) {
    const idx = html.indexOf(`data-product-id="${id}"`);
    if (idx >= 0) {
      const chunk = html.slice(Math.max(0, idx - 800), idx + 12000);
      const vm = chunk.match(/data-variants="([^"]*)"/);
      if (vm) {
        try { return JSON.parse(decodeEntities(vm[1])); } catch {}
      }
    }
  }
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
    try { return JSON.parse(decodeEntities(all[0][1])); } catch {}
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
    const stockRef = urlObj.searchParams.get("ref") || "";
    const category = urlObj.searchParams.get("category") || "";
    let productUrl = urlObj.searchParams.get("url") || "";

    if (!DANDE_BASE) throw new Error("Origem de acessórios não configurada no ambiente privado.");
    if (!id && !productUrl && !stockRef) {
      return new Response(JSON.stringify({ erro: "id ou url obrigatório" }), { status: 400, headers });
    }

    if (productUrl) {
      try { productUrl = decodeURIComponent(productUrl); } catch {}
      if (productUrl.startsWith("//")) productUrl = "https:" + productUrl;
      if (!productUrl.startsWith("http")) {
        productUrl = new URL(productUrl.replace(/^\//, ""), DANDE_BASE + "/").toString();
      }
    }

    let html = "";
    let resolvedId = id || "";
    if (stockRef && !productUrl) {
      const wantedCategory = normCategory(category);
      const filteredCategories = wantedCategory
        ? DANDE_CATEGORIES.filter((item) => normCategory(item.nome) === wantedCategory)
        : DANDE_CATEGORIES;
      const categories = filteredCategories.length ? filteredCategories : DANDE_CATEGORIES;
      for (const cat of categories) {
        for (let page = 1; page <= 15; page++) {
          const pageUrl = page === 1
            ? new URL(cat.path, DANDE_BASE).toString()
            : new URL(cat.path + "?page=" + page, DANDE_BASE).toString();
          const pageRes = await fetch(pageUrl, {
            headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "pt-BR,pt;q=0.9" },
            redirect: "error",
          });
          if (!pageRes.ok) break;
          const pageHtml = await pageRes.text();
          const ids = [...pageHtml.matchAll(/data-product-id="(\d+)"/g)].map((m) => m[1]);
          if (!ids.length) break;
          const matchId = ids.find((candidate) => makeStockRef(candidate) === stockRef);
          if (matchId) {
            resolvedId = matchId;
            productUrl = findProductUrl(pageHtml, matchId);
            html = pageHtml;
            break;
          }
          if (ids.length < 8) break;
        }
        if (resolvedId) break;
      }
    }
    if (productUrl) {
      const parsedProductUrl = new URL(productUrl);
      if (parsedProductUrl.origin !== new URL(DANDE_BASE).origin) throw new Error("URL de produto inválida.");
      const res = await fetch(productUrl, {
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "pt-BR,pt;q=0.9" },
        redirect: "error",
      });
      if (res.ok) html = await res.text();
    }

    if (!html && id) {
      const searchUrl = new URL("/search/", DANDE_BASE);
      searchUrl.searchParams.set("q", id);
      const res = await fetch(searchUrl, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        redirect: "error",
      });
      if (res.ok) html = await res.text();
    }

    if (!html) {
      return new Response(JSON.stringify({ erro: "página não carregou", id }), { status: 502, headers });
    }

    const variants = parseVariantsFromHtml(html, resolvedId);
    if (!variants) {
      return new Response(JSON.stringify({ erro: "produto não encontrado", id }), { status: 404, headers });
    }

    const variacoes = toVariacoes(variants);
    const total = variacoes.reduce((s, v) => s + v.estoque, 0);

    return new Response(
      JSON.stringify({ id: stockRef || resolvedId, total_estoque: total, variacoes, atualizado_em: new Date().toISOString() }),
      { status: 200, headers }
    );
  } catch {
    return new Response(JSON.stringify({ erro: "falha inesperada" }), { status: 500, headers });
  }
};
