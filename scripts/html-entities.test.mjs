import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeHtmlEntities } from './html-entities.mjs';

test('decodifica entidades acentuadas usadas nas descrições de roupas', () => {
  assert.equal(
    decodeHtmlEntities('Informa&ccedil;&otilde;es base da pe&ccedil;a: N&atilde;o'),
    'Informações base da peça: Não',
  );
});

test('decodifica entidades latinas em maiúsculas e minúsculas', () => {
  assert.equal(decodeHtmlEntities('&Atilde; &Ccedil; &Eacute; &ocirc;'), 'Ã Ç É ô');
});

test('decodifica entidades numéricas decimais e hexadecimais', () => {
  assert.equal(decodeHtmlEntities('&#231; &#xE3; &#x1F496;'), 'ç ã 💖');
});

test('mantém texto já decodificado e não faz decodificação recursiva', () => {
  assert.equal(decodeHtmlEntities('Informações &amp; moda'), 'Informações & moda');
  assert.equal(decodeHtmlEntities('&amp;ccedil;'), '&ccedil;');
});

test('preserva entidades desconhecidas e substitui pontos de código inválidos', () => {
  assert.equal(decodeHtmlEntities('&entidade-desconhecida;'), '&entidade-desconhecida;');
  assert.equal(decodeHtmlEntities('&#xD800;'), '\\uFFFD');
});
