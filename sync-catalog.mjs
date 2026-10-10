/**
 * Sincroniza estoque + adiciona produtos NOVOS da Imarat e Brand Collection
 * Mantém precificação Empório A.R e não sobrescreve itens já existentes.
 *
 * Uso: node scripts/sync-catalog.mjs
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

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function fmtBRL(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toFixed(2).replace('.', ',');
}

function parseOrig(s) {
  if (s == null) return 0;
  const n = parseFloat(String(s).replace(/[R$\s]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/** Preço Imarat: +R$30 no varejo e no atacado do site raiz */
function priceImarat(priceCents, atacadoCents) {
  const varejoOrig = (priceCents || 0) / 100;
  const atacadoOrig = atacadoCents != null ? atacadoCents / 100 : Math.max(varejoOrig - 30, 0);
  return {
    varejo: fmtBRL(varejoOrig + 30),
    atacado: fmtBRL(atacadoOrig + 30),
  };
}

/** Preço Brand Collection */
function priceBrand(orig, isArabicMini) {
  if (isArabicMini) return { varejo: '125,00', atacado: '85,00' };
  if (orig <= 100) return { varejo: fmtBRL(orig + 60), atacado: fmtBRL(orig + 30) };
  return { varejo: fmtBRL(orig + 90), atacado: fmtBRL(orig + 60) };
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
  const heart = (notes.heart || notes.coracao || notes.heart || []).join(', ');
  const base = (notes.base || notes.fundo || []).join(', ');
  const parts = [];
  if (top) parts.push('Saída: ' + top);
  if (heart) parts.push('Coração: ' + heart);
  if (base) parts.push('Fundo: ' + base);
  return parts.join(' | ');
}

function itemKey(nome, brand, volume) {
  return `${norm(nome)}|${norm(brand)}|${norm(volume || '')}`;
}

function buildIndex(DATA) {
  const set = new Set();
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      for (const it of g.items) {
        set.add(itemKey(it.nome, g.brand, it.volume));
        set.add(itemKey(it.nome, g.brand, '')); // name+brand only
        set.add(norm(it.nome)); // name only fallback
      }
    }
  }
  return set;
}

function ensureBrandGroup(DATA, line, brand, cat) {
  DATA[line] = DATA[line] || [];
  let g = DATA[line].find((x) => x.brand === brand && x.cat === cat);
  if (!g) {
    g = { cat, brand, items: [] };
    DATA[line].push(g);
  }
  return g;
}

