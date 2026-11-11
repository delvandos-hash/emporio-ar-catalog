import test from "node:test";
import assert from "node:assert/strict";
import { cartProductKey } from "../js/cart-identity.mjs";

test("usa identidade pública para não fundir produtos distintos de mesmo nome", () => {
  const a = { public_id: "p_100", brand: "Only You", nome: "Miniatura Amber", volume: "5ml" };
  const b = { public_id: "p_200", brand: "Only You", nome: "Miniatura Amber", volume: "5ml" };
  assert.notEqual(cartProductKey(a), cartProductKey(b));
});

test("o mesmo produto em categorias cruzadas mantém uma única chave de carrinho", () => {
  const colares = { public_id: "p_100", cat: "Colares", nome: "Peça" };
  const lancamentos = { public_id: "p_100", cat: "Lançamentos", nome: "Peça" };
  assert.equal(cartProductKey(colares), cartProductKey(lancamentos));
});

test("itens antigos sem ID público conservam chave legada compatível", () => {
  assert.equal(cartProductKey({ brand: "Marca", nome: "Produto", volume: "10ml" }), "legacy|Marca|Produto|10ml");
});
