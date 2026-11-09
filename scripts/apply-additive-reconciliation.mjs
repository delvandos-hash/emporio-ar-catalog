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
  return [norm(line), norm(group?.brand), norm(item?.nome), volumeMatch(item?.volume, item?.nome)].join("|");
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

function collectKeys(DATA) {
  const keys = new Set();
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        if (item?.nome) keys.add(identity(line, group, item));
      }
    }
  }
  return keys;
}

function collectInternalIndex(DATA) {
  const index = new Map();
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        if (!item?.nome) continue;
        const key = identity(line, group, item);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ line, group, item });
      }
    }
  }
  return index;
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
  const internalIndex = collectInternalIndex(internalDATA);
  const liveKeys = collectKeys(liveDATA);
  const internalKeys = new Set(internalIndex.keys());
  const missingFromInternal = [...liveKeys].filter(key => !internalKeys.has(key));
  const additions = [...internalKeys].filter(key => !liveKeys.has(key));

  if (missingFromInternal.length) {
    throw new Error(`Publicação bloqueada: ${missingFromInternal.length} itens atuais do Gist ainda não estão no data.js. Nenhum dado foi enviado.`);
  }
  if (!additions.length || additions.length > 30) {
    throw new Error(`Publicação bloqueada: quantidade de novos itens fora do limite aditivo (novos=${additions.length}, máximo=30).`);
  }

  for (const key of additions) {
    const rows = internalIndex.get(key) || [];
    if (rows.length !== 1) throw new Error(`Publicação bloqueada: identidade interna ambígua: ${key}`);
    const { item } = rows[0];
    const source = norm(item.fonte);
    if (!ALLOWED_SOURCES.has(source)) throw new Error(`Publicação bloqueada: fonte não confirmada para ${key}: ${source || "vazia"}`);
    if (source !== "brand" && !String(item.id_origem || "").trim()) {
      throw new Error(`Publicação bloqueada: produto sem ID de origem: ${key}`);
    }
  }

  const sanitizedInternal = toPublicCatalog(internalDATA);
  const mergedPublic = structuredClone(liveDATA);
  const mergedKeys = new Set(liveKeys);
  let appended = 0;

  for (const [line, groups] of Object.entries(internalDATA)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        if (!item?.nome) continue;
        const key = identity(line, group, item);
        if (liveKeys.has(key)) continue;

        const one = toPublicCatalog({ [line]: [{ brand: group.brand, cat: group.cat, items: [item] }] });
        const publicLine = Object.keys(one)[0];
        const publicGroup = one[publicLine]?.[0];
        const publicItem = publicGroup?.items?.[0];
        if (!publicLine || !publicGroup || !publicItem) throw new Error(`Falha ao sanitizar novo item: ${key}`);
        const publicKey = identity(publicLine, publicGroup, publicItem);
        if (publicKey !== key) throw new Error(`Identidade mudou durante sanitização: ${key} -> ${publicKey}`);
        if (mergedKeys.has(publicKey)) continue;
        addSafePublicItem(mergedPublic, publicLine, publicGroup, publicItem);
        mergedKeys.add(publicKey);
        appended++;
      }
    }
  }

  if (appended !== additions.length) {
    throw new Error(`Quantidade adicionada diverge da auditoria: esperado=${additions.length}; adicionado=${appended}`);
  }
  for (const key of liveKeys) if (!mergedKeys.has(key)) throw new Error(`Item atual do Gist seria removido: ${key}`);

  const nextSnapshot = snapshot.DATA
    ? { ...snapshot, DATA: mergedPublic, ultimaAtualizacao: new Date().toISOString() }
    : mergedPublic;

  console.log(`GIST_EXISTING_PRESERVED=${liveKeys.size}`);
  console.log(`SOURCE_CONFIRMED_ADDITIONS=${appended}`);
  console.log("GIST será atualizado somente com itens novos; registros atuais, preços e imagens existentes permanecem intactos.");

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
  const missingAfter = [...mergedKeys].filter(key => !afterKeys.has(key));
  const lostBefore = [...liveKeys].filter(key => !afterKeys.has(key));
  if (missingAfter.length || lostBefore.length) {
    throw new Error(`Verificação pós-publicação falhou: faltando=${missingAfter.length}; removidos=${lostBefore.length}`);
  }
  console.log(`GIST_RECONCILIATION_VERIFIED=true totalKeys=${afterKeys.size} additions=${appended} removed=0`);
}

main().catch(error => { console.error(error); process.exit(1); });
