# Homologação permanente — sincronização e integridade do catálogo Empório A.R.

**Status:** critérios e regras aprovados; registro consolidado em 09/11/2026.  
**Repositório:** `delvandos-hash/emporio-ar-catalog`  
**Branch de produção:** `main`  
**Última base de código homologada nesta consolidação:** merge do PR #48 — `9564de8086cebb765d2487d8d9602e011d2ae8f4`.

Este documento registra as regras que devem permanecer válidas em toda sincronização futura. Não substitui os testes automatizados: serve como contrato de manutenção e checklist de regressão.

## 1. Regras obrigatórias de correspondência Imarat

- A identificação de um produto Imarat exige marca compatível. Nome igual, sozinho, não autoriza atribuir produto de outra marca à Imarat.
- Correspondência aproximada só pode corrigir título quando marca e volume forem compatíveis e a confiança atingir os limites definidos no código (similaridade >= 0,86; tokens >= 0,80; diferença para o segundo candidato >= 0,08).
- Para a categoria Óleos, o prefixo categorial “Óleo” pode ser ignorado somente na comparação de títulos; o nome publicado continua sendo o nome comercial exato da API raiz.
- Volume numérico em `sizeMl` deve ser interpretado como mililitros. Produtos de volumes diferentes não podem ser tratados como correspondência segura.
- Arabiyat Prestige deve permanecer como marca; “Prestige” não deve ser incorporado indevidamente ao nome do produto quando for apenas parte do nome da marca.
- Nomes corrigidos devem seguir a grafia da API raiz, sem criar nomes por aproximação.

## 2. Proteção contra exclusões indevidas

- Remover por ausência no site raiz somente produtos com procedência Imarat explicitamente comprovada (`fonte: imarat`) ou exceções legadas específicas e aprovadas no código.
- Itens sem procedência confirmada, de outras fontes ou com correspondência ambígua devem ser preservados para revisão; não excluir por simples ausência na API Imarat.
- Os três casos ambíguos e os itens sem candidato seguro identificados na auditoria anterior foram preservados. Não transformar essa lista em exclusões automáticas sem nova evidência.
- Produtos de outras marcas e fornecedores devem continuar fora da atribuição Imarat.

## 3. Regras de miniaturas, duplicados e preços

- Manter a regra homologada de deduplicação de miniaturas por chave normalizada do nome-base, inclusive as normalizações de marcas no nome e prefixos já existentes.
- Preservar a regra especial de normalização de Atheri/Atherri: o título canônico é **Miniatura Atherri Afeer**.
- Não ampliar a deduplicação para produtos de outras categorias nem alterar regras de preço, preço manual, miniaturas, óleos ou demais fontes sem auditoria e testes próprios.
- Conflitos de preço não devem ser descartados automaticamente; qualquer regra nova precisa de validação explícita e testes de regressão.

## 4. Correções específicas já homologadas

- `Kit Thawrah` → `Kit Tharwah`, respeitando marca e volume.
- `Miniatura Sapatinho` → `Miniatura Sapatinho GOOD GIRL`, respeitando marca e volume.
- `Miniatura Atheri Afeer` → `Miniatura Atherri Afeer`.
- Arabiyat Prestige: separar marca e nome do produto, removendo prefixo redundante “Prestige” do título quando aplicável (ex.: Noiré Absolu).
- Correspondências de Óleos: ignorar “Óleo” apenas como prefixo categorial na comparação e exigir compatibilidade de marca e volume.
- Corrigir a leitura de `sizeMl` numérico na auditoria para impedir falsos positivos entre volumes diferentes.

## 5. Publicação e sincronização recorrente

O workflow `.github/workflows/sync-stock.yml` deve manter:
- execução agendada às 08:00 e 20:00 no horário de Brasília (cron UTC 11:00 e 23:00);
- execução manual via `workflow_dispatch`;
- execução dos testes de sanitização e proteção de origem antes de publicar;
- sincronização de catálogo e, em seguida, atualização de disponibilidade/estoque;
- publicação somente da estrutura sanitizada via `toPublicCatalog(DATA)`.

Não remover os testes do workflow nem mover a publicação para antes dos testes. Não reintroduzir gatilho de push para sincronização de produção sem decisão explícita, pois a publicação deve continuar controlada pelo agendamento ou despacho manual.

## 6. Testes automatizados obrigatórios

O workflow recorrente executa:

```sh
node --test scripts/public-image-url.test.mjs scripts/public-catalog.test.mjs scripts/imarat-image-url.test.mjs scripts/imarat-source-guard.test.mjs
```

O conjunto de proteção deve continuar cobrindo:
- exclusão apenas com procedência Imarat comprovada;
- separação de marca Arabiyat Prestige e nome do produto;
- correspondência por marca, inclusive proteção de grupos genéricos;
- correção aproximada com marca, volume e limiar de confiança;
- preservação de miniaturas sem origem confirmada;
- correções de Kit Tharwah e Miniatura Sapatinho com volume compatível;
- normalização do prefixo “Óleo” somente na categoria Óleos;
- interpretação de `sizeMl` numérico e rejeição de volumes incompatíveis;
- sanitização do catálogo público e URLs de imagens.

Além dos testes automatizados, antes de aprovar qualquer mudança de sincronização:
1. executar dry-run sem publicar;
2. executar a auditoria somente leitura de todos os produtos Imarat;
3. revisar todos os casos ambíguos e sem candidato seguro;
4. verificar que as regras de preço e deduplicação não foram alteradas;
5. confirmar todos os checks do PR;
6. após merge, conferir a execução recorrente e a publicação do snapshot/Gist.

## 7. Evidências registradas da homologação anterior

- PR #45: proteção de correspondência por marca.
- PR #48: melhoria da comparação de títulos de Óleos e interpretação de volume numérico; merge em `9564de8`.
- Auditoria somente leitura anterior: 954 produtos na API raiz; 893 registros do catálogo avaliados; 852 títulos exatos por marca; 0 correções de alta confiança pendentes; 3 ambiguidades; 38 sem candidato seguro. Os casos não seguros foram preservados.
- Sincronização de produção #246 (run `42673402634`): conclusão bem-sucedida; duas publicações no Gist confirmadas; 23 duplicatas de miniaturas e 1 duplicata exata removidas; 0 conflitos de preço removidos; 0 exclusões por nome ausente sem procedência confirmada.
- A sincronização acima ocorreu antes do merge do PR #48. Portanto, a persistência da correção de auditoria/volume passa a ser exercitada na próxima sincronização após esse merge.

## 8. Critério de aprovação contínua

Uma sincronização só deve ser considerada homologada quando:
- os testes obrigatórios passam;
- a execução conclui sem erro;
- a publicação do catálogo sanitizado é confirmada;
- não há atribuição cruzada de marcas;
- não há correções ou exclusões de itens ambíguos/sem origem comprovada;
- preços, regras de miniaturas e demais regras previamente aprovadas permanecem inalterados.

**Regra de manutenção:** qualquer alteração futura em `sync-catalog.mjs`, `sync-stock.mjs`, `audit-imarat-titles.mjs` ou nos testes deve atualizar este documento e demonstrar a regressão das regras acima antes do merge.
