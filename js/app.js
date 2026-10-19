/**
 * Empório A.R - Catálogo Digital
 * Dados: Gist (via /api/catalogo ou URL direta) + estoque ao vivo (stock-sync)
 */
import { validateProductPrices, parsePrice as parsePriceStrict } from './prices.js';

const GIST_CATALOG_URL =
  'https://gist.githubusercontent.com/delvandos-hash/bac3a717b309d02379455e971c9a9103/raw/catalogo.json';

async function loadCatalogData() {
  const urls = ['/api/catalogo', GIST_CATALOG_URL];
  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (j && j.DATA) return j;
      if (j && j.erro) throw new Error(j.erro);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Falha ao carregar catálogo');
}

const dadosDoServidor = await loadCatalogData();

// --- AQUI ESTÁ A MUDANÇA: Lendo a nova chave ROUPAS ---
const { DATA, ROUPAS = [], WHATSAPP, BRAND } = dadosDoServidor;

// ... (Mantenha as funções normId, productId, findProductById, setProductUrl, openProductFromUrl) ...

const state = {
  gender: 'Todos',
  category: 'Todos',
  price: 'Todos',
  stock: 'Todos',
  search: '',
  sort: 'nome-asc'
};

// ... (Mantenha as chaves de localStorage, loadOverrides, etc.) ...

// ==========================================
// NOVAS FUNÇÕES: ROUPAS E ESTOQUE EM TEMPO REAL
// ==========================================

// Função para checar o estoque na API da Sophia no momento do clique
async function verificarEstoqueSophia(idProdutoOriginal) {
    try {
        const url = `https://sophiamoda.com.br/c/atacado/carregar_produtos/1/todas/62982459275`;
        const response = await fetch(url);
        const data = await response.json();
        const produto = data.produtos.find(p => p.id == idProdutoOriginal);
        if (produto) {
            return produto.estoque; // Retorna o objeto { "idVar": qtd, ... }
        }
        return null;
    } catch (error) {
        console.error("Erro ao checar estoque em tempo real:", error);
        return null; 
    }
}

// Gera o link do WhatsApp para o seu número
function gerarLinkWhatsAppRoupa(produto, variacaoSelecionada) {
    const meuNumero = "5562991134488"; 
    
    const mensagem = `Olá! Vi no site Empório A.R e quero comprar a seguinte roupa:\n\n` +
                     `*Produto:* ${produto.nome}\n` +
                     `*Variação:* ${variacaoSelecionada.nome}\n` +
                     `*Preço Varejo:* R$ ${produto.precoVarejo.toFixed(2).replace('.', ',')}\n` +
                     `*Preço Atacado:* R$ ${produto.precoAtacado.toFixed(2).replace('.', ',')}\n` +
                     `*SKU:* ${variacaoSelecionada.sku || 'N/A'}\n\n` +
                     `Pode me ajudar com a compra?`;

    return `https://wa.me/${meuNumero}?text=${encodeURIComponent(mensagem)}`;
}

// ==========================================
// INTEGRAÇÃO COM A UI E RENDERIZAÇÃO
// ==========================================

// ... (Mantenha as funções buildDetailsNavList, showDetailsAt, openDetails) ...

// Na função openDetails, precisamos adicionar a lógica de Roupas
function openDetails(p, opts = {}) {
  // Se for uma roupa, tratamos de forma diferente
  if (p.categoria === 'Roupas') {
      abrirDetalhesRoupa(p);
      return;
  }

  // ... (Toda a sua lógica atual de perfumes permanece igual aqui) ...
}

