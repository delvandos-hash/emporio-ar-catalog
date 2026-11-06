# Integração no projeto atual (sem quebrar layout)

Siga estes passos na ordem. Não é necessário reescrever o `app.js` inteiro.

---

## 1. Arquivos novos / substituídos

Copie para a raiz do repositório `emporio-ar-catalog`:

- `netlify.toml` (substitui o atual)
- `netlify/functions/cep.js` (novo)
- `netlify/functions/blocked.js` (novo)
- `js/themes.js` (novo)
- `js/cep-helper.js` (novo)
- `css/themes-seasonal.css` (novo)
- `docs/HOMOLOGACAO.md` e `docs/INTEGRACAO.md`

Mantenha as functions existentes (`stock-sync.js`, `roupas-stock.mjs`, `dande-stock.mjs`, `get-catalog.mjs`, `get-feed.js`).

---

## 2. index.html — 3 alterações mínimas

### 2.1 Link do CSS de temas (no `<head>`, depois dos estilos principais)

```html
<link rel="stylesheet" href="css/themes-seasonal.css" />
```

### 2.2 Banner sazonal (logo após o `<body>` ou dentro do header, sem alterar estrutura)

```html
<div id="seasonalBanner" class="seasonal-banner" style="display:none" aria-hidden="true" role="status"></div>
```

### 2.3 Scripts (antes do fechamento de `</body>`, depois do app.js atual)

```html
<script src="js/cep-helper.js"></script>
<script src="js/themes.js"></script>
```

### 2.4 (Opcional) Elementos de feedback de CEP nos formulários

No modal do carrinho, logo abaixo do input de CEP (`#cartObs`):

```html
<p class="cep-city-info" id="cartCepCity" style="display:none;margin:.25rem 0 0;font-size:.85rem;color:#059669"></p>
```

No modal de compra (`#buyMetaModal`), abaixo de `#buyClientCep`:

```html
<p class="cep-city-info" id="buyCepCity" style="display:none;margin:.25rem 0 0;font-size:.85rem;color:#059669"></p>
```

---

## 3. app.js — trechos a adicionar (não reescrever o arquivo)

No final do arquivo (ou após o DOMContentLoaded principal), adicione:

```js
// --- CEP: cidade e estado (não altera regras de preço) ---
(function initCepLookups() {
  if (!window.EmpCep) return;
  const last = { cart: null, buy: null };

  window.EmpCep.attachCepLookup(document.getElementById('cartObs'), {
    warnEl: document.getElementById('cartCepWarn'),
    infoEl: document.getElementById('cartCepCity'),
    onResult: (r) => { last.cart = r; },
  });

  window.EmpCep.attachCepLookup(document.getElementById('buyClientCep'), {
    warnEl: document.getElementById('buyCepWarn'),
    infoEl: document.getElementById('buyCepCity'),
    onResult: (r) => { last.buy = r; },
  });

  // Expõe para a montagem da mensagem WhatsApp
  window.__lastCepLookup = last;
})();
```

### Na montagem da mensagem do WhatsApp

Onde o texto do pedido é montado (procure por `wa.me` ou `encodeURIComponent` da mensagem), inclua a linha de localização:

```js
// Exemplo — adapte aos nomes das variáveis do seu app.js
const cepRaw = (document.getElementById('cartObs')?.value || document.getElementById('buyClientCep')?.value || '').trim();
const lookup = window.__lastCepLookup?.cart?.ok ? window.__lastCepLookup.cart
             : window.__lastCepLookup?.buy?.ok  ? window.__lastCepLookup.buy
             : null;
const locLine = window.EmpCep ? window.EmpCep.locationLine(cepRaw, lookup) : (cepRaw ? 'CEP: ' + cepRaw : '');
// Depois: se locLine, acrescente "\n" + locLine na mensagem
```

---

## 4. Publicar

1. Commit + push no GitHub.
2. Netlify faz deploy automático.
3. Confirme que a function `cep` aparece em **Site configuration → Functions**.
4. Execute o checklist em `docs/HOMOLOGACAO.md`.

---

## 5. O que NÃO mexer

- Regras de preço / markups por fonte (Imarat, Brand, Scoop, roupas, dande).
- Layout estrutural (grid, cards, filtros, cores base do tema normal).
- Scripts de sync existentes.