async function fetchImaratList() {
  const all = [];
  let page = 1, total = 0, fetched = 0;
  for (let g = 0; g < 40; g++) {
    const res = await fetch(`${IMARAT_API}?page=${page}&perPage=60`, {
      headers: { 'User-Agent': 'EmporioAR-Sync/1.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Imarat list HTTP ${res.status}`);
    const data = await res.json();
    total = data.total || total;
    const products = data.products || [];
    if (!products.length) break;
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
      headers: { 'User-Agent': 'EmporioAR-Sync/1.0', Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchBrandList() {
  const all = [];
  const warm = await fetch(`${BRAND_BASE}/c/atacado/${BRAND_SELLER}`, {
    headers: { 'User-Agent': 'EmporioAR-Sync/1.0' },
  });
  const setCookie = warm.headers.get('set-cookie') || '';
  const cookie = setCookie.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');

  for (let page = 1; page <= 80; page++) {
    const res = await fetch(
      `${BRAND_BASE}/c/atacado/carregar_produtos/${page}/todas/${BRAND_SELLER}`,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'EmporioAR-Sync/1.0',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Referer: `${BRAND_BASE}/c/atacado/${BRAND_SELLER}`,
          Origin: BRAND_BASE,
          'X-Requested-With': 'XMLHttpRequest',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify({ pagina_especifica: '' }),
      }
    );
    if (!res.ok) break;
    const data = await res.json();
    const products = Array.isArray(data) ? data : data.produtos || [];
    if (!products.length) break;
    all.push(...products);
  }
  return all;
}

function brandDisponivel(p) {
  if (p.status === false) return 'Não';
  if (p.controlar_estoque && p.total_estoque != null && Number(p.total_estoque) <= 0) return 'Não';
  return 'Sim';
}

function isArabicMiniBrand(p) {
  const cat = String(p.categoria_nome || p.categoria || '').toUpperCase();
  const nome = String(p.nome || '').toUpperCase();
  return cat.includes('ARABIC') || (nome.includes('ARABIC') && (nome.includes('25ML') || nome.includes('25 ML')));
}

async function main() {
  console.log('Carregando data.js...');
  let raw = fs.readFileSync(dataPath, 'utf8');
  const m = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!m) throw new Error('DATA não encontrado');
  const DATA = JSON.parse(m[1]);
  const index = buildIndex(DATA);

  // ---- ESTOQUE + NOVOS: IMARAT ----
  console.log('Buscando Imarat...');
  const imaratList = await fetchImaratList();
  console.log(`Imarat: ${imaratList.length} produtos`);

  let stockChanged = 0;
  let addedImarat = 0;

  // index existing by norm name for stock update on Imarat items
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      if (g.cat === 'Brand' || String(g.cat || '').startsWith('Brand')) continue;
      for (const it of g.items) {
        const n = norm(it.nome);
        const b = norm(g.brand);
        const hit = imaratList.find(
          (p) => norm(p.name) === n && (norm(p.brand) === b || !b || norm(p.brand).includes(b) || b.includes(norm(p.brand)))
        ) || imaratList.find((p) => norm(p.name) === n);
        if (!hit) continue;
        const disp = hit.inStock === true ? 'Sim' : 'Não';
        if ((it.disponivel || 'Sim') !== disp) {
          it.disponivel = disp;
          stockChanged++;
        }
      }
    }
  }

  for (const p of imaratList) {
    const nome = p.name;
    const brand = (p.brand || 'Outros').toUpperCase();
    const volume = volumeFrom(p.sizeMl, nome);
    const k1 = itemKey(nome, brand, volume);
    const k2 = itemKey(nome, brand, '');
    if (index.has(k1) || index.has(k2) || index.has(norm(nome))) continue;

    // detalhe para notas (só novos)
    let notas = '';
    if (p.slug) {
      const detail = await fetchImaratDetail(p.slug);
      if (detail) {
        notas = notesToText(detail.notes) || (detail.shortDesc || detail.description || '').slice(0, 400);
      }
    }

    const prices = priceImarat(p.priceCents, p.atacado && p.atacado.precoCents);
    const line = genderLine(p.gender);
    const foto = p.image
      ? p.image.startsWith('http')
        ? p.image
        : IMARAT_ORIGIN + p.image
      : '';
    const cat = volume && volume !== '—' && parseFloat(volume) <= 35 ? 'Miniaturas' : 'Perfumes';

    const group = ensureBrandGroup(DATA, line, brand, cat);
    group.items.push({
      nome,
      volume,
      varejo: prices.varejo,
      atacado: prices.atacado,
      disponivel: p.inStock === true ? 'Sim' : 'Não',
      notas: notas || '',
      foto,
    });
    index.add(k1);
    index.add(k2);
    index.add(norm(nome));
    addedImarat++;
  }

  // ---- ESTOQUE + NOVOS: BRAND ----
  console.log('Buscando Brand Collection...');
  const brandList = await fetchBrandList();
  console.log(`Brand: ${brandList.length} produtos`);

  let addedBrand = 0;
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      if (!(g.cat === 'Brand' || String(g.cat || '').startsWith('Brand'))) continue;
      for (const it of g.items) {
        const n = norm(it.nome);
        const hit =
          brandList.find((p) => norm(p.nome) === n) ||
          brandList.find((p) => n.includes(norm(p.nome)) || norm(p.nome).includes(n));
        if (!hit) continue;
        const disp = brandDisponivel(hit);
        if ((it.disponivel || 'Sim') !== disp) {
          it.disponivel = disp;
          stockChanged++;
        }
      }
    }
  }

  for (const p of brandList) {
    const nome = p.nome || '';
    if (!nome) continue;
    const subBrand = String(p.categoria_nome || p.categoria || 'Brand').trim() || 'Brand';
    const volume = volumeFrom(null, nome);
    const k1 = itemKey(nome, subBrand, volume);
    const k2 = itemKey(nome, subBrand, '');
    if (index.has(k1) || index.has(k2) || index.has(norm(nome))) continue;

    const orig = typeof p.preco === 'number' ? p.preco : parseOrig(p.preco);
    const prices = priceBrand(orig, isArabicMiniBrand(p));
    const line = genderLine(nome + ' ' + subBrand);
    let foto = '';
    if (p.imagens && p.imagens[0]) {
      const img = p.imagens[0];
      foto = img.startsWith('http')
        ? img
        : `https://arquivos-cdn.facilzap.app.br/${img}?width=700&height=700&quality=85&format=webp`;
    }
    const notas = (p.descricao && String(p.descricao).trim()) || '';

    const group = ensureBrandGroup(DATA, line, subBrand, 'Brand');
    group.items.push({
      nome,
      volume,
      varejo: prices.varejo,
      atacado: prices.atacado,
      disponivel: brandDisponivel(p),
      notas: notas.slice(0, 500),
      foto,
    });
    index.add(k1);
    index.add(k2);
    index.add(norm(nome));
    addedBrand++;
  }

  // sort items within groups
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      g.items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
    DATA[line].sort((a, b) => String(a.brand).localeCompare(String(b.brand), 'pt-BR'));
  }

  const out =
    '/** Empório A.R — sync ' +
    new Date().toISOString() +
    ` | +${addedImarat} Imarat +${addedBrand} Brand | estoqueΔ ${stockChanged} */\n` +
    'export const DATA = ' +
    JSON.stringify(DATA) +
    ';\n' +
    'export const WHATSAPP = "5562991134488";\n' +
    'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };\n';

  fs.writeFileSync(dataPath, out, 'utf8');
  console.log('---');
  console.log(`Novos Imarat: ${addedImarat}`);
  console.log(`Novos Brand: ${addedBrand}`);
  console.log(`Estoque alterado: ${stockChanged}`);
  console.log('data.js atualizado.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
