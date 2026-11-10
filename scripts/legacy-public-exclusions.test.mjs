import test from "node:test";
import assert from "node:assert/strict";
import { EXCLUDED_ATHERRI_1481_ORIGIN_REF, isExcludedLegacyAtherri, removeExcludedLegacyAtherri } from "./legacy-public-exclusions.mjs";

const group = { brand: "AFEER", cat: "Miniaturas" };
const blocked = { nome: "Miniatura Atherri Afeer", volume: "30ml", origin_ref: EXCLUDED_ATHERRI_1481_ORIGIN_REF };
const correct = { nome: "Miniatura Atherri Afeer", volume: "30ml", origin_ref: "o_9e8adfbf4a5157cb7a048f8f" };

test("excludes only the exact legacy Gist representation of Imarat ID 1481", () => {
  assert.equal(isExcludedLegacyAtherri(blocked, group), true);
  assert.equal(isExcludedLegacyAtherri(correct, group), false);
  assert.equal(isExcludedLegacyAtherri({ ...blocked, origin_ref: "o_unknown" }, group), false);
});

test("does not exclude similar names, other brands or other volumes", () => {
  assert.equal(isExcludedLegacyAtherri({ ...blocked, nome: "Miniatura Atherri Afeer Intense" }, group), false);
  assert.equal(isExcludedLegacyAtherri(blocked, { brand: "Only You", cat: "Miniaturas" }), false);
  assert.equal(isExcludedLegacyAtherri({ ...blocked, volume: "50ml" }, group), false);
});

test("removes only the blocked Atherri entry and preserves the correct 1474 entry", () => {
  const data = { feminino: [{ ...group, items: [blocked, correct, { nome: "Miniatura Yara 30ml" }] }] };
  assert.equal(removeExcludedLegacyAtherri(data), 1);
  assert.deepEqual(data.feminino[0].items, [correct, { nome: "Miniatura Yara 30ml" }]);
});
