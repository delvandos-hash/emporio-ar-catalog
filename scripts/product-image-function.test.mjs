import test from "node:test";
import assert from "node:assert/strict";
import productImage from "../netlify/functions/product-image.mjs";
const originalFetch = globalThis.fetch;
const originalPrimary = process.env.CDN_IMAGE_BASE_URL;
const originalSecondary = process.env.CDN_IMAGE_FALLBACK_BASE_URL;
const originalProduct = process.env.IMARAT_ORIGIN_URL;
async function runWith({ source = "p", path = "/uploads/products/test.webp", fetchImpl, primary = "https://primary.example/", secondary = "https://secondary.example/", product = "https://products.example/" } = {}) {
  process.env.CDN_IMAGE_BASE_URL = primary;
  process.env.CDN_IMAGE_FALLBACK_BASE_URL = secondary;
  process.env.IMARAT_ORIGIN_URL = product;
  globalThis.fetch = fetchImpl || (async () => new Response(new Uint8Array([1,2,3]), { status: 200, headers: { "content-type": "image/webp" } }));
  try { return await productImage(new Request("https://catalog.example/api/product-image?source="+source+"&path="+encodeURIComponent(path))); }
  finally {
    globalThis.fetch = originalFetch;
    if (originalPrimary === undefined) delete process.env.CDN_IMAGE_BASE_URL; else process.env.CDN_IMAGE_BASE_URL = originalPrimary;
    if (originalSecondary === undefined) delete process.env.CDN_IMAGE_FALLBACK_BASE_URL; else process.env.CDN_IMAGE_FALLBACK_BASE_URL = originalSecondary;
    if (originalProduct === undefined) delete process.env.IMARAT_ORIGIN_URL; else process.env.IMARAT_ORIGIN_URL = originalProduct;
  }
}
test("retorna indisponível quando a origem selecionada não está configurada", async () => {
  const response = await runWith({ source: "b", secondary: "" });
  assert.equal(response.status, 503);
});
test("recusa caminho inválido sem consultar a origem", async () => {
  let called = false;
  const response = await runWith({ path: "/uploads/products/../../secrets", fetchImpl: async () => { called = true; throw new Error("unexpected"); } });
  assert.equal(response.status, 400); assert.equal(called, false);
});
test("rejeita conteúdo que não seja imagem e imagem acima do limite", async () => {
  const html = await runWith({ fetchImpl: async () => new Response("<html/>", { status: 200, headers: { "content-type": "text/html" } }) });
  assert.equal(html.status, 415);
  const large = await runWith({ fetchImpl: async () => new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/webp", "content-length": String(8*1024*1024+1) } }) });
  assert.equal(large.status, 413);
});
test("limita corpo real e bloqueia redirecionamentos", async () => {
  const large = await runWith({ fetchImpl: async () => new Response(new Uint8Array(8*1024*1024+1), { status: 200, headers: { "content-type": "image/webp" } }) });
  assert.equal(large.status, 413);
  let mode;
  const redirect = await runWith({ fetchImpl: async (_url, opts) => { mode = opts.redirect; throw new TypeError("redirect"); } });
  assert.equal(mode, "error"); assert.equal(redirect.status, 502);
});
async function assertImageDelivery({ source, path, expectedOrigin }) {
  let requested;
  const response = await runWith({ source, path, fetchImpl: async url => {
    requested = String(url);
    return new Response(new Uint8Array([1,2,3]), { status: 200, headers: { "content-type": "image/webp; charset=binary" } });
  }});
  assert.equal(response.status, 200);
  assert.equal(new URL(requested).origin, expectedOrigin);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("cache-control"), "public, max-age=86400");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1,2,3]);
}
test("entrega imagem pela origem primária Facilzap", async () => {
  await assertImageDelivery({ source: "a", path: "/products/a.webp", expectedOrigin: "https://primary.example" });
});
test("entrega imagem pela origem secundária Nuvemshop", async () => {
  await assertImageDelivery({ source: "b", path: "/stores/x/b.webp", expectedOrigin: "https://secondary.example" });
});
test("entrega imagem pela origem de produtos Imarat", async () => {
  await assertImageDelivery({ source: "p", path: "/uploads/products/c.webp", expectedOrigin: "https://products.example" });
});
