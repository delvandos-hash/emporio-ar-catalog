/**
 * Sincroniza estoque + novos produtos (Imarat + Brand filtrado)
 * Envia os dados para o GitHub Gist
 * Versão: Kit 9=Vulcan, anti-dup Armaf, óleos→Óleos, Tabaco, precoManual protegido, BODY SPLASH.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toPublicCatalog } from './public-catalog.mjs';
import { sanitizePublicImageUrl } from './public-image-url.mjs';
import { resolveImaratImageUrl } from './imarat-image-url.mjs';
import { normalProductKey, normalProductNameVolumeKey, miniIdentityBaseKey, miniIdentityNameVolumeKey, isDuplicateMiniSource, exactCatalogFingerprint } from './catalog-identity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'js', 'data.js');
const IMARAT_API = process.env.IMARAT_API_URL;
const IMARAT_ORIGIN = process.env.IMARAT_ORIGIN_URL;
const BRAND_BASE = process.env.BRAND_BASE_URL;
const CDN_IMAGE_BASE = process.env.CDN_IMAGE_BASE_URL;
const BRAND_SELLER = 'darlanaugusto';

const BRAND_ALLOWED_SESSIONS = [
  'ARABIC COLLECTION', 'BEAUTY BRAND', 'BODY SPLASH',
  'COLEÇÂO DREAM', 'COLECAO DREAM', 'COLEÇÃO BRAND', 'COLECAO BRAND',
  'DREAM BRAND 80/100ML', 'DREAM BRAND', 'FLACONETE BRAND',
  'FLACONETE  BRAND', 'SAPATINHO GOOD GIRL',
];

const SYNC_DRY_RUN = process.env.SYNC_DRY_RUN === '1';
const SYNC_SKIP_DETAILS = process.env.SYNC_SKIP_DETAILS === '1';
const SYNC_IMARAT_ONLY = process.env.SYNC_IMARAT_ONLY === '1';
const SYNC_DANDE_ONLY = process.env.SYNC_DANDE_ONLY === '1';
const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";
let LIVE_GIST_DATA = null;

function publicPriceNumber(value) {
  const raw = String(value ?? "").trim().replace(/[^0-9,.-]/g, "");
  if (!raw) return NaN;
  return Number(raw.includes(",") ? raw.replaceAll(".", "").replace(",", ".") : raw);
}
function publicBaseIdentity(line, group, item) {
  return [norm(line), norm(group?.brand), norm(group?.cat), norm(item?.nome), volumeMatch(item?.volume, item?.nome)].join("|");
}
function publicVariantMatch(item, publicItem) {
  const photos = value => {
    const list = Array.isArray(value?.fotos) && value.fotos.length ? value.fotos : (value?.foto ? [value.foto] : []);
    return [...new Set(list.map(x => String(x || "").trim()).filter(Boolean))].sort().join("~");
  };
  return norm(item?.nome) === norm(publicItem?.nome) &&
    volumeMatch(item?.volume, item?.nome) === volumeMatch(publicItem?.volume, publicItem?.nome) &&
    publicPriceNumber(item?.varejo) === publicPriceNumber(publicItem?.varejo) &&
    publicPriceNumber(item?.atacado) === publicPriceNumber(publicItem?.atacado) &&
    photos(item) === photos(publicItem);
}
function preserveLivePublicFields(DATA, liveDATA) {
  if (!liveDATA) return { matched: 0, prices: 0, photos: 0, ambiguous: 0 };
  const publicData = toPublicCatalog(DATA);
  const liveByPublicId = new Map();
  const liveByStockRef = new Map();
  const liveByBase = new Map();
  const used = new Set();
  for (const [line, groups] of Object.entries(liveDATA)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        if (item.public_id) liveByPublicId.set(String(item.public_id), item);
        if (item.stock_ref) {
          if (!liveByStockRef.has(String(item.stock_ref))) liveByStockRef.set(String(item.stock_ref), []);
          liveByStockRef.get(String(item.stock_ref)).push(item);
        }
        const key = publicBaseIdentity(line, group, item);
        if (!liveByBase.has(key)) liveByBase.set(key, []);
        liveByBase.get(key).push(item);
      }
    }
  }
  const publicQueues = new Map();
  for (const [line, groups] of Object.entries(publicData)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        const key = publicBaseIdentity(line, group, item);
        if (!publicQueues.has(key)) publicQueues.set(key, []);
        publicQueues.get(key).push(item);
      }
    }
  }

  let matched = 0, prices = 0, photos = 0, ambiguous = 0;
  for (const [line, groups] of Object.entries(DATA)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        const key = publicBaseIdentity(line, group, item);
        const publicItem = publicQueues.get(key)?.shift();
        if (!publicItem) continue;
        let liveItem = item.public_id ? liveByPublicId.get(String(item.public_id)) : null;
        if (liveItem && used.has(liveItem)) liveItem = null;
        if (!liveItem && publicItem.stock_ref) {
          const refs = (liveByStockRef.get(String(publicItem.stock_ref)) || []).filter(x => !used.has(x));
          if (refs.length === 1) liveItem = refs[0];
        }
        if (!liveItem) {
          const candidates = (liveByBase.get(key) || []).filter(x => !used.has(x));
          if (candidates.length === 1) liveItem = candidates[0];
          else if (candidates.length > 1) {
            const exact = candidates.filter(x => publicVariantMatch(publicItem, x));
            if (exact.length === 1) liveItem = exact[0];
            else ambiguous++;
          }
        }
        if (!liveItem) continue;
        used.add(liveItem);
        matched++;

        if (!(item.precoManual === true || item.precoManual === "true" || item.precoManual === 1)) {
          const liveRetail = publicPriceNumber(liveItem.varejo);
          const liveWholesale = publicPriceNumber(liveItem.atacado);
          const currentRetail = publicPriceNumber(item.varejo);
          const currentWholesale = publicPriceNumber(item.atacado);
          if (Number.isFinite(liveRetail) && Number.isFinite(liveWholesale) &&
              (liveRetail !== currentRetail || liveWholesale !== currentWholesale)) {
            item.varejo = liveItem.varejo;
            item.atacado = liveItem.atacado;
            item.precoManual = true;
            prices++;
          }
        }

        const existingPhotos = [
          ...(Array.isArray(item.fotos) ? item.fotos : []), item.foto || ""
        ];
        const livePhotos = [
          ...(Array.isArray(liveItem.fotos) ? liveItem.fotos : []), liveItem.foto || ""
        ];
        const mergedPhotos = [...new Set([...existingPhotos, ...livePhotos].map(x => String(x || "").trim()).filter(Boolean))];
        if (mergedPhotos.length > existingPhotos.filter(Boolean).length) photos++;
        if (mergedPhotos.length) item.fotos = mergedPhotos;
        if (!item.foto && liveItem.foto) item.foto = liveItem.foto;
        if (!item.notas && liveItem.notas) item.notas = liveItem.notas;
        if (!item.badge && liveItem.badge) item.badge = liveItem.badge;
        if (!item.novoDesde && liveItem.novoDesde) item.novoDesde = liveItem.novoDesde;
        if ((!Array.isArray(item.variacoes) || !item.variacoes.length) &&
            Array.isArray(liveItem.variacoes) && liveItem.variacoes.length) item.variacoes = [...liveItem.variacoes];
        if (!item.stock_ref && liveItem.stock_ref) item.stock_ref = liveItem.stock_ref;
        if (!item.stock_route && liveItem.stock_route) item.stock_route = liveItem.stock_route;
        if (!item.public_id && liveItem.public_id) item.public_id = liveItem.public_id;
      }
    }
  }
  console.log(`LIVE_PUBLIC_MATCHED=${matched} LIVE_PUBLIC_PRICES_PROTECTED=${prices} LIVE_PUBLIC_GALLERIES_MERGED=${photos} LIVE_PUBLIC_AMBIGUOUS=${ambiguous}`);
  return { matched, prices, photos, ambiguous };
}

async function fetchLiveGistBaseline() {
  const token = process.env.GIST_TOKEN;
  if (!token) throw new Error("GIST_TOKEN não configurado para validar a base viva do catálogo.");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "EmporioAR-Sync-Baseline-Guard/1.0"
  };
  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });
  if (!response.ok) throw new Error(`Falha ao validar Gist vivo: HTTP ${response.status}`);
  const gist = await response.json();
  const file = gist.files?.["catalogo.json"];
  if (!file) throw new Error("Gist vivo sem catalogo.json; sincronização bloqueada por segurança.");
  let raw = file.content;
  if (file.truncated || !raw) {
    if (!file.raw_url) throw new Error("Gist truncado sem raw_url; sincronização bloqueada.");
    const rawResponse = await fetch(file.raw_url, { headers });
    if (!rawResponse.ok) throw new Error(`Falha ao baixar Gist vivo: HTTP ${rawResponse.status}`);
    raw = await rawResponse.text();
  }
  const snapshot = JSON.parse(String(raw).replace(/^\uFEFF/, ""));
  const DATA = snapshot.DATA || snapshot;
  if (!DATA || typeof DATA !== "object" || Array.isArray(DATA)) {
    throw new Error("Estrutura DATA inválida no Gist vivo; sincronização bloqueada.");
  }
  return DATA;
}

function countCatalogIdentity(DATA) {
  const keys = new Set();
  let count = 0;
  for (const [line, groups] of Object.entries(DATA || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        if (!item?.nome) continue;
        count++;
        keys.add([norm(line), norm(group.brand), norm(group.cat), norm(item.nome), volumeMatch(item.volume, item.nome)].join("|"));
      }
    }
  }
  return { count, keys };
}
const ADD_IMARAT_NEW = process.env.ADD_IMARAT_NEW !== '0';
const ADD_BRAND_NEW = process.env.ADD_BRAND_NEW !== '0';
const PREFIXOS_MINI_IMARAT = ['mini armaf', 'miniatura armaf', 'miniatura', 'mini'];

// Marcas no NOME que geravam duplicata (Mini Marshmellow vs Mini Armaf Marshmellow)
const MARCAS_NO_NOME_MINI = [
  'armaf', 'lattafa', 'orientica', 'afeer', 'clive dorris',
  'french avenue', 'maison alhambra', 'al wataniah', 'only you', 'mais you', 'meryam',
];

// --- TABELA DE LIMPEZA PESADA ---
const substituicoes = {
  'ÃƒÂ±': 'ñ', 'ÃƒÂ§': 'ç', 'ÃƒÂ£': 'ã', 'ÃƒÂµ': 'õ', 'ÃƒÂ¡': 'á', 'ÃƒÂ©': 'é', 'ÃƒÂ­': 'í', 'ÃƒÂ³': 'ó', 'ÃƒÂº': 'ú',
  'ÃƒÆ’Ã‚Â': 'Í', 'Ãƒâ€š': 'Â', 'ÃƒÆ’': '',
  'Ã±': 'ñ', 'Ã§': 'ç', 'Ã£': 'ã', 'Ãµ': 'õ', 'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
  'Ã ': 'à', 'Ã¢': 'â', 'Ãª': 'ê', 'Ã´': 'ô', 'Ã»': 'û', 'Ã¼': 'ü', 'Ã¤': 'ä', 'Ã«': 'ë', 'Ã¯': 'ï', 'Ã¶': 'ö',
  'ÃÁ': 'Á', 'ÃÀ': 'À', 'ÃÂ': 'Â', 'ÃÃ': 'Ã', 'ÃÄ': 'Ä', 'ÃÉ': 'É', 'ÃÈ': 'È', 'ÃÊ': 'Ê', 'ÃË': 'Ë',
  'ÃÍ': 'Í', 'ÃÌ': 'Ì', 'ÃÎ': 'Î', 'ÃÏ': 'Ï', 'ÃÓ': 'Ó', 'ÃÒ': 'Ò', 'ÃÔ': 'Ô', 'ÃÕ': 'Õ', 'ÃÖ': 'Ö',
  'ÃÚ': 'Ú', 'ÃÙ': 'Ù', 'ÃÛ': 'Û', 'ÃÜ': 'Ü', 'ÃÇ': 'Ç', 'ÃÑ': 'Ñ',
  'EmpÃƒÂ³rio': 'Empório', 'EmpÃ"RIO': 'EMPÓRIO', 'CafÃƒÂ©': 'Café', 'PiÃƒÂ±a': 'Piña', 'CoraÃƒÂ§ÃƒÂ£o': 'Coração',
  'ÃƒÂ': 'Á', 'ÃƒÂ': 'É', 'ÃƒÂ': 'Ó'
};

function limparTexto(str) {
  if (typeof str !== 'string') return str;
  let resultado = str;
  for (let i = 0; i < 5; i++) {
    let mudou = false;
    for (const [chave, valor] of Object.entries(substituicoes)) {
      if (resultado.includes(chave)) {
        resultado = resultado.split(chave).join(valor);
        mudou = true;
      }
    }
    if (!mudou) break; 
  }
  return resultado;
}
// --------------------------------

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]s\b/gi, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function volumeMatch(value, name) {
  let raw = String(value || '').trim();
  if (raw && /^\d+(?:[.,]\d+)?$/.test(raw)) raw += 'ml';
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i) ||
    String(name || '').match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  return match ? String(Number(match[1].replace(',', '.'))) + match[2].toLowerCase() : '';
}

function titleMatchKey(name, category, brand) {
  let value = norm(name).replace(/\b\d+(?:[.,]\d+)?\s*(ml|g)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const brandKey = norm(brand);
  if (brandKey && value.startsWith(brandKey + ' ')) value = value.slice(brandKey.length).trim();
  if (norm(category).includes('mini')) {
    value = value.replace(/^(miniatura|mini)\s+/, '');
    value = value.replace(/\s+(afeer|only you|lattafa|armaf|meryam|orientica)$/, '');
  }
  // "Óleo" identifica a categoria em alguns títulos legados, mas não integra
  // o nome comercial quando a API raiz publica somente a fragrância.
  if (norm(category).includes('oleo')) value = value.replace(/^oleo\s+/, '');
  return value;
}

function titleEditDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

function titleTokenSimilarity(a, b) {
  const left = new Set(a.split(' ').filter(Boolean));
  const right = new Set(b.split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / (left.size + right.size - intersection);
}

function titleSimilarity(a, b) {
  if (!a || !b) return { score: 0, tokens: 0 };
  return {
    score: 1 - titleEditDistance(a, b) / Math.max(a.length, b.length),
    tokens: titleTokenSimilarity(a, b)
  };
}

// Remove apenas volumes, MANTENDO a palavra "caixa" e outras nomenclaturas.
function limparParaComparacao(s) { 
    return norm(s)
      .replace(/\s*\d+\s*(ml|g)\b/gi, '')
      .replace(/\s+/g, ' ').trim(); 
}

function removerPrefixosMini(s) {
  let resultado = norm(s);
  const prefixos = [...PREFIXOS_MINI_IMARAT].sort((a, b) => b.length - a.length);
  for (const prefixo of prefixos) {
    const p = norm(prefixo);
    if (resultado.startsWith(p + ' ')) resultado = resultado.slice(p.length).trim();
    else if (resultado === p) resultado = '';
  }
  return resultado;
}

function removerMarcaDoNome(s) {
  let resultado = norm(s);
  const marcas = [...MARCAS_NO_NOME_MINI].sort((a, b) => b.length - a.length);
  for (const marca of marcas) {
    const m = norm(marca);
    if (resultado.startsWith(m + ' ')) resultado = resultado.slice(m.length).trim();
    if (resultado.endsWith(' ' + m)) resultado = resultado.slice(0, -(m.length + 1)).trim();
  }
  return resultado;
}

// Mini Marshmellow === Mini Armaf Marshmellow → "marshmellow"
function chaveComparacaoMini(nome) {
  const nomeNormalizado = limparParaComparacao(nome);
  // Corrige a variação de digitação conhecida da miniatura Afeer:
  // "Miniatura Atheri Afeer" e "Miniatura Atherri Afeer" são o mesmo produto.
  if (nomeNormalizado === 'miniatura atheri afeer' || nomeNormalizado === 'miniatura atherri afeer') return 'atherri';
  return removerMarcaDoNome(removerPrefixosMini(nomeNormalizado));
}

function isOleo(nome) {
  const n = norm(nome);
  return n.startsWith('oleo') || n.includes(' oleo ');
}

function sanitizarNotas(s) {
  if (!s) return '';
  let t = limparTexto(String(s));
  t = t.replace(/\bnotas?\s+de\s+tabaco\b/gi, 'notas amadeiradas defumadas');
  t = t.replace(/\btabaco\b/gi, 'nota amadeirada defumada');
  t = t.replace(/\btobacco\b/gi, 'smoky woody note');
  return t;
}

function fmtBRL(n) { if (n == null || isNaN(n)) return '—'; return n.toFixed(2).replace('.', ','); }
function parseOrig(s) { if (s == null) return 0; const n = parseFloat(String(s).replace(/[R$\s]/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }

function isMiniatura(nome, volume, categoria) {
  const n = norm(nome); const cat = norm(categoria || '');
  if (n.includes('mini ') || n.includes('miniatura') || n.includes('mini-')) return true;
  if (cat.includes('miniatura')) return true;
  if (volume) { const v = parseFloat(String(volume).replace('ml', '')); if (!isNaN(v) && v <= 50) return true; }
  return false;
}

function isOleoCliveDorris(nome, brand) { return norm(brand).includes('clive') && norm(nome).includes('oleo'); }
function isKitLattafa(nome, brand) { return norm(brand).includes('lattafa') && norm(nome).includes('kit'); }
function isKitMusaman(nome) { return norm(nome).includes('kit musaman'); }
function isKitVulcanOuMiniatura9(nome) { 
  const n = norm(nome); 
  return n.includes('kit vulcan') || (n.includes('vulcan') && n.includes('kit')) || n.includes('kit miniatura 9'); 
}
function isKit2em1(nome) { return norm(nome).includes('kit 2 em 1'); }
function isMiniaturaBolsa(nome) { return norm(nome).includes('bolsa'); }

function calcularPrecoMiniatura(nome, brand, volume, categoria, precoVarejoOrig, precoAtacadoOrig) {
  if (!isMiniatura(nome, volume, categoria)) return { varejo: fmtBRL(precoVarejoOrig + 30), atacado: fmtBRL(precoAtacadoOrig + 30) };
  
  const n = norm(nome); const b = norm(brand);
  
  // --- REGRAS DE PREÇO FIXO ---
  if (isKit2em1(nome)) return { varejo: fmtBRL(85), atacado: fmtBRL(55) };
  if (isMiniaturaBolsa(nome)) return { varejo: fmtBRL(65), atacado: fmtBRL(45) };
  if (isOleoCliveDorris(nome, brand)) return { varejo: fmtBRL(55), atacado: fmtBRL(44) };
  
  // --- REGRAS DE ACRÉSCIMO ---
  if (isKitVulcanOuMiniatura9(nome)) return { varejo: fmtBRL(precoVarejoOrig + 130), atacado: fmtBRL(precoAtacadoOrig + 125) };
  if (isKitMusaman(nome)) return { varejo: fmtBRL(precoVarejoOrig + 60), atacado: fmtBRL(precoAtacadoOrig + 65) };
  if (isKitLattafa(nome, brand)) return { varejo: fmtBRL(precoVarejoOrig + 110), atacado: fmtBRL(precoAtacadoOrig + 90) };
  
  if (b.includes('orientica')) return { varejo: fmtBRL(precoVarejoOrig + 75), atacado: fmtBRL(precoAtacadoOrig + 45) };
  // Afeer pode vir sem a marca estruturada na API; reconhecer também pelo nome do produto.
  if (b.includes('afeer') || n.includes('afeer')) return { varejo: fmtBRL(precoVarejoOrig + 40), atacado: fmtBRL(precoAtacadoOrig + 30) }; 
  if (b.includes('clive')) return { varejo: fmtBRL(precoVarejoOrig + 70), atacado: fmtBRL(precoAtacadoOrig + 40) };
  if (b.includes('only')) return { varejo: fmtBRL(precoVarejoOrig + 60), atacado: fmtBRL(precoAtacadoOrig + 40) };
  if (b.includes('armaf')) return { varejo: fmtBRL(precoVarejoOrig + 70), atacado: fmtBRL(precoAtacadoOrig + 40) };
  if (b.includes('lattafa')) return { varejo: fmtBRL(precoVarejoOrig + 60), atacado: fmtBRL(precoAtacadoOrig + 40) };
  if (b.includes('mais you')) return { varejo: fmtBRL(precoVarejoOrig + 60), atacado: fmtBRL(precoAtacadoOrig + 40) };
  if (b.includes('maison')) return { varejo: fmtBRL(precoVarejoOrig + 60), atacado: fmtBRL(precoAtacadoOrig + 40) };
  if (b.includes('meryam') || n.includes('meryam')) return { varejo: fmtBRL(precoVarejoOrig + 60), atacado: fmtBRL(precoAtacadoOrig + 40) };
  if (b.includes('french')) return { varejo: fmtBRL(precoVarejoOrig + 60), atacado: fmtBRL(precoAtacadoOrig + 40) };
  if (b.includes('al wataniah')) return { varejo: fmtBRL(precoVarejoOrig + 70), atacado: fmtBRL(precoAtacadoOrig + 45) };
  if (b.includes('arabic')) return { varejo: fmtBRL(precoVarejoOrig + 70), atacado: fmtBRL(precoAtacadoOrig + 40) };
  if (b.includes('club woman') || n.includes('club woman')) return { varejo: fmtBRL(precoVarejoOrig + 75), atacado: fmtBRL(precoAtacadoOrig + 45) };
  
  if (b.includes('outros') || b.includes('outra')) return { varejo: fmtBRL(precoVarejoOrig + 60), atacado: fmtBRL(precoAtacadoOrig + 40) };

  return { varejo: fmtBRL(precoVarejoOrig + 30), atacado: fmtBRL(precoAtacadoOrig + 30) };
}

function volumeFrom(sizeMl, nome) {
  if (sizeMl) return `${sizeMl}ml`;
  const m = String(nome).toUpperCase().match(/(\d+(?:[.,]\d+)?)\s*ML\b/);
  if (m) return m[1].replace(',', '.') + 'ml';
  const g = String(nome).toUpperCase().match(/(\d+)\s*G\b/);
  if (g) return g[1] + 'g';
  return '—';
}

function genderLine(g) {
  const x = String(g || '').toLowerCase();
  if (x.includes('fem')) return 'feminino';
  if (x.includes('masc') || x === 'men' || x === 'masculino') return 'masculino';
  return 'unissex';
}

function notesToText(notes) {
  if (!notes) return '';
  if (typeof notes === 'string') return notes.trim();
  const top = (notes.top || notes.saida || []).join(', ');
  const heart = (notes.heart || notes.coracao || []).join(', ');
  const base = (notes.base || notes.fundo || []).join(', ');
  const parts = [];
  if (top) parts.push('Saída: ' + top);
  if (heart) parts.push('Coração: ' + heart);
  if (base) parts.push('Fundo: ' + base);
  return parts.join(' | ');
}

// No catálogo público, a marca genérica "Imarat" deve ser apresentada como Empório A.R.
// Normalização final: remove espaços externos de todas as marcas públicas.
function marcaPublicaImarat(brand) {
  const valor = limparTexto(brand || 'Outros').trim();
  return norm(valor) === 'imarat' ? 'Empório A.R' : valor;
}

function ensureBrandGroup(DATA, line, brand, cat) {
  DATA[line] = DATA[line] || [];
  let g = DATA[line].find((x) => x.brand === brand && x.cat === cat);
  if (!g) { g = { cat, brand, items: [] }; DATA[line].push(g); }
  return g;
}

function mapBrandSession(raw) {
  const n = norm(raw);
  if (!n) return null;
  if (n.includes('arabic collection') || n === 'arabic') return 'ARABIC COLLECTION';
  if (n.includes('sapatinho')) return 'SAPATINHO GOOD GIRL';
  if (n.includes('flaconete')) return 'FLACONETE BRAND';
  if (n.includes('tubete')) return 'TUBETES BRAND';
  if (n.includes('dream brand') || (n.includes('dream') && n.includes('80'))) return 'DREAM BRAND 80/100ML';
  if (n.includes('colecao dream') || n.includes('coleçao dream') || n === 'colecao dream') return 'COLEÇÂO DREAM';
  if (n.includes('colecao brand') || n.includes('coleçao brand')) return 'COLEÇÃO BRAND';
  if (n.includes('beauty brand')) return 'BEAUTY BRAND';
  if (n.includes('body splah') || n.includes('body splash')) {
    if (n.includes('dream') || n.includes('maison') || n.includes('brand body')) return null;
    return 'BODY SPLASH';
  }
  // nome do produto às vezes traz tubete sem categoria
  return null;
}

function isAllowedBrandProduct(p) {
  if (mapBrandSession(p.categoria_nome || p.categoria || '') != null) return true;
  const nome = norm(p.nome || p.name || '');
  return nome.includes('tubete');
}
function brandDisponivel(p) {
  if (p.status === false) return 'Não';
  if (p.controlar_estoque && p.total_estoque != null && Number(p.total_estoque) <= 0) return 'Não';
  return 'Sim';
}
function isArabicMiniBrand(p, session) { return session === 'ARABIC COLLECTION' && /25\s*ML/i.test(String(p.nome || '')); }

function priceBrand(orig, isArabicMini, session) {
  // Tubetes: preço fixo
  if (session === 'TUBETES BRAND' || (typeof session === 'string' && /tubete/i.test(session))) {
    return { varejo: '82,00', atacado: '58,00' };
  }
  if (isArabicMini) return { varejo: '125,00', atacado: '85,00' };
  if (orig <= 100) return { varejo: fmtBRL(orig + 60), atacado: fmtBRL(orig + 40) };
  return { varejo: fmtBRL(orig + 90), atacado: fmtBRL(orig + 70) };
}

async function fetchImaratList() {
  const all = [];
  let page = 1, total = 0, fetched = 0, prefixosMarcaRemovidos = 0, miniAfeerGrafiasNormalizadas = 0;
  for (let g = 0; g < 40; g++) {
    const res = await fetch(`${IMARAT_API}?page=${page}&perPage=60`, {
      headers: { 'User-Agent': 'EmporioAR-Sync/1.0', 'Accept': 'application/json', 'Accept-Charset': 'utf-8' },
    });
    if (!res.ok) throw new Error(`Imarat list HTTP ${res.status}`);
    const text = await res.text();
    const data = JSON.parse(text);
    total = data.total || total;
    const products = data.products || [];
    if (!products.length) break;
    for (const p of products) {
        p.name = limparTexto(p.name);
        if (p.brand) p.brand = limparTexto(p.brand);
        // O site raiz separa marca e nome comercial. Na linha Arabiyat Prestige,
        // "Prestige" não integra o nome Noiré Absolu: remover apenas quando vier
        // como prefixo redundante e a marca confirmar Arabiyat Prestige.
        if (norm(p.brand).includes('arabiyat prestige') && /^prestige\s+/i.test(String(p.name || ''))) {
          p.name = String(p.name).replace(/^prestige\s+/i, '').trim();
          prefixosMarcaRemovidos++;
        }
        // Grafia comercial confirmada pelo responsável: a variante "Atheri" é
        // incorreta; ambas as entradas da API devem convergir para Atherri.
        if (norm(p.brand).includes('afeer') && norm(p.name) === 'miniatura atheri afeer') {
          p.name = 'Miniatura Atherri Afeer';
          miniAfeerGrafiasNormalizadas++;
        }
        if (p.shortDesc) p.shortDesc = limparTexto(p.shortDesc);
        if (p.description) p.description = limparTexto(p.description);
    }
    all.push(...products);
    fetched += products.length;
    if (fetched >= total || products.length < 60) break;
    page++;
  }
  if (total && fetched < total) {
    throw new Error(`Paginação Imarat incompleta: recebidos ${fetched} de ${total} produtos. Sincronização interrompida para evitar limpeza com lista parcial.`);
  }
  console.log(`Prefixos de marca removidos do nome Imarat (Arabiyat Prestige): ${prefixosMarcaRemovidos}`);
  console.log(`Grafias Atheri Afeer normalizadas para Miniatura Atherri Afeer: ${miniAfeerGrafiasNormalizadas}`);
  return all;
}

function imaratImagesFrom(p, detail) {
  const out = [];
  const push = (u) => {
    if (!u) return;
    let s = String(u.url || u.src || u || '').trim();
    if (!s) return;
    if (!s.startsWith('http')) s = resolveImaratImageUrl(s, IMARAT_ORIGIN);
    if (!out.includes(s)) out.push(s);
  };
  if (detail && Array.isArray(detail.images)) detail.images.forEach(push);
  if (p) {
    push(p.image);
    push(p.hoverImage);
    if (Array.isArray(p.images)) p.images.forEach(push);
  }
  return out;
}

async function fetchImaratDetail(slug) {
  try {
    const res = await fetch(`${IMARAT_API}/${encodeURIComponent(slug)}`, {
      headers: { 'User-Agent': 'EmporioAR-Sync/1.0', 'Accept': 'application/json', 'Accept-Charset': 'utf-8' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const detail = JSON.parse(text);
    if (detail) {
        detail.name = limparTexto(detail.name);
        if (detail.notes) detail.notes = { top: (detail.notes.top||[]).map(limparTexto), heart: (detail.notes.heart||[]).map(limparTexto), base: (detail.notes.base||[]).map(limparTexto) };
        if (detail.shortDesc) detail.shortDesc = limparTexto(detail.shortDesc);
        if (detail.description) detail.description = limparTexto(detail.description);
    }
    return detail;
  } catch { return null; }
}

async function fetchBrandList() {
  const all = [];
  const warm = await fetch(`${BRAND_BASE}/c/atacado/${BRAND_SELLER}`, { headers: { 'User-Agent': 'EmporioAR-Sync/1.0' } });
  const setCookie = warm.headers.get('set-cookie') || '';
  const cookie = setCookie.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');

  for (let page = 1; page <= 80; page++) {
    const res = await fetch(`${BRAND_BASE}/c/atacado/carregar_produtos/${page}/todas/${BRAND_SELLER}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'EmporioAR-Sync/1.0', 'Accept': 'application/json', 'Content-Type': 'application/json',
        Referer: `${BRAND_BASE}/c/atacado/${BRAND_SELLER}`, Origin: BRAND_BASE, 'X-Requested-With': 'XMLHttpRequest',
        'Accept-Charset': 'utf-8', ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({ pagina_especifica: '' }),
    });
    if (!res.ok) break;
    const text = await res.text();
    const data = JSON.parse(text);
    const products = Array.isArray(data) ? data : data.produtos || [];
    if (!products.length) break;
    for (const p of products) {
        p.nome = limparTexto(p.nome);
        if (p.descricao) p.descricao = limparTexto(p.descricao);
    }
    all.push(...products);
  }
  return all;
}

// ========== SOPHIA MODA (ROUPAS) ==========
// Fallback: domínio próprio → FacilZap (resolveSophiaBase escolhe a que responde JSON)
const SOPHIA_CANDIDATES = [process.env.SOPHIA_PRIMARY_URL, process.env.SOPHIA_FALLBACK_URL].filter(Boolean);
const SOPHIA_FALLBACK_ORIGIN = process.env.SOPHIA_FALLBACK_ORIGIN;
let SOPHIA_BASE = SOPHIA_CANDIDATES[0];
const SOPHIA_LOJA = 'lojavendedoras';
const SOPHIA_CATEGORIES = [
  { id: '108042', nome: 'VESTIDOS' },
  { id: '108328', nome: 'MACACÃO/MACAQUINHOS' },
  { id: '108333', nome: 'CONJUNTOS' },
  { id: '108339', nome: 'BLUSA/CAMISA/CROPPED' },
  { id: '108338', nome: 'CALÇA/SHORT' },
  { id: '379539', nome: 'URBANA JEANS' },
];
const ADD_ROUPAS = process.env.ADD_ROUPAS !== '0';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function calcPrecosRoupas(precoBase) {
  const base = Number(String(precoBase).replace(',', '.')) || 0;
  let atacado, varejo;
  if (base > 50) {
    atacado = base + 50;
    varejo = base + 70;
  } else {
    atacado = base + 40;
    varejo = base + 60;
  }
  const fmt = (n) => n.toFixed(2).replace('.', ',');
  return { atacado: fmt(atacado), varejo: fmt(varejo), base };
}

function limparDescricaoSophia(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function fetchSophiaWithRetry(url, options, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      if (!text || text.trim().length < 10) {
        throw new Error('resposta vazia (bloqueio anti-robô)');
      }
      // HTML em vez de JSON = bloqueio
      if (text.trimStart().startsWith('<') || text.includes('<html') || text.includes('window.location')) {
        throw new Error('HTML recebido em vez de JSON (bloqueio anti-robô)');
      }
      const data = JSON.parse(text);
      return { res, data };
    } catch (e) {
      lastErr = e;
      const wait = 1500 * (i + 1) + Math.floor(Math.random() * 800);
      console.log(`  ⏳ Sophia retry ${i + 1}/${retries} em ${wait}ms: ${e.message}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}


/** Escolhe base Sophia que devolve JSON (próprio ou FacilZap) */
async function resolveSophiaBase(UA) {
  for (const base of SOPHIA_CANDIDATES) {
    try {
      const warm = await fetch(`${base}/c/atacado/${SOPHIA_LOJA}`, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
      });
      let cookie = '';
      const setCookie = warm.headers.getSetCookie?.() || [];
      if (setCookie.length) {
        cookie = setCookie.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
      } else {
        const sc = warm.headers.get('set-cookie') || '';
        cookie = sc
          .split(/,(?=[^;]+?=)/)
          .map((c) => c.split(';')[0].trim())
          .filter(Boolean)
          .join('; ');
      }
      await warm.text().catch(() => {});

      const probeUrl = `${base}/c/atacado/carregar_produtos/1/108042/${SOPHIA_LOJA}?mobile=0`;
      const origin = base === SOPHIA_CANDIDATES[1] ? SOPHIA_FALLBACK_ORIGIN : base;
      const res = await fetch(probeUrl, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: `${base}/c/atacado/${SOPHIA_LOJA}`,
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: '',
      });
      const text = await res.text();
      if (!text || text.trimStart().startsWith('<') || text.includes('window.location') || text.includes('<html')) {
        console.log(`  Sophia ${base}: HTML/redirect — próxima`);
        continue;
      }
      const data = JSON.parse(text);
      const n = Array.isArray(data.produtos) ? data.produtos.length : 0;
      if (!n) {
        console.log(`  Sophia ${base}: JSON sem produtos — próxima`);
        continue;
      }
      SOPHIA_BASE = base;
      console.log(`  ✓ Sophia base ativa: ${base} (probe ${n} produtos)`);
      return { base, cookie };
    } catch (e) {
      console.log(`  Sophia ${base}: ${e.message}`);
    }
  }
  throw new Error('Nenhuma base Sophia respondeu JSON (sophiamoda.com.br e FacilZap)');
}

