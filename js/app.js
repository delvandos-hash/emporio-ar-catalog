/**
 * Empório A.R - Catálogo Digital
 * Dados: Gist (principal) + fallback local data.js + estoque ao vivo
 */
import { validateProductPrices, parsePrice as parsePriceStrict } from './prices.js';
import { DATA as LOCAL_DATA, WHATSAPP as LOCAL_WHATSAPP, BRAND as LOCAL_BRAND } from './data.js';

// Novo Gist (20/10/2026)
const GIST_CATALOG_URL =
  'https://gist.githubusercontent.com/delvandos-hash/11918b7196b3ee6a0d8a91739167b312/raw/catalogo.json';

async function loadCatalogData() {
  // 1) Gist primeiro (permite atualizar produtos sem deploy)
  // 2) Depois API local
  // 3) Fallback: data.js embutido
  const urls = [GIST_CATALOG_URL, '/api/catalogo'];

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const j = await res.json();
      if (j && j.DATA) return j;
    } catch (e) {
      // tenta o próximo
    }
  }

  // Fallback local
  return {
    DATA: LOCAL_DATA,
    WHATSAPP: LOCAL_WHATSAPP,
    BRAND: LOCAL_BRAND
  };
}

const dadosDoServidor = await loadCatalogData();

const { DATA, WHATSAPP, BRAND } = dadosDoServidor;

/** ID estável do produto (deep link ?produto= e feed Google) */
function normId(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function productId(p) {
  if (!p) return '';
  return `${normId(p.brand)}-${normId(p.nome)}-${normId(p.volume)}`;
}
function findProductById(id) {
  if (!id || !DATA) return null;
  const want = String(id).toLowerCase();
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line] || []) {
      for (const it of g.items || []) {
        const p = { ...it, brand: g.brand, cat: g.cat, line };
        if (productId(p) === want) return p;
      }
    }
  }
  return null;
}
function setProductUrl(p) {
  try {
    const url = new URL(window.location.href);
    if (p) {
      url.searchParams.set('produto', productId(p));
    } else {
      url.searchParams.delete('produto');
    }
    history.replaceState(history.state || {}, '', url.pathname + url.search + url.hash);
  } catch (e) {}
}
function openProductFromUrl() {
  try {
    const id = new URLSearchParams(window.location.search).get('produto');
    if (!id) return false;
    const p = findProductById(id);
    if (p) {
      openDetails(p);
      return true;
    }
  } catch (e) {}
  return false;
}


function getProductShareUrl(p) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('produto', productId(p));
    url.hash = '';
    return url.toString();
  } catch (e) {
    return window.location.origin + '/?produto=' + encodeURIComponent(productId(p));
  }
}

function getProductShareText(p) {
  const link = getProductShareUrl(p);
  let t = `*${p.nome}* — Empório A.R\n`;
  if (p.brand) t += `Marca: ${p.brand}\n`;
  if (p.volume && p.volume !== '—') t += `Volume: ${p.volume}\n`;
  if (p.varejo) t += `Varejo: R$ ${p.varejo}\n`;
  if (p.atacado && p.atacado !== '—') t += `Atacado (6+): R$ ${p.atacado}\n`;
  t += `\nVeja no catálogo:\n${link}`;
  return t;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

function loadImageCors(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // tenta sem CORS (pode sujar o canvas)
      const img2 = new Image();
      img2.onload = () => resolve(img2);
      img2.onerror = () => resolve(null);
      img2.src = src;
    };
    // cache-buster leve em CDN conhecida
    const u = src.includes('?') ? src + '&share=1' : src + '?share=1';
    img.src = u;
  });
}

