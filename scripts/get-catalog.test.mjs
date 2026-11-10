import test from "node:test";
import assert from "node:assert/strict";
import { filterExcludedAtherri } from "../netlify/functions/get-catalog.mjs";

test("API filtra somente a Miniatura Atherri Afeer incorreta e preserva o cadastro correto", () => {
  const data = {
    feminino: [{
      brand: "Afeer",
      cat: "Miniaturas",
      items: [
        { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "105,00", atacado: "75,00", id_origem: "1481", fonte: "Imarat" },
        { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "95,00", atacado: "65,00", id_origem: "1474", fonte: "Imarat" },
        { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "110,00", atacado: "80,00", id_origem: "9999", fonte: "Imarat" },
        { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "105,00", atacado: "75,00", id_origem: "1481", fonte: "Outra" }
      ]
    }]
  };

  const result = filterExcludedAtherri(data);
  assert.equal(result.removed, 1);
  assert.deepEqual(result.DATA.feminino[0].items.map(item => item.id_origem), ["1474", "9999", "1481"]);
  assert.equal(data.feminino[0].items.length, 4, "a filtragem não deve mutar o payload original");
});
