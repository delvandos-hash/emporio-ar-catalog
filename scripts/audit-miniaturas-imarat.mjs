import { readFileSync } from "node:fs";
/**
 * Auditoria somente leitura das miniaturas do catálogo Empório A.R.
 * Lê o snapshot do Gist e a lista atual da Imarat. Nunca grava ou recalcula preços.
 * Compara preços publicados com a fórmula automática apenas como diagnóstico;
 * preços manuais podem ser exceção e não são identificáveis no snapshot público.
 */
const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";
const token = process.env.GIST_TOKEN;
const IMARAT_API = process.env.IMARAT_API_URL;
if (!token) throw new Error("GIST_TOKEN não configurado.");
if (!IMARAT_API) throw new Error("IMARAT_API_URL não configurado.");

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "EmporioAR-Miniature-Audit/1.0",
};
const gistResponse = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });
if (!gistResponse.ok) throw new Error(`Falha ao ler Gist: HTTP ${gistResponse.status}`);
const gist = await gistResponse.json();
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
  .replace(/['’]s\b/gi, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const fmtBRL = (value) => Number(value).toFixed(2).replace(".", ",");
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
  if (explicit && explicit !== "—") return norm(explicit).replaceAll(" ", "");
  const match = String(item?.nome || "").match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  return match ? norm(match[1].replace(",", ".") + match[2]) : "sem-volume";
}
function volumeFrom(value, name) {
  let raw = String(value || "").trim();
  if (raw && /^\d+(?:[.,]\d+)?$/.test(raw)) raw += "ml";
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i)
    || String(name || "").match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  return match ? norm(match[1].replace(",", ".") + match[2]) : "";
}
function isOleo(name) {
  const n = norm(name);
  return n.startsWith("oleo") || n.includes(" oleo ");
}
function isMini(item, group) {
  const name = norm(item?.nome);
  const category = norm(group?.cat);
  if (isOleo(item?.nome)) return false;
  const volume = volumeOf(item);
  const ml = Number.parseFloat(volume);
  return name.includes("mini ") || name.includes("miniatura") || name.includes("mini-")
    || category.includes("miniatura") || (volume !== "sem-volume" && volume.endsWith("ml") && Number.isFinite(ml) && ml <= 50);
}

// O data.js versionado mantém metadados internos (incluindo precoManual)
// que são removidos corretamente da projeção pública do Gist.
const localDataText = readFileSync(new URL("../js/data.js", import.meta.url), "utf8");
const dataMarker = "export const DATA = ";
const dataStart = localDataText.indexOf(dataMarker);
const dataEnd = localDataText.indexOf(";\nexport const WHATSAPP", dataStart);
if (dataStart < 0 || dataEnd < 0) throw new Error("Não foi possível ler DATA interno de js/data.js.");
const INTERNAL_DATA = JSON.parse(localDataText.slice(dataStart + dataMarker.length, dataEnd));
const internalIndex = new Map();
for (const [line, groups] of Object.entries(INTERNAL_DATA)) {
  if (!Array.isArray(groups)) continue;
  for (const group of groups) {
    for (const item of (Array.isArray(group?.items) ? group.items : [])) {
      const key = [norm(line), norm(group.brand), baseMiniName(item.nome), volumeOf(item)].join("|");
      if (!internalIndex.has(key)) internalIndex.set(key, []);
      internalIndex.get(key).push(item);
    }
  }
}