/** Card vertical 1080x1920 para Stories / Status */
async function downloadStoryCard(p) {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // fundo
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.55, '#14532d');
  grad.addColorStop(1, '#052e16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // card branco
  const pad = 64;
  const cardX = pad, cardY = 220, cardW = W - pad * 2, cardH = H - 420;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, cardX, cardY, cardW, cardH, 40);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // logo / marca
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EMPÓRIO A.R', W / 2, 120);
  ctx.font = '28px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Catálogo Digital', W / 2, 165);

  // foto
  const foto = p.foto || (Array.isArray(p.fotos) && p.fotos[0]) || '';
  const img = await loadImageCors(foto);
  const imgAreaY = cardY + 48;
  const imgAreaH = 720;
  const imgAreaX = cardX + 48;
  const imgAreaW = cardW - 96;
  ctx.fillStyle = '#f3f4f6';
  roundRect(ctx, imgAreaX, imgAreaY, imgAreaW, imgAreaH, 24);
  ctx.fill();
  if (img) {
    const scale = Math.min(imgAreaW / img.width, imgAreaH / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    const ix = imgAreaX + (imgAreaW - iw) / 2;
    const iy = imgAreaY + (imgAreaH - ih) / 2;
    try {
      ctx.drawImage(img, ix, iy, iw, ih);
    } catch (e) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '32px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Foto indisponível', W / 2, imgAreaY + imgAreaH / 2);
    }
  } else {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '32px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sem foto', W / 2, imgAreaY + imgAreaH / 2);
  }

  // textos
  let ty = imgAreaY + imgAreaH + 56;
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
  const nome = wrapText(ctx, p.nome || 'Produto', cardW - 100, 2);
  nome.forEach((line, i) => {
    ctx.fillText(line, W / 2, ty + i * 52);
  });
  ty += nome.length * 52 + 28;

  ctx.fillStyle = '#6b7280';
  ctx.font = '30px system-ui, sans-serif';
  const meta = [p.brand, p.volume && p.volume !== '—' ? p.volume : ''].filter(Boolean).join(' · ');
  if (meta) {
    ctx.fillText(meta, W / 2, ty);
    ty += 48;
  }

  ctx.fillStyle = '#166534';
  ctx.font = 'bold 48px system-ui, sans-serif';
  if (p.varejo) ctx.fillText(`Varejo R$ ${p.varejo}`, W / 2, ty);
  ty += 52;
  if (p.atacado && p.atacado !== '—') {
    ctx.fillStyle = '#15803d';
    ctx.font = '36px system-ui, sans-serif';
    ctx.fillText(`Atacado (6+) R$ ${p.atacado}`, W / 2, ty);
  }

  // rodapé
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillText('Toque no link da bio · WhatsApp (62) 99113-4488', W / 2, H - 80);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Não foi possível gerar a imagem. Tente em outro aparelho.');
        resolve(false);
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `emporio-ar-${normId(p.nome) || 'produto'}-story.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      resolve(true);
    }, 'image/jpeg', 0.92);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.length) {
    // ellipsis
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxWidth && last.length) last = last.slice(0, -1);
    lines[maxLines - 1] = last + (last !== lines[maxLines - 1] || words.join(' ') !== lines.join(' ') ? '…' : '');
  }
  return lines;
}

async function shareProduct(p) {
  if (!p) return;
  const url = getProductShareUrl(p);
  const text = getProductShareText(p);
  const title = `${p.nome} · Empório A.R`;

  // 1) Web Share API (abre menu do celular: WhatsApp, Instagram, etc.)
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      // cai no menu manual
    }
  }
  // 2) Menu fallback
  openShareSheet(p, url, text);
}

function openShareSheet(p, url, text) {
  const ov = document.getElementById('shareSheet');
  if (!ov) {
    // fallback mínimo
    copyText(url).then((ok) => alert(ok ? 'Link do produto copiado!' : url));
    return;
  }
  ov.dataset.url = url;
  ov.dataset.text = text;
  ov.classList.add('open');
}

function closeShareSheet() {
  document.getElementById('shareSheet')?.classList.remove('open');
}



const state = {
  gender: 'Todos',
  category: 'Todos',
  price: 'Todos',
  stock: 'Todos',
  volume: 'Todos',
  search: '',
  sort: 'nome-asc',
  vitrine: 'Todos' // Todos | Lancamentos | Destaques
};

/** Sinônimos de busca (sem acento, minúsculo) */
const SEARCH_SYNONYMS = {
  yara: ['yara', 'iara'],
  asad: ['asad', 'assad'],
  khamrah: ['khamrah', 'khamra', 'qahwa'],
  hawas: ['hawas', 'havas'],
  fakhar: ['fakhar', 'fakar'],
  baccarat: ['baccarat', 'bacarat', 'bacarra'],
  sauvage: ['sauvage', 'savage'],
  aventus: ['aventus', 'aventure'],
  mini: ['mini', 'miniatura', 'miniaturas'],
  miniatura: ['mini', 'miniatura', 'miniaturas'],
};

function normalizeSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesSearch(item, brand, cat, q) {
  if (!q || !String(q).trim()) return true;
  const hay = normalizeSearch(
    [item.nome, brand, item.volume, item.notas, cat, item.badge, item.line]
      .filter(Boolean)
      .join(' ')
  );
  const tokens = normalizeSearch(q).split(' ').filter(Boolean);
  return tokens.every((t) => {
    const alts = SEARCH_SYNONYMS[t] || [t];
    return alts.some((a) => hay.includes(a));
  });
}

function volumeBucket(item) {
  const v = String(item.volume || '').toLowerCase().replace(',', '.');
  const n = String(item.nome || '').toLowerCase();
  const ml = v.match(/(\d+(?:\.\d+)?)\s*ml/);
  const num = ml ? parseFloat(ml[1]) : NaN;
  if (n.includes('miniatura') || n.includes('mini ') || n.startsWith('mini')) return 'Mini';
  if (!isNaN(num)) {
    if (num <= 30) return 'Mini';
    if (num >= 80 && num <= 120) return '100ml';
    if (num > 120) return '200ml+';
  }
  if (v.includes('100')) return '100ml';
  if (v.includes('200') || v.includes('250')) return '200ml+';
  return 'Outros';
}

function isLancamentoItem(item, cat) {
  const c = String(cat || item.cat || '').toLowerCase();
  const b = String(item.badge || '').toLowerCase();
  const n = String(item.nome || '').toLowerCase();
  if (c.includes('lanç') || c.includes('lanc')) return true;
  if (b.includes('novo') || b.includes('lanç') || b.includes('lanc') || b === 'new') return true;
  if (n.includes('lançamento') || n.includes('lancamento')) return true;
  return false;
}

const CART_KEY = 'emporio_ar_cart';
const ADMIN_KEY = 'emporio_ar_admin';
const OVERRIDES_KEY = 'emporio_ar_overrides';
const SECTIONS_KEY = 'emporio_ar_sections';
const ADMIN_PASS = '172812ds';
let isAdmin = false; // versão final sem Admin

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}'); }
  catch { return {}; }
}
function saveOverrides(o) {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o));
}

function loadSections() {
  try { return JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}'); }
  catch { return {}; }
}
function saveSections(s) {
  localStorage.setItem(SECTIONS_KEY, JSON.stringify(s));
}
function sectionDisplayName(cat) {
  return cat === 'Brand' ? 'Brand Collection' : cat;
}
function sectionActive(cat) {
  return true;
}
function getAllCategories() {
  const set = new Set();
  for (const line of Object.keys(DATA)) {
    for (const g of (DATA[line] || [])) {
      if (g.cat) set.add(g.cat);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
function openSectionsAdmin() {
  const box = document.getElementById('sectionsModal');
  if (!box) return;
  const list = document.getElementById('sectionsList');
  const cats = getAllCategories();
  const cfg = loadSections();
  list.innerHTML = cats.map(cat => {
    const c = cfg[cat] || {};
    const name = c.name || cat;
    const active = c.active === undefined ? true : !!c.active;
    const catEnc = encodeURIComponent(cat);
    const nameSafe = String(name).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    const catSafe = String(cat).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    return `<div class="section-row" data-cat="${catEnc}">
      <label class="sec-toggle"><input type="checkbox" class="sec-active" ${active ? 'checked' : ''}/> Ativa</label>
      <input type="text" class="sec-name" value="${nameSafe}" />
      <span class="sec-orig">${catSafe}</span>
    </div>`;
  }).join('');
  box.classList.add('open');
}
function saveSectionsAdmin() {
  const cfg = {};
  document.querySelectorAll('#sectionsList .section-row').forEach(row => {
    let cat = row.dataset.cat;
    try { cat = decodeURIComponent(cat); } catch (e) {}
    const name = row.querySelector('.sec-name').value.trim() || cat;
    const active = row.querySelector('.sec-active').checked;
    cfg[cat] = { name, active };
  });
  const activeCount = Object.values(cfg).filter(s => s && s.active).length;
  if (!activeCount) {
    alert('Deixe pelo menos uma sessão ativa.');
    return;
  }
  saveSections(cfg);
  document.getElementById('sectionsModal').classList.remove('open');
  state.category = 'Todos';
  state.gender = 'Todos';
  state.search = '';
  const q = document.getElementById('q');
  if (q) q.value = '';
  document.querySelectorAll('#genderFilters .fbtn').forEach(b => b.classList.toggle('active', b.dataset.value === 'Todos'));
  // rebuild category filter buttons active state
  document.querySelectorAll('#categoryFilters .fbtn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === 'Todos');
  });
  ensureBrandCategoryFilters();
  refreshCategoryFilterVisibility();
  render();
  alert('Sessões salvas.\\n' + activeCount + ' sessão(ões) ativa(s).');
}
function refreshCategoryFilterVisibility() {
  const el = document.getElementById('categoryFilters');
  if (!el) return;
  el.querySelectorAll('.fbtn').forEach(btn => {
    const v = btn.dataset.value;
    if (v === 'Todos') {
      btn.style.display = '';
      return;
    }
    btn.style.display = sectionActive(v) ? '' : 'none';
    // update label
    if (v && v !== 'Todos') btn.textContent = sectionDisplayName(v).replace(/^Brand ·\s*/, '');
  });
}


function applyOverride(item, brand) {
  const key = `${brand}|${item.nome}|${item.volume || ''}`;
  const o = loadOverrides()[key];
  if (!o) return { ...item, brand };
  return { ...item, ...o, brand: o.brand || brand };
}

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}
const cart = loadCart();
let currentProduct = null;
let searchTimer = null;

function parsePrice(str) {
  if (!str || str === '—' || str === '-') return 0;
  const n = String(str).replace(/[R$\s]/g, '').replace(',', '.');
  const v = parseFloat(n);
  return isNaN(v) ? 0 : v;
}

function isAvailable(item) {
  return (item.disponivel || 'Sim') === 'Sim';
}


const STOCK_CACHE_KEY = 'emporio_ar_stock_cache_v2';
const STOCK_CACHE_TTL_MS = 5 * 60 * 1000;
let stockLiveMap = null;

function normStockKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function lookupLiveStock(item, brand, cat) {
  if (!stockLiveMap) return null;
  const n = normStockKey(item.nome);
  const isBrand = cat === 'Brand' || String(cat || '').startsWith('Brand') || String(brand || '').toUpperCase().includes('BRAND') || String(brand || '').toUpperCase().includes('ARABIC') || String(brand || '').toUpperCase().includes('DREAM') || String(brand || '').toUpperCase().includes('FLACONETE') || String(brand || '').toUpperCase().includes('SAPATINHO') || String(brand || '').toUpperCase().includes('BODY') || String(brand || '').toUpperCase().includes('BEAUTY') || String(brand || '').toUpperCase().includes('COLE');
  const map = isBrand ? (stockLiveMap.brandMap || {}) : (stockLiveMap.map || {});
  const byName = isBrand ? (stockLiveMap.brandByName || {}) : (stockLiveMap.byName || {});
  const b = normStockKey(brand);
  const k1 = n + '|' + b;
  if (map[k1]) return map[k1];
  // match by brand suffix in map keys
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith(n + '|')) return v;
  }
  if (byName[n]) return byName[n];
  if (isBrand) {
    for (const [kn, v] of Object.entries(byName)) {
      if (kn.length > 6 && (n.includes(kn) || kn.includes(n))) return v;
    }
  }
  return null;
}

function withLiveStock(item, brand, cat) {
  const live = lookupLiveStock(item, brand, cat);
  if (!live) return { ...item, brand };
  return { ...item, brand, disponivel: live };
}

async function syncStockFromRoot() {
  try {
    try {
      const raw = localStorage.getItem(STOCK_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.updatedAt && Date.now() - new Date(cached.updatedAt).getTime() < STOCK_CACHE_TTL_MS) {
          stockLiveMap = cached;
          return true;
        }
      }
    } catch (e) {}

    const endpoints = ['/.netlify/functions/stock-sync', '/api/stock-sync'];
    let data = null;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        data = await res.json();
        if (data && data.ok) break;
      } catch (e) {}
    }

    if (data && data.ok) {
      stockLiveMap = data;
      try {
        localStorage.setItem(STOCK_CACHE_KEY, JSON.stringify({
          map: data.map || {},
          byName: data.byName || {},
          brandMap: data.brandMap || {},
          brandByName: data.brandByName || {},
          updatedAt: data.updatedAt || new Date().toISOString(),
        }));
      } catch (e) {}
      return true;
    }
  } catch (e) {
    console.warn('Sync estoque falhou', e);
  }
  return false;
}


function inPriceRange(varejo) {
  if (state.price === 'Todos') return true;
  const v = parsePrice(varejo);
  if (state.price === '0-100') return v > 0 && v <= 100;
  if (state.price === '100-200') return v > 100 && v <= 200;
  if (state.price === '200-350') return v > 200 && v <= 350;
  if (state.price === '350+') return v > 350;
  return true;
}

function sortItems(items, brand) {
  const list = items.map(it => ({ ...it, brand: brand || it.brand }));
  const [key, dir] = state.sort.split('-');
  const mult = dir === 'desc' ? -1 : 1;
  list.sort((a, b) => {
    if (key === 'nome') return mult * a.nome.localeCompare(b.nome, 'pt-BR');
    if (key === 'marca') return mult * (a.brand || '').localeCompare(b.brand || '', 'pt-BR');
    if (key === 'varejo') return mult * (parsePrice(a.varejo) - parsePrice(b.varejo));
    if (key === 'atacado') return mult * (parsePrice(a.atacado) - parsePrice(b.atacado));
    return 0;
  });
  return list;
}


function ensureBrandCategoryFilters() {
  // Brand é sessão (gender), não chip de categoria — não injeta botão duplicado
  const el = document.getElementById('categoryFilters');
  if (!el) return;
  el.querySelectorAll('.fbtn').forEach(btn => {
    const v = btn.dataset.value || '';
    if (v === 'Brand' || v.startsWith('Brand ·')) btn.remove();
  });
}



function allGroups() {
  const genderOrder = ['feminino', 'masculino', 'unissex', 'roupas', 'acessorios'];
  const gSel = String(state.gender || 'Todos');
  // Sessão Brand: coleta Brand de masculino/feminino/unissex e usa a coleção (brand) como categoria
  if (gSel.toLowerCase() === 'brand') {
    const result = [];
    for (const line of ['masculino', 'feminino', 'unissex']) {
      for (const g of (DATA[line] || [])) {
        const cat = g.cat || '';
        if (cat !== 'Brand' && !String(cat).startsWith('Brand')) continue;
        result.push({
          ...g,
          line: 'brand',
          cat: g.brand || 'Brand', // subcategoria = nome da coleção
          items: g.items.map(it => applyOverride(it, g.brand))
        });
      }
    }
    return result;
  }
  const lines = gSel === 'Todos' ? genderOrder : [gSel.toLowerCase()];
  const result = [];
  for (const line of lines) {
    for (const g of (DATA[line] || [])) {
      result.push({
        ...g,
        line,
        items: g.items.map(it => applyOverride(it, g.brand))
      });
    }
  }
  return result;
}

function cartKey(p) {
  return `${p.brand}|${p.nome}|${p.volume || ''}`;
}

function buildWaMessage(p) {
  let msg = 'Olá! Gostaria de *comprar* no *Empório A.R*:\n\n';
  msg += `*${p.nome}*\n`;
  msg += `Marca: ${p.brand || 'Empório A.R'}\n`;
  if (p.volume && p.volume !== '—' && !isVariacaoCatalogProduct(p)) msg += `Volume: ${p.volume}\n`;
  const variacao = p.variacaoSelecionada || getSelectedVariacao();
  if (variacao && variacao.nome) {
    msg += `Variação / Tamanho: *${variacao.nome}*\n`;
  }
  if (p.cat && isVariacaoCatalogProduct(p)) msg += `Categoria: ${p.cat}\n`;
  msg += `Varejo: *R$ ${p.varejo}*\n`;
  if (p.atacado && p.atacado !== '—') msg += `Atacado (6+): *R$ ${p.atacado}*\n`;
  msg += '\nPor favor, confirme *disponibilidade* e *formas de pagamento*. Obrigado!';
  return encodeURIComponent(msg);
}

function unitPrice(p, useAtacado) {
  if (useAtacado && p.atacado && p.atacado !== '—') return parsePrice(p.atacado);
  return parsePrice(p.varejo);
}

function formatBRL(n) {
  return n.toFixed(2).replace('.', ',');
}

function getCartMeta() {
  const nome = (document.getElementById('cartClientName')?.value || '').trim();
  const obs = (document.getElementById('cartObs')?.value || '').trim();
  const prefer = document.querySelector('input[name="cartPricePref"]:checked')?.value || 'auto';
  return { nome, obs, prefer };
}

function buildCartWaMessage() {
  const totalItens = cartTotalQty();
  const meta = getCartMeta();
  let useAtacado = totalItens >= 6;
  if (meta.prefer === 'varejo') useAtacado = false;
  if (meta.prefer === 'atacado') useAtacado = true;
  const modo = useAtacado ? 'ATACADO (6+ itens)' : 'VAREJO';
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  let msg = 'Olá! Gostaria de *confirmar o pedido* no *Empório A.R*.\n\n';
  msg += `📅 ${dataHora}\n`;
  if (meta.nome) msg += `👤 Cliente: *${meta.nome}*\n`;
  msg += `📋 Tabela: *${modo}*\n`;
  msg += '────────────────\n';
  let total = 0;
  cart.forEach((p, i) => {
    const unit = unitPrice(p, useAtacado);
    const sub = unit * p.qty;
    total += sub;
    msg += `*${i + 1}. ${p.nome}*\n`;
    msg += `   Marca: ${p.brand || 'Empório A.R'}\n`;
    if (p.variacaoNome) msg += `   Variação: *${p.variacaoNome}*\n`;
    else if (p.volume && p.volume !== '—') msg += `   Volume: ${p.volume}\n`;
    if (p.cat) msg += `   Categoria: ${p.cat}\n`;
    msg += `   Qtd: *${p.qty}* × R$ ${formatBRL(unit)} = *R$ ${formatBRL(sub)}*\n`;
  });
  msg += '────────────────\n';
  msg += `*Itens: ${totalItens}*\n`;
  msg += `*Total: R$ ${formatBRL(total)}*\n`;
  if (meta.obs) msg += `\n📝 Obs.: ${meta.obs}\n`;
  msg += '\nPor favor, confirme *disponibilidade* e *formas de pagamento*. Obrigado!';
  return encodeURIComponent(msg);
}

function openWhatsApp(p) {
  if (!isAvailable(p)) {
    alert('Este produto está esgotado no momento.');
    return;
  }
  if (isVariacaoCatalogProduct(p)) {
    const vars = Array.isArray(p.variacoes) ? p.variacoes : [];
    const hasAvailable = vars.some(v => (Number(v.estoque) || 0) > 0);
    if (vars.length && hasAvailable) {
      const sel = p.variacaoSelecionada || getSelectedVariacao();
      if (!sel || !sel.nome) {
        alert('Selecione o tamanho / variação antes de comprar.');
        document.getElementById('variacoesBox')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      p.variacaoSelecionada = sel;
    }
  }
  window.open(`https://wa.me/${WHATSAPP}?text=${buildWaMessage(p)}`, '_blank');
}

