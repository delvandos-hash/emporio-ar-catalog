import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePublicImageUrl } from "./public-image-url.mjs";

const options = {
  cdnBase: "https://images.example-cdn.com/assets/",
  allowedHosts: ["images.example-cdn.com", "static.example-cdn.com"],
};

test("aceita URL HTTPS de CDN autorizada", () => {
  assert.equal(
    sanitizePublicImageUrl("https://static.example-cdn.com/p/1.webp", options),
    "https://static.example-cdn.com/p/1.webp"
  );
});

test("resolve caminho relativo no CDN configurado", () => {
  assert.equal(
    sanitizePublicImageUrl("/p/1.webp", options),
    "https://images.example-cdn.com/p/1.webp"
  );
});

test("rejeita domínio não autorizado", () => {
  assert.equal(sanitizePublicImageUrl("https://fornecedor.example/p.webp", options), "");
});

test("rejeita HTTP, credenciais e protocolos não web", () => {
  assert.equal(sanitizePublicImageUrl("http://images.example-cdn.com/p.webp", options), "");
  assert.equal(sanitizePublicImageUrl("https://user:pass@images.example-cdn.com/p.webp", options), "");
  assert.equal(sanitizePublicImageUrl("javascript:alert(1)", options), "");
});