// Duplicidade por ID de origem é evidência mais forte do que apenas nome parecido.
const byOriginId = new Map();
for (const [line, groups] of Object.entries(INTERNAL_DATA)) {
  if (!Array.isArray(groups)) continue;
  for (const group of groups) {
    for (const item of (Array.isArray(group?.items) ? group.items : [])) {
      if (!item?.id_origem || item.fonte !== "imarat" || !isMini(item, group)) continue;
      const id = String(item.id_origem);
      if (!byOriginId.has(id)) byOriginId.set(id, []);
      byOriginId.get(id).push({
        line, brand: group.brand, category: group.cat, name: item.nome,
        volume: volumeOf(item), varejo: item.varejo, atacado: item.atacado,
        precoManual: item.precoManual ?? false, fonte: item.fonte,
      });
    }
  }
}
const duplicateOriginIds = [...byOriginId.entries()].filter(([, items]) => items.length > 1);
function isOleoCliveDorris(name, brand) { return norm(brand).includes("clive") && norm(name).includes("oleo"); }
function isKit2em1(name) { return norm(name).includes("kit 2 em 1"); }
function isMiniaturaBolsa(name) { return norm(name).includes("bolsa"); }
function isKitVulcanOuMiniatura9(name) {
  const n = norm(name);
  return n.includes("kit vulcan") || (n.includes("vulcan") && n.includes("kit")) || n.includes("kit miniatura 9");
}
function isKitMusaman(name) { return norm(name).includes("kit musaman"); }
function isKitLattafa(name, brand) { return norm(brand).includes("lattafa") && norm(name).includes("kit"); }
function isKit2em1Price(name) { return norm(name).includes("kit 2 em 1"); }
function automaticMiniPrice(name, brand, volume, category, retailOriginal, wholesaleOriginal) {
  // Espelha integralmente calcularPrecoMiniatura do sincronizador homologado na main.
  const n = norm(name), b = norm(brand);
  const mini = n.includes("mini ") || n.includes("miniatura") || n.includes("mini-")
    || norm(category).includes("miniatura")
    || (volume && Number.parseFloat(String(volume).replace("ml", "")) <= 50);
  if (!mini) return { varejo: fmtBRL(retailOriginal + 30), atacado: fmtBRL(wholesaleOriginal + 30) };
  if (isKit2em1Price(name)) return { varejo: fmtBRL(85), atacado: fmtBRL(55) };
  if (isMiniaturaBolsa(name)) return { varejo: fmtBRL(65), atacado: fmtBRL(45) };
  if (isOleoCliveDorris(name, brand)) return { varejo: fmtBRL(55), atacado: fmtBRL(44) };
  if (isKitVulcanOuMiniatura9(name)) return { varejo: fmtBRL(retailOriginal + 130), atacado: fmtBRL(wholesaleOriginal + 125) };
  if (isKitMusaman(name)) return { varejo: fmtBRL(retailOriginal + 60), atacado: fmtBRL(wholesaleOriginal + 65) };
  if (isKitLattafa(name, brand)) return { varejo: fmtBRL(retailOriginal + 110), atacado: fmtBRL(wholesaleOriginal + 90) };
  if (b.includes("orientica")) return { varejo: fmtBRL(retailOriginal + 75), atacado: fmtBRL(wholesaleOriginal + 45) };
  if (b.includes("afeer")) return { varejo: fmtBRL(retailOriginal + 40), atacado: fmtBRL(wholesaleOriginal + 30) };
  if (b.includes("clive")) return { varejo: fmtBRL(retailOriginal + 70), atacado: fmtBRL(wholesaleOriginal + 40) };
  if (b.includes("only")) return { varejo: fmtBRL(retailOriginal + 60), atacado: fmtBRL(wholesaleOriginal + 40) };
  if (b.includes("armaf")) return { varejo: fmtBRL(retailOriginal + 70), atacado: fmtBRL(wholesaleOriginal + 40) };
  if (b.includes("lattafa")) return { varejo: fmtBRL(retailOriginal + 60), atacado: fmtBRL(wholesaleOriginal + 40) };
  if (b.includes("mais you")) return { varejo: fmtBRL(retailOriginal + 60), atacado: fmtBRL(wholesaleOriginal + 40) };
  if (b.includes("maison")) return { varejo: fmtBRL(retailOriginal + 60), atacado: fmtBRL(wholesaleOriginal + 40) };
  if (b.includes("meryam") || n.includes("meryam")) return { varejo: fmtBRL(retailOriginal + 60), atacado: fmtBRL(wholesaleOriginal + 40) };
  if (b.includes("french")) return { varejo: fmtBRL(retailOriginal + 60), atacado: fmtBRL(wholesaleOriginal + 40) };
  if (b.includes("al wataniah")) return { varejo: fmtBRL(retailOriginal + 70), atacado: fmtBRL(wholesaleOriginal + 45) };
  if (b.includes("arabic")) return { varejo: fmtBRL(retailOriginal + 70), atacado: fmtBRL(wholesaleOriginal + 40) };
  if (b.includes("club woman") || n.includes("club woman")) return { varejo: fmtBRL(retailOriginal + 75), atacado: fmtBRL(wholesaleOriginal + 45) };
  if (b.includes("outros") || b.includes("outra")) return { varejo: fmtBRL(retailOriginal + 60), atacado: fmtBRL(wholesaleOriginal + 40) };
  return { varejo: fmtBRL(retailOriginal + 30), atacado: fmtBRL(wholesaleOriginal + 30) };
}
async function fetchImaratList() {
  const all = [];
  let page = 1, total = 0, fetched = 0;
  for (let count = 0; count < 40; count++) {
    const response = await fetch(`${IMARAT_API}?page=${page}&perPage=60`, {
      headers: { "User-Agent": "EmporioAR-Miniature-Audit/1.0", Accept: "application/json", "Accept-Charset": "utf-8" },
    });
    if (!response.ok) throw new Error(`Imarat list HTTP ${response.status}`);
    const data = await response.json();
    total = data.total || total;
    const products = data.products || [];
    if (!products.length) break;
    all.push(...products);
    fetched += products.length;
    if (fetched >= total || products.length < 60) break;
    page++;
  }
  return all;
}
const imaratList = await fetchImaratList();
console.log(`Produtos lidos da Imarat: ${imaratList.length}`);