function addToCart(p, qty = 1) {
  if (!isAvailable(p)) {
    alert('Este produto está esgotado no momento.');
    return;
  }
  let variacao = null;
  if (isVariacaoCatalogProduct(p)) {
    const vars = Array.isArray(p.variacoes) ? p.variacoes : [];
    const hasAvailable = vars.some(v => (Number(v.estoque) || 0) > 0);
    if (vars.length && hasAvailable) {
      variacao = p.variacaoSelecionada || getSelectedVariacao();
      if (!variacao || !variacao.nome) {
        alert('Selecione o tamanho / variação antes de adicionar ao carrinho.');
        document.getElementById('variacoesBox')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      p.variacaoSelecionada = variacao;
    }
  }
  const key = cartKey(p) + (variacao ? '|' + variacao.nome : '');
  const existing = cart.find(c => (cartKey(c) + (c.variacaoNome ? '|' + c.variacaoNome : '')) === key);
  if (existing) existing.qty += qty;
  else cart.push({
    nome: p.nome,
    brand: p.brand,
    volume: p.volume,
    varejo: p.varejo,
    atacado: p.atacado,
    disponivel: p.disponivel || 'Sim',
    qty,
    variacaoNome: variacao ? variacao.nome : '',
    cat: p.cat || ''
  });
  updateCartUI();
}

function setCartQty(index, qty) {
  if (qty < 1) cart.splice(index, 1);
  else cart[index].qty = qty;
  updateCartUI();
  if (document.getElementById('cartModal').classList.contains('open')) renderCart();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartUI();
  if (document.getElementById('cartModal').classList.contains('open')) renderCart();
}

function cartTotalQty() {
  return cart.reduce((s, p) => s + p.qty, 0);
}

function updateCartUI() {
  const fab = document.getElementById('cartFab');
  const count = document.getElementById('cartCount');
  const total = cartTotalQty();
  if (total > 0) {
    fab.style.display = 'flex';
    count.textContent = total;
  } else fab.style.display = 'none';
  persistCart();
}

function renderCart() {
  const list = document.getElementById('cartList');
  const empty = document.getElementById('cartEmpty');
  const checkout = document.getElementById('cartCheckout');
  if (!cart.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    checkout.style.display = 'none';
    const form = document.getElementById('cartForm');
    if (form) form.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  checkout.style.display = 'block';
  const form = document.getElementById('cartForm');
  if (form) form.style.display = 'block';

  const totalItens = cartTotalQty();
  const useAtacado = totalItens >= 6;
  let total = 0;

  const itemsHtml = cart.map((p, i) => {
    const unit = unitPrice(p, useAtacado);
    const sub = unit * p.qty;
    total += sub;
    const label = useAtacado ? 'Atacado' : 'Varejo';
    return `
    <div class="cart-item">
      <div class="cart-item-info">
        <strong>${p.nome}</strong><br>
        <span style="color:var(--muted);font-size:.78rem">${p.brand} · ${p.volume || '—'} · ${label}: R$ ${formatBRL(unit)}</span>
        <div class="cart-qty">
          <button type="button" data-qty-minus="${i}" aria-label="Diminuir">−</button>
          <span>${p.qty}</span>
          <button type="button" data-qty-plus="${i}" aria-label="Aumentar">+</button>
        </div>
        <div style="font-size:.78rem;margin-top:.25rem">Subtotal: R$ ${formatBRL(sub)}</div>
      </div>
      <button type="button" data-remove="${i}">Remover</button>
    </div>`;
  }).join('');

  const modeHtml = useAtacado
    ? '<div class="cart-mode">✓ Preços de ATACADO (6+ itens)</div>'
    : `<div class="cart-mode" style="color:var(--muted)">Varejo — adicione mais ${6 - totalItens} item(ns) para preço de atacado</div>`;

  list.innerHTML = modeHtml + itemsHtml + `
    <div class="cart-total">
      <div>Itens: ${totalItens}</div>
      <strong>Total: R$ ${formatBRL(total)}</strong>
    </div>`;

  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.remove)));
  });
  list.querySelectorAll('[data-qty-minus]').forEach(btn => {
    btn.addEventListener('click', () => setCartQty(Number(btn.dataset.qtyMinus), cart[Number(btn.dataset.qtyMinus)].qty - 1));
  });
  list.querySelectorAll('[data-qty-plus]').forEach(btn => {
    btn.addEventListener('click', () => setCartQty(Number(btn.dataset.qtyPlus), cart[Number(btn.dataset.qtyPlus)].qty + 1));
  });
}


