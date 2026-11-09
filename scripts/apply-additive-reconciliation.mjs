import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toPublicCatalog } from "./public-catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "js", "data.js");
const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";
const ALLOWED_SOURCES = new Set(["imarat", "brand", "roupas", "acessorios"]);

function norm(value) {
  return String(value || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/['’]s\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function volumeMatch(value, name) {
  let raw = String(value || "").trim();
  if (raw && /^\d+(?:[.,]\d+)?$/.test(raw)) raw += "ml";
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i) ||
    String(name || "").match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  return match ? String(Number(match[1].replace(",", "."))) + match[2].toLowerCase() : "";
}

function identity(line, group, item) {
  return [norm(line), norm(group?.brand), norm(group?.cat), norm(item?.nome), volumeMatch(item?.volume, item?.nome)].join("|");
}

function parseInternal() {
  const raw = fs.readFileSync(dataPath, "utf8");
  const match = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!match) throw new Error("DATA não encontrada em js/data.js");
  return JSON.parse(match[1]);
}

async function fetchLiveGist(token) {
  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "EmporioAR-Additive-Reconciliation/1.0"
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
  return { snapshot, DATA };
}

function publicFingerprint(item) {
  const photos = Array.isArray(item?.fotos) && item.fotos.length ? item.fotos : (item?.foto ? [item.foto] : []);
  return JSON.stringify({
    nome: norm(item?.nome),
    volume: volumeMatch(item?.volume, item?.nome),
    varejo: String(item?.varejo ?? "").trim(),
    atacado: String(item?.atacado ?? "").trim(),
    foto: String(item?.foto ?? "").trim(),
    fotos: [...new Set(photos.map(x => String(x ?? "").trim()).filter(Boolean))].sort(),
    notas: String(item?.notas ?? ""),
    badge: String(item?.badge ?? ""),
    novoDesde: String(item?.novoDesde ?? ""),
    variacoes: item?.variacoes || [],
    stock_ref: String(item?.stock_ref ?? ""),
    stock_route: String(item?.stock_route ?? ""),
    origin_ref: String(item?.origin_ref ?? "")
  });
}

function publicPhotoFingerprint(item) {
  const photos = Array.isArray(item?.fotos) && item.fotos.length ? item.fotos : (item?.foto ? [item.foto] : []);
  return JSON.stringify([...new Set(photos.map(x => String(x ?? "").trim()).filter(Boolean))].sort());
}

function collectKeys(DATA) {
  const keys = new Set();
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        if (item?.nome) keys.add(String(item.public_id || identity(line, group, item)));
      }
    }
  }
  return keys;
}

function collectContentKeys(DATA) {
  const keys = new Set();
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        if (item?.nome) keys.add(identity(line, group, item) + "|" + String(item?.public_id || "") + "|" + publicFingerprint(item));
      }
    }
  }
  return keys;
}

function dedupeExactLiveVariants(DATA) {
  // Durante a recuperação, nem mesmo cópias visualmente idênticas são removidas:
  // o Gist legado pode ter public_id colidido para IDs de origem distintos.
  // A limpeza só poderá ocorrer após reconciliação por origin_ref estável.
  return 0;
}

function looseIdentity(line, group, item) {
  const name = String(item?.nome || "").replace(/\d+(?:[.,]\d+)?\s*(?:ml|g)\b/gi, " ");
  return [norm(line), norm(group?.brand), norm(name)].join("|");
}

function collectInternalIndex(DATA) {
  const publicData = toPublicCatalog(DATA);
  const publicBuckets = new Map();
  for (const [line, groups] of Object.entries(publicData || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const publicItem of Array.isArray(group?.items) ? group.items : []) {
        const base = identity(line, group, publicItem);
        if (!publicBuckets.has(base)) publicBuckets.set(base, []);
        publicBuckets.get(base).push({ publicLine: line, publicGroup: group, publicItem });
      }
    }
  }

  const index = new Map();
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        if (!item?.nome) continue;
        const base = identity(line, group, item);
        const match = publicBuckets.get(base)?.shift();
        if (!match?.publicItem?.public_id) throw new Error(`Public ID não gerado para ${base}`);
        const key = match.publicItem.public_id;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ line, group, item, ...match });
      }
    }
  }
  return index;
}

