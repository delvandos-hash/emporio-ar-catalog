/**
 * Atualiza disponivel no data.js — Imarat + Brand Collection
 * node scripts/sync-stock.mjs
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
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function fetchImarat() {
  const map = {};
  const byName = {};
  let page = 1, total = 0, fetched = 0;
  for (let g = 0; g < 40; g++) {
    const res = await fetch(`${IMARAT_API}?page=${page}&perPage=60`, {
      headers: { 'User-Agent': 'EmporioAR-StockSync/1.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Imarat HTTP ${res.status}`);
    const data = await res.json();
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

async function fetchBrand() {
  const map = {};
  const byName = {};
  let fetched = 0;
  const warm = await fetch(`${BRAND_BASE}/c/atacado/${BRAND_SELLER}`, {
    headers: { 'User-Agent': 'EmporioAR-StockSync/1.0' },
  });
  const setCookie = warm.headers.get('set-cookie') || '';
  const cookie = setCookie.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');

  for (let page = 1; page <= 80; page++) {
    const res = await fetch(
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
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify({ pagina_especifica: '' }),
      }
    );
    if (!res.ok) break;
    const data = await res.json();
    const products = Array.isArray(data) ? data : data.produtos || [];
    if (!products.length) break;
    for (const p of products) {
      const name = p.nome || '';
      const cat = p.categoria_nome || p.categoria || '';
      let disponivel = 'Sim';
      if (p.status === false) disponivel = 'Não';
      else if (p.controlar_estoque) {
        const te = p.total_estoque;
        if (te !== undefined && te !== null && Number(te) <= 0) disponivel = 'Não';
      }
      map[`${norm(name)}|${norm(cat)}`] = disponivel;
      if (byName[norm(name)] !== 'Não') byName[norm(name)] = disponivel;
      fetched++;
    }
  }
  return { map, byName, fetched };
}

function resolve(item, brand, map, byName) {
  const n = norm(item.nome);
  const b = norm(brand);
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
  const brand = await fetchBrand();
  console.log(`Brand: ${brand.fetched}`);

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
        if ((item.disponivel || 'Sim') !== next) {
          item.disponivel = next;
          changed++;
        }
      }
    }
  }

  const out =
    '/** Empório A.R — estoque sincronizado ' +
    new Date().toISOString() +
    ' (Imarat+Brand) */\n' +
    'export const DATA = ' +
    JSON.stringify(DATA) +
    ';\n' +
    'export const WHATSAPP = "5562991134488";\n' +
    'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };\n';
  
  // 1. Salva o arquivo localmente (como backup)
  fs.writeFileSync(dataPath, out, 'utf8');
  console.log(`Correspondências: ${matched} | Alterados: ${changed}`);
  console.log('data.js atualizado localmente.');

  // 2. Envia os dados para o Netlify Blobs
  console.log('Enviando dados para o Netlify Blobs...');
  
  // 2. Envia os dados para o GitHub Gist
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
            content: JSON.stringify(dadosParaSite, null, 2)
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
