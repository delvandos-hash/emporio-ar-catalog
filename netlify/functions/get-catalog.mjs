import { createHash } from "node:crypto";
import { toPublicCatalog } from "../../scripts/public-catalog.mjs";
import { isExcludedImaratAtherri } from "../../scripts/catalog-identity.mjs";

const GIST_RAW_URL = "https://gist.githubusercontent.com/delvandos-hash/11918b7196b3ee6a0d8a91739167b312/raw/catalogo.json";
const TOP_LEVEL_FIELDS = new Set(["DATA", "WHATSAPP", "BRAND", "ultimaAtualizacao"]);
const BRAND_FIELDS = new Set(["name", "phone"]);
const INCORRECT_ATHERRI_ORIGIN_REF = "o_" + createHash("sha256")
  .update("imarat|afeer|1481").digest("hex").slice(0, 24);

function pickFields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean = {};
  for (const [key, child] of Object.entries(value)) if (allowed.has(key)) clean[key] = child;
  return clean;
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase().replace(/\s+/g, " ");
}

// O Gist contém a projeção pública: ela não carrega id_origem/fonte, mas preserva
// origin_ref, hash estável derivado da origem, marca e ID do cadastro.
export function filterExcludedAtherri(DATA) {
  if (!DATA || typeof DATA !== "object" || Array.isArray(DATA)) {
    throw new Error("DATA inválido para filtragem");
  }
  const filtered = {};
  let removed = 0;
  for (const [line, groups] of Object.entries(DATA)) {
    if (!Array.isArray(groups)) {
      filtered[line] = groups;
      continue;
    }
    filtered[line] = groups.map(group => {
      const items = Array.isArray(group?.items) ? group.items : [];
      const kept = items.filter(item => {
        const exactPublicIdentity =
          normalizeText(group?.brand) === "afeer" &&
          normalizeText(item?.nome ?? item?.name) === "miniatura atherri afeer" &&
          normalizeText(item?.volume ?? item?.sizeMl).replace(/\s/g, "") === "30ml" &&
          String(item?.origin_ref ?? "").trim() === INCORRECT_ATHERRI_ORIGIN_REF;
        const sourceId = String(item?.id_origem ?? "").trim();
        const sourceName = String(item?.fonte ?? "").trim().toLowerCase();
        const privateSourceIdentity =
          (sourceName === "imarat" || (!sourceName && sourceId === "1481")) &&
          isExcludedImaratAtherri(item, group?.brand);
        const exclude = exactPublicIdentity || privateSourceIdentity;
        if (exclude) removed++;
        return !exclude;
      });
      return { ...group, items: kept };
    });
  }
  return { DATA: filtered, removed };
}

export function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Formato de resposta inválido");
  const clean = {};
  for (const key of TOP_LEVEL_FIELDS) {
    if (!(key in payload)) continue;
    if (key === "DATA") {
      const filtered = filterExcludedAtherri(payload.DATA);
      clean.DATA = toPublicCatalog(filtered.DATA);
    } else if (key === "BRAND") clean.BRAND = pickFields(payload.BRAND, BRAND_FIELDS);
    else if (key === "WHATSAPP" && typeof payload.WHATSAPP === "string") clean.WHATSAPP = payload.WHATSAPP;
    else if (key === "ultimaAtualizacao" && typeof payload.ultimaAtualizacao === "string") clean.ultimaAtualizacao = payload.ultimaAtualizacao;
  }
  if (!clean.DATA) throw new Error("Catálogo sem dados");
  return clean;
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": status === 200 ? "public, max-age=60, s-maxage=300, stale-while-revalidate=600" : "no-store",
    "X-Content-Type-Options": "nosniff"
  }});
}

export default async () => {
  try {
    const response = await fetch(GIST_RAW_URL, { headers: { "User-Agent": "EmporioAR-Catalog/1.0" }, redirect: "error" });
    if (!response.ok) return jsonResponse({ erro: "Catálogo temporariamente indisponível." }, 502);
    return jsonResponse(sanitizePayload(await response.json()), 200);
  } catch {
    return jsonResponse({ erro: "Catálogo temporariamente indisponível." }, 502);
  }
};
