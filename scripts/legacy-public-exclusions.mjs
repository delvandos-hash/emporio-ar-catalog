/**
 * Exclusão pública pontual do registro Imarat 1481 da Miniatura Atherri Afeer.
 * O origin_ref é o hash estável de imarat|afeer|1481; o ID 1474 tem outro hash.
 * Exige também marca, nome e volume exatos para impedir remoções por semelhança.
 */
export const EXCLUDED_ATHERRI_1481_ORIGIN_REF = "o_b8e0e31ca9e4dfafe8a7ecc7";

function norm(value) {
  return String(value ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function volumeOf(item) {
  const raw = String(item?.volume ?? "").trim();
  const value = raw || String(item?.nome ?? "");
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  return match ? String(Number(match[1].replace(",", "."))) + match[2].toLowerCase() : "";
}

export function isExcludedLegacyAtherri(item, group) {
  return norm(group?.brand) === "afeer" &&
    norm(item?.nome) === "miniatura atherri afeer" &&
    volumeOf(item) === "30ml" &&
    String(item?.origin_ref ?? "").trim() === EXCLUDED_ATHERRI_1481_ORIGIN_REF;
}

export function removeExcludedLegacyAtherri(DATA) {
  let removed = 0;
  for (const groups of Object.values(DATA ?? {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      const items = Array.isArray(group?.items) ? group.items : [];
      const kept = items.filter(item => {
        if (!isExcludedLegacyAtherri(item, group)) return true;
        removed++;
        return false;
      });
      group.items = kept;
    }
  }
  return removed;
}
