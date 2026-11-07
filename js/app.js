/**
 * Empório A.R - Catálogo Digital
 * Dados: API pública sanitizada + estoque ao vivo
 */
import { validateProductPrices, parsePrice as parsePriceStrict } from './prices.js';
import { isFavoriteId, toggleFavoriteIds, filterFavoriteGroups, collectFavoriteProducts } from './favorites.js';

async function loadCatalogData() {
  // O catálogo só é carregado pela API pública sanitizada.
  // Não importar data.js diretamente: ele é um artefato público e não deve
  // funcionar como caminho alternativo que contorne a sanitização.
  try {
    const res = await fetch('/api/catalogo');
    if (res.ok) {
      const text = await res.text();
      const payload = JSON.parse(text.replace(/^\uFEFF/, ''));
      if (payload && payload.DATA && typeof payload.DATA === 'object') return payload;
    }
  } catch (e) {
    console.warn('API do catálogo indisponível');
  }

  return {
    DATA: {},
    WHATSAPP: '5562991134488',
    BRAND: { name: 'Empório A.R', phone: '(62) 99113-4488' },
  };
}

// Loading visível enquanto busca o Gist
try {
  const el = document.getElementById('bootStatus');
  if (el) el.textContent = 'Carregando catálogo…';
} catch (e) {}

const dadosDoServidor = await loadCatalogData();

const { DATA, WHATSAPP, BRAND } = dadosDoServidor;

try {
  const el = document.getElementById('bootStatus');
  if (el) {
    if (DATA && Object.keys(DATA).length) el.remove();
    else el.textContent = 'Catálogo temporariamente indisponível. Tente novamente em instantes.';
  }
} catch (e) {}

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
  if (isScoopProduct(p)) {
    if (p.varejo) t += `Preço fixo: R$ ${p.varejo}\n`;
  } else {
    if (p.varejo) t += `Varejo: R$ ${p.varejo}\n`;
    if (p.atacado && p.atacado !== '—') t += `Atacado (6+): R$ ${p.atacado}\n`;
  }
  t += `\n👉 Abra o produto no catálogo (link):\n${link}\n`;
  t += `\nCatálogo completo: https://catalogoemporio.netlify.app`;
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

