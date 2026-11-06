# Empório A.R — Catálogo (Perfumes / Roupas / Acessórios)

Versão homologada com segurança, CEP (cidade + estado) e temas sazonais.

## Destaques desta versão

- **Segurança**: CSP + headers + bloqueio de arquivos sensíveis (`netlify.toml`, `blocked.js`)
- **CEP**: function `cep.js` (ViaCEP + BrasilAPI) + `js/cep-helper.js` — mostra cidade/UF e inclui na mensagem do WhatsApp
- **Temas sazonais**: `js/themes.js` + `css/themes-seasonal.css` (mesmas regras do Beauty; não altera layout)
- **Regras de preço das 5 fontes**: **inalteradas**

## Deploy

1. Substitua o conteúdo do repositório GitHub por estes arquivos (ou faça merge mantendo `assets/` e segredos).
2. No Netlify: Functions devem listar `cep`, `blocked`, `stock-sync`, `roupas-stock`, `dande-stock`, `get-catalog`, `get-feed`.
3. Checklist: `docs/HOMOLOGACAO.md`

## Estrutura principal

```
index.html
js/app.js
js/data.js
js/prices.js
js/cep-helper.js
js/themes.js
css/themes-seasonal.css
netlify.toml
netlify/functions/*
scripts/*
docs/*
```