/** Gestos: descer fecha | lateral troca produto */
function initSwipeToClose() {
  const overlay = document.getElementById('modal');
  if (!overlay || overlay.dataset.swipeReady) return;
  overlay.dataset.swipeReady = '1';
  const modal = overlay.querySelector('.modal');
  if (!modal) return;

  let startY = 0, startX = 0, curY = 0, curX = 0, dragging = false, mode = null;

  const resetStyle = () => {
    modal.style.transition = '';
    modal.style.transform = '';
    modal.style.opacity = '';
    overlay.style.background = '';
  };

  const onStart = (y, x) => {
    if (!overlay.classList.contains('open')) return;
    startY = y; startX = x; curY = 0; curX = 0; mode = null; dragging = true;
    modal.style.transition = 'none';
  };

  const onMove = (y, x) => {
    if (!dragging) return;
    const dy = y - startY;
    const dx = x - startX;
    if (!mode) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      mode = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
      if (mode === 'v' && modal.scrollTop > 8) { dragging = false; return; }
    }
    if (mode === 'v') {
      if (dy < 0) return;
      curY = dy;
      const p = Math.min(dy / 280, 1);
      modal.style.transform = `translateY(${dy}px) scale(${1 - p * 0.03})`;
      modal.style.opacity = String(1 - p * 0.35);
      overlay.style.background = `rgba(0,0,0,${0.55 * (1 - p * 0.7)})`;
    } else if (mode === 'h') {
      curX = dx;
      const p = Math.min(Math.abs(dx) / 220, 1);
      modal.style.transform = `translateX(${dx}px)`;
      modal.style.opacity = String(1 - p * 0.2);
    }
  };

  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    modal.style.transition = 'transform .28s ease, opacity .28s ease';
    if (mode === 'v' && curY > 100) {
      resetStyle();
      closeModal();
      try { if (history.state && history.state.emporioModal) history.back(); } catch (e) {}
    } else if (mode === 'h' && Math.abs(curX) > 70 && detailsNavList.length > 1 && detailsNavIndex >= 0) {
      const goingLeft = curX < 0;
      const next = goingLeft ? detailsNavIndex + 1 : detailsNavIndex - 1;
      if (next >= 0 && next < detailsNavList.length) {
        resetStyle();
        showDetailsAt(next, goingLeft ? 'left' : 'right');
      } else {
        resetStyle();
      }
    } else {
      resetStyle();
    }
    mode = null; curY = 0; curX = 0;
  };

  modal.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    onStart(e.touches[0].clientY, e.touches[0].clientX);
  }, { passive: true });
  modal.addEventListener('touchmove', (e) => {
    if (!dragging || e.touches.length !== 1) return;
    onMove(e.touches[0].clientY, e.touches[0].clientX);
  }, { passive: true });
  modal.addEventListener('touchend', onEnd, { passive: true });
  modal.addEventListener('touchcancel', onEnd, { passive: true });
}


/** Lista plana dos produtos visíveis (para deslize lateral nos detalhes) */
let detailsNavList = [];
let detailsNavIndex = -1;

function buildDetailsNavList() {
  const list = [];
  const groups = allGroups();
  for (const g of groups) {
    if (state.category !== 'Todos' && g.cat !== state.category) continue;
    for (const item of g.items) {
      if (!inPriceRange(item.varejo)) continue;
      if (state.stock === 'Disponivel' && !isAvailable(item)) continue;
      if (state.stock === 'Esgotado' && isAvailable(item)) continue;
      if (!matchesSearch(item, g.brand, g.cat, state.search)) continue;
      if (state.volume !== 'Todos' && volumeBucket(item) !== state.volume) continue;
      list.push({
        nome: item.nome,
        brand: g.brand,
        volume: item.volume,
        varejo: item.varejo,
        atacado: item.atacado,
        foto: item.foto,
        fotos: item.fotos || (item.foto ? [item.foto] : []),
        notas: item.notas,
        disponivel: (lookupLiveStock(item, g.brand, g.cat) || item.disponivel || 'Sim'),
        badge: item.badge || '',
        line: g.line || '',
        cat: g.cat || '',
        fonte: item.fonte || '',
        id_origem: item.id_origem || '',
        url_origem: item.url_origem || '',
        variacoes: item.variacoes || [],
        total_estoque: item.total_estoque
      });
    }
  }
  // ordem aproximada da tela (Scoop fixo se categoria)
  return list;
}

function showDetailsAt(index, direction) {
  if (index < 0 || index >= detailsNavList.length) return;
  const overlay = document.getElementById('modal');
  const modal = overlay && overlay.querySelector('.modal');
  detailsNavIndex = index;
  if (modal && direction) {
    const body = modal.querySelector('.modal-body') || modal;
    body.style.transition = 'opacity .18s ease, transform .22s ease';
    body.style.opacity = '0';
    body.style.transform = direction === 'left' ? 'translateX(-18px)' : 'translateX(18px)';
    setTimeout(() => {
      openDetails(detailsNavList[index], { fromNav: true });
      body.style.transition = 'none';
      body.style.transform = direction === 'left' ? 'translateX(18px)' : 'translateX(-18px)';
      void body.offsetWidth;
      body.style.transition = 'opacity .22s ease, transform .26s cubic-bezier(.22,1,.36,1)';
      body.style.opacity = '1';
      body.style.transform = 'translateX(0)';
    }, 160);
  } else {
    openDetails(detailsNavList[index], { fromNav: true });
  }
}


function isRoupasProduct(p) {
  return (p.line || '').toLowerCase() === 'roupas' || (p.fonte || '') === 'roupas' || (p.fonte || '') === 'sophiamoda';
}
function isAcessoriosProduct(p) {
  return (p.line || '').toLowerCase() === 'acessorios' || (p.fonte || '') === 'acessorios' || (p.fonte || '') === 'dande';
}
/** Produtos com descrição + variações + galeria (Roupas e Acessórios) */
function isVariacaoCatalogProduct(p) {
  return isRoupasProduct(p) || isAcessoriosProduct(p);
}

function absSophiaImg(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  // caminhos relativos vindos da Sophia/FacilZap
  return 'https://arquivos-cdn.facilzap.app.br/' + s.replace(/^\//, '');
}

function buildPhotoGallery(p) {
  const raw = Array.isArray(p.fotos) && p.fotos.length
    ? p.fotos
    : (p.foto ? [p.foto] : []);
  const fotos = raw.map(absSophiaImg).filter(Boolean);
  if (!fotos.length) {
    return { html: 'SEM FOTO', isEmpty: true, fotos: [] };
  }
  const main = fotos[0];
  const multi = fotos.length > 1;
  const thumbs = fotos.map((src, i) =>
    `<button type="button" class="gallery-thumb${i === 0 ? ' active' : ''}" data-idx="${i}" data-src="${src}" aria-label="Foto ${i + 1}">
      <img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display='none'">
    </button>`
  ).join('');
  const html = `
    <div class="gallery" data-count="${fotos.length}">
      <div class="gallery-main">
        ${multi ? `<button type="button" class="gallery-nav gallery-prev" aria-label="Foto anterior">‹</button>` : ''}
        <img id="galleryMainImg" src="${main}" alt="${(p.nome || '').replace(/"/g, '&quot;')}" loading="eager" referrerpolicy="no-referrer"
          onerror="this.onerror=null;this.parentElement.parentElement.classList.add('no-img');this.parentElement.innerHTML='SEM FOTO'">
        ${multi ? `<button type="button" class="gallery-nav gallery-next" aria-label="Próxima foto">›</button>` : ''}
        ${multi ? `<span class="gallery-counter" id="galleryCounter">1 / ${fotos.length}</span>` : ''}
      </div>
      ${multi ? `<div class="gallery-thumbs">${thumbs}</div>` : ''}
    </div>`;
  return { html, isEmpty: false, fotos };
}

function bindPhotoGallery(photoEl, fotos) {
  if (!photoEl || !fotos || fotos.length < 2) return;
  let idx = 0;
  const mainImg = photoEl.querySelector('#galleryMainImg');
  const counter = photoEl.querySelector('#galleryCounter');
  const thumbs = () => Array.from(photoEl.querySelectorAll('.gallery-thumb'));

  const show = (i) => {
    idx = (i + fotos.length) % fotos.length;
    if (mainImg) mainImg.src = fotos[idx];
    if (counter) counter.textContent = `${idx + 1} / ${fotos.length}`;
    thumbs().forEach((t, ti) => t.classList.toggle('active', ti === idx));
    const active = thumbs()[idx];
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  };

  photoEl.querySelector('.gallery-prev')?.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    show(idx - 1);
  });
  photoEl.querySelector('.gallery-next')?.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    show(idx + 1);
  });
  // toque/clique na foto principal também avança
  mainImg?.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    show(idx + 1);
  });
  thumbs().forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const i = Number(btn.getAttribute('data-idx') || 0);
      show(i);
    });
  });

  // swipe simples
  let startX = 0;
  const main = photoEl.querySelector('.gallery-main');
  main?.addEventListener('touchstart', (e) => {
    startX = e.changedTouches[0].screenX;
  }, { passive: true });
  main?.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].screenX - startX;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) show(idx + 1);
    else show(idx - 1);
  }, { passive: true });
}

function buildVariacoesHtml(p, selectedId) {
  const vars = Array.isArray(p.variacoes) ? p.variacoes : [];
  if (!vars.length) return '';
  const chips = vars.map(v => {
    const qty = Number(v.estoque) || 0;
    const ok = qty > 0;
    const id = String(v.id || v.nome || '');
    const sel = selectedId != null && String(selectedId) === id ? ' selected' : '';
    const disabled = ok ? '' : ' disabled';
    const label = (v.nome || '—').replace(/</g, '&lt;');
    const stock = ok ? `${qty} un.` : 'Esgotado';
    return `<button type="button" class="var-chip${sel}${ok ? '' : ' var-chip-out'}" data-var-id="${id}" data-var-nome="${label}" data-var-estoque="${qty}"${disabled}>
      <span class="var-chip-name">${label}</span>
      <span class="var-chip-stock">${stock}</span>
    </button>`;
  }).join('');
  return `<div class="variacoes-box" id="variacoesBox">
    <strong>Escolha o tamanho / variação</strong>
    <div class="var-chips">${chips}</div>
    <p class="var-hint" id="varHint">Selecione uma opção disponível para comprar</p>
  </div>`;
}

function getSelectedVariacao() {
  const box = document.getElementById('variacoesBox');
  if (!box) return null;
  const sel = box.querySelector('.var-chip.selected');
  if (!sel) return null;
  return {
    id: sel.getAttribute('data-var-id') || '',
    nome: sel.getAttribute('data-var-nome') || '',
    estoque: Number(sel.getAttribute('data-var-estoque') || 0)
  };
}

function bindVariacaoSelector() {
  const box = document.getElementById('variacoesBox');
  if (!box) return;
  box.querySelectorAll('.var-chip:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      box.querySelectorAll('.var-chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const hint = document.getElementById('varHint');
      if (hint) {
        hint.textContent = 'Selecionado: ' + (btn.getAttribute('data-var-nome') || '');
        hint.classList.add('ok');
      }
      if (currentProduct) {
        currentProduct.variacaoSelecionada = {
          id: btn.getAttribute('data-var-id') || '',
          nome: btn.getAttribute('data-var-nome') || '',
          estoque: Number(btn.getAttribute('data-var-estoque') || 0)
        };
      }
    });
  });
}

