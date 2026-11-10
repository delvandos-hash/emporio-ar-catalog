function normalizeBrand(value) {
  return String(value ?? "").trim().toLowerCase().normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\\s+/g, " ");
}

export function legacyPhotoFingerprint(item) {
  const photos = Array.isArray(item?.fotos) && item.fotos.length ? item.fotos : (item?.foto ? [item.foto] : []);
  return [...new Set(photos.map(x => String(x ?? "").trim()).filter(Boolean))].sort().join("~");
}

// A referência de estoque pode ser compartilhada ou colidir entre marcas.
// Nenhum public_id/stock_ref é suficiente para cruzar a fronteira de marca.
export function hasPublicIdStockRefConflict(publicIdMatches, publicItem, expectedBrand = "") {
  const brandKey = normalizeBrand(expectedBrand);
  const publicId = String(publicItem?.public_id || "").trim();
  const incomingStock = String(publicItem?.stock_ref || "").trim();
  if (!brandKey || !publicId || !incomingStock) return false;
  const sameBrand = row => normalizeBrand(row?.group?.brand ?? row?.publicItem?.brand ?? row?.brand) === brandKey;
  const matches = [...new Set((Array.isArray(publicIdMatches) ? publicIdMatches : []).filter(sameBrand))]
    .filter(row => String(row?.publicItem?.public_id || "").trim() === publicId);
  if (matches.length !== 1) return false;
  const existingStock = String(matches[0]?.publicItem?.stock_ref || "").trim();
  return Boolean(existingStock && existingStock !== incomingStock);
}

export function resolveLegacyStockMatch(stockMatches, identityMatches, publicItem, publicIdMatches = [], expectedBrand = "") {
  const brandKey = normalizeBrand(expectedBrand);
  if (!brandKey) return null;
  const sameBrand = row => normalizeBrand(row?.group?.brand ?? row?.publicItem?.brand ?? row?.brand) === brandKey;
  const scopedStock = stockMatches.filter(sameBrand);
  const scopedIdentity = identityMatches.filter(sameBrand);
  const scopedPublicId = publicIdMatches.filter(sameBrand);

  const publicId = String(publicItem?.public_id || "").trim();
  const publicIdStockConflict = hasPublicIdStockRefConflict(scopedPublicId, publicItem, expectedBrand);
  if (publicIdStockConflict) {
    // O mesmo public_id com stock_ref diferente representa duas linhas vivas
    // distintas até prova em contrário. Não funde nem sobrescreve a identidade.
    if (scopedStock.length === 1) return scopedStock[0];
    return null;
  }
  if (publicId) {
    const byPublicId = [...new Set([...scopedStock, ...scopedIdentity, ...scopedPublicId])]
      .filter(row => String(row?.publicItem?.public_id || "").trim() === publicId);
    if (byPublicId.length === 1) return byPublicId[0];
  }

  // Um stock_ref único só é definitivo depois do recorte pela marca esperada.
  if (scopedStock.length === 1) return scopedStock[0];
  const identitySet = new Set(scopedIdentity);
  const byIdentity = scopedStock.filter(row => identitySet.has(row));
  const candidates = byIdentity.length ? byIdentity : (scopedStock.length ? scopedStock : scopedIdentity);
  if (candidates.length === 1) return candidates[0];

  const photo = legacyPhotoFingerprint(publicItem);
  if (photo && candidates.length > 1) {
    const byPhoto = candidates.filter(row => legacyPhotoFingerprint(row?.publicItem) === photo);
    if (byPhoto.length === 1) return byPhoto[0];

    // Se o Gist antigo e um registro atual da fonte raiz compartilham a
    // mesma identidade e fotografia, prioriza o único registro com origem
    // confirmada (fonte + ID). Isso evita manter uma cópia legada duplicada,
    // sem escolher entre duas variantes reais da origem.
    if (byPhoto.length > 1) {
      const sourceConfirmed = byPhoto.filter(row =>
        String(row?.item?.fonte || "").trim() &&
        normalizeBrand(row?.item?.fonte) !== "legacy gist" &&
        String(row?.item?.id_origem || "").trim()
      );
      if (sourceConfirmed.length === 1) return sourceConfirmed[0];
    }
  }
  return null;
}
