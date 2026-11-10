import { createHash } from "node:crypto";
import { sanitizePublicImageUrl } from "./public-image-url.mjs";

const GROUP_FIELDS = new Set(["brand", "cat"]);
const PRODUCT_FIELDS = new Set(["nome", "volume", "varejo", "atacado", "foto", "fotos", "notas", "disponivel", "badge", "novoDesde", "variacoes", "origin_ref", "categorias_origem"]);
const DANDE_CATEGORY_NAMES = new Set([
  "Acessórios de Cabelo", "Anéis", "Braceletes", "Brincos", "Colares",
  "Conjuntos", "Lançamentos", "Masculinos", "Prata 925", "Pulseiras",
  "Semijoia Italiana", "Tornozeleiras"
]);
const VARIATION_FIELDS = new Set(["nome", "estoque", "foto", "fotos", "cor"]);

function pick(value, allowed) {
  const out = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, child] of Object.entries(value)) if (allowed.has(key)) out[key] = child;
  return out;
}
function publicSource(line, cat) {
  const ln = String(line || "").toLowerCase();
  const c = String(cat || "").toLowerCase();
  if (c === "brand" || c.startsWith("brand")) return "brand";
  if (ln.includes("roup") || c.includes("roup")) return "roupas";
  if (ln.includes("acessor") || c.includes("acessor")) return "acessorios";
  if (["masculino", "feminino", "unissex"].includes(ln) || ln.includes("perf") || c.includes("perf")) return "perfumaria";
  return "outros";
}
export function publicLine(line, groups) {
  const normalized = String(line || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("masculino")) return "masculino";
  if (normalized.includes("feminino")) return "feminino";
  if (normalized.includes("unissex")) return "unissex";
  if (normalized.includes("roup")) return "roupas";
  if (normalized.includes("acessor")) return "acessorios";
  if (normalized.includes("brand")) return "brand";
  if (normalized.includes("perf")) return "perfumaria";
  if (normalized.includes("scoop")) return "scoop premiado";
  const categories = (Array.isArray(groups) ? groups : []).map(group => String(group?.cat || "").toLowerCase());
  if (categories.some(cat => cat.includes("roup"))) return "roupas";
  if (categories.some(cat => cat.includes("acessor"))) return "acessorios";
  if (categories.some(cat => cat === "brand" || cat.startsWith("brand"))) return "brand";
  if (categories.some(cat => cat.includes("perf"))) return "perfumaria";
  return "outros";
}
function stockRef(source, originId) {
  if (!originId || !["roupas", "acessorios"].includes(source)) return "";
  return "s_" + createHash("sha256").update(source + "|" + String(originId)).digest("hex").slice(0, 24);
}
function originRef(source, originId, brand) {
  if (!originId) return "";
  return "o_" + createHash("sha256").update(String(source || "outros") + "|" + String(brand || "").trim().toLowerCase() + "|" + String(originId)).digest("hex").slice(0, 24);
}
function publicIdentityBase(line, group, item) {
  return [line, group?.brand, group?.cat, item?.nome, item?.volume]
    .map(x => String(x || "").trim().toLowerCase()).join("|");
}
function publicId(line, group, item, variantToken = "") {
  const identity = publicIdentityBase(line, group, item);
  const material = variantToken ? identity + "|variant|" + variantToken : identity;
  return "p_" + createHash("sha256").update(material).digest("hex").slice(0, 20);
}
function publicVariantToken(item) {
  const images = Array.isArray(item?.fotos) && item.fotos.length
    ? item.fotos
    : (item?.foto ? [item.foto] : []);
  const media = [...new Set(images.map(x => String(x || "").trim()).filter(Boolean))].sort();
  return JSON.stringify({
    id_origem: String(item?.id_origem || "").trim(),
    fonte: String(item?.fonte || "").trim(),
    varejo: String(item?.varejo ?? "").trim(),
    atacado: String(item?.atacado ?? "").trim(),
    foto: String(item?.foto || "").trim(),
    fotos: media,
    stock_ref: String(item?.stock_ref || "").trim(),
    stock_route: String(item?.stock_route || "").trim(),
    notas: String(item?.notas || ""),
    badge: String(item?.badge || ""),
    novoDesde: String(item?.novoDesde || ""),
    disponivel: String(item?.disponivel || ""),
    variacoes: item?.variacoes || []
  });
}

