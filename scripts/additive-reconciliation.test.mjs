import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const apply = readFileSync(new URL("./apply-additive-reconciliation.mjs", import.meta.url), "utf8");
const restore = readFileSync(new URL("./restore-gist-only-legacy.mjs", import.meta.url), "utf8");
const audit = readFileSync(new URL("./audit-imarat-all-products.mjs", import.meta.url), "utf8");
const sync = readFileSync(new URL("./sync-catalog.mjs", import.meta.url), "utf8");
const publicCatalog = readFileSync(new URL("./public-catalog.mjs", import.meta.url), "utf8");

test("identidade-base inclui linha, marca, categoria, nome e volume", () => {
  assert.match(apply, /norm\(line\), norm\(group\?\.brand\), norm\(group\?\.cat\), norm\(item\?\.nome\)/);
  assert.match(restore, /norm\(line\), norm\(group\?\.brand\), norm\(group\?\.cat\), norm\(item\?\.nome\)/);
  assert.match(audit, /norm\(line\),norm\(group\.brand\),norm\(group\.cat\),norm\(item\.nome\)/);
  assert.match(sync, /norm\(line\), norm\(group\?\.brand\), norm\(group\?\.cat\), norm\(item\?\.nome\)/);
});

test("restauração legada distingue variantes pelo stock_ref e não mistura SKUs", () => {
  assert.match(restore, /const stockRef = String\(publicItem\.stock_ref \|\| ""\)/);
  assert.match(restore, /indexes\.stockIndex\.get\(stockRef\)/);
  assert.match(restore, /resolveLegacyStockMatch\\(stockMatches, identityMatches, publicItem, publicIdMatches, group\\?\\.brand\\)/);
  assert.match(restore, /addLegacy\(DATA, line, group, publicItem\)/);
  assert.match(restore, /LEGACY_GIST_PRESERVATION_SCOPE=all-lines-all-brands-all-categories/);
  assert.doesNotMatch(restore, /if \(!\["roupas", "acessorios"\]\.includes\(norm\(line\)\)\) continue/);
});

test("restauração legada preserva preço, imagem principal, galeria e referência pública", () => {
  assert.match(restore, /target\.precoManual = true/);
  assert.match(restore, /target\.foto = publicItem\.foto/);
  assert.match(restore, /target\.fotos = mergedPhotos/);
  assert.match(restore, /target\.public_id = publicItem\.public_id/);
  assert.match(restore, /stock_ref: item\.stock_ref/);
  assert.match(restore, /stock_route: item\.stock_route/);
});

test("public_id é único para variantes e preserva IDs públicos legados", () => {
  assert.match(publicCatalog, /identityGroups/);
  assert.match(publicCatalog, /publicIdByItem/);
  assert.match(publicCatalog, /record\.item\?\.public_id/);
  assert.match(publicCatalog, /publicVariantToken/);
});

test("reconciliação aditiva reidentifica variantes sem remover conteúdo existente", () => {
  assert.match(apply, /item\.public_id \|\| identity/);
  assert.match(apply, /rekeyLiveVariants/);
  assert.match(apply, /GIST_VARIANTS_REKEYED/);
  assert.match(apply, /collectContentKeys/);
  assert.match(apply, /lostContent\.length/);
  assert.match(apply, /APPLY_ADDITIVE_RECONCILIATION !== "1"/);
  assert.match(apply, /SOURCE_CONFIRMED_ADDITIONS=/);
});

test("auditoria compara IDs públicos únicos e só libera fontes confirmadas", () => {
  assert.match(audit, /internalPublicIndex/);
  assert.match(audit, /rekeyLiveVariants/);
  assert.doesNotMatch(audit, /rekeyAudit\.unmatched\s*===\s*0/);
  assert.match(audit, /VARIANTE GIST SEM CORRESPONDÊNCIA INEQUÍVOCA/);
  assert.match(audit, /internalOnlyKeys\.length <= 80/);
  assert.match(audit, /Math\.abs\(catalog\.length - internalItemCount\) <= 80/);
});

test("sincronização preserva preços e imagens públicas e remove apenas cópias exatas", () => {
  assert.match(sync, /preserveLivePublicFields/);
  assert.match(sync, /LIVE_PUBLIC_PRICES_PROTECTED/);
  assert.match(sync, /LIVE_PUBLIC_GALLERIES_MERGED/);
  assert.match(sync, /exactCatalogFingerprint/);
  assert.match(sync, /Duplicatas integralmente idênticas removidas/);
});

test("reidentificação aceita variante única mesmo com preço ou imagem alterados", () => {
  assert.match(apply, /candidates\.length === 1\s*\? candidates\[0\]/);
  assert.match(apply, /byExactContent\.length === 1/);
  assert.match(apply, /VARIANTE GIST PRESERVADA SEM REKEY AUTOMÁTICO/);
});
test("deduplicação de Gist nunca colapsa IDs públicos diferentes", () => {
  assert.match(apply, /const contentKey = identity\(line, group, item\) \+ "\\|" \+ publicFingerprint\(item\)/);
  assert.match(apply, /occurrence=/);
  assert.match(apply, /GIST_EXACT_DUPLICATES_REMOVED/);
});

