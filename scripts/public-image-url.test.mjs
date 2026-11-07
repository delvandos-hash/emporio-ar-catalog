import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePublicImageUrl } from "./public-image-url.mjs";

test("aceita os dois CDNs confirmados no catálogo", () => {
  assert.equal(sanitizePublicImageUrl("https://arquivos-cdn.facilzap.app.br/produtos/a.webp"), "https://arquivos-cdn.facilzap.app.br/produtos/a.webp");
  assert.equal(sanitizePublicImageUrl("https://acdn-us.mitiendanube.com/stores/a/image.webp"), "https://acdn-us.mitiendanube.com/stores/a/image.webp");
});

test("converte imagem da Imarat para proxy same-origin", () => {
  assert.equal(
    sanitizePublicImageUrl("https://imaratperfumaria.com/uploads/products/item.webp"),
    "/api/product-image?path=%2Fuploads%2Fproducts%2Fitem.webp"
  );
});

test("preserva somente a rota de proxy com caminho de produto válido", () => {
  assert.equal(
    sanitizePublicImageUrl("/api/product-image?path=%2Fuploads%2Fproducts%2Fitem.webp"),
    "/api/product-image?path=%2Fuploads%2Fproducts%2Fitem.webp"
  );
  assert.equal(sanitizePublicImageUrl("/api/product-image?path=%2Fetc%2Fpasswd"), "");
});

test("resolve caminho relativo no CDN configurado", () => {
  assert.equal(
    sanitizePublicImageUrl("/p/1.webp", { cdnBase: "https://arquivos-cdn.facilzap.app.br/" }),
    "https://arquivos-cdn.facilzap.app.br/p/1.webp"
  );
});

test("rejeita hosts não autorizados, HTTP, credenciais e protocolos inválidos", () => {
  assert.equal(sanitizePublicImageUrl("https://fornecedor.example/p.webp"), "");
  assert.equal(sanitizePublicImageUrl("http://arquivos-cdn.facilzap.app.br/p.webp"), "");
  assert.equal(sanitizePublicImageUrl("https://user:pass@arquivos-cdn.facilzap.app.br/p.webp"), "");
  assert.equal(sanitizePublicImageUrl("javascript:alert(1)"), "");
});
