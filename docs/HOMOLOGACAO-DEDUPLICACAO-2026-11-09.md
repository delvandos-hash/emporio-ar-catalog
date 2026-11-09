# Homologação — identidade e deduplicação do catálogo

**Data:** 09/11/2026  
**Base homologada:** `backup/catalogo-aprovado-2026-11-09`  
**Commit da base:** `cc8f2fd71e665cd8f4a1b32e835003d1218a5216`  
**Blob SHA de `js/data.js`:** `8339338c10940300cab1bd1ca49821bb6244557f`  
**Correção integrada:** PR #75 — commit `4145e17eae910af62dbdfb182076a9a6b0ae2651`  
**Backup pós-correção:** `backup/catalogo-aprovado-com-dedupe-2026-11-09`

## Regras homologadas

1. **Preservação da base:** nenhuma etapa de deduplicação remove automaticamente produtos que já estejam em `js/data.js`.
2. **Perfumes:** identidade por marca + nome normalizado exato + volume, independente de grupo/categoria. Nomes semelhantes de marcas diferentes são produtos distintos. Não usar substring ou aproximação para apagar registros.
3. **Miniaturas:** ID da origem é a identidade primária. Quando o ID não existe, usar marca + nome-base exato + volume. Marcas diferentes, volumes diferentes e IDs de origem diferentes permanecem separados.
4. **Marca desconhecida:** comparar primeiro o ID de origem; usar nome/volume apenas como fallback para registros legados sem ID, sem atribuir automaticamente uma marca conhecida.
5. **Preço e fotos:** registros existentes com valores ou imagens diferentes são preservados. Nenhuma limpeza em lote é permitida.
6. **Auditoria:** relatórios de miniaturas e Imarat devem incluir marca e ID de origem para não confundir, por exemplo, miniaturas Lattafa com miniaturas Only You.

## Evidências de validação

- Testes de identidade e deduplicação: aprovados.
- Testes de correspondência Imarat: aprovados.
- Testes de sanitização do catálogo público: aprovados.
- Dry-run de sincronização Imarat: aprovado, sem publicação.
- Auditoria da API Imarat: 0 grupos duplicados por identidade de origem.
- Auditoria de miniaturas do catálogo: 0 grupos de duplicidade confirmada por correspondência Imarat.
- Miniaturas Only You: 23/23 presentes no catálogo público.
- Dois registros com nomes-base iguais, mas IDs de origem diferentes, foram preservados como itens distintos: Armaf Spectra (IDs 907/908) e Atherri Afeer (IDs 1474/1481).

## Bloqueio de publicação ainda ativo

A auditoria de baseline encontrou:

- `js/data.js`: 1.959 itens.
- Gist público: 2.125 itens.
- Chaves somente no arquivo interno: 48.
- Chaves somente no Gist: 235.
- Limite de divergência para publicação: 25.

**Resultado:** `publicação permitida=false`.

Por segurança, não executar a Action `Sync Catálogo` nem publicar no Gist até reconciliar essas diferenças item a item, preservando produtos legítimos de todas as fontes. O dry-run e as auditorias não alteraram `js/data.js`, o Gist ou a produção.
