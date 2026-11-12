/**
 * A marca precoManual deve representar uma decisão manual explícita.
 * Divergência entre o Gist e a base interna, por si só, não é evidência
 * de edição manual: os preços públicos podem ser recalculados pelas regras
 * de origem durante a sincronização.
 */
export function isExplicitManualPrice(item) {
  return item?.precoManual === true ||
    item?.precoManual === "true" ||
    item?.precoManual === 1;
}

function priceNumber(value) {
  const raw = String(value ?? "").trim().replace(/[^0-9,.-]/g, "");
  if (!raw) return NaN;
  return Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
}

/**
 * Reaproveita os preços públicos anteriores sem converter automaticamente
 * uma divergência em precoManual. Retorna true quando copiou os preços.
 * Registros com precoManual explícito permanecem totalmente protegidos.
 */
export function preservePublicPrice(target, publicItem) {
  if (isExplicitManualPrice(target)) return false;
  const publicRetail = priceNumber(publicItem?.varejo);
  const publicWholesale = priceNumber(publicItem?.atacado);
  const currentRetail = priceNumber(target?.varejo);
  const currentWholesale = priceNumber(target?.atacado);
  if (!Number.isFinite(publicRetail) || !Number.isFinite(publicWholesale) ||
      (publicRetail === currentRetail && publicWholesale === currentWholesale)) {
    return false;
  }
  target.varejo = publicItem.varejo;
  target.atacado = publicItem.atacado;
  return true;
}