async function fetchSophiaRoupas() {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  // Escolhe base viva (próprio ou FacilZap) + cookie
  const resolved = await resolveSophiaBase(UA);
  const cookie = resolved.cookie || '';
  const origin = SOPHIA_BASE === SOPHIA_CANDIDATES[1] ? SOPHIA_FALLBACK_ORIGIN : SOPHIA_BASE;

  const headers = {
    'User-Agent': UA,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    Origin: origin,
    Referer: `${SOPHIA_BASE}/c/atacado/${SOPHIA_LOJA}`,
    'X-Requested-With': 'XMLHttpRequest',
    ...(cookie ? { Cookie: cookie } : {}),
  };

  const groups = [];

  for (const cat of SOPHIA_CATEGORIES) {
    console.log(`  Categoria Roupas: ${cat.nome}`);
    const items = [];
    for (let page = 1; page <= 8; page++) {
      const url = `${SOPHIA_BASE}/c/atacado/carregar_produtos/${page}/${cat.id}/${SOPHIA_LOJA}?mobile=0`;
      try {
        const { data } = await fetchSophiaWithRetry(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ pagina_especifica: 'categoria' }),
        });

        const produtos = data.produtos || [];
        if (!produtos.length || data.acao === 'sem_mais_produtos') break;

        for (const p of produtos) {
          const precoBase =
            p.preco_por ?? p.preco ?? p.preco_de ?? p.valor ?? 0;
          const { atacado, varejo } = calcPrecosRoupas(precoBase);

          const SOPHIA_IMG_BASE = CDN_IMAGE_BASE;
          const toAbsImg = (u) => {
            if (!u) return '';
            const s = String(u.url || u).trim();
            if (!s) return '';
            if (s.startsWith('http://') || s.startsWith('https://')) return s;
            return SOPHIA_IMG_BASE + s.replace(/^\//, '');
          };
          const imagens = Array.isArray(p.imagens)
            ? p.imagens.map(toAbsImg).filter(Boolean)
            : [];
          const foto = imagens[0] || toAbsImg(p.imagem) || toAbsImg(p.foto) || '';

          const estoqueMap = p.estoque || {};
          const varDict = p.variacoes || {};
          const variacoes = Object.entries(varDict).map(([vid, vinfo]) => ({
            id: String(vid),
            nome: limparTexto((vinfo && vinfo.nome) || '').trim() || String(vid),
            cor: (vinfo && vinfo.cor) || null,
            estoque: Number(estoqueMap[vid] ?? estoqueMap[String(vid)] ?? 0) || 0,
          }));
          const totalEstoque =
            Number(p.total_estoque) ||
            variacoes.reduce((s, v) => s + v.estoque, 0);

          const descricao = limparDescricaoSophia(
            p.descricao || p.descricao_completa || p.informacoes || ''
          );

          items.push({
            nome: limparTexto(p.nome || p.titulo || 'Produto'),
            volume: '—',
            varejo,
            atacado,
            disponivel: totalEstoque > 0 ? 'Sim' : 'Não',
            notas: descricao,
            foto,
            fotos: imagens.length ? imagens : foto ? [foto] : [],
            badge: '',
            fonte: 'roupas',
            id_origem: String(p.id || ''),
            total_estoque: totalEstoque,
            variacoes,
          });
        }

        console.log(`    página ${page}: +${produtos.length}`);
        await sleep(600 + Math.floor(Math.random() * 400));
      } catch (e) {
        console.log(`    ❌ página ${page}: ${e.message}`);
        break;
      }
    }

    if (items.length) {
      groups.push({
        cat: cat.nome,
        cat_id: cat.id,
        brand: 'Empório A.R',
        items,
      });
    }
    await sleep(800);
  }

  return groups;
}


