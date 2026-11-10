/**
 * Resolve a linha interna correspondente a um registro público apenas quando
 * varejo e atacado identificam exatamente uma variante.
 * Nome/marca/volume iguais não autorizam herdar o ID de outra variante.
 */
export function findExactInternalPriceMatch(candidates, publicItem) {
  if (!Array.isArray(candidates) || !publicItem) return null;
  const matches = candidates.filter(candidate =>
    String(candidate?.varejo ?? "") === String(publicItem?.varejo ?? "") &&
    String(candidate?.atacado ?? "") === String(publicItem?.atacado ?? "")
  );
  return matches.length === 1 ? matches[0] : null;
}