function openDetails(p, opts = {}) {
  const live = lookupLiveStock(p, p.brand, p.cat);
  if (live) p = { ...p, disponivel: live };
  currentProduct = p;
  if (!opts.fromNav) {
    detailsNavList = buildDetailsNavList();
    detailsNavIndex = detailsNavList.findIndex(
      x => x.nome === p.nome && x.brand === p.brand && (x.volume || '') === (p.volume || '')
    );
  }
  const overlay = document.getElementById('modal');
  overlay.classList.remove('closing');
  const avail = isAvailable(p);
  const isScoop = (p.badge === 'Scoop') || (p.nome || '').toLowerCase().includes('scoop');
  const roupas = isRoupasProduct(p);
  const acessorios = isAcessoriosProduct(p);
  const varCatalog = isVariacaoCatalogProduct(p);

  document.getElementById('modalName').textContent = p.nome;
  document.getElementById('modalMeta').textContent =
    `${p.brand || 'Empório A.R'}${p.volume && p.volume !== '—' && !isScoop && !varCatalog ? ' · ' + p.volume : ''}${varCatalog && p.cat ? ' · ' + p.cat : ''} · ${avail ? 'Disponível' : 'ESGOTADO'}`;
  document.getElementById('modalVarejo').textContent = p.varejo ? `R$ ${p.varejo}` : '—';
  document.getElementById('modalAtacado').textContent = p.atacado && p.atacado !== '—' ? `R$ ${p.atacado}` : '—';

  const photo = document.getElementById('modalPhoto');
  if (isScoop) {
    photo.style.display = 'none';
    photo.innerHTML = '';
  } else {
    photo.style.display = '';
    photo.classList.remove('no-img');
    const gallery = buildPhotoGallery(p);
    if (gallery.isEmpty) {
      photo.classList.add('no-img');
      photo.innerHTML = 'SEM FOTO';
    } else {
      photo.innerHTML = gallery.html;
      bindPhotoGallery(photo, gallery.fotos || []);
    }
  }

  // Descrição / Notas + variações (Roupas)
  const notasEl = document.getElementById('modalNotas');
  let notasHtml = '';
  if (p.notas) {
    const titulo = (varCatalog || isScoop) ? 'Descrição' : 'Notas olfativas';
    notasHtml += `<strong>${titulo}</strong><br>${String(p.notas).replace(/\n/g, '<br>')}`;
  }
  if (varCatalog) {
    notasHtml += buildVariacoesHtml(p);
  }
  if (notasHtml) {
    notasEl.style.display = 'block';
    notasEl.innerHTML = notasHtml;
  } else {
    notasEl.style.display = 'none';
    notasEl.innerHTML = '';
  }

  // seletor de variação (Roupas / Acessórios)
  if (varCatalog) {
    p.variacaoSelecionada = null;
    bindVariacaoSelector();
  }

  // Estoque ao vivo
  if (roupas && p.id_origem) {
    refreshRoupasStock(p).catch(() => {});
  } else if (acessorios && p.id_origem) {
    refreshDandeStock(p).catch(() => {});
  }

  const btnAdd = document.getElementById('modalAddCart');
  const btnBuy = document.getElementById('modalBuy');
  const btnShare = document.getElementById('modalShare');
  if (btnShare) {
    btnShare.disabled = false;
    btnShare.onclick = () => shareProduct(p);
  }
  if (avail) {
    btnAdd.disabled = false;
    btnAdd.classList.remove('btn-disabled');
    btnAdd.textContent = '🛒 Adicionar ao carrinho';
    btnBuy.disabled = false;
    btnBuy.classList.remove('btn-disabled');
    btnBuy.textContent = '📲 Comprar no WhatsApp';
  } else {
    btnAdd.disabled = true;
    btnAdd.classList.add('btn-disabled');
    btnAdd.textContent = 'Esgotado — indisponível';
    btnBuy.disabled = true;
    btnBuy.classList.add('btn-disabled');
    btnBuy.textContent = 'Esgotado — indisponível';
  }
  const ov = document.getElementById('modal');
  setProductUrl(p);
  if (opts.fromNav) {
    ov.classList.remove('closing');
    ov.classList.add('open');
  } else {
    ov.classList.remove('closing', 'open');
    void ov.offsetWidth;
    requestAnimationFrame(() => ov.classList.add('open'));
    try {
      if (!history.state || !history.state.emporioModal) {
        history.pushState({ emporioModal: true }, '');
      }
    } catch (e) {}
  }
}

/** Atualiza estoque/variações de Roupas via proxy Netlify (se disponível) */
async function refreshRoupasStock(p) {
  if (!p || !p.id_origem) return;
  try {
    const metaEl = document.getElementById('modalMeta');
    const metaPrev = metaEl ? metaEl.textContent : '';
    if (metaEl && currentProduct && currentProduct.id_origem === p.id_origem) {
      metaEl.textContent = (metaPrev || '') + ' · atualizando estoque…';
    }
    const url = `/api/roupas-stock?id=${encodeURIComponent(p.id_origem)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      if (metaEl && metaPrev) metaEl.textContent = metaPrev;
      return;
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.variacoes)) {
      if (metaEl && metaPrev) metaEl.textContent = metaPrev;
      return;
    }

    // Atualiza produto atual se ainda estiver aberto
    if (currentProduct && currentProduct.id_origem === p.id_origem) {
      currentProduct.variacoes = data.variacoes;
      currentProduct.total_estoque = data.total_estoque;
      currentProduct.disponivel = (data.total_estoque > 0) ? 'Sim' : 'Não';

      const notasEl = document.getElementById('modalNotas');
      if (notasEl) {
        let html = '';
        if (currentProduct.notas) {
          html += `<strong>Descrição</strong><br>${String(currentProduct.notas).replace(/\n/g, '<br>')}`;
        }
        const prevSel = currentProduct.variacaoSelecionada?.id || null;
        html += buildVariacoesHtml(currentProduct, prevSel);
        if (html) {
          notasEl.style.display = 'block';
          notasEl.innerHTML = html;
          bindVariacaoSelector();
        }
      }

      const avail = isAvailable(currentProduct);
      document.getElementById('modalMeta').textContent =
        `${currentProduct.brand || 'Empório A.R'}${currentProduct.cat ? ' · ' + currentProduct.cat : ''} · ${avail ? 'Disponível' : 'ESGOTADO'}`;
    }
  } catch (e) {
    // silencioso — mantém snapshot
  }
}

/** Atualiza estoque/variações de Acessórios (Dande) via proxy Netlify */
async function refreshDandeStock(p) {
  if (!p || !p.id_origem) return;
  try {
    const metaEl = document.getElementById('modalMeta');
    const metaPrev = metaEl ? metaEl.textContent : '';
    if (metaEl && currentProduct && currentProduct.id_origem === p.id_origem) {
      metaEl.textContent = (metaPrev || '') + ' · atualizando estoque…';
    }
    let url = `/api/dande-stock?id=${encodeURIComponent(p.id_origem)}`;
    if (p.url_origem) url += `&url=${encodeURIComponent(p.url_origem)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      if (metaEl && metaPrev) metaEl.textContent = metaPrev;
      return;
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.variacoes)) {
      if (metaEl && metaPrev) metaEl.textContent = metaPrev;
      return;
    }

    if (currentProduct && currentProduct.id_origem === p.id_origem) {
      currentProduct.variacoes = data.variacoes;
      currentProduct.total_estoque = data.total_estoque;
      currentProduct.disponivel = (data.total_estoque > 0) ? 'Sim' : 'Não';

      const notasEl = document.getElementById('modalNotas');
      if (notasEl) {
        let html = '';
        if (currentProduct.notas) {
          html += `<strong>Descrição</strong><br>${String(currentProduct.notas).replace(/\n/g, '<br>')}`;
        }
        const prevSel = currentProduct.variacaoSelecionada?.id || null;
        html += buildVariacoesHtml(currentProduct, prevSel);
        if (html) {
          notasEl.style.display = 'block';
          notasEl.innerHTML = html;
          bindVariacaoSelector();
        }
      }

      const avail = isAvailable(currentProduct);
      document.getElementById('modalMeta').textContent =
        `${currentProduct.brand || 'Empório A.R'}${currentProduct.cat ? ' · ' + currentProduct.cat : ''} · ${avail ? 'Disponível' : 'ESGOTADO'}`;
    }
  } catch (e) {
    // silencioso
  }
}



function closeModal() {
  const overlay = document.getElementById('modal');
  if (!overlay.classList.contains('open')) return;
  overlay.classList.add('closing');
  const done = () => {
    overlay.classList.remove('open', 'closing');
    currentProduct = null;
    setProductUrl(null);
  };
  setTimeout(done, 380);
}



