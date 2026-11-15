/**
 * Reaplica preço manual nas miniaturas Cupcake Mystical 30ml (não altera Bolsa 35ml).
 * Uso: node scripts/set-manual-cupcake-mystical.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'js', 'data.js');
let raw = fs.readFileSync(dataPath, 'utf8');
const m = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
if (!m) throw new Error('DATA não encontrado em js/data.js');
const DATA = JSON.parse(m[1]);
const V = '105,00', A = '75,00';
let n = 0;
for (const groups of Object.values(DATA)) {
  for (const g of groups || []) {
    const brand = String(g.brand || '').toUpperCase();
    for (const it of g.items || []) {
      const nome = String(it.nome || '');
      const vol = String(it.volume || '');
      const nlow = nome.toLowerCase();
      if (!nlow.includes('cupcake') || nlow.includes('bolsa')) continue;
      if (!vol.toLowerCase().includes('30')) continue;
      if (brand !== 'MYSTICAL' && !nlow.includes('mystical')) continue;
      it.varejo = V;
      it.atacado = A;
      it.precoManual = true;
      n++;
      console.log('CUPCAKE', nome, vol, '->', V, A, 'precoManual=true');
    }
  }
}
const out = raw.slice(0, m.start(1)) + JSON.stringify(DATA) + raw.slice(m.end(1));
fs.writeFileSync(dataPath, out, 'utf8');
console.log(`Cupcakes atualizados: ${n}`);
