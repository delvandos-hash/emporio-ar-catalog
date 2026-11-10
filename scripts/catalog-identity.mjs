// Identidade conservadora de produtos para o catálogo Empório A.R.
// Não usa similaridade aproximada. Diferenças de marca, volume, preço ou fotos
// impedem que miniaturas sejam confundidas como duplicatas.
export function normalizeIdentity(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function normalizedVolume(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "").replace(",", ".");
}
export function normalProductNameVolumeKey(nome, volume) {
  const name = normalizeIdentity(nome).replace(/\s*\d+(?:[.,]\d+)?\s*(?:ml|g)\b/g, "").trim();
  return [name, normalizedVolume(volume)].join("|");
}
export function normalProductKey(nome, volume, brand) {
  return [normalizeIdentity(brand), normalProductNameVolumeKey(nome, volume)].join("|");
}
function miniBaseName(nome, brand) {
  let name = normalizeIdentity(nome)
    .replace(/\s*\d+(?:[.,]\d+)?\s*(?:ml|g)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const prefix of ["miniatura armaf", "mini armaf", "miniatura", "mini"]) {
    if (name.startsWith(prefix + " ")) { name = name.slice(prefix.length).trim(); break; }
    if (name === prefix) { name = ""; break; }
  }
  const brandKey = normalizeIdentity(brand);
  if (brandKey && name.startsWith(brandKey + " ")) name = name.slice(brandKey.length).trim();
  if (brandKey && name.endsWith(" " + brandKey)) name = name.slice(0, -(brandKey.length + 1)).trim();
  return name;
}
function imageFingerprint(item) {
  const images = Array.isArray(item?.fotos) && item.fotos.length ? item.fotos : (item?.foto ? [item.foto] : []);
  return [...new Set(images.map(x => String(x ?? "").trim()).filter(Boolean))].sort().join("~");
}
export function miniIdentityBaseKey(item, brand) {
  return [miniBaseName(item?.nome, brand), normalizeIdentity(brand), normalizedVolume(item?.volume)].join("|");
}
export function miniIdentityKey(item, brand) {
  return [miniIdentityBaseKey(item, brand), String(item?.varejo ?? "").trim(), String(item?.atacado ?? "").trim(), imageFingerprint(item)].join("|");
}

export function miniIdentityNameVolumeKey(item) {
  return [miniBaseName(item?.nome, ""), normalizedVolume(item?.volume)].join("|");
}

export function isDuplicateMiniSource(existingItems, candidateOriginId) {
  if (!Array.isArray(existingItems) || existingItems.length === 0) return false;
  const candidateId = String(candidateOriginId ?? "").trim();
  if (!candidateId) return true;
  const existingIds = existingItems.map(item => String(item?.id_origem ?? item?.originId ?? "").trim());
  if (existingIds.includes(candidateId)) return true;
  // Se algum registro legado não tem ID, aplica o fallback marca + nome + volume.
  return existingIds.some(id => !id);
}

function normalizedPrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = Number(raw.includes(",") ? raw.replace(/\\./g, "").replace(",", ".") : raw);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : normalizeIdentity(raw);
}

function normalizedImages(item) {
  const images = Array.isArray(item?.fotos) && item.fotos.length
    ? item.fotos
    : (item?.foto ? [item.foto] : []);
  return [...new Set(images.map(x => String(x ?? "").trim()).filter(Boolean))].sort().join("~");
}

function stableFingerprintValue(value) {
  if (Array.isArray(value)) return value.map(stableFingerprintValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableFingerprintValue(value[key])]));
  }
  return value;
}

// Só remove uma cópia quando todos os campos do produto e seu contexto são idênticos.
// Marca, linha, categoria, ID, estoque, preço, imagens ou qualquer metadado diferente preservam o registro.
export function exactCatalogFingerprint(item, brand, source, line = "", category = "") {
  return JSON.stringify({
    line: normalizeIdentity(line),
    category: normalizeIdentity(category),
    brand: normalizeIdentity(brand),
    source: normalizeIdentity(source || item?.fonte || ""),
    item: stableFingerprintValue(item || {}),
  });
}


// Bloqueio persistente de um cadastro Imarat confirmado como incorreto.
// A identidade comercial é obrigatória mesmo quando o ID de origem é conhecido,
// para impedir que um ID isolado afete outro produto em uma futura reutilização.
export function isExcludedImaratAtherri(item, brand = "") {
  const name = normalizeIdentity(item?.nome ?? item?.name ?? "");
  const brandKey = normalizeIdentity(brand || item?.brand || "");
  let volume = String(item?.volume ?? item?.sizeMl ?? "").toLowerCase().replace(/\s+/g, "").replace(",", ".");
  if (volume && /^\d+(?:\.\d+)?$/.test(volume)) volume += "ml";
  const isTargetIdentity =
    brandKey === "afeer" &&
    (name === "miniatura atherri afeer" || name === "miniatura atheri afeer") &&
    volume === "30ml";
  if (!isTargetIdentity) return false;

  const id = String(item?.id_origem ?? item?.id ?? item?.productId ?? "").trim();
  if (id === "1481") return true;
  // Um ID de origem diferente de 1481 é preservado, mesmo se o preço legado
  // estiver desatualizado. O fallback por preço só vale para registro sem ID.
  if (id) return false;

  const price = value => {
    const raw = String(value ?? "").trim().replace(/[^0-9,.-]/g, "");
    if (!raw) return NaN;
    return Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
  };
  return price(item?.varejo) === 105 && price(item?.atacado) === 75;
}

const ATHERRI_CORRECT_ORIGIN_REF = "o_9e8adfbf4a5157cb7a048f8f";
const ATHERRI_EXCLUDED_ORIGIN_REF = "o_b8e0e31ca9e4dfafe8a7ecc7";

export function isAtherriAfeerIdentity(item, brand = "") {
  const name = normalizeIdentity(item?.nome ?? item?.name ?? "");
  const brandKey = normalizeIdentity(brand || item?.brand || "");
  let volume = String(item?.volume ?? item?.sizeMl ?? "")
    .toLowerCase().replace(/\s+/g, "").replace(",", ".");
  if (volume && /^\d+(?:\.\d+)?$/.test(volume)) volume += "ml";
  return brandKey === "afeer" && name === "miniatura atherri afeer" && volume === "30ml";
}

export function isCanonicalImaratAtherri(item, brand = "") {
  return isAtherriAfeerIdentity(item, brand) &&
    normalizeIdentity(item?.fonte || "") === "imarat" &&
    String(item?.id_origem ?? item?.id ?? item?.productId ?? "").trim() === "1474";
}

export function isCanonicalAtherriGistRecord(item, brand = "") {
  return isAtherriAfeerIdentity(item, brand) &&
    String(item?.origin_ref || "").trim() === ATHERRI_CORRECT_ORIGIN_REF;
}

export function isExcludedAtherriGistRecord(item, brand = "") {
  return isAtherriAfeerIdentity(item, brand) &&
    String(item?.origin_ref || "").trim() === ATHERRI_EXCLUDED_ORIGIN_REF;
}

// Classificação fechada para os dois registros Atherri Afeer de 30ml no Gist.
// Um registro com origem desconhecida nunca deve ser restaurado por semelhança de nome.
export function atherriGistRecordKind(item, brand = "") {
  if (!isAtherriAfeerIdentity(item, brand)) return "unrelated";
  if (isExcludedAtherriGistRecord(item, brand)) return "excluded";
  if (isCanonicalAtherriGistRecord(item, brand)) return "canonical";
  return "ambiguous";
}
