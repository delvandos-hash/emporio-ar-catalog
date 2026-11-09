import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./sync-catalog.mjs", import.meta.url), "utf8");

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
  assert.match(source, /\['outros', 'outra', 'emporio a r'\]\.includes\(b\) && candidatosNomeExato\.length === 1/);
});
