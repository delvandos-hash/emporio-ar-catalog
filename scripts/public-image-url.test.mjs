import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProductImagePath, normalizePublicImagePath, sanitizePublicImageUrl } from "./public-image-url.mjs";
const options = { cdnBase: "https://images-primary.example/", cdnFallbackBase: "https://images-secondary.example/", productBase: "https://products.example/" };
test("converte origens de imagem para aliases same-origin", () => {
  assert.equal(sanitizePublicImageUrl("https://images-primary.example/products/a.webp", options), "/api/product-image?source=a&path=%2Fproducts%2Fa.webp");
  assert.equal(sanitizePublicImageUrl("https://images-secondary.example/stores/x/b.webp", options), "/api/product-image?source=b&path=%2Fstores%2Fx%2Fb.webp");
  assert.equal(sanitizePublicImageUrl("https://products.example/uploads/products/c.webp", options), "/api/product-image?source=p&path=%2Fuploads%2Fproducts%2Fc.webp");
});
test("preserva somente proxy válido e caminho permitido", () => {
  assert.equal(sanitizePublicImageUrl("/api/product-image?source=p&path=%2Fuploads%2Fproducts%2Fc.webp", options), "/api/product-image?source=p&path=%2Fuploads%2Fproducts%2Fc.webp");
  assert.equal(sanitizePublicImageUrl("/api/product-image?source=p&path=%2Fetc%2Fpasswd", options), "");
});

test("migra rota legada do Preview #5 para alias privado da Imarat", () => {
  assert.equal(
    sanitizePublicImageUrl("/api/product-image?path=%2Fuploads%2Fproducts%2Fc.webp", options),
    "/api/product-image?source=p&path=%2Fuploads%2Fproducts%2Fc.webp"
  );
  assert.equal(
    sanitizePublicImageUrl("/api/product-image?path=%2Fprivate%2Fsecret.webp", options),
    ""
  );
});
test("bloqueia caminhos protocol-relative diretos e codificados", () => {
  assert.equal(normalizePublicImagePath("//evil.example/image.webp"), "");
  assert.equal(normalizePublicImagePath("/%2Fevil.example/image.webp"), "");
  assert.equal(normalizePublicImagePath("/%2f%2fevil.example/image.webp"), "");
});

test("bloqueia traversal literal, codificado e duplamente codificado", () => {
  assert.equal(normalizeProductImagePath("/uploads/products/../private.txt"), "");
  assert.equal(normalizeProductImagePath("/uploads/products/%2e%2e/private.txt"), "");
  assert.equal(normalizeProductImagePath("/uploads/products/%252e%252e/private.txt"), "");
  assert.equal(normalizeProductImagePath("/uploads/products/%2f..%2fprivate.txt"), "");
  assert.equal(normalizeProductImagePath("/uploads/products/c.webp"), "/uploads/products/c.webp");
});
test("resolve nome relativo e rejeita host, protocolo e credenciais não autorizados", () => {
  assert.equal(sanitizePublicImageUrl("bare-file.webp", options), "/api/product-image?source=a&path=%2Fbare-file.webp");
  assert.equal(sanitizePublicImageUrl("https://unknown.example/a.webp", options), "");
  assert.equal(sanitizePublicImageUrl("http://images-primary.example/a.webp", options), "");
  assert.equal(sanitizePublicImageUrl("https://user:pass@images-primary.example/a.webp", options), "");
  assert.equal(sanitizePublicImageUrl("javascript:alert(1)", options), "");
});
