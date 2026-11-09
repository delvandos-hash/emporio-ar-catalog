import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const apply = readFileSync(new URL("./apply-additive-reconciliation.mjs", import.meta.url), "utf8");
const restore = readFileSync(new URL("./restore-gist-only-legacy.mjs", import.meta.url), "utf8");
const audit = readFileSync(new URL("./audit-imarat-all-products.mjs", import.meta.url), "utf8");
const sync = readFileSync(new URL("./sync-catalog.mjs", import.meta.url), "utf8");

test("identidade pública inclui linha, marca, categoria, nome e volume", () => {
  assert.match(apply, /norm\(line\), norm\(group\?\.brand\), norm\(group\?\.cat\), norm\(item\?\.nome\)/);
  assert.match(restore, /norm\(line\), norm\(group\?\.brand\), norm\(group\?\.cat\), norm\(item\?\.nome\)/);
  assert.match(audit, /norm\(line\),norm\(group\.brand\),norm\(group\.cat\),norm\(item\.nome\)/);
  assert.match(sync, /norm\(line\), norm\(group\.brand\), norm\(group\.cat\), norm\(item\.nome\)/);
});

test("restauração legada evita duplicar public_id ou identidade exata", () => {
  assert.match(restore, /currentPublicIds\.has\(item\.public_id\).*currentIdentities\.has\(key\)/s);
  assert.match(restore, /currentIdentities\.add\(key\)/);
});

test("restauração legada preserva disponibilidade e referências de estoque", () => {
  assert.match(restore, /disponivel: item\.disponivel \|\| "Não"/);
  assert.match(restore, /stock_ref: item\.stock_ref/);
  assert.match(restore, /stock_route: item\.stock_route/);
});

test("publicação aditiva não remove nem sobrescreve registros atuais do Gist", () => {
  assert.match(apply, /missingFromInternal\.length/);
  assert.match(apply, /for \(const key of liveKeys\) if \(!mergedKeys\.has\(key\)\)/);
  assert.match(apply, /APPLY_ADDITIVE_RECONCILIATION !== "1"/);
  assert.match(apply, /SOURCE_CONFIRMED_ADDITIONS=/);
});

test("baseline do sincronizador usa a mesma identidade pública", () => {
  assert.match(sync, /keys\.add\(\[norm\(line\), norm\(group\.brand\), norm\(group\.cat\), norm\(item\.nome\)/);
});

test("limite aditivo permite até 60 itens somente com origem confirmada", () => {
  assert.match(audit, /internalOnlyKeys\.length <= 60/);
  assert.match(audit, /Math\.abs\(catalog\.length - internalItemCount\) <= 75/);
  assert.match(apply, /additions\.length > 60/);
});
