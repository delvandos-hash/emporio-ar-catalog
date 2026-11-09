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
  assert.match(restore, /Mesmo nome, marca e categoria,[\s\S]*?stock_ref diferente: é outra variante/);
  assert.match(restore, /addLegacy\(DATA, line, group, publicItem\)/);
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
  assert.match(audit, /rekeyAudit\.unmatched === 0/);
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
  assert.match(apply, /sem correspondência inequívoca/);
});
test("deduplicação de Gist nunca colapsa IDs públicos diferentes", () => {
  assert.match(apply, /String\(item\?\.public_id \|\| ""\)/);
  assert.match(apply, /GIST_EXACT_DUPLICATES_REMOVED/);
});

test("variantes com mesmo nome são reidentificadas por foto sem depender de preço", () => {
  assert.match(apply, /publicPhotoFingerprint/);
  assert.match(apply, /byPhoto\.length === 1/);
  assert.match(apply, /fotosCompatíveis/);
  assert.match(sync, /photos\(item\) !== ""/);
  assert.doesNotMatch(sync, /publicPriceNumber\(item\?\.varejo\)[\s\S]*?publicPriceNumber\(publicItem\?\.atacado\)/);
});

test("reidentificação preserva public_id legado mesmo após correção de título/categoria", () => {
  assert.match(apply, /internalByPublicId/);
  assert.match(apply, /byGlobalId\.length === 1/);
  assert.match(audit, /byPublicId/);
  assert.match(audit, /byGlobalId\.length===1/);
});