function rekeyLiveVariants(liveDATA, internalIndex) {
  const internalByBase = new Map();
  const internalByLooseIdentity = new Map();
  const internalByOriginRef = new Map();
  const internalByPublicId = new Map();
  const internalByStockRef = new Map();
  for (const rows of internalIndex.values()) for (const row of rows) {
    const base = identity(row.publicLine, row.publicGroup, row.publicItem);
    if (!internalByBase.has(base)) internalByBase.set(base, []);
    internalByBase.get(base).push(row);
    const publicId = String(row.publicItem?.public_id || "").trim();
    if (publicId) {
      if (!internalByPublicId.has(publicId)) internalByPublicId.set(publicId, []);
      internalByPublicId.get(publicId).push(row);
    }
    const stockRef = String(row.publicItem?.stock_ref || "").trim();
    if (stockRef) {
      if (!internalByStockRef.has(stockRef)) internalByStockRef.set(stockRef, []);
      internalByStockRef.get(stockRef).push(row);
    }
    const looseKey = looseIdentity(row.publicLine, row.publicGroup, row.publicItem);
    if (!internalByLooseIdentity.has(looseKey)) internalByLooseIdentity.set(looseKey, []);
    internalByLooseIdentity.get(looseKey).push(row);
    const originRef = String(row.publicItem?.origin_ref || "").trim();
    if (originRef) {
      if (!internalByOriginRef.has(originRef)) internalByOriginRef.set(originRef, []);
      internalByOriginRef.get(originRef).push(row);
    }
  }
  const used = new Set();
  let rekeyed = 0, unmatched = 0;
  for (const [line, groups] of Object.entries(liveDATA || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        const base = identity(line, group, item);
        const fingerprint = publicFingerprint(item);
        const candidates = (internalByBase.get(base) || []).filter(row => !used.has(row.publicItem.public_id));
        const byGlobalId = item.public_id
          ? (internalByPublicId.get(String(item.public_id)) || []).filter(row => !used.has(row.publicItem.public_id))
          : [];
        const byStockRef = String(item.stock_ref || "").trim()
          ? (internalByStockRef.get(String(item.stock_ref).trim()) || []).filter(row => !used.has(row.publicItem.public_id))
          : [];
        const byExistingId = item.public_id
          ? candidates.filter(row => row.publicItem.public_id === item.public_id)
          : [];
        const byOriginRef = String(item.origin_ref || "").trim()
          ? (internalByOriginRef.get(String(item.origin_ref).trim()) || []).filter(row => !used.has(row.publicItem.public_id))
          : [];
        const photoFingerprint = publicPhotoFingerprint(item);
        const byPhoto = photoFingerprint !== "[]" ? candidates.filter(row => publicPhotoFingerprint(row.publicItem) === photoFingerprint) : [];
        const looseKey = looseIdentity(line, group, item);
        const byLooseIdentity = (internalByLooseIdentity.get(looseKey) || []).filter(row => !used.has(row.publicItem.public_id));
        const byLoosePhoto = photoFingerprint !== "[]" ? byLooseIdentity.filter(row => publicPhotoFingerprint(row.publicItem) === photoFingerprint) : [];
        const byExactContent = candidates.filter(row => publicFingerprint(row.publicItem) === fingerprint);
        const match = byGlobalId.length === 1
          ? byGlobalId[0]
          : byStockRef.length === 1
            ? byStockRef[0]
            : byExistingId.length === 1
            ? byExistingId[0]
            : byOriginRef.length === 1
            ? byOriginRef[0]
            : byPhoto.length === 1
            ? byPhoto[0]
            : byExactContent.length === 1
              ? byExactContent[0]
              : candidates.length === 1
                ? candidates[0]
                : byLoosePhoto.length === 1
                  ? byLoosePhoto[0]
                  : byLooseIdentity.length === 1
                    ? byLooseIdentity[0]
                    : null;
        if (!match) throw new Error(`Variante atual do Gist sem correspondência inequívoca na base: ${base} / ${item.nome} (public_id_global=${byGlobalId.length}, stock_ref_global=${byStockRef.length}, candidatas=${candidates.length}, identidadeFlexível=${byLooseIdentity.length}, fotoFlexível=${byLoosePhoto.length}, origin_ref=${byOriginRef.length}, fotosCompatíveis=${byPhoto.length}, conteúdoExato=${byExactContent.length})`);
        used.add(match.publicItem.public_id);
        if (item.public_id !== match.publicItem.public_id) {
          item.public_id = match.publicItem.public_id;
          rekeyed++;
        }
      }
    }
  }
  return { rekeyed, unmatched };
}

