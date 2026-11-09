import test from "node:test";
import assert from "node:assert/strict";
import { normalProductKey, miniIdentityKey, miniIdentityBaseKey, isDuplicateMiniSource } from "./catalog-identity.mjs";

test("perfumes use exact normalized title and volume globally", () => {
  assert.equal(normalProductKey("Perfume Áureo 100ml", "100ml"), normalProductKey("PERFUME Aureo", "100ml"));
  assert.notEqual(normalProductKey("Perfume Áureo", "100ml"), normalProductKey("Perfume Áureo Intense", "100ml"));
  assert.notEqual(normalProductKey("Perfume Áureo", "100ml"), normalProductKey("Perfume Áureo", "50ml"));
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
