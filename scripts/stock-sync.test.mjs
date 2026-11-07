import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const envKeys = ["IMARAT_API_URL", "BRAND_BASE_URL"];
const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const previousFetch = globalThis.fetch;

process.env.IMARAT_API_URL = "https://primary-source.example/api/stock";
process.env.BRAND_BASE_URL = "https://secondary-source.example";

const { handler } = require("../netlify/functions/stock-sync.js");

test("snapshot público usa somente chaves neutras e mantém os dois mapas de estoque", async () => {
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.startsWith(process.env.IMARAT_API_URL)) {
      return new Response(JSON.stringify({
        total: 1,
        products: [{ name: "Perfume de teste", brand: "Marca de teste", inStock: true }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === process.env.BRAND_BASE_URL + "/c/atacado/darlanaugusto") {
      return new Response("", { status: 200 });
    }
    if (url.startsWith(process.env.BRAND_BASE_URL + "/c/atacado/carregar_produtos/1/")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("URL inesperada no teste: " + url);
  };

  try {
    const response = await handler({ httpMethod: "GET" });
    assert.equal(response.statusCode, 200);
    const payload = JSON.parse(response.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.mapA["perfume de teste|marca de teste"], "Sim");
    assert.deepEqual(payload.mapB, {});
    assert.deepEqual(payload.byNameB, {});
    for (const key of ["sources", "imarat", "brand", "brandMap", "brandByName", "total"]) {
      assert.equal(Object.hasOwn(payload, key), false, "campo interno não deve ser público: " + key);
    }
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
});
