import test from "node:test";
import assert from "node:assert/strict";
import {
  isFourPiecePerfumeKit,
  calculateFourPiecePerfumeKitPrices,
} from "./four-piece-perfume-kit-pricing.mjs";

test("identifica kits de perfume com quatro peças em formatos comuns", () => {
  for (const name of [
    "Kit Liquid 4 peças 30ml cada",
    "Kit Hawas 4 pecas 30ml cada",
    "Kit Perfume 4 pcs",
    "Kit Perfume 4x30ml",
    "Kit Perfume 30ml x 4 pcs",
  ]) assert.equal(isFourPiecePerfumeKit(name), true, name);
});

test("não classifica kits sem quatro peças nem produtos que não sejam kits", () => {
  assert.equal(isFourPiecePerfumeKit("Kit perfume 3 peças"), false);
  assert.equal(isFourPiecePerfumeKit("Perfume 4 peças"), false);
});

test("aplica os acréscimos da regra Vulcan sobre a base de cada fonte, sem preço fixo", () => {
  assert.deepEqual(calculateFourPiecePerfumeKitPrices(90, 40), {
    varejo: "220,00",
    atacado: "165,00",
  });
  assert.deepEqual(calculateFourPiecePerfumeKitPrices(60, 30), {
    varejo: "190,00",
    atacado: "155,00",
  });
});
