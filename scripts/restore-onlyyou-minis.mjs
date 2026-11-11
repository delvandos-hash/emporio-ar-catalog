import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toPublicCatalog } from "./public-catalog.mjs";
import { sanitizePublicImageUrl } from "./public-image-url.mjs";
import { resolveImaratImageUrl } from "./imarat-image-url.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "js", "data.js");
const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";
const API = process.env.IMARAT_API_URL;
const ORIGIN = process.env.IMARAT_ORIGIN_URL;
const TOKEN = process.env.GIST_TOKEN;
const DRY_RUN = process.env.RESTORE_ONLYYOU_DRY_RUN === "1";

function norm(value) {
  return String(value || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]s\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function volumeFrom(value, name) {
  let raw = String(value ?? "").trim();
  if (raw && /^\d+(?:[.,]\d+)?$/.test(raw)) raw += "ml";
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i)
    || String(name || "").match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  return match ? String(Number(match[1].replace(",", "."))) + match[2].toLowerCase() : "";
}
function miniKey(name) {
  return norm(name)
    .replace(/^(miniatura|mini)\s+/, "")
    .replace(/^(only\s*you|onlyou|onlyyou)\s+/, "")
    .replace(/\s+(only\s*you|onlyou|onlyyou|onlyou)$/, "")
    .trim();
}
function genderLine(value) {
  const gender = String(value || "").toLowerCase();
  if (gender.includes("fem")) return "feminino";
  if (gender.includes("masc") || gender === "men") return "masculino";
  return "unissex";
}
function fmtBRL(value) {
  return Number(value).toFixed(2).replace(".", ",");
}
function manualPrice(item) {
  return item?.precoManual === true || item?.precoManual === "true" || item?.precoManual === 1;
}
function parseInternalData() {
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const match = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!match) throw new Error("DATA interno não encontrado.");
  return JSON.parse(match[1]);
}
function findInternalItem(DATA, brand, name, volume) {
  const matches = [];
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      if (norm(group.brand) !== norm(brand)) continue;
      for (const item of group.items || []) {
        if (miniKey(item.nome) !== miniKey(name)) continue;
        const existingVolume = volumeFrom(item.volume, item.nome);
        if (volume && existingVolume && volume !== existingVolume) continue;
        matches.push(item);
      }
    }
  }
  return matches.length === 1 ? matches[0] : null;
}
async function fetchImarat() {
  const all = [];
  let page = 1, total = 0, fetched = 0;
  for (let guard = 0; guard < 40; guard++) {
    const response = await fetch(`${API}?page=${page}&perPage=60`, {
      headers: { Accept: "application/json", "User-Agent": "EmporioAR-Restore-OnlyYou/1.0" }
    });
    if (!response.ok) throw new Error(`Imarat HTTP ${response.status} na página ${page}`);
    const data = await response.json();
    total = Number(data.total || total);
    const products = Array.isArray(data.products) ? data.products : [];
    if (!products.length) break;
    all.push(...products);
    fetched += products.length;
    if ((total && fetched >= total) || products.length < 60) break;
    page++;
  }
  if (total && fetched < total) throw new Error(`Paginação Imarat incompleta: ${fetched}/${total}`);
  return all;
}
async function fetchGist() {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "EmporioAR-Restore-OnlyYou/1.0"
  };
  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });
  if (!response.ok) throw new Error(`Falha ao ler Gist: HTTP ${response.status}`);
  const gist = await response.json();
  const file = gist.files?.["catalogo.json"];
  if (!file) throw new Error("Gist sem catalogo.json.");
  let raw = file.content;
  if (file.truncated || !raw) {
    if (!file.raw_url) throw new Error("Gist truncado sem raw_url.");
    const rawResponse = await fetch(file.raw_url, { headers });
    if (!rawResponse.ok) throw new Error(`Falha ao baixar Gist: HTTP ${rawResponse.status}`);
    raw = await rawResponse.text();
  }
  const snapshot = JSON.parse(String(raw).replace(/^\uFEFF/, ""));
  const DATA = snapshot.DATA || snapshot;
  if (!DATA || typeof DATA !== "object" || Array.isArray(DATA)) throw new Error("DATA público inválido.");
  return { gist, snapshot, DATA, headers };
}
function sourceImages(product, fallback) {
  const candidates = [];
  const add = value => {
    if (!value) return;
    let raw = String(value.url || value.src || value).trim();
    if (!raw) return;
    if (!/^https:\/\//i.test(raw)) raw = resolveImaratImageUrl(raw, ORIGIN);
    const safe = sanitizePublicImageUrl(raw);
    if (safe && !candidates.includes(safe)) candidates.push(safe);
  };
  add(product.image);
  add(product.hoverImage);
  for (const image of Array.isArray(product.images) ? product.images : []) add(image);
  if (!candidates.length && fallback) {
    add(fallback.foto);
    for (const image of Array.isArray(fallback.fotos) ? fallback.fotos : []) add(image);
  }
  return candidates;
}
function findLiveMatches(DATA, product, volume) {
  const matches = [];
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      if (norm(group.brand) !== norm(product.brand)) continue;
      for (const item of group.items || []) {
        if (miniKey(item.nome) !== miniKey(product.name)) continue;
        const existingVolume = volumeFrom(item.volume, item.nome);
        if (volume && existingVolume && volume !== existingVolume) continue;
        matches.push({ line, group, item });
      }
    }
  }
  return matches;
}
function ensureGroup(DATA, line, brand, category) {
  DATA[line] = Array.isArray(DATA[line]) ? DATA[line] : [];
  let group = DATA[line].find(g => norm(g.brand) === norm(brand) && norm(g.cat) === norm(category));
  if (!group) {
    group = { brand, cat: category, items: [] };
    DATA[line].push(group);
  }
  return group;
}
async function main() {
  if (!API || !ORIGIN || !TOKEN) throw new Error("IMARAT_API_URL, IMARAT_ORIGIN_URL e GIST_TOKEN são obrigatórios.");
  const [source, live] = await Promise.all([fetchImarat(), fetchGist()]);
  const onlyYou = source.filter(p => norm(p.brand) === "only you");
  if (!onlyYou.length) throw new Error("A API não retornou produtos com marca Only You; nada será alterado.");

  const internal = parseInternalData();
  const additions = [];
  const ambiguous = [];
  for (const product of onlyYou) {
    const name = String(product.name || "").trim();
    if (!name) continue;
    const volume = volumeFrom(product.sizeMl, name);
    const matches = findLiveMatches(live.DATA, product, volume);
    if (matches.length) {
      if (matches.length > 1) ambiguous.push({ name, volume, matches: matches.length });
      continue;
    }
    const internalItem = findInternalItem(internal, product.brand, name, volume);
    const images = sourceImages(product, internalItem);
    if (!images.length) throw new Error(`Imagem ausente para ${name}; restauração interrompida sem gravar o Gist.`);
    const originalRetail = Number(product.priceCents || 0) / 100;
    const originalWholesale = product.atacado?.precoCents != null
      ? Number(product.atacado.precoCents) / 100
      : Math.max(originalRetail - 30, 0);
    const varejo = manualPrice(internalItem) ? internalItem.varejo : fmtBRL(originalRetail + 60);
    const atacado = manualPrice(internalItem) ? internalItem.atacado : fmtBRL(originalWholesale + 40);
    const line = genderLine(product.gender);
    const brand = live.DATA[line]?.find(g => norm(g.brand) === norm(product.brand))?.brand
      || String(product.brand).trim().toUpperCase();
    const category = "Miniaturas";
    const internalProduct = {
      nome: name,
      volume: volume || "—",
      varejo,
      atacado,
      disponivel: product.inStock === true ? "Sim" : "Não",
      notas: "",
      foto: images[0],
      fotos: images,
      badge: "",
      fonte: "imarat",
      id_origem: String(product.id ?? product.productId ?? "")
    };
    const projected = toPublicCatalog({ [line]: [{ brand, cat: category, items: [internalProduct] }] });
    const publicItem = projected[line]?.[0]?.items?.[0];
    if (!publicItem?.foto) throw new Error(`Imagem não passou pela sanitização pública: ${name}`);
    additions.push({ line, brand, category, product, item: publicItem });
  }

  console.log(`Only You na origem: ${onlyYou.length}; já presentes no Gist: ${onlyYou.length - additions.length}; faltantes: ${additions.length}`);
  for (const entry of additions) {
    console.log("ONLY YOU A ADICIONAR " + JSON.stringify({
      id: entry.product.id ?? entry.product.productId ?? "",
      nome: entry.product.name,
      volume: entry.item.volume,
      varejo: entry.item.varejo,
      atacado: entry.item.atacado
    }));
  }
  for (const item of ambiguous) console.log("ONLY YOU COM MAIS DE UMA CORRESPONDÊNCIA; preservado " + JSON.stringify(item));

  if (!additions.length) {
    console.log("Nenhum produto Only You faltante. Gist mantido sem alterações.");
    return;
  }
  if (DRY_RUN) {
    console.log("RESTORE_ONLYYOU_DRY_RUN=1 — nenhuma gravação no Gist foi realizada.");
    return;
  }

  for (const entry of additions) {
    const group = ensureGroup(live.DATA, entry.line, entry.brand, entry.category);
    group.items.push(entry.item);
  }
  const payload = live.snapshot.DATA ? { ...live.snapshot, DATA: live.DATA } : live.DATA;
  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: "PATCH",
    headers: { ...live.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      files: {
        "catalogo.json": {
          content: "\uFEFF" + JSON.stringify(payload, null, 2)
        }
      }
    })
  });
  if (!response.ok) throw new Error(`Falha ao gravar Gist: HTTP ${response.status} — ${await response.text()}`);
  const verify = await fetchGist();
  const stillMissing = onlyYou.filter(p => !findLiveMatches(verify.DATA, p, volumeFrom(p.sizeMl, p.name)).length);
  if (stillMissing.length) {
    throw new Error(`Gist atualizado, mas ${stillMissing.length} produtos Only You ainda não foram localizados na verificação pós-gravação.`);
  }
  console.log(`RESTAURAÇÃO CONCLUÍDA: ${additions.length} miniaturas Only You adicionadas; ${onlyYou.length} conferidas na origem.`);
}
main().catch(error => {
  console.error(error);
  process.exit(1);
});
