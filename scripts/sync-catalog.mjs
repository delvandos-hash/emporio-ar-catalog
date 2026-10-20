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
  'ARABIC COLLECTION', 'BEAUTY BRAND', 'BODY SPLASH', 'BODY SPLAHS',
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

          const imagens = Array.isArray(p.imagens)
            ? p.imagens.map((img) => img.url || img).filter(Boolean)
            : [];
          const foto = imagens[0] || p.imagem || p.foto || '';

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

  // ----- Roupas (Sophia Moda) -----
  let roupasCount = 0;
  if (ADD_ROUPAS) {
    console.log('Buscando Roupas na Sophia Moda...');
    try {
      const roupasGroups = await fetchSophiaRoupas();
      roupasCount = roupasGroups.reduce((s, g) => s + g.items.length, 0);
      if (roupasCount > 0) {
        DATA.roupas = roupasGroups;
        console.log(`Roupas Sophia: ${roupasCount} produtos em ${roupasGroups.length} categorias`);
      } else {
        console.log('Roupas Sophia: 0 (mantendo dados anteriores de DATA.roupas se existirem)');
      }
    } catch (e) {
      console.log(`❌ Erro ao buscar Sophia Moda: ${e.message}`);
      console.log('Roupas Sophia: 0 (mantendo snapshot anterior)');
    }
  } else {
    console.log('ADD_ROUPAS=0 — pulando Sophia Moda');
  }

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) g.items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    DATA[line].sort((a, b) => String(a.brand).localeCompare(String(b.brand), 'pt-BR'));
  }

  const out = '/** Empório A.R — sync ' + new Date().toISOString() + ` | +${addedImarat} Imarat +${addedBrand} Brand +${roupasCount} Roupas | estoqueΔ ${stockChanged} | preçoΔ ${priceChanged} */\n` + 'export const DATA = ' + JSON.stringify(DATA) + ';\n' + 'export const WHATSAPP = "5562991134488";\n' + 'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };\n';
  fs.writeFileSync(dataPath, out, 'utf8');

  console.log('---');
  console.log(`Novos Imarat: ${addedImarat}`);
  console.log(`Novos Brand: ${addedBrand}`);
  console.log(`Roupas Sophia: ${roupasCount}`);
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
