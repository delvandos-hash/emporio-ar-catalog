import { createHash } from "node:crypto";
import { sanitizePublicImageUrl } from "./public-image-url.mjs";

const GROUP_FIELDS = new Set(["brand", "cat"]);
const PRODUCT_FIELDS = new Set(["nome", "volume", "varejo", "atacado", "foto", "fotos", "notas", "disponivel", "badge", "novoDesde", "variacoes"]);
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
  const normalized = String(line || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
  if (normalized.includes("masculino")) return "masculino";
  if (normalized.includes("feminino")) return "feminino";
  if (normalized.includes("unissex")) return "unissex";
  if (normalized.includes("roup")) return "roupas";
  if (normalized.includes("acessor")) return "acessorios";
  if (normalized.includes("brand")) return "brand";
  if (normalized.includes("scoop")) return "scoop premiado";
  const categories = (Array.isArray(groups) ? groups : []).map(group => String(group?.cat || "").toLowerCase());
  if (categories.some(cat => cat.includes("roup"))) return "roupas";
  if (categories.some(cat => cat.includes("acessor"))) return "acessorios";
  if (categories.some(cat => cat === "brand" || cat.startsWith("brand"))) return "brand";
  if (categories.some(cat => cat.includes("perf"))) return "perfumaria";
  return "outros";
}
function publicId(line, group, item) {
  const identity = [line, group?.brand, group?.cat, item?.nome, item?.volume, ].map(x => String(x || "").trim().toLowerCase()).join("|");
  return "p_" + createHash("sha256").update(identity).digest("hex").slice(0, 20);
}
export function toPublicCatalog(DATA, imageOptions = {}) {
  if (!DATA || typeof DATA !== "object" || Array.isArray(DATA)) throw new Error("DATA inválido para publicação");
  const publicData = {};
  for (const [line, groups] of Object.entries(DATA)) {
    if (!Array.isArray(groups)) continue;
    const safeLine = publicLine(line, groups);
    if (!publicData[safeLine]) publicData[safeLine] = [];
    publicData[safeLine].push(...groups.map(group => {
      const safeGroup = pick(group, GROUP_FIELDS);
      safeGroup.items = Array.isArray(group?.items) ? group.items.map(item => {
        const safeItem = pick(item, PRODUCT_FIELDS);
        safeItem.public_id = publicId(line, group, item);
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
