/** Compatibilidade de favoritos sem expor identificadores internos. */
export function isFavoriteId(favorites, publicId, legacyId) {
  if (!Array.isArray(favorites)) return false;
  return [publicId, legacyId].some((id) =>
    typeof id === 'string' && id.length > 0 && favorites.includes(id)
  );
}
