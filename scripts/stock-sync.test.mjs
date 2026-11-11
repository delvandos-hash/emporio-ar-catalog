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

function parseFunctionJson(response) {
  const raw = response.isBase64Encoded ? Buffer.from(response.body, "base64").toString("utf8") : response.body;
  return JSON.parse(raw);
}

test("snapshot público usa somente chaves neutras e mantém os dois mapas de estoque", async () => {
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.startsWith(process.env.IMARAT_API_URL)) {
      return new Response(JSON.stringify({
        total: 1,
        products: [{ name: "Perfume de teste", brand: "Marca de teste", inStock: false }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === process.env.BRAND_BASE_URL + "/c/atacado/darlanaugusto") {
      return new Response("", { status: 200 });
    }
    if (url.startsWith(process.env.BRAND_BASE_URL + "/c/atacado/carregar_produtos/1/")) {
      return new Response(JSON.stringify([{ nome: "Produto Brand sem estoque", categoria_nome: "Categoria teste", status: false }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.startsWith(process.env.BRAND_BASE_URL + "/c/atacado/carregar_produtos/2/")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("URL inesperada no teste: " + url);
  };

  try {
    const response = await handler({ httpMethod: "GET" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Content-Type"], "application/json; charset=utf-8");
    assert.equal(response.isBase64Encoded, true);
    const decodedBody = Buffer.from(response.body, "base64").toString("utf8");
    assert.equal(decodedBody.includes('"Não"'), true, "bytes da resposta devem preservar ã em UTF-8");
    assert.equal(decodedBody.includes("NÃ£o"), false, "resposta não pode conter texto corrompido");
    const payload = parseFunctionJson(response);
    assert.equal(payload.ok, true);
    assert.equal(payload.mapA["perfume de teste|marca de teste"], "Não");
    assert.equal(payload.mapB["produto brand sem estoque|categoria teste"], "Não");
    assert.deepEqual(payload.byNameB, {});
    for (const key of ["sources", "imarat", "brand", "brandMap", "brandByName", "total"]) {
      assert.equal(Object.hasOwn(payload, key), false, "campo interno não deve ser público: " + key);
    }

    globalThis.fetch = async input => {
      const url = String(input);
      if (url.startsWith(process.env.IMARAT_API_URL)) throw new Error("falha simulada");
      if (url === process.env.BRAND_BASE_URL + "/c/atacado/darlanaugusto") return new Response("", { status: 200 });
      if (url.startsWith(process.env.BRAND_BASE_URL + "/c/atacado/carregar_produtos/1/")) return new Response("[]", { status: 200 });
      throw new Error("URL inesperada no teste: " + url);
    };
    const partial = parseFunctionJson(await handler({ httpMethod: "GET" }));
    assert.equal(partial.ok, false, "uma origem indisponível deve invalidar o snapshot completo");
    assert.deepEqual(partial.mapA, {});
    assert.equal(Object.hasOwn(partial, "imarat"), false);
    assert.equal(Object.hasOwn(partial, "brand"), false);

    globalThis.fetch = async input => {
      const url = String(input);
      if (url.startsWith(process.env.IMARAT_API_URL)) return new Response(JSON.stringify({ total: 0, products: [] }), { status: 200 });
      if (url === process.env.BRAND_BASE_URL + "/c/atacado/darlanaugusto") throw new Error("falha simulada");
      throw new Error("URL inesperada no teste: " + url);
    };
    const partialBrand = JSON.parse((await handler({ httpMethod: "GET" })).body);
    assert.equal(partialBrand.ok, false, "falha da segunda origem também deve invalidar o snapshot");
    assert.deepEqual(partialBrand.mapB, {});
    assert.equal(Object.hasOwn(partialBrand, "imarat"), false);
    assert.equal(Object.hasOwn(partialBrand, "brand"), false);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
});
