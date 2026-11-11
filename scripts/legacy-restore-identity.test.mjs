import test from "node:test";
import assert from "node:assert/strict";
import { resolveLegacyStockMatch, legacyVolumeIdentity, preserveStablePublicId } from "./legacy-restore-identity.mjs";

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

test("prefere a única linha confirmada na fonte raiz quando legado e origem compartilham a mesma foto", () => {
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

test("não escolhe entre duas origens confirmadas com IDs diferentes e a mesma foto", () => {
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

test("não sobrescreve public_id protegido pelo snapshot conhecido durante a recuperação do Gist", () => {
  const target = { public_id: "p_snapshot", _preserve_public_id: true };
  assert.equal(preserveStablePublicId(target, { public_id: "p_live" }), "p_snapshot");
  assert.equal(target.public_id, "p_snapshot");
});

test("usa public_id do Gist quando não existe marcador de proteção do snapshot", () => {
  const target = { public_id: "p_atual" };
  assert.equal(preserveStablePublicId(target, { public_id: "p_live" }), "p_live");
  assert.equal(target.public_id, "p_live");
});