function collectFeatured(limit = 12) {
  const out = [];
  const seen = new Set();
  for (const g of allGroups()) {
    for (const raw of g.items || []) {
      const item = validateProductPrices(raw);
      if (!isAvailable(item)) continue;
      if (!isLancamentoItem(item, g.cat) && !(item.badge && String(item.badge).toLowerCase().includes('scoop'))) {
        // allow acessorios Lançamentos only or scoop
        if (!isLancamentoItem(item, g.cat)) continue;
      }
      const key = `${g.brand}|${item.nome}|${item.volume || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        ...item,
        brand: g.brand,
        cat: g.cat,
        line: g.line,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function buildFeaturedHtml() {
  // só na home (sem busca / filtros fechados)
  if (state.search.trim()) return '';
  if (state.gender !== 'Todos' && state.gender.toLowerCase() !== 'todos') return '';
  if (state.category !== 'Todos') return '';
  if (state.vitrine === 'Destaques') {
    /* show only via filter */ 
  }
  const items = collectFeatured(12);
  if (!items.length) return '';
  const cards = items.map((item) => {
    const pdata = encodeURIComponent(JSON.stringify({
      nome: item.nome,
      brand: item.brand,
      volume: item.volume,
      varejo: item.varejo,
      atacado: item.atacado,
      foto: item.foto,
      fotos: item.fotos || (item.foto ? [item.foto] : []),
      notas: item.notas,
      disponivel: item.disponivel || 'Sim',
      badge: item.badge || '',
      line: item.line || '',
      cat: item.cat || '',
      fonte: item.fonte || '',
      id_origem: item.id_origem || '',
      url_origem: item.url_origem || '',
      variacoes: item.variacoes || [],
      total_estoque: item.total_estoque
    }));
    const foto = item.foto || '';
    return `<button type="button" class="feat-card" data-p="${pdata}">
      ${foto ? `<img src="${foto}" alt="" loading="lazy" referrerpolicy="no-referrer"/>` : '<div class="feat-ph">SEM FOTO</div>'}
      <span class="feat-name">${item.nome}</span>
      <span class="feat-price">R$ ${item.varejo}</span>
    </button>`;
  }).join('');
  return `<section class="featured-strip" aria-label="Lançamentos">
    <div class="featured-head">
      <h2>✨ Lançamentos</h2>
      <button type="button" class="fbtn" id="btnVerLancamentos">Ver todos</button>
    </div>
    <div class="featured-row">${cards}</div>
  </section>`;
}


function render() {
  if (state.category !== 'Todos' && !sectionActive(state.category)) {
    state.category = 'Todos';
  }
  const q = state.search.trim().toLowerCase();
  const groups = allGroups();
  let count = 0;
  const byCat = {};

  for (const g of groups) {
    if (!sectionActive(g.cat)) continue;
    if (state.category !== 'Todos' && g.cat !== state.category) continue;
    const items = g.items.filter(item => {
      if (!inPriceRange(item.varejo)) return false;
      if (state.stock === 'Disponivel' && !isAvailable(item)) return false;
      if (state.stock === 'Esgotado' && isAvailable(item)) return false;
      if (!matchesSearch(item, g.brand, g.cat, state.search)) return false;
      if (state.volume !== 'Todos' && volumeBucket(item) !== state.volume) return false;
      if (state.vitrine === 'Lancamentos' && !isLancamentoItem(item, g.cat)) return false;
      return true;
    });
    if (!items.length) continue;
    if (!byCat[g.cat]) byCat[g.cat] = [];
    byCat[g.cat].push({ brand: g.brand, line: g.line, items });
    count += items.length;
  }

  document.getElementById('stats').textContent = count + ' produto(s)';
  const main = document.getElementById('catalog');
  if (!count) {
    main.innerHTML = '<div class="empty"><strong>Nenhum produto encontrado</strong>Tente outro termo ou limpe os filtros.</div>';
    return;
  }

  const catKeys = Object.keys(byCat).sort((a, b) => {
    if (a === 'Perfumes') return -1;
    if (b === 'Perfumes') return 1;
    return a.localeCompare(b, 'pt-BR');
  });

  let html = '';
  for (const cat of catKeys) {
    const brands = byCat[cat];
    const lines = brands.map(b => b.line);
    const lineClass = cat === 'Scoop Premiado' ? 'cat-scoop'
      : String(state.gender || '').toLowerCase() === 'brand' ? 'cat-brand'
      : state.gender === 'Feminino' ? 'cat-fem'
      : state.gender === 'Unissex' ? 'cat-uni'
      : state.gender === 'Masculino' ? 'cat-masc'
      : lines[0] === 'feminino' ? 'cat-fem'
      : lines[0] === 'unissex' ? 'cat-uni'
      : lines[0] === 'brand' ? 'cat-brand'
      : 'cat-masc';

    const catTitle = (cat === 'Brand')
      ? (sectionDisplayName(cat) === cat ? 'Brand Collection' : sectionDisplayName(cat))
      : sectionDisplayName(cat);
    html += `<div class="category ${lineClass}${cat === 'Brand' ? ' cat-brand' : ''}"><div class="category-title">${catTitle}</div>`;
    brands.sort((a, b) => a.brand.localeCompare(b.brand, 'pt-BR'));

    for (const b of brands) {
      let sortedItems = sortItems(b.items, b.brand);
      if (cat === 'Scoop Premiado') {
        const SO = { 'scoop cobre': 1, 'scoop bronze': 2, 'scoop prata': 3, 'scoop ouro': 4, 'scoop diamante': 5 };
        sortedItems = [...b.items].sort((a, b) => (SO[(a.nome || '').toLowerCase()] || 99) - (SO[(b.nome || '').toLowerCase()] || 99));
      }
      html += `<div class="brand-group"><div class="brand-name">${b.brand}</div><div class="products">`;

      for (const rawItem of sortedItems) {
        const item = validateProductPrices(rawItem);
        const avail = isAvailable(item);
        const isScoop = (item.badge === 'Scoop') || (item.nome || '').toLowerCase().includes('scoop');
        const varejoShow = item.varejo ? `R$ ${item.varejo}` : '—';
        const atacadoShow = item.atacado && item.atacado !== '—' ? `R$ ${item.atacado}` : '—';
        const pdata = encodeURIComponent(JSON.stringify({
          nome: item.nome,
          brand: b.brand,
          volume: item.volume,
          varejo: item.varejo,
          atacado: item.atacado,
          foto: item.foto,
          fotos: item.fotos || (item.foto ? [item.foto] : []),
          notas: item.notas,
          disponivel: (lookupLiveStock(item, b.brand, cat) || item.disponivel || 'Sim'),
          badge: item.badge || '',
          line: b.line || '',
          cat: cat || item.cat || '',
          fonte: item.fonte || '',
          id_origem: item.id_origem || '',
          url_origem: item.url_origem || '',
          variacoes: item.variacoes || [],
          total_estoque: item.total_estoque
        }));
        const fotoCard = absSophiaImg(item.foto);
        const photoHtml = isScoop
          ? ''
          : (fotoCard
            ? `<div class="photo photo-click loaded" role="button" tabindex="0" data-p="${pdata}" title="Ver detalhes"><img src="${fotoCard}" alt="${item.nome}" width="80" height="80" decoding="async" referrerpolicy="no-referrer" loading="lazy" onload="this.classList.add('is-loaded');this.parentElement.classList.add('loaded')" onerror="this.onerror=null;this.style.opacity='0.3';this.parentElement.classList.add('placeholder')"></div>`
            : `<div class="photo placeholder photo-click" role="button" tabindex="0" data-p="${pdata}" title="Ver detalhes">SEM<br>FOTO</div>`);
        const badgeEsg = avail ? '' : '<span class="badge-esgotado">ESGOTADO</span>';
        const cardClass = avail ? 'card' : 'card esgotado';
        const stockHtml = avail
          ? '<span class="stock-label stock-ok">Disponível</span>'
          : '<span class="stock-label stock-out">Esgotado</span>';
        const addBtn = avail
          ? `<button class="btn-sm btn-add" data-p="${pdata}">Adicionar ao carrinho</button>`
          : `<button class="btn-sm btn-add btn-disabled" disabled>Esgotado</button>`;
        const buyBtn = avail
          ? `<button class="btn-sm btn-buy" data-p="${pdata}">Comprar</button>`
          : `<button class="btn-sm btn-buy btn-disabled" disabled>Esgotado</button>`;

        html += `
          <div class="${cardClass}">
            ${badgeEsg}
            ${photoHtml}
            <div class="info">
              <div class="name">${item.nome}</div>
              <div class="meta">${item.volume || '—'} · ${stockHtml}</div>
              <div class="prices">
                <div><span class="price-label">Varejo</span><span class="price-v">${varejoShow}</span></div>
                <div><span class="price-label">Atacado</span><span class="price-a">${atacadoShow}</span></div>
              </div>
              <div class="card-actions">
                <button class="btn-sm btn-details" data-p="${pdata}">Detalhes</button>
                ${addBtn}
                ${buyBtn}
              </div>
            </div>
          </div>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
  }
  main.innerHTML = buildFeaturedHtml() + html;
  main.querySelectorAll('.feat-card').forEach(btn => {
    btn.addEventListener('click', () => {
      try { openDetails(JSON.parse(decodeURIComponent(btn.getAttribute('data-p')))); } catch (e) {}
    });
  });
  const btnLanc = document.getElementById('btnVerLancamentos');
  if (btnLanc) {
    btnLanc.addEventListener('click', () => {
      state.vitrine = 'Lancamentos';
      document.querySelectorAll('#vitrineFilters .fbtn').forEach(b => b.classList.toggle('active', b.dataset.value === 'Lancamentos'));
      render();
    });
  }
main.querySelectorAll('.btn-details, .photo-click').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        openDetails(JSON.parse(decodeURIComponent(el.dataset.p)));
      } catch (err) { console.warn(err); }
    });
  });
  main.querySelectorAll('.btn-buy').forEach(btn => {
    btn.addEventListener('click', () => openWhatsApp(JSON.parse(decodeURIComponent(btn.dataset.p))));
  });
  main.querySelectorAll('.btn-add').forEach(btn => {
    btn.addEventListener('click', () => {
      addToCart(JSON.parse(decodeURIComponent(btn.dataset.p)));
      const prev = btn.textContent;
      btn.textContent = '✓ Adicionado';
      setTimeout(() => { btn.textContent = prev; }, 900);
    });
  });
}

