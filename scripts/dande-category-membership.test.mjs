import test from "node:test";
import assert from "node:assert/strict";
import { expandDandeCategoryGroups } from "../js/dande-category-membership.mjs";

test("expande produto cruzado nas categorias de origem sem duplicar o cadastro base", () => {
  const source = [{
    brand: "Empório A.R",
    cat: "Colares",
    items: [{
      nome: "Colar Delicado",
      public_id: "p_123",
      categorias_origem: ["Colares", "Lançamentos", "Tornozeleiras", "Colares"]
    }]
  }];
  const result = expandDandeCategoryGroups(source);
  assert.deepEqual(result.map(group => group.cat), ["Colares", "Lançamentos", "Tornozeleiras"]);
  assert.equal(result.reduce((sum, group) => sum + group.items.length, 0), 3);
  assert.ok(result.every(group => group.items[0].public_id === "p_123"));
  assert.ok(result.every(group => group.items[0].cat === group.cat));
  assert.equal(source[0].items.length, 1);
});

test("usa categoria canônica quando não há metadados de categorias de origem", () => {
  const result = expandDandeCategoryGroups([{
    brand: "Empório A.R",
    cat: "Braceletes",
    items: [{ nome: "Bracelete" }]
  }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].cat, "Braceletes");
  assert.equal(result[0].items[0].cat, "Braceletes");
});

test("separa marcas e não repete produto na mesma categoria", () => {
  const result = expandDandeCategoryGroups([
    { brand: "Marca A", cat: "Anéis", items: [{ nome: "Anel", categorias_origem: ["Anéis", "Anéis"] }] },
    { brand: "Marca B", cat: "Anéis", items: [{ nome: "Anel", categorias_origem: ["Anéis"] }] }
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(group => group.brand), ["Marca A", "Marca B"]);
});
