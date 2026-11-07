import test from "node:test";
import assert from "node:assert/strict";
import { isFavoriteId } from "../js/favorites.js";

test("reconhece favoritos novos pelo identificador público", () => {
  assert.equal(isFavoriteId(["p_publico"], "p_publico", "marca-produto-100ml"), true);
});

test("preserva compatibilidade com favoritos antigos baseados em marca, nome e volume", () => {
  const stored = ["marca-produto-100ml"];
  assert.equal(isFavoriteId(stored, "p_novo", "marca-produto-100ml"), true);
  assert.deepEqual(stored, ["marca-produto-100ml"]);
});

test("não considera favorito quando só existe um identificador interno antigo", () => {
  assert.equal(isFavoriteId(["id-interno-do-fornecedor"], "p_novo", "marca-produto-100ml"), false);
});

test("ignora armazenamento inválido e identificadores vazios", () => {
  assert.equal(isFavoriteId(null, "p_novo", "marca-produto-100ml"), false);
  assert.equal(isFavoriteId([""], "", ""), false);
});