function downloadCatalogPDF() {
  const rows = [];
  for (const line of ['feminino', 'masculino', 'unissex', 'roupas', 'acessorios']) {
    for (const g of (DATA[line] || [])) {
      for (const item of g.items) {
        rows.push({
          genero: line.charAt(0).toUpperCase() + line.slice(1),
          marca: g.brand,
          nome: item.nome,
          volume: item.volume || '—',
          varejo: item.varejo || '—',
          atacado: item.atacado || '—',
          status: (item.disponivel || 'Sim') === 'Sim' ? 'Disponível' : 'Esgotado'
        });
      }
    }
  }
  rows.sort((a, b) => a.marca.localeCompare(b.marca, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));

  let table = rows.map(r =>
    `<tr>
      <td>${r.marca}</td>
      <td>${r.nome}</td>
      <td>${r.volume}</td>
      <td>${r.genero}</td>
      <td>R$ ${r.varejo}</td>
      <td>R$ ${r.atacado}</td>
      <td>${r.status}</td>
    </tr>`
  ).join('');

  const htmlDoc = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Empório A.R — Catálogo</title>
<style>
  body { font-family: system-ui, sans-serif; font-size: 11px; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 16px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 5px 6px; text-align: left; }
  th { background: #1a1a1a; color: #f5d76e; font-size: 10px; }
  tr:nth-child(even) { background: #f9f9f9; }
  @media print { body { margin: 12px; } }
</style></head><body>
<h1>Empório A.R — Catálogo de Perfumes</h1>
<p>WhatsApp (62) 99113-4488 · ${rows.length} produtos · Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
<table>
<thead><tr><th>Marca</th><th>Produto</th><th>Volume</th><th>Gênero</th><th>Varejo</th><th>Atacado</th><th>Status</th></tr></thead>
<tbody>${table}</tbody>
</table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    alert('Permita pop-ups para gerar o PDF.');
    return;
  }
  w.document.write(htmlDoc);
  w.document.close();
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBack')?.addEventListener('click', () => {
  closeModal();
  try { if (history.state && history.state.emporioModal) history.back(); } catch (e) {}
});
window.addEventListener('popstate', () => {
  const overlay = document.getElementById('modal');
  if (overlay && overlay.classList.contains('open')) closeModal();
});
document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});
document.getElementById('modalBuy').addEventListener('click', () => {
  if (currentProduct) openWhatsApp(currentProduct);
});
document.getElementById('modalAddCart').addEventListener('click', () => {
  if (currentProduct) {
    addToCart(currentProduct);
    const btn = document.getElementById('modalAddCart');
    const prev = btn.textContent;
    btn.textContent = '✓ Adicionado ao carrinho';
    setTimeout(() => { btn.textContent = prev; }, 1000);
  }
});

document.getElementById('q').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value;
    render();
  }, 280);
});

document.getElementById('sortBy').addEventListener('change', e => {
  state.sort = e.target.value;
  render();
});

document.querySelectorAll('#genderFilters .fbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#genderFilters .fbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.gender = btn.dataset.value;
    state.category = 'Todos';
    updateCategoryFiltersForGender(state.gender);
    render();
  });
});

function updateCategoryFiltersForGender(gender) {
  const el = document.getElementById('categoryFilters');
  if (!el) return;
  const g = String(gender || '').toLowerCase();
  if (g === 'acessorios') {
    const cats = new Set();
    for (const group of (DATA.acessorios || [])) {
      if (group.cat) cats.add(group.cat);
    }
    const sorted = [...cats].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    let html = '<button class="fbtn active" data-filter="category" data-value="Todos">Todas categorias</button>';
    for (const c of sorted) {
      html += `<button class="fbtn" data-filter="category" data-value="${c}">${c}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('.fbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.category = btn.dataset.value;
        render();
      });
    });
  } else if (g === 'roupas') {
    const cats = new Set();
    for (const group of (DATA.roupas || [])) {
      if (group.cat) cats.add(group.cat);
    }
    const sorted = [...cats].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    let html = '<button class="fbtn active" data-filter="category" data-value="Todos">Todas categorias</button>';
    for (const c of sorted) {
      html += `<button class="fbtn" data-filter="category" data-value="${c}">${c}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('.fbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.category = btn.dataset.value;
        render();
      });
    });
  } else if (g === 'brand') {
    const cats = new Set();
    for (const line of ['masculino', 'feminino', 'unissex']) {
      for (const group of (DATA[line] || [])) {
        const cat = group.cat || '';
        if (cat === 'Brand' || String(cat).startsWith('Brand')) {
          if (group.brand) cats.add(group.brand);
        }
      }
    }
    const sorted = [...cats].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    let html = '<button class="fbtn active" data-filter="category" data-value="Todos">Todas categorias</button>';
    for (const c of sorted) {
      const safe = String(c).replace(/"/g, '&quot;');
      html += `<button class="fbtn" data-filter="category" data-value="${safe}">${safe}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('.fbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.category = btn.dataset.value;
        render();
      });
    });
  } else {
    // filtros padrão de perfumes
    el.innerHTML = `
    <button class="fbtn active" data-filter="category" data-value="Todos">Todas</button>
    <button class="fbtn" data-filter="category" data-value="Perfumes">Perfumes</button>
    <button class="fbtn" data-filter="category" data-value="Miniaturas">Miniaturas</button>
    <button class="fbtn" data-filter="category" data-value="Óleos">Óleos</button>
    <button class="fbtn" data-filter="category" data-value="Outros">Outros</button>
    <button class="fbtn" data-filter="category" data-value="Scoop Premiado">Scoop Premiado</button>`;
    el.querySelectorAll('.fbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.category = btn.dataset.value;
        render();
      });
    });
  }
}

document.querySelectorAll('#categoryFilters .fbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#categoryFilters .fbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.category = btn.dataset.value;
    render();
  });
});
document.querySelectorAll('#priceFilters .fbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#priceFilters .fbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.price = btn.dataset.value;
    render();
  });
});
document.querySelectorAll('#volumeFilters .fbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#volumeFilters .fbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.volume = btn.dataset.value;
    render();
  });
});
document.querySelectorAll('#vitrineFilters .fbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#vitrineFilters .fbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.vitrine = btn.dataset.value;
    render();
  });
});
document.querySelectorAll('#stockFilters .fbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#stockFilters .fbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.stock = btn.dataset.value;
    render();
  });
});

document.getElementById('cartFab').addEventListener('click', () => {
  renderCart();
  document.getElementById('cartModal').classList.add('open');
});
document.getElementById('cartClose').addEventListener('click', () => {
  document.getElementById('cartModal').classList.remove('open');
});
document.getElementById('cartModal').addEventListener('click', e => {
  if (e.target.id === 'cartModal') document.getElementById('cartModal').classList.remove('open');
});
document.getElementById('cartCheckout').addEventListener('click', () => {
  if (!cart.length) return;
  window.open(`https://wa.me/${WHATSAPP}?text=${buildCartWaMessage()}`, '_blank');
});

document.getElementById('logoHome').addEventListener('click', e => {
  e.preventDefault();
  state.gender = 'Todos';
  state.category = 'Todos';
  state.price = 'Todos';
  state.stock = 'Todos';
  state.search = '';
  state.sort = 'nome-asc';
  state.volume = 'Todos';
  state.vitrine = 'Todos';
  document.getElementById('q').value = '';
  document.getElementById('sortBy').value = 'nome-asc';
  document.querySelectorAll('#genderFilters .fbtn').forEach(b => b.classList.toggle('active', b.dataset.value === 'Todos'));
  document.querySelectorAll('#categoryFilters .fbtn').forEach(b => b.classList.toggle('active', b.dataset.value === 'Todos'));
  document.querySelectorAll('#priceFilters .fbtn').forEach(b => b.classList.toggle('active', b.dataset.value === 'Todos'));
  document.querySelectorAll('#stockFilters .fbtn').forEach(b => b.classList.toggle('active', b.dataset.value === 'Todos'));
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});


function toggleAdmin() {
  const btnSec = document.getElementById('btnSections');
  if (isAdmin) {
    isAdmin = false;
    sessionStorage.removeItem(ADMIN_KEY);
    const b = document.getElementById('btnAdmin');
    if (b) b.textContent = 'Admin';
    if (btnSec) btnSec.style.display = 'none';
    render();
    return;
  }
  const pass = prompt('Senha do Admin:');
  if (pass === ADMIN_PASS) {
    isAdmin = true;
    sessionStorage.setItem(ADMIN_KEY, '1');
    const b = document.getElementById('btnAdmin');
    if (b) b.textContent = 'Sair Admin';
    if (btnSec) btnSec.style.display = 'inline-flex';
    alert('Modo Admin ativo.\n• Sessões: ativar/desativar e renomear\n• Produto: Detalhes → editar nome, preço, foto e estoque');
  } else if (pass !== null) {
    alert('Senha incorreta.');
  }
}

function saveAdminEdit() {
  if (!currentProduct || !isAdmin) return;
  const key = `${currentProduct.brand}|${currentProduct.nome}|${currentProduct.volume || ''}`;
  const overrides = loadOverrides();
  overrides[key] = {
    nome: document.getElementById('admNome').value.trim() || currentProduct.nome,
    varejo: document.getElementById('admVarejo').value.trim(),
    atacado: document.getElementById('admAtacado').value.trim(),
    foto: document.getElementById('admFoto').value.trim(),
    disponivel: document.getElementById('admDisp').value
  };
  saveOverrides(overrides);
  alert('Salvo neste aparelho. Exporte o JSON se for publicar as alterações.');
  closeModal();
  render();
}

function exportOverrides() {
  const o = loadOverrides();
  const blob = new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'emporio_ar_alteracoes.json';
  a.click();
}


function updateShareLink() {
  const text = encodeURIComponent(
    'Confira o Catálogo Digital Empório A.R — Perfumes com preços de varejo e atacado!\n\n' +
    (window.location.href.startsWith('http') ? window.location.href : '')
  );
  const link = document.getElementById('shareWa');
  if (link) link.href = `https://wa.me/?text=${text}`;
}


initSwipeToClose();
document.getElementById('btnPdf').addEventListener('click', downloadCatalogPDF);
document.getElementById('btnAdmin')?.addEventListener('click', toggleAdmin);
document.getElementById('btnSections')?.addEventListener('click', () => {
  if (!isAdmin) { alert('Entre no Admin primeiro.'); return; }
  openSectionsAdmin();
});
document.getElementById('sectionsSave')?.addEventListener('click', saveSectionsAdmin);
document.getElementById('sectionsClose')?.addEventListener('click', () => {
  document.getElementById('sectionsModal')?.classList.remove('open');
});
document.getElementById('sectionsModal')?.addEventListener('click', e => {
  if (e.target.id === 'sectionsModal') e.currentTarget.classList.remove('open');
});
document.getElementById('btnResetSections')?.addEventListener('click', () => {
  if (!isAdmin) return;
  if (confirm('Reativar todas as sessões e restaurar nomes originais?')) {
    localStorage.removeItem(SECTIONS_KEY);
    refreshCategoryFilterVisibility();
    render();
    alert('Sessões restauradas.');
  }
});

document.getElementById('admSave')?.addEventListener('click', saveAdminEdit);
document.getElementById('admExport')?.addEventListener('click', exportOverrides);
if (isAdmin) {
  const b = document.getElementById('btnAdmin');
  if (b) b.textContent = 'Sair Admin';
  const bs = document.getElementById('btnSections');
  if (bs) bs.style.display = 'inline-flex';
}
refreshCategoryFilterVisibility();

ensureBrandCategoryFilters();
updateShareLink();

/** Temas comemorativos BR: ativo de 3 dias antes até 2 dias depois de cada data */
const SEASONAL_THEMES = [
  // month: 1-12 · janela: 3 dias antes → 2 dias depois
  { id: 'ano-novo', month: 1, day: 1, label: '✨ Feliz Ano Novo no Empório A.R!', emoji: '✨' },
  { id: 'carnaval', month: 2, day: 17, label: '🎭 Carnaval no Empório A.R — venha se fantasiar de perfume!', emoji: '🎭' },
  { id: 'mulheres', month: 3, day: 8, label: '💐 Dia Internacional da Mulher — Empório A.R', emoji: '💐' },
  { id: 'consumidor', month: 3, day: 15, label: '🛍️ Dia do Consumidor — condições especiais no Empório A.R', emoji: '🛍️' },
  { id: 'pascoa', month: 4, day: 5, label: '🐰 Feliz Páscoa no Empório A.R!', emoji: '🐰' },
  { id: 'tiradentes', month: 4, day: 21, label: '🇧🇷 Tiradentes — Empório A.R', emoji: '🇧🇷' },
  { id: 'trabalho', month: 5, day: 1, label: '⚒️ Dia do Trabalho — ofertas no Empório A.R', emoji: '⚒️' },
  { id: 'maes', month: 5, day: 10, label: '💝 Dia das Mães — o presente perfeito no Empório A.R', emoji: '💝' },
  { id: 'namorados', month: 6, day: 12, label: '💕 Dia dos Namorados — Empório A.R', emoji: '💕' },
  { id: 'sao-joao', month: 6, day: 24, label: '🌽 São João no Empório A.R!', emoji: '🌽' },
  { id: 'amigos', month: 7, day: 20, label: '🤝 Dia do Amigo — Empório A.R', emoji: '🤝' },
  { id: 'pais', month: 8, day: 9, label: '👔 Dia dos Pais — Empório A.R', emoji: '👔' },
  { id: 'independencia', month: 9, day: 7, label: '🇧🇷 Independência do Brasil — Empório A.R', emoji: '🇧🇷' },
  { id: 'cliente', month: 9, day: 15, label: '🌟 Dia do Cliente — obrigado por comprar no Empório A.R!', emoji: '🌟' },
  { id: 'criancas', month: 10, day: 12, label: '🎈 Dia das Crianças — Empório A.R', emoji: '🎈' },
  { id: 'professores', month: 10, day: 15, label: '📚 Dia dos Professores — Empório A.R', emoji: '📚' },
  { id: 'halloween', month: 10, day: 31, label: '🎃 Halloween no Empório A.R — ofertas assustadoras!', emoji: '🎃' },
  { id: 'finados', month: 11, day: 2, label: '🕯️ Finados — Empório A.R', emoji: '🕯️' },
  { id: 'republica', month: 11, day: 15, label: '🇧🇷 Proclamação da República — Empório A.R', emoji: '🇧🇷' },
  { id: 'consciencia-negra', month: 11, day: 20, label: '✊ Consciência Negra — Empório A.R', emoji: '✊' },
  { id: 'black-friday', month: 11, day: 27, label: '🖤 Black Friday no Empório A.R — não perca!', emoji: '🖤' },
  { id: 'cyber-monday', month: 11, day: 30, label: '💻 Cyber Monday no Empório A.R!', emoji: '💻' },
  { id: 'natal', month: 12, day: 25, label: '🎄 Feliz Natal no Empório A.R!', emoji: '🎄' },
  { id: 'vira-ano', month: 12, day: 31, label: '🥂 Réveillon no Empório A.R!', emoji: '🥂' },
];

function brazilTodayParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  return {
    y: +parts.find((p) => p.type === 'year').value,
    m: +parts.find((p) => p.type === 'month').value,
    d: +parts.find((p) => p.type === 'day').value,
  };
}

