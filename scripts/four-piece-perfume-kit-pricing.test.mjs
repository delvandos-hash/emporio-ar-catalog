import test from "node:test";
import assert from "node:assert/strict";
import {
  isFourPiecePerfumeKit,
  calculateFourPiecePerfumeKitPrices,
} from "./four-piece-perfume-kit-pricing.mjs";
import { preservePublicPrice } from "./manual-price-protection.mjs";

test("identifica kits de perfume com quatro peças em formatos comuns", () => {
  for (const name of [
    "Kit Liquid 4 peças 30ml cada",
    "Kit Hawas 4 pecas 30ml cada",
    "Kit Perfume 4 pcs",
    "Kit Perfume 4x30ml",
    "Kit Perfume 30ml x 4 pcs",
  ]) {
    assert.equal(isFourPiecePerfumeKit(name, "Perfumes"), true, name);
    assert.equal(isFourPiecePerfumeKit(name, "Miniaturas"), true, name);
  }
});

test("não classifica kits sem quatro peças, sem kit ou fora das categorias de perfume", () => {
  assert.equal(isFourPiecePerfumeKit("Kit perfume 3 peças", "Perfumes"), false);
  assert.equal(isFourPiecePerfumeKit("Perfume 4 peças", "Perfumes"), false);
  assert.equal(isFourPiecePerfumeKit("Kit organizador 4 peças", "Acessórios"), false);
  assert.equal(isFourPiecePerfumeKit("Kit maquiagem 4 peças", "Maquiagem"), false);
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


test("divergência com o Gist preserva o preço público sem criar precoManual", () => {
  const target = { varejo: "220,00", atacado: "165,00" };
  const changed = preservePublicPrice(target, { varejo: "190,00", atacado: "155,00" });
  assert.equal(changed, true);
  assert.deepEqual(target, { varejo: "190,00", atacado: "155,00" });
  assert.equal(Object.hasOwn(target, "precoManual"), false);
});

test("precoManual explicitamente definido continua protegendo os dois preços", () => {
  for (const marker of [true, "true", 1]) {
    const target = { varejo: "777,00", atacado: "555,00", precoManual: marker };
    const changed = preservePublicPrice(target, { varejo: "190,00", atacado: "155,00" });
    assert.equal(changed, false);
    assert.equal(target.varejo, "777,00");
    assert.equal(target.atacado, "555,00");
    assert.equal(target.precoManual, marker);
  }
});

test("preço público inválido não altera o registro", () => {
  const target = { varejo: "220,00", atacado: "165,00" };
  assert.equal(preservePublicPrice(target, { varejo: "", atacado: "155,00" }), false);
  assert.deepEqual(target, { varejo: "220,00", atacado: "165,00" });
});
