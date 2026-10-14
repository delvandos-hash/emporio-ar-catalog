# Sincronização automática de estoque — Empório A.R

## O que foi implementado (opção C)

### 1) Ao abrir o catálogo (tempo real)
- O site chama `/.netlify/functions/stock-sync`
- A função consulta a **Imarat** (`inStock`) e a **Brand Collection** (`total_estoque` / `status`)
- O catálogo aplica **Disponível / Esgotado** na tela
- Resultado fica em cache no celular por **30 minutos**

### 2) Robô 2x por dia (permanente no data.js)
- Script: `scripts/sync-stock.mjs`
- Workflow GitHub: `.github/workflows/sync-stock.yml` (08h e 20h Brasília)
- Atualiza `js/data.js` e faz push → Netlify republica

---

## Como ativar no Netlify

1. Publique **toda a pasta** do catálogo (incluindo `netlify/`, `netlify.toml`, `scripts/`)
2. No painel Netlify → **Site configuration → Functions**  
   Confirme que a função `stock-sync` aparece
3. (Opcional) **Scheduled functions** já estão no `netlify.toml`

## Como ativar o robô no GitHub (recomendado)

1. Crie um repositório e envie os arquivos do catálogo
2. Conecte o repositório ao Netlify (deploy automático no push)
3. Em **Actions**, o workflow **Sync estoque Imarat** roda sozinho  
   Ou clique em **Run workflow** para testar

## Rodar na mão (computador)

```bash
cd emporio_ar_unificado
node scripts/sync-stock.mjs
```

Depois publique de novo o `js/data.js` no Netlify.

---

## Observações

| Fonte | Sincroniza? |
|--------|-------------|
| **Imarat** (Perfumes, Miniaturas, Óleos…) | Sim — automático |
| **Brand Collection** (sessão Brand) | Sim — via FácilZap (`carregar_produtos`, total_estoque) |
| **Scoop Premiado** | Não vem dos raízes — mantém o que você definiu |

Se a Imarat mudar a API, avise para ajustarmos a função.


## Novos produtos (automático)

O script `scripts/sync-catalog.mjs` também:

1. Compara Imarat + Brand com o `data.js`
2. **Adiciona só o que ainda não existe**
3. Aplica precificação:
   - **Imarat:** varejo e atacado do site + R$ 30
   - **Brand:** ≤100 → +30 atacado / +60 varejo; >100 → +60 / +90; Arabic mini → 85 / 125
4. Busca foto, volume, gênero e notas (Imarat via detalhe do produto)
5. Atualiza estoque dos itens já existentes

```bash
node scripts/sync-catalog.mjs
```

Não remove itens nem sobrescreve preços/fotos que você já editou manualmente nos produtos existentes.


## Brand — apenas sessões selecionadas

O robô **não** importa todo o catálogo Brand. Só estas sessões:

- ARABIC COLLECTION
- BEAUTY BRAND
- BODY SPLAHS
- COLEÇÃO BRAND
- COLEÇÂO DREAM
- DREAM BRAND 80/100ML
- FLACONETE BRAND
- SAPATINHO GOOD GIRL

Novos itens **fora** dessas sessões são ignorados. Estoque é atualizado para os Brand já existentes.
