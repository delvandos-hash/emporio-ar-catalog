import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./sync-stock.mjs", import.meta.url), "utf8");
const fetchBrand = source.slice(source.indexOf("async function fetchBrand() {"), source.indexOf("\nfunction resolve(item"));

test("sync de estoque só aceita Brand após confirmar fim da paginação", () => {
  assert.match(fetchBrand, /pagina_especifica: ''/);
  assert.match(fetchBrand, /let completed = false/);
  assert.match(fetchBrand, /!Object\.prototype\.hasOwnProperty\.call\(data, 'produtos'\).*products = \[\]/s);
  assert.match(fetchBrand, /else products = data\?\.produtos/);
  assert.match(fetchBrand, /if \(!products\.length\)\s*\{\s*completed = true;/);
  assert.match(fetchBrand, /if \(!completed \|\| fetched === 0\)/);
  assert.match(fetchBrand, /atingiu o limite de 80 páginas sem fim confirmado/);
});

test("falha HTTP, HTML e JSON inválido da Brand interrompem a coleta", () => {
  assert.match(fetchBrand, /if \(!res\.ok\) throw new Error/);
  assert.match(fetchBrand, /HTML\/vazio em vez de JSON; coleta incompleta/);
  assert.match(fetchBrand, /JSON inválido; coleta incompleta/);
  assert.doesNotMatch(fetchBrand, /catch \(e\)\s*\{\s*console\.log/);
});

test("sync de estoque não publica usando somente Imarat se Brand falhar", () => {
  assert.match(source, /const brand = await fetchBrand\(\);/);
  assert.doesNotMatch(source, /Brand indisponível \(seguindo só com Imarat\)/);
  assert.ok(source.indexOf("const brand = await fetchBrand();") < source.indexOf("fs.writeFileSync(dataPath"));
});


test("Dande usa requisições sem cache e não confunde página repetida com fim da categoria", () => {
  const catalogSource = fs.readFileSync(new URL("./sync-catalog.mjs", import.meta.url), "utf8");
  assert.ok(catalogSource.includes("cache: 'no-store'"));
  assert.ok(catalogSource.includes("'Cache-Control': 'no-cache, no-store, max-age=0'"));
  assert.ok(catalogSource.includes("requestUrl.searchParams.set('_dande_refresh'"));
  assert.ok(catalogSource.includes("for (let retry = 1; retry <= 2; retry++)"));
  assert.ok(catalogSource.includes("página ${page} repetida/vazia após 2 tentativas sem cache"));
  assert.ok(!catalogSource.includes("página repetida sem continuação; encerrando categoria"));
});