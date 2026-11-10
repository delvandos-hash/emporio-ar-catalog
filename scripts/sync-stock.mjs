/**
 * Atualiza disponivel no data.js — Imarat + Brand Collection
 * Envia os dados para o GitHub Gist
 * Correção: leitura UTF-8 correta.
 */
import fs from 'fs';
import path from 'path';
import { toPublicCatalog } from './public-catalog.mjs';
import { sanitizePublicImageUrl } from './public-image-url.mjs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'js', 'data.js');
const IMARAT_API = process.env.IMARAT_API_URL;
const BRAND_BASE = process.env.BRAND_BASE_URL;
const BRAND_SELLER = 'darlanaugusto';

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

async function fetchImarat() {
  const map = {}; const byName = {};
  let page = 1, total = 0, fetched = 0;
  for (let g = 0; g < 40; g++) {
    const res = await fetchWithRetry(`${IMARAT_API}?page=${page}&perPage=60`, { headers: { 'User-Agent': 'EmporioAR-StockSync/1.0', 'Accept': 'application/json', 'Accept-Charset': 'utf-8' } });
    if (!res.ok) throw new Error(`Imarat HTTP ${res.status}`);
    const text = await res.text();
    const data = JSON.parse(text);
    total = data.total || total;
    const products = data.products || [];
    if (!products.length) break;
    for (const p of products) {
      const disponivel = p.inStock === true ? 'Sim' : 'Não';
      map[`${norm(p.name)}|${norm(p.brand)}`] = disponivel;
      if (byName[norm(p.name)] !== 'Não') byName[norm(p.name)] = disponivel;
      fetched++;
    }
    if (fetched >= total || products.length < 60) break;
    page++;
  }
  return { map, byName, fetched, total };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, options = {}, retries = 4) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (e) {
      lastErr = e;
      const wait = 1500 * (i + 1) + Math.floor(Math.random() * 1000);
      console.log(`  ⏳ retry ${i + 1}/${retries} em ${wait}ms: ${e.message || e.cause?.code || e}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function fetchBrand() {
  const map = {}; const byName = {};
  let fetched = 0;
  let cookie = '';

  const warm = await fetchWithRetry(`${BRAND_BASE}/c/atacado/${BRAND_SELLER}`, {
    headers: { 'User-Agent': 'EmporioAR-StockSync/1.0', Accept: 'text/html' },
  });
  if (!warm.ok) throw new Error(`Brand warm-up HTTP ${warm.status}`);
  const setCookie = warm.headers.getSetCookie?.() || [];
  if (setCookie.length) {
    cookie = setCookie.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
  } else {
    const sc = warm.headers.get('set-cookie') || '';
    cookie = sc.split(/,(?=[^;]+?=)/).map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
  }
  await warm.text().catch(() => {});

  let completed = false;
  for (let page = 1; page <= 80; page++) {
    const res = await fetchWithRetry(
      `${BRAND_BASE}/c/atacado/carregar_produtos/${page}/todas/${BRAND_SELLER}`,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'EmporioAR-StockSync/1.0',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Referer: `${BRAND_BASE}/c/atacado/${BRAND_SELLER}`,
          Origin: BRAND_BASE,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept-Charset': 'utf-8',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: '{}',
      },
      4
    );
    if (!res.ok) throw new Error(`Brand HTTP ${res.status} na página ${page}`);
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<!') || text.includes('<html')) {
      throw new Error(`Brand página ${page}: HTML/vazio em vez de JSON; coleta incompleta`);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Brand página ${page}: JSON inválido; coleta incompleta`);
    }
    const products = Array.isArray(data) ? data : data.produtos;
    if (!Array.isArray(products)) {
      throw new Error(`Brand página ${page}: estrutura de produtos inválida`);
    }
    if (!products.length) {
      completed = true;
      break;
    }
    for (const p of products) {
      const name = p.nome || p.titulo || '';
      const cat = p.categoria_nome || p.categoria || '';
      if (!name) throw new Error(`Brand página ${page}: produto sem nome; coleta inválida`);
      const disponivel =
        p.disponivel === false || p.estoque === 0 || p.total_estoque === 0
          ? 'Não'
          : 'Sim';
      map[`${norm(name)}|${norm(cat)}`] = disponivel;
      if (byName[norm(name)] !== 'Não') byName[norm(name)] = disponivel;
      fetched++;
    }
    if (page === 80) throw new Error('Brand atingiu o limite de 80 páginas sem fim confirmado');
    await sleep(300 + Math.floor(Math.random() * 400));
  }
  if (!completed || fetched === 0) {
    throw new Error(`Coleta Brand incompleta: ${fetched} produtos e fim da paginação não confirmado`);
  }
  console.log(`Brand coleta completa: ${fetched} produtos; paginação encerrada com página vazia.`);
  return { map, byName, fetched };
}

function resolve(item, brand, map, byName) {
  const n = norm(item.nome); const b = norm(brand);
  if (map[`${n}|${b}`]) return map[`${n}|${b}`];
  for (const [k, v] of Object.entries(map)) {
    const [kn, kb] = k.split('|');
    if (kn === n && (kb.includes(b) || b.includes(kb) || !b)) return v;
  }
  if (byName[n]) return byName[n];
  for (const [kn, v] of Object.entries(byName)) {
    if (kn.length > 6 && (n.includes(kn) || kn.includes(n))) return v;
  }
  return null;
}

async function main() {
  const requiredSources = ['IMARAT_API_URL','IMARAT_ORIGIN_URL','BRAND_BASE_URL','CDN_IMAGE_BASE_URL','CDN_IMAGE_FALLBACK_BASE_URL','DANDE_BASE_URL'];
  const missingSources = requiredSources.filter((key) => !process.env[key]);
  if (missingSources.length) throw new Error('Configure os secrets de origem no GitHub Actions: ' + missingSources.join(', '));
  console.log('Buscando Imarat...');
  const imarat = await fetchImarat();
  console.log(`Imarat: ${imarat.fetched}/${imarat.total}`);

  console.log('Buscando Brand Collection...');
  const brand = await fetchBrand();
  console.log(`Brand: ${brand.fetched} (coleta completa)`);

  let raw = fs.readFileSync(dataPath, 'utf8');
  const m = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!m) throw new Error('DATA não encontrado');
  const DATA = JSON.parse(m[1]);

  let changed = 0, matched = 0;
  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      const isBrand = g.cat === 'Brand' || String(g.cat || '').startsWith('Brand');
      const map = isBrand ? brand.map : imarat.map;
      const byName = isBrand ? brand.byName : imarat.byName;
      for (const item of g.items) {
        const next = resolve(item, g.brand, map, byName);
        if (!next) continue;
        matched++;
        if ((item.disponivel || 'Sim') !== next) { item.disponivel = next; changed++; }
      }
    }
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

  const out = '/** Empório A.R — estoque sincronizado ' + new Date().toISOString() + ' (Imarat+Brand) */\n' + 'export const DATA = ' + JSON.stringify(DATA) + ';\n' + 'export const WHATSAPP = "5562991134488";\n' + 'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };\n';

  fs.writeFileSync(dataPath, out, 'utf8');
  console.log(`Correspondências: ${matched} | Alterados: ${changed}`);
  console.log('data.js atualizado localmente.');

  console.log('Enviando dados para o GitHub Gist...');
  try {
    const gistId = "11918b7196b3ee6a0d8a91739167b312";
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
