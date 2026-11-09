import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./sync-catalog.mjs", import.meta.url), "utf8");
const restoreOnlyYouSource = fs.readFileSync(new URL("./restore-onlyyou-minis.mjs", import.meta.url), "utf8");
const auditMiniSource = fs.readFileSync(new URL("./audit-miniaturas-imarat.mjs", import.meta.url), "utf8");
const auditAllSource = fs.readFileSync(new URL("./audit-imarat-all-products.mjs", import.meta.url), "utf8");
const auditSource = fs.readFileSync(new URL("./audit-imarat-titles.mjs", import.meta.url), "utf8");
const audit = fs.readFileSync(new URL("./audit-imarat-all-products.mjs", import.meta.url), "utf8");

test("limpeza de títulos só pode excluir produto com procedência Imarat explícita", () => {
  assert.match(source, /const fonteImarat = norm\(item\.fonte\) === 'imarat';/);
  assert.match(source, /if \(!fonteImarat\) return true;/);
  assert.doesNotMatch(source, /categoriasImarat\s*=\s*new Set/);
});

test("Arabiyat Prestige permanece no campo de marca, separado do nome do produto", () => {
  assert.match(source, /ensureBrandGroup\(DATA, line, marcaCorreta, g\.cat\)/);
  assert.match(source, /MARCA ARABIYAT PRESTIGE CORRIGIDA/);
  assert.match(source, /marcaPublicaImarat\(hit\.brand\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(source, /limparTexto\(hit\.brand \|\| g\.brand \|\| 'Outros'\)\.trim\(\)/);
  assert.match(source, /limparTexto\(p\.brand \|\| 'Outros'\)\.trim\(\)/);
});

test("identificação Imarat exige marca compatível ou nome único em grupo genérico", () => {
  assert.match(source, /candidatosNomeExato\.find\(p => norm\(marcaPublicaImarat\(p\.brand\)\) === b\)/);
  assert.doesNotMatch(source, /imaratList\.find\(\(p\) => norm\(p\.name\) === n\)\s*\|\|/);
  assert.match(source, /\['outros', 'outra'\]\.includes\(b\) && candidatosNomeExato\.length === 1/);
});

test("correções aproximadas exigem marca, volume compatível e alta confiança", () => {
  assert.match(source, /norm\(marcaPublicaImarat\(p\.brand\)\) === b/);
  assert.match(source, /itemVolume === sourceVolume/);
  assert.match(source, /best\.score >= 0\.86 && best\.tokens >= 0\.8/);
  assert.match(source, /best\.score - second\.score >= 0\.08/);
  assert.match(source, /!\['outros', 'outra'\]\.includes\(b\)/);
});

test("não remove miniaturas de outras origens apenas por não constarem na Imarat", () => {
  assert.doesNotMatch(source, /const itensLegadosForaDoSite = new Set/);
  assert.match(source, /if \(!fonteImarat && !legadoArabiyatPrestige && !legadoMiniaturaAfeer\) return true/);
});

test("corrige somente os dois títulos especiais com marca e volume compatíveis", () => {
  assert.match(source, /b === 'lattafa' && n === 'kit thawrah'/);
  assert.match(source, /norm\(p\.name\) === 'kit tharwah'/);
  assert.match(source, /b === 'only you' && n === 'miniatura sapatinho'/);
  assert.match(source, /norm\(p\.name\) === 'miniatura sapatinho good girl'/);
  assert.match(source, /volumeMatch\(it\.volume, it\.nome\) === volumeMatch\(p\.sizeMl, p\.name\)/);
});


test("normaliza o prefixo Óleo somente na comparação de títulos da categoria Óleos", () => {
  assert.match(source, /if \(norm\(category\)\.includes\('oleo'\)\) value = value\.replace\(\/\^oleo\\s\+\//);
});

test("auditoria interpreta sizeMl numérico como ml e não aceita volume incompatível", () => {
    assert.ok(auditSource.includes(`.replace(/['’]s\\b/gi, "")`));
  assert.ok(auditSource.includes('const explicit = raw.match'));
  assert.match(source, /itemVolume === sourceVolume/);
});

test("auditoria de miniaturas usa volume e categoria retornados pela Imarat", () => {
  assert.match(auditMiniSource, /function volumeFrom\(value, name\)/);
  assert.match(auditMiniSource, /const sourceCategory = String\(source\.categoria_nome \|\| source\.categoria \|\| ""\)/);
  assert.match(auditMiniSource, /automaticMiniPrice\(item\.nome, group\.brand, volumeOf\(item\), sourceCategory/);
  assert.match(auditMiniSource, /if \(isOleo\(item\?\.nome\)\) return false/);
});

test("auditoria global só confirma duplicidade após correspondência segura de marca e volume", () => {
  assert.match(auditAllSource, /async function fetchLiveCatalog\(\)/);
  assert.match(auditAllSource, /const GIST_TOKEN = process\.env\.GIST_TOKEN/);
  assert.match(auditAllSource, /function sourceBrandMatches\(catalogBrand,sourceBrand\)/);
  assert.match(auditAllSource, /function volumeCompatible\(left,right\)/);
  assert.match(auditAllSource, /const confirmedNormalDuplicates=\[\.\.\.catalogBySourceIdentity\]/);
  assert.match(auditAllSource, /const confirmedMiniDuplicates=\[\.\.\.miniGlobalGroups\]/);
  assert.match(auditAllSource, /Boolean\(sourceCategory\) && norm\(x\.category\)!==norm\(sourceCategory\)/);
  assert.match(auditAllSource, /COLISÃO DE NOME\/CHAVE SEM DUPLICIDADE CONFIRMADA/);
});

test("correspondência exata exige volume compatível e não trata Empório A.R como grupo genérico", () => {
  assert.match(source, /const candidatosNomeExato = imaratList\.filter\(p => norm\(p\.name\) === n && volumeCompativel\(p\)\)/);
  assert.match(source, /\['outros', 'outra'\]\.includes\(b\) && candidatosNomeExato\.length === 1/);
  assert.doesNotMatch(source, /\['outros', 'outra', 'emporio a r'\]\.includes\(b\)/);
});

test("registra o ID privado da origem e consolida duplicatas sem confundir IDs distintos", () => {
  assert.match(source, /if \(hit\.id != null\) it\.id_origem = String\(hit\.id\)/);
  assert.match(source, /id_origem: String\(p\.id \?\? p\.productId \?\? ''\)/);
  assert.match(source, /const imaratPorId = new Map\(\)/);
  assert.match(source, /DUPLICATA IMARAT CONSOLIDADA POR ID DA ORIGEM/);
  assert.match(source, /if \(norm\(item\.fonte\) === 'imarat' && item\.id_origem\)/);
});


test("bloqueia publicação quando a base interna diverge do Gist vivo", () => {
  assert.match(source, /async function fetchLiveGistBaseline\(\)/);
  assert.match(source, /function countCatalogIdentity\(DATA\)/);
  assert.match(source, /if \(!SYNC_DRY_RUN && \(onlyLive > 25 \|\| onlyInternal > 25/);
  assert.match(source, /SINCRONIZAÇÃO BLOQUEADA: data\.js interno diverge do Gist vivo/);
});

test("restauração Only You é append-only, respeita preço manual e valida antes de gravar", () => {
  assert.match(restoreOnlyYouSource, /source\.filter\(p => norm\(p\.brand\) === "only you"\)/);
  assert.match(restoreOnlyYouSource, /function findLiveMatches\(DATA, product, volume\)/);
  assert.match(restoreOnlyYouSource, /if \(matches\.length\)/);
  assert.match(restoreOnlyYouSource, /manualPrice\(internalItem\) \? internalItem\.varejo/);
  assert.match(restoreOnlyYouSource, /group\.items\.push\(entry\.item\)/);
  assert.match(restoreOnlyYouSource, /if \(DRY_RUN\)/);
  assert.match(restoreOnlyYouSource, /stillMissing/);
  assert.doesNotMatch(restoreOnlyYouSource, /group\.items\s*=\s*group\.items\.filter/);
});

test("deduplicação de miniaturas exige marca e volume compatíveis", () => {
  assert.ok(source.includes("marca|${norm(g.brand)}|nome|${chaveComparacaoMini(item.nome)}|volume|${volumeMatch(item.volume, item.nome)}"));
  assert.ok(source.includes("const chaveComIdentidade = `${norm(brand)}|${chave}|${volumeKey}`"));
  assert.ok(source.includes("duplicado = indexMiniImarat.has(chaveComIdentidade)"));
  assert.ok(!source.includes("indexMiniImarat.has(chave)"));
});

test("normaliza o possessivo inglês para comparar Victoria's Secret com o nome da origem", () => {
  assert.ok(source.includes(".replace(/['’]s"));
  assert.ok(auditAllSource.includes(".replace(/['’]s"));
  assert.ok(auditSource.includes(".replace(/['’]s"));
  assert.ok(auditMiniSource.includes(".replace(/['’]s"));
});

test("deduplicação geral preserva nomes iguais entre marcas e volumes diferentes", () => {
  assert.ok(source.includes("const chave = id ? `id|\u0024{norm(g.brand)}|\u0024{id}`"));
  assert.ok(source.includes("`produto|\u0024{norm(g.brand)}|\u0024{limparParaComparacao(item.nome)}|\u0024{volume}`"));
  assert.ok(source.includes("indexNormal.add(`\u0024{norm(g.brand)}|\u0024{nomeKey}|\u0024{volumeKey}`)"));
  assert.ok(!source.includes("indexNormal.add(limparParaComparacao(it.nome))"));
  assert.ok(source.includes("duplicado = indexNormal.has(`\u0024{norm(brand)}|\u0024{nomeKey}|\u0024{volumeKey}`)"));
});

test("marca ausente não pode criar duplicata ambígua em outra marca", () => {
  assert.match(source, /const marcaConhecida = Boolean\(String\(p\.brand \|\| ''\)\.trim\(\)\)/);
  assert.match(source, /!marcaConhecida && indexNameVolume\.has/);
  assert.match(source, /!marcaConhecida && indexMiniNameVolume\.has/);
  assert.match(audit, /const brandKnown=Boolean\(String\(p\.brand\|\|""\)\.trim\(\)\)/);
  assert.match(audit, /!brandKnown&&normalNameVolumeIndex\.has/);
  assert.match(audit, /!brandKnown&&miniNameVolumeIndex\.has/);
});

test("restauração do Imarat preserva preços públicos divergentes e mídia existente", () => {
  assert.match(source, /function findPublicCatalogMatch\(/);
  assert.match(source, /LIVE_GIST_DATA = liveDATA/);
  assert.match(source, /const publicMatch = findPublicCatalogMatch\(LIVE_GIST_DATA/);
  assert.match(source, /const publicPriceDiffers = publicHasPrices/);
  assert.match(source, /precoManual: true/);
  assert.match(source, /publicMatch\?\.fotos/);
});

test("restauração pública registra correspondências e preços preservados", () => {
  assert.match(source, /function priceNumber\(/);
  assert.match(source, /publicPricesPreserved/);
  assert.match(source, /publicGistMatches/);
});

test("preços de produtos existentes são preservados quando divergem da regra e não há sinal seguro para recalcular", () => {
  assert.match(source, /const nomePublicoAnterior = it\.nome/);
  assert.match(source, /findPublicCatalogMatch\(LIVE_GIST_DATA, marcaPublicaAnterior, nomePublicoAnterior/);
  assert.match(source, /if \(publicPriceDiffers\) \{/);
  assert.match(source, /it\.precoManual = true/);
  assert.match(source, /existingPricesProtectedWithoutMatch\+\+/);
});
