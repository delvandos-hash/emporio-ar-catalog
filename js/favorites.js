/** Compatibilidade de favoritos sem expor identificadores internos. */
export function isFavoriteId(favorites, publicId, legacyId) {
  if (!Array.isArray(favorites)) return false;
  return [publicId, legacyId].some((id) =>
    typeof id === 'string' && id.length > 0 && favorites.includes(id)
  );
}

/** Remove a chave pública e a chave legada reconhecível; adiciona só a pública. */
export function toggleFavoriteIds(favorites, publicId, legacyId) {
  const current = Array.isArray(favorites) ? favorites : [];
  if (isFavoriteId(current, publicId, legacyId)) {
    return current.filter((id) => id !== publicId && (!legacyId || id !== legacyId));
  }
  return typeof publicId === 'string' && publicId.length > 0
    ? [publicId, ...current]
    : current.slice();
}
