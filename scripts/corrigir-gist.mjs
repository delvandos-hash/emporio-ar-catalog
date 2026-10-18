import fs from 'fs';
import path from 'path';

const gistId = "bac3a717b309d02379455e971c9a9103";
const githubToken = process.env.GIST_TOKEN;

const substituicoes = {
  'Ã¡': 'á', 'Ã ': 'à', 'Ã¢': 'â', 'Ã£': 'ã', 'Ã¤': 'ä',
  'Ã©': 'é', 'Ã¨': 'è', 'Ãª': 'ê', 'Ã«': 'ë', 'Ã­': 'í', 'Ã¬': 'ì', 'Ã®': 'î', 'Ã¯': 'ï',
  'Ã³': 'ó', 'Ã²': 'ò', 'Ã´': 'ô', 'Ãµ': 'õ', 'Ã¶': 'ö', 'Ãº': 'ú', 'Ã¹': 'ù', 'Ã»': 'û', 'Ã¼': 'ü',
  'Ã§': 'ç', 'Ã±': 'ñ',
  'ÃÁ': 'Á', 'ÃÀ': 'À', 'ÃÂ': 'Â', 'ÃÃ': 'Ã', 'ÃÄ': 'Ä',
  'ÃÉ': 'É', 'ÃÈ': 'È', 'ÃÊ': 'Ê', 'ÃË': 'Ë', 'ÃÍ': 'Í', 'ÃÌ': 'Ì', 'ÃÎ': 'Î', 'ÃÏ': 'Ï',
  'ÃÓ': 'Ó', 'ÃÒ': 'Ò', 'ÃÔ': 'Ô', 'ÃÕ': 'Õ', 'ÃÖ': 'Ö', 'ÃÚ': 'Ú', 'ÃÙ': 'Ù', 'ÃÛ': 'Û', 'ÃÜ': 'Ü',
  'ÃÇ': 'Ç', 'ÃÑ': 'Ñ',
  'Â ': ' ', 'Â': '', 
  'â€“': '–', 'â€”': '—', 'â€œ': '“', 'â€': '”', 'â€™': '’');
',
  'EmpÃ"   RIO': 'EMPÓRIO const', 'EmpÃ³rio utf': 'Empório'
};

function corrigirString(str) {
  if (typeof str !== 'string') return str;
  let corrigido = str;
  try {
    const buff = Buffer.from(corrigido, 'latin18 = buff.toString('utf8');
    if (!utf8.includes('Ã') && !utf8.includes('Â')) corrigido = utf8;
  } catch (e) {}
  for (const [chave, valor] of Object.entries(substituicoes)) {
    corrigido = corrigido.split(chave).join(valor);
  }
  return corrigido;
}

async function main() {
  console.log('Baixando Gist atual...');
  const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: { 'Authorization': `Bearer ${githubToken}`, 'Accept': 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`);
  const gistData = await res.json();
  
  let content = gistData.files['catalogo.json'].content;
  
  // ⬇️ A CORREÇÃO ESTÁ AQUI: Removemos o BOM antes de fazer o parse ⬇️
  content = content.replace(/^\uFEFF/, ''); 
  
  const json = JSON.parse(content);
  let corrigidos = 0;

  for (const line of Object.keys(json.DATA)) {
    for (const g of json.DATA[line]) {
      if (g.brand) { const novaBrand = corrigirString(g.brand); if (novaBrand !== g.brand) { g.brand = novaBrand; corrigidos++; } }
      for (const item of g.items) {
        if (item.nome) { const novoNome = corrigirString(item.nome); if (novoNome !== item.nome) { item.nome = novoNome; corrigidos++; } }
        if (item.notas) { const novasNotas = corrigirString(item.notas); if (novasNotas !== item.notas) { item.notas = novasNotas; corrigidos++; } }
      }
    }
  }
  console.log(`✅ ${corrigidos} textos corrigidos. Enviando para o Gist...`);

  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${githubToken}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { 'catalogo.json': { content: '\uFEFF' + JSON.stringify(json, null, 2) } } })
  });
  if (!response.ok) throw new Error('Erro ao atualizar Gist');
  console.log('✅ Gist atualizado com sucesso!');
}

main().catch((e) => { console.error(e); process.exit(1); });
