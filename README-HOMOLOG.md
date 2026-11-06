# Pacote de homologação — Empório A.R (Perfumes / Roupas / Acessórios)

Este diretório contém **apenas os arquivos novos ou que devem substituir** os atuais no repositório  
https://github.com/delvandos-hash/emporio-ar-catalog

## Objetivo

- Homologar com **segurança** (CSP, headers, bloqueio de arquivos sensíveis)
- Trazer **busca de CEP com cidade e estado** (ViaCEP + BrasilAPI via function)
- Implementar **temas sazonais por data** (mesma planilha/regras do catálogo Beauty), **sem alterar o layout**
- **Não mexer** nas regras de preço das 5 fontes raiz

## Conteúdo

```
netlify.toml                 ← SUBSTITUIR
netlify/functions/
  cep.js                     ← NOVO
  blocked.js                 ← NOVO
js/
  themes.js                  ← NOVO
  cep-helper.js              ← NOVO
css/
  themes-seasonal.css        ← NOVO
docs/
  HOMOLOGACAO.md             ← checklist
  INTEGRACAO.md              ← passo a passo no index.html e app.js
README-HOMOLOG.md            ← este arquivo
```

## Como aplicar

1. Baixe/copie estes arquivos para o clone local do `emporio-ar-catalog`.
2. Siga **docs/INTEGRACAO.md** (3 trechos no `index.html` + 1 bloco no final do `app.js`).
3. Commit + push → Netlify publica.
4. Execute o checklist em **docs/HOMOLOGACAO.md**.

## O que permanece igual

- Todas as regras de preço por fonte (Imarat, Brand, Scoop, roupas, dande)
- Layout visual atual (cores, grid, cards, filtros)
- Scripts de sync e functions de estoque já existentes