function dateKey(y, m, d) {
  return y * 10000 + m * 100 + d;
}

/** 2º domingo do mês (mães/pais aproximados) */
function secondSunday(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const dow = first.getUTCDay(); // 0=dom
  const firstSun = dow === 0 ? 1 : 8 - dow;
  return firstSun + 7;
}

function resolveThemeDate(theme, year) {
  if (theme.id === 'maes') return { y: year, m: 5, d: secondSunday(year, 5) };
  if (theme.id === 'pais') return { y: year, m: 8, d: secondSunday(year, 8) };
  if (theme.id === 'black-friday') {
    // 4ª quinta de novembro + 1 = sexta (Black Friday)
    const first = new Date(Date.UTC(year, 10, 1));
    const dow = first.getUTCDay();
    const firstThu = dow <= 4 ? 1 + (4 - dow) : 1 + (11 - dow);
    const fourthThu = firstThu + 21;
    return { y: year, m: 11, d: fourthThu + 1 };
  }
  if (theme.id === 'cyber-monday') {
    const bf = resolveThemeDate({ id: 'black-friday' }, year);
    return { y: year, m: 11, d: bf.d + 3 };
  }
  // Carnaval/Páscoa: datas aproximadas no array; podem ser ajustadas no ano
  return { y: year, m: theme.month, d: theme.day };
}

function daysBetween(a, b) {
  // a,b as {y,m,d} — diferença em dias (b - a) aproximada
  const da = Date.UTC(a.y, a.m - 1, a.d);
  const db = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((db - da) / 86400000);
}

function getActiveSeasonalTheme() {
  const today = brazilTodayParts();
  let best = null;
  let bestDist = 999;
  for (const year of [today.y - 1, today.y, today.y + 1]) {
    for (const theme of SEASONAL_THEMES) {
      const event = resolveThemeDate(theme, year);
      const delta = daysBetween(event, today); // positivo = depois do evento
      // janela: 3 dias antes (-3) até 2 dias depois (+2)
      if (delta >= -3 && delta <= 2) {
        const dist = Math.abs(delta);
        if (dist < bestDist) {
          bestDist = dist;
          best = theme;
        }
      }
    }
  }
  return best;
}

function applySeasonalTheme() {
  try {
    // remove temas anteriores
    [...document.body.classList].forEach((c) => {
      if (c.startsWith('theme-')) document.body.classList.remove(c);
    });
    const theme = getActiveSeasonalTheme();
    const ban = document.getElementById('seasonalBanner') || document.getElementById('halloweenBanner');
    if (!theme) {
      if (ban) {
        ban.style.display = 'none';
        ban.setAttribute('aria-hidden', 'true');
      }
      return;
    }
    document.body.classList.add('theme-' + theme.id);
    // halloween reaproveita classes visuais dedicadas
    if (theme.id === 'halloween') document.body.classList.add('theme-halloween');
    if (ban) {
      ban.style.display = '';
      ban.setAttribute('aria-hidden', 'false');
      ban.textContent = theme.label;
      ban.className = 'seasonal-banner theme-banner-' + theme.id;
    }
  } catch (e) {
    console.warn('seasonal theme', e);
  }
}
applySeasonalTheme();




// Share sheet actions
document.getElementById('shareSheetClose')?.addEventListener('click', closeShareSheet);
document.getElementById('shareSheet')?.addEventListener('click', (e) => {
  if (e.target.id === 'shareSheet') closeShareSheet();
});
document.getElementById('shareCopyLink')?.addEventListener('click', async () => {
  const ov = document.getElementById('shareSheet');
  const url = ov?.dataset.url || '';
  const ok = await copyText(url);
  alert(ok ? 'Link copiado! Cole no Instagram Stories ou Status do WhatsApp.' : 'Não foi possível copiar.');
  closeShareSheet();
});
document.getElementById('shareCopyText')?.addEventListener('click', async () => {
  const ov = document.getElementById('shareSheet');
  const text = ov?.dataset.text || '';
  const ok = await copyText(text);
  alert(ok ? 'Texto copiado!' : 'Não foi possível copiar.');
  closeShareSheet();
});
document.getElementById('shareDownloadStory')?.addEventListener('click', async () => {
  if (!currentProduct) return;
  closeShareSheet();
  alert('Gerando imagem para Stories/Status…');
  await downloadStoryCard(currentProduct);
});
document.getElementById('shareNative')?.addEventListener('click', async () => {
  if (!currentProduct) return;
  closeShareSheet();
  const p = currentProduct;
  const url = getProductShareUrl(p);
  const text = getProductShareText(p);
  if (navigator.share) {
    try {
      await navigator.share({ title: `${p.nome} · Empório A.R`, text, url });
    } catch (e) {}
  } else {
    alert('Compartilhamento do sistema não disponível neste aparelho. Use copiar link ou baixar imagem.');
  }
});
document.getElementById('shareWhatsApp')?.addEventListener('click', () => {
  const ov = document.getElementById('shareSheet');
  const text = ov?.dataset.text || '';
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  closeShareSheet();
});

updateCartUI();
render();
syncStockFromRoot().then((ok) => {
  if (ok) render();
  openProductFromUrl();
});
// Deep link mesmo sem esperar estoque (fallback)
setTimeout(() => openProductFromUrl(), 400);
