import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveImaratImageUrl } from './imarat-image-url.mjs';

test('resolve caminho absoluto com origem terminada em barra', () => {
  assert.equal(
    resolveImaratImageUrl('/uploads/products/item.webp', 'https://imaratperfumaria.com/'),
    'https://imaratperfumaria.com/uploads/products/item.webp'
  );
});

test('resolve caminho relativo sem barra duplicada na origem', () => {
  assert.equal(
    resolveImaratImageUrl('uploads/products/item.webp', 'https://imaratperfumaria.com'),
    'https://imaratperfumaria.com/uploads/products/item.webp'
  );
});

test('preserva URL HTTPS absoluta', () => {
  assert.equal(
    resolveImaratImageUrl('https://acdn-us.mitiendanube.com/item.webp', 'https://imaratperfumaria.com/'),
    'https://acdn-us.mitiendanube.com/item.webp'
  );
});

test('retorna vazio para entrada vazia ou sem origem', () => {
  assert.equal(resolveImaratImageUrl('', 'https://imaratperfumaria.com/'), '');
  assert.equal(resolveImaratImageUrl('/uploads/products/item.webp', ''), '');
});