test("variantes com mesmo nome são reidentificadas por foto sem depender de preço", () => {
  assert.match(apply, /publicPhotoFingerprint/);
  assert.match(apply, /byPhoto\.length === 1/);
  assert.match(apply, /fotosCompatíveis/);
  assert.match(sync, /publicPhotoFingerprint\(item\)/);
  assert.doesNotMatch(sync, /publicPriceNumber\(item\?\.varejo\)[\s\S]*?publicPriceNumber\(publicItem\?\.atacado\)/);
});

test("reidentificação preserva public_id legado mesmo após correção de título/categoria", () => {
  assert.match(apply, /internalByPublicId/);
  assert.match(apply, /byGlobalId\.length === 1/);
  assert.match(audit, /byPublicId/);
  assert.match(audit, /byGlobalId\.length===1/);
});

test("auditoria e reconciliação usam stock_ref global para acessórios fora da categoria-base", () => {
  assert.match(audit, /byStockRef/);
  assert.match(audit, /byStock\.length===1/);
  assert.match(apply, /internalByStockRef/);
  assert.match(apply, /byStockRef\.length === 1/);
});
test("restauração aditiva preserva itens legados de todas as linhas, marcas e categorias", () => {
  assert.match(restore, /LEGACY_GIST_PRESERVATION_SCOPE=all-lines-all-brands-all-categories/);
  assert.match(restore, /LEGACY_GIST_RESTORED/);
  assert.doesNotMatch(restore, /isBrandLegacy|isEmporioLegacy/);
});

test("auditoria classifica entradas internas repetidas por stock_ref como já representadas", () => {
  assert.match(audit, /duplicateInternalSourceRows/);
  assert.match(audit, /eligibleInternalOnlyRows/);
  assert.match(audit, /duplicateSourceRepresentations/);
});
test("publicação aditiva não duplica item com stock_ref já presente no Gist", () => {
  assert.match(apply, /liveStockRefs/);
  assert.match(apply, /duplicateSourceKeys/);
  assert.match(apply, /DUPLICATE_SOURCE_REPRESENTATIONS_SKIPPED/);
});

test("preserva o public_id canônico do Gist e confirma grupos Brand permitidos", () => {
  assert.match(restore, /if \(publicItem\.public_id\) target\.public_id = publicItem\.public_id/);
  assert.match(audit, /KNOWN_BRAND_GROUPS/);
  assert.match(audit, /effectiveAdditiveSource\(row\)/);
  assert.match(apply, /effectiveAdditiveSource\(rows\[0\]\)/);
});

test("reidentificação flexível tolera categoria ou volume legado divergente sem misturar marcas", () => {
  assert.match(apply, /internalByLooseIdentity/);
  assert.match(apply, /byLoosePhoto\.length === 1/);
  assert.match(audit, /byLooseIdentity/);
  assert.match(audit, /byLoosePhoto\.length===1/);
  assert.match(apply, /function looseIdentity/);
});

test("variantes legadas sem reidentificação inequívoca permanecem preservadas sem exclusão", () => {
  assert.match(apply, /VARIANTE GIST PRESERVADA SEM REKEY AUTOMÁTICO/);
  assert.match(apply, /if \(missingFromInternal\.length\)/);
  assert.doesNotMatch(audit, /rekeyAudit\.unmatched\s*===\s*0/);
});

test("auditoria reconhece item Brand legado com mesmo nome-base e foto como já representado", () => {
  assert.match(audit, /legacyBrandDuplicateRows/);
  assert.match(audit, /liveLoosePhotoKeys/);
  assert.match(apply, /rowCategory\.includes\("brand"\)/);
});

test("baseline do sincronizador compara IDs públicos estáveis e bloqueia qualquer ID do Gist ausente", () => {
  assert.match(sync, /function countCatalogPublicIds/);
  assert.match(sync, /const internalBaseline = countCatalogPublicIds\(DATA\)/);
  assert.match(sync, /const liveBaseline = countCatalogPublicIds\(liveDATA, true\)/);
  assert.match(sync, /onlyLive > 0/);
  assert.match(sync, /onlyInternal > 80/);
  assert.doesNotMatch(sync, /countCatalogIdentity/);
});

test("restauração preserva stock_ref e stock_route canônicos do Gist", () => {
  assert.match(restore, /publicItem\.stock_ref && target\.stock_ref !== publicItem\.stock_ref/);
  assert.match(restore, /publicItem\.stock_route && target\.stock_route !== publicItem\.stock_route/);
});

test("auditoria e aplicação aceitam estado já reconciliado sem novas adições", () => {
  assert.doesNotMatch(audit, /eligibleInternalOnlyRows\.length > 0/);
  assert.match(apply, /ADDITIVE_RECONCILIATION_NOOP=true/);
  assert.match(apply, /if \(!additions\.length\)/);
});
