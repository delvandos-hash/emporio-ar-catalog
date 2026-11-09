import test from "node:test";
import assert from "node:assert/strict";
import { normalProductKey, miniIdentityKey } from "./catalog-identity.mjs";

test("perfumes: só nomes normalizados exatamente iguais e mesmo volume colidem globalmente", () => {
  assert.equal(normalProductKey("Perfume Áureo 100ml", "100ml"), normalProductKey("PERFUME Aureo", "100ml"));
  assert.notEqual(normalProductKey("Perfume Áureo 100ml", "100ml"), normalProductKey("Perfume Áureo Intense", "100ml"));
  assert.notEqual(normalProductKey("Perfume Áureo 100ml", "100ml"), normalProductKey("Perfume Áureo", "50ml"));
});

test("miniaturas: prefixo genérico e marca correspondente são normalizados", () => {
  const a = { nome: "Miniatura Lattafa Yara Candy 30ml", volume: "30ml", varejo: "99,90", atacado: "69,90", foto: "https://img.example/a.webp" };
  const b = { nome: "Mini Yara Candy 30ml", volume: "30ml", varejo: "99,90", atacado: "69,90", foto: "https://img.example/a.webp" };
  assert.equal(miniIdentityKey(a, "Lattafa"), miniIdentityKey(b, "Lattafa"));
});

test("miniaturas de marcas diferentes nunca colidem só por nome parecido", () => {
  const a = { nome: "Miniatura Yara Candy 30ml", volume: "30ml", varejo: "99,90", atacado: "69,90", foto: "https://img.example/a.webp" };
  assert.notEqual(miniIdentityKey(a, "Lattafa"), miniIdentityKey(a, "Only You"));
});

test("miniaturas com volume, preço ou fotos diferentes são preservadas", () => {
  const base = { nome: "Miniatura Yara Candy 30ml", volume: "30ml", varejo: "99,90", atacado: "69,90", foto: "https://img.example/a.webp" };
  assert.notEqual(miniIdentityKey(base, "Lattafa"), miniIdentityKey({ ...base, volume: "50ml" }, "Lattafa"));
  assert.notEqual(miniIdentityKey(base, "Lattafa"), miniIdentityKey({ ...base, varejo: "109,90" }, "Lattafa"));
  assert.notEqual(miniIdentityKey(base, "Lattafa"), miniIdentityKey({ ...base, foto: "https://img.example/b.webp" }, "Lattafa"));
});

test("miniaturas com nomes apenas semelhantes não são consideradas duplicatas", () => {
  const a = { nome: "Miniatura Asad Zanzibar 30ml", volume: "30ml", varejo: "89,90", atacado: "59,90", foto: "https://img.example/a.webp" };
  const b = { nome: "Miniatura Asad Bourbon 30ml", volume: "30ml", varejo: "89,90", atacado: "59,90", foto: "https://img.example/a.webp" };
  assert.notEqual(miniIdentityKey(a, "Lattafa"), miniIdentityKey(b, "Lattafa"));
});
