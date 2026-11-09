/**
 * Auditoria somente leitura das miniaturas publicadas no catálogo Empório A.R.
 * Busca o snapshot atual do Gist e lista possíveis duplicatas sem alterar dados.
 * Preços varejo/atacado são apenas reportados; nunca recalculados ou gravados.
 */
const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";
const token = process.env.GIST_TOKEN;
if (!token) throw new Error("GIST_TOKEN não configurado.");

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "EmporioAR-Miniature-Audit/1.0",
};
const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });
if (!response.ok) throw new Error(`Falha ao ler Gist: HTTP ${response.status}`);
const gist = await response.json();
const file = gist.files?.["catalogo.json"];
if (!file) throw new Error("Gist não contém catalogo.json.");
let raw = file.content;
if (file.truncated || !raw) {
  if (!file.raw_url) throw new Error("Gist truncado e sem raw_url para leitura completa.");
  const rawResponse = await fetch(file.raw_url, { headers });
  if (!rawResponse.ok) throw new Error(`Falha ao baixar snapshot completo: HTTP ${rawResponse.status}`);
  raw = await rawResponse.text();
}
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const snapshot = JSON.parse(raw);
const DATA = snapshot.DATA || snapshot;
if (!DATA || typeof DATA !== "object" || Array.isArray(DATA)) throw new Error("Estrutura DATA inválida.");

const norm = (value) => String(value || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const brandsInName = [
  "armaf", "lattafa", "orientica", "afeer", "clive dorris",
  "french avenue", "maison alhambra", "al wataniah", "only you",
  "mais you", "meryam",
];
function baseMiniName(name) {
  let value = norm(name).replace(/\s*\d+\s*(ml|g)\b/gi, "").replace(/\s+/g, " ").trim();
  const prefixes = ["miniatura armaf", "mini armaf", "miniatura", "mini"];
  for (const prefix of prefixes) {
    if (value.startsWith(prefix + " ")) { value = value.slice(prefix.length).trim(); break; }
    if (value === prefix) { value = ""; break; }
  }
  for (const brand of [...brandsInName].sort((a,b) => b.length-a.length)) {
    const b = norm(brand);
    if (value.startsWith(b + " ")) value = value.slice(b.length).trim();
    if (value.endsWith(" " + b)) value = value.slice(0, -(b.length + 1)).trim();
  }
  return value;
}
function volumeOf(item) {
  const explicit = String(item?.volume || "").trim();
  if (explicit && explicit !== "—") return norm(explicit);
  const match = String(item?.nome || "").match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  return match ? norm(match[1].replace(",", ".") + match[2]) : "sem-volume";
}
function isMini(item, group) {
  const name = norm(item?.nome);
  const category = norm(group?.cat);
  const volume = volumeOf(item);
  const ml = Number.parseFloat(volume);
  return name.includes("mini ") || name.includes("miniatura") || name.includes("mini-")
    || category.includes("miniatura") || (volume !== "sem-volume" && volume.endsWith("ml") && Number.isFinite(ml) && ml <= 50);
}

const records = [];
for (const [line, groups] of Object.entries(DATA)) {
  if (!Array.isArray(groups)) continue;
  for (const group of groups) {
    for (const item of (Array.isArray(group?.items) ? group.items : [])) {
      if (!isMini(item, group)) continue;
      const name = baseMiniName(item.nome);
      if (!name) continue;
      records.push({
        line, brand: String(group.brand || "Sem marca"),
        category: String(group.cat || "Sem categoria"),
        name: String(item.nome || ""), volume: volumeOf(item),
        varejo: item.varejo ?? "não informado",
        atacado: item.atacado ?? "não informado",
        key: name + "|" + volumeOf(item),
      });
    }
  }
}
const buckets = new Map();
for (const record of records) {
  if (!buckets.has(record.key)) buckets.set(record.key, []);
  buckets.get(record.key).push(record);
}
const duplicates = [...buckets.entries()].filter(([, items]) => items.length > 1);
const priceConflicts = duplicates.filter(([, items]) =>
  new Set(items.map(x => String(x.varejo) + "|" + String(x.atacado))).size > 1
);
console.log("AUDITORIA SOMENTE LEITURA — MINIATURAS DO CATÁLOGO");
console.log(`Miniaturas analisadas: ${records.length}`);
console.log(`Grupos com possível duplicidade (nome normalizado + volume): ${duplicates.length}`);
console.log(`Grupos com preços varejo/atacado diferentes: ${priceConflicts.length}`);
console.log("Nenhum preço foi recalculado. Nenhum produto foi removido. Nenhuma gravação foi feita no Gist.");
for (const [key, items] of duplicates) {
  console.log("\\nPOSSÍVEL DUPLICIDADE: " + key);
  for (const item of items) {
    console.log(JSON.stringify({
      linha: item.line, marca: item.brand, categoria: item.category,
      nome: item.name, volume: item.volume,
      varejo: item.varejo, atacado: item.atacado,
    }));
  }
}
if (duplicates.length === 0) console.log("Nenhuma possível duplicidade encontrada com a chave conservadora.");
