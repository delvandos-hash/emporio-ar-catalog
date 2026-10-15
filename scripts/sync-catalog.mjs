/**
 * Sincroniza estoque + novos produtos (Imarat + Brand filtrado)
 * Envia os dados para o GitHub Gist
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
  'ARABIC COLLECTION',
  'BEAUTY BRAND',
  'BODY SPLAHS',
  'BODY SPLASH',
  'COLEÇÂO DREAM',
  'COLECAO DREAM',
  'COLEÇÃO BRAND',
  'COLECAO BRAND',
  'DREAM BRAND 80/100ML',
  'DREAM BRAND',
  'FLACONETE BRAND',
  'FLACONETE  BRAND',
  'SAPATINHO GOOD GIRL',
];

const ADD_IMARAT_NEW = process.env.ADD_IMARAT_NEW !== '0';
const ADD_BRAND_NEW = process.env.ADD_BRAND_NEW !== '0';

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

function priceImarat(priceCents, atacadoCents) {
  const varejoOrig = (priceCents || 0) / 100;
  const atacadoOrig = atacadoCents != null ? atacadoCents / 100 : Math.max(varejoOrig - 30, 0);
  return { varejo: fmtBRL(varejoOrig + 30), atacado: fmtBRL(atacadoOrig + 30) };
}

function priceBrand(orig, isArabicMini) {
  if (isArabicMini) return { varejo: '125,00', atacado: '85,00' };
  if (orig <= 100) return { varejo: fmtBRL(orig + 60), atacado: fmtBRL(orig + 40) };
  return { varejo: fmtBRL(orig + 90), atacado: fmtBRL(orig + 70) };
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

function itemKey(nome, brand, volume) {
  return `${norm(nome)}|${norm(brand)}|${norm(volume || '')}`;
}

function buildIndex(DATA) {
  const set = new Set();
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      for (const it of g.items) {
        set.add(itemKey(it.nome, g.brand, it.volume));
        set.add(itemKey(it.nome, g.brand, ''));
        set.add(norm(it.nome));
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
    return 'BODY SPLAHS';
  }
  return null;
}

function isAllowedBrandProduct(p) {
  const raw = String(p.categoria_nome || p.categoria || '');
  return mapBrandSession(raw) != null;
}

function brandDisponivel(p) {
  if (p.status === false) return 'Não';
  if (p.controlar_estoque && p.total_estoque != null && Number(p.total_estoque) <= 0) return 'Não';
  return 'Sim';
}

function isArabicMiniBrand(p, session) {
  if (session === 'ARABIC COLLECTION') {
    const nome = String(p.nome || '').toUpperCase();
    return nome.includes('25ML') || nome.includes('25 ML');
  }
  return false;
}

async function fetchImaratList() {
  const all = [];
  let page = 1, total = 0, fetched = 0;
  for (let g = 0; g < 40; g++) {
    const res = await fetch(`${IMARAT_API}?page=${page}&perPage=60`, {
      headers: { 'User-Agent': 'EmporioAR-Sync/1.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Imarat list HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);
    const data = JSON.parse(text);
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
    const buffer = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);
    return JSON.parse(text);
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
    const buffer = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);
    const data = JSON.parse(text);
    const products = Array.isArray(data) ? data : data.produtos || [];
    if (!products.length) break;
    all.push(...products);
  }
  return all;
}

async function main() {
  console.log('Carregando data.js...');
  let raw = fs.readFileSync(dataPath, 'utf8');
  const m = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!m) throw new Error('DATA não encontrado');
  const DATA = JSON.parse(m[1]);
  const index = buildIndex(DATA);

  console.log(`Flags: ADD_IMARAT_NEW=${ADD_IMARAT_NEW} ADD_BRAND_NEW=${ADD_BRAND_NEW}`);

  // ---- IMARAT ----
  console.log('Buscando Imarat...');
  const imaratList = await fetchImaratList();
  console.log(`Imarat: ${imaratList.length} produtos`);

  let stockChanged = 0;
  let addedImarat = 0;

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      if (g.cat === 'Brand' || String(g.cat || '').startsWith('Brand')) continue;
      for (const it of g.items) {
        const n = norm(it.nome);
        const b = norm(g.brand);
        const hit =
          imaratList.find(
            (p) =>
              norm(p.name) === n &&
              (norm(p.brand) === b || !b || norm(p.brand).includes(b) || b.includes(norm(p.brand)))
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

  if (ADD_IMARAT_NEW) {
    for (const p of imaratList) {
      const nome = p.name;
      const brand = (p.brand || 'Outros').toUpperCase();
      const volume = volumeFrom(p.sizeMl, nome);
      if (index.has(itemKey(nome, brand, volume)) || index.has(itemKey(nome, brand, '')) || index.has(norm(nome)))
        continue;

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
      index.add(itemKey(nome, brand, volume));
      index.add(itemKey(nome, brand, ''));
      index.add(norm(nome));
      addedImarat++;
    }
  } else {
    console.log('Imarat: novos IGNORADOS (só estoque)');
  }

  // ---- BRAND ----
  console.log('Buscando Brand Collection...');
  const brandList = await fetchBrandList();
  const brandAllowed = brandList.filter(isAllowedBrandProduct);
  console.log(`Brand total: ${brandList.length} | nas sessões permitidas: ${brandAllowed.length}`);

  let addedBrand = 0;

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      if (!(g.cat === 'Brand' || String(g.cat || '').startsWith('Brand'))) continue;
      for (const it of g.items) {
        const n = norm(it.nome);
        const hit =
          brandList.find((p) => norm(p.nome) === n) ||
          brandList.find((p) => n.length > 6 && (n.includes(norm(p.nome)) || norm(p.nome).includes(n)));
        if (!hit) continue;
        const disp = brandDisponivel(hit);
        if ((it.disponivel || 'Sim') !== disp) {
          it.disponivel = disp;
          stockChanged++;
        }
      }
    }
  }

  if (ADD_BRAND_NEW) {
    for (const p of brandAllowed) {
      const nome = p.nome || '';
      if (!nome) continue;
      const session = mapBrandSession(p.categoria_nome || p.categoria || '');
      if (!session) continue;

      const volume = volumeFrom(null, nome);
      if (index.has(itemKey(nome, session, volume)) || index.has(itemKey(nome, session, '')) || index.has(norm(nome)))
        continue;

      const orig = typeof p.preco === 'number' ? p.preco : parseOrig(p.preco);
      const prices = priceBrand(orig, isArabicMiniBrand(p, session));
      const line = genderLine(nome + ' ' + session);
      let foto = '';
      if (p.imagens && p.imagens[0]) {
        const img = p.imagens[0];
        foto = img.startsWith('http')
          ? img
          : `https://arquivos-cdn.facilzap.app.br/${img}?width=700&height=700&quality=85&format=webp`;
      }
      const notas = (p.descricao && String(p.descricao).trim()) || '';

      const group = ensureBrandGroup(DATA, line, session, 'Brand');
      group.items.push({
        nome,
        volume,
        varejo: prices.varejo,
        atacado: prices.atacado,
        disponivel: brandDisponivel(p),
        notas: notas.slice(0, 500),
        foto,
      });
      index.add(itemKey(nome, session, volume));
      index.add(itemKey(nome, session, ''));
      index.add(norm(nome));
      addedBrand++;
    }
  } else {
    console.log('Brand: novos IGNORADOS (só estoque)');
  }

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      g.items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
    DATA[line].sort((a, b) => String(a.brand).localeCompare(String(b.brand), 'pt-BR'));
  }

  const out =
    '/** Empório A.R — sync ' +
    new Date().toISOString() +
    ` | +${addedImarat} Imarat +${addedBrand} Brand (sessões filtradas) | estoqueΔ ${stockChanged} */\n` +
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
  console.log('data.js atualizado localmente.');

  // Envia para o GitHub Gist
  console.log('Enviando dados para o GitHub Gist...');
  
  try {
    const gistId = "bac3a717b309d02379455e971c9a9103";
    const githubToken = process.env.GIST_TOKEN;
    
    if (!githubToken) {
      throw new Error('GIST_TOKEN não configurado nos secrets do GitHub');
    }
    
    const dadosParaSite = {
      DATA: DATA,
      WHATSAPP: "5562991134488",
      BRAND: { name: "Empório A.R", phone: "(62) 99113-4488" },
      ultimaAtualizacao: new Date().toISOString()
    };

    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: {
          'catalogo.json': {
            content: '\uFEFF' + JSON.stringify(dadosParaSite, null, 2)
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API ${response.status}: ${errorText}`);
    }

    console.log('✅ Dados enviados para o GitHub Gist com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao enviar para o GitHub Gist:', error);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
