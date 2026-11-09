import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toPublicCatalog } from "./public-catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "js", "data.js");
const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";

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
  if (!target.foto && publicItem.foto) target.foto = publicItem.foto;
  if ((!Array.isArray(target.fotos) || !target.fotos.length) &&
      Array.isArray(publicItem.fotos) && publicItem.fotos.length) {
    target.fotos = [...publicItem.fotos];
  }
  if (!target.notas && publicItem.notas) target.notas = publicItem.notas;
  if (!target.badge && publicItem.badge) target.badge = publicItem.badge;
  if (!target.novoDesde && publicItem.novoDesde) target.novoDesde = publicItem.novoDesde;
  if ((!Array.isArray(target.variacoes) || !target.variacoes.length) &&
      Array.isArray(publicItem.variacoes) && publicItem.variacoes.length) {
    target.variacoes = [...publicItem.variacoes];
  }
  if (!target.stock_ref && publicItem.stock_ref) target.stock_ref = publicItem.stock_ref;
  if (!target.stock_route && publicItem.stock_route) target.stock_route = publicItem.stock_route;
  if (!target.public_id && publicItem.public_id) target.public_id = publicItem.public_id;
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

function buildIdentityIndex(DATA) {
  const index = new Map();
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        const key = identity(line, group, item);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(item);
      }
    }
  }
  return index;
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

async function main() {
  const token = process.env.GIST_TOKEN;
  if (!token) throw new Error("GIST_TOKEN ausente");
  const { DATA, whatsapp, brand } = readInternal();
  const liveDATA = await fetchGist(token);
  const index = buildIdentityIndex(DATA);
  let restored = 0;
  let merged = 0;
  const ambiguous = [];

  // Preserva somente os registros legados de roupas e acessórios Empório A.R.
  // Perfumes e miniaturas devem ser reconciliados pelas fontes atuais.
  for (const [line, groups] of Object.entries(liveDATA)) {
    if (!["roupas", "acessorios"].includes(norm(line))) continue;
    for (const group of Array.isArray(groups) ? groups : []) {
      if (norm(group?.brand) !== "emporio a r") continue;
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        if (!item?.nome) continue;
        const key = identity(line, group, item);
        const matches = index.get(key) || [];
        if (matches.length > 1) {
          ambiguous.push({ line, brand: group.brand, cat: group.cat, nome: item.nome, matches: matches.length });
          continue;
        }
        if (matches.length === 1) {
          mergePublicFields(matches[0], item);
          merged++;
          continue;
        }
        const cat = String(group.cat || "Roupas");
        if (!Array.isArray(DATA[line])) DATA[line] = [];
        let target = DATA[line].find(g => norm(g.brand) === norm(group.brand) && norm(g.cat) === norm(cat));
        if (!target) {
          target = { brand: group.brand || "Empório A.R", cat, items: [] };
          DATA[line].push(target);
        }
        const legacy = legacyFromPublic(item);
        target.items.push(legacy);
        index.set(key, [legacy]);
        restored++;
      }
    }
  }

  if (ambiguous.length) {
    console.log("LEGACY_GIST_IDENTITY_AMBIGUA " + JSON.stringify(ambiguous));
    throw new Error(`Há ${ambiguous.length} identidades legadas com mais de um registro interno; nada foi salvo.`);
  }

  const checkPublic = toPublicCatalog(DATA);
  const checkIndex = buildIdentityIndex(checkPublic);
  const missing = [];
  for (const [line, groups] of Object.entries(liveDATA)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        if (!checkIndex.has(identity(line, group, item))) {
          missing.push({ line, brand: group.brand, cat: group.cat, nome: item.nome, public_id: item.public_id || "", stock_ref: item.stock_ref || "" });
        }
      }
    }
  }
  if (missing.length) {
    console.log("GIST_IDENTITY_AINDA_AUSENTE " + JSON.stringify(missing));
    throw new Error(`Restaram ${missing.length} identidades do Gist sem representação interna; nada foi salvo.`);
  }

  const out = "/** Empório A.R — recuperação aditiva de legado Gist " + new Date().toISOString() + " */\n" +
    "export const DATA = " + JSON.stringify(DATA) + ";\n" + whatsapp + "\n" + brand + "\n";
  fs.writeFileSync(dataPath, out, "utf8");
  console.log(`LEGACY_GIST_RESTORED=${restored} LEGACY_GIST_MERGED=${merged}`);
  console.log("Todos os itens públicos existentes no Gist permanecem representados no data.js.");
  for (const [line, groups] of Object.entries(liveDATA)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      if (norm(line) !== "roupas" && norm(line) !== "acessorios") continue;
      if (norm(group.brand) !== "emporio a r") continue;
      for (const item of Array.isArray(group.items) ? group.items : []) {
        console.log("LEGACY GIST PRESERVADO " + JSON.stringify({ nome: item.nome, marca: group.brand, categoria: group.cat, public_id: item.public_id || "" }));
      }
    }
  }
}

main().catch(error => { console.error(error); process.exit(1); });