// Nova função para abrir o modal de roupas
function abrirDetalhesRoupa(produto) {
    const overlay = document.getElementById('modal');
    overlay.classList.remove('closing');
    
    // Preenche os dados básicos
    document.getElementById('modalName').textContent = produto.nome;
    document.getElementById('modalMeta').textContent = `Roupas · ${produto.subcategoria}`;
    document.getElementById('modalVarejo').textContent = `R$ ${produto.precoVarejo.toFixed(2).replace('.', ',')}`;
    document.getElementById('modalAtacado').textContent = `R$ ${produto.precoAtacado.toFixed(2).replace('.', ',')}`;

    // Foto principal (galeria)
    const photoDiv = document.getElementById('modalPhoto');
    if (produto.imagens && produto.imagens.length > 0) {
        photoDiv.style.display = '';
        photoDiv.innerHTML = `<img src="${produto.imagens[0]}" alt="${produto.nome}" loading="eager" referrerpolicy="no-referrer">`;
    } else {
        photoDiv.style.display = '';
        photoDiv.classList.add('no-img');
        photoDiv.innerHTML = 'SEM FOTO';
    }

    // Descrição
    const notasEl = document.getElementById('modalNotas');
    if (produto.descricao) {
        notasEl.style.display = 'block';
        notasEl.innerHTML = `<strong>Descrição</strong><br>${produto.descricao}`;
    } else {
        notasEl.style.display = 'none';
    }

    // Renderizar botões de variação (onde a mágica do estoque em tempo real acontece)
    const btnAdd = document.getElementById('modalAddCart');
    const btnBuy = document.getElementById('modalBuy');
    
    // Esconde os botões originais de compra e adiciona um container para as variações
    btnAdd.style.display = 'none';
    btnBuy.style.display = 'none';
    
    let variacoesHtml = `<div id="variacoes-container" style="margin-top:15px; display:flex; flex-direction:column; gap:8px;">
        <strong>Escolha a Variação:</strong>
        <p id="loading-estoque" style="font-size:12px; color:#888;">Verificando estoque em tempo real...</p>
    </div>`;
    
    // Insere o container antes dos botões
    notasEl.insertAdjacentHTML('afterend', variacoesHtml);

    // Abre o modal
    overlay.classList.remove('closing', 'open');
    void overlay.offsetWidth;
    requestAnimationFrame(() => overlay.classList.add('open'));

    // Faz a checagem em tempo real
    verificarEstoqueSophia(produto.idOriginal).then(estoqueAtualizado => {
        document.getElementById('loading-estoque').remove();
        const container = document.getElementById('variacoes-container');
        
        produto.variacoes.forEach(variacao => {
            const qtd = estoqueAtualizado ? (estoqueAtualizado[variacao.id] || 0) : variacao.estoque;
            
            const btn = document.createElement('button');
            btn.className = 'btn-sm ' + (qtd > 0 ? 'btn-add' : 'btn-disabled');
            btn.disabled = qtd <= 0;
            btn.style.width = '100%';
            btn.style.marginBottom = '5px';
            
            btn.innerHTML = qtd > 0 
                ? `${variacao.nome} (Estoque: ${qtd})`
                : `${variacao.nome} (Esgotado)`;
                
            if (qtd > 0) {
                btn.onclick = () => {
                    const link = gerarLinkWhatsAppRoupa(produto, variacao);
                    window.open(link, '_blank');
                };
            }
            
            container.appendChild(btn);
        });
    });
}

// ... (Mantenha a função closeModal e render) ...

function render() {
  // ... (Mantenha a lógica de perfumes) ...

  // --- AQUI ENTRA A RENDERIZAÇÃO DAS ROUPAS ---
  // Exemplo: Se a categoria selecionada for "Roupas" ou "Todos"
  let roupasHtml = '';
  if (state.category === 'Todos' || state.category === 'Roupas') {
      const roupasFiltradas = ROUPAS.filter(roupa => {
          if (state.search) {
              const q = state.search.toLowerCase();
              if (!roupa.nome.toLowerCase().includes(q) && !roupa.subcategoria.toLowerCase().includes(q)) return false;
          }
          return true;
      });

      if (roupasFiltradas.length > 0) {
          roupasHtml += `<div class="category cat-fem"><div class="category-title">Roupas</div><div class="brand-group"><div class="brand-name">Sophia Moda</div><div class="products">`;
          
          roupasFiltradas.forEach(roupa => {
              const cardClass = roupa.estoqueTotal > 0 ? 'card' : 'card esgotado';
              const foto = roupa.imagens && roupa.imagens.length > 0 ? roupa.imagens[0] : '';
              
              roupasHtml += `
                <div class="${cardClass}">
                  ${foto ? `<div class="photo photo-click" role="button" tabindex="0" data-p='${encodeURIComponent(JSON.stringify(roupa))}'><img src="${foto}" alt="${roupa.nome}" loading="lazy"></div>` : ''}
                  <div class="info">
                    <div class="name">${roupa.nome}</div>
                    <div class="meta">${roupa.subcategoria} · ${roupa.estoqueTotal > 0 ? 'Disponível' : 'Esgotado'}</div>
                    <div class="prices">
                      <div><span class="price-label">Varejo</span><span class="price-v">R$ ${roupa.precoVarejo.toFixed(2).replace('.', ',')}</span></div>
                      <div><span class="price-label">Atacado</span><span class="price-a">R$ ${roupa.precoAtacado.toFixed(2).replace('.', ',')}</span></div>
                    </div>
                    <div class="card-actions">
                      <button class="btn-sm btn-details" data-p='${encodeURIComponent(JSON.stringify(roupa))}'>Ver Variações</button>
                    </div>
                  </div>
                </div>`;
          });
          roupasHtml += `</div></div></div>`;
      }
  }

  // Adiciona o HTML de roupas ao final do catálogo
  main.innerHTML += roupasHtml;

  // Re-bind dos eventos para os novos cards de roupa
  main.querySelectorAll('.btn-details, .photo-click').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const p = JSON.parse(decodeURIComponent(el.dataset.p));
        if (p.categoria === 'Roupas') {
            abrirDetalhesRoupa(p);
        } else {
            openDetails(p);
        }
      } catch (err) { console.warn(err); }
    });
  });
}

// ... (Mantenha os listeners do final do arquivo: syncStockFromRoot, etc.) ...
