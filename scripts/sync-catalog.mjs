/**
 * Sincroniza estoque + novos produtos (Imarat + Brand filtrado + Sophia Moda Roupas)
 * Envia os dados para o GitHub Gist
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'js', 'data.js');
const IMARAT_API = 'https://imaratperfumaria.com/api/products';
const IMARAT_ORIGIN = 'https://imaratperfumaria.com';
const BRAND_BASE = 'https://brandcollectionpy.com.br';
const BRAND_SELLER = 'darlanaugusto';
const SOPHIA_URL = 'https://sophiamoda.com.br/c/atacado/carregar_produtos/1/todas/62982459275';
const SOPHIA_CDN = 'https://arquivos-cdn.facilzap.app.br';

// ... (Mantenha todas as suas funções de limpeza, norm, preços, etc. que já existiam) ...
// [Vou omitir as funções inalteradas para o código não ficar gigante, mas você deve mantê-las]

const BRAND_ALLOWED_SESSIONS = [
  'ARABIC COLLECTION', 'BEAUTY BRAND', 'BODY SPLASH', 'BODY SPLAHS',
  'COLEÇÂO DREAM', 'COLECAO DREAM', 'COLEÇÃO BRAND', 'COLECAO BRAND',
  'DREAM BRAND 80/100ML', 'DREAM BRAND', 'FLACONETE BRAND',
  'FLACONETE  BRAND', 'SAPATINHO GOOD GIRL',
];

const ADD_IMARAT_NEW = process.env.ADD_IMARAT_NEW !== '0';
const ADD_BRAND_NEW = process.env.ADD_BRAND_NEW !== '0';

// ... [Mantenha as constantes de preços e funções: limparTexto, norm, removerPrefixosMini, etc.] ...

// ==========================================
// NOVA FUNÇÃO: SOPHIA MODA (ROUPAS)
// ==========================================
async function fetchSophiaModa() {
  console.log("👗 Buscando Roupas na Sophia Moda...");
  const produtosFormatados = [];
  
  try {
    const res = await fetch(SOPHIA_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const produtos = data.produtos || [];
    console.log(`Sophia: ${produtos.length} roupas encontradas.`);

    for (const prod of produtos) {
      // REGRA DE PREÇO (Baseado no Preço Cheio)
      const precoCheio = Number(prod.preco);
      let precoAtacado, precoVarejo;

      if (precoCheio <= 50.00) {
        precoAtacado = precoCheio + 40.00;
        precoVarejo = precoAtacado + 40.00;
      } else {
        precoAtacado = precoCheio + 50.00;
        precoVarejo = precoAtacado + 40.00;
      }

      // Imagens
      const imagens = (prod.imagens || []).map(img => `${SOPHIA_CDN}/${img}`);

      // Variações e Estoque
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

      produtosFormatados.push({
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
      });
    }
  } catch (err) {
    console.error("❌ Erro ao buscar Sophia Moda:", err.message);
  }

  return produtosFormatados;
}
// ==========================================

// ... [Mantenha as funções fetchImaratList, fetchBrandList, etc.] ...

async function main() {
  console.log('Carregando data.js...');
  let raw = fs.readFileSync(dataPath, 'utf8');
  const m = raw.match(/export const DATA = (\{[\s\S]*?\});\s*\nexport const WHATSAPP/);
  if (!m) throw new Error('DATA não encontrado');
  const DATA = JSON.parse(m[1]);

  console.log(`Flags: ADD_IMARAT_NEW=${ADD_IMARAT_NEW} ADD_BRAND_NEW=${ADD_BRAND_NEW}`);

  // --- LÓGICA DE PERFUMES (MANTIDA IGUAL) ---
  console.log('Buscando Imarat...');
  const imaratList = await fetchImaratList();
  
  // ... (todo o seu bloco de processamento de Imarat e Brand aqui) ...
  // [Vou pular a repetição do seu código de perfumes para focar no que mudou]
  
  // --- LÓGICA DE ROUPAS (NOVA) ---
  const roupasSophia = await fetchSophiaModa();

  // --- SALVANDO NO GIST (ESTRUTURA ATUALIZADA) ---
  console.log('Enviando dados para o GitHub Gist...');
  try {
    const gistId = "bac3a717b309d02379455e971c9a9103";
    const githubToken = process.env.GIST_TOKEN;
    if (!githubToken) throw new Error('GIST_TOKEN não configurado');
    
    // AQUI ESTÁ A MUDANÇA: Adicionamos a chave ROUPAS
    const dadosParaSite = { 
      DATA: DATA, 
      ROUPAS: roupasSophia,
      WHATSAPP: "5562991134488", 
      BRAND: { name: "Empório A.R", phone: "(62) 99113-4488" }, 
      ultimaAtualizacao: new Date().toISOString() 
    };
    
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${githubToken}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'catalogo.json': { content: '\uFEFF' + JSON.stringify(dadosParaSite, null, 2) } } })
    });
    if (!response.ok) { const errorText = await response.text(); throw new Error(`GitHub API ${response.status}: ${errorText}`); }
    console.log('✅ Dados enviados para o GitHub Gist com sucesso!');
  } catch (error) { console.error('❌ Erro ao enviar para o GitHub Gist:', error); }
}

main().catch((e) => { console.error(e); process.exit(1); });