// ========== FRANNY (ROUPAS) ==========
const FRANNY_BASE = process.env.FRANNY_BASE_URL;
const FRANNY_LOJA = '62999336607';
const FRANNY_CATEGORIES = [
  { id: '265229', nome: 'VESTIDOS' },
  { id: '265231', nome: 'CONJUNTOS' },
  { id: '347434', nome: 'BLUSA/CAMISA/CROPPED' },
  { id: '265225', nome: 'BLUSA/CAMISA/CROPPED' },
  { id: '304447', nome: 'CALÇA/SHORT' },
  { id: '265226', nome: 'CALÇA/SHORT' },
  { id: '265230', nome: 'CALÇA/SHORT' },
  { id: '265227', nome: 'SAIAS' },
  { id: '265228', nome: 'BODY' },
  { id: '266049', nome: 'JAQUETAS' },
];
const ADD_FRANNY = process.env.ADD_FRANNY !== '0';
const ADD_ACESSORIOS = process.env.ADD_ACESSORIOS !== '0';

const FACILZAP_IMG = CDN_IMAGE_BASE;

function toAbsFacilImg(u) {
  if (!u) return '';
  const s = String(u.url || u).trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return FACILZAP_IMG + s.replace(/^\//, '');
}

function limparDescricaoHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function warmFacilZap(base, loja) {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const res = await fetch(`${base}/c/atacado/${loja}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  });
  const cookies = [];
  const list = res.headers.getSetCookie?.() || [];
  for (const c of list) cookies.push(c.split(';')[0]);
  if (!cookies.length) {
    const one = res.headers.get('set-cookie');
    if (one) cookies.push(one.split(';')[0]);
  }
  await res.text().catch(() => {});
  return cookies.join('; ');
}

async function fetchFacilZapPage(base, loja, catId, page, cookie) {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const url = `${base}/c/atacado/carregar_produtos/${page}/${catId}/${loja}?mobile=0`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: base,
      Referer: `${base}/c/atacado/${loja}`,
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Cookie: cookie || '',
    },
    body: '',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text.trimStart().startsWith('<') || text.includes('window.location')) throw new Error('HTML/redirect da Sophia (não JSON)');
  return JSON.parse(text);
}

function normalizeFacilZapProduct(p, idPrefix = '') {
  const precoBase = p.preco_por ?? p.preco ?? p.preco_de ?? p.valor ?? 0;
  const { atacado, varejo } = calcPrecosRoupas(precoBase);
  const imagens = Array.isArray(p.imagens) ? p.imagens.map(toAbsFacilImg).filter(Boolean) : [];
  const foto = imagens[0] || toAbsFacilImg(p.imagem) || toAbsFacilImg(p.foto) || '';
  const estoqueMap = p.estoque || {};
  const varDict = p.variacoes || {};
  const variacoes = Object.entries(varDict).map(([vid, vinfo]) => ({
    id: String(vid),
    nome: limparTexto((vinfo && vinfo.nome) || '').trim() || String(vid),
    cor: (vinfo && vinfo.cor) || null,
    estoque: Number(estoqueMap[vid] ?? estoqueMap[String(vid)] ?? 0) || 0,
  }));
  const totalEstoque =
    Number(p.total_estoque) || variacoes.reduce((s, v) => s + v.estoque, 0);
  const id = String(p.id || '');
  return {
    nome: limparTexto(p.nome || p.titulo || 'Produto'),
    volume: '—',
    varejo,
    atacado,
    disponivel: totalEstoque > 0 ? 'Sim' : 'Não',
    notas: limparDescricaoHtml(p.descricao || p.descricao_completa || ''),
    foto,
    fotos: imagens.length ? imagens : foto ? [foto] : [],
    badge: '',
    fonte: 'roupas',
    id_origem: idPrefix ? `${idPrefix}${id}` : id,
    total_estoque: totalEstoque,
    variacoes,
  };
}

async function fetchFrannyRoupas() {
  console.log('  Warm-up Franny...');
  let cookie = await warmFacilZap(FRANNY_BASE, FRANNY_LOJA);
  const byId = new Map();
  for (const cat of FRANNY_CATEGORIES) {
    console.log(`  Franny cat ${cat.nome} (${cat.id})`);
    for (let page = 1; page <= 30; page++) {
      try {
        const data = await fetchFacilZapPage(FRANNY_BASE, FRANNY_LOJA, cat.id, page, cookie);
        const produtos = data.produtos || [];
        if (!produtos.length) break;
        let novo = 0;
        for (const p of produtos) {
          const id = String(p.id || '');
          if (!id || byId.has(id)) continue;
          const item = normalizeFacilZapProduct(p, 'franny-');
          item.cat = cat.nome;
          byId.set(id, item);
          novo++;
        }
        console.log(`    p${page}: +${novo}`);
        if (produtos.length < 5) break;
        await sleep(400 + Math.floor(Math.random() * 300));
      } catch (e) {
        console.log(`    Franny erro p${page}: ${e.message}`);
        try { cookie = await warmFacilZap(FRANNY_BASE, FRANNY_LOJA); } catch (_) {}
        break;
      }
    }
    await sleep(500);
  }
  const byCat = new Map();
  for (const item of byId.values()) {
    const cat = item.cat || 'OUTROS';
    delete item.cat;
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(item);
  }
  const groups = [];
  for (const [cat, items] of byCat) {
    items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    groups.push({ cat, brand: 'Empório A.R', items });
  }
  console.log(`  Franny total: ${byId.size} produtos`);
  return groups;
}

/** Mescla grupos de roupas por categoria; itens por id_origem (não apaga Franny) */

/** Marca produto novo para vitrine Lançamentos (3 dias no front) */
function stampNovoDesde(obj, isNew, prev) {
  if (!obj) return obj;
  if (isNew) {
    obj.novoDesde = new Date().toISOString();
    if (!obj.badge) obj.badge = 'Novo';
  } else if (prev && prev.novoDesde) {
    obj.novoDesde = prev.novoDesde;
  }
  return obj;
}

function mergeRoupasGroups(listOfGroupArrays, prevRoupas = []) {
  const prevById = new Map();
  for (const g of prevRoupas || []) {
    for (const it of g.items || []) {
      const oid = String(it.id_origem || '');
      if (oid) prevById.set(oid, it);
    }
  }
  const byCat = new Map();
  const seenIds = new Set();
  for (const groups of listOfGroupArrays) {
    for (const g of groups || []) {
      const cat = g.cat || 'OUTROS';
      if (!byCat.has(cat)) {
        byCat.set(cat, { cat, brand: 'Empório A.R', cat_id: g.cat_id, items: [] });
      }
      const bucket = byCat.get(cat);
      for (const it of g.items || []) {
        const oid = String(it.id_origem || '');
        if (oid && seenIds.has(oid)) continue;
        if (oid) seenIds.add(oid);
        const prev = oid ? prevById.get(oid) : null;
        const isNew = Boolean(oid && !prev);
        bucket.items.push(stampNovoDesde({ ...it }, isNew, prev));
      }
    }
  }
  const out = [...byCat.values()];
  for (const g of out) g.items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  out.sort((a, b) => a.cat.localeCompare(b.cat, 'pt-BR'));
  return out;
}

// ========== DANDE (ACESSÓRIOS) ==========
const DANDE_BASE = process.env.DANDE_BASE_URL;
function dandePathOnly(value) {
  if (!value) return '';
  try { const parsed = new URL(String(value), DANDE_BASE); return parsed.pathname + parsed.search; }
  catch { return ''; }
}

const DANDE_SCRAPE_COUNTS = new Map();
const DANDE_CATEGORIES = [
  { path: '/acessorios-de-cabelos/', nome: 'Acessórios de Cabelo' },
  { path: '/aneis1/', nome: 'Anéis' },
  { path: '/braceletes/', nome: 'Braceletes' },
  { path: '/brincos/', nome: 'Brincos' },
  { path: '/colares/', nome: 'Colares' },
  { path: '/conjuntos/', nome: 'Conjuntos' },
  { path: '/lancamentos/', nome: 'Lançamentos' },
  { path: '/masculino/', nome: 'Masculinos' },
  { path: '/prata-925/', nome: 'Prata 925' },
  { path: '/pulseiras/', nome: 'Pulseiras' },
  { path: '/semijoia-italiana/', nome: 'Semijoia Italiana' },
  { path: '/tornozeleiras1/', nome: 'Tornozeleiras' },
];

function calcPrecosAcessorios(precoBase) {
  const base = Number(String(precoBase).replace(',', '.')) || 0;
  const fmt = (n) => n.toFixed(2).replace('.', ',');
  if (base >= 50) {
    return { atacado: fmt(base * 2.5), varejo: fmt(base * 3), base };
  }
  return { atacado: fmt(base * 3.5), varejo: fmt(base * 5), base };
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function upgradeDandeImg(u) {
  if (!u) return '';
  let s = String(u).trim();
  if (!s) return '';
  if (s.startsWith('//')) s = 'https:' + s;
  s = s.replace('http://', 'https://');
  // prefer larger size
  s = s.replace(/-\d+-\d+(\.(?:jpg|jpeg|png|webp))/i, '-1024-1024$1');
  return s;
}

function mergeDandeImages(...groups) {
  const result = [];
  const seen = new Set();
  for (const group of groups) {
    const values = Array.isArray(group) ? group : [group];
    for (const value of values) {
      const url = upgradeDandeImg(value);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}

function hasDandeNextPage(html, page) {
  const next = page + 1;
  const queryPage = new RegExp(`href=["'][^"']*[?&]page=${next}(?:[&#"']|$)`, 'i');
  const pathPage = new RegExp(`href=["'][^"']*/page/${next}/?(?:[?#"']|$)`, 'i');
  return /rel=["']next["']/i.test(html) || queryPage.test(html) || pathPage.test(html);
}

async function fetchDandeCategoryPage(path, page = 1, expectedCategory = '') {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const url = page <= 1
    ? `${DANDE_BASE}${path}`
    : `${DANDE_BASE}${path}?page=${page}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (expectedCategory) {
    const titleMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const actualTitle = titleMatch
      ? norm(decodeEntities(titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' '))).replace(/s$/, '')
      : '';
    const expectedTitle = norm(expectedCategory).replace(/s$/, '');
    if (!actualTitle || actualTitle !== expectedTitle) {
      throw new Error(`página não corresponde à categoria esperada "${expectedCategory}" (título: "${actualTitle || 'ausente'}")`);
    }
  }
  return html;
}

