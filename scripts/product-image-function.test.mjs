import test from "node:test";
import assert from "node:assert/strict";
import productImage from "../netlify/functions/product-image.mjs";
const originalFetch = globalThis.fetch;
const envKeys = ["CDN_IMAGE_BASE_URL","CDN_IMAGE_FALLBACK_BASE_URL","IMARAT_ORIGIN_URL","DANDE_BASE_URL","DANDE_CDN_BASE_URL"];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
async function runWith({ source = "p", path = "/uploads/products/test.webp", fetchImpl, primary = "https://primary.example/", secondary = "https://secondary.example/", product = "https://products.example/", dande = "https://dande.example/", dandeCdn = "https://dande-cdn.example/" } = {}) {
  Object.assign(process.env, { CDN_IMAGE_BASE_URL: primary, CDN_IMAGE_FALLBACK_BASE_URL: secondary, IMARAT_ORIGIN_URL: product, DANDE_BASE_URL: dande, DANDE_CDN_BASE_URL: dandeCdn });
  globalThis.fetch = fetchImpl || (async () => new Response(new Uint8Array([1,2,3]), { status: 200, headers: { "content-type": "image/webp" } }));
  try { return await productImage(new Request("https://catalog.example/api/product-image?source="+source+"&path="+encodeURIComponent(path))); }
  finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; }
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
async function assertImageDelivery({ source, path, expectedOrigin, options = {} }) {
  let requested;
  const response = await runWith({ source, path, ...options, fetchImpl: async url => {
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
test("entrega imagem pela origem Dande", async () => {
  await assertImageDelivery({ source: "d", path: "/products/anel.webp", expectedOrigin: "https://dande.example" });
});
test("entrega imagem pelo CDN CloudFront separado da origem Dande", async () => {
  await assertImageDelivery({ source: "c", path: "/stores/123/products/anel.webp", expectedOrigin: "https://dande-cdn.example" });
});