function addSafePublicItem(merged, publicLine, publicGroup, publicItem) {
  if (!Array.isArray(merged[publicLine])) merged[publicLine] = [];
  let target = merged[publicLine].find(group =>
    norm(group.brand) === norm(publicGroup.brand) &&
    norm(group.cat) === norm(publicGroup.cat)
  );
  if (!target) {
    target = { brand: publicGroup.brand, cat: publicGroup.cat, items: [] };
    merged[publicLine].push(target);
  }
  target.items.push(publicItem);
}

async function main() {
  const token = process.env.GIST_TOKEN;
  if (!token) throw new Error("GIST_TOKEN ausente");

  const internalDATA = parseInternal();
  const { snapshot, DATA: liveDATA } = await fetchLiveGist(token);
  const originalLiveContentKeys = collectContentKeys(liveDATA);
  const exactLiveDuplicatesRemoved = dedupeExactLiveVariants(liveDATA);
  const internalIndex = collectInternalIndex(internalDATA);
  const { rekeyed: rekeyedVariants, unmatched: unmatchedLiveVariants } = rekeyLiveVariants(liveDATA, internalIndex);
  const liveKeys = collectKeys(liveDATA);
  const internalKeys = new Set(internalIndex.keys());
  const missingFromInternal = [...liveKeys].filter(key => !internalKeys.has(key));
  const liveStockRefs = new Set();
  const liveLoosePhotoKeys = new Set();
  for (const [line, groups] of Object.entries(liveDATA)) for (const group of groups || []) for (const item of group.items || []) {
    const ref = String(item?.stock_ref || "").trim();
    if (ref) liveStockRefs.add(ref);
    const photo = publicPhotoFingerprint(item);
    if (photo) liveLoosePhotoKeys.add(looseIdentity(line, group, item) + "|" + photo);
  }
  const duplicateSourceKeys = new Set();
  const additions = [...internalKeys].filter(key => {
    if (liveKeys.has(key)) return false;
    const row = (internalIndex.get(key) || [])[0];
    const stockRef = String(row?.publicItem?.stock_ref || "").trim();
    if (stockRef && liveStockRefs.has(stockRef)) {
      duplicateSourceKeys.add(key);
      return false;
    }
    const rowCategory = norm(row?.publicGroup?.cat);
    const rowSource = norm(row?.item?.fonte);
    const photo = publicPhotoFingerprint(row?.publicItem);
    if (!rowSource && rowCategory.includes("brand") && photo &&
        liveLoosePhotoKeys.has(looseIdentity(row.publicLine, row.publicGroup, row.publicItem) + "|" + photo)) {
      duplicateSourceKeys.add(key);
      return false;
    }
    return true;
  });

  if (missingFromInternal.length) {
    throw new Error(`Publicação bloqueada: ${missingFromInternal.length} IDs atuais do Gist ainda não estão representados na base. Nenhum dado foi enviado.`);
  }
  if (!additions.length || additions.length > 80) {
    throw new Error(`Publicação bloqueada: quantidade de novos itens fora do limite aditivo (novos=${additions.length}, máximo=80).`);
  }

  function effectiveAdditiveSource(row) {
  const source = norm(row?.item?.fonte);
  if (source) return source;
  const knownBrandGroups = new Set(["arabic collection","beauty brand","body splash","colecao dream","colecao brand","dream brand 80 100ml","dream brand","flaconete brand","sapatinho good girl","tubetes brand"]);
  return norm(row?.group?.cat) === "brand" && knownBrandGroups.has(norm(row?.group?.brand)) ? "brand" : "";
}
for (const key of additions) {
    const rows = internalIndex.get(key) || [];
    if (rows.length !== 1) throw new Error(`Publicação bloqueada: identidade interna ambígua: ${key}`);
    const { item } = rows[0];
    const source = effectiveAdditiveSource(rows[0]);
    if (!ALLOWED_SOURCES.has(source)) throw new Error(`Publicação bloqueada: fonte não confirmada para ${key}: ${source || "vazia"}`);
    if (source !== "brand" && !String(item.id_origem || "").trim()) {
      throw new Error(`Publicação bloqueada: produto sem ID de origem: ${key}`);
    }
  }

  const mergedPublic = structuredClone(liveDATA);
  const mergedKeys = new Set(liveKeys);
  let appended = 0;

  for (const key of additions) {
    const rows = internalIndex.get(key) || [];
    if (rows.length !== 1) throw new Error(`Identidade pública interna ambígua: ${key}`);
    const row = rows[0];
    addSafePublicItem(mergedPublic, row.publicLine, row.publicGroup, row.publicItem);
    mergedKeys.add(key);
    appended++;
  }

  if (appended !== additions.length) {
    throw new Error(`Quantidade adicionada diverge da auditoria: esperado=${additions.length}; adicionado=${appended}`);
  }
  const mergedContentKeys = collectContentKeys(mergedPublic);
  const lostContent = [...originalLiveContentKeys].filter(key => !mergedContentKeys.has(key));
  if (lostContent.length) {
    throw new Error(`Itens atuais do Gist seriam perdidos: ${lostContent.length}. Nenhum dado foi enviado.`);
  }
  for (const key of internalKeys) {
    if (!mergedKeys.has(key) && !duplicateSourceKeys.has(key)) throw new Error(`Item interno não foi incluído: ${key}`);
  }

  const nextSnapshot = snapshot.DATA
    ? { ...snapshot, DATA: mergedPublic, ultimaAtualizacao: new Date().toISOString() }
    : mergedPublic;

  console.log(`GIST_EXISTING_PRESERVED=${originalLiveContentKeys.size}`);
  console.log(`GIST_EXACT_DUPLICATES_REMOVED=${exactLiveDuplicatesRemoved}`);
  console.log(`GIST_VARIANTS_REKEYED=${rekeyedVariants} GIST_VARIANTS_PRESERVED_WITHOUT_REKEY=${unmatchedLiveVariants}`);
  console.log(`SOURCE_CONFIRMED_ADDITIONS=${appended}`);
  console.log(`DUPLICATE_SOURCE_REPRESENTATIONS_SKIPPED=${duplicateSourceKeys.size}`);
  console.log("GIST mantém todos os conteúdos existentes; apenas IDs de variantes são separados e novos itens confirmados são adicionados.");

  if (process.env.APPLY_ADDITIVE_RECONCILIATION !== "1") {
    console.log("ADDITIVE_RECONCILIATION_DRY_RUN=true; Gist de produção não foi alterado.");
    return;
  }

  const patch = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "EmporioAR-Additive-Reconciliation/1.0"
    },
    body: JSON.stringify({
      files: {
        "catalogo.json": {
          content: "\uFEFF" + JSON.stringify(nextSnapshot, null, 2)
        }
      }
    })
  });
  if (!patch.ok) throw new Error(`Falha ao atualizar Gist: HTTP ${patch.status} ${await patch.text()}`);

  const after = await fetchLiveGist(token);
  const afterKeys = collectKeys(after.DATA);
  const afterContentKeys = collectContentKeys(after.DATA);
  const missingAfter = [...mergedKeys].filter(key => !afterKeys.has(key));
  const lostBefore = [...originalLiveContentKeys].filter(key => !afterContentKeys.has(key));
  if (missingAfter.length || lostBefore.length) {
    throw new Error(`Verificação pós-publicação falhou: faltandoIDs=${missingAfter.length}; conteúdosPerdidos=${lostBefore.length}`);
  }
  console.log(`GIST_RECONCILIATION_VERIFIED=true totalIDs=${afterKeys.size} additions=${appended} variantsRekeyed=${rekeyedVariants} exactDuplicatesRemoved=${exactLiveDuplicatesRemoved}`);
}

main().catch(error => { console.error(error); process.exit(1); });
