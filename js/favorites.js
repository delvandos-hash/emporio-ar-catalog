/** Compatibilidade de favoritos sem expor identificadores internos. */
export function isFavoriteId(favorites, publicId, legacyId) {
  const has = favorites instanceof Set
    ? (id) => favorites.has(id)
    : Array.isArray(favorites)
      ? (id) => favorites.includes(id)
      : () => false;
  return [publicId, legacyId].some((id) =>
    typeof id === 'string' && id.length > 0 && has(id)
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


/** Mantém todos os grupos de origem e retorna somente os itens favoritados. */
export function filterFavoriteGroups(groups, isFavorite) {
  if (!Array.isArray(groups) || typeof isFavorite !== 'function') return [];
  return groups
    .map((group) => ({
      ...group,
      items: (Array.isArray(group.items) ? group.items : [])
        .filter((item) => isFavorite(item, group)),
    }))
    .filter((group) => group.items.length > 0);
}


/** Junta os favoritos em uma lista plana, preservando a origem de cada produto. */
export function collectFavoriteProducts(groups, isFavorite) {
  if (!Array.isArray(groups) || typeof isFavorite !== 'function') return [];
  const seen = new Set();
  const result = [];
  for (const group of groups) {
    for (const item of Array.isArray(group.items) ? group.items : []) {
      if (!isFavorite(item, group)) continue;
      const key = [group.brand || item.brand || '', item.nome || '', item.volume || ''].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ ...item, brand: item.brand || group.brand || '', cat: item.cat || group.cat || '', line: item.line || group.line || '' });
    }
  }
  return result;
}
