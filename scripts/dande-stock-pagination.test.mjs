import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

process.env.DANDE_BASE_URL = "https://dande.example/";
const { default: handler } = await import("../netlify/functions/dande-stock.mjs");

function stockRef(id) {
  return "s_" + createHash("sha256").update("acessorios|" + String(id)).digest("hex").slice(0, 24);
}

test("consulta de estoque encontra produto Dande após a página 15", async () => {
  const originalFetch = globalThis.fetch;
  const targetId = "990099";
  let categoryRequests = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/colares/") {
      categoryRequests++;
      const page = Number(url.searchParams.get("page") || 1);
      const ids = page === 20
        ? [targetId, "990091", "990092", "990093", "990094", "990095", "990096", "990097"]
        : Array.from({ length: 8 }, (_, i) => String(page * 1000 + i));
      const cards = ids.map(id => {
        const productLink = id === targetId ? '<a href="/produtos/item-teste/">' : '<a href="/produtos/outro/">';
        return productLink + '<span data-store="product-item-name-' + id + '">Produto</span></a><div data-product-id="' + id + '"></div>';
      }).join("");
      return new Response(cards, { status: 200 });
    }
    if (url.pathname === "/produtos/item-teste/") {
      const variants = JSON.stringify([{ product_id: Number(targetId), option0: "Único", stock: 5 }]).replaceAll('"', "&quot;");
      return new Response('<div data-product-id="' + targetId + '" data-variants="' + variants + '"></div>', { status: 200 });
    }
    throw new Error("URL inesperada: " + url);
  };

  try {
    const response = await handler(new Request("https://catalog.example/api/dande-stock?ref=" + stockRef(targetId) + "&category=Colares"));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.total_estoque, 5);
    assert.equal(categoryRequests, 20);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
