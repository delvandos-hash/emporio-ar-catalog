/**
 * Atualiza disponivel no data.js — Imarat + Brand Collection
 * Envia os dados para o GitHub Gist
 * Correção: leitura UTF-8 correta.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'js', 'data.js');
const IMARAT_API = 'https://imaratperfumaria.com/api/products';
const BRAND_BASE = 'https://brandcollectionpy.com.br';
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
  try {
    const warm = await fetchWithRetry(`${BRAND_BASE}/c/atacado/${BRAND_SELLER}`, {
      headers: { 'User-Agent': 'EmporioAR-StockSync/1.0', Accept: 'text/html' },
    });
    const setCookie = warm.headers.getSetCookie?.() || [];
    if (setCookie.length) {
      cookie = setCookie.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
    } else {
      const sc = warm.headers.get('set-cookie') || '';
      cookie = sc.split(/,(?=[^;]+?=)/).map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
    }
    await warm.text().catch(() => {});
  } catch (e) {
    console.log('  ⚠ Brand warm-up falhou:', e.message || e);
  }

  for (let page = 1; page <= 80; page++) {
    let res;
    try {
      res = await fetchWithRetry(
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
    } catch (e) {
      console.log(`  ⚠ Brand página ${page} falhou após retries: ${e.message || e.cause?.code || e}`);
      break;
    }
    if (!res.ok) {
      console.log(`  ⚠ Brand HTTP ${res.status} na página ${page}`);
      break;
    }
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<!') || text.includes('<html')) {
      console.log(`  ⚠ Brand página ${page}: HTML em vez de JSON`);
      break;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.log(`  ⚠ Brand página ${page}: JSON inválido`);
      break;
    }
    const products = Array.isArray(data) ? data : (data.produtos || []);
    if (!products.length) break;
    for (const p of products) {
      const name = p.nome || p.titulo || '';
      const cat = p.categoria_nome || p.categoria || '';
      const disponivel =
        p.disponivel === false || p.estoque === 0 || p.total_estoque === 0
          ? 'Não'
          : 'Sim';
      // prefer explicit stock fields when present
      if (typeof p.total_estoque === 'number') {
        // keep Sim/Não above
      }
      map[`${norm(name)}|${norm(cat)}`] = disponivel;
      if (byName[norm(name)] !== 'Não') byName[norm(name)] = disponivel;
      fetched++;
    }
    if (products.length < 5) break;
    await sleep(300 + Math.floor(Math.random() * 400));
  }
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
  console.log('Buscando Imarat...');
  const imarat = await fetchImarat();
  console.log(`Imarat: ${imarat.fetched}/${imarat.total}`);

  console.log('Buscando Brand Collection...');
  let brand = { map: {}, byName: {}, fetched: 0 };
  try {
    brand = await fetchBrand();
    console.log(`Brand: ${brand.fetched}`);
  } catch (e) {
    console.log(`⚠ Brand indisponível (seguindo só com Imarat): ${e.message || e.cause?.code || e}`);
  }

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

  const out = '/** Empório A.R — estoque sincronizado ' + new Date().toISOString() + ' (Imarat+Brand) */\n' + 'export const DATA = ' + JSON.stringify(DATA) + ';\n' + 'export const WHATSAPP = "5562991134488";\n' + 'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };\n';

  fs.writeFileSync(dataPath, out, 'utf8');
  console.log(`Correspondências: ${matched} | Alterados: ${changed}`);
  console.log('data.js atualizado localmente.');

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
