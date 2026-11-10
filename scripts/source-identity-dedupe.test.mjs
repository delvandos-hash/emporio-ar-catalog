import test from "node:test";
import assert from "node:assert/strict";
import { dedupeConfirmedSourceProducts } from "./source-identity-dedupe.mjs";

const product = (overrides = {}) => ({
  nome: "Vestido Aurora", volume: "—", fonte: "roupas", id_origem: "franny-123",
  varejo: "129,90", atacado: "99,90", foto: "https://img.example/a.jpg", ...overrides
});

test("remove a mesma identidade de origem repetida entre grupos", () => {
  const a = product();
  const b = product({ foto: "https://img.example/b.jpg" });
  const data = { roupas: [
    { cat: "VESTIDOS", brand: "Empório A.R", items: [a] },
    { cat: "Lançamentos", brand: "Empório A.R", items: [b] }
  ] };
  const result = dedupeConfirmedSourceProducts(data);
  assert.equal(result.removed, 1);
  assert.equal(data.roupas.reduce((n, g) => n + g.items.length, 0), 1);
  assert.equal(data.roupas[0].items[0].fotos.length, 2);
});

test("preserva marcas diferentes, IDs diferentes e volumes diferentes", () => {
  const data = { perfumes: [
    { cat: "Miniaturas", brand: "Only You", items: [product({ fonte: "roupas", id_origem: "77", nome: "Mini Asad 30ml", volume: "30ml" })] },
    { cat: "Miniaturas", brand: "Lattafa", items: [product({ fonte: "roupas", id_origem: "77", nome: "Mini Asad 30ml", volume: "30ml" })] },
    { cat: "Miniaturas", brand: "Only You", items: [product({ fonte: "roupas", id_origem: "78", nome: "Mini Asad 30ml", volume: "30ml" })] },
    { cat: "Miniaturas", brand: "Only You", items: [product({ fonte: "roupas", id_origem: "77", nome: "Mini Asad 50ml", volume: "50ml" })] }
  ] };
  const result = dedupeConfirmedSourceProducts(data);
  assert.equal(result.removed, 0);
  assert.equal(data.perfumes.reduce((n, g) => n + g.items.length, 0), 4);
});

test("preserva conflito de preço e conflito de identidade no mesmo ID", () => {
  const data = { roupas: [
    { cat: "VESTIDOS", brand: "Empório A.R", items: [product()] },
    { cat: "Conjuntos", brand: "Empório A.R", items: [
      product({ varejo: "139,90" }),
      product({ nome: "Vestido Aurora Longo" })
    ] }
  ] };
  const result = dedupeConfirmedSourceProducts(data);
  assert.equal(result.removed, 0);
  assert.equal(result.conflicts.length, 2);
  assert.equal(data.roupas.reduce((n, g) => n + g.items.length, 0), 3);
});

test("não deduplica registros sem ID ou sem fonte comprovada", () => {
  const data = { roupas: [
    { cat: "VESTIDOS", brand: "Empório A.R", items: [product({ id_origem: "" })] },
    { cat: "VESTIDOS", brand: "Empório A.R", items: [product({ fonte: "", id_origem: "" })] }
  ] };
  const result = dedupeConfirmedSourceProducts(data);
  assert.equal(result.removed, 0);
  assert.equal(data.roupas.reduce((n, g) => n + g.items.length, 0), 2);
});
