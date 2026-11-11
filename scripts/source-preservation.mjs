export function shouldRemoveUnmatchedSourceItem({ sourceCollectionComplete = false, sourceEnabled = true } = {}) {
  // Ausência só prova exclusão depois de coletar integralmente a fonte ativa.
  return sourceCollectionComplete === true && sourceEnabled === true;
}

export function canMergeLegacyClothesClone({ rootId, existingOriginId, sameName, sameVolume } = {}) {
  const expected = String(rootId || "").trim();
  const actual = String(existingOriginId || "").trim();
  return Boolean(expected && actual === expected && sameName === true && sameVolume === true);
}
