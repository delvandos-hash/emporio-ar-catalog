import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toPublicCatalog } from "./public-catalog.mjs";
import { resolveLegacyStockMatch, legacyVolumeIdentity } from "./legacy-restore-identity.mjs";
import { removeExcludedLegacyAtherri } from "./legacy-public-exclusions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "js", "data.js");
const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";

function norm(value) {
  return String(value || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/['’]s\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function volumeMatch(value, name) {
  return legacyVolumeIdentity(value, name);
}
function identity(line, group, item) {
  return [norm(line), norm(group?.brand), norm(group?.cat), norm(item?.nome), volumeMatch(item?.volume, item?.nome)].join("|");
}
function priceNumber(value) {
  const raw = String(value ?? "").trim().replace(/[^0-9,.-]/g, "");
  if (!raw) return NaN;
  return Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
}
function mergePublicFields(target, publicItem) {
  const publicRetail = priceNumber(publicItem.varejo);
  const publicWholesale = priceNumber(publicItem.atacado);
  const currentRetail = priceNumber(target.varejo);
  const currentWholesale = priceNumber(target.atacado);
  if (Number.isFinite(publicRetail) && Number.isFinite(publicWholesale) &&
      (publicRetail !== currentRetail || publicWholesale !== currentWholesale)) {
    target.varejo = publicItem.varejo;
    target.atacado = publicItem.atacado;
    target.precoManual = true;
  }
  const existingPhotos = [
    ...(Array.isArray(target.fotos) ? target.fotos : []),
    target.foto || ""
  ];
  const publicPhotos = [
    ...(Array.isArray(publicItem.fotos) ? publicItem.fotos : []),
    publicItem.foto || ""
  ];
  const mergedPhotos = [...new Set([...existingPhotos, ...publicPhotos].map(x => String(x || "").trim()).filter(Boolean))];
  if (mergedPhotos.length) target.fotos = mergedPhotos;
  if (publicItem.foto) target.foto = publicItem.foto;
  if (publicItem.notas) target.notas = publicItem.notas;
  if (publicItem.badge) target.badge = publicItem.badge;
  if (publicItem.novoDesde) target.novoDesde = publicItem.novoDesde;
  if (Array.isArray(publicItem.variacoes) && publicItem.variacoes.length) {
    target.variacoes = [...publicItem.variacoes];
  }
  if (publicItem.stock_ref && target.stock_ref !== publicItem.stock_ref) target.stock_ref = publicItem.stock_ref;
  if (publicItem.stock_route && target.stock_route !== publicItem.stock_route) target.stock_route = publicItem.stock_route;
  if (publicItem.public_id) target.public_id = publicItem.public_id;
}
function legacyFromPublic(item) {
  return {
    ...(item.public_id ? { public_id: item.public_id } : {}),
    nome: item.nome,
    volume: item.volume || "—",
    varejo: item.varejo,
    atacado: item.atacado,
    foto: item.foto || "",
    ...(Array.isArray(item.fotos) ? { fotos: [...item.fotos] } : {}),
    notas: item.notas || "",
    badge: item.badge || "",
    ...(item.novoDesde ? { novoDesde: item.novoDesde } : {}),
    ...(Array.isArray(item.variacoes) ? { variacoes: [...item.variacoes] } : {}),
    disponivel: item.disponivel || "Não",
    ...(item.stock_ref ? { stock_ref: item.stock_ref } : {}),
    ...(item.stock_route ? { stock_route: item.stock_route } : {}),
    precoManual: true,
    fonte: "legacy-gist"
  };
}
function buildIndexes(DATA) {
  const publicDATA = toPublicCatalog(DATA);
  const identityIndex = new Map();
  const stockIndex = new Map();
  const publicIdIndex = new Map();
  const originRefIndex = new Map();
  const buckets = new Map();
  for (const [line, groups] of Object.entries(publicDATA)) {
    for (const group of groups || []) for (const publicItem of group.items || []) {
      const key = identity(line, group, publicItem);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(publicItem);
    }
  }
  for (const [line, groups] of Object.entries(DATA)) {
    for (const group of groups || []) for (const item of group.items || []) {
      const key = identity(line, group, item);
      const publicItem = buckets.get(key)?.shift();
      if (!publicItem) throw new Error("Não foi possível mapear item interno para catálogo público: " + key);
      const row = { line, group, item, publicItem };
      if (!identityIndex.has(key)) identityIndex.set(key, []);
      identityIndex.get(key).push(row);
      if (publicItem.stock_ref) {
        if (!stockIndex.has(publicItem.stock_ref)) stockIndex.set(publicItem.stock_ref, []);
        stockIndex.get(publicItem.stock_ref).push(row);
      }
      if (publicItem.public_id) {
        if (!publicIdIndex.has(publicItem.public_id)) publicIdIndex.set(publicItem.public_id, []);
        publicIdIndex.get(publicItem.public_id).push(row);
      }
      if (publicItem.origin_ref) {
        if (!originRefIndex.has(publicItem.origin_ref)) originRefIndex.set(publicItem.origin_ref, []);
        originRefIndex.get(publicItem.origin_ref).push(row);
      }
    }
  }
  return { publicDATA, identityIndex, stockIndex, publicIdIndex, originRefIndex };
}
function readInternal() {
  const raw = fs.readFileSync(dataPath, "utf8");
  const match = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!match) throw new Error("DATA não encontrada em js/data.js");
  const DATA = JSON.parse(match[1]);
  const whatsapp = raw.match(/export const WHATSAPP = [^;]+;/)?.[0] || 'export const WHATSAPP = "5562991134488";';
  const brand = raw.match(/export const BRAND = [^;]+;/)?.[0] || 'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };';
  return { DATA, whatsapp, brand };
}
async function fetchGist(token) {
  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "EmporioAR-Legacy-Recovery/1.0"
    }
  });
  if (!response.ok) throw new Error(`Falha ao ler Gist: HTTP ${response.status}`);
  const gist = await response.json();
  const file = gist.files?.["catalogo.json"];
  if (!file) throw new Error("Gist sem catalogo.json");
  let raw = file.content;
  if (file.truncated || !raw) {
    if (!file.raw_url) throw new Error("Gist truncado sem raw_url");
    const rawResponse = await fetch(file.raw_url, { headers: { Authorization: `Bearer ${token}` } });
    if (!rawResponse.ok) throw new Error(`Falha ao baixar Gist: HTTP ${rawResponse.status}`);
    raw = await rawResponse.text();
  }
  const snapshot = JSON.parse(String(raw).replace(/^\uFEFF/, ""));
  const DATA = snapshot.DATA || snapshot;
  if (!DATA || typeof DATA !== "object" || Array.isArray(DATA)) throw new Error("DATA pública inválida");
  return DATA;
}
function addLegacy(DATA, line, group, publicItem) {
  if (!Array.isArray(DATA[line])) DATA[line] = [];
  const cat = String(group.cat || "Roupas");
  let target = DATA[line].find(g => norm(g.brand) === norm(group.brand) && norm(g.cat) === norm(cat));
  if (!target) {
    target = { brand: group.brand || "Empório A.R", cat, items: [] };
    DATA[line].push(target);
  }
  const legacy = legacyFromPublic(publicItem);
  target.items.push(legacy);
  return legacy;
}
async function main() {
  const token = process.env.GIST_TOKEN;
  if (!token) throw new Error("GIST_TOKEN ausente");
  const { DATA, whatsapp, brand } = readInternal();
  const liveDATA = await fetchGist(token);
  const excludedAtherri = removeExcludedLegacyAtherri(liveDATA);
  console.log(`LEGACY_EXCLUDED_ATHERRI_1481=${excludedAtherri}`);
  let indexes = buildIndexes(DATA);
  let restored = 0, merged = 0;
  const ambiguous = [];

  // Recupera todos os registros legados do Gist em modo append-only.
  // A identidade combina linha, marca, categoria, nome e volume; variantes são desambiguadas por ID/foto.
  for (const [line, groups] of Object.entries(liveDATA)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      // Nenhuma linha, marca ou categoria é descartada: Gist é a referência pública a preservar.
      for (const publicItem of Array.isArray(group?.items) ? group.items : []) {
        if (!publicItem?.nome) continue;
        const key = identity(line, group, publicItem);
        const stockRef = String(publicItem.stock_ref || "").trim();
        const stockMatches = stockRef ? (indexes.stockIndex.get(stockRef) || []) : [];
        const identityMatches = indexes.identityIndex.get(key) || [];
        const publicIdMatches = String(publicItem.public_id || "").trim()
          ? (indexes.publicIdIndex.get(String(publicItem.public_id).trim()) || [])
          : [];
        const originRefMatches = String(publicItem.origin_ref || "").trim()
          ? (indexes.originRefIndex.get(String(publicItem.origin_ref).trim()) || [])
          : [];
        const candidates = [...new Set([...stockMatches, ...identityMatches, ...publicIdMatches, ...originRefMatches])];
        const resolved = resolveLegacyStockMatch(stockMatches, identityMatches, publicItem, publicIdMatches, group?.brand, originRefMatches);
        if (resolved) {
          mergePublicFields(resolved.item, publicItem);
          merged++;
          continue;
        }
        if (candidates.length) {
          ambiguous.push({ line, brand: group.brand, cat: group.cat, nome: publicItem.nome, stock_ref: stockRef, stockMatches: stockMatches.length, identityMatches: identityMatches.length, publicIdMatches: publicIdMatches.length, reason: "sem correspondência inequívoca por public_id, identidade e fotografia" });
          continue;
        }
        // O Gist não pode reintroduzir produtos que já não existem nas bases raiz.
        // Registros sem correspondência interna são ignorados; a sincronização completa
        // das fontes decide quais produtos permanecem no catálogo.
        console.log("GIST_ONLY_ITEM_IGNORED " + JSON.stringify({
          line, brand: group.brand, cat: group.cat, nome: publicItem.nome,
          stock_ref: stockRef, public_id: publicItem.public_id || ""
        }));
      }
    }
  }

  if (ambiguous.length) {
    // Não bloqueia o sync: itens ambíguos (ex.: roupas Franny/Sophia/legacy duplicadas)
    // apenas são ignorados no restore legado. O dedupe do sync-catalog remove duplicatas.
    const roupas = ambiguous.filter((a) => String(a.line || '').toLowerCase() === 'roupas');
    const outros = ambiguous.filter((a) => String(a.line || '').toLowerCase() !== 'roupas');
    console.log("LEGACY_GIST_IDENTITY_AMBIGUA " + JSON.stringify(ambiguous));
    console.warn(
      `Aviso: ${ambiguous.length} identidade(s) legada(s) ambígua(s) ignorada(s) no restore ` +
      `(roupas=${roupas.length}, outras=${outros.length}). Sync continua.`
    );
    for (const a of ambiguous.slice(0, 20)) {
      console.warn(`  - [${a.line}] ${a.nome} (${a.reason})`);
    }
  }

  const check = buildIndexes(DATA);
  const missing = [];
  for (const [line, groups] of Object.entries(liveDATA)) {
    for (const group of groups || []) {
      // Verifica todas as linhas e categorias contra o Gist.
      for (const item of group.items || []) {
        const stockRef = String(item.stock_ref || "").trim();
        const stockMatches = stockRef ? (check.stockIndex.get(stockRef) || []) : [];
        const key = identity(line, group, item);
        const identityMatches = check.identityIndex.get(key) || [];
        const publicId = String(item.public_id || "").trim();
        const publicIdMatches = publicId ? (check.publicIdIndex.get(publicId) || []) : [];
        const originRef = String(item.origin_ref || "").trim();
        const originRefMatches = originRef ? (check.originRefIndex.get(originRef) || []) : [];
        const resolved = resolveLegacyStockMatch(stockMatches, identityMatches, item, publicIdMatches, group?.brand, originRefMatches);
        if (!resolved) {
          missing.push({ line, brand: group.brand, cat: group.cat, nome: item.nome, stock_ref: stockRef, public_id: publicId });
        }
      }
    }
  }
  if (missing.length) {
    // Ausência no Gist não é erro: itens sem representação interna não podem
    // ser ressuscitados. A coleta completa da origem é a autoridade do catálogo.
    console.log("GIST_ONLY_ITEMS_NOT_RESTORED=" + missing.length);
    for (const item of missing.slice(0, 30)) {
      console.log("GIST_ONLY_ITEM_NOT_IN_INTERNAL=" + JSON.stringify(item));
    }
  }

  const out = "/** Empório A.R — recuperação aditiva de legado Gist " + new Date().toISOString() + " */\n" +
    "export const DATA = " + JSON.stringify(DATA) + ";\n" + whatsapp + "\n" + brand + "\n";
  fs.writeFileSync(dataPath, out, "utf8");
  console.log(`LEGACY_GIST_RESTORED=${restored} LEGACY_GIST_MERGED=${merged}`);
  console.log("LEGACY_GIST_PRESERVATION_SCOPE=matched-identities-only");
  console.log("Gist preserva campos apenas de produtos ainda identificados internamente; itens ausentes não são reintroduzidos.");
}
main().catch(error => { console.error(error); process.exit(1); });
