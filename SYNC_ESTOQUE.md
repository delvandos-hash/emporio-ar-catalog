# Sincronização do catálogo — Empório A.R

## Fluxo atual

O workflow `.github/workflows/sync-stock.yml` é o fluxo principal de sincronização do catálogo. Ele roda automaticamente todos os dias às **08h e 20h (horário de Brasília)** e também pode ser iniciado manualmente pelo GitHub Actions.

A execução completa consulta as fontes configuradas:
- Imarat
- Brand Collection
- Sophia
- Franny
- Dande

O sincronizador principal é `scripts/sync-catalog.mjs`. A atualização complementar de disponibilidade usa `scripts/sync-stock.mjs`.

## Proteção dos dados

- Um produto só é removido quando a coleta da respectiva fonte é concluída e sua ausência é confirmada.
- Falha, resposta inválida, paginação incompleta ou coleta suspeita deve interromper a reconciliação destrutiva.
- Preços manuais, identidade de variantes, imagens e referências públicas devem ser preservados conforme as regras do sincronizador.
- Os cinco itens próprios de Scoop Premiado não pertencem às fontes externas e devem ser preservados.
- O catálogo público é sanitizado antes da publicação no Gist.

## Gist e site

O catálogo online consulta `/api/catalogo`, servido pela Netlify Function `get-catalog.mjs`, que lê o Gist `catalogo.json`. Por isso, uma publicação válida do Gist pode atualizar os dados visíveis sem deploy do site.

Mudanças no código das Netlify Functions, na interface, nos redirects ou em `netlify.toml` exigem novo deploy para entrarem em produção.

## Execução manual

No GitHub:
1. Abra **Actions**.
2. Selecione **Sync catálogo (estoque + novos produtos)**.
3. Clique em **Run workflow**.
4. Deixe `dry_run` desmarcado para sincronização real. Marque-o somente para simular sem publicar.
5. Não habilite a restauração de snapshot sem uma necessidade de recuperação previamente confirmada.

## Arquivos centrais

- `scripts/sync-catalog.mjs` — sincronização completa das fontes.
- `scripts/sync-stock.mjs` — atualização de disponibilidade.
- `scripts/public-catalog.mjs` — sanitização do catálogo público.
- `scripts/restore-gist-only-legacy.mjs` — preservação segura de registros legados com identidade confirmada.
- `netlify/functions/stock-sync.js` — estoque consultado pelo site em tempo real.
- `.github/workflows/sync-stock.yml` — agendamento e execução principal.

Os relatórios em `docs/` documentam homologações anteriores e não substituem o fluxo operacional acima.
