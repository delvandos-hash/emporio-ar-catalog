/**
 * Remove duplicatas do data.js
 * Mantém a entrada com o MAIOR preço de varejo (a versão corrigida).
 * Também envia o resultado para o Gist.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'js', 'data.js');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normSemVolume(s) {
  return norm(s)
    .replace(/\s*\d+\s*(ml|g)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrice(str) {
  if (!str || str === '—') return 0;
  const n = parseFloat(String(str).replace(/[R$\s]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
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
      const vistos = new Map();
      const novosItens = [];

      for (const item of g.items) {
        const chave = `${normSemVolume(item.nome)}|${norm(g.brand)}`;
        const precoAtual = parsePrice(item.varejo);

        if (vistos.has(chave)) {
          const idxExistente = vistos.get(chave);
          const itemExistente = novosItens[idxExistente];
          const precoExistente = parsePrice(itemExistente.varejo);

          if (precoAtual > precoExistente) {
            novosItens[idxExistente] = item;
          }
          removidos++;
        } else {
          vistos.set(chave, novosItens.length);
          novosItens.push(item);
        }
      }

      g.items = novosItens;
    }
  }

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      g.items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
    DATA[line].sort((a, b) => String(a.brand).localeCompare(String(b.brand), 'pt-BR'));
  }

  const out =
    '/** Empório A.R — limpeza ' +
    new Date().toISOString() +
    ` | ${removidos} duplicatas removidas */\n` +
    'export const DATA = ' +
    JSON.stringify(DATA) +
    ';\n' +
    'export const WHATSAPP = "5562991134488";\n' +
    'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };\n';

  fs.writeFileSync(dataPath, out, 'utf8');
  console.log(`✅ ${removidos} duplicatas removidas.`);
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
