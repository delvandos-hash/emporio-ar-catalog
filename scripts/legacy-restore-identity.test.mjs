import test from "node:test";
import assert from "node:assert/strict";
import { resolveLegacyStockMatch, legacyVolumeIdentity, normalizeBrand, preserveStablePublicId } from "./legacy-restore-identity.mjs";

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


test("respeita volume explícito e não herda o volume do título quando o campo contém traço", () => {
  const title = "BRAND 151 DELINA FEM 25ML";
  assert.equal(legacyVolumeIdentity("—", title), "");
  assert.equal(legacyVolumeIdentity("25ml", title), "25ml");
  assert.equal(legacyVolumeIdentity("", title), "25ml");
});

test("volume explícito numérico é normalizado sem perder a identidade", () => {
  assert.equal(legacyVolumeIdentity("25", "BRAND 151 DELINA FEM 25ML"), "25ml");
});


test("prefere o único produto confirmado na fonte raiz entre cópia legada e produto atual com a mesma foto", () => {
  const legacy = {
    group: { brand: "COLEÇÃO BRAND" },
    publicItem: { public_id: "p_legacy", foto: "foto-delina" },
    item: { fonte: "legacy-gist" }
  };
  const root = {
    group: { brand: "COLEÇÃO BRAND" },
    publicItem: { public_id: "p_root", foto: "foto-delina" },
    item: { fonte: "brand", id_origem: "2087755" }
  };
  assert.equal(
    resolveLegacyStockMatch([], [legacy, root], { public_id: "legacy-public", foto: "foto-delina" }, [], "COLEÇÃO BRAND"),
    root
  );
});

test("continua bloqueando quando duas correspondências com IDs de origem distintos compartilham a mesma foto", () => {
  const a = {
    group: { brand: "COLEÇÃO BRAND" },
    publicItem: { public_id: "p_a", foto: "foto-delina" },
    item: { fonte: "brand", id_origem: "2087755" }
  };
  const b = {
    group: { brand: "COLEÇÃO BRAND" },
    publicItem: { public_id: "p_b", foto: "foto-delina" },
    item: { fonte: "brand", id_origem: "2087756" }
  };
  assert.equal(
    resolveLegacyStockMatch([], [a, b], { public_id: "legacy-public", foto: "foto-delina" }, [], "COLEÇÃO BRAND"),
    null
  );
});


test("normaliza marcas com acentos, espaços e letras u sem alterar o nome", () => {
  assert.equal(normalizeBrand("  Águas de Aqua   Parfums  "), "aguas de aqua parfums");
  assert.equal(normalizeBrand("AQUA"), "aqua");
  assert.notEqual(normalizeBrand("AQUA"), normalizeBrand("AQA"));
});


test("preserva public_id interno válido diante de um ID antigo do Gist", () => {
  const target = { public_id: "p_0123456789abcdefabcd" };
  preserveStablePublicId(target, { public_id: "p_fedcba9876543210fedc" });
  assert.equal(target.public_id, "p_0123456789abcdefabcd");
});

test("usa public_id do Gist apenas como fallback quando o ID interno não é válido", () => {
  const target = { public_id: "legacy-id" };
  preserveStablePublicId(target, { public_id: "p_fedcba9876543210fedc" });
  assert.equal(target.public_id, "p_fedcba9876543210fedc");
});

test("não inventa nem substitui public_id quando o Gist não fornece um ID", () => {
  const target = { public_id: "p_0123456789abcdefabcd" };
  preserveStablePublicId(target, {});
  assert.equal(target.public_id, "p_0123456789abcdefabcd");
});
