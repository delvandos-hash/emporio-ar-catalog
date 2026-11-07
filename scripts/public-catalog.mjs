import { sanitizePublicImageUrl } from "./public-image-url.mjs";

/**
 * Projeção pública do catálogo.
 * O Gist é público: enviar apenas os campos consumidos pela vitrine.
 */
const GROUP_FIELDS = new Set(["brand", "cat"]);
const PRODUCT_FIELDS = new Set([
  "nome", "volume", "varejo", "atacado", "foto", "fotos", "notas",
  "disponivel", "badge", "fonte", "novoDesde", "id_origem", "variacoes"
]);
const VARIATION_FIELDS = new Set(["id", "nome", "estoque"]);

function pick(value, allowed) {
  const out = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, child] of Object.entries(value)) {
    if (allowed.has(key)) out[key] = child;
  }
  return out;
}

export function toPublicCatalog(DATA) {
  if (!DATA || typeof DATA !== "object" || Array.isArray(DATA)) {
    throw new Error("DATA inválido para publicação");
  }
  const publicData = {};
  for (const [line, groups] of Object.entries(DATA)) {
    if (!Array.isArray(groups)) continue;
    publicData[line] = groups.map((group) => {
      const safeGroup = pick(group, GROUP_FIELDS);
      safeGroup.items = Array.isArray(group?.items) ? group.items.map((item) => {
        const safeItem = pick(item, PRODUCT_FIELDS);
        if (safeItem.id_origem != null) safeItem.id_origem = String(safeItem.id_origem).slice(0, 120);
        if (safeItem.foto != null) {
          const safePhoto = sanitizePublicImageUrl(safeItem.foto);
          if (safePhoto) safeItem.foto = safePhoto;
          else delete safeItem.foto;
        }
        if (Array.isArray(safeItem.fotos)) {
          safeItem.fotos = safeItem.fotos
            .map((url) => sanitizePublicImageUrl(url))
            .filter(Boolean);
        } else {
          delete safeItem.fotos;
        }
        if (Array.isArray(safeItem.variacoes)) {
          safeItem.variacoes = safeItem.variacoes.map((variation) => {
            const safeVariation = pick(variation, VARIATION_FIELDS);
            if (safeVariation.id != null) safeVariation.id = String(safeVariation.id).slice(0, 120);
            if (safeVariation.nome != null) safeVariation.nome = String(safeVariation.nome).slice(0, 120);
            const stock = Number(safeVariation.estoque);
            safeVariation.estoque = Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : 0;
            return safeVariation;
          });
        } else {
          delete safeItem.variacoes;
        }
        return safeItem;
      }) : [];
      return safeGroup;
    });
  }
  return publicData;
}
