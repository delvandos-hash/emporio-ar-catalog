# Homologação — Empório A.R (Perfumes / Roupas / Acessórios)

Executar **após** aplicar os arquivos deste pacote e publicar no Netlify.

## Checklist de segurança e funções

| # | Teste | Como validar | Critério de aceite | Evidência |
|---|---|---|---|---|
| 1 | CSP / Headers | DevTools → Network → Response Headers da home | X-Frame-Options DENY, X-Content-Type-Options nosniff, CSP presente | print headers |
| 2 | Bloqueio data/* | `curl -I https://SEU-SITE.netlify.app/data/qualquer` | 404 | print curl |
| 3 | CEP válido | Digitar CEP completo no carrinho / modal comprar | Aparece "📍 Cidade - UF" | print |
| 4 | CEP inválido | CEP `00000000` ou incompleto | Aviso "CEP não encontrado" ou "incompleto" | print |
| 5 | Mensagem WhatsApp com local | Checkout com CEP válido | Texto contém CEP + cidade/UF | print WhatsApp |
| 6 | Tema sazonal ativo | Abrir site em data de tema (ou forçar via console) | Banner `#seasonalBanner` visível + `body.theme-*` | print + DevTools |
| 7 | Tema não quebra layout | Comparar cards/filtros/carrinho com e sem tema | Layout estrutural idêntico; só cores/banner mudam | print lado a lado |
| 8 | Estoque ao vivo (Imarat/Brand) | Abrir catálogo | Disponível/Esgotado atualiza | print |
| 9 | Functions roupas/dande | Network → `/api/roupas-stock` e `/api/dande-stock` | 200 e JSON válido | print |
| 10 | Feed | `curl -I /feed.xml` | 200 + Content-Type xml | print |
| 11 | Preços por fonte | Produtos das 5 fontes raiz | Valores **iguais** às regras já estabelecidas (não alterar) | print + JSON |
| 12 | Offline / PWA | DevTools → Offline | Home carrega do SW | print |
| 13 | Lighthouse mobile | Home | Performance ≥ 70, A11y ≥ 90, SEO ≥ 90 | PDF |
| 14 | Sem dados sensíveis públicos | Inspecionar `js/data.js` / Gist | Sem `basePrice` / markup / sourceUrl de custo | print |

## Temas sazonais (mesma planilha do Beauty)

- Feriados institucionais: só no dia.
- Datas comerciais: janela padrão 3 dias antes → 2 dias depois (exceto Halloween e Natal).
- Natal: 01/12 a 30/12.
- Dia das Mães / Pais: 2º domingo de maio / agosto (cálculo automático).
- Black Friday: 4ª sexta de novembro; Cyber Monday = BF + 3 dias.

Forçar tema no console (teste):
```js
document.body.classList.add('theme-natal');
document.getElementById('seasonalBanner').style.display = '';
document.getElementById('seasonalBanner').textContent = '🎄 teste';
```

## Regras de preço

**NÃO alterar.** As 5 fontes raiz e markups/acréscimos por fonte permanecem exatamente como definidos no `scripts/sync-catalog.mjs` atual.

## Env vars Netlify (recomendado)

| Variável | Uso |
|----------|-----|
| `SITE_URL` | URL canônica do catálogo |
| `GIST_TOKEN` / tokens de sync | Já usados pelos workflows existentes |

## Arquivos deste pacote (substituir / adicionar)

```
netlify.toml                          ← substituir
netlify/functions/cep.js              ← novo
netlify/functions/blocked.js          ← novo
js/themes.js                          ← novo
js/cep-helper.js                      ← novo
css/themes-seasonal.css               ← novo (link no index)
docs/HOMOLOGACAO.md                   ← novo
docs/INTEGRACAO.md                    ← novo (passos no index.html e app.js)
```

Manter intactos: `scripts/sync-catalog.mjs`, `scripts/sync-stock.mjs`, functions de estoque existentes, regras de preço e layout visual.
