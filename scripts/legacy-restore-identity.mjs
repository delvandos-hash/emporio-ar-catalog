export function legacyPhotoFingerprint(item) {
  const photos = Array.isArray(item?.fotos) && item.fotos.length ? item.fotos : (item?.foto ? [item.foto] : []);
  return [...new Set(photos.map(x => String(x ?? "").trim()).filter(Boolean))].sort().join("~");
}

export function resolveLegacyStockMatch(stockMatches, identityMatches, publicItem) {
  const publicId = String(publicItem?.public_id || "").trim();
  if (publicId) {
    const byPublicId = stockMatches.filter(row => String(row?.publicItem?.public_id || "").trim() === publicId);
    if (byPublicId.length === 1) return byPublicId[0];
  }
  const identitySet = new Set(identityMatches);
  const byIdentity = stockMatches.filter(row => identitySet.has(row));
  if (byIdentity.length === 1) return byIdentity[0];
  const photo = legacyPhotoFingerprint(publicItem);
  if (photo) {
    const candidates = (byIdentity.length ? byIdentity : stockMatches)
      .filter(row => legacyPhotoFingerprint(row?.publicItem) === photo);
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}
