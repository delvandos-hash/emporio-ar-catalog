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
export function normalProductKey(nome, volume) {
  const name = normalizeIdentity(nome).replace(/\s*\d+(?:[.,]\d+)?\s*(?:ml|g)\b/g, "").trim();
  return [name, normalizedVolume(volume)].join("|");
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
