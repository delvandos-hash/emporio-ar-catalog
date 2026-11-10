import test from "node:test";
import assert from "node:assert/strict";
import { resolveLegacyStockMatch } from "./legacy-restore-identity.mjs";

const row = (public_id, foto, brand = "Marca A") => ({
  group: { brand },
  publicItem: { public_id, foto },
  item: {}
});

test("resolve variante pelo public_id quando stock_ref é compartilhado dentro da mesma marca", () => {
  const a=row("p_a","foto-a"), b=row("p_b","foto-b");
  assert.equal(resolveLegacyStockMatch([a,b],[a,b],{public_id:"p_b",foto:"foto-b"},[],"Marca A"),b);
});
test("resolve variante pela identidade e fotografia quando public_id não coincide", () => {
  const a=row("p_a","foto-a"), b=row("p_b","foto-b");
  assert.equal(resolveLegacyStockMatch([a,b],[a,b],{public_id:"legacy",foto:"foto-b"},[],"Marca A"),b);
});
test("não escolhe variante quando a correspondência continua ambígua", () => {
  const a=row("p_a","foto-igual"), b=row("p_b","foto-igual");
  assert.equal(resolveLegacyStockMatch([a,b],[a,b],{public_id:"legacy",foto:"foto-igual"},[],"Marca A"),null);
});
test("resolve identidade única mesmo quando não existe stock_ref", () => {
  const a=row("p_a","foto-a");
  assert.equal(resolveLegacyStockMatch([],[a],{public_id:"legacy",foto:"foto-a"},[],"Marca A"),a);
});
test("nunca resolve stock_ref único pertencente a outra marca", () => {
  const otherBrand=row("p_other","foto-x","Marca B");
  assert.equal(resolveLegacyStockMatch([otherBrand],[],{public_id:"legacy",foto:"foto-x"},[],"Marca A"),null);
});
test("nunca resolve public_id único pertencente a outra marca", () => {
  const otherBrand=row("p_shared","foto-x","Marca B");
  assert.equal(resolveLegacyStockMatch([],[],{public_id:"p_shared",foto:"foto-x"},[otherBrand],"Marca A"),null);
});
test("quando stock_ref aparece em duas marcas, só considera a marca esperada", () => {
  const a=row("p_a","foto-a","Marca A"), b=row("p_b","foto-b","Marca B");
  assert.equal(resolveLegacyStockMatch([a,b],[a],{public_id:"legacy",foto:"foto-a"},[],"Marca A"),a);
});
test("sem marca esperada, falha de forma fechada", () => {
  const a=row("p_a","foto-a");
  assert.equal(resolveLegacyStockMatch([a],[a],{public_id:"p_a",foto:"foto-a"},[]),null);
});

test("uses a unique origin_ref to resolve a legacy variant before ambiguous name matches", () => {
  const a = { ...row("p_a", "foto-a"), publicItem: { public_id: "p_a", foto: "foto-a", origin_ref: "origin-a" } };
  const b = { ...row("p_b", "foto-b"), publicItem: { public_id: "p_b", foto: "foto-b", origin_ref: "origin-b" } };
  assert.equal(resolveLegacyStockMatch([], [a, b], { public_id: "legacy", origin_ref: "origin-b" }, [], "Marca A", [a, b]), b);
});

test("fails closed when an explicit origin_ref has no exact internal match", () => {
  const a = { ...row("p_a", "foto-a"), publicItem: { public_id: "p_a", foto: "foto-a", origin_ref: "origin-a" } };
  assert.equal(resolveLegacyStockMatch([], [a], { public_id: "legacy", origin_ref: "origin-missing" }, [], "Marca A", [a]), null);
});
