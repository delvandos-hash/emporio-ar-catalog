/**
 * API /api/catalogo — publica somente os campos necessários à vitrine.
 * A estrutura é validada por allowlist; campos novos ou internos ficam de fora.
 */
import { sanitizePublicImageUrl } from "../../scripts/public-image-url.mjs";

const GIST_RAW_URL =
  "https://gist.githubusercontent.com/delvandos-hash/11918b7196b3ee6a0d8a91739167b312/raw/catalogo.json";

const TOP_LEVEL_FIELDS = new Set(["DATA", "WHATSAPP", "BRAND", "ultimaAtualizacao"]);
const BRAND_FIELDS = new Set(["name", "phone"]);
const GROUP_FIELDS = new Set(["brand", "cat", "items"]);
const PRODUCT_FIELDS = new Set([
  "nome", "volume", "varejo", "atacado", "foto", "fotos", "notas",
  "disponivel", "badge", "fonte", "novoDesde", "id_origem", "variacoes"
]);
const VARIATION_FIELDS = new Set(["id", "nome", "estoque"]);

function pickFields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    if (allowed.has(key)) clean[key] = child;
  }
  return clean;
}

function sanitizeProduct(value) {
  const product = pickFields(value, PRODUCT_FIELDS);
  if (product.id_origem != null) product.id_origem = String(product.id_origem).slice(0, 120);
  if (product.foto != null) {
    const safePhoto = sanitizePublicImageUrl(product.foto);
    if (safePhoto) product.foto = safePhoto;
    else delete product.foto;
  }
  if (Array.isArray(product.fotos)) {
    product.fotos = product.fotos
      .map((value) => sanitizePublicImageUrl(value))
      .filter(Boolean);
  } else {
    delete product.fotos;
  }
  if (Array.isArray(product.variacoes)) {
    product.variacoes = product.variacoes.map((variation) => {
      const clean = pickFields(variation, VARIATION_FIELDS);
      if (clean.id != null) clean.id = String(clean.id).slice(0, 120);
      if (clean.nome != null) clean.nome = String(clean.nome).slice(0, 120);
      const stock = Number(clean.estoque);
      clean.estoque = Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : 0;
      return clean;
    });
  } else {
    delete product.variacoes;
  }
  return product;
}

function sanitizeData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Formato de catálogo inválido");
  }
  const clean = {};
  for (const [line, groups] of Object.entries(data)) {
    if (!Array.isArray(groups)) continue;
    clean[line] = groups.map((group) => {
      const safeGroup = pickFields(group, GROUP_FIELDS);
      safeGroup.items = Array.isArray(group?.items)
        ? group.items.map(sanitizeProduct)
        : [];
      return safeGroup;
    });
  }
  return clean;
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Formato de resposta inválido");
  }
  const clean = {};
  for (const key of TOP_LEVEL_FIELDS) {
    if (!(key in payload)) continue;
    if (key === "DATA") clean.DATA = sanitizeData(payload.DATA);
    else if (key === "BRAND") clean.BRAND = pickFields(payload.BRAND, BRAND_FIELDS);
    else if (key === "WHATSAPP" && typeof payload.WHATSAPP === "string") {
      clean.WHATSAPP = payload.WHATSAPP;
    } else if (key === "ultimaAtualizacao" && typeof payload.ultimaAtualizacao === "string") {
      clean.ultimaAtualizacao = payload.ultimaAtualizacao;
    }
  }
  if (!clean.DATA) throw new Error("Catálogo sem dados");
  return clean;
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=60" : "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export default async () => {
  try {
    const response = await fetch(GIST_RAW_URL, {
      headers: { "User-Agent": "EmporioAR-Catalog/1.0" },
      redirect: "error"
    });

    if (!response.ok) {
      return jsonResponse({ erro: "Catálogo temporariamente indisponível." }, 502);
    }

    const data = await response.json();
    return jsonResponse(sanitizePayload(data), 200);
  } catch {
    // Não expõe URL de origem, status interno, stack ou mensagem do provedor.
    return jsonResponse({ erro: "Catálogo temporariamente indisponível." }, 502);
  }
};
