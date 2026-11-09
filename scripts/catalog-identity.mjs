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

// Só considera duplicata quando todos os atributos de identidade e exibição coincidem.
// Diferenças de marca, volume, ID de origem, preço ou imagens preservam o registro.
export function exactCatalogFingerprint(item, brand, source) {
  return [
    normalizeIdentity(brand),
    normalizeIdentity(item?.nome),
    normalizedVolume(item?.volume),
    normalizeIdentity(source || item?.fonte || ""),
    String(item?.id_origem ?? "").trim(),
    normalizedPrice(item?.varejo),
    normalizedPrice(item?.atacado),
    normalizedImages(item),
  ].join("|");
}
