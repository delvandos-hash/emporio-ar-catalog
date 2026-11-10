import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./sync-catalog.mjs", import.meta.url), "utf8");
const restoreOnlyYouSource = fs.readFileSync(new URL("./restore-onlyyou-minis.mjs", import.meta.url), "utf8");
const auditMiniSource = fs.readFileSync(new URL("./audit-miniaturas-imarat.mjs", import.meta.url), "utf8");
const auditAllSource = fs.readFileSync(new URL("./audit-imarat-all-products.mjs", import.meta.url), "utf8");
const auditSource = fs.readFileSync(new URL("./audit-imarat-titles.mjs", import.meta.url), "utf8");
const audit = fs.readFileSync(new URL("./audit-imarat-all-products.mjs", import.meta.url), "utf8");
const additiveSource = fs.readFileSync(new URL("./apply-additive-reconciliation.mjs", import.meta.url), "utf8");
const publicCatalogSource = fs.readFileSync(new URL("./public-catalog.mjs", import.meta.url), "utf8");

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
  assert.match(auditMiniSource, /norm\(line\) \+ "\\|" \+ norm\(group\.brand\) \+ "\\|" \+ name \+ "\\|" \+ volumeOf\(item\)/);
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


test("baseline só aceita um ID legado quando o preflight aditivo foi aprovado", () => {
  assert.match(source, /async function fetchLiveGistBaseline\(\)/);
  assert.match(source, /function countCatalogPublicIds\(DATA, alreadyPublic = false\)/);
  assert.match(source, /countCatalogPublicIds\(liveDATA, true\)/);
  assert.match(source, /return \{ count: keys\.size, items, missingIds, keys \}/);
  assert.match(source, /ALLOW_SAFE_ADDITIVE_BASELINE/);
  assert.match(source, /const allowedLiveOnly = safeAdditiveBaseline \? 1 : 0/);
  assert.match(source, /onlyLive > allowedLiveOnly/);
  assert.match(source, /preSyncPreservation\.ambiguous > 0/);
  assert.match(source, /SAFE_ADDITIVE_BASELINE_OVERRIDE=true/);
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

test("miniaturas usam ID de origem e fallback conservador por marca, nome e volume", () => {
  assert.ok(source.includes("miniIdentityBaseKey(it, g.brand)"));
  assert.ok(source.includes("isDuplicateMiniSource(existing, p.id ?? p.productId ?? \"\""));
  assert.ok(source.includes("!marcaConhecida && nameVolumeCandidates.length"));
  assert.ok(source.includes("indexMiniByBase.get(baseKey).push({ id_origem: String(p.id ?? p.productId ?? \"\""));
  assert.doesNotMatch(source, /miniaturasGlobaisVistas/);
});

test("normaliza o possessivo inglês para comparar Victoria's Secret com o nome da origem", () => {
  assert.ok(source.includes(".replace(/['’]s"));
  assert.ok(auditAllSource.includes(".replace(/['’]s"));
  assert.ok(auditSource.includes(".replace(/['’]s"));
  assert.ok(auditMiniSource.includes(".replace(/['’]s"));
});

test("perfumes exigem marca, nome exato e volume; semelhanças entre marcas são preservadas", () => {
  assert.ok(source.includes("const indexNormal = new Map()"));
  assert.ok(source.includes("indexNormal.get(normalKey).push({ id_origem: it.id_origem ?? it.id ?? it.slug ?? \"\" })"));
  assert.ok(source.includes("duplicado = isDuplicateMiniSource(normalCandidates, candidateId)"));
  assert.ok(source.includes("duplicado = isDuplicateMiniSource(nameVolumeCandidates, candidateId)"));
  assert.ok(source.includes("Nomes iguais em marcas diferentes coexistem"));
});

test("sincronização remove somente cópias integralmente idênticas", () => {
  assert.match(source, /exactCatalogFingerprint\(item, group\.brand, item\.fonte, line, group\.cat\)/);
  assert.match(source, /Duplicatas integralmente idênticas removidas/);
  assert.doesNotMatch(source, /miniaturasGlobaisVistas/);
  assert.doesNotMatch(source, /miniaturasDuplicadasRemovidas\+\+/);
});

test("auditorias distinguem miniaturas por marca e ID de origem", () => {
  assert.ok(auditMiniSource.includes("key: source"));
  assert.ok(auditMiniSource.includes('norm(group.brand) + "|source|" + String(source.id || source.productId || source.slug || "")'));
  assert.ok(auditMiniSource.includes('norm(group.brand) + "|" + name + "|" + volumeOf(item)'));
  assert.match(auditAllSource, /return `mini\\|\$\{norm\(brand\|\|"outros"\)\}\|/);
});

test("perfumes de marcas diferentes com nome e volume iguais não são deduplicados", () => {
  assert.match(source, /normalProductKey\(nome, volume, brand\)/);
  assert.match(source, /isDuplicateMiniSource\(normalCandidates, candidateId\)/);
  assert.match(source, /isDuplicateMiniSource\(nameVolumeCandidates, candidateId\)/);
  assert.match(auditAllSource, /normal\|\$\{norm\(brand\|\|"outros"\)\}\|\$\{limparParaComparacao\(nome\)\}\|\$\{volumeMatch\(volume,nome\)\}/);
});

test("variantes preservadas recebem public_id único e reconciliação reidentifica itens existentes", () => {
  assert.match(publicCatalogSource, /identityGroups/);
  assert.match(publicCatalogSource, /publicVariantToken/);
  assert.match(publicCatalogSource, /supplied/);
  assert.match(additiveSource, /item\.public_id \|\| identity/);
  assert.match(additiveSource, /rekeyLiveVariants/);
  assert.match(additiveSource, /GIST_VARIANTS_REKEYED/);
});

test("baseline reidentifica variante legada por marca, nome e foto antes de bloquear", () => {
  assert.match(source, /function publicLooseIdentity\(group, item\)/);
  assert.match(source, /liveByLooseIdentity/);
  assert.match(source, /const preSyncPreservation = preserveLivePublicFields\(DATA, liveDATA\)/);
  assert.match(source, /item\.public_id !== liveItem\.public_id/);
});

test("IDs de origem diferentes nunca são colapsados só por nome e volume iguais", () => {
  assert.match(auditAllSource, /if\(id\) return "source-id\|"\+norm\(p\.brand\|\|"outros"\)\+"\|"\+id/);
});

test("restaura procedência Imarat verificada de produtos Isis Makeup sem depender do nome da categoria", () => {
  assert.match(source, /CONFIRMED_IMARAT_LEGACY_IDS/);
  assert.match(source, /\["isis makeup\|body spray", "719"\]/);
  assert.match(source, /\["isis makeup\|esfoliante corporal bum bum", "832"\]/);
  assert.match(source, /\["isis makeup\|esfoliante corporal pitaya", "830"\]/);
  assert.match(source, /restoreConfirmedImaratProvenance\(DATA\)/);
});

test("preserva a referência canônica de estoque do Gist mesmo quando a base interna difere", () => {
  assert.match(source, /liveItem\.stock_ref && item\.stock_ref !== liveItem\.stock_ref/);
  assert.match(source, /liveItem\.stock_route && item\.stock_route !== liveItem\.stock_route/);
});

test("mesmo origin_ref pode aparecer em categorias distintas sem virar ambiguidade, mas exige a mesma marca", () => {
  assert.match(source, /liveByOriginRef\.get\(String\(item\.origin_ref\)\)\.push\(\{ item, group, line \}\)/);
  assert.match(source, /sameBrandOrigins = origins\.filter\(row => norm\(row\.group\?\.brand\) === norm\(group\?\.brand\)\)/);
  assert.match(source, /sameBrandOrigins\[0\]\.item/);
  assert.match(source, /IDs\/origens de marcas diferentes nunca são cruzados/);
});


test("auditoria de miniaturas prioriza id_origem e não associa outro SKU de mesmo nome", () => {
  const miniAudit = fs.readFileSync(new URL("./audit-miniaturas-imarat.mjs", import.meta.url), "utf8");
  assert.match(miniAudit, /const itemSourceId = String\(item\?\.id_origem \|\| ""\)\.trim\(\)/);
  assert.match(miniAudit, /exactIdMatches\.length !== 1\) return null/);
  assert.match(miniAudit, /String\(p\?\.id \?\? p\?\.productId \?\? p\?\.slug \?\? ""\)\.trim\(\) === itemSourceId/);
});


test("auditoria de miniaturas usa a identidade interna pareada para consultar o SKU exato", () => {
  const miniAudit = fs.readFileSync(new URL("./audit-miniaturas-imarat.mjs", import.meta.url), "utf8");
  assert.match(miniAudit, /const source = sourceMatch\(internal \|\| item, group\)/);
});


test("auditoria global prioriza id_origem e não confunde produtos homônimos", () => {
  assert.match(auditAllSource, /originId:String\(internal\?\.id_origem\|\|""\)/);
  assert.match(auditAllSource, /const sourceId=String\(item\.originId\|\|""\)\.trim\(\)/);
  assert.match(auditAllSource, /exactIdMatches\.length!==1\) return null/);
});


test("reconciliação reconhece alias legado por public_id, marca, nome, preços e foto principal", () => {
  assert.match(additiveSource, /const samePublicIdRepresentations = item\.public_id/);
  assert.match(additiveSource, /norm\(row\.publicGroup\?\.brand\) === norm\(group\?\.brand\)/);
  assert.match(additiveSource, /String\(row\.publicItem\?\.varejo \?\? ""\)\.trim\(\) === String\(item\?\.varejo \?\? ""\)\.trim\(\)/);
  assert.match(additiveSource, /publicPhotoFingerprint\(row\.publicItem\) === photoFingerprint/);
  assert.match(additiveSource, /GIST_VARIANT_ALREADY_REPRESENTED/);
  assert.doesNotMatch(additiveSource, /ISIS_GIST_VARIANT_DIAGNOSTIC/);
});
