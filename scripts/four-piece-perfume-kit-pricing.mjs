/**
 * Regra de preço para kits de perfumes com quatro peças.
 * Usa os preços originais da fonte; não copia valores de outro produto.
 */
const norm = (value) => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

export function isFourPiecePerfumeKit(name, category) {
  const value = norm(name);
  const categoryValue = norm(category);
  // Kits de miniaturas continuam sendo kits de perfume; outras categorias
  // (acessórios, maquiagem, vestuário etc.) ficam fora desta regra.
  if (!/\b(?:perfumes?|perfumaria|miniaturas?)\b/.test(categoryValue)) return false;
  if (!/\bkit\b/.test(value)) return false;

  return /\b4\s*(?:pecas?|pcs?|unidades?|frascos?)\b/.test(value)
    || /\b4\s*x\s*\d+(?:\s*ml)?\b/.test(value)
    || /\b\d+(?:\s*ml)?\s*x\s*4\s*(?:pcs?|pecas?)?\b/.test(value)
    || /\bx\s*4\s*pcs?\b/.test(value);
}

function fmtBRL(value) {
  return Number(value).toFixed(2).replace(".", ",");
}

export function calculateFourPiecePerfumeKitPrices(retailOriginal, wholesaleOriginal) {
  return {
    varejo: fmtBRL(Number(retailOriginal) + 130),
    atacado: fmtBRL(Number(wholesaleOriginal) + 125),
  };
}
