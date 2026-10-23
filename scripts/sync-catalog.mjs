/**
 * Sincroniza estoque + novos produtos (Imarat + Brand filtrado)
 * Envia os dados para o GitHub Gist
 * Versão: Kit 9=Vulcan, anti-dup Armaf, óleos→Óleos, Tabaco, precoManual protegido, BODY SPLASH.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'js', 'data.js');
const IMARAT_API = 'https://imaratperfumaria.com/api/products';
const IMARAT_ORIGIN = 'https://imaratperfumaria.com';
const BRAND_BASE = 'https://brandcollectionpy.com.br';
const BRAND_SELLER = 'darlanaugusto';

const BRAND_ALLOWED_SESSIONS = [
  'ARABIC COLLECTION', 'BEAUTY BRAND', 'BODY SPLASH',
  'COLEÇÂO DREAM', 'COLECAO DREAM', 'COLEÇÃO BRAND', 'COLECAO BRAND',
  'DREAM BRAND 80/100ML', 'DREAM BRAND', 'FLACONETE BRAND',
  'FLACONETE  BRAND', 'SAPATINHO GOOD GIRL',
];

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
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
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
  return removerMarcaDoNome(removerPrefixosMini(limparParaComparacao(nome)));
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
  if (b.includes('afeer')) return { varejo: fmtBRL(precoVarejoOrig + 20), atacado: fmtBRL(precoAtacadoOrig + 30) }; 
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
  if (n.includes('dream brand') || (n.includes('dream') && n.includes('80'))) return 'DREAM BRAND 80/100ML';
  if (n.includes('colecao dream') || n.includes('coleçao dream') || n === 'colecao dream') return 'COLEÇÂO DREAM';
  if (n.includes('colecao brand') || n.includes('coleçao brand')) return 'COLEÇÃO BRAND';
  if (n.includes('beauty brand')) return 'BEAUTY BRAND';
  if (n.includes('body splah') || n.includes('body splash')) {
    if (n.includes('dream') || n.includes('maison') || n.includes('brand body')) return null;
    return 'BODY SPLASH';
  }
  return null;
}

function isAllowedBrandProduct(p) { return mapBrandSession(p.categoria_nome || p.categoria || '') != null; }
function brandDisponivel(p) {
  if (p.status === false) return 'Não';
  if (p.controlar_estoque && p.total_estoque != null && Number(p.total_estoque) <= 0) return 'Não';
  return 'Sim';
}
function isArabicMiniBrand(p, session) { return session === 'ARABIC COLLECTION' && /25\s*ML/i.test(String(p.nome || '')); }

function priceBrand(orig, isArabicMini) {
  if (isArabicMini) return { varejo: '125,00', atacado: '85,00' };
  if (orig <= 100) return { varejo: fmtBRL(orig + 60), atacado: fmtBRL(orig + 40) };
  return { varejo: fmtBRL(orig + 90), atacado: fmtBRL(orig + 70) };
}

async function fetchImaratList() {
  const all = [];
  let page = 1, total = 0, fetched = 0;
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
        if (p.shortDesc) p.shortDesc = limparTexto(p.shortDesc);
        if (p.description) p.description = limparTexto(p.description);
    }
    all.push(...products);
    fetched += products.length;
    if (fetched >= total || products.length < 60) break;
    page++;
  }
  return all;
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
const SOPHIA_BASE = 'https://sophiamoda.com.br';
const SOPHIA_LOJA = '62982459275';
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
      if (text.trimStart().startsWith('<!') || text.includes('<html')) {
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

async function fetchSophiaRoupas() {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  // Warm-up: pega cookie de sessão
  let cookie = '';
  try {
    const warm = await fetch(`${SOPHIA_BASE}/c/atacado/${SOPHIA_LOJA}`, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });
    const setCookie = warm.headers.getSetCookie?.() || [];
    // Node fetch may expose getSetCookie; fallback parse
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
  } catch (e) {
    console.log('  ⚠ Warm-up Sophia falhou (seguindo sem cookie):', e.message);
  }

  const headers = {
    'User-Agent': UA,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Content-Type': 'application/json',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    Origin: SOPHIA_BASE,
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

          const SOPHIA_IMG_BASE = 'https://arquivos-cdn.facilzap.app.br/';
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
const FRANNY_BASE = 'https://frannyloja.com.br';
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

const FACILZAP_IMG = 'https://arquivos-cdn.facilzap.app.br/';

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
  if (!text || text.trimStart().startsWith('<!')) throw new Error('HTML em vez de JSON');
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
function mergeRoupasGroups(listOfGroupArrays) {
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
        bucket.items.push(it);
      }
    }
  }
  const out = [...byCat.values()];
  for (const g of out) g.items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  out.sort((a, b) => a.cat.localeCompare(b.cat, 'pt-BR'));
  return out;
}

// ========== DANDE (ACESSÓRIOS) ==========
const DANDE_BASE = 'https://dandejoias.com';
const DANDE_CATEGORIES = [
  { path: '/acessorios-de-cabelo/', nome: 'Acessórios de Cabelo' },
  { path: '/aneis/', nome: 'Anéis' },
  { path: '/braceletes/', nome: 'Braceletes' },
  { path: '/brincos/', nome: 'Brincos' },
  { path: '/colares/', nome: 'Colares' },
  { path: '/conjuntos/', nome: 'Conjuntos' },
  { path: '/lancamentos/', nome: 'Lançamentos' },
  { path: '/masculinos/', nome: 'Masculinos' },
  { path: '/prata-925/', nome: 'Prata 925' },
  { path: '/pulseiras/', nome: 'Pulseiras' },
  { path: '/semijoia-italiana/', nome: 'Semijoia Italiana' },
  { path: '/tornozeleiras/', nome: 'Tornozeleiras' },
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

async function fetchDandeCategoryPage(path, page = 1) {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const url = page <= 1
    ? `${DANDE_BASE}${path}`
    : `${DANDE_BASE}${path}?page=${page}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseDandeListProducts(html) {
  const products = [];
  // data-product-id + nearby data-variants / links
  const re = /data-product-id=["'](\d+)["']/gi;
  const seen = new Set();
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const start = Math.max(0, m.index - 200);
    const chunk = html.slice(start, m.index + 6000);
    const nameM = chunk.match(/data-product-name=["']([^"']+)["']/i)
      || chunk.match(/itemprop=["']name["'][^>]*content=["']([^"']+)["']/i)
      || chunk.match(/<h[23][^>]*class="[^"]*item-name[^"]*"[^>]*>([^<]+)/i);
    const hrefM = chunk.match(/href=["'](https?:\/\/dandejoias\.com\/produtos\/[^"']+|\/produtos\/[^"']+)["']/i);
    const priceM = chunk.match(/data-product-price=["']([^"']+)["']/i)
      || chunk.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i);
    let variants = [];
    const vm = chunk.match(/data-variants=["']([^"']*)["']/i);
    if (vm) {
      try { variants = JSON.parse(decodeEntities(vm[1])); } catch (_) {}
    }
    let url = hrefM ? hrefM[1] : '';
    if (url && url.startsWith('/')) url = DANDE_BASE + url;
    const nome = limparTexto(nameM ? decodeEntities(nameM[1]) : '');
    const preco = priceM ? Number(String(priceM[1]).replace(',', '.')) : 0;
    products.push({ id, nome, url, preco, variants });
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
    for (let page = 1; page <= 15; page++) {
      try {
        const html = await fetchDandeCategoryPage(cat.path, page);
        const list = parseDandeListProducts(html);
        if (!list.length) break;
        let added = 0;
        for (const p of list) {
          if (byId.has(p.id)) continue;
          let variants = p.variants || [];
          let desc = '';
          let imgs = [];
          const prev = existingById.get(p.id);
          // detalhe só se novo ou sem variações no snapshot
          if (p.url && (!prev || !(prev.variacoes || []).length || !prev.notas)) {
            try {
              const det = await fetchDandeProductDetail(p.url);
              if (det) {
                if (det.variants?.length) variants = det.variants;
                desc = det.desc || '';
                imgs = det.imgs || [];
              }
              await sleep(250);
            } catch (_) {}
          } else if (prev) {
            desc = prev.notas || '';
            imgs = prev.fotos || (prev.foto ? [prev.foto] : []);
            if (!variants.length && prev.variacoes) {
              // keep previous structure but will reprice from list price
              variants = null;
            }
          }
          let precoBase = p.preco;
          if ((!precoBase || precoBase <= 0) && variants && variants[0]) {
            precoBase = Number(variants[0].price_number || variants[0].price || 0);
          }
          if ((!precoBase || precoBase <= 0) && prev) {
            // reverse approx from atacado with old or new rule — skip, use list only
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
          if (!imgs.length && prev) imgs = prev.fotos || (prev.foto ? [prev.foto] : []);
          const foto = imgs[0] || (prev && prev.foto) || '';
          const nome = p.nome || (prev && prev.nome) || 'Produto';
          byId.set(p.id, {
            nome: limparTexto(nome),
            volume: '—',
            varejo: prices.varejo,
            atacado: prices.atacado,
            disponivel: totalEstoque > 0 ? 'Sim' : (prev?.disponivel || 'Sim'),
            notas: desc || (prev?.notas || ''),
            foto,
            fotos: imgs.length ? imgs : foto ? [foto] : [],
            badge: '',
            fonte: 'acessorios',
            id_origem: String(p.id),
            url_origem: p.url || (prev && prev.url_origem) || '',
            total_estoque: totalEstoque,
            variacoes,
            cat: cat.nome,
          });
          added++;
        }
        console.log(`    p${page}: lote ${list.length} únicos+${added}`);
        if (list.length < 8) break;
        await sleep(400);
      } catch (e) {
        console.log(`    Dande erro ${cat.nome} p${page}: ${e.message}`);
        break;
      }
    }
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
  console.log('Carregando data.js...');
  let raw = fs.readFileSync(dataPath, 'utf8');
  const m = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!m) throw new Error('DATA não encontrado');
  const DATA = JSON.parse(m[1]);

  console.log(`Flags: ADD_IMARAT_NEW=${ADD_IMARAT_NEW} ADD_BRAND_NEW=${ADD_BRAND_NEW} ADD_ROUPAS=${ADD_ROUPAS}`);

  console.log('Buscando Imarat...');
  const imaratList = await fetchImaratList();
  console.log(`Imarat: ${imaratList.length} produtos`);

  let stockChanged = 0, addedImarat = 0, priceChanged = 0;

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      if (g.cat === 'Brand' || String(g.cat || '').startsWith('Brand')) continue;
      for (let i = 0; i < g.items.length; i++) {
        const it = g.items[i];
        it.nome = limparTexto(it.nome);
        if (it.notas) it.notas = limparTexto(it.notas);

        const n = norm(it.nome); const b = norm(g.brand);
        
        const hit = imaratList.find((p) => norm(p.name) === n && (norm(p.brand) === b || !b || norm(p.brand).includes(b) || b.includes(norm(p.brand)))) || imaratList.find((p) => norm(p.name) === n);
        if (!hit) continue;
        
        it.nome = hit.name; 
        
        let notas = '';
        if (hit.slug) { 
            const detail = await fetchImaratDetail(hit.slug); 
            if (detail) notas = notesToText(detail.notes) || (detail.shortDesc || detail.description || '').slice(0, 400); 
        }
        if (notas) it.notas = notas;

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
          const prices = calcularPrecoMiniatura(it.nome, g.brand, it.volume, categoria, precoVarejoOrig, precoAtacadoOrig);
          if (it.varejo !== prices.varejo || it.atacado !== prices.atacado) {
            it.varejo = prices.varejo;
            it.atacado = prices.atacado;
            priceChanged++;
          }
        }
      }
    }
  }

  // Filtro de segurança (remove duplicatas exatas dentro do mesmo grupo)
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
        const vistos = new Set();
        g.items = g.items.filter(item => {
            const chave = limparParaComparacao(item.nome); 
            if (vistos.has(chave)) return false;
            vistos.add(chave);
            return true;
        });
    }
  }

  const indexNormal = new Set();
  const indexMiniImarat = new Set();
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      for (const it of g.items) {
        indexNormal.add(`${limparParaComparacao(it.nome)}|${norm(g.brand)}`);
        if (isMiniatura(it.nome, it.volume, g.cat)) indexMiniImarat.add(`${chaveComparacaoMini(it.nome)}|${norm(g.brand)}`);
      }
    }
  }

  if (ADD_IMARAT_NEW) {
    for (const p of imaratList) {
      const nome = limparTexto(p.name);
      const brand = limparTexto((p.brand || 'Outros')).toUpperCase();
      const volume = volumeFrom(p.sizeMl, nome);
      const categoria = p.categoria_nome || p.categoria || '';
      const ehOleo = isOleo(nome);
      const ehMini = isMiniatura(nome, volume, categoria) && !ehOleo;
      let duplicado;
      if (ehMini) {
        const chave = chaveComparacaoMini(nome);
        duplicado =
          indexMiniImarat.has(chave) ||
          indexMiniImarat.has(`${chave}|${norm(brand)}`) ||
          indexMiniImarat.has(`${chave}|armaf`) ||
          indexMiniImarat.has(`${chave}|outros`) ||
          indexMiniImarat.has(`${chave}|outra`);
      } else {
        duplicado = indexNormal.has(`${limparParaComparacao(nome)}|${norm(brand)}`) || indexNormal.has(limparParaComparacao(nome));
      }
      if (duplicado) continue;

      let notas = '';
      if (p.slug) {
        const detail = await fetchImaratDetail(p.slug);
        if (detail) notas = notesToText(detail.notes) || (detail.shortDesc || detail.description || '').slice(0, 400);
      }
      notas = sanitizarNotas(notas);
      
      const precoVarejoOrig = (p.priceCents || 0) / 100; 
      const precoAtacadoOrig = p.atacado && p.atacado.precoCents != null ? p.atacado.precoCents / 100 : Math.max(precoVarejoOrig - 30, 0); 
      const prices = calcularPrecoMiniatura(nome, brand, volume, categoria, precoVarejoOrig, precoAtacadoOrig);
      
      const line = genderLine(p.gender); 
      const foto = p.image ? (p.image.startsWith('http') ? p.image : IMARAT_ORIGIN + p.image) : ''; 
      const cat = ehOleo ? 'Óleos' : ehMini ? 'Miniaturas' : 'Perfumes';
      
      const group = ensureBrandGroup(DATA, line, brand, cat);
      group.items.push({ 
          nome, 
          volume, 
          varejo: prices.varejo, 
          atacado: prices.atacado, 
          disponivel: p.inStock === true ? 'Sim' : 'Não', 
          notas: notas || '', 
          foto 
      });
      
      indexNormal.add(`${limparParaComparacao(nome)}|${norm(brand)}`);
      if (ehMini) {
        const chave = chaveComparacaoMini(nome);
        indexMiniImarat.add(chave);
        indexMiniImarat.add(`${chave}|${norm(brand)}`);
      }
      addedImarat++;
    }
  }

  console.log('Buscando Brand Collection...');
  const brandList = await fetchBrandList();
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

  if (ADD_BRAND_NEW) {
    for (const p of brandAllowed) {
      const nome = p.nome || ''; if (!nome) continue; const session = mapBrandSession(p.categoria_nome || p.categoria || ''); if (!session) continue;
      const volume = volumeFrom(null, nome); const duplicado = indexNormal.has(`${limparParaComparacao(nome)}|${norm(session)}`) || indexNormal.has(limparParaComparacao(nome)); if (duplicado) continue;
      const orig = typeof p.preco === 'number' ? p.preco : parseOrig(p.preco); const prices = priceBrand(orig, isArabicMiniBrand(p, session));
      const line = genderLine(nome + ' ' + session); let foto = ''; if (p.imagens && p.imagens[0]) { const img = p.imagens[0]; foto = img.startsWith('http') ? img : `https://arquivos-cdn.facilzap.app.br/${img}?width=700&height=700&quality=85&format=webp`; }
      const notas = (p.descricao && String(p.descricao).trim()) || '';
      const group = ensureBrandGroup(DATA, line, session, 'Brand');
      group.items.push({ 
          nome, 
          volume, 
          varejo: prices.varejo, 
          atacado: prices.atacado, 
          disponivel: brandDisponivel(p), 
          notas: notas.slice(0, 500), 
          foto 
      });
      indexNormal.add(`${limparParaComparacao(nome)}|${norm(session)}`); addedBrand++;
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
      DATA.roupas = mergeRoupasGroups(chunks);
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

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) g.items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    DATA[line].sort((a, b) => String(a.brand).localeCompare(String(b.brand), 'pt-BR'));
  }

  const out = '/** Empório A.R — sync ' + new Date().toISOString() + ` | +${addedImarat} Imarat +${addedBrand} Brand +${roupasCount}+${frannyCount} Roupas +${acessoriosCount} Acc | estoqueΔ ${stockChanged} | preçoΔ ${priceChanged} */\n` + 'export const DATA = ' + JSON.stringify(DATA) + ';\n' + 'export const WHATSAPP = "5562991134488";\n' + 'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };\n';
  fs.writeFileSync(dataPath, out, 'utf8');

  console.log('---');
  console.log(`Novos Imarat: ${addedImarat}`);
  console.log(`Novos Brand: ${addedBrand}`);
  console.log(`Roupas Sophia: ${roupasCount} | Franny: ${frannyCount} | Acessórios: ${acessoriosCount}`);
  console.log(`Estoque alterado: ${stockChanged}`);
  console.log(`Preços alterados: ${priceChanged}`);
  console.log('data.js atualizado localmente (com correção forçada).');

  console.log('Enviando dados para o GitHub Gist...');
  try {
    const gistId = "11918b7196b3ee6a0d8a91739167b312";
    const githubToken = process.env.GIST_TOKEN;
    if (!githubToken) throw new Error('GIST_TOKEN não configurado');
    const dadosParaSite = { DATA: DATA, WHATSAPP: "5562991134488", BRAND: { name: "Empório A.R", phone: "(62) 99113-4488" }, ultimaAtualizacao: new Date().toISOString() };
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${githubToken}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'catalogo.json': { content: '\uFEFF' + JSON.stringify(dadosParaSite, null, 2) } } })
    });
    if (!response.ok) { const errorText = await response.text(); throw new Error(`GitHub API ${response.status}: ${errorText}`); }
    console.log('✅ Dados enviados para o GitHub Gist com sucesso!');
  } catch (error) { console.error('❌ Erro ao enviar para o GitHub Gist:', error); }
}

main().catch((e) => { console.error(e); process.exit(1); });
