import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDandeUrl } from "./dande-url.mjs";

test("normaliza base com barra final sem gerar rota com barra dupla", () => {
  assert.equal(
    buildDandeUrl("https://dande.example/", "/braceletes/", 1),
    "https://dande.example/braceletes/"
  );
});

test("adiciona paginação sem duplicar query page", () => {
  assert.equal(
    buildDandeUrl("https://dande.example/", "/aneis1/?page=99", 2),
    "https://dande.example/aneis1/?page=2"
  );
});

test("mantém a categoria solicitada na raiz do domínio", () => {
  assert.equal(
    new URL(buildDandeUrl("https://dande.example/base/", "/masculinos/", 3)).pathname,
    "/masculinos/"
  );
});

test("sync e consulta de estoque usam a rota real singular Masculino", () => {
  const sync = readFileSync("scripts/sync-catalog.mjs", "utf8");
  const stock = readFileSync("netlify/functions/dande-stock.mjs", "utf8");
  assert.match(sync, /path: '\/masculino\/', nome: 'Masculinos'/);
  assert.match(stock, /path: "\/masculino\/", nome: "Masculinos"/);
  assert.doesNotMatch(sync, /path: '\/masculinos\/', nome: 'Masculinos'/);
  assert.doesNotMatch(stock, /path: "\/masculinos\/", nome: "Masculinos"/);
});
