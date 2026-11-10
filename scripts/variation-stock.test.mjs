import test from "node:test";
import assert from "node:assert/strict";
import { buildVariacoes } from "../netlify/functions/roupas-stock.mjs";
import { toVariacoes } from "../netlify/functions/dande-stock.mjs";

test("roupas devolvem IDs públicos sequenciais sem IDs privados", () => {
  const result = buildVariacoes({
    variacoes: {
      "sku-interno-998": { nome: "Tamanho M", cor: "Azul" },
      "sku-interno-999": { nome: "Tamanho G" }
    },
    estoque: { "sku-interno-998": 3, "sku-interno-999": 0 }
  });
  assert.deepEqual(result.variacoes, [
    { id: "v1", nome: "Tamanho M", estoque: 3 },
    { id: "v2", nome: "Tamanho G", estoque: 0 }
  ]);
  assert.equal(result.total, 3);
  assert.equal(JSON.stringify(result).includes("sku-interno"), false);
});

test("acessórios devolvem IDs públicos e não expõem SKU", () => {
  const result = toVariacoes([
    { id: "variant-private-1", option0: "Dourado", option1: "P", sku: "SKU-PRIVADO", stock: 2 },
    { id: "variant-private-2", option0: "Prata", option1: "M", sku: "SKU-PRIVADO-2", stock: 0 }
  ]);
  assert.deepEqual(result, [
    { id: "v1", nome: "Dourado / P", estoque: 2 },
    { id: "v2", nome: "Prata / M", estoque: 0 }
  ]);
  assert.equal(JSON.stringify(result).includes("variant-private"), false);
  assert.equal(JSON.stringify(result).includes("SKU-PRIVADO"), false);
});

import { parseVariantsFromHtml } from "../netlify/functions/dande-stock.mjs";

test("Dande só associa variações ao produto solicitado", () => {
  const html = '<div data-product-id="111" data-variants="[{&quot;product_id&quot;:111,&quot;option0&quot;:&quot;P&quot;,&quot;stock&quot;:2}]"></div>' +
    '<div data-product-id="222" data-variants="[{&quot;product_id&quot;:222,&quot;option0&quot;:&quot;G&quot;,&quot;stock&quot;:9}]"></div>';
  assert.deepEqual(parseVariantsFromHtml(html, "111"), [
    { product_id: 111, option0: "P", stock: 2 }
  ]);
});

test("Dande não reutiliza variações do próximo produto quando o atual não tem estoque embutido", () => {
  const html = '<div data-product-id="111"></div>' +
    '<div data-product-id="222" data-variants="[{&quot;product_id&quot;:222,&quot;option0&quot;:&quot;G&quot;,&quot;stock&quot;:9}]"></div>';
  assert.equal(parseVariantsFromHtml(html, "111"), null);
});

test("Dande não usa a primeira variação da página se o ID do produto não corresponder", () => {
  const html = '<div data-variants="[{&quot;product_id&quot;:222,&quot;option0&quot;:&quot;G&quot;,&quot;stock&quot;:9}]"></div>';
  assert.equal(parseVariantsFromHtml(html, "111"), null);
});

test("Dande mantém compatibilidade com página de produto sem ID solicitado", () => {
  const html = '<div data-variants="[{&quot;option0&quot;:&quot;Único&quot;,&quot;stock&quot;:4}]"></div>';
  assert.deepEqual(parseVariantsFromHtml(html), [
    { option0: "Único", stock: 4 }
  ]);
});

import { readFile } from "node:fs/promises";

test("endpoints de estoque não devolvem identificadores internos nas respostas", async () => {
  const roupas = await readFile(new URL("../netlify/functions/roupas-stock.mjs", import.meta.url), "utf8");
  const dande = await readFile(new URL("../netlify/functions/dande-stock.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(roupas, /erro:\s*"fonte\/id inválidos",\s*rawId/);
  assert.doesNotMatch(roupas, /erro:\s*"produto não encontrado",\s*id/);
  assert.doesNotMatch(roupas, /id:\s*stockRef\s*\|\|\s*String\(found\.id\)/);
  assert.doesNotMatch(dande, /erro:\s*"página não carregou",\s*id/);
  assert.doesNotMatch(dande, /erro:\s*"produto não encontrado",\s*id/);
  assert.doesNotMatch(dande, /id:\s*stockRef\s*\|\|\s*resolvedId/);
});


test("roupas devolvem fotos sanitizadas por variação sem expor IDs internos", () => {
  process.env.CDN_IMAGE_BASE_URL = "https://images-primary.example/";
  const result = buildVariacoes({
    variacoes: {
      "sku-private-blue": {
        nome: "Azul M",
        cor: "Azul",
        imagem: "/roupas/azul.webp",
        imagens: [{ url: "/roupas/azul-costas.webp" }, "https://images-primary.example/roupas/azul-detalhe.webp"]
      }
    },
    estoque: { "sku-private-blue": 2 }
  });
  assert.deepEqual(result.variacoes, [{
    id: "v1",
    nome: "Azul M",
    cor: "Azul",
    estoque: 2,
    foto: "/api/product-image?source=a&path=%2Froupas%2Fazul.webp",
    fotos: [
      "/api/product-image?source=a&path=%2Froupas%2Fazul.webp",
      "/api/product-image?source=a&path=%2Froupas%2Fazul-costas.webp",
      "/api/product-image?source=a&path=%2Froupas%2Fazul-detalhe.webp"
    ]
  }]);
  assert.equal(JSON.stringify(result).includes("sku-private"), false);
});
