import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'js', 'data.js');

function corrigirTexto(str) {
  if (typeof str !== 'string') return str;
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch (e) {
    return str;
  }
}

async function main() {
  console.log('Corrigindo acentos no data.js...');
  let raw = fs.readFileSync(dataPath, 'utf8');
  const m = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!m) throw new Error('DATA não encontrado');
  const DATA = JSON.parse(m[1]);

  let corrigidos = 0;

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      for (const item of g.items) {
        if (item.nome) {
          const novoNome = corrigirTexto(item.nome);
          if (novoNome !== item.nome) {
            item.nome = novoNome;
            corrigidos++;
          }
        }
        if (item.notas) {
          const novasNotas = corrigirTexto(item.notas);
          if (novasNotas !== item.notas) {
            item.notas = novasNotas;
            corrigidos++;
          }
        }
      }
    }
  }

  const out =
    '/** Empório A.R — acentos corrigidos ' +
    new Date().toISOString() +
    ` | ${corrigidos} textos corrigidos */\n` +
    'export const DATA = ' +
    JSON.stringify(DATA) +
    ';\n' +
    'export const WHATSAPP = "5562991134488";\n' +
    'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };\n';

  fs.writeFileSync(dataPath, out, 'utf8');
  console.log(`✅ ${corrigidos} textos corrigidos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
