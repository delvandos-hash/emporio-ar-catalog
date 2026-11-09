import { createHash } from "node:crypto";
import { sanitizePublicImageUrl } from "./public-image-url.mjs";

const GROUP_FIELDS = new Set(["brand", "cat"]);
const PRODUCT_FIELDS = new Set(["nome", "volume", "varejo", "atacado", "foto", "fotos", "notas", "disponivel", "badge", "novoDesde", "variacoes", "origin_ref"]);
const VARIATION_FIELDS = new Set(["nome", "estoque"]);

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
function publicLine(line, groups) {
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
function originRef(source, originId) {
  if (!originId) return "";
  return "o_" + createHash("sha256").update(String(source || "outros") + "|" + String(originId)).digest("hex").slice(0, 24);
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
  for (const [identityKey, records] of identityGroups) {
    const used = new Set();
    // Primeiro reserva todos os IDs públicos explícitos, para que itens legados
    // mantenham a referência que já existe no Gist.
    for (const record of records) {
      const supplied = String(record.item?.public_id || "").trim();
      if (/^p_[a-f0-9]{20}$/.test(supplied) && !used.has(supplied)) {
        publicIdByItem.set(record.item, supplied);
        used.add(supplied);
      }
    }
    const baseId = publicId(records[0].line, records[0].group, records[0].item);
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      if (publicIdByItem.has(record.item)) continue;
      let nextId;
      if (!used.has(baseId)) {
        nextId = baseId;
      } else {
        const token = publicVariantToken(record.item);
        nextId = publicId(record.line, record.group, record.item, token);
      }
      let collision = 1;
      while (used.has(nextId)) {
        nextId = publicId(record.line, record.group, record.item, publicVariantToken(record.item) + "|occurrence|" + collision);
        collision++;
      }
      publicIdByItem.set(record.item, nextId);
      used.add(nextId);
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
        safeItem.public_id = publicIdByItem.get(item) || publicId(line, group, item);
        const stableOriginRef = originRef(item?.fonte || publicSource(line, group?.cat), item?.id_origem);
        if (stableOriginRef) safeItem.origin_ref = stableOriginRef;
        else if (/^o_[a-f0-9]{24}$/.test(String(item?.origin_ref || ""))) safeItem.origin_ref = String(item.origin_ref);
        const liveRef = stockRef(safeItem.fonte || publicSource(line, group?.cat), item?.id_origem);
        if (liveRef) {
          safeItem.stock_ref = liveRef;
          if (publicSource(line, group?.cat) === "roupas") {
            safeItem.stock_route = String(item?.id_origem || "").toLowerCase().startsWith("franny-") ? "b" : "a";
          }
        } else if (/^s_[a-f0-9]{24}$/.test(String(item?.stock_ref || ""))) {
          safeItem.stock_ref = String(item.stock_ref);
          if (["a", "b"].includes(item?.stock_route)) safeItem.stock_route = item.stock_route;
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
            return clean;
          });
        } else delete safeItem.variacoes;
        return safeItem;
      }) : [];
      return safeGroup;
    }));
  }
  return publicData;
}
