import test from "node:test";
import assert from "node:assert/strict";
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