function sourceMatch(item, group) {
  const name = norm(item?.nome);
  const itemVolume = volumeOf(item);
  const matches = imaratList.filter(p => {
    if (norm(p.name) !== name) return false;
    const sourceVolume = volumeFrom(p.sizeMl, p.name);
    return !itemVolume || itemVolume === "sem-volume" || !sourceVolume || itemVolume === sourceVolume;
  });
  if (!matches.length) return null;
  const brand = norm(group?.brand);
  const strict = matches.find(p => {
    const sourceBrand = norm(p.brand);
    return Boolean(brand && sourceBrand && (
      sourceBrand === brand || sourceBrand.includes(brand) || brand.includes(sourceBrand)
    ));
  });
  if (strict) return strict;
  if (["outros", "outra"].includes(brand)) return matches.find(p => !norm(p.brand)) || null;
  return null;
}

const records = [];
let sourceMatches = 0, automaticPriceDifferences = 0, internalMatches = 0, manualPriceProtected = 0;
const priceRuleDifferences = [];
for (const [line, groups] of Object.entries(DATA)) {
  if (!Array.isArray(groups)) continue;
  for (const group of groups) {
    for (const item of (Array.isArray(group?.items) ? group.items : [])) {
      if (!isMini(item, group)) continue;
      const name = baseMiniName(item.nome);
      if (!name) continue;
      const source = sourceMatch(item, group);
      const internalKey = [norm(line), norm(group.brand), name, volumeOf(item)].join("|");
      const internalCandidates = internalIndex.get(internalKey) || [];
      const internal = internalCandidates.find(candidate =>
        String(candidate.varejo) === String(item.varejo) && String(candidate.atacado) === String(item.atacado)
      ) || internalCandidates[0] || null;
      if (internal) internalMatches++;
      let expected = null;
      if (source) {
        sourceMatches++;
        const retailOriginal = Number(source.priceCents || 0) / 100;
        const wholesaleOriginal = source.atacado?.precoCents != null
          ? Number(source.atacado.precoCents) / 100 : Math.max(retailOriginal - 30, 0);
        const sourceCategory = String(source.categoria_nome || source.categoria || "");
        expected = automaticMiniPrice(item.nome, group.brand, volumeOf(item), sourceCategory, retailOriginal, wholesaleOriginal);
        if (internal?.precoManual === true || internal?.precoManual === "true" || internal?.precoManual === 1) {
          manualPriceProtected++;
        } else if (String(item.varejo) !== expected.varejo || String(item.atacado) !== expected.atacado) {
          automaticPriceDifferences++;
          priceRuleDifferences.push({
            line, brand: String(group.brand || "Sem marca"), name: String(item.nome || ""),
            volume: volumeOf(item), currentRetail: item.varejo ?? "não informado",
            currentWholesale: item.atacado ?? "não informado",
            expectedRetail: expected.varejo, expectedWholesale: expected.atacado,
            sourceName: source.name || "",
            sourceBrand: source.brand || "marca não informada",
            sourceCategory: source.categoria_nome || source.categoria || "categoria não informada",
            sourceVolume: volumeFrom(source.sizeMl, source.name) || "sem volume na origem",
            sourceRetailOriginal: fmtBRL(retailOriginal),
            sourceWholesaleOriginal: fmtBRL(wholesaleOriginal),
            precoManual: internal?.precoManual ?? "não localizado no data.js",
          });
        }
      }
      records.push({
        line, brand: String(group.brand || "Sem marca"),
        category: String(group.cat || "Sem categoria"),
        name: String(item.nome || ""), volume: volumeOf(item),
        varejo: item.varejo ?? "não informado",
        atacado: item.atacado ?? "não informado",
        sourceMatched: Boolean(source),
        sourceName: source?.name || "",
        sourceBrand: source ? (source.brand || "marca não informada") : "sem correspondência",
        sourceCategory: source ? (source.categoria_nome || source.categoria || "não informada") : "",
        sourceVolume: source ? (volumeFrom(source.sizeMl, source.name) || "sem volume na origem") : "",
        precoManual: internal?.precoManual ?? "não localizado no data.js",
        fonteInterna: internal?.fonte ?? "não localizada",
        idOrigemInterno: internal?.id_origem ?? "não localizado",
        sourcePrice: source?.priceCents != null ? fmtBRL(Number(source.priceCents) / 100) : "—",
        expectedRetail: expected?.varejo || "sem correspondência",
        expectedWholesale: expected?.atacado || "sem correspondência",
        key: source
          ? norm(line) + "|" + norm(group.brand) + "|source|" + String(source.id || source.productId || source.slug || "")
          : norm(line) + "|" + norm(group.brand) + "|" + name + "|" + volumeOf(item),
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
const confirmedDuplicates = duplicates.filter(([, items]) => items.filter(x => x.sourceMatched).length > 1);
const crossSourceCollisions = duplicates.filter(([, items]) => items.filter(x => x.sourceMatched).length === 1);
const priceConflicts = confirmedDuplicates.filter(([, items]) =>
  new Set(items.map(x => String(x.varejo) + "|" + String(x.atacado))).size > 1
);
const collisionPriceConflicts = crossSourceCollisions.filter(([, items]) =>
  new Set(items.map(x => String(x.varejo) + "|" + String(x.atacado))).size > 1
);
const categoryMismatches = records.filter(x => x.sourceMatched && x.sourceCategory &&
  x.sourceCategory !== "não informada" && norm(x.category) !== norm(x.sourceCategory));
console.log("AUDITORIA SOMENTE LEITURA — MINIATURAS DO CATÁLOGO");
console.log(`Miniaturas analisadas: ${records.length}`);
console.log(`Registros com correspondência na Imarat: ${sourceMatches}`);
console.log(`Registros ligados ao data.js interno: ${internalMatches}`);
console.log(`Preços manuais identificados e excluídos da comparação automática: ${manualPriceProtected}`);
console.log(`IDs de origem Imarat repetidos no data.js: ${duplicateOriginIds.length}`);
for (const [id, items] of duplicateOriginIds) {
  console.log("DUPLICIDADE CONFIRMADA POR ID " + id);
  for (const item of items) console.log(JSON.stringify(item));
}
console.log(`Registros diferentes da fórmula automática: ${automaticPriceDifferences} (podem incluir precoManual)`);
console.log(`Grupos com possível duplicidade confirmada por correspondência Imarat: ${confirmedDuplicates.length}`);
console.log(`Colisões de nome/volume com apenas um item confirmado na Imarat: ${crossSourceCollisions.length}`);
console.log(`Grupos confirmados com preços varejo/atacado diferentes: ${priceConflicts.length}`);
console.log(`Colisões entre origens com preços diferentes (não são duplicatas confirmadas): ${collisionPriceConflicts.length}`);
console.log(`Itens miniatura cuja categoria diverge da categoria da origem: ${categoryMismatches.length}`);
console.log("Nenhum preço foi recalculado. Nenhum produto foi removido. Nenhuma gravação foi feita no Gist.");
if (priceRuleDifferences.length) {
  console.log("DIVERGÊNCIAS DA FÓRMULA AUTOMÁTICA (conferir precoManual antes de qualquer ajuste):");
  for (const item of priceRuleDifferences) console.log(JSON.stringify(item));
}
for (const [key, items] of confirmedDuplicates) {
  console.log("");
  console.log("POSSÍVEL DUPLICIDADE CONFIRMADA: " + key);
  for (const item of items) {
    console.log(JSON.stringify({
      linha: item.line, marca: item.brand, categoria: item.category,
      nome: item.name, volume: item.volume,
      varejo: item.varejo, atacado: item.atacado,
      marcaNaImarat: item.sourceBrand, precoOrigem: item.sourcePrice,
      precoManual: item.precoManual, fonteInterna: item.fonteInterna, idOrigemInterno: item.idOrigemInterno,
      varejoPelaRegra: item.expectedRetail, atacadoPelaRegra: item.expectedWholesale,
    }));
  }
}
for (const item of categoryMismatches) console.log("CATEGORIA DIVERGENTE " + JSON.stringify({
  linha: item.line, marca: item.brand, nome: item.name, volume: item.volume,
  categoriaCatalogo: item.category, categoriaOrigem: item.sourceCategory,
  nomeOrigem: item.sourceName, marcaOrigem: item.sourceBrand, volumeOrigem: item.sourceVolume
}));
for (const [key, items] of crossSourceCollisions) {
  console.log("");
  console.log("COLISÃO DE NOME/VOLUME — NÃO CONFIRMADA COMO DUPLICATA: " + key);
  for (const item of items) console.log(JSON.stringify({
    linha: item.line, marca: item.brand, categoria: item.category, nome: item.name,
    volume: item.volume, varejo: item.varejo, atacado: item.atacado,
    correspondenciaImarat: item.sourceMatched, marcaOrigem: item.sourceBrand,
    categoriaOrigem: item.sourceCategory
  }));
}
if (confirmedDuplicates.length === 0) console.log("Nenhuma duplicidade confirmada pela correspondência com a Imarat.");
