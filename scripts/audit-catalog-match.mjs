import { createHash } from "node:crypto";

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

/**
 * Resolve the exact Imarat source record from the stable public origin_ref.
 * The source ID is part of the hash, so same-name products with different
 * Imarat IDs remain distinct.
 */
export function findImaratSourceByOriginRef(source, originRef) {
  const expected = String(originRef ?? "").trim();
  if (!expected || !Array.isArray(source)) return null;
  const matches = source.filter(product => {
    const id = String(product?.id ?? product?.productId ?? product?.slug ?? "").trim();
    if (!id) return false;
    const brand = String(product?.brand ?? "").trim().toLowerCase();
    const ref = "o_" + createHash("sha256")
      .update("imarat|" + brand + "|" + id)
      .digest("hex").slice(0, 24);
    return ref === expected;
  });
  return matches.length === 1 ? matches[0] : null;
}
