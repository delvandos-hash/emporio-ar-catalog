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

test("correções aproximadas exigem marca, volume compatível e alta confiança", () => {
  assert.match(source, /norm\(marcaPublicaImarat\(p\.brand\)\) === b/);
  assert.match(source, /itemVolume === sourceVolume/);
  assert.match(source, /best\.score >= 0\.86 && best\.tokens >= 0\.8/);
  assert.match(source, /best\.score - second\.score >= 0\.08/);
  assert.match(source, /!\['outros', 'outra', 'emporio a r'\]\.includes\(b\)/);
});

test("remove somente quatro miniaturas legadas confirmadas sem correspondência na origem", () => {
  assert.match(source, /miniaturas\|emporio a r\|mini elysia\|50ml/);
  assert.match(source, /miniaturas\|emporio a r\|mini vulcan bale\|30ml/);
  assert.match(source, /miniaturas\|emporio a r\|mini vulcan sable\|30ml/);
  assert.match(source, /miniaturas\|outros\|mini vulcan sable 30ml\|30ml/);
  assert.match(source, /const existeNaOrigem = imaratList\.some\(p =>/);
  assert.match(source, /if \(!itensLegadosForaDoSite\.has\(key\)\) return true/);
});

test("corrige somente os dois títulos especiais com marca e volume compatíveis", () => {
  assert.match(source, /b === 'lattafa' && n === 'kit thawrah'/);
  assert.match(source, /norm\(p\.name\) === 'kit tharwah'/);
  assert.match(source, /b === 'only you' && n === 'miniatura sapatinho'/);
  assert.match(source, /norm\(p\.name\) === 'miniatura sapatinho good girl'/);
  assert.match(source, /volumeMatch\(it\.volume, it\.nome\) === volumeMatch\(p\.sizeMl, p\.name\)/);
});
