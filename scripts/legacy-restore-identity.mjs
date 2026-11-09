export function legacyPhotoFingerprint(item) {
  const photos = Array.isArray(item?.fotos) && item.fotos.length ? item.fotos : (item?.foto ? [item.foto] : []);
  return [...new Set(photos.map(x => String(x ?? "").trim()).filter(Boolean))].sort().join("~");
}

export function resolveLegacyStockMatch(stockMatches, identityMatches, publicItem, publicIdMatches = []) {
  const publicId = String(publicItem?.public_id || "").trim();
  if (publicId) {
    const byPublicId = [...new Set([...stockMatches, ...identityMatches, ...publicIdMatches])]
      .filter(row => String(row?.publicItem?.public_id || "").trim() === publicId);
    if (byPublicId.length === 1) return byPublicId[0];
  }

  if (stockMatches.length === 1) return stockMatches[0];
  const identitySet = new Set(identityMatches);
  const byIdentity = stockMatches.filter(row => identitySet.has(row));
  const candidates = byIdentity.length ? byIdentity : (stockMatches.length ? stockMatches : identityMatches);
  if (candidates.length === 1) return candidates[0];

  const photo = legacyPhotoFingerprint(publicItem);
  if (photo && candidates.length > 1) {
    const byPhoto = candidates.filter(row => legacyPhotoFingerprint(row?.publicItem) === photo);
    if (byPhoto.length === 1) return byPhoto[0];
  }
  return null;
}
