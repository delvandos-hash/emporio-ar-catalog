import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

test("estoque Dande localiza produto na página 16 da categoria", async () => {
  const previousBase = process.env.DANDE_BASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.DANDE_BASE_URL = "https://dande.example";

  try {
    const { default: handler } = await import("../netlify/functions/dande-stock.mjs?pagination-regression");
    const productId = "990016";
    const stockRef = "s_" + createHash("sha256")
      .update("acessorios|" + productId)
      .digest("hex")
      .slice(0, 24);
    const requested = [];

    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      requested.push(url.href);

      if (url.pathname === "/brincos/") {
        const page = Number(url.searchParams.get("page") || "1");
        const ids = Array.from({ length: 12 }, (_, index) =>
          page === 16 && index === 11 ? productId : String(800000 + page * 100 + index)
        );
        const cards = ids.map((id) => id === productId
          ? `<a href="/produtos/produto-teste/"><div data-store="product-item-name-${id}">Brinco Teste</div></a><div data-product-id="${id}"></div>`
          : `<div data-product-id="${id}"></div>`
        ).join("");
        return new Response(cards, { status: 200 });
      }

      if (url.pathname === "/produtos/produto-teste/") {
        const detail = `<div data-product-id="${productId}" data-variants="[{&quot;id&quot;:&quot;variant-1&quot;,&quot;product_id&quot;:&quot;${productId}&quot;,&quot;option0&quot;:&quot;P&quot;,&quot;stock&quot;:3}]"></div>`;
        return new Response(detail, { status: 200 });
      }

      return new Response("", { status: 404 });
    };

    const response = await handler(new Request(
      `https://catalog.example/api/dande-stock?ref=${stockRef}&category=Brincos`
    ));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.total_estoque, 3);
    assert.ok(requested.some((value) => {
      const url = new URL(value);
      return url.pathname === "/brincos/" && url.searchParams.get("page") === "16";
    }), "a busca deve alcançar a página 16");
    assert.ok(requested.includes("https://dande.example/produtos/produto-teste/"));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBase === undefined) delete process.env.DANDE_BASE_URL;
    else process.env.DANDE_BASE_URL = previousBase;
  }
});
