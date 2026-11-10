import test from "node:test";
import assert from "node:assert/strict";
import {
  collectPublicIds,
  mergeKnownGoodSnapshot,
  parseDataJsContent,
  serializeDataJsContent
} from "./catalog-baseline-restore.mjs";

test("restores only missing public IDs and preserves the current version of existing IDs", () => {
  const current = {
    feminino: [{ cat: "Brand", brand: "COLEÇÃO BRAND", items: [
      { nome: "Produto A atualizado", public_id: "p_a" }
    ] }]
  };
  const baseline = {
    feminino: [{ cat: "Brand", brand: "COLEÇÃO BRAND", items: [
      { nome: "Produto A antigo", public_id: "p_a" },
      { nome: "Produto B", public_id: "p_b" }
    ] }]
  };
  const result = mergeKnownGoodSnapshot(current, baseline);
  assert.deepEqual(result.restoredIds, ["p_b"]);
  assert.equal(result.data.feminino[0].items.length, 2);
  assert.equal(result.data.feminino[0].items[0].nome, "Produto A atualizado");
  assert.equal(result.data.feminino[0].items[0]._preserve_public_id, true);
  assert.equal(result.data.feminino[0].items[1].nome, "Produto B");
  assert.equal(result.data.feminino[0].items[1]._preserve_public_id, true);
});

test("rekeys an exact stock_ref match to the prior public ID without overwriting current fields", () => {
  const current = {
    roupas: [{ cat: "BLUSA/CAMISA/CROPPED", brand: "Empório A.R", items: [
      { nome: "Bata Lara", volume: "—", stock_ref: "s_123", public_id: "p_new", varejo: "89,90" }
    ] }]
  };
  const baseline = {
    roupas: [{ cat: "BLUSA/CAMISA/CROPPED", brand: "Empório A.R", items: [
      { nome: "Bata Lara", volume: "—", stock_ref: "s_123", public_id: "p_old", varejo: "84,90" }
    ] }]
  };
  const result = mergeKnownGoodSnapshot(current, baseline);
  assert.equal(result.rekeyedIds.length, 1);
  assert.equal(result.rekeyedIds[0].from, "p_new");
  assert.equal(result.rekeyedIds[0].to, "p_old");
  assert.equal(result.restoredIds.length, 0);
  assert.equal(result.data.roupas[0].items.length, 1);
  assert.equal(result.data.roupas[0].items[0].public_id, "p_old");
  assert.equal(result.data.roupas[0].items[0]._preserve_public_id, true);
  assert.equal(result.data.roupas[0].items[0].varejo, "89,90");
});

test("does not rekey similar products when stock_ref or brand differs", () => {
  const current = {
    roupas: [{ cat: "BLUSA/CAMISA/CROPPED", brand: "Outra marca", items: [
      { nome: "Bata Lara", volume: "—", stock_ref: "s_different", public_id: "p_new" }
    ] }]
  };
  const baseline = {
    roupas: [{ cat: "BLUSA/CAMISA/CROPPED", brand: "Empório A.R", items: [
      { nome: "Bata Lara", volume: "—", stock_ref: "s_123", public_id: "p_old" }
    ] }]
  };
  const result = mergeKnownGoodSnapshot(current, baseline);
  assert.equal(result.rekeyedIds.length, 0);
  assert.deepEqual(result.restoredIds, ["p_old"]);
  assert.equal(result.data.roupas.length, 2);
});

test("creates the original line and group when a known-good item is missing", () => {
  const result = mergeKnownGoodSnapshot({}, {
    unissex: [{ cat: "Scoop Premiado", brand: "EMPÓRIO A.R", items: [
      { nome: "Scoop Ouro", public_id: "p_ouro" }
    ] }]
  });
  assert.deepEqual(result.restoredIds, ["p_ouro"]);
  assert.equal(result.data.unissex[0].items[0].nome, "Scoop Ouro");
});

test("rejects duplicate public IDs in either snapshot instead of guessing", () => {
  assert.throws(() => mergeKnownGoodSnapshot(
    { feminino: [{ cat: "A", brand: "B", items: [
      { nome: "A", public_id: "p_dup" }, { nome: "B", public_id: "p_dup" }
    ] }] },
    {}
  ), /duplicado na base atual/);
  assert.throws(() => mergeKnownGoodSnapshot(
    {},
    { feminino: [{ cat: "A", brand: "B", items: [
      { nome: "A", public_id: "p_dup" }, { nome: "B", public_id: "p_dup" }
    ] }] }
  ), /duplicado no snapshot conhecido/);
});

test("ignores baseline entries without public IDs and reports them", () => {
  const result = mergeKnownGoodSnapshot({}, {
    feminino: [{ cat: "Perfumes", brand: "A", items: [
      { nome: "Sem ID" }, { nome: "Com ID", public_id: "p_id" }
    ] }]
  });
  assert.equal(result.skippedWithoutPublicId, 1);
  assert.deepEqual([...collectPublicIds(result.data)], ["p_id"]);
});

test("parses and serializes DATA without changing the other exports", () => {
  const source = 'export const DATA = {"feminino": []};\nexport const WHATSAPP = "123";\nexport const BRAND = {};\n';
  const data = parseDataJsContent(source);
  data.feminino.push({ cat: "Miniaturas", brand: "AFEER", items: [] });
  const output = serializeDataJsContent(source, data);
  assert.match(output, /export const WHATSAPP = "123"/);
  assert.equal(parseDataJsContent(output).feminino.length, 1);
});
