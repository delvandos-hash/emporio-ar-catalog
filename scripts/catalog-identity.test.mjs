import test from "node:test";
import assert from "node:assert/strict";
import { normalProductKey, normalProductNameVolumeKey, miniIdentityKey, miniIdentityBaseKey, isDuplicateMiniSource, exactCatalogFingerprint, isExcludedImaratAtherri } from "./catalog-identity.mjs";

test("perfumes exigem nome exato, volume e marca", () => {
  assert.equal(normalProductKey("Perfume Áureo 100ml", "100ml", "Marca A"), normalProductKey("PERFUME Aureo", "100ml", "Marca A"));
  assert.notEqual(normalProductKey("Perfume Áureo", "100ml", "Marca A"), normalProductKey("Perfume Áureo Intense", "100ml", "Marca A"));
  assert.notEqual(normalProductKey("Perfume Áureo", "100ml", "Marca A"), normalProductKey("Perfume Áureo", "50ml", "Marca A"));
  assert.notEqual(normalProductKey("Perfume Áureo", "100ml", "Marca A"), normalProductKey("Perfume Áureo", "100ml", "Marca B"));
  assert.equal(normalProductNameVolumeKey("Perfume Áureo", "100ml"), normalProductNameVolumeKey("Perfume Áureo", "100ml"));
});
test("miniatures normalize generic prefixes and matching brand in title", () => {
  const a={nome:"Miniatura Lattafa Yara Candy 30ml",volume:"30ml",varejo:"99,90",atacado:"69,90",foto:"https://img.example/a.webp"};
  const b={nome:"Mini Yara Candy 30ml",volume:"30ml",varejo:"99,90",atacado:"69,90",foto:"https://img.example/a.webp"};
  assert.equal(miniIdentityKey(a,"Lattafa"),miniIdentityKey(b,"Lattafa"));
});
test("similar names or different brands do not collide", () => {
  const a={nome:"Miniatura Asad Zanzibar 30ml",volume:"30ml",varejo:"89,90",atacado:"59,90",foto:"https://img.example/a.webp"};
  const b={nome:"Miniatura Asad Bourbon 30ml",volume:"30ml",varejo:"89,90",atacado:"59,90",foto:"https://img.example/a.webp"};
  assert.notEqual(miniIdentityBaseKey(a,"Lattafa"),miniIdentityBaseKey(b,"Lattafa"));
  assert.notEqual(miniIdentityBaseKey(a,"Lattafa"),miniIdentityBaseKey(a,"Only You"));
});
test("miniatures with different volume, price or photos are preserved", () => {
  const a={nome:"Miniatura Yara Candy 30ml",volume:"30ml",varejo:"99,90",atacado:"69,90",foto:"https://img.example/a.webp"};
  assert.notEqual(miniIdentityKey(a,"Lattafa"),miniIdentityKey({...a,volume:"50ml"},"Lattafa"));
  assert.notEqual(miniIdentityKey(a,"Lattafa"),miniIdentityKey({...a,varejo:"109,90"},"Lattafa"));
  assert.notEqual(miniIdentityKey(a,"Lattafa"),miniIdentityKey({...a,foto:"https://img.example/b.webp"},"Lattafa"));
});
test("miniatures use source ID first and brand/name/volume fallback only for legacy records", () => {
  assert.equal(isDuplicateMiniSource([{id_origem:"101"}], "101"), true);
  assert.equal(isDuplicateMiniSource([{id_origem:"101"}], "102"), false);
  assert.equal(isDuplicateMiniSource([{id_origem:""}], "102"), true);
  assert.equal(isDuplicateMiniSource([], "102"), false);
  assert.equal(isDuplicateMiniSource([{id_origem:"101"}], ""), true);
});

test("only fully identical records share the safe deletion fingerprint", () => {
  const base={nome:"Miniatura Yara Candy 30ml",volume:"30ml",varejo:"99,90",atacado:"69,90",foto:"https://img.example/a.webp",id_origem:"101",fonte:"imarat",disponivel:"Sim"};
  const key=exactCatalogFingerprint(base,"Lattafa","imarat");
  assert.equal(exactCatalogFingerprint({...base},"Lattafa","imarat"),key);
  assert.notEqual(exactCatalogFingerprint(base,"Only You","imarat"),key);
  assert.notEqual(exactCatalogFingerprint({...base,volume:"50ml"},"Lattafa","imarat"),key);
  assert.notEqual(exactCatalogFingerprint({...base,id_origem:"102"},"Lattafa","imarat"),key);
  assert.notEqual(exactCatalogFingerprint({...base,varejo:"109,90"},"Lattafa","imarat"),key);
  assert.notEqual(exactCatalogFingerprint({...base,foto:"https://img.example/b.webp"},"Lattafa","imarat"),key);
  assert.notEqual(exactCatalogFingerprint({...base,notas:"Notas diferentes"},"Lattafa","imarat"),key);
});

test("fingerprint exato preserva linha, categoria e referências de estoque distintas", () => {
  const base={nome:"Perfume Alfa 100ml",volume:"100ml",varejo:"199,90",atacado:"149,90",foto:"https://img.example/a.webp",id_origem:"101",fonte:"imarat",stock_ref:"stock-a"};
  const key=exactCatalogFingerprint(base,"Marca A","imarat","masculino","Perfumes");
  assert.notEqual(exactCatalogFingerprint(base,"Marca A","imarat","feminino","Perfumes"),key);
  assert.notEqual(exactCatalogFingerprint(base,"Marca A","imarat","masculino","Miniaturas"),key);
  assert.notEqual(exactCatalogFingerprint({...base,stock_ref:"stock-b"},"Marca A","imarat","masculino","Perfumes"),key);
});

test("perfumes com mesma marca, nome e volume mas IDs de origem diferentes permanecem distintos", () => {
  assert.equal(isDuplicateMiniSource([{ id_origem: "101" }], "102"), false);
  assert.equal(isDuplicateMiniSource([{ id_origem: "101" }], "101"), true);
});
test("sem ID de origem, a identidade-base continua sendo o fallback conservador", () => {
  assert.equal(isDuplicateMiniSource([{ id_origem: "101" }], ""), true);
  assert.equal(isDuplicateMiniSource([{ id_origem: "" }], "102"), true);
});


test("bloqueia somente a miniatura Atherri Afeer incorreta da Imarat e preserva a correta", () => {
  const wrong = { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "105,00", atacado: "75,00", id_origem: "1481" };
  const correct = { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "95,00", atacado: "65,00", id_origem: "1474" };
  assert.equal(isExcludedImaratAtherri(wrong, "Afeer"), true);
  assert.equal(isExcludedImaratAtherri(correct, "Afeer"), false);
  assert.equal(isExcludedImaratAtherri({ ...wrong, varejo: "95,00", atacado: "65,00" }, "Afeer"), false);
  assert.equal(isExcludedImaratAtherri({ ...wrong, id_origem: "9999" }, "Afeer"), true);
  assert.equal(isExcludedImaratAtherri({ ...wrong, nome: "Miniatura Atherri Afeer Intense" }, "Afeer"), false);
  assert.equal(isExcludedImaratAtherri({ ...wrong, nome: "Miniatura Atherri Afeer" }, "Outra Marca"), false);
  assert.equal(isExcludedImaratAtherri({ ...wrong, volume: "50ml" }, "Afeer"), false);
});
