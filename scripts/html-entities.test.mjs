import test from "node:test";
import assert from "node:assert/strict";
import { decodeHtmlEntities } from "./html-entities.mjs";

test("decodifica entidades HTML acentuadas usadas em português", () => {
  assert.equal(
    decodeHtmlEntities("Informa&ccedil;&otilde;es, pe&ccedil;a, N&atilde;o"),
    "Informações, peça, Não",
  );
});

test("decodifica entidades nomeadas maiúsculas, pontuação e espaço não separável", () => {
  assert.equal(decodeHtmlEntities("&Aacute;gua&nbsp;&amp;&nbsp;Óleo"), "Água & Óleo");
  assert.equal(decodeHtmlEntities("&ndash; &mdash; &ldquo;texto&rdquo;"), "– — “texto”");
});

test("decodifica referências numéricas decimais e hexadecimais", () => {
  assert.equal(decodeHtmlEntities("&#231; &#xE3; &#x1F389;"), "ç ã 🎉");
});

test("não faz dupla decodificação nem altera entidades desconhecidas", () => {
  assert.equal(decodeHtmlEntities("&amp;ccedil; &entidade-inexistente;"), "&ccedil; &entidade-inexistente;");
});

test("preserva referências numéricas inválidas sem lançar erro", () => {
  assert.equal(decodeHtmlEntities("&#0; &#x110000; &#xD800;"), "&#0; &#x110000; &#xD800;");
});
