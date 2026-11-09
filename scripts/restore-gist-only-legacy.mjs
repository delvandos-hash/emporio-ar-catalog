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

function readInternal() {
  const raw = fs.readFileSync(dataPath, "utf8");
  const match = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!match) throw new Error("DATA não encontrada em js/data.js");
  const DATA = JSON.parse(match[1]);
  const whatsapp = raw.match(/export const WHATSAPP = [^;]+;/)?.[0] || 'export const WHATSAPP = "5562991134488";';
  const brand = raw.match(/export const BRAND = [^;]+;/)?.[0] || 'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };';
  return { DATA, whatsapp, brand };
}

async function main() {
  const token = process.env.GIST_TOKEN;
  if (!token) throw new Error("GIST_TOKEN ausente");
  const { DATA, whatsapp, brand } = readInternal();
  const liveDATA = await fetchGist(token);

  // O dry-run completo já consultou Sophia, Franny, Dande, Brand e Imarat.
  // Só restauramos os seis registros legados de roupas ainda presentes no Gist,
  // que não retornaram em nenhuma das fontes atuais.
  const currentPublic = toPublicCatalog(DATA);
  const currentPublicIds = new Set();
  const currentIdentities = new Set();
  for (const [line, groups] of Object.entries(currentPublic)) for (const group of groups || []) {
    for (const item of group.items || []) {
      if (item.public_id) currentPublicIds.add(item.public_id);
      currentIdentities.add(identity(line, group, item));
    }
  }

  const restored = [];
  for (const [line, groups] of Object.entries(liveDATA)) {
    if (!["masculino", "feminino", "unissex", "roupas", "acessorios"].includes(norm(line))) continue;
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group.items) ? group.items : []) {
        const key = identity(line, group, item);
        if ((item.public_id && currentPublicIds.has(item.public_id)) || currentIdentities.has(key)) continue;

        const cat = String(group.cat || "Roupas");
        if (!Array.isArray(DATA[line])) DATA[line] = [];
        let target = DATA[line].find(g => norm(g.brand) === norm(group.brand) && norm(g.cat) === norm(cat));
        if (!target) {
          target = { brand: group.brand || "Empório A.R", cat, items: [] };
          DATA[line].push(target);
        }

        const legacy = {
          nome: item.nome,
          volume: item.volume || "—",
          varejo: item.varejo,
          atacado: item.atacado,
          foto: item.foto || "",
          ...(Array.isArray(item.fotos) ? { fotos: item.fotos } : {}),
          notas: item.notas || "",
          badge: item.badge || "",
          ...(item.novoDesde ? { novoDesde: item.novoDesde } : {}),
          ...(Array.isArray(item.variacoes) ? { variacoes: item.variacoes } : {}),
          disponivel: item.disponivel || "Não",
          ...(item.stock_ref ? { stock_ref: item.stock_ref } : {}),
          ...(item.stock_route ? { stock_route: item.stock_route } : {}),
          precoManual: true,
          fonte: "legacy-gist"
        };
        target.items.push(legacy);
        currentIdentities.add(key);
        restored.push({ nome: legacy.nome, marca: group.brand, categoria: cat });
      }
    }
  }

  const checkPublic = toPublicCatalog(DATA);
  const checkIds = new Set();
  const checkIdentities = new Set();
  for (const [line, groups] of Object.entries(checkPublic)) for (const group of groups || []) {
    for (const item of group.items || []) {
      if (item.public_id) checkIds.add(item.public_id);
      checkIdentities.add(identity(line, group, item));
    }
  }
  const missing = [];
  for (const [line, groups] of Object.entries(liveDATA)) for (const group of groups || []) {
    for (const item of group.items || []) {
      const key = identity(line, group, item);
      if ((item.public_id && !checkIds.has(item.public_id)) || !checkIdentities.has(key)) {
        missing.push({ line, brand: group.brand, cat: group.cat, nome: item.nome, public_id: item.public_id, stock_ref: item.stock_ref || "" });
      }
    }
  }
  if (missing.length) {
    console.log("GIST_PUBLIC_ID_AINDA_AUSENTE " + JSON.stringify(missing));
    throw new Error(`Restaram ${missing.length} public_id do Gist sem representação interna; nada foi salvo.`);
  }
  if (restored.length > 50) throw new Error(`Restauração legada excedeu o limite seguro de 50 itens (${restored.length}); nada foi salvo.`);

  const out = "/** Empório A.R — recuperação aditiva de legado Gist " + new Date().toISOString() + " */\n" +
    "export const DATA = " + JSON.stringify(DATA) + ";\n" + whatsapp + "\n" + brand + "\n";
  fs.writeFileSync(dataPath, out, "utf8");
  console.log(`LEGACY_GIST_RESTORED=${restored.length}`);
  for (const item of restored) console.log("LEGACY GIST PRESERVADO " + JSON.stringify(item));
  console.log("Todos os public_id existentes no Gist permanecem representados no data.js.");
}

main().catch(error => { console.error(error); process.exit(1); });