function dedupeText(value) {
  return String(value ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function publicPhotoSet(item) {
  return new Set([...(Array.isArray(item?.fotos) ? item.fotos : []), item?.foto]
    .map(value => String(value ?? "").trim()).filter(Boolean));
}
function publicVariationFingerprint(item) {
  const rows = (Array.isArray(item?.variacoes) ? item.variacoes : [])
    .map(variation => ({
      nome: dedupeText(variation?.nome),
      estoque: Math.max(0, Math.floor(Number(variation?.estoque) || 0))
    }))
    .filter(variation => variation.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return rows.length ? JSON.stringify(rows) : "";
}
function publicClothingSource(item) {
  if (item?.stock_route === "b") return "franny";
  if (item?.stock_route === "a") return "sophia";
  return "";
}
function publicVariationStock(item) {
  return (Array.isArray(item?.variacoes) ? item.variacoes : [])
    .reduce((sum, variation) => sum + Math.max(0, Number(variation?.estoque) || 0), 0);
}
function dedupePublicClothing(DATA) {
  const groups = Array.isArray(DATA?.roupas) ? DATA.roupas : [];
  const rows = [];
  for (const group of groups) {
    for (const item of Array.isArray(group?.items) ? group.items : []) rows.push({ group, item });
  }
  const removed = new Set();
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    if (removed.has(a.item)) continue;
    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j];
      if (removed.has(b.item) ||
          !publicClothingSource(a.item) ||
          publicClothingSource(a.item) !== publicClothingSource(b.item) ||
          dedupeText(a.group?.brand) !== dedupeText(b.group?.brand) ||
          dedupeText(a.group?.cat) !== dedupeText(b.group?.cat) ||
          dedupeText(a.item?.nome) !== dedupeText(b.item?.nome)) continue;

      // Nome, galeria e variantes parecidas não substituem a identidade da origem.
      // IDs diferentes (ou ausentes), stock_ref divergente, preços divergentes ou
      // variantes/estoques diferentes devem permanecer como produtos separados.
      const sourceIdA = String(a.item?.id_origem || "").trim();
      const sourceIdB = String(b.item?.id_origem || "").trim();
      if (!sourceIdA || sourceIdA !== sourceIdB) continue;
      const stockRefA = String(a.item?.stock_ref || "").trim();
      const stockRefB = String(b.item?.stock_ref || "").trim();
      if (stockRefA && stockRefB && stockRefA !== stockRefB) continue;
      if (String(a.item?.varejo ?? "").trim() !== String(b.item?.varejo ?? "").trim() ||
          String(a.item?.atacado ?? "").trim() !== String(b.item?.atacado ?? "").trim()) continue;
      const manualA = a.item?.precoManual === true || a.item?.precoManual === "true" || a.item?.precoManual === 1 || a.item?.precoManual === "1";
      const manualB = b.item?.precoManual === true || b.item?.precoManual === "true" || b.item?.precoManual === 1 || b.item?.precoManual === "1";
      if (manualA !== manualB) continue;

      const photosA = publicPhotoSet(a.item), photosB = publicPhotoSet(b.item);
      const varsA = publicVariationFingerprint(a.item), varsB = publicVariationFingerprint(b.item);
      if (photosA.size < 2 || photosB.size < 2 || !varsA || varsA !== varsB) continue;
      const photoOverlap = [...photosA].filter(value => photosB.has(value)).length / Math.min(photosA.size, photosB.size);
      if (photoOverlap < 0.9) continue;
      const scoreA = [publicVariationStock(a.item), photosA.size];
      const scoreB = [publicVariationStock(b.item), photosB.size];
      const keeper = scoreA[0] > scoreB[0] || (scoreA[0] === scoreB[0] && scoreA[1] >= scoreB[1]) ? a : b;
      const duplicate = keeper === a ? b : a;
      const mergedPhotos = [...new Set([
        ...(Array.isArray(keeper.item.fotos) ? keeper.item.fotos : []), keeper.item.foto,
        ...(Array.isArray(duplicate.item.fotos) ? duplicate.item.fotos : []), duplicate.item.foto
      ].filter(Boolean))];
      if (mergedPhotos.length) {
        keeper.item.fotos = mergedPhotos;
        if (!keeper.item.foto) keeper.item.foto = mergedPhotos[0];
      }
      removed.add(duplicate.item);
    }
  }
  if (removed.size) {
    for (const group of groups) group.items = (Array.isArray(group.items) ? group.items : []).filter(item => !removed.has(item));
    DATA.roupas = groups.filter(group => group.items.length);
  }
  return removed.size;
}

