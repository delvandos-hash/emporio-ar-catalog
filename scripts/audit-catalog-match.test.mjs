import test from "node:test";
import assert from "node:assert/strict";
import { findExactInternalPriceMatch, findImaratSourceByOriginRef } from "./audit-catalog-match.mjs";

const candidate = (id, varejo, atacado) => ({ id_origem: id, varejo, atacado });

test("matches the unique internal variant with exact retail and wholesale prices", () => {
  const correct = candidate("1474", "95,00", "75,00");
  const other = candidate("1481", "105,00", "75,00");
  assert.equal(findExactInternalPriceMatch([correct, other], { varejo: "95,00", atacado: "75,00" }), correct);
  assert.equal(findExactInternalPriceMatch([correct, other], { varejo: "105,00", atacado: "75,00" }), other);
});

test("does not inherit an origin ID when prices do not match any internal variant", () => {
  assert.equal(findExactInternalPriceMatch([candidate("1474", "95,00", "75,00")], { varejo: "105,00", atacado: "75,00" }), null);
});

test("does not choose when more than one internal variant has the same prices", () => {
  const a = candidate("1474", "95,00", "75,00");
  const b = candidate("1481", "95,00", "75,00");
  assert.equal(findExactInternalPriceMatch([a, b], { varejo: "95,00", atacado: "75,00" }), null);
});

test("returns null for missing or invalid candidate collections", () => {
  assert.equal(findExactInternalPriceMatch([], { varejo: "95,00", atacado: "75,00" }), null);
  assert.equal(findExactInternalPriceMatch(null, { varejo: "95,00", atacado: "75,00" }), null);
});

test("resolves Imarat source records by stable origin_ref, not by similar title", () => {
  const products = [
    { id: 1474, brand: "Afeer " , name: "Miniatura Atherri Afeer" },
    { id: 1481, brand: "Afeer ", name: "Miniatura Atherri Afeer" }
  ];
  assert.equal(findImaratSourceByOriginRef(products, "o_9e8adfbf4a5157cb7a048f8f"), products[0]);
  assert.equal(findImaratSourceByOriginRef(products, "o_b8e0e31ca9e4dfafe8a7ecc7"), products[1]);
  assert.equal(findImaratSourceByOriginRef(products, "o_unknown"), null);
});
