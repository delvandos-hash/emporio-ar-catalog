import test from "node:test";
import assert from "node:assert/strict";
import { isFavoriteId, toggleFavoriteIds } from "../js/favorites.js";

test("reconhece favoritos novos pelo identificador público", () => {
  assert.equal(isFavoriteId(["p_publico"], "p_publico", "marca-produto-100ml"), true);
});

test("preserva compatibilidade com favoritos antigos baseados em marca, nome e volume", () => {
  const stored = ["marca-produto-100ml"];
  assert.equal(isFavoriteId(stored, "p_novo", "marca-produto-100ml"), true);
  assert.deepEqual(stored, ["marca-produto-100ml"]);
});

test("não associa identificadores internos antigos sem mapeamento seguro", () => {
  assert.equal(isFavoriteId(["id-interno-do-fornecedor"], "p_novo", "marca-produto-100ml"), false);
});

test("desfavorita usando a chave legada reconhecida sem deixar duplicata pública", () => {
  assert.deepEqual(
    toggleFavoriteIds(["marca-produto-100ml", "outro-favorito"], "p_novo", "marca-produto-100ml"),
    ["outro-favorito"]
  );
});

test("desfavorita pela chave pública e pela legada, se ambas existirem", () => {
  assert.deepEqual(
    toggleFavoriteIds(["p_novo", "marca-produto-100ml", "outro-favorito"], "p_novo", "marca-produto-100ml"),
    ["outro-favorito"]
  );
});

test("adiciona somente o identificador público quando ainda não é favorito", () => {
  assert.deepEqual(toggleFavoriteIds(["outro-favorito"], "p_novo", "marca-produto-100ml"), ["p_novo", "outro-favorito"]);
});

test("ignora armazenamento inválido e identificadores vazios", () => {
  assert.equal(isFavoriteId(null, "p_novo", "marca-produto-100ml"), false);
  assert.deepEqual(toggleFavoriteIds(null, "p_novo", "marca-produto-100ml"), ["p_novo"]);
  assert.deepEqual(toggleFavoriteIds([""], "", ""), [""]);
});

test("consulta favoritos por Set sem reler ou reconstruir o armazenamento", () => {
  const snapshot = new Set(["p_publico", "outro-favorito"]);
  assert.equal(isFavoriteId(snapshot, "p_publico", "marca-produto-100ml"), true);
  assert.equal(isFavoriteId(snapshot, "ausente", "marca-produto-100ml"), false);
});
