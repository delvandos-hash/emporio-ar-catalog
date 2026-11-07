import { toPublicCatalog } from "../../scripts/public-catalog.mjs";
const GIST_RAW_URL = "https://gist.githubusercontent.com/delvandos-hash/11918b7196b3ee6a0d8a91739167b312/raw/catalogo.json";
const TOP_LEVEL_FIELDS = new Set(["DATA", "WHATSAPP", "BRAND", "ultimaAtualizacao"]);
const BRAND_FIELDS = new Set(["name", "phone"]);
function pickFields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean = {};
  for (const [key, child] of Object.entries(value)) if (allowed.has(key)) clean[key] = child;
  return clean;
}
export function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Formato de resposta inválido");
  const clean = {};
  for (const key of TOP_LEVEL_FIELDS) {
    if (!(key in payload)) continue;
    if (key === "DATA") clean.DATA = toPublicCatalog(payload.DATA);
    else if (key === "BRAND") clean.BRAND = pickFields(payload.BRAND, BRAND_FIELDS);
    else if (key === "WHATSAPP" && typeof payload.WHATSAPP === "string") clean.WHATSAPP = payload.WHATSAPP;
    else if (key === "ultimaAtualizacao" && typeof payload.ultimaAtualizacao === "string") clean.ultimaAtualizacao = payload.ultimaAtualizacao;
  }
  if (!clean.DATA) throw new Error("Catálogo sem dados");
  return clean;
}
function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": status === 200 ? "public, max-age=60" : "no-store",
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