/** Card vertical 1080×1920 — foto grande, sem achatar */
function drawImageCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const ar = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > ar) {
    // imagem mais larga: corta laterais
    sw = img.height * ar;
    sx = (img.width - sw) / 2;
  } else {
    // imagem mais alta: corta topo/base
    sh = img.width / ar;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawImageContain(ctx, img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  const ix = x + (w - iw) / 2;
  const iy = y + (h - ih) / 2;
  ctx.drawImage(img, ix, iy, iw, ih);
}

async function loadProductImage(p) {
  const src = resolveCatalogImageUrl(p.foto || (Array.isArray(p.fotos) && p.fotos[0]) || '');
  if (!src) return null;
  const tryLoad = (url, cross) => new Promise((resolve) => {
    const img = new Image();
    if (cross) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  let img = await tryLoad(src, true);
  if (!img) img = await tryLoad(src, false);
  return img;
}

async function renderStoryCardCanvas(p) {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // fundo
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.5, '#14532d');
  grad.addColorStop(1, '#052e16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // marca
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Empório A.R', W / 2, 110);

  // área da foto — grande (quase a metade da tela)
  const imgX = 60, imgY = 150, imgW = W - 120, imgH = 1100;
  ctx.save();
  // fundo da foto
  ctx.fillStyle = '#0c0a09';
  if (typeof roundRect === 'function') {
    roundRect(ctx, imgX, imgY, imgW, imgH, 28);
    ctx.fill();
    roundRect(ctx, imgX, imgY, imgW, imgH, 28);
    ctx.clip();
  } else {
    ctx.fillRect(imgX, imgY, imgW, imgH);
  }
  const img = await loadProductImage(p);
  if (img && img.width) {
    // cover: preenche a área sem distorcer
    try {
      drawImageCover(ctx, img, imgX, imgY, imgW, imgH);
    } catch (e) {
      try { drawImageContain(ctx, img, imgX, imgY, imgW, imgH); } catch (e2) {}
    }
  } else {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '36px system-ui, sans-serif';
    ctx.fillText('Foto indisponível', W / 2, imgY + imgH / 2);
  }
  ctx.restore();

  // textos abaixo da foto
  let ty = imgY + imgH + 70;
  ctx.fillStyle = '#fafaf9';
  ctx.font = 'bold 46px system-ui, -apple-system, sans-serif';
  const lines = (typeof wrapText === 'function')
    ? wrapText(ctx, p.nome || 'Produto', W - 120, 3)
    : [String(p.nome || 'Produto').slice(0, 40)];
  lines.forEach((line, i) => ctx.fillText(line, W / 2, ty + i * 54));
  ty += lines.length * 54 + 24;

  const meta = [p.brand, p.volume && p.volume !== '—' ? p.volume : ''].filter(Boolean).join(' · ');
  if (meta) {
    ctx.fillStyle = '#d6d3d1';
    ctx.font = '32px system-ui, sans-serif';
    ctx.fillText(meta, W / 2, ty);
    ty += 48;
  }

  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 52px system-ui, sans-serif';
  if (p.varejo) ctx.fillText((isScoopProduct(p) ? 'Preço fixo R$ ' : 'R$ ') + p.varejo, W / 2, ty);
  ty += 50;
  if (!isScoopProduct(p) && p.atacado && p.atacado !== '—') {
    ctx.fillStyle = '#86efac';
    ctx.font = '36px system-ui, sans-serif';
    ctx.fillText('Atacado (6+) R$ ' + p.atacado, W / 2, ty);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillText('Link do produto na legenda · catalogoemporio.netlify.app', W / 2, H - 70);

  return canvas;
}

async function buildStoryCardBlob(p) {
  try {
    if (!p) return null;
    const canvas = await renderStoryCardCanvas(p);
    return await new Promise((res) => canvas.toBlob(res, 'image/png', 0.92));
  } catch (e) {
    return null;
  }
}


async function downloadStoryCard(p) {
  try {
    const canvas = await renderStoryCardCanvas(p);
    return await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          alert('Não foi possível gerar a imagem. Tente em outro aparelho.');
          resolve(false);
          return;
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `emporio-ar-${normId(p.nome) || 'produto'}-story.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        resolve(true);
      }, 'image/png', 0.92);
    });
  } catch (e) {
    alert('Erro ao gerar imagem do produto.');
    return false;
  }
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

  // 1) Menu nativo do celular (WhatsApp, Instagram, etc. quando o sistema oferecer)
  if (navigator.share) {
    try {
      // tenta com imagem do card se possível
      if (typeof buildStoryCardBlob === 'function') {
        try {
          const blob = await buildStoryCardBlob(p);
          if (blob) {
            const file = new File([blob], 'emporio-ar-produto.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ title, text, url, files: [file] });
              return;
            }
          }
        } catch (e) {}
      }
      await navigator.share({ title, text, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      // cai no menu manual
    }
  }
  // 2) Menu com Stories / Status / link / baixar
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
  vitrine: 'Todos', // Todos | Lancamentos | Destaques
  viewMode: 'grid',
  favoritesOnly: false
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

function matchesSearch(item, brand, cat, q, tokens = null) {
  if (!q || !String(q).trim()) return true;
  const hay = normalizeSearch(
    [item.nome, brand, item.volume, item.notas, cat, item.badge, item.line]
      .filter(Boolean)
      .join(' ')
  );
  const searchTokens = tokens || normalizeSearch(q).split(' ').filter(Boolean);
  return searchTokens.every((t) => {
    const alts = SEARCH_SYNONYMS[t] || [t];
    return alts.some((a) => hay.includes(a));
  });
}

/** Itens que NÃO entram nos filtros Mini e 80–100ml (só perfumes) */
function isNonPerfumeVolumeItem(item, cat, brand) {
  const n = String(item.nome || '').toLowerCase();
  const c = String(cat || item.cat || '').toLowerCase();
  const b = String(brand || item.brand || '').toLowerCase();
  const blob = `${n} ${c} ${b}`;
  // marcas / categorias cosméticas
  if (b.includes('makeup') || b.includes('make up') || b.includes('maqui') || c.includes('maqui')) return true;
  if (c === 'óleos' || c === 'oleos' || c.includes('óleo') || c.includes('oleo')) return true;
  const block = [
    'hidratante', 'body cream', 'body splash', 'bodysplash', 'body lotion', 'body spray',
    'creme', 'loção', 'locao', 'óleo', 'oleo', ' oil', 'oil ',
    'maquiagem', 'makeup', 'make-up', 'gloss', 'batom', 'lip ', 'lipbalm', 'lip balm',
    'lip blam', 'lipblam', 'blam', 'balm', 'máscara', 'mascara', 'rimel', 'rímel',
    'shampoo', 'condicionador', 'sabonete', 'desodorante', 'esmalte', 'primer',
    'base líquida', 'corretivo', 'iluminador', 'blush', 'pó compacto',
  ];
  for (const w of block) {
    if (blob.includes(w)) return true;
  }
  return false;
}

function volumeBucket(item) {
  const v = String(item.volume || '').toLowerCase().replace(',', '.');
  const n = String(item.nome || '').toLowerCase();
  const ml = v.match(/(\d+(?:\.\d+)?)\s*ml/);
  const num = ml ? parseFloat(ml[1]) : NaN;
  // Miniaturas: até 50ml (inclui 30ml e 50ml) ou nome com mini/miniatura
  if (n.includes('miniatura') || n.includes('mini ') || n.startsWith('mini')) return 'Mini';
  if (!isNaN(num)) {
    if (num <= 50) return 'Mini';
    if (num >= 80 && num <= 120) return '100ml'; // 80ml e ~100ml
    if (num > 120) return '200ml+';
  }
  if (v.includes('100') || v.includes('80')) return '100ml';
  if (v.includes('200') || v.includes('250')) return '200ml+';
  return 'Outros';
}

/** Filtro de volume: Mini e 100ml só perfumes */
function matchesVolumeFilter(item, cat, volumeState, brand) {
  if (!volumeState || volumeState === 'Todos') return true;
  if (volumeState === 'Mini' || volumeState === '100ml') {
    if (isNonPerfumeVolumeItem(item, cat, brand)) return false;
  }
  return volumeBucket(item) === volumeState;
}

/** Lançamentos híbridos:
 * 1) Prioridade: novoDesde ≤ 3 dias (todas as fontes)
 * 2) Completar: categoria Lançamentos / badge Novo / nome com lançamento
 */
const LANCAMENTO_DIAS = 3;

function isNovoRecente(item) {
  const raw = item && item.novoDesde;
  if (!raw) return false;
  const start = new Date(raw).getTime();
  if (Number.isNaN(start)) return false;
  const ageDays = (Date.now() - start) / 86400000;
  return ageDays >= 0 && ageDays <= LANCAMENTO_DIAS;
}

function isLancamentoLegado(item, cat) {
  const c = String(cat || item.cat || '').toLowerCase();
  const b = String(item.badge || '').toLowerCase();
  const n = String(item.nome || '').toLowerCase();
  if (c.includes('lanç') || c.includes('lanc')) return true;
  if (b.includes('novo') || b.includes('lanç') || b.includes('lanc') || b === 'new') return true;
  if (n.includes('lançamento') || n.includes('lancamento')) return true;
  return false;
}

/** Filtro "Só novidades" e cards: recente OU legado */
function isLancamentoItem(item, cat) {
  return isNovoRecente(item) || isLancamentoLegado(item, cat);
}

function fonteLancamento(item, line, cat) {
  const f = String(item.fonte || '').toLowerCase();
  if (['acessorios', 'roupas', 'brand', 'perfumaria'].includes(f)) return f;
  const c = String(cat || item.cat || '');
  if (c === 'Brand' || c.startsWith('Brand')) return 'brand';
  const ln = String(line || item.line || '').toLowerCase();
  if (ln === 'roupas') return 'roupas';
  if (ln === 'acessorios' || ln === 'acessórios') return 'acessorios';
  if (['masculino', 'feminino', 'unissex'].includes(ln)) return 'perfumaria';
  return 'outros';
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


function applyOverride(item, brand, overrides = loadOverrides()) {
  const key = `${brand}|${item.nome}|${item.volume || ''}`;
  const o = overrides[key];
  if (!o) return { ...item, brand };
  return { ...item, ...o, brand: o.brand || brand };
}

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    // localStorage pode ser editado pelo próprio navegador: aceitar apenas campos esperados.
    return raw.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        nome: String(item.nome || 'Produto').slice(0, 180),
        brand: String(item.brand || '').slice(0, 120),
        volume: String(item.volume || '').slice(0, 60),
        varejo: String(item.varejo ?? ''),
        atacado: String(item.atacado ?? ''),
        disponivel: item.disponivel === 'Não' ? 'Não' : 'Sim',
        qty: Math.max(1, Math.min(999, Math.floor(Number(item.qty) || 1))),
        variacaoNome: String(item.variacaoNome || '').slice(0, 100),
        cat: String(item.cat || '').slice(0, 100)
      }));
  } catch { return []; }
}
function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}
let cart = loadCart();
let currentProduct = null;
let searchTimer = null;

function parsePrice(str) {
  return parsePriceStrict(str);
}

function isScoopProduct(p) {
  return Boolean(p && (
    p.cat === 'Scoop Premiado' ||
    p.badge === 'Scoop' ||
    String(p.nome || '').toLowerCase().includes('scoop')
  ));
}

// Valores vindos do catálogo, URL e armazenamento local são tratados como texto não confiável.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
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

    const endpoints = []; // estoque via Gist/Action — sem functions Netlify (economiza crédito)
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



function allGroups(forceAll = false) {
  const genderOrder = ['feminino', 'masculino', 'unissex', 'roupas', 'acessorios'];
  // Lê e interpreta as personalizações uma única vez por montagem do catálogo.
  const overrides = loadOverrides();
  const gSel = (forceAll || state.favoritesOnly) ? 'Todos' : String(state.gender || 'Todos');
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
          items: g.items.map(it => applyOverride(it, g.brand, overrides))
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
        items: g.items.map(it => applyOverride(it, g.brand, overrides))
      });
    }
  }
  return result;
}

function cartKey(p) {
  return `${p.brand}|${p.nome}|${p.volume || ''}`;
}

function buildWaMessage(p, meta = {}) {
  const qty = Math.max(1, Math.min(99, parseInt(meta.qty, 10) || 1));
  const isScoop = isScoopProduct(p);
  const useAtacado = !isScoop && qty >= 6 && p.atacado && p.atacado !== '—';
  const unitStr = useAtacado ? p.atacado : p.varejo;
  const unit = parsePrice(unitStr);
  const sub = unit * qty;
  let msg = 'Olá! Gostaria de *comprar* no *Empório A.R*:\n\n';
  if (meta.nome) msg += `👤 Cliente: *${meta.nome}*\n`;
  if (meta.cep) msg += `📮 CEP: *${meta.cep}*\n`;
  if (meta.cidade && meta.uf) msg += `📍 Cidade/UF: *${meta.cidade} - ${meta.uf}*\\n`;
  if (meta.nome || meta.cep) msg += '\n';
  msg += `*${p.nome}*\n`;
  msg += `Marca: ${p.brand || 'Empório A.R'}\n`;
  if (p.volume && p.volume !== '—' && !isVariacaoCatalogProduct(p)) msg += `Volume: ${p.volume}\n`;
  const variacao = p.variacaoSelecionada || getSelectedVariacao();
  if (variacao && variacao.nome) {
    msg += `Variação / Tamanho: *${variacao.nome}*\n`;
  }
  if (p.cat && isVariacaoCatalogProduct(p)) msg += `Categoria: ${p.cat}\n`;
  msg += `Qtd: *${qty}*\n`;
  if (isScoop) {
    msg += `Preço fixo unit.: *R$ ${p.varejo}*\n`;
  } else if (useAtacado) {
    msg += `Tabela: *ATACADO (6+)*\n`;
    msg += `Preço unit.: *R$ ${p.atacado}*\n`;
  } else {
    msg += `Tabela: *VAREJO*\n`;
    msg += `Preço unit.: *R$ ${p.varejo}*\n`;
  }
  if (unit > 0) msg += `Subtotal: *R$ ${formatBRL(sub)}*\n`;
  if (meta.cidade && meta.uf) msg += `📍 Cidade/UF: *${meta.cidade} - ${meta.uf}*\\n`;
  msg += '\nPor favor, confirme *disponibilidade* e *formas de pagamento*. Obrigado!';
  return encodeURIComponent(msg);
}

let pendingBuyProduct = null;

function openBuyMetaModal(p) {
  pendingBuyProduct = p;
  const ov = document.getElementById('buyMetaModal');
  const title = document.getElementById('buyMetaProduct');
  if (title) title.textContent = p.nome || 'Produto';
  const qtyEl = document.getElementById('buyQty');
  if (qtyEl) qtyEl.value = '1';
  // pré-preenche com carrinho ou último uso
  try {
    const cartNome = document.getElementById('cartClientName')?.value || '';
    const cartCep = document.getElementById('cartObs')?.value || '';
    const saved = JSON.parse(localStorage.getItem('emporio_buy_meta') || '{}');
    const n = document.getElementById('buyClientName');
    const c = document.getElementById('buyClientCep');
    if (n && !n.value) n.value = cartNome || saved.nome || '';
    if (c && !c.value) {
      c.value = cartCep || saved.cep || '';
      if (saved.cidade) document.getElementById('buyCepCity').value = saved.cidade;
      if (saved.uf) document.getElementById('buyCepUf').value = saved.uf;
      if (saved.cidade && saved.uf) {
        c.dataset.cepCity = saved.cidade;
        c.dataset.cepUf = saved.uf;
        c.dataset.cepValid = 'true';
        document.getElementById('buyCepStatus').textContent = 'Endereço salvo anteriormente.';
        document.getElementById('buyCepStatus').dataset.state = 'success';
      }
    }
  } catch (e) {}
  ov?.classList.add('open');
}

function closeBuyMetaModal() {
  document.getElementById('buyMetaModal')?.classList.remove('open');
  pendingBuyProduct = null;
}

function cepDigits(cep) {
  return String(cep || '').replace(/\D/g, '');
}
function updateCepWarn(inputId, warnId) {
  const el = document.getElementById(inputId);
  const warn = document.getElementById(warnId);
  if (!el || !warn) return;
  const d = cepDigits(el.value);
  const incomplete = d.length > 0 && d.length < 8;
  warn.classList.toggle('show', incomplete);
}

async function lookupCep(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return { ok: false, reason: 'Campo de CEP não encontrado.' };
  const digits = cepDigits(input.value);
  const prefix = inputId === 'cartObs' ? 'cart' : 'buy';
  const cityEl = document.getElementById(prefix + 'CepCity');
  const ufEl = document.getElementById(prefix + 'CepUf');
  const statusEl = document.getElementById(prefix + 'CepStatus');
  const setStatus = (message, state = '') => {
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.dataset.state = state;
    }
  };
  if (digits.length !== 8) {
    if (cityEl) cityEl.value = '';
    if (ufEl) ufEl.value = '';
    setStatus(digits.length ? 'Digite os 8 números do CEP.' : '');
    input.dataset.cepCity = '';
    input.dataset.cepUf = '';
    input.dataset.cepValid = '';
    return { ok: false, reason: 'Informe um CEP com 8 dígitos.' };
  }

  const requestId = String((Number(input.dataset.cepRequest || 0) + 1));
  input.dataset.cepRequest = requestId;
  setStatus('Consultando CEP…', 'loading');
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Falha na consulta');
    const data = await response.json();
    if (input.dataset.cepRequest !== requestId) return { ok: false, reason: 'Consulta substituída.' };
    if (data.erro || !data.localidade || !data.uf) {
      if (cityEl) cityEl.value = '';
      if (ufEl) ufEl.value = '';
      input.dataset.cepCity = '';
      input.dataset.cepUf = '';
      input.dataset.cepValid = 'false';
      setStatus('CEP não encontrado. Confira os números.', 'error');
      return { ok: false, reason: 'CEP não encontrado.' };
    }
    input.dataset.cepCity = data.localidade;
    input.dataset.cepUf = data.uf;
    input.dataset.cepValid = 'true';
    if (cityEl) cityEl.value = data.localidade;
    if (ufEl) ufEl.value = data.uf;
    setStatus('Endereço localizado.', 'success');
    return { ok: true, cep: digits, cidade: data.localidade, uf: data.uf };
  } catch (error) {
    if (input.dataset.cepRequest !== requestId) return { ok: false, reason: 'Consulta substituída.' };
    input.dataset.cepValid = '';
    setStatus('Não foi possível consultar agora. Tente novamente.', 'error');
    return { ok: false, reason: 'Não foi possível validar o CEP.' };
  }
}

async function ensureCep(inputId) {
  const input = document.getElementById(inputId);
  const digits = cepDigits(input?.value);
  if (!digits) return { ok: true, cep: '', cidade: '', uf: '' };
  if (digits.length !== 8) {
    updateCepWarn(inputId, inputId === 'cartObs' ? 'cartCepWarn' : 'buyCepWarn');
    return { ok: false, reason: 'Informe os 8 dígitos do CEP.' };
  }
  if (input.dataset.cepValid === 'true' && input.dataset.cepCity && input.dataset.cepUf) {
    return { ok: true, cep: digits, cidade: input.dataset.cepCity, uf: input.dataset.cepUf };
  }
  return await lookupCep(inputId);
}

function bindCepField(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('input', () => {
    let value = cepDigits(input.value).slice(0, 8);
    if (value.length > 5) value = value.slice(0, 5) + '-' + value.slice(5);
    input.value = value;
    input.dataset.cepValid = '';
    input.dataset.cepCity = '';
    input.dataset.cepUf = '';
    const prefix = inputId === 'cartObs' ? 'cart' : 'buy';
    const city = document.getElementById(prefix + 'CepCity');
    const uf = document.getElementById(prefix + 'CepUf');
    if (city) city.value = '';
    if (uf) uf.value = '';
    updateCepWarn(inputId, inputId === 'cartObs' ? 'cartCepWarn' : 'buyCepWarn');
    if (cepDigits(value).length === 8) lookupCep(inputId);
    else {
      const status = document.getElementById(prefix + 'CepStatus');
      if (status) { status.textContent = ''; status.dataset.state = ''; }
    }
  });
  input.addEventListener('blur', () => {
    if (cepDigits(input.value).length === 8 && input.dataset.cepValid !== 'true') lookupCep(inputId);
  });
}

async function confirmBuyMeta() {
  const p = pendingBuyProduct;
  if (!p) return;
  const nome = (document.getElementById('buyClientName')?.value || '').trim();
  const cepResult = await ensureCep('buyClientCep');
  if (!cepResult.ok) {
    alert(cepResult.reason || 'Não foi possível validar o CEP.');
    return;
  }
  const { cep, cidade, uf } = cepResult;
  const qty = Math.max(1, Math.min(99, parseInt(document.getElementById('buyQty')?.value, 10) || 1));
  try {
    localStorage.setItem('emporio_buy_meta', JSON.stringify({ nome, cep, cidade, uf }));
    const cn = document.getElementById('cartClientName');
    const cc = document.getElementById('cartObs');
    if (cn && nome) cn.value = nome;
    if (cc && cep) cc.value = cep;
  } catch (e) {}
  closeBuyMetaModal();
  window.open(`https://wa.me/${WHATSAPP}?text=${buildWaMessage(p, { nome, cep, cidade, uf, qty })}`, '_blank');
}

function unitPrice(p, useAtacado) {
  if (!isScoopProduct(p) && useAtacado && p.atacado && p.atacado !== '—') return parsePrice(p.atacado);
  return parsePrice(p.varejo);
}

function formatBRL(n) {
  return n.toFixed(2).replace('.', ',');
}

function getCartMeta() {
  const nome = (document.getElementById('cartClientName')?.value || '').trim();
  const cep = (document.getElementById('cartObs')?.value || '').trim();
  const input = document.getElementById('cartObs');
  return {
    nome, cep,
    cidade: input?.dataset.cepCity || '',
    uf: input?.dataset.cepUf || '',
    obs: cep
  };
}

function buildCartWaMessage() {
  const totalItens = cartTotalQty();
  const meta = getCartMeta();
  // Scoops Premiados mantêm preço fixo; atacado vale apenas para os demais produtos.
  const useAtacado = totalItens >= 6;
  const hasScoop = cart.some(isScoopProduct);
  const hasRegular = cart.some(p => !isScoopProduct(p));
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  let msg = 'Olá! Gostaria de *confirmar o pedido* no *Empório A.R*.\n\n';
  msg += `📅 ${dataHora}\n`;
  if (meta.nome) msg += `👤 Cliente: *${meta.nome}*\n`;
  if (hasScoop && hasRegular) {
    msg += `📋 Produtos convencionais: *${useAtacado ? 'ATACADO (6+ itens)' : 'VAREJO'}*\n`;
    msg += '📋 Scoops Premiados: *PREÇO FIXO*\n';
  } else if (hasScoop) {
    msg += '📋 Scoops Premiados: *PREÇO FIXO*\n';
  } else {
    msg += `📋 Tabela: *${useAtacado ? 'ATACADO (6+ itens)' : 'VAREJO'}*\n`;
  }
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
  if (meta.cep) msg += `\n📮 CEP: *${meta.cep}*\n`;
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
  // pede nome + CEP antes de abrir o WhatsApp (igual espírito do carrinho)
  openBuyMetaModal(p);
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
  showCartToast(qty > 1 ? `Adicionado (${qty}) ao carrinho` : 'Adicionado ao carrinho');
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
    const label = isScoopProduct(p) ? 'Preço fixo' : (useAtacado ? 'Atacado' : 'Varejo');
    return `
    <div class="cart-item">
      <div class="cart-item-info">
        <strong>${escapeHtml(p.nome)}</strong><br>
        <span class="cart-item-meta">${escapeHtml(p.brand || '')} · ${escapeHtml(p.volume || '—')} · ${label}: R$ ${formatBRL(unit)}</span>
        <div class="cart-qty">
          <button type="button" data-qty-minus="${i}" aria-label="Diminuir">−</button>
          <span>${p.qty}</span>
          <button type="button" data-qty-plus="${i}" aria-label="Aumentar">+</button>
        </div>
        <div class="cart-item-sub">Subtotal: R$ ${formatBRL(sub)}</div>
      </div>
      <button type="button" class="cart-remove" data-remove="${i}">Remover</button>
    </div>`;
  }).join('');

  const hasScoop = cart.some(isScoopProduct);
  const hasRegular = cart.some(p => !isScoopProduct(p));
  const modeHtml = !hasRegular
    ? '<div class="cart-mode">Scoops Premiados com preço fixo por unidade</div>'
    : (useAtacado
      ? '<div class="cart-mode is-atacado">✓ Preço de ATACADO aplicado aos produtos elegíveis (6+ itens)</div>'
      : `<div class="cart-mode is-varejo">Varejo — faltam <strong>${6 - totalItens}</strong> item(ns) para preço de atacado nos produtos elegíveis</div>`) +
      (hasScoop ? '<div class="cart-mode">Scoops Premiados mantêm o preço fixo</div>' : '');

  const sticky = `<div class="cart-sticky-summary"><span>Resumo do pedido</span>Itens: ${totalItens} · Total: R$ ${formatBRL(total)}</div>`;
  list.innerHTML = sticky + modeHtml + itemsHtml + `
    <div class="cart-total">
      <div>Itens: ${totalItens}</div>
      <strong>Total: R$ ${formatBRL(total)}</strong>
    </div>
    <button type="button" class="cart-clear" id="cartClearBtn">Limpar pedido</button>`;

  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.remove)));
  });
  list.querySelectorAll('[data-qty-minus]').forEach(btn => {
    btn.addEventListener('click', () => setCartQty(Number(btn.dataset.qtyMinus), cart[Number(btn.dataset.qtyMinus)].qty - 1));
  });
  list.querySelectorAll('[data-qty-plus]').forEach(btn => {
    btn.addEventListener('click', () => setCartQty(Number(btn.dataset.qtyPlus), cart[Number(btn.dataset.qtyPlus)].qty + 1));
  });
  document.getElementById('cartClearBtn')?.addEventListener('click', () => {
    if (!cart.length) return;
    if (confirm('Limpar todos os itens do pedido?')) {
      cart = [];
      try { localStorage.removeItem('emporio_cart_v1'); } catch (e) {}
      try { persistCart(); } catch (e) {}
      updateCartUI();
      renderCart();
    }
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
      if (!matchesVolumeFilter(item, g.cat, state.volume, g.brand)) continue;
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
        public_id: item.public_id || '',
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
  return (p.line || '').toLowerCase() === 'roupas' || (p.fonte || '') === 'roupas';
}
function isAcessoriosProduct(p) {
  return (p.line || '').toLowerCase() === 'acessorios' || (p.fonte || '') === 'acessorios';
}
/** Produtos com descrição + variações + galeria (Roupas e Acessórios) */
function isVariacaoCatalogProduct(p) {
  return isRoupasProduct(p) || isAcessoriosProduct(p);
}

function resolveCatalogImageUrl(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (!s) return '';
  try {
    const url = new URL(s, window.location.origin);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (url.origin !== window.location.origin || url.pathname !== '/api/product-image') return '';
    return url.toString();
  } catch (e) {
    return '';
  }
}

function buildPhotoGallery(p) {
  const raw = Array.isArray(p.fotos) && p.fotos.length
    ? p.fotos
    : (p.foto ? [p.foto] : []);
  const fotos = raw.map(resolveCatalogImageUrl).filter(Boolean);
  if (!fotos.length) {
    return { html: 'SEM FOTO', isEmpty: true, fotos: [] };
  }
  const main = fotos[0];
  const multi = fotos.length > 1;
  const thumbs = fotos.map((src, i) =>
    `<button type="button" class="gallery-thumb${i === 0 ? ' active' : ''}" data-idx="${i}" data-src="${escapeHtml(src)}" aria-label="Foto ${i + 1}">
      <img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">
    </button>`
  ).join('');
  const html = `
    <div class="gallery" data-count="${fotos.length}">
      <div class="gallery-main">
        ${multi ? `<button type="button" class="gallery-nav gallery-prev" aria-label="Foto anterior">‹</button>` : ''}
        <img id="galleryMainImg" src="${escapeHtml(main)}" alt="${escapeHtml(p.nome || '')}" loading="eager" referrerpolicy="no-referrer">
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
  if (mainImg) mainImg.addEventListener('error', () => {
    photoEl.classList.add('no-img');
    mainImg.removeAttribute('src');
    mainImg.alt = 'SEM FOTO';
  }, { once: true });
  thumbs().forEach((btn) => {
    btn.querySelector('img')?.addEventListener('error', () => { btn.style.display = 'none'; }, { once: true });
  });

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
    const label = escapeHtml(v.nome || '—');
    const stock = ok ? `${qty} un.` : 'Esgotado';
    return `<button type="button" class="var-chip${sel}${ok ? '' : ' var-chip-out'}" data-var-id="${escapeHtml(id)}" data-var-nome="${label}" data-var-estoque="${qty}"${disabled}>
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

let detailsScrollY = 0;

function openDetails(p, opts = {}) {
  if (!opts.fromNav) {
    detailsScrollY = window.scrollY || window.pageYOffset || 0;
  }
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
  const isScoop = isScoopProduct(p);
  const roupas = isRoupasProduct(p);
  const acessorios = isAcessoriosProduct(p);
  const varCatalog = isVariacaoCatalogProduct(p);

  document.getElementById('modalName').textContent = p.nome;
  document.getElementById('modalMeta').textContent =
    `${p.brand || 'Empório A.R'}${p.volume && p.volume !== '—' && !isScoop && !varCatalog ? ' · ' + p.volume : ''}${varCatalog && p.cat ? ' · ' + p.cat : ''} · ${avail ? 'Disponível' : 'ESGOTADO'}`;
  const modalVarejo = document.getElementById('modalVarejo');
  const modalAtacado = document.getElementById('modalAtacado');
  modalVarejo.textContent = p.varejo ? `R$ ${p.varejo}` : '—';
  modalAtacado.textContent = p.atacado && p.atacado !== '—' ? `R$ ${p.atacado}` : '—';
  modalVarejo.previousElementSibling.textContent = isScoop ? 'Preço fixo' : 'Varejo';
  modalAtacado.parentElement.style.display = isScoop ? 'none' : '';

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
    notasHtml += `<strong>${titulo}</strong><br>${escapeHtml(p.notas).replace(/\n/g, '<br>')}`;
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

/* O estoque é atualizado pelo snapshot sincronizado do catálogo. */



function closeModal() {
  const overlay = document.getElementById('modal');
  if (!overlay.classList.contains('open')) return;
  overlay.classList.add('closing');
  const y = detailsScrollY || 0;
  const done = () => {
    overlay.classList.remove('open', 'closing');
    currentProduct = null;
    setProductUrl(null);
    // restaura posição da lista
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
    });
  };
  setTimeout(done, 380);
}



function collectFeatured(limit = 12) {
  // Híbrido: 1º novidades ≤3 dias (mistura fontes); 2º completa com legado (categoria/badge)
  const bucketsRecente = { perfumaria: [], brand: [], roupas: [], acessorios: [], outros: [] };
  const legado = [];
  const seen = new Set();

  for (const g of allGroups()) {
    for (const raw of g.items || []) {
      const item = validateProductPrices(raw);
      if (!isAvailable(item)) continue;
      const key = `${g.brand}|${item.nome}|${item.volume || ''}`;
      if (seen.has(key)) continue;
      const row = { ...item, brand: g.brand, cat: g.cat, line: g.line };
      if (isNovoRecente(item)) {
        seen.add(key);
        const fonte = fonteLancamento(row, g.line, g.cat);
        (bucketsRecente[fonte] || bucketsRecente.outros).push(row);
      } else if (isLancamentoLegado(item, g.cat)) {
        seen.add(key);
        legado.push(row);
      }
    }
  }

  for (const k of Object.keys(bucketsRecente)) {
    bucketsRecente[k].sort((a, b) => String(b.novoDesde || '').localeCompare(String(a.novoDesde || '')));
  }
  // legado: embaralha leve por nome para não fixar sempre os mesmos no topo
  legado.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

  const order = ['perfumaria', 'roupas', 'acessorios', 'brand', 'outros'];
  const out = [];
  let i = 0;
  while (out.length < limit) {
    let added = false;
    for (const k of order) {
      if (bucketsRecente[k][i]) {
        out.push(bucketsRecente[k][i]);
        added = true;
        if (out.length >= limit) break;
      }
    }
    if (!added) break;
    i++;
  }

  // completa com legado até o limite
  for (const row of legado) {
    if (out.length >= limit) break;
    const key = `${row.brand}|${row.nome}|${row.volume || ''}`;
    if (out.some((x) => `${x.brand}|${x.nome}|${x.volume || ''}` === key)) continue;
    out.push(row);
  }
  return out;
}

function buildFeaturedHtml() {
  // O carrossel não pode furar o filtro de favoritos exibindo itens não salvos.
  if (state.favoritesOnly) return '';
  // só na home (sem busca / filtros fechados)
  if (state.search.trim()) return '';
  if (state.gender !== 'Todos' && state.gender.toLowerCase() !== 'todos') return '';
  if (state.category !== 'Todos') return '';
  if (state.vitrine === 'Destaques') {
    /* show only via filter */ 
  }
  const items = collectFeatured(12);
  const favoriteIds = new Set(loadFavs());
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
        public_id: item.public_id || '',
                  variacoes: item.variacoes || [],
      total_estoque: item.total_estoque
    }));
    const foto = resolveCatalogImageUrl(item.foto);
    const favOn = isFav(item, favoriteIds);
    return `<div class="feat-card" role="button" tabindex="0" data-p="${pdata}">
      <button type="button" class="feat-fav-btn${favOn ? ' on' : ''}" data-fav="${pdata}" aria-label="${favOn ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">${favOn ? '♥' : '♡'}</button>
      ${foto ? `<img src="${escapeHtml(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>` : '<div class="feat-ph">SEM FOTO</div>'}
      <span class="feat-name">${escapeHtml(item.nome)}</span>
      <span class="feat-price">R$ ${escapeHtml(item.varejo)}</span>
    </div>`;
  }).join('');
  return `<section class="featured-strip" aria-label="Novidades">
    <div class="featured-head">
      <h2>✨ Novidades</h2>
      <button type="button" class="fbtn" id="btnVerLancamentos">Ver todos</button>
    </div>
    <div class="featured-row">${cards}</div>
  </section>`;
}



function genderLabel(g) {
  const v = String(g || 'Todos');
  if (v === 'Todos' || v.toLowerCase() === 'todos') return 'Todas as sessões';
  if (v === 'roupas') return 'Roupas';
  if (v === 'acessorios') return 'Acessórios';
  if (v === 'Brand' || v.toLowerCase() === 'brand') return 'Brand';
  return v;
}

function updateNavCrumb() {
  const el = document.getElementById('navCrumb');
  if (!el) return;
  const g = state.gender;
  const c = state.category;
  const parts = [];
  parts.push(`<button type="button" data-nav="home">Início</button>`);
  if (g && g !== 'Todos') {
    parts.push(`<span class="sep">›</span>`);
    parts.push(`<button type="button" data-nav="session">${escapeHtml(genderLabel(g))}</button>`);
  }
  if (c && c !== 'Todos') {
    parts.push(`<span class="sep">›</span>`);
    parts.push(`<span class="current">${escapeHtml(c)}</span>`);
  }
  el.innerHTML = parts.join('');
  const back = document.getElementById('navBackSub');
  if (back) back.classList.toggle('show', !!(c && c !== 'Todos'));
  const lab = document.getElementById('categoryRowLabel');
  if (lab) {
    const gl = String(g || '').toLowerCase();
    lab.textContent = (gl === 'roupas' || gl === 'acessorios' || gl === 'brand')
      ? 'Subcategoria'
      : 'Categoria';
  }
}

function goNavHome() {
  state.gender = 'Todos';
  state.category = 'Todos';
  document.querySelectorAll('#genderFilters .fbtn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === 'Todos');
  });
  updateCategoryFiltersForGender('Todos');
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goNavSession() {
  state.category = 'Todos';
  const el = document.getElementById('categoryFilters');
  el?.querySelectorAll('.fbtn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === 'Todos');
  });
  render();
  document.getElementById('categoryFilters')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}



function showCartToast(msg) {
  const el = document.getElementById('toastCart');
  if (!el) return;
  el.textContent = msg || 'Adicionado ao carrinho';
  el.classList.add('show');
  clearTimeout(showCartToast._t);
  showCartToast._t = setTimeout(() => el.classList.remove('show'), 1800);
}

function filtersAreActive() {
  return (
    (state.gender && state.gender !== 'Todos') ||
    (state.category && state.category !== 'Todos') ||
    (state.price && state.price !== 'Todos') ||
    (state.stock && state.stock !== 'Todos') ||
    (state.volume && state.volume !== 'Todos') ||
    (state.vitrine && state.vitrine !== 'Todos') ||
    !!(state.search && state.search.trim())
  );
}

function updateClearFiltersBtn() {
  const btn = document.getElementById('btnClearFilters');
  if (!btn) return;
  btn.classList.toggle('show', filtersAreActive());
}

function clearAllFilters() {
  state.gender = 'Todos';
  state.category = 'Todos';
  state.price = 'Todos';
  state.stock = 'Todos';
  state.volume = 'Todos';
  state.vitrine = 'Todos';
  state.search = '';
  const q = document.getElementById('q');
  if (q) q.value = '';
  document.querySelectorAll('#genderFilters .fbtn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === 'Todos');
  });
  document.querySelectorAll('#priceFilters .fbtn, #stockFilters .fbtn, #volumeFilters .fbtn, #vitrineFilters .fbtn').forEach(b => {
    const row = b.closest('.filters');
    const isDefault = b.dataset.value === 'Todos';
    b.classList.toggle('active', isDefault);
  });
  updateCategoryFiltersForGender('Todos');
  const adv = document.getElementById('filtersAdvanced');
  if (adv) adv.open = false;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateCategoryGridMode() {
  const el = document.getElementById('categoryFilters');
  if (!el) return;
  const g = String(state.gender || '').toLowerCase();
  const useGrid = (g === 'roupas' || g === 'acessorios' || g === 'brand');
  el.classList.toggle('is-grid', useGrid);
}


const FAV_KEY = 'emporio_favs_v1';
const RECENT_KEY = 'emporio_recent_search_v1';
const VIEW_KEY = 'emporio_view_mode';

function loadFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; }
}
function saveFavs(arr) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(arr.slice(0, 200))); } catch (e) {}
}
function favId(p) {
  return String(p.public_id || productId(p) || p.nome || '').trim();
}
function isFav(p, favorites = loadFavs()) {
  const id = favId(p);
  // Compatibilidade: versões anteriores também salvavam productId (marca-nome-volume).
  // IDs internos antigos permanecem no armazenamento, mas não são publicados nem recriados.
  const legacyId = productId(p);
  return isFavoriteId(favorites, id, legacyId);
}
function toggleFav(p) {
  const id = favId(p);
  if (!id) return;
  const legacyId = productId(p);
  saveFavs(toggleFavoriteIds(loadFavs(), id, legacyId));
}

/** Resolve favoritos no catálogo completo, independentemente da sessão ativa. */
function getFavoriteProducts() {
  const favoriteIds = new Set(loadFavs());
  const groups = allGroups(true);
  return collectFavoriteProducts(groups, (item, group) =>
    isFav({ ...item, brand: group.brand, cat: group.cat }, favoriteIds)
  ).map((product) => validateProductPrices(product));

}

function updateFavoritesBadge() {
  const badge = document.getElementById('favoritesBadge');
  if (!badge) return;
  const count = getFavoriteProducts().length;
  badge.textContent = String(count);
  badge.setAttribute('aria-label', `${count} produto(s) favoritado(s)`);
}

function openFavoritesModal() {
  renderFavoritesModal();
  document.getElementById('favoritesModal')?.classList.add('open');
}

function closeFavoritesModal() {
  document.getElementById('favoritesModal')?.classList.remove('open');
}

function renderFavoritesModal() {
  const list = document.getElementById('favoritesList');
  const count = document.getElementById('favoritesCount');
  const addAll = document.getElementById('favoritesAddAll');
  if (!list) return;
  const products = getFavoriteProducts();
  if (count) count.textContent = String(products.length);
  updateFavoritesBadge();
  if (addAll) {
    addAll.disabled = !products.some((p) => isAvailable(p) && !isVariacaoCatalogProduct(p));
    addAll.textContent = '🛒 Adicionar favoritos disponíveis ao carrinho';
  }
  if (!products.length) {
    list.innerHTML = '<div class="favorites-empty"><strong>Sua lista está vazia</strong><span>Toque no coração dos produtos para guardá-los aqui.</span></div>';
    return;
  }
  list.innerHTML = products.map((p) => {
    const id = escapeHtml(favId(p));
    const foto = resolveCatalogImageUrl(p.foto || (Array.isArray(p.fotos) ? p.fotos[0] : ''));
    const available = isAvailable(p);
    const needsVariation = isVariacaoCatalogProduct(p);
    const prices = isScoopProduct(p)
      ? '<span>Preço fixo: R$ ' + escapeHtml(p.varejo || '—') + '</span>'
      : '<span>Varejo: R$ ' + escapeHtml(p.varejo || '—') + '</span>' +
        (p.atacado && p.atacado !== '—' ? '<span>Atacado (6+): R$ ' + escapeHtml(p.atacado) + '</span>' : '');
    const meta = [p.brand, p.volume && p.volume !== '—' ? p.volume : '', p.cat].filter(Boolean).join(' · ');
    const actionLabel = !available ? 'Indisponível' : needsVariation ? 'Escolher opção' : 'Adicionar ao carrinho';
    return '<article class="favorite-row">' +
      (foto ? '<img class="favorite-photo" src="' + escapeHtml(foto) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<div class="favorite-photo favorite-no-photo">Sem foto</div>') +
      '<div class="favorite-info"><strong>' + escapeHtml(p.nome) + '</strong>' +
      '<span class="favorite-meta">' + escapeHtml(meta) + '</span>' +
      '<span class="favorite-prices">' + prices + '</span>' +
      '<div class="favorite-actions">' +
      '<button type="button" data-favorite-action="add" data-favorite-id="' + id + '"' + (!available ? ' disabled' : '') + '>' + actionLabel + '</button>' +
      '<button type="button" class="favorite-remove" data-favorite-action="remove" data-favorite-id="' + id + '">Remover</button>' +
      '</div></div></article>';
  }).join('');
}

function addAllFavoritesToCart() {
  const products = getFavoriteProducts();
  let added = 0;
  let unavailable = 0;
  let needsChoice = 0;
  for (const product of products) {
    if (!isAvailable(product)) {
      unavailable++;
      continue;
    }
    // Roupas e acessórios exigem escolha explícita da variação no detalhe.
    if (isVariacaoCatalogProduct(product)) {
      needsChoice++;
      continue;
    }
    addToCart(product, 1);
    added++;
  }
  renderFavoritesModal();
  if (added) {
    showCartToast(added + ' favorito(s) adicionado(s) ao carrinho');
  } else if (needsChoice) {
    showCartToast('Escolha as opções dos itens sinalizados na lista');
  } else {
    showCartToast('Nenhum favorito disponível para adicionar');
  }
  const note = document.getElementById('favoritesNotice');
  if (note) {
    const parts = [];
    if (added) parts.push(added + ' adicionado(s)');
    if (needsChoice) parts.push(needsChoice + ' aguardando escolha de variação');
    if (unavailable) parts.push(unavailable + ' indisponível(is)');
    note.textContent = parts.join(' · ');
  }
}


function loadRecentSearches() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
}
function pushRecentSearch(q) {
  const t = String(q || '').trim();
  // evita lixo de teclado (repetição / sem letra)
  if (t.length < 2 || t.length > 40) return;
  if (!/[a-zA-Zà-úÀ-Ú0-9]/.test(t)) return;
  const letters = (t.match(/[a-zA-Zà-úÀ-Ú]/g) || []).length;
  if (letters < 2) return;
  let arr = loadRecentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase());
  arr.unshift(t);
  arr = arr.slice(0, 6);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch (e) {}
  renderRecentSearches();
}
function renderRecentSearches() {
  const el = document.getElementById('recentSearches');
  if (!el) return;
  const arr = loadRecentSearches().filter((q) => {
    const t = String(q || '').trim();
    return t.length >= 2 && t.length <= 40 && /[a-zA-Zà-úÀ-Ú]/.test(t);
  });
  if (!arr.length) { el.innerHTML = ''; return; }
  el.innerHTML = arr.map((q) => {
    const safe = escapeHtml(q);
    return `<button type="button" class="recent-chip" data-q="${safe}">${safe}</button>`;
  }).join('') + `<button type="button" class="recent-clear" id="recentClear">Limpar</button>`;
}

function applyViewMode() {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === 'list' || saved === 'grid') state.viewMode = saved;
  } catch (e) {}
  const isList = state.viewMode === 'list';
  document.querySelectorAll('.products').forEach((el) => {
    el.classList.toggle('view-list', isList);
  });
  const g = document.getElementById('viewGrid');
  const l = document.getElementById('viewList');
  if (g) g.classList.toggle('active', !isList);
  if (l) l.classList.toggle('active', isList);
}

function render() {
  // Uma única leitura do armazenamento por renderização, em vez de uma leitura por produto.
  const favoriteIds = new Set(loadFavs());
  if (state.category !== 'Todos' && !sectionActive(state.category)) {
    state.category = 'Todos';
  }
  // Normaliza os termos uma vez; não repete o mesmo trabalho para cada produto.
  const searchTokens = normalizeSearch(state.search).split(' ').filter(Boolean);
  const sourceGroups = allGroups();
  const groups = state.favoritesOnly
    ? filterFavoriteGroups(sourceGroups, (item, group) =>
        isFav({ ...item, brand: group.brand, cat: group.cat }, favoriteIds))
    : sourceGroups;
  let count = 0;
  const byCat = {};

  for (const g of groups) {
    if (!state.favoritesOnly && !sectionActive(g.cat)) continue;
    if (!state.favoritesOnly && state.category !== 'Todos' && g.cat !== state.category) continue;
    const items = state.favoritesOnly ? g.items : g.items.filter(item => {
      if (!inPriceRange(item.varejo)) return false;
      if (state.stock === 'Disponivel' && !isAvailable(item)) return false;
      if (state.stock === 'Esgotado' && isAvailable(item)) return false;
      if (!matchesSearch(item, g.brand, g.cat, state.search, searchTokens)) return false;
      if (!matchesVolumeFilter(item, g.cat, state.volume, g.brand)) return false;
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
    html += `<div class="category ${lineClass}${cat === 'Brand' ? ' cat-brand' : ''}"><div class="category-title">${escapeHtml(catTitle)}</div>`;
    brands.sort((a, b) => a.brand.localeCompare(b.brand, 'pt-BR'));

    for (const b of brands) {
      let sortedItems = sortItems(b.items, b.brand);
      if (cat === 'Scoop Premiado') {
        const SO = { 'scoop cobre': 1, 'scoop bronze': 2, 'scoop prata': 3, 'scoop ouro': 4, 'scoop diamante': 5 };
        sortedItems = [...b.items].sort((a, b) => (SO[(a.nome || '').toLowerCase()] || 99) - (SO[(b.nome || '').toLowerCase()] || 99));
      }
      html += `<div class="brand-group"><div class="brand-name">${escapeHtml(b.brand)}</div><div class="products">`;

      for (const rawItem of sortedItems) {
        const item = validateProductPrices(rawItem);
        const avail = isAvailable(item);
        const isScoop = isScoopProduct({ ...item, cat });
        const varejoShow = item.varejo ? `R$ ${escapeHtml(item.varejo)}` : '—';
        const atacadoShow = item.atacado && item.atacado !== '—' ? `R$ ${escapeHtml(item.atacado)}` : '—';
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
        public_id: item.public_id || '',
                              variacoes: item.variacoes || [],
          total_estoque: item.total_estoque
        }));
        const fotoCard = resolveCatalogImageUrl(item.foto);
        const photoHtml = isScoop
          ? ''
          : (fotoCard
            ? `<div class="photo photo-click loaded" role="button" tabindex="0" data-p="${pdata}" title="Ver detalhes"><img src="${escapeHtml(fotoCard)}" alt="${escapeHtml(item.nome)}" width="80" height="80" decoding="async" referrerpolicy="no-referrer" loading="lazy"></div>`
            : `<div class="photo placeholder photo-click" role="button" tabindex="0" data-p="${pdata}" title="Ver detalhes">SEM<br>FOTO</div>`);
        const isNovo = isNovoRecente(item) || isLancamentoItem(item, cat);
        const badgeEsg = avail ? '' : '<span class="badge-esgotado">ESGOTADO</span>';
        const badgeNovo = (avail && isNovo) ? '<span class="badge-novo">NOVO</span>' : '';
        const atacHint = (!isScoop && avail && item.atacado && item.atacado !== '—')
          ? '<span class="price-atacado-hint">Atacado a partir de 6 itens</span>'
          : '';
        const pricesHtml = isScoop
          ? `<div><span class="price-label">Preço fixo</span><span class="price-v">${varejoShow}</span></div>`
          : `<div><span class="price-label">Varejo</span><span class="price-v">${varejoShow}</span></div>
             <div><span class="price-label">Atacado</span><span class="price-a">${atacadoShow}</span></div>`;
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

        const favOn = isFav(item, favoriteIds);
        html += `
          <div class="${cardClass}${isNovo ? ' has-novo' : ''}">
            <button type="button" class="fav-btn${favOn ? ' on' : ''}" data-fav="${pdata}" aria-label="Favoritar">${favOn ? '♥' : '♡'}</button>
            ${badgeNovo}
            ${badgeEsg}
                        ${photoHtml}
            <div class="info">
              <div class="name">${escapeHtml(item.nome)}</div>
              <div class="meta">${escapeHtml(item.volume || '—')} · ${stockHtml}</div>
              <div class="prices">
                ${pricesHtml}
                ${atacHint || ''}
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

  applyViewMode();
  main.querySelectorAll('.photo-click img, .feat-card img').forEach((img) => {
    img.addEventListener('load', () => {
      img.classList.add('is-loaded');
      img.parentElement?.classList.add('loaded');
    }, { once: true });
    img.addEventListener('error', () => {
      img.style.opacity = '0.3';
      img.parentElement?.classList.add('placeholder');
    }, { once: true });
  });
  main.querySelectorAll('.fav-btn, .feat-fav-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const p = JSON.parse(decodeURIComponent(btn.dataset.fav));
        toggleFav(p);
        updateFavoritesBadge();
        const on = isFav(p);
        btn.classList.toggle('on', on);
        btn.textContent = on ? '♥' : '♡';
        btn.setAttribute('aria-label', on ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
        if (state.favoritesOnly) render();
        if (document.getElementById('favoritesModal')?.classList.contains('open')) renderFavoritesModal();
      } catch (err) {}
    });
  });

  main.querySelectorAll('.feat-card').forEach(btn => {
    const open = () => {
      try { openDetails(JSON.parse(decodeURIComponent(btn.getAttribute('data-p')))); } catch (e) {}
    };
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.feat-fav-btn')) return;
      open();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.target === btn && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        open();
      }
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
        const isScoop = isScoopProduct(item);
        rows.push({
          genero: line.charAt(0).toUpperCase() + line.slice(1),
          marca: g.brand,
          nome: item.nome,
          volume: item.volume || '—',
          preco: item.varejo || '—',
          modalidade: isScoop ? 'Preço fixo' : `Varejo: R$ ${item.varejo || '—'} · Atacado: R$ ${item.atacado || '—'}`,
          status: (item.disponivel || 'Sim') === 'Sim' ? 'Disponível' : 'Esgotado'
        });
      }
    }
  }
  rows.sort((a, b) => a.marca.localeCompare(b.marca, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));

  let table = rows.map(r =>
    `<tr>
      <td>${escapeHtml(r.marca)}</td>
      <td>${escapeHtml(r.nome)}</td>
      <td>${escapeHtml(r.volume)}</td>
      <td>${escapeHtml(r.genero)}</td>
      <td>R$ ${escapeHtml(r.preco)}</td>
      <td>${escapeHtml(r.modalidade)}</td>
      <td>${escapeHtml(r.status)}</td>
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
<thead><tr><th>Marca</th><th>Produto</th><th>Volume</th><th>Gênero</th><th>Preço</th><th>Modalidade</th><th>Status</th></tr></thead>
<tbody>${table}</tbody>
</table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    alert('Permita pop-ups para gerar o PDF.');
    return;
  }
  try { w.opener = null; } catch (e) {}
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
    if (state.search.trim().length >= 2) { clearTimeout(window.__recentSearchT); window.__recentSearchT = setTimeout(() => pushRecentSearch(state.search), 700); };
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
    setTimeout(() => {
      document.getElementById('categoryFilters')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
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
      html += `<button class="fbtn" data-filter="category" data-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`;
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
      html += `<button class="fbtn" data-filter="category" data-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`;
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
      const safe = escapeHtml(c);
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
    <button class="fbtn" data-filter="category" data-value="Scoop Premiado">Scoop Premiado</button>
    <button class="fbtn" data-filter="category" data-value="Outros">Outros</button>`;
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
document.getElementById('cartCheckout').addEventListener('click', async () => {
  if (!cart.length) return;
  const cepResult = await ensureCep('cartObs');
  if (!cepResult.ok) {
    alert(cepResult.reason || 'Não foi possível validar o CEP.');
    return;
  }
  try {
    const saved = JSON.parse(localStorage.getItem('emporio_buy_meta') || '{}');
    localStorage.setItem('emporio_buy_meta', JSON.stringify({
      ...saved,
      nome: document.getElementById('cartClientName')?.value?.trim() || saved.nome || '',
      cep: cepResult.cep,
      cidade: cepResult.cidade,
      uf: cepResult.uf
    }));
  } catch (e) {}
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

/** Temas sazonais: regra alinhada ao catálogo Beauty — feriados no dia, campanhas em janela e Natal de 01/12 a 30/12 */
const SEASONAL_THEMES = [
  // month: 1-12 · janela: 3 dias antes → 2 dias depois
  { id: 'ano-novo', month: 1, day: 1, daysBefore: 0, daysAfter: 0, label: '✨ Feliz Ano Novo no Empório A.R!', emoji: '✨' },
  { id: 'carnaval', month: 2, day: 17, label: '🎭 Carnaval no Empório A.R — venha se fantasiar de perfume!', emoji: '🎭' },
  { id: 'mulheres', month: 3, day: 8, label: '💐 Dia Internacional da Mulher — Empório A.R', emoji: '💐' },
  { id: 'consumidor', month: 3, day: 15, label: '🛍️ Dia do Consumidor — condições especiais no Empório A.R', emoji: '🛍️' },
  { id: 'pascoa', month: 4, day: 5, label: '🐰 Feliz Páscoa no Empório A.R!', emoji: '🐰' },
  { id: 'tiradentes', month: 4, day: 21, daysBefore: 0, daysAfter: 0, label: '🇧🇷 Tiradentes — Empório A.R', emoji: '🇧🇷' },
  { id: 'trabalho', month: 5, day: 1, daysBefore: 0, daysAfter: 0, label: '⚒️ Dia do Trabalho — ofertas no Empório A.R', emoji: '⚒️' },
  { id: 'maes', month: 5, day: 10, label: '💝 Dia das Mães — o presente perfeito no Empório A.R', emoji: '💝' },
  { id: 'namorados', month: 6, day: 12, label: '💕 Dia dos Namorados — Empório A.R', emoji: '💕' },
  { id: 'sao-joao', month: 6, day: 24, daysBefore: 0, daysAfter: 0, label: '🌽 São João no Empório A.R!', emoji: '🌽' },
  { id: 'amigos', month: 7, day: 20, daysBefore: 0, daysAfter: 0, label: '🤝 Dia do Amigo — Empório A.R', emoji: '🤝' },
  { id: 'pais', month: 8, day: 9, label: '👔 Dia dos Pais — Empório A.R', emoji: '👔' },
  { id: 'independencia', month: 9, day: 7, daysBefore: 0, daysAfter: 0, label: '🇧🇷 Independência do Brasil — Empório A.R', emoji: '🇧🇷' },
  { id: 'cliente', month: 9, day: 15, label: '🌟 Dia do Cliente — obrigado por comprar no Empório A.R!', emoji: '🌟' },
  { id: 'criancas', month: 10, day: 12, label: '🎈 Dia das Crianças — Empório A.R', emoji: '🎈' },
  { id: 'professores', month: 10, day: 15, daysBefore: 0, daysAfter: 0, label: '📚 Dia dos Professores — Empório A.R', emoji: '📚' },
  { id: 'halloween', month: 10, day: 31, daysBefore: 3, daysAfter: 1, label: '🎃 Halloween no Empório A.R — ofertas assustadoras!', emoji: '🎃' },
  { id: 'finados', month: 11, day: 2, daysBefore: 0, daysAfter: 0, label: '🕯️ Finados — Empório A.R', emoji: '🕯️' },
  { id: 'republica', month: 11, day: 15, daysBefore: 0, daysAfter: 0, label: '🇧🇷 Proclamação da República — Empório A.R', emoji: '🇧🇷' },
  { id: 'consciencia-negra', month: 11, day: 20, daysBefore: 0, daysAfter: 0, label: '✊ Consciência Negra — Empório A.R', emoji: '✊' },
  { id: 'black-friday', month: 11, day: 27, label: '🖤 Black Friday no Empório A.R — não perca!', emoji: '🖤' },
  { id: 'cyber-monday', month: 11, day: 30, label: '💻 Cyber Monday no Empório A.R!', emoji: '💻' },
  { id: 'natal', month: 12, day: 25, daysBefore: 24, daysAfter: 5, label: '🎄 Feliz Natal no Empório A.R!', emoji: '🎄' },
  { id: 'vira-ano', month: 12, day: 31, daysBefore: 0, daysAfter: 0, label: '🥂 Réveillon no Empório A.R!', emoji: '🥂' },
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
      // padrão: 3 dias antes → 2 dias depois; tema pode sobrescrever (ex.: Finados só no dia)
      const before = Number.isFinite(theme.daysBefore) ? theme.daysBefore : 3;
      const after = Number.isFinite(theme.daysAfter) ? theme.daysAfter : 2;
      if (delta >= -before && delta <= after) {
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

document.getElementById('shareIgStory')?.addEventListener('click', async () => {
  if (!currentProduct) return;
  closeShareSheet();
  await downloadStoryCard(currentProduct);
  alert('Imagem salva! Abra o Instagram → Stories → Galeria e escolha a imagem do Empório A.R.');
});
document.getElementById('shareWaStatus')?.addEventListener('click', async () => {
  if (!currentProduct) return;
  closeShareSheet();
  await downloadStoryCard(currentProduct);
  alert('Imagem salva! Abra o WhatsApp → Status → Galeria e escolha a imagem do Empório A.R.');
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


(function cartObsCepMask(){
  const el = document.getElementById('cartObs');
  if (!el) return;
  el.addEventListener('input', () => {
    let v = el.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
    el.value = v;
  });
})();


document.getElementById('buyMetaClose')?.addEventListener('click', closeBuyMetaModal);
document.getElementById('buyMetaModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'buyMetaModal') closeBuyMetaModal();
});
document.getElementById('buyMetaConfirm')?.addEventListener('click', confirmBuyMeta);

bindCepField('buyClientCep');
bindCepField('cartObs');


document.getElementById('navCrumb')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-nav]');
  if (!btn) return;
  if (btn.dataset.nav === 'home') goNavHome();
  if (btn.dataset.nav === 'session') goNavSession();
});
document.getElementById('btnBackSubcat')?.addEventListener('click', () => goNavSession());


document.getElementById('btnClearFilters')?.addEventListener('click', clearAllFilters);
document.getElementById('btnTop')?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
window.addEventListener('scroll', () => {
  const btn = document.getElementById('btnTop');
  if (!btn) return;
  btn.classList.toggle('show', window.scrollY > 450);
}, { passive: true });


document.getElementById('viewGrid')?.addEventListener('click', () => {
  state.viewMode = 'grid';
  try { localStorage.setItem(VIEW_KEY, 'grid'); } catch (e) {}
  applyViewMode();
  // re-render garante classes nos .products recém-montados
  render();
});
document.getElementById('viewList')?.addEventListener('click', () => {
  state.viewMode = 'list';
  try { localStorage.setItem(VIEW_KEY, 'list'); } catch (e) {}
  applyViewMode();
  render();
});
document.getElementById('btnFavOnly')?.addEventListener('click', openFavoritesModal);
document.getElementById('favoritesClose')?.addEventListener('click', closeFavoritesModal);
document.getElementById('favoritesModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'favoritesModal') closeFavoritesModal();
});
document.getElementById('favoritesAddAll')?.addEventListener('click', addAllFavoritesToCart);
document.getElementById('favoritesList')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-favorite-action]');
  if (!button) return;
  const id = button.getAttribute('data-favorite-id') || '';
  const action = button.getAttribute('data-favorite-action');
  const product = getFavoriteProducts().find((item) => favId(item) === id || productId(item) === id);
  if (!product) return;
  if (action === 'remove') {
    toggleFav(product);
    if (getFavoriteProducts().length === 0) {
      closeFavoritesModal();
    } else {
      renderFavoritesModal();
    }
    render();
  } else if (action === 'add') {
    if (isVariacaoCatalogProduct(product)) {
      closeFavoritesModal();
      openDetails(product);
    } else {
      addToCart(product, 1);
    }
  }
});
document.getElementById('recentSearches')?.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'recentClear') {
    try { localStorage.removeItem(RECENT_KEY); } catch (err) {}
    renderRecentSearches();
    return;
  }

  const chip = e.target.closest('.recent-chip');
  if (!chip) return;
  const q = chip.getAttribute('data-q') || '';
  const input = document.getElementById('q');
  if (input) input.value = q;
  state.search = q;
  document.getElementById('searchWrap')?.classList.remove('is-focused');
  document.getElementById('recentSearches')?.classList.remove('open');
  render();
});
renderRecentSearches();

(function setupSearchDropdown() {
  const input = document.getElementById('q');
  const wrap = document.getElementById('searchWrap') || input?.closest('.search');
  const box = document.getElementById('recentSearches');
  if (!input || !wrap) return;
  const open = () => {
    renderRecentSearches();
    if (box && box.children.length) {
      wrap.classList.add('is-focused');
      box.classList.add('open');
    }
  };
  const close = () => {
    wrap.classList.remove('is-focused');
    box?.classList.remove('open');
  };
  input.addEventListener('focus', open);
  input.addEventListener('click', open);
  input.addEventListener('input', () => {
    // mantém aberto enquanto digita se houver histórico
    if (box && box.children.length) {
      wrap.classList.add('is-focused');
      box.classList.add('open');
    }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });
})();

try {
  const vm = localStorage.getItem(VIEW_KEY);
  if (vm === 'list' || vm === 'grid') state.viewMode = vm;
} catch (e) {}

updateCartUI();
render();
updateFavoritesBadge();
syncStockFromRoot().then((ok) => {
  if (ok) render();
  openProductFromUrl();
});
// Deep link mesmo sem esperar estoque (fallback)
setTimeout(() => openProductFromUrl(), 400);