function parseDandeListProducts(html) {
  const products = [];
  const names = {};
  const nameRe = /data-store="product-item-name-(\d+)"[^>]*>([^<]+)<\/div>/g;
  let nm;
  while ((nm = nameRe.exec(html))) {
    names[nm[1]] = decodeEntities(nm[2]).trim();
  }
  const ids = [];
  const idRe = /data-product-id="(\d+)"/g;
  let im;
  while ((im = idRe.exec(html))) {
    if (!ids.includes(im[1])) ids.push(im[1]);
  }
  // Só considera IDs que tenham nome de produto correspondente na listagem.
  // Evita capturar IDs de widgets, recomendações e blocos auxiliares do HTML.
  const productIds = ids.filter((id) => Object.prototype.hasOwnProperty.call(names, id));
  for (const id of productIds) {
    const pos = html.indexOf(`data-product-id="${id}"`);
    if (pos < 0) continue;
    const chunk = html.slice(pos, pos + 8000);
    let variants = [];
    const vm = chunk.match(/data-variants="([^"]*)"/i);
    if (vm) {
      try { variants = JSON.parse(decodeEntities(vm[1])); } catch (_) {}
    }
    let img = '';
    let preco = 0;
    if (Array.isArray(variants) && variants.length) {
      img = variants[0].image_url || '';
      if (img.startsWith('//')) img = 'https:' + img;
      img = upgradeDandeImg(img);
      preco = Number(variants[0].price_number || 0) || 0;
    }
    let url = '';
    const namePos = html.indexOf(`data-store="product-item-name-${id}"`);
    if (namePos >= 0) {
      const window = html.slice(Math.max(0, namePos - 3000), namePos + 400);
      const hm = window.match(/href="((?:https:\/\/dandejoias\.com)?\/produtos\/[^"]+)"/i);
      if (hm) {
        url = hm[1];
        if (url.startsWith('/')) url = DANDE_BASE + url;
      }
    }
    const nome = names[id] || '';
    products.push({ id, nome, url, preco, variants, img });
  }
  return products;
}

