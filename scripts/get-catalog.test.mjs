import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { filterExcludedAtherri } from "../netlify/functions/get-catalog.mjs";

function originRef(source, brand, id) {
  return "o_" + createHash("sha256")
    .update(source + "|" + brand.toLowerCase() + "|" + id)
    .digest("hex").slice(0, 24);
}

test("API filtra somente a Miniatura Atherri Afeer incorreta e preserva os demais origin_refs", () => {
  const data = {
    feminino: [{
      brand: "Afeer",
      cat: "Miniaturas",
      items: [
        { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "105,00", atacado: "75,00", origin_ref: originRef("imarat", "Afeer", "1481"), fonte: "perfumaria" },
        { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "95,00", atacado: "65,00", origin_ref: originRef("imarat", "Afeer", "1474"), fonte: "perfumaria" },
        { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "110,00", atacado: "80,00", origin_ref: originRef("imarat", "Afeer", "9999"), fonte: "perfumaria" },
        { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "105,00", atacado: "75,00", origin_ref: originRef("outra", "Afeer", "1481"), fonte: "perfumaria" }
      ]
    }]
  };

  const result = filterExcludedAtherri(data);
  assert.equal(result.removed, 1);
  assert.deepEqual(
    result.DATA.feminino[0].items.map(item => item.origin_ref),
    [originRef("imarat", "Afeer", "1474"), originRef("imarat", "Afeer", "9999"), originRef("outra", "Afeer", "1481")]
  );
  assert.equal(data.feminino[0].items.length, 4, "a filtragem não deve mutar o payload original");
});
