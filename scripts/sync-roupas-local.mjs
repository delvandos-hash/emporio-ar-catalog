import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, 'js', 'data.js'); 
const SOPHIA_URL = 'https://sophiamoda.com.br/c/atacado/carregar_produtos/1/todas/62982459275';
const SOPHIA_CDN = 'https://arquivos-cdn.facilzap.app.br';

async function run() {
  console.log("👗 Buscando Roupas na Sophia Moda (via IP local)...");
  
  try {
    const res = await fetch(SOPHIA_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://sophiamoda.com.br/c/atacado'
      }
    });
    
    const text = await res.text();
    if (!text) throw new Error("Resposta vazia.");
    
    const data = JSON.parse(text);
    const produtos = data.produtos || [];
    console.log(`✅ Sophia: ${produtos.length} roupas encontradas. Processando...`);

    const roupasFormatadas = produtos.map(prod => {
      const precoCheio = Number(prod.preco);
      let precoAtacado, precoVarejo;

      if (precoCheio <= 50.00) {
        precoAtacado = precoCheio + 40.00;
        precoVarejo = precoAtacado + 40.00;
      } else {
        precoAtacado = precoCheio + 50.00;
        precoVarejo = precoAtacado + 40.00;
      }

      const imagens = (prod.imagens || []).map(img => `${SOPHIA_CDN}/${img}`);
      const variacoes = [];
      
      for (const [idVar, dadosVar] of Object.entries(prod.variacoes || {})) {
        variacoes.push({
          id: idVar,
          nome: String(dadosVar.nome).trim(),
          cor: dadosVar.cor || "Única",
          estoque: prod.estoque[idVar] || 0,
          sku: prod.sku_variacoes[idVar]
        });
      }

      return {
        id: `sophia-${prod.id}`,
        idOriginal: prod.id,
        nome: prod.nome,
        categoria: "Roupas",
        subcategoria: prod.categoria_nome || "Geral",
        descricao: prod.descricao,
        precoCheio: precoCheio,
        precoPromocional: Number(prod.precos_produto.promocional) || precoCheio,
        precoAtacado: precoAtacado,
        precoVarejo: precoVarejo,
        imagens: imagens,
        variacoes: variacoes,
        estoqueTotal: prod.total_estoque,
        precoManual: false,
        fonte: "sophiamoda"
      };
    });

    // Pega os dados atuais do data.js para não perder os perfumes
    let rawData = fs.readFileSync(dataPath, 'utf8');
    const m = rawData.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
    const DATA = JSON.parse(m[1]);

    const gistId = "bac3a717b309d02379455e971c9a9103";
    const githubToken = process.env.GIST_TOKEN;
    if (!githubToken) throw new Error('GIST_TOKEN não configurado no seu terminal.');

    const dadosParaSite = { 
      DATA: DATA, 
      ROUPAS: roupasFormatadas,
      WHATSAPP: "5562991134488", 
      BRAND: { name: "Empório A.R", phone: "(62) 99113-4488" }, 
      ultimaAtualizacao: new Date().toISOString() 
    };
    
    console.log("Enviando para o GitHub Gist...");
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${githubToken}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'catalogo.json': { content: '\uFEFF' + JSON.stringify(dadosParaSite, null, 2) } } })
    });
    
    if (!response.ok) throw new Error("Erro ao enviar pro Gist");
    console.log('🎉 Roupas enviadas para o Gist com sucesso!');

  } catch (err) {
    console.error("❌ Erro:", err.message);
  }
}

run();