async function fetchDandeProductDetail(url) {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  let variants = [];
  const all = [...html.matchAll(/data-variants="([^"]*)"/g)];
  for (const mm of all) {
    try {
      const v = JSON.parse(decodeEntities(mm[1]));
      if (Array.isArray(v) && v.length) { variants = v; break; }
    } catch (_) {}
  }
  const descM = html.match(/itemprop=["']description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<div[^>]*id=["']product-description["'][^>]*>([\s\S]*?)<\/div>/i);
  const desc = descM ? limparDescricaoHtml(decodeEntities(descM[1])) : '';
  const imgs = [];
  for (const im of html.matchAll(/data-image=["']([^"']+)["']/gi)) {
    const u = upgradeDandeImg(im[1]);
    if (u && !imgs.includes(u)) imgs.push(u);
  }
  for (const im of html.matchAll(/https:\/\/[^"'\s]+\/products\/\d+\/[^"'\s]+-1024-1024\.(?:jpg|jpeg|png|webp)/gi)) {
    const u = upgradeDandeImg(im[0]);
    if (u && !imgs.includes(u)) imgs.push(u);
  }
  const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (og) {
    const u = upgradeDandeImg(og[1]);
    if (u && !imgs.includes(u)) imgs.unshift(u);
  }
  return { variants, desc, imgs };
}

function dandeVariantsToVariacoes(variants) {
  return (variants || []).map((v) => {
    const opts = [v.option0, v.option1, v.option2].filter(Boolean);
    return {
      id: String(v.id || ''),
      nome: opts.length ? opts.join(' / ') : v.sku || 'Único',
      sku: v.sku || '',
      estoque: Number(v.stock) || 0,
    };
  });
}

async function fetchDandeAcessorios(existingGroups = []) {
  const existingById = new Map();
  for (const g of existingGroups || []) {
    for (const it of g.items || []) {
      if (it.id_origem) existingById.set(String(it.id_origem), it);
    }
  }

  const byId = new Map();
  for (const cat of DANDE_CATEGORIES) {
    console.log(`  Dande cat ${cat.nome}`);
    const seenCategoryIds = new Set();
    const seenPageSignatures = new Set();
    let categoryAdded = 0;
    for (let page = 1; page <= 15; page++) {
      try {
        const html = await fetchDandeCategoryPage(cat.path, page, cat.nome);
        const list = parseDandeListProducts(html);
        if (!list.length) break;
        const pageSignature = list.map((p) => p.id).sort().join('|');
        if (!pageSignature || seenPageSignatures.has(pageSignature)) {
          console.log(`    p${page}: página repetida; encerrando categoria`);
          break;
        }
        seenPageSignatures.add(pageSignature);

        const newProducts = list.filter((p) => !seenCategoryIds.has(p.id));
        if (!newProducts.length) {
          console.log(`    p${page}: nenhum ID novo; encerrando categoria`);
          break;
        }
        for (const p of newProducts) seenCategoryIds.add(p.id);

        let added = 0;
        for (const p of newProducts) {
          if (byId.has(p.id)) continue;
          let variants = p.variants || [];
          let desc = '';
          let imgs = [];
          const prev = existingById.get(p.id);
          // foto da listagem (data-variants.image_url)
          if (p.img) imgs = [upgradeDandeImg(p.img)];
          const nomeList = (p.nome || '').trim();
          const needsDetail = p.url && (
            !nomeList || nomeList.toLowerCase() === 'produto' ||
            !imgs.length ||
            !prev || !(prev.variacoes || []).length || !prev.notas
          );
          if (needsDetail && p.url) {
            try {
              const det = await fetchDandeProductDetail(p.url);
              if (det) {
                if (det.variants?.length) variants = det.variants;
                desc = det.desc || '';
                if (det.imgs?.length) imgs = mergeDandeImages(det.imgs, imgs, prev?.fotos, prev?.foto);
              }
              await sleep(250);
            } catch (_) {}
          } else if (prev) {
            if (!desc) desc = prev.notas || '';
            if (!imgs.length) imgs = prev.fotos || (prev.foto ? [prev.foto] : []);
            if (!variants.length && prev.variacoes) {
              variants = null;
            }
          }
          let precoBase = p.preco;
          if ((!precoBase || precoBase <= 0) && variants && variants[0]) {
            precoBase = Number(variants[0].price_number || variants[0].price || 0);
          }
          if ((!precoBase || precoBase <= 0) && prev) {
            precoBase = 0;
          }
          const prices = calcPrecosAcessorios(precoBase || 0);
          let variacoes;
          let totalEstoque;
          if (variants && Array.isArray(variants) && variants.length && variants[0].stock !== undefined) {
            variacoes = dandeVariantsToVariacoes(variants);
            totalEstoque = variacoes.reduce((s, v) => s + v.estoque, 0);
          } else if (prev && prev.variacoes) {
            variacoes = prev.variacoes;
            totalEstoque = Number(prev.total_estoque) || variacoes.reduce((s, v) => s + (Number(v.estoque) || 0), 0);
          } else {
            variacoes = [];
            totalEstoque = 0;
          }
          imgs = mergeDandeImages(imgs, prev?.fotos, prev?.foto);
          const foto = imgs[0] || (prev && prev.foto) || '';
          let nome = nomeList || (prev && prev.nome) || '';
          if (!nome || nome.toLowerCase() === 'produto') {
            // tenta slug da URL
            if (p.url) {
              const slug = p.url.replace(/\/$/, '').split('/').pop() || '';
              nome = decodeURIComponent(slug).replace(/-/g, ' ').replace(/\s+[a-z0-9]{4,5}$/i, '').trim();
              nome = nome.replace(/\b\w/g, (c) => c.toUpperCase());
            }
          }
          if (!nome || nome.toLowerCase() === 'produto') {
            // não grava lixo sem nome/foto
            if (!foto) continue;
            nome = prev?.nome || `Item ${p.id}`;
          }
          byId.set(p.id, stampNovoDesde({
            nome: limparTexto(nome),
            volume: '—',
            varejo: prices.varejo,
            atacado: prices.atacado,
            disponivel: totalEstoque > 0 ? 'Sim' : (prev?.disponivel || 'Sim'),
            notas: desc || (prev?.notas || ''),
            foto,
            fotos: imgs.length ? imgs : foto ? [foto] : [],
            badge: prev?.badge || '',
            fonte: 'acessorios',
            id_origem: String(p.id),
            url_origem: dandePathOnly(p.url || (prev && prev.url_origem) || ''),
            total_estoque: totalEstoque,
            variacoes,
            cat: cat.nome,
          }, !prev, prev));
          added++;
          categoryAdded++;
        }
        console.log(`    p${page}: lote ${list.length} únicos+${added}`);

        // Processa a página atual antes de decidir se existe uma próxima.
        // Sem link de paginação, encerra somente DEPOIS de salvar os itens desta página.
        if (!hasDandeNextPage(html, page)) {
          console.log(`    p${page}: sem próxima página anunciada pela Dande; encerrando categoria`);
          break;
        }
        await sleep(400);
      } catch (e) {
        console.log(`    Dande erro ${cat.nome} p${page}: ${e.message}`);
        break;
      }
    }
    DANDE_SCRAPE_COUNTS.set(cat.nome, categoryAdded);
  }

  const byCat = new Map();
  for (const item of byId.values()) {
    const cat = item.cat || 'Outros';
    delete item.cat;
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(item);
  }
  // Preserve existing items not found in scrape (keep snapshot)
  for (const [id, prev] of existingById) {
    if (byId.has(id)) continue;
    const cat = prev.cat || 'Outros';
    // try find cat from existing groups
    let foundCat = 'Outros';
    for (const g of existingGroups || []) {
      if ((g.items || []).some((it) => String(it.id_origem) === String(id))) {
        foundCat = g.cat || 'Outros';
        break;
      }
    }
    if (!byCat.has(foundCat)) byCat.set(foundCat, []);
    byCat.get(foundCat).push({ ...prev, fonte: 'acessorios' });
  }

  const groups = [];
  for (const [cat, items] of byCat) {
    items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    groups.push({ cat, brand: 'Empório A.R', items });
  }
  groups.sort((a, b) => a.cat.localeCompare(b.cat, 'pt-BR'));
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  console.log(`  Dande total: ${total} produtos`);
  return groups;
}


async function main() {
  const requiredSources = SYNC_DANDE_ONLY ? ['DANDE_BASE_URL'] : ['IMARAT_API_URL','IMARAT_ORIGIN_URL','BRAND_BASE_URL','CDN_IMAGE_BASE_URL','CDN_IMAGE_FALLBACK_BASE_URL','SOPHIA_PRIMARY_URL','SOPHIA_FALLBACK_URL','SOPHIA_FALLBACK_ORIGIN','FRANNY_BASE_URL','DANDE_BASE_URL'];
  const missingSources = requiredSources.filter((key) => !process.env[key]);
  if (missingSources.length) throw new Error('Configure os secrets de origem no GitHub Actions: ' + missingSources.join(', '));
  console.log('Carregando data.js...');
  let raw = fs.readFileSync(dataPath, 'utf8');
  const m = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!m) throw new Error('DATA não encontrado');
  const DATA = JSON.parse(m[1]);

  if (!SYNC_DANDE_ONLY) {
    if (!process.env.GIST_TOKEN && !SYNC_DRY_RUN) {
      throw new Error("GIST_TOKEN ausente; sincronização de produção bloqueada antes de qualquer publicação.");
    }
    if (process.env.GIST_TOKEN) {
      const internalBaseline = countCatalogIdentity(DATA);
      const liveDATA = await fetchLiveGistBaseline();
      LIVE_GIST_DATA = liveDATA;
      const liveBaseline = countCatalogIdentity(liveDATA);
      const onlyInternal = [...internalBaseline.keys].filter(key => !liveBaseline.keys.has(key)).length;
      const onlyLive = [...liveBaseline.keys].filter(key => !internalBaseline.keys.has(key)).length;
      console.log(`BASELINE INTERNA × GIST VIVO: data.js=${internalBaseline.count}; Gist=${liveBaseline.count}; só data.js=${onlyInternal}; só Gist=${onlyLive}`);
      if (!SYNC_DRY_RUN && (onlyLive > 25 || onlyInternal > 25 || Math.abs(liveBaseline.count - internalBaseline.count) > 25)) {
        throw new Error("SINCRONIZAÇÃO BLOQUEADA: data.js interno diverge do Gist vivo. Reconcilie a base antes de publicar para evitar perda de produtos e ajustes.");
      }
      if (SYNC_DRY_RUN && (onlyLive > 25 || onlyInternal > 25)) {
        console.log("⚠️ Base divergente detectada; dry-run permitido apenas para diagnóstico. Nenhuma publicação será feita.");
      }
    } else {
      console.log("SYNC_DRY_RUN=1 sem GIST_TOKEN; validação de divergência do Gist ignorada (sem publicação).");
    }
  }

  console.log(`Flags: ADD_IMARAT_NEW=${ADD_IMARAT_NEW} ADD_BRAND_NEW=${ADD_BRAND_NEW} ADD_ROUPAS=${ADD_ROUPAS}`);

  if (SYNC_DANDE_ONLY) {
    if (!SYNC_DRY_RUN) throw new Error('SYNC_DANDE_ONLY exige SYNC_DRY_RUN=1 para impedir publicação.');
    console.log('Modo exclusivo Dande: nenhuma outra fonte será sincronizada.');
    const prevAcc = Array.isArray(DATA.acessorios) ? DATA.acessorios : [];
    const groups = await fetchDandeAcessorios(prevAcc);
    const hairCount = DANDE_SCRAPE_COUNTS.get('Acessórios de Cabelo') || 0;
    const hair = groups.find((g) => g.cat === 'Acessórios de Cabelo');
    const hairItems = hair?.items || [];
    const missingImages = hairItems.filter((item) => !(item.foto || (Array.isArray(item.fotos) && item.fotos.length))).length;
    const masculineCount = DANDE_SCRAPE_COUNTS.get('Masculinos') || 0;
    const ankleCount = DANDE_SCRAPE_COUNTS.get('Tornozeleiras') || 0;
    const masculineItems = groups.find((g) => g.cat === 'Masculinos')?.items || [];
    const ankleItems = groups.find((g) => g.cat === 'Tornozeleiras')?.items || [];
    const wrongMasculine = masculineItems.filter((item) => !/masculin/i.test(item.nome || '')).length;
    const wrongAnkle = ankleItems.filter((item) => !/tornoz/i.test(item.nome || '')).length;
    console.log(`VALIDAÇÃO DANDE: Acessórios de Cabelo origem=${hairCount}; itens=${hairItems.length}; sem imagem=${missingImages}; Masculinos origem=${masculineCount}; Tornozeleiras origem=${ankleCount}; itens sem nome compatível=${wrongMasculine + wrongAnkle}`);
    if (hairCount < 1) throw new Error('Dande não retornou produtos para Acessórios de Cabelo.');
    if (!hairItems.length || missingImages > 0) throw new Error('Validação de Acessórios de Cabelo falhou: itens ou imagens ausentes.');
    if (masculineCount < 1 || ankleCount < 1) throw new Error('Dande não retornou produtos em Masculinos e/ou Tornozeleiras; confira os caminhos das categorias.');
    if (wrongMasculine > 0 || wrongAnkle > 0) throw new Error('Produtos de Masculinos/Tornozeleiras não correspondem ao nome esperado.');
    console.log('SYNC_DRY_RUN=1 — nenhuma alteração foi enviada ao Gist.');
    return;
  }

  console.log('Buscando Imarat...');
  const imaratList = await fetchImaratList();
  console.log(`Imarat: ${imaratList.length} produtos`);

  let produtosImaratForaDoSiteRaizRemovidos = 0;
  let titulosImaratCorrigidosPeloSiteRaiz = 0;
  const relatorioImaratNomesRemovidos = [];
  const relatorioImaratNomesCorrigidos = [];

  // A remoção é feita somente abaixo, quando a origem Imarat está confirmada no próprio item.

  // Sincronização final pós-auditoria: a origem deve ser confirmada no item.
  // A categoria não comprova a origem: Perfumes, Miniaturas e Óleos podem
  // conter produtos de outros fornecedores. Só audita/exclui quando o próprio
  // registro traz fonte Imarat confirmada.
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line] || []) {
      g.items = (g.items || []).filter(item => {
        const fonteImarat = norm(item.fonte) === 'imarat';
        const nomeNormalizado = norm(item.nome);
        const marcaArabiyatPrestige = norm(g.brand).includes('arabiyat prestige');
        const legadoArabiyatPrestige =
          (norm(g.brand) === 'arabiyat' && nomeNormalizado.startsWith('prestige ')) ||
          marcaArabiyatPrestige;
        const legadoMiniaturaAfeer =
          norm(g.cat) === 'miniaturas' && norm(g.brand).includes('afeer') &&
          nomeNormalizado.includes('atheri afeer');
        if (!fonteImarat && !legadoArabiyatPrestige && !legadoMiniaturaAfeer) return true;

        const volumeItem = volumeMatch(item.volume, item.nome);
        const volumeCompativel = p => {
          const volumeOrigem = volumeMatch(p.sizeMl, p.name);
          return !volumeItem || !volumeOrigem || volumeItem === volumeOrigem;
        };
        let hit = imaratList.find(p =>
          volumeCompativel(p) &&
          norm(p.name) === nomeNormalizado &&
          (!marcaArabiyatPrestige || norm(p.brand).includes('arabiyat prestige'))
        );

        // Compatibilidade histórica: a marca foi incluída indevidamente no título.
        if (!hit && legadoArabiyatPrestige && nomeNormalizado.startsWith('prestige ')) {
          const nomeSemPrefixo = nomeNormalizado.slice('prestige '.length);
          hit = imaratList.find(p =>
            volumeCompativel(p) &&
            norm(p.name) === nomeSemPrefixo && norm(p.brand).includes('arabiyat prestige')
          );
        }

        // Grafia antiga da miniatura Afeer: só corrige com confirmação da origem.
        if (!hit && legadoMiniaturaAfeer) {
          hit = imaratList.find(p =>
            volumeCompativel(p) &&
            norm(p.name) === 'miniatura atherri afeer' && norm(p.brand).includes('afeer')
          );
        }

        if (hit) {
          if (String(item.nome || '') !== String(hit.name || '')) {
            relatorioImaratNomesCorrigidos.push({
              linha: line, marca: g.brand, categoria: g.cat,
              nomeAnterior: item.nome, nomeNoSiteRaiz: hit.name
            });
            item.nome = hit.name;
            titulosImaratCorrigidosPeloSiteRaiz++;
          }
          item.fonte = 'imarat';
          if (hit.id != null) item.id_origem = String(hit.id);

          // Revisão final: marca e produto permanecem em campos separados.
          // Marca e produto são campos separados: move apenas os itens confirmados
          // pela origem para o grupo Arabiyat Prestige, sem renomear os demais.
          if (norm(hit.brand).includes('arabiyat prestige')) {
            const marcaCorreta = marcaPublicaImarat(hit.brand).trim().toUpperCase();
            if (norm(g.brand) !== norm(marcaCorreta)) {
              const destino = ensureBrandGroup(DATA, line, marcaCorreta, g.cat);
              destino.items.push(item);
              console.log('MARCA ARABIYAT PRESTIGE CORRIGIDA: ' + JSON.stringify({
                linha: line, marcaAnterior: g.brand, marcaCorreta,
                nomeProduto: item.nome
              }));
              return false;
            }
          }
          return true;
        }

        // Registros sem procedência explícita nunca são excluídos por falha de correspondência.
        if (!fonteImarat) return true;

        produtosImaratForaDoSiteRaizRemovidos++;
        relatorioImaratNomesRemovidos.push({
          linha: line, marca: g.brand, categoria: g.cat,
          nome: item.nome, fonte: item.fonte || 'categoria abastecida pela Imarat'
        });
        return false;
      });
    }
  }
  console.log(`Títulos Imarat corrigidos para a grafia exata do site raiz: ${titulosImaratCorrigidosPeloSiteRaiz}`);
  for (const corrigido of relatorioImaratNomesCorrigidos) {
    console.log('TÍTULO IMARAT CORRIGIDO PELO SITE RAIZ: ' + JSON.stringify(corrigido));
  }
  for (const line of Object.keys(DATA)) {
    DATA[line] = (DATA[line] || []).filter(g => (g.items || []).length > 0);
  }
  console.log(`Produtos Imarat removidos por nome ausente no site raiz: ${produtosImaratForaDoSiteRaizRemovidos}`);
  for (const removido of relatorioImaratNomesRemovidos) {
    console.log('TÍTULO IMARAT FORA DO SITE RAIZ REMOVIDO: ' + JSON.stringify(removido));
  }

  let stockChanged = 0, addedImarat = 0, priceChanged = 0;
  let titulosFuzzyCorrigidos = 0;

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      if (g.cat === 'Brand' || String(g.cat || '').startsWith('Brand')) continue;
      for (let i = 0; i < g.items.length; i++) {
        const it = g.items[i];
        it.nome = limparTexto(it.nome);
        if (it.notas) it.notas = limparTexto(it.notas);

        const n = norm(it.nome); const b = norm(g.brand);
        const nomeSemPrefixoPrestige = n.replace(/^prestige\s+/, '');
        const volumeItem = volumeMatch(it.volume, it.nome);
        const volumeCompativel = p => {
          const volumeOrigem = volumeMatch(p.sizeMl, p.name);
          return !volumeItem || !volumeOrigem || volumeItem === volumeOrigem;
        };
        const candidatosNomeExato = imaratList.filter(p => norm(p.name) === n && volumeCompativel(p));
        // Primeiro exige coincidência de marca, considerando Imarat → Empório A.R.
        let hit = candidatosNomeExato.find(p => norm(marcaPublicaImarat(p.brand)) === b);
        // Exceção histórica comprovada: Arabiyat Prestige era agrupada como ARABIYAT.
        if (!hit && b === 'arabiyat') {
          hit = candidatosNomeExato.find(p => norm(p.brand).includes('arabiyat prestige'));
        }
        // Em grupos genéricos, só aceita associação se o nome for único em toda a API.
        if (!hit && ['outros', 'outra'].includes(b) && candidatosNomeExato.length === 1) {
          hit = candidatosNomeExato[0];
        }
        // Correções pontuais validadas no catálogo: transposição em Tharwah
        // e sufixo GOOD GIRL omitido no nome da miniatura Only You.
        if (!hit && b === 'lattafa' && n === 'kit thawrah') {
          hit = imaratList.find(p =>
            norm(p.name) === 'kit tharwah' && norm(p.brand) === 'lattafa' &&
            (!volumeMatch(it.volume, it.nome) || !volumeMatch(p.sizeMl, p.name) ||
              volumeMatch(it.volume, it.nome) === volumeMatch(p.sizeMl, p.name))
          );
        }
        if (!hit && b === 'only you' && n === 'miniatura sapatinho') {
          hit = imaratList.find(p =>
            norm(p.name) === 'miniatura sapatinho good girl' && norm(p.brand).includes('only you') &&
            (!volumeMatch(it.volume, it.nome) || !volumeMatch(p.sizeMl, p.name) ||
              volumeMatch(it.volume, it.nome) === volumeMatch(p.sizeMl, p.name))
          );
        }
        // Corrige títulos legados somente com marca compatível, volume compatível
        // e correspondência textual forte e sem ambiguidade.
        if (!hit && !['outros', 'outra'].includes(b)) {
          const fuzzyCandidates = imaratList.filter(p =>
            norm(marcaPublicaImarat(p.brand)) === b ||
            (b === 'arabiyat' && norm(p.brand).includes('arabiyat prestige'))
          ).filter(p => {
            const itemVolume = volumeMatch(it.volume, it.nome);
            const sourceVolume = volumeMatch(p.sizeMl, p.name);
            return !itemVolume || !sourceVolume || itemVolume === sourceVolume;
          }).map(p => {
            const itemKey = titleMatchKey(it.nome, g.cat, g.brand);
            const sourceKey = titleMatchKey(p.name, g.cat, p.brand);
            return { product: p, ...titleSimilarity(itemKey, sourceKey) };
          }).sort((a, b) => b.score - a.score);
          const best = fuzzyCandidates[0];
          const second = fuzzyCandidates[1];
          if (best && best.score >= 0.86 && best.tokens >= 0.8 &&
              (!second || best.score - second.score >= 0.08)) {
            hit = best.product;
          }
        }
        // Prefixo histórico de Arabiyat Prestige: comparar sem a palavra da marca.
        if (!hit && b === 'arabiyat') {
          hit = imaratList.find(p =>
            volumeCompativel(p) &&
            norm(p.brand).includes('arabiyat prestige') && norm(p.name) === nomeSemPrefixoPrestige
          );
        }
        if (!hit) continue;

        // Identifica a origem e atualiza o título exatamente como consta na API raiz.
        if (String(it.nome || '') !== String(hit.name || '')) {
          titulosFuzzyCorrigidos++;
          console.log('TÍTULO IMARAT CORRIGIDO POR MARCA/VOLUME: ' + JSON.stringify({
            linha: line, marca: g.brand, categoria: g.cat,
            nomeAnterior: it.nome, nomeNoSiteRaiz: hit.name
          }));
        }
        it.fonte = 'imarat';
        if (hit.id != null) it.id_origem = String(hit.id);
        it.nome = hit.name;

        // A marca vem do campo próprio da origem; move apenas este item se o grupo antigo
        // estiver com uma marca abreviada/genérica, sem reclassificar os demais itens.
        // Última publicação: marca sempre sem espaços externos.
        const marcaApi = limparTexto(hit.brand || g.brand || 'Outros').trim();
        const marcaPublica = norm(marcaApi) === 'imarat' ? 'Empório A.R' : marcaApi.trim().toUpperCase();
        if (norm(marcaPublica) !== norm(g.brand)) {
          const grupoDestino = ensureBrandGroup(DATA, line, marcaPublica, g.cat);
          if (grupoDestino !== g) {
            g.items.splice(i, 1);
            i--;
            grupoDestino.items.push(it);
          } else {
            g.brand = marcaPublica;
          }
        } else {
          g.brand = marcaPublica;
        } 
        
        // Uma única consulta ao detalhe alimenta notas e galeria, evitando
        // duas requisições idênticas por produto durante a sincronização.
        let detailImgs = null;
        let notas = '';
        if (hit.slug && !SYNC_SKIP_DETAILS) {
          detailImgs = await fetchImaratDetail(hit.slug);
          if (detailImgs) {
            notas = notesToText(detailImgs.notes) || (detailImgs.shortDesc || detailImgs.description || '').slice(0, 400);
            if (notas) it.notas = sanitizarNotas(notas);
          }
        }
        const imgs = imaratImagesFrom(hit, detailImgs);
        if (imgs.length) {
          it.foto = imgs[0];
          it.fotos = imgs;
        }

        const disp = hit.inStock === true ? 'Sim' : 'Não';
        if ((it.disponivel || 'Sim') !== disp) { it.disponivel = disp; stockChanged++; }

        // Notas: limpa UTF-8 + remove palavra Tabaco (Merchant Center)
        if (it.notas) {
          const notasLimpas = sanitizarNotas(it.notas);
          if (notasLimpas !== it.notas) it.notas = notasLimpas;
        }
        
        const precoVarejoOrig = (hit.priceCents || 0) / 100;
        const precoAtacadoOrig = hit.atacado && hit.atacado.precoCents != null ? hit.atacado.precoCents / 100 : Math.max(precoVarejoOrig - 30, 0);
        const categoria = hit.categoria_nome || hit.categoria || '';

        // precoManual: true no item → robô NÃO altera varejo/atacado
        if (it.precoManual === true || it.precoManual === 'true' || it.precoManual === 1) {
          // mantém preços definidos manualmente
        } else {
          const prices = calcularPrecoMiniatura(it.nome, hit.brand || g.brand, it.volume, categoria, precoVarejoOrig, precoAtacadoOrig);
          if (it.varejo !== prices.varejo || it.atacado !== prices.atacado) {
            it.varejo = prices.varejo;
            it.atacado = prices.atacado;
            priceChanged++;
          }
        }
      }
    }
  }

  // Correção nominal específica validada pelo responsável do catálogo:
  // Atheri é a grafia incorreta; Atherri é a grafia correta da miniatura Afeer.
  // Só atua na categoria Miniaturas e no grupo da marca Afeer.
  const nomeMiniAfeerErrado = 'atheri afeer';
  const nomeMiniAfeerCorreto = 'Miniatura Atherri Afeer';
  let miniAfeerGrafiaCorrigida = 0;
  // Correção nominal confirmada: dentro de Miniaturas / Afeer, "Atheri" é erro;
  // o título comercial correto é exatamente "Miniatura Atherri Afeer".
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line] || []) {
      if (!norm(g.cat).includes('miniatura') || !norm(g.brand).includes('afeer')) continue;
      for (const item of (g.items || [])) {
        if (norm(item.nome).includes(nomeMiniAfeerErrado)) {
          item.nome = nomeMiniAfeerCorreto;
          miniAfeerGrafiaCorrigida++;
        }
      }
    }
  }
  console.log(`Miniaturas Afeer com grafia corrigida para Atherri: ${miniAfeerGrafiaCorrigida}`);

  // Deduplicação dentro do grupo: preservar volume e identidade de origem.
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line] || []) {
      const vistos = new Set();
      g.items = (g.items || []).filter(item => {
        const id = String(item.id_origem || '').trim();
        const volume = volumeMatch(item.volume, item.nome);
        const chave = id ? `id|${norm(g.brand)}|${id}`
          : `produto|${norm(g.brand)}|${limparParaComparacao(item.nome)}|${volume}`;
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });
    }
  }

  // Remove somente cópias integralmente idênticas. Qualquer diferença de marca,
  // volume, ID de origem, preço, fotos ou metadados mantém os dois registros.
  let exactDuplicatesRemoved = 0;
  const exactSeen = new Set();
  for (const [line, groups] of Object.entries(DATA)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      const kept = [];
      for (const item of Array.isArray(group.items) ? group.items : []) {
        const fingerprint = exactCatalogFingerprint(item, group.brand, item.fonte, line, group.cat);
        if (exactSeen.has(fingerprint)) {
          exactDuplicatesRemoved++;
          console.log('CÓPIA EXATA REMOVIDA: ' + JSON.stringify({
            marca: group.brand, nome: item.nome, volume: item.volume,
            idOrigem: item.id_origem || ''
          }));
          continue;
        }
        exactSeen.add(fingerprint);
        kept.push(item);
      }
      group.items = kept;
    }
  }
  console.log(`Duplicatas integralmente idênticas removidas: ${exactDuplicatesRemoved}`);

  const indexNormal = new Set();
  const indexNameVolume = new Set();
  const indexMiniByBase = new Map();
  const indexMiniNameVolume = new Map();
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line] || []) {
      for (const it of g.items || []) {
        const volumeKey = volumeMatch(it.volume, it.nome);
        const nomeKey = limparParaComparacao(it.nome);
        indexNormal.add(normalProductKey(it.nome, it.volume, g.brand));
        indexNameVolume.add(normalProductNameVolumeKey(it.nome, it.volume));
        if (isMiniatura(it.nome, it.volume, g.cat) && !isOleo(it.nome)) {
          const baseKey = miniIdentityBaseKey(it, g.brand);
          if (!indexMiniByBase.has(baseKey)) indexMiniByBase.set(baseKey, []);
          indexMiniByBase.get(baseKey).push({ id_origem: it.id_origem ?? "" });
          const nameVolumeKey = miniIdentityNameVolumeKey(it);
          if (!indexMiniNameVolume.has(nameVolumeKey)) indexMiniNameVolume.set(nameVolumeKey, []);
          indexMiniNameVolume.get(nameVolumeKey).push({ id_origem: it.id_origem ?? "" });
        }
      }
    }
  }

  if (ADD_IMARAT_NEW) {
    for (const p of imaratList) {
      const nome = limparTexto(p.name);
      const marcaOrigem = limparTexto(p.brand || 'Outros').trim();
      const marcaConhecida = Boolean(String(p.brand || '').trim()) && !['outros', 'outra', 'sem marca', 'sem marca definida', 'nao informado', 'n/a'].includes(norm(marcaOrigem));
      const brand = norm(marcaOrigem) === 'imarat' ? 'Empório A.R' : marcaOrigem.toUpperCase();
      const volume = volumeFrom(p.sizeMl, nome);
      const categoria = p.categoria_nome || p.categoria || '';
      const ehOleo = isOleo(nome);
      const ehMini = isMiniatura(nome, volume, categoria) && !ehOleo;
      const precoVarejoOrig = (p.priceCents || 0) / 100;
      const precoAtacadoOrig = p.atacado && p.atacado.precoCents != null ? p.atacado.precoCents / 100 : Math.max(precoVarejoOrig - 30, 0);
      const prices = calcularPrecoMiniatura(nome, brand, volume, categoria, precoVarejoOrig, precoAtacadoOrig);
      let detail = null;
      let imgsNew = imaratImagesFrom(p, null);
      let duplicado = false;

      if (ehMini) {
        const candidate = {
          nome, volume, varejo: prices.varejo, atacado: prices.atacado,
          foto: imgsNew[0] || '', fotos: imgsNew,
        };
        const miniBaseKey = miniIdentityBaseKey(candidate, brand);
        const existing = indexMiniByBase.get(miniBaseKey);
        const nameVolumeCandidates = indexMiniNameVolume.get(miniIdentityNameVolumeKey(candidate)) || [];
        if (!marcaConhecida && nameVolumeCandidates.length) {
          // Marca ausente: compara ID de origem com qualquer marca já cadastrada;
          // só usa nome/volume como fallback quando algum registro é legado sem ID.
          duplicado = isDuplicateMiniSource(nameVolumeCandidates, p.id ?? p.productId ?? "");
        } else if (existing) {
          // ID de origem é a identidade primária. Se IDs forem diferentes, mantém
          // os dois registros; se faltar ID, usa marca + nome-base + volume.
          duplicado = isDuplicateMiniSource(existing, p.id ?? p.productId ?? "");
          if (!duplicado) {
            console.log('MINIATURA COM ID DE ORIGEM DISTINTO: ' + JSON.stringify({
              nome, marca: brand, volume, idOrigem: p.id ?? p.productId ?? "",
              idsExistentes: existing.map(item => item.id_origem || "sem ID")
            }));
          }
        } else {
          console.log('NOVA MINIATURA CANDIDATA: ' + JSON.stringify({
            nome, marca: brand, volume, varejo: prices.varejo, atacado: prices.atacado
          }));
        }
      } else {
        // Perfumes: marca + nome exato normalizado + volume.
        // Nomes iguais em marcas diferentes coexistem; marca ausente usa fallback conservador.
        duplicado = indexNormal.has(normalProductKey(nome, volume, brand))
          || (!marcaConhecida && indexNameVolume.has(normalProductNameVolumeKey(nome, volume)));
        if (!duplicado) console.log('NOVO PERFUME CANDIDATO: ' + JSON.stringify({ nome, marca: brand, volume }));
      }
      if (duplicado) continue;

      let notas = '';
      if (p.slug && !SYNC_SKIP_DETAILS && !detail) detail = await fetchImaratDetail(p.slug);
      if (detail) notas = notesToText(detail.notes) || (detail.shortDesc || detail.description || '').slice(0, 400);
      notas = sanitizarNotas(notas);
      imgsNew = imaratImagesFrom(p, detail);
      const fotoGaleria = imgsNew[0] || (p.image ? (p.image.startsWith('http') ? p.image : resolveImaratImageUrl(p.image, IMARAT_ORIGIN)) : '');
      
      const line = genderLine(p.gender); 
      const foto = fotoGaleria || (p.image ? (p.image.startsWith('http') ? p.image : resolveImaratImageUrl(p.image, IMARAT_ORIGIN)) : ''); 
      const cat = ehOleo ? 'Óleos' : ehMini ? 'Miniaturas' : 'Perfumes';
      
      const group = ensureBrandGroup(DATA, line, brand, cat);
      group.items.push(stampNovoDesde({ 
          nome, 
          volume, 
          varejo: prices.varejo, 
          atacado: prices.atacado, 
          disponivel: p.inStock === true ? 'Sim' : 'Não', 
          notas: notas || '', 
          foto,
          fotos: imgsNew.length ? imgsNew : (foto ? [foto] : []),
          fonte: 'imarat',
          id_origem: String(p.id ?? p.productId ?? ''),
      }, true));
      
      const nomeKey = limparParaComparacao(nome);
      const volumeKey = volumeMatch(volume, nome);
      indexNormal.add(normalProductKey(nome, volume, brand));
      indexNameVolume.add(normalProductNameVolumeKey(nome, volume));
      if (ehMini) {
        const actualMini = { nome, volume, varejo: prices.varejo, atacado: prices.atacado, foto, fotos: imgsNew };
        const baseKey = miniIdentityBaseKey(actualMini, brand);
        if (!indexMiniByBase.has(baseKey)) indexMiniByBase.set(baseKey, []);
        indexMiniByBase.get(baseKey).push({ id_origem: String(p.id ?? p.productId ?? "") });
        const nameVolumeKey = miniIdentityNameVolumeKey(actualMini);
        if (!indexMiniNameVolume.has(nameVolumeKey)) indexMiniNameVolume.set(nameVolumeKey, []);
        indexMiniNameVolume.get(nameVolumeKey).push({ id_origem: String(p.id ?? p.productId ?? "") });
      }
      addedImarat++;
    }
  }

  console.log('Buscando Brand Collection...');
  const brandList = SYNC_IMARAT_ONLY ? [] : await fetchBrandList();
  const brandAllowed = brandList.filter(isAllowedBrandProduct);
  console.log(`Brand total: ${brandList.length} | nas sessões permitidas: ${brandAllowed.length}`);

  let addedBrand = 0;
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      if (!(g.cat === 'Brand' || String(g.cat || '').startsWith('Brand'))) continue;
      for (let i = 0; i < g.items.length; i++) {
        const it = g.items[i]; const n = norm(it.nome); const hit = brandList.find((p) => norm(p.nome) === n) || brandList.find((p) => n.length > 6 && (n.includes(norm(p.nome)) || norm(p.nome).includes(n)));
        if (!hit) continue;
        it.nome = hit.nome; 
        if (hit.descricao) it.notas = String(hit.descricao).trim().slice(0, 500);
        const disp = brandDisponivel(hit); if ((it.disponivel || 'Sim') !== disp) { it.disponivel = disp; stockChanged++; }
      }
    }
  }

  
  // Brand: itens do catálogo que não existem mais na loja → esgotado
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line] || []) {
      if (!(g.cat === 'Brand' || String(g.cat || '').startsWith('Brand'))) continue;
      for (const it of g.items || []) {
        const n = norm(it.nome);
        const hit = brandList.find((p) => norm(p.nome) === n)
          || brandList.find((p) => n.length > 6 && (n.includes(norm(p.nome)) || norm(p.nome).includes(n)));
        if (!hit) {
          if ((it.disponivel || 'Sim') !== 'Não') {
            it.disponivel = 'Não';
            stockChanged++;
          }
        }
      }
    }
  }

  if (ADD_BRAND_NEW) {
    for (const p of brandAllowed) {
      const nome = p.nome || ''; if (!nome) continue; let session = mapBrandSession(p.categoria_nome || p.categoria || ''); if (!session && norm(nome).includes('tubete')) session = 'TUBETES BRAND'; if (!session) continue;
      const volume = volumeFrom(null, nome); const duplicado = indexNormal.has(`${norm(session)}|${limparParaComparacao(nome)}|${volumeMatch(volume, nome)}`); if (duplicado) continue;
      const orig = typeof p.preco === 'number' ? p.preco : parseOrig(p.preco); const prices = priceBrand(orig, isArabicMiniBrand(p, session), session);
      const line = genderLine(nome + ' ' + session); let foto = ''; if (p.imagens && p.imagens[0]) { const img = p.imagens[0]; foto = img.startsWith('http') ? img : `${CDN_IMAGE_BASE}${img}?width=700&height=700&quality=85&format=webp`; }
      const notas = (p.descricao && String(p.descricao).trim()) || '';
      const group = ensureBrandGroup(DATA, line, session, 'Brand');
      group.items.push(stampNovoDesde({ 
          nome, 
          volume, 
          varejo: prices.varejo, 
          atacado: prices.atacado, 
          disponivel: brandDisponivel(p), 
          notas: notas.slice(0, 500), 
          foto,
          fonte: 'brand',
      }, true));
      const nomeKey = limparParaComparacao(nome);
      const volumeKey = volumeMatch(volume, nome);
      indexNormal.add(`${norm(session)}|${nomeKey}|${volumeKey}`);
      indexNameVolume.add(`${nomeKey}|${volumeKey}`);
      addedBrand++;
    }
  }

  // ----- Roupas (Sophia + Franny) — merge, não sobrescreve -----
  let roupasCount = 0;
  let frannyCount = 0;
  if (ADD_ROUPAS || ADD_FRANNY) {
    const chunks = [];
    // mantém snapshot atual como base para não perder itens se um site falhar
    if (Array.isArray(DATA.roupas) && DATA.roupas.length) {
      chunks.push(DATA.roupas);
    }
    if (ADD_ROUPAS) {
      console.log('Buscando Roupas na Sophia Moda...');
      try {
        const sophiaGroups = await fetchSophiaRoupas();
        const n = sophiaGroups.reduce((s, g) => s + g.items.length, 0);
        roupasCount = n;
        if (n > 0) chunks.push(sophiaGroups);
        console.log(`Roupas Sophia: ${n} produtos`);
      } catch (e) {
        console.log(`❌ Erro Sophia: ${e.message} (mantendo snapshot)`);
      }
    } else {
      console.log('ADD_ROUPAS=0 — pulando Sophia');
    }
    if (ADD_FRANNY) {
      console.log('Buscando Roupas na Franny...');
      try {
        const frannyGroups = await fetchFrannyRoupas();
        frannyCount = frannyGroups.reduce((s, g) => s + g.items.length, 0);
        if (frannyCount > 0) chunks.push(frannyGroups);
        console.log(`Roupas Franny: ${frannyCount} produtos`);
      } catch (e) {
        console.log(`❌ Erro Franny: ${e.message} (mantendo snapshot)`);
      }
    } else {
      console.log('ADD_FRANNY=0 — pulando Franny');
    }
    if (chunks.length) {
      const prevRoupasSnap = Array.isArray(DATA.roupas) ? DATA.roupas : [];
      DATA.roupas = mergeRoupasGroups(chunks, prevRoupasSnap);
      const total = DATA.roupas.reduce((s, g) => s + g.items.length, 0);
      console.log(`Roupas merge final: ${total} produtos em ${DATA.roupas.length} categorias`);
    }
  } else {
    console.log('ADD_ROUPAS=0 e ADD_FRANNY=0 — pulando Roupas');
  }

  // ----- Acessórios (Dande) -----
  let acessoriosCount = 0;
  if (ADD_ACESSORIOS) {
    console.log('Buscando Acessórios na Dande...');
    try {
      const prevAcc = Array.isArray(DATA.acessorios) ? DATA.acessorios : [];
      const accGroups = await fetchDandeAcessorios(prevAcc);
      acessoriosCount = accGroups.reduce((s, g) => s + g.items.length, 0);
      if (acessoriosCount > 0) {
        DATA.acessorios = accGroups;
        console.log(`Acessórios Dande: ${acessoriosCount} produtos em ${accGroups.length} categorias`);
      } else {
        console.log('Acessórios Dande: 0 (mantendo snapshot)');
      }
    } catch (e) {
      console.log(`❌ Erro Dande: ${e.message} (mantendo snapshot)`);
    }
  } else {
    console.log('ADD_ACESSORIOS=0 — pulando Dande');
  }

  // Sanitização pós-sync
  for (const line of Object.keys(DATA)) {
    DATA[line] = (DATA[line] || []).filter((g) => !String(g.brand || '').toUpperCase().includes('SPLAHS'));
  }
  for (const g of (DATA.roupas || [])) {
    for (const it of g.items || []) {
      if (it.notas) {
        it.notas = String(it.notas).replace(/\bForo\b/g, 'Forro').replace(/\bforo\b/g, 'forro');
      }
      if (it.nome) {
        it.nome = String(it.nome).replace(/\bForo\b/g, 'Forro').replace(/\bforo\b/g, 'forro');
      }
    }
  }

  // Consolida grupos repetidos de marcas/categorias confirmadas na origem Imarat.
  // Em seguida remove somente cópias idênticas de produtos que ainda existem na API,
  // preservando volumes diferentes e divergências de preço sem proteção manual.
  const categoriasImaratConsolidacao = new Set(['perfumes', 'miniaturas', 'oleos']);
  const marcasImaratPublicas = new Set(imaratList.map(p => {
    const marca = limparTexto(p.brand || 'Outros');
    return norm(marca) === 'imarat' ? norm('Empório A.R') : norm(marca);
  }).filter(m => m && m !== 'outros' && m !== 'outra'));
  let gruposImaratConsolidados = 0;
  let duplicatasImaratRemovidas = 0;
  let conflitosPrecoImaratPreservados = 0;
  const precoManualAtivo = item => item.precoManual === true || item.precoManual === 'true' || item.precoManual === 1;
  const volumeProduto = item => {
    const explicito = String(item.volume || '').trim();
    if (explicito) return norm(explicito);
    const match = String(item.nome || '').match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
    return match ? norm(match[0]) : '';
  };
  for (const line of Object.keys(DATA)) {
    const grupos = DATA[line] || [];
    const consolidados = [];
    const porMarcaCategoria = new Map();
    for (const g of grupos) {
      const marcaKey = norm(g.brand);
      const categoriaKey = norm(g.cat);
      const grupoImarat = categoriasImaratConsolidacao.has(categoriaKey) && marcasImaratPublicas.has(marcaKey);
      if (!grupoImarat) {
        consolidados.push(g);
        continue;
      }
      const groupKey = marcaKey + '|' + categoriaKey;
      const destino = porMarcaCategoria.get(groupKey);
      if (!destino) {
        porMarcaCategoria.set(groupKey, g);
        consolidados.push(g);
      } else {
        destino.items = [...(destino.items || []), ...(g.items || [])];
        gruposImaratConsolidados++;
      }
    }
    DATA[line] = consolidados;

    for (const g of DATA[line]) {
      const marcaKey = norm(g.brand);
      const categoriaKey = norm(g.cat);
      if (!categoriasImaratConsolidacao.has(categoriaKey) || !marcasImaratPublicas.has(marcaKey)) continue;
      const vistos = new Map();
      const itensUnicos = [];
      for (const item of g.items || []) {
        // Produtos com ID confirmado são deduplicados globalmente pelo ID abaixo.
        // Não usar apenas nome/marca aqui: dois IDs distintos podem compartilhar título.
        if (norm(item.fonte) === 'imarat' && item.id_origem) {
          itensUnicos.push(item);
          continue;
        }
        const nomeKey = norm(item.nome);
        const volumeKey = volumeProduto(item);
        const origemExiste = imaratList.some(p => norm(p.name) === nomeKey && (
          norm(p.brand) === marcaKey ||
          (norm(p.brand) === 'imarat' && marcaKey === norm('Empório A.R')) ||
          (!norm(p.brand) && marcaKey === 'outros')
        ));
        if (!origemExiste || !nomeKey) {
          itensUnicos.push(item);
          continue;
        }
        const itemKey = nomeKey + '|' + volumeKey;
        const anterior = vistos.get(itemKey);
        if (!anterior) {
          vistos.set(itemKey, item);
          itensUnicos.push(item);
          continue;
        }
        const mesmoPreco = String(anterior.varejo ?? '') === String(item.varejo ?? '') &&
          String(anterior.atacado ?? '') === String(item.atacado ?? '');
        const manualAnterior = precoManualAtivo(anterior);
        const manualAtual = precoManualAtivo(item);
        if (!mesmoPreco && !manualAnterior && !manualAtual) {
          conflitosPrecoImaratPreservados++;
          itensUnicos.push(item);
          continue;
        }
        const manter = manualAtual && !manualAnterior ? item : anterior;
        const descartar = manter === anterior ? item : anterior;
        if (manter !== anterior) {
          const indice = itensUnicos.indexOf(anterior);
          if (indice >= 0) itensUnicos[indice] = manter;
          vistos.set(itemKey, manter);
        }
        for (const [campo, valor] of Object.entries(descartar)) {
          if (manter[campo] == null || manter[campo] === '') manter[campo] = valor;
        }
        manter.fonte = 'imarat';
        duplicatasImaratRemovidas++;
      }
      g.items = itensUnicos;
    }
  }
  // Consolidação global por ID da origem: identifica o mesmo produto mesmo quando
  // ele aparece em linhas, marcas genéricas ou categorias diferentes no catálogo.
  // O ID é interno e será removido pela projeção pública (toPublicCatalog).
  const imaratPorId = new Map();
  for (const produto of imaratList) {
    if (produto.id != null) imaratPorId.set(String(produto.id), produto);
  }
  const registrosPorId = new Map();
  for (const line of Object.keys(DATA)) {
    for (const group of DATA[line] || []) {
      for (const item of group.items || []) {
        if (norm(item.fonte) !== 'imarat') continue;
        const id = String(item.id_origem || '').trim();
        if (!id || !imaratPorId.has(id)) continue;
        if (!registrosPorId.has(id)) registrosPorId.set(id, []);
        registrosPorId.get(id).push({ line, group, item });
      }
    }
  }

  let duplicatasImaratPorIdRemovidas = 0;
  let conflitosVolumeImaratPorId = 0;
  let conflitosGeneroImaratPorId = 0;
  let conflitosPrecoImaratPorId = 0;
  let gruposImaratPorIdConsolidados = 0;
  const normalizarVolumeId = value => String(value || '').toLowerCase().replace(/\s+/g, '').replace(',', '.');
  const chavePrecoId = item => String(item.varejo ?? '').trim() + '|' + String(item.atacado ?? '').trim();
  const completudeItem = item => Object.values(item || {}).filter(value =>
    value !== null && value !== undefined && value !== '' && value !== '—'
  ).length;

  for (const [id, registros] of registrosPorId) {
    if (registros.length < 2) continue;
    const source = imaratPorId.get(id);
    const sourceVolume = volumeMatch(source.sizeMl, source.name);
    const volumesCatalogo = new Set(registros.map(r => normalizarVolumeId(volumeProduto(r.item))).filter(Boolean));
    const sourceVolumeKey = normalizarVolumeId(sourceVolume);

    if (volumesCatalogo.size > 1 ||
        (sourceVolumeKey && [...volumesCatalogo].some(volume => volume !== sourceVolumeKey))) {
      conflitosVolumeImaratPorId++;
      console.log('DUPLICIDADE IMARAT PRESERVADA POR CONFLITO DE VOLUME: ' + JSON.stringify({
        id, nome: source.name, volumesCatalogo: [...volumesCatalogo], volumeOrigem: sourceVolume || 'não informado'
      }));
      continue;
    }

    const linhas = new Set(registros.map(r => r.line));
    const generoOrigem = String(source.gender || source.genero || source.sexo || '').trim();
    if (!generoOrigem && linhas.size > 1) {
      conflitosGeneroImaratPorId++;
      console.log('DUPLICIDADE IMARAT PRESERVADA POR GÊNERO NÃO INFORMADO: ' + JSON.stringify({
        id, nome: source.name, linhas: [...linhas]
      }));
      continue;
    }

    const linhaDestino = generoOrigem ? genderLine(generoOrigem) : registros[0].line;
    const marcaOrigem = String(source.brand || '').trim();
    const marcaDestino = marcaOrigem
      ? limparTexto(marcaPublicaImarat(marcaOrigem)).trim().toUpperCase()
      : 'OUTROS';
    const categoriaOrigem = String(source.categoria_nome || source.categoria || '').trim();
    const volumeDestino = sourceVolume || [...volumesCatalogo][0] || '';
    const categoriaDestino = categoriaOrigem ||
      (isOleo(source.name) ? 'Óleos' :
        isMiniatura(source.name, volumeDestino, '') ? 'Miniaturas' : 'Perfumes');
    const grupoDestino = ensureBrandGroup(DATA, linhaDestino, marcaDestino, categoriaDestino);

    const precos = new Set(registros.map(r => chavePrecoId(r.item)));
    const registrosManuais = registros.filter(r => precoManualAtivo(r.item));
    let keeper;

    if (precos.size > 1) {
      const precosManuais = new Set(registrosManuais.map(r => chavePrecoId(r.item)));
      if (!registrosManuais.length || precosManuais.size !== 1) {
        conflitosPrecoImaratPorId++;
        console.log('DUPLICIDADE IMARAT PRESERVADA POR CONFLITO DE PREÇO: ' + JSON.stringify({
          id, nome: source.name,
          itens: registros.map(r => ({
            linha: r.line, marca: r.group.brand, categoria: r.group.cat,
            varejo: r.item.varejo, atacado: r.item.atacado,
            precoManual: precoManualAtivo(r.item)
          }))
        }));
        continue;
      }
      keeper = registrosManuais.find(r => chavePrecoId(r.item) === [...precosManuais][0]);
    } else {
      keeper = registros.find(r => r.group === grupoDestino) ||
        registrosManuais[0] ||
        [...registros].sort((a, b) => completudeItem(b.item) - completudeItem(a.item))[0];
    }

    const itemMantido = keeper.item;
    for (const registro of registros) {
      if (registro === keeper) continue;
      const outro = registro.item;
      for (const [campo, valor] of Object.entries(outro)) {
        if (['nome', 'volume', 'varejo', 'atacado', 'precoManual', 'id_origem', 'fonte'].includes(campo)) continue;
        if (itemMantido[campo] == null || itemMantido[campo] === '' || itemMantido[campo] === '—') {
          itemMantido[campo] = valor;
        }
      }
      const fotos = [
        ...(Array.isArray(itemMantido.fotos) ? itemMantido.fotos : []),
        itemMantido.foto,
        ...(Array.isArray(outro.fotos) ? outro.fotos : []),
        outro.foto
      ].filter(Boolean);
      const fotosUnicas = [...new Set(fotos)];
      if (fotosUnicas.length) {
        itemMantido.fotos = fotosUnicas;
        if (!itemMantido.foto) itemMantido.foto = fotosUnicas[0];
      }
      if (outro.disponivel === 'Sim') itemMantido.disponivel = 'Sim';
      const estoqueAtual = Number(itemMantido.estoque);
      const estoqueOutro = Number(outro.estoque);
      if (Number.isFinite(estoqueOutro) && (!Number.isFinite(estoqueAtual) || estoqueOutro > estoqueAtual)) {
        itemMantido.estoque = outro.estoque;
      }
    }

    itemMantido.nome = source.name || itemMantido.nome;
    if (volumeDestino) itemMantido.volume = volumeDestino;
    itemMantido.fonte = 'imarat';
    itemMantido.id_origem = id;
    if (registrosManuais.length) itemMantido.precoManual = true;

    if (keeper.group !== grupoDestino) {
      keeper.group.items = (keeper.group.items || []).filter(item => item !== itemMantido);
      if (!Array.isArray(grupoDestino.items)) grupoDestino.items = [];
      grupoDestino.items.push(itemMantido);
      keeper.group = grupoDestino;
    }
    for (const registro of registros) {
      if (registro === keeper) continue;
      registro.group.items = (registro.group.items || []).filter(item => item !== registro.item);
    }

    const removidas = registros.length - 1;
    duplicatasImaratPorIdRemovidas += removidas;
    gruposImaratPorIdConsolidados++;
    console.log('DUPLICATA IMARAT CONSOLIDADA POR ID DA ORIGEM: ' + JSON.stringify({
      id, nome: itemMantido.nome, removidas,
      linhaFinal: linhaDestino, marcaFinal: marcaDestino, categoriaFinal: categoriaDestino,
      volume: itemMantido.volume || 'não informado',
      varejo: itemMantido.varejo, atacado: itemMantido.atacado
    }));
  }

  for (const line of Object.keys(DATA)) {
    DATA[line] = (DATA[line] || []).filter(group => (group.items || []).length > 0);
  }

  console.log(`Grupos Imarat consolidados: ${gruposImaratConsolidados}`);
  console.log(`Duplicatas exatas Imarat removidas: ${duplicatasImaratRemovidas}`);
  console.log(`Conflitos de preço preservados para revisão: ${conflitosPrecoImaratPreservados}`);
  console.log(`Grupos de duplicidade Imarat consolidados por ID da origem: ${gruposImaratPorIdConsolidados}`);
  console.log(`Duplicatas Imarat removidas por ID da origem: ${duplicatasImaratPorIdRemovidas}`);
  console.log(`Conflitos de volume preservados por ID: ${conflitosVolumeImaratPorId}`);
  console.log(`Conflitos de gênero preservados por ID: ${conflitosGeneroImaratPorId}`);
  console.log(`Conflitos de preço preservados por ID: ${conflitosPrecoImaratPorId}`);

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) g.items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    DATA[line].sort((a, b) => String(a.brand).localeCompare(String(b.brand), 'pt-BR'));
  }

  for (const groups of Object.values(DATA)) {
    for (const group of groups || []) {
      for (const item of group.items || []) {
        delete item.original;
        delete item.custo;
        delete item.precoCusto;
        delete item.preco_custo;
        delete item.cost;
        delete item.costPrice;
        if (item.url_origem) {
          try {
            const sourceUrl = new URL(String(item.url_origem), 'https://dandejoias.com');
            item.url_origem = sourceUrl.pathname;
          } catch {
            delete item.url_origem;
          }
        }
        if (item.foto) {
          const safePhoto = sanitizePublicImageUrl(item.foto);
          if (safePhoto) item.foto = safePhoto;
          else delete item.foto;
        }
        if (Array.isArray(item.fotos)) {
          item.fotos = item.fotos.map(sanitizePublicImageUrl).filter(Boolean);
          if (!item.fotos.length) delete item.fotos;
        }
      }
    }
  }

  const livePreservation = preserveLivePublicFields(DATA, LIVE_GIST_DATA);
  if (livePreservation.ambiguous) {
    throw new Error(`Preservação de dados públicos ambígua em ${livePreservation.ambiguous} variantes; publicação bloqueada.`);
  }

  const out = '/** Empório A.R — sync ' + new Date().toISOString() + ` | +${addedImarat} Imarat +${addedBrand} Brand +${roupasCount}+${frannyCount} Roupas +${acessoriosCount} Acc | estoqueΔ ${stockChanged} | preçoΔ ${priceChanged} */\n` + 'export const DATA = ' + JSON.stringify(DATA) + ';\n' + 'export const WHATSAPP = "5562991134488";\n' + 'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };\n';
  fs.writeFileSync(dataPath, out, 'utf8');

  console.log('---');
  console.log(`Novos Imarat: ${addedImarat}`);
  console.log(`Títulos corrigidos por correspondência forte de marca/volume: ${titulosFuzzyCorrigidos}`);
  console.log(`Novos Brand: ${addedBrand}`);
  console.log(`Roupas Sophia: ${roupasCount} | Franny: ${frannyCount} | Acessórios: ${acessoriosCount}`);
  console.log(`Estoque alterado: ${stockChanged}`);
  console.log(`Preços alterados: ${priceChanged}`);
  console.log('data.js atualizado localmente (com correção forçada).');

  if (SYNC_DRY_RUN) {
    console.log('SYNC_DRY_RUN=1 — execução de validação concluída; Gist de produção NÃO foi alterado.');
    return;
  }

  console.log('Enviando dados para o GitHub Gist...');
  try {
    const gistId = GIST_ID;
    const githubToken = process.env.GIST_TOKEN;
    if (!githubToken) throw new Error('GIST_TOKEN não configurado');
    const dadosParaSite = { DATA: toPublicCatalog(DATA), WHATSAPP: "5562991134488", BRAND: { name: "Empório A.R", phone: "(62) 99113-4488" }, ultimaAtualizacao: new Date().toISOString() };
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${githubToken}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'catalogo.json': { content: '\uFEFF' + JSON.stringify(dadosParaSite, null, 2) } } })
    });
    if (!response.ok) { const errorText = await response.text(); throw new Error(`GitHub API ${response.status}: ${errorText}`); }
    console.log('✅ Dados enviados para o GitHub Gist com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao enviar para o GitHub Gist:', error);
    throw error; // faz a Action falhar em vez de sinalizar sucesso sem atualizar o catálogo público
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
