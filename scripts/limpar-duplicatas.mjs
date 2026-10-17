/**
 * Remove APENAS as duplicatas exatas da Armaf (versão antiga com preço R$ 105,00).
 * Não usa regras genéricas. Não afeta outros produtos.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'js', 'data.js');

// Lista EXATA dos nomes a remover (normalizados)
const NOMES_EXATOS_PARA_REMOVER = [
  'mini mandarin elixir',
  'mini mandarin sky',
  'mini bananas',
  'mini black',
  'mini cofee',
  'mini dubai',
  'mini go mango',
  'mini limoni',
  'mini montagne',
  'mini spectra',
  'mini dubai candy',
  'mini marshmellow',
];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function deveRemover(nome) {
  const n = norm(nome);
  return NOMES_EXATOS_PARA_REMOVER.includes(n);
}

async function main() {
  console.log('Carregando data.js...');
  let raw = fs.readFileSync(dataPath, 'utf8');
  const m = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!m) throw new Error('DATA não encontrado');
  const DATA = JSON.parse(m[1]);

  let removidos = 0;

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      g.items = g.items.filter((item) => {
        if (deveRemover(item.nome)) {
          removidos++;
          console.log(`  Removido: ${item.nome} (R$ ${item.varejo})`);
          return false;
        }
        return true;
      });
    }
  }

  // Remove grupos vazios
  for (const line of Object.keys(DATA)) {
    DATA[line] = DATA[line].filter((g) => g.items.length > 0);
  }

  const out =
    '/** Empório A.R — limpeza cirúrgica exata ' +
    new Date().toISOString() +
    ` | ${removidos} duplicatas removidas */\n` +
    'export const DATA = ' +
    JSON.stringify(DATA) +
    ';\n' +
    'export const WHATSAPP = "5562991134488";\n' +
    'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };\n';

  fs.writeFileSync(dataPath, out, 'utf8');
  console.log(`✅ ${removidos} duplicatas removidas.`);

  // Envia para o GitHub Gist
  console.log('Enviando dados para o GitHub Gist...');
  try {
    const gistId = "bac3a717b309d02379455e971c9a9103";
    const githubToken = process.env.GIST_TOKEN;
    if (!githubToken) throw new Error('GIST_TOKEN não configurado');

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
          'catalogo.json': { content: '\uFEFF' + JSON.stringify(dadosParaSite, null, 2) }
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
