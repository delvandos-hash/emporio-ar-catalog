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


test("filtro global reúne favoritos de todas as origens sem descartar grupos", async () => {
  const { filterFavoriteGroups } = await import("../js/favorites.js");
  const groups = [
    { line: "feminino", cat: "Perfumes", brand: "Marca A", items: [{ public_id: "fav-a" }, { public_id: "no-a" }] },
    { line: "masculino", cat: "Perfumes", brand: "Marca B", items: [{ public_id: "fav-b" }] },
    { line: "unissex", cat: "Novidades", brand: "Marca C", items: [{ public_id: "no-c" }] },
    { line: "acessorios", cat: "Acessórios", brand: "Marca D", items: [{ public_id: "fav-d" }] },
  ];
  const filtered = filterFavoriteGroups(groups, (item) => ["fav-a", "fav-b", "fav-d"].includes(item.public_id));
  assert.deepEqual(
    filtered.map((group) => [group.line, group.items.map((item) => item.public_id)]),
    [
      ["feminino", ["fav-a"]],
      ["masculino", ["fav-b"]],
      ["acessorios", ["fav-d"]],
    ]
  );
});

test("filtro global não depende de filtros de origem e devolve lista vazia sem favoritos", async () => {
  const { filterFavoriteGroups } = await import("../js/favorites.js");
  const groups = [
    { line: "feminino", cat: "Perfumes", items: [{ public_id: "x" }] },
    { line: "roupas", cat: "Roupas", items: [{ public_id: "y" }] },
  ];
  assert.deepEqual(filterFavoriteGroups(groups, () => false), []);
});
