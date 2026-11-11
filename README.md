# Empório A.R — Catálogo digital

Catálogo estático hospedado no Netlify, com dados públicos servidos pelo Gist e sincronização automatizada via GitHub Actions.

## Arquitetura atual

- **Interface:** `index.html`, `js/app.js`, `js/data.js`, `js/prices.js`, `js/favorites.js`, `js/themes.js`, `css/` e `assets/`.
- **API pública do catálogo:** `/api/catalogo` → Netlify Function `netlify/functions/get-catalog.mjs` → Gist `catalogo.json`.
- **Imagens e compartilhamento:** Netlify Functions e Edge Function em `netlify/`.
- **Estoque ao vivo:** endpoints `/api/stock-sync`, `/api/roupas-stock` e `/api/dande-stock`.
- **Sincronização de fontes:** `scripts/sync-catalog.mjs` e `scripts/sync-stock.mjs`.
- **Agendamento:** workflow `.github/workflows/sync-stock.yml`, diariamente às 08h e 20h (Brasília).

## Operação

A execução agendada e a execução manual completa sincronizam as fontes configuradas, validam a coleta antes de remover produtos ausentes, publicam o catálogo sanitizado no Gist e atualizam `js/data.js` quando aplicável.

Push na `main` executa apenas a validação/dry-run definida no workflow; não deve ser confundido com a sincronização completa agendada/manual.

## Desenvolvimento e validação

- Runtime: Node.js 22 nas Actions.
- Os scripts usam módulos nativos do Node.js; não há manifesto `package.json` nem instalação de dependências npm como requisito do fluxo atual.
- Testes são executados com `node --test`.
- Consulte os workflows em `.github/workflows/` para os testes específicos de cada área.
- Relatórios em `docs/HOMOLOGACAO*.md` são registros históricos das homologações realizadas, não comandos de operação.

## Configuração

As credenciais e URLs das fontes ficam nos GitHub Actions Secrets e as variáveis de execução do site ficam no Netlify. Não versionar tokens, segredos ou dados internos de fornecedores.

## Publicação

O deploy do site é responsabilidade da integração GitHub–Netlify. Alterações em arquivos de interface, functions ou configuração do Netlify exigem deploy para entrarem em produção. Atualizações no Gist podem refletir no catálogo sem alterar o código publicado.
