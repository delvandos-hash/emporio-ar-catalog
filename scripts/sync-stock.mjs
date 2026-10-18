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
    const res = await fetch(`${IMARAT_API}?page=${page}&perPage=60`, { headers: { 'User-Agent': 'EmporioAR-StockSync/1.0', 'Accept': 'application/json', 'Accept-Charset': 'utf-8' } });
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

async function fetchBrand() {
  const map = {}; const byName = {};
  let fetched = 0;
  const warm = await fetch(`${BRAND_BASE}/c/atacado/${BRAND_SELLER}`, { headers: { 'User-Agent': 'EmporioAR-StockSync/1.0' } });
  const setCookie = warm.headers.get('set-cookie') || '';
  const cookie = setCookie.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');

  for (let page = 1; page <= 80; page++) {
    const res = await fetch(`${BRAND_BASE}/c/atacado/carregar_produtos/${page}/todas/${BRAND_SELLER}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'EmporioAR-StockSync/1.0', 'Accept': 'application/json', 'Content-Type': 'application/json',
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
      const name = p.nome || ''; const cat = p.categoria_nome || p.categoria || '';
      let disponivel = 'Sim';
      if (p.status === false) disponivel = 'Não';
      else if (p.controlar_estoque) { const te = p.total_estoque; if (te !== undefined && te !== null && Number(te) <= 0) disponivel = 'Não'; }
      map[`${norm(name)}|${norm(cat)}`] = disponivel;
      if (byName[norm(name)] !== 'Não') byName[norm(name)] = disponivel;
      fetched++;
    }
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
    if (kn.length > 6 && (n.includes(kn
