/**
 * A marca precoManual deve representar uma decisão manual explícita.
 * Divergência entre o Gist e a base interna, por si só, não é evidência
 * de edição manual: os preços públicos podem ser recalculados pelas regras
 * de origem durante a sincronização.
 */
import { isFourPiecePerfumeKit } from "./four-piece-perfume-kit-pricing.mjs";

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

/**
 * Os kits Liquid e Hawas de quatro peças tiveram uma marcação manual antiga
 * indevida. Para esses dois registros, a regra de preço por origem deve ser
 * aplicada mesmo que a marcação histórica ainda exista. Outros preços manuais
 * explícitos continuam protegidos.
 */
export function shouldProtectManualPrice(item, category) {
  if (!isExplicitManualPrice(item)) return false;
  const name = String(item?.nome ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  const isAffectedKit = /^kit (?:liquid|hawas)(?:\s|$)/.test(name) &&
    isFourPiecePerfumeKit(item?.nome, category);
  return !isAffectedKit;
}