export function toPublicCatalog(DATA, imageOptions = {}) {
  if (!DATA || typeof DATA !== "object" || Array.isArray(DATA)) throw new Error("DATA inválido para publicação");
  const publicData = {};
  const identityGroups = new Map();
  for (const [line, groups] of Object.entries(DATA)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        const key = publicIdentityBase(line, group, item);
        if (!identityGroups.has(key)) identityGroups.set(key, []);
        identityGroups.get(key).push({ line, group, item });
      }
    }
  }
  const publicIdByItem = new Map();
  const globalUsedIds = new Set();
  const publicIdByStableOrigin = new Map();
  for (const [identityKey, records] of identityGroups) {
    const used = new Set();
    // Primeiro reutiliza a referência de origem quando o mesmo SKU aparece em
    // mais de uma categoria; isso evita criar uma segunda identidade para o mesmo item.
    for (const record of records) {
      const source = record.item?.fonte || publicSource(record.line, record.group?.cat);
      const stock = stockRef(source, record.item?.id_origem);
      const origin = originRef(source, record.item?.id_origem, record.group?.brand);
      const stableKey = stock ? "stock:" + String(record.group?.brand || "").trim().toLowerCase() + "|" + stock : (origin ? "origin:" + origin : "");
      if (stableKey && publicIdByStableOrigin.has(stableKey)) {
        const existingId = publicIdByStableOrigin.get(stableKey);
        publicIdByItem.set(record.item, existingId);
        used.add(existingId);
      }
    }
    // IDs explícitos só são preservados se forem globalmente únicos.
    for (const record of records) {
      if (publicIdByItem.has(record.item)) continue;
      const supplied = String(record.item?.public_id || "").trim();
      if (/^p_[a-f0-9]{20}$/.test(supplied) && !used.has(supplied) && !globalUsedIds.has(supplied)) {
        publicIdByItem.set(record.item, supplied);
        used.add(supplied);
        globalUsedIds.add(supplied);
        const source = record.item?.fonte || publicSource(record.line, record.group?.cat);
        const stock = stockRef(source, record.item?.id_origem);
        const origin = originRef(source, record.item?.id_origem, record.group?.brand);
        const stableKey = stock ? "stock:" + String(record.group?.brand || "").trim().toLowerCase() + "|" + stock : (origin ? "origin:" + origin : "");
        if (stableKey) publicIdByStableOrigin.set(stableKey, supplied);
      }
    }
    const baseId = publicId(records[0].line, records[0].group, records[0].item);
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      if (publicIdByItem.has(record.item)) continue;
      let nextId;
      if (!used.has(baseId) && !globalUsedIds.has(baseId)) {
        nextId = baseId;
      } else {
        const token = publicVariantToken(record.item);
        nextId = publicId(record.line, record.group, record.item, token);
      }
      let collision = 1;
      while (used.has(nextId) || globalUsedIds.has(nextId)) {
        nextId = publicId(record.line, record.group, record.item, publicVariantToken(record.item) + "|occurrence|" + collision);
        collision++;
      }
      publicIdByItem.set(record.item, nextId);
      used.add(nextId);
      globalUsedIds.add(nextId);
      const source = record.item?.fonte || publicSource(record.line, record.group?.cat);
      const stock = stockRef(source, record.item?.id_origem);
      const origin = originRef(source, record.item?.id_origem, record.group?.brand);
      const stableKey = stock ? "stock:" + String(record.group?.brand || "").trim().toLowerCase() + "|" + stock : (origin ? "origin:" + origin : "");
      if (stableKey) publicIdByStableOrigin.set(stableKey, nextId);
    }
  }
  for (const [line, groups] of Object.entries(DATA)) {
    if (!Array.isArray(groups)) continue;
    const safeLine = publicLine(line, groups);
    if (!publicData[safeLine]) publicData[safeLine] = [];
    publicData[safeLine].push(...groups.map(group => {
      const safeGroup = pick(group, GROUP_FIELDS);
      safeGroup.items = Array.isArray(group?.items) ? group.items.map(item => {
        const safeItem = pick(item, PRODUCT_FIELDS);
        if (Array.isArray(safeItem.categorias_origem)) {
          const categories = [...new Set(safeItem.categorias_origem
            .map(value => String(value || "").trim())
            .filter(value => DANDE_CATEGORY_NAMES.has(value)))];
          if (categories.length) safeItem.categorias_origem = categories;
          else delete safeItem.categorias_origem;
        } else delete safeItem.categorias_origem;
        safeItem.public_id = publicIdByItem.get(item) || publicId(line, group, item);
        const stableOriginRef = originRef(item?.fonte || publicSource(line, group?.cat), item?.id_origem, group?.brand);
        if (stableOriginRef) safeItem.origin_ref = stableOriginRef;
        else if (/^o_[a-f0-9]{24}$/.test(String(item?.origin_ref || ""))) safeItem.origin_ref = String(item.origin_ref);
        const existingStockRef = /^s_[a-f0-9]{24}$/.test(String(item?.stock_ref || ""))
          ? String(item.stock_ref) : "";
        const liveRef = stockRef(safeItem.fonte || publicSource(line, group?.cat), item?.id_origem);
        if (existingStockRef) {
          // stock_ref público já validado é a referência canônica do catálogo;
          // não a regenere apenas porque o ID da fonte foi corrigido.
          safeItem.stock_ref = existingStockRef;
        } else if (liveRef) {
          safeItem.stock_ref = liveRef;
        }
        // A rota da fonte de roupas é derivada do ID de origem mesmo quando
        // stock_ref já existia. Isso evita enviar itens Franny para Sophia.
        if (publicSource(line, group?.cat) === "roupas" && item?.id_origem) {
          safeItem.stock_route = String(item.id_origem).toLowerCase().startsWith("franny-") ? "b" : "a";
        } else if (["a", "b"].includes(item?.stock_route)) {
          safeItem.stock_route = item.stock_route;
        }
        safeItem.fonte = publicSource(line, group?.cat);
        if (Array.isArray(safeItem.fotos)) {
          safeItem.fotos = safeItem.fotos.map(url => sanitizePublicImageUrl(url, imageOptions)).filter(Boolean);
        } else delete safeItem.fotos;
        if (safeItem.foto != null) {
          const rawPhoto = String(safeItem.foto).trim();
          const isBareFilename = rawPhoto && !/^https:\/\//i.test(rawPhoto) &&
            !rawPhoto.startsWith("/") && !rawPhoto.includes("://");
          if (isBareFilename && safeItem.fotos?.length) {
            safeItem.foto = safeItem.fotos[0];
          } else {
            const safePhoto = sanitizePublicImageUrl(rawPhoto, imageOptions);
            if (safePhoto) safeItem.foto = safePhoto;
            else if (safeItem.fotos?.length) safeItem.foto = safeItem.fotos[0];
            else delete safeItem.foto;
          }
        } else if (safeItem.fotos?.length) safeItem.foto = safeItem.fotos[0];
        if (Array.isArray(safeItem.variacoes)) {
          safeItem.variacoes = safeItem.variacoes.map((variation, index) => {
            const clean = pick(variation, VARIATION_FIELDS);
            clean.id = "v" + (index + 1);
            if (clean.nome != null) clean.nome = String(clean.nome).slice(0, 120);
            const stock = Number(variation?.estoque);
            clean.estoque = Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : 0;
            if (clean.foto != null) {
              const safePhoto = sanitizePublicImageUrl(String(clean.foto), imageOptions);
              if (safePhoto) clean.foto = safePhoto;
              else delete clean.foto;
            }
            if (Array.isArray(clean.fotos)) {
              clean.fotos = clean.fotos.map(url => sanitizePublicImageUrl(String(url), imageOptions)).filter(Boolean);
              if (!clean.fotos.length) delete clean.fotos;
            } else delete clean.fotos;
            if (!clean.foto && clean.fotos?.length) clean.foto = clean.fotos[0];
            if (clean.cor != null) clean.cor = String(clean.cor).slice(0, 80);
            return clean;
          });
        } else delete safeItem.variacoes;
        return safeItem;
      }) : [];
      return safeGroup;
    }));
  }
  if (imageOptions?.dedupeClothing !== false) dedupePublicClothing(publicData);
  return publicData;
}
