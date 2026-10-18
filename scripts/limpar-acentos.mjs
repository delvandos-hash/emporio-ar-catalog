import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'js', 'data.js');

// Lista de substituições para limpar múltiplas camadas de corrupção
const substituicoes = {
  // Erros triplos/quadrúplos (o que vimos no seu print)
  'ÃƒÂ±': 'ñ', 'ÃƒÂ§': 'ç', 'ÃƒÂ£': 'ã', 'ÃƒÂµ': 'õ', 'ÃƒÂ¡': 'á', 'ÃƒÂ©': 'é', 'ÃƒÂ­': 'í', 'ÃƒÂ³': 'ó', 'ÃƒÂº': 'ú',
  'ÃƒÆ’Ã‚Â': 'Í', 'Ãƒâ€š': 'Â', 'ÃƒÆ’': '',
  // Erros duplos
  'Ã±': 'ñ', 'Ã§': 'ç', 'Ã£': 'ã', 'Ãµ': 'õ', 'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
  'Ã ': 'à', 'Ã¢': 'â', 'Ãª': 'ê', 'Ã´': 'ô', 'Ã»': 'û', 'Ã¼': 'ü', 'Ã¤': 'ä', 'Ã«': 'ë', 'Ã¯': 'ï', 'Ã¶': 'ö',
  'ÃÁ': 'Á', 'ÃÀ': 'À', 'ÃÂ': 'Â', 'ÃÃ': 'Ã', 'ÃÄ': 'Ä', 'ÃÉ': 'É', 'ÃÈ': 'È', 'ÃÊ': 'Ê', 'ÃË': 'Ë',
  'ÃÍ': 'Í', 'ÃÌ': 'Ì', 'ÃÎ': 'Î', 'ÃÏ': 'Ï', 'ÃÓ': 'Ó', 'ÃÒ': 'Ò', 'ÃÔ': 'Ô', 'ÃÕ': 'Õ', 'ÃÖ': 'Ö',
  'ÃÚ': 'Ú', 'ÃÙ': 'Ù', 'ÃÛ': 'Û', 'ÃÜ': 'Ü', 'ÃÇ': 'Ç', 'ÃÑ': 'Ñ',
  // Erros comuns em palavras específicas
  'EmpÃƒÂ³rio': 'Empório', 'EmpÃ"RIO': 'EMPÓRIO', 'CafÃƒÂ©': 'Café', 'PiÃƒÂ±a': 'Piña', 'CoraÃƒÂ§ÃƒÂ£o': 'Coração',
  'ÃƒÂ': 'Á', 'ÃƒÂ': 'É', 'ÃƒÂ': 'Ó'
};

function limparTexto(str) {
  if (typeof str !== 'string') return str;
  let resultado = str;

  // Loop para forçar a limpeza em todas as camadas
  for (let i = 0; i < 5; i++) {
    let mudou = false;
    for (const [chave, valor] of Object.entries(substituicoes)) {
      if (resultado.includes(chave)) {
        resultado = resultado.split(chave).join(valor);
        mudou = true;
      }
    }
    // Se não mudou nada nesta rodada, para.
    if (!mudou) break; 
  }

  return resultado;
}

async function main() {
  console.log('Iniciando limpeza profunda no data.js...');
  let raw = fs.readFileSync(dataPath, 'utf8');
  const m = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!m) throw new Error('DATA não encontrado');
  const DATA = JSON.parse(m[1]);

  let corrigidos = 0;

  for (const line of Object.keys(DATA)) {
    for (const g of DATA[line]) {
      if (g.brand) {
        const novaBrand = limparTexto(g.brand);
        if (novaBrand !== g.brand) { g.brand = novaBrand; corrigidos++; }
      }
      for (const item of g.items) {
        if (item.nome) {
          const novoNome = limparTexto(item.nome);
          if (novoNome !== item.nome) { item.nome = novoNome; corrigidos++; }
        }
        if (item.notas) {
          const novasNotas = limparTexto(item.notas);
          if (novasNotas !== item.notas) { item.notas = novasNotas; corrigidos++; }
        }
      }
    }
  }

  const out = '/** Empório A.R — limpeza profunda ' + new Date().toISOString() + ` | ${corrigidos} textos limpos */\n` + 'export const DATA = ' + JSON.stringify(DATA) + ';\n' + 'export const WHATSAPP = "5562991134488";\n' + 'export const BRAND = { name: "Empório A.R", phone: "(62) 99113-4488" };\n';
  fs.writeFileSync(dataPath, out, 'utf8');
  console.log(`✅ ${corrigidos} textos limpos no data.js.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
