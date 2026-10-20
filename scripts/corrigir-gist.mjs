import fs from 'fs';
import path from 'path';

const gistId = "11918b7196b3ee6a0d8a91739167b312";
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
  'â€“': '–', 'â€”': '—', 'â€œ': '“', 'â€': '”', 'â€™': '’',
  'EmpÃ"RIO': 'EMPÓRIO', 'EmpÃ³rio': 'Empório'
};

function corrigirString(str) {
  if (typeof str !== 'string') return str;
  let corrigido = str;
  try {
    const buff = Buffer.from(corrigido, 'latin1');
    const utf8 = buff.toString('utf8');
    if (!utf8.includes('Ã') && !utf8.includes('Â')) corrigido = utf8;
  } catch (e) {}
  for (const [chave, valor] of Object.entries(substituicoes)) {
    corrigido = corrigido.split(chave).join(valor);
  }
  return corrigido;
}

async function main() {
  if (!githubToken) {
    console.error('❌ ERRO FATAL: O GIST_TOKEN não foi encontrado nas variáveis de ambiente.');
    process.exit(1);
  }

  console.log('Baixando Gist atual...');
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, { 
      headers: { 
        'Authorization': `Bearer ${githubToken}`, 
        'Accept': 'application/vnd.github+json' 
      } 
    });
    
    if (!res.ok) {
      const erro = await res.text();
      throw new Error(`Erro na API do GitHub (Status ${res.status}): ${erro}`);
    }
    
    const gistData = await res.json();
    
    let content = gistData.files['catalogo.json'].content;
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
      headers: { 
        'Authorization': `Bearer ${githubToken}`, 
        'Accept': 'application/vnd.github+json', 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ files: { 'catalogo.json': { content: '\uFEFF' + JSON.stringify(json, null, 2) } } })
    });
    
    if (!response.ok) {
      const erroPatch = await response.text();
      throw new Error(`Erro ao salvar no Gist (Status ${response.status}): ${erroPatch}`);
    }
    
    console.log('✅ Gist atualizado com sucesso!');
  } catch (error) {
    console.error('\n❌ ERRO DETALHADO:', error.message);
    process.exit(1);
  }
}

main();
