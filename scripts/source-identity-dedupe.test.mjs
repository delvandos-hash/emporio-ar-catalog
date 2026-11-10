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
  assert.equal(result.removed, 1);
  assert.equal(result.conflicts.length, 2);
  assert.equal(data.roupas.reduce((n, g) => n + g.items.length, 0), 2);
  assert.equal(data.roupas[0].items[0].varejo, "129,90");
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

test("preserva Scoop Premiado como produto próprio mesmo sem fonte, ID ou foto", () => {
  const scoop = product({
    nome: "Scoop Premiado",
    volume: "—",
    fonte: "",
    id_origem: "",
    foto: undefined,
    fotos: undefined
  });
  const data = { feminino: [
    { cat: "Scoop Premiado", brand: "Empório A.R", items: [scoop] }
  ] };
  const result = dedupeConfirmedSourceProducts(data);
  assert.equal(result.removed, 0);
  assert.equal(data.feminino[0].items.length, 1);
  assert.equal(data.feminino[0].items[0].nome, "Scoop Premiado");
  assert.equal(data.feminino[0].items[0].foto, undefined);
});


test("remove duplicata Franny confirmada por fotos coincidentes e variações iguais", () => {
  const a = product({
    id_origem: "franny-3687899", nome: "Short Alfaiataria Estampado",
    foto: "https://img.example/main.jpg",
    fotos: ["https://img.example/main.jpg", "https://img.example/a.jpg"],
    notas: "Alfaiataria com cinto",
    variacoes: [{ nome: "Preto P", estoque: 0 }, { nome: "Bege GG", estoque: 1 }],
    total_estoque: 1
  });
  const b = product({
    id_origem: "franny-4496030", nome: "Short Alfaiataria Estampado",
    foto: "https://img.example/main.jpg",
    fotos: ["https://img.example/main.jpg", "https://img.example/a.jpg", "https://img.example/b.jpg"],
    notas: "Alfaiataria com cinto",
    variacoes: [{ nome: "Preto P", estoque: 0 }, { nome: "Bege GG", estoque: 1 }],
    total_estoque: 42
  });
  const data = { roupas: [{ cat: "CALÇA/SHORT", brand: "Empório A.R", items: [a, b] }] };
  const result = dedupeConfirmedSourceProducts(data);
  assert.equal(result.visualRemoved, 1);
  assert.equal(data.roupas[0].items.length, 1);
  assert.equal(data.roupas[0].items[0].id_origem, "franny-4496030");
  assert.equal(data.roupas[0].items[0].fotos.length, 3);
});

test("remove duplicata Sophia com mesma galeria e pelo menos 75% das variações coincidentes", () => {
  const photos = ["https://img.example/1.jpg", "https://img.example/2.jpg"];
  const a = product({
    id_origem: "4092765", nome: "Calça Resinada", foto: photos[0], fotos: photos,
    variacoes: ["Preto P", "Marrom P", "Azul P", "Café P"].map(nome => ({ nome, estoque: 1 })),
    total_estoque: 7
  });
  const b = product({
    id_origem: "3846166", nome: "Calça Resinada", foto: photos[0], fotos: photos,
    variacoes: ["Preto P", "Caramelo P", "Azul P", "Café P"].map(nome => ({ nome, estoque: 2 })),
    total_estoque: 4
  });
  const data = { roupas: [{ cat: "CALÇA/SHORT", brand: "Empório A.R", items: [a, b] }] };
  const result = dedupeConfirmedSourceProducts(data);
  assert.equal(result.visualRemoved, 1);
  assert.equal(data.roupas[0].items.length, 1);
  assert.equal(data.roupas[0].items[0].id_origem, "3846166");
});

test("preserva produtos com mesmo nome mas fotografias diferentes", () => {
  const a = product({ id_origem: "4239995", nome: "Calça Cargo",
    fotos: ["https://img.example/cargo-a.jpg", "https://img.example/cargo-b.jpg"],
    variacoes: [{ nome: "Jeans 40", estoque: 2 }, { nome: "Jeans 42", estoque: 1 }] });
  const b = product({ id_origem: "4235903", nome: "Calça Cargo",
    fotos: ["https://img.example/cargo-c.jpg", "https://img.example/cargo-d.jpg"],
    variacoes: [{ nome: "Jeans 40", estoque: 2 }, { nome: "Jeans 42", estoque: 1 }] });
  const data = { roupas: [{ cat: "CALÇA/SHORT", brand: "Empório A.R", items: [a, b] }] };
  const result = dedupeConfirmedSourceProducts(data);
  assert.equal(result.visualRemoved, 0);
  assert.equal(data.roupas[0].items.length, 2);
});
