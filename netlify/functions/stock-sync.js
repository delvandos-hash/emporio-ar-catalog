/**
 * Netlify Function — sincroniza estoque Imarat + Brand Collection
 * GET /.netlify/functions/stock-sync
 */
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

async function fetchImaratStock() {
  const map = {};
  const byName = {};
  let page = 1;
  let total = 0;
  let fetched = 0;
  const perPage = 60;

  for (let guard = 0; guard < 40; guard++) {
    const url = `${IMARAT_API}?page=${page}&perPage=${perPage}`;
    const res = await fetch(url, {
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
    if (fetched >= total || products.length < perPage) break;
    page++;
  }
  return { map, byName, fetched, total, source: 'imarat' };
}

async function fetchBrandStock() {
  const map = {};
  const byName = {};
  let fetched = 0;

  const warm = await fetch(`${BRAND_BASE}/c/atacado/${BRAND_SELLER}`, {
    headers: { 'User-Agent': 'EmporioAR-StockSync/1.0' },
  });
  const setCookie = warm.headers.get('set-cookie') || '';
  const cookie = setCookie
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');

  for (let page = 1; page <= 80; page++) {
    const url = `${BRAND_BASE}/c/atacado/carregar_produtos/${page}/todas/${BRAND_SELLER}`;
    const res = await fetch(url, {
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
    });
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
      const nn = norm(name);
      if (byName[nn] !== 'Não') byName[nn] = disponivel;
      fetched++;
    }
  }
  return { map, byName, fetched, source: 'brand' };
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=300',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  try {
    const [imarat, brand] = await Promise.all([
      fetchImaratStock().catch((e) => ({
        map: {}, byName: {}, fetched: 0, total: 0, source: 'imarat', error: String(e.message || e),
      })),
      fetchBrandStock().catch((e) => ({
        map: {}, byName: {}, fetched: 0, source: 'brand', error: String(e.message || e),
      })),
    ]);
    const body = {
      ok: true,
      updatedAt: new Date().toISOString(),
      sources: [imarat.source, brand.source],
      total: (imarat.fetched || 0) + (brand.fetched || 0),
      imarat: { fetched: imarat.fetched, expected: imarat.total, error: imarat.error || null },
      brand: { fetched: brand.fetched, error: brand.error || null },
      map: imarat.map || {},
      byName: imarat.byName || {},
      brandMap: brand.map || {},
      brandByName: brand.byName || {},
    };
    return { statusCode: 200, headers, body: JSON.stringify(body) };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        ok: false,
        error: String(err && err.message ? err.message : err),
        updatedAt: new Date().toISOString(),
      }),
    };
  }
};
