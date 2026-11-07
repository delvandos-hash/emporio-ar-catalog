import test from "node:test";
import assert from "node:assert/strict";
import productImage from "../netlify/functions/product-image.mjs";

const originalFetch = globalThis.fetch;
const originalOrigin = process.env.IMARAT_ORIGIN_URL;

async function runWith({ origin = "https://imaratperfumaria.com/", fetchImpl, path = "/uploads/products/test.webp" } = {}) {
  process.env.IMARAT_ORIGIN_URL = origin;
  globalThis.fetch = fetchImpl || (async () => new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-type": "image/webp" }
  }));
  try {
    return await productImage(new Request("https://catalogo.example/api/product-image?path=" + encodeURIComponent(path)));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOrigin === undefined) delete process.env.IMARAT_ORIGIN_URL;
    else process.env.IMARAT_ORIGIN_URL = originalOrigin;
  }
}

test("recusa configuração de origem fora do host fixo", async () => {
  const response = await runWith({ origin: "https://evil.example/" });
  assert.equal(response.status, 503);
});

test("recusa path inválido sem consultar a origem", async () => {
  let called = false;
  const response = await runWith({
    path: "/uploads/products/../../secrets",
    fetchImpl: async () => { called = true; throw new Error("não deveria consultar"); }
  });
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("recusa conteúdo que não seja imagem permitida", async () => {
  const response = await runWith({
    fetchImpl: async () => new Response("<html>nope</html>", {
      status: 200,
      headers: { "content-type": "text/html" }
    })
  });
  assert.equal(response.status, 415);
});

test("recusa imagem acima do limite declarado", async () => {
  const response = await runWith({
    fetchImpl: async () => new Response(new Uint8Array([1]), {
      status: 200,
      headers: { "content-type": "image/webp", "content-length": String(8 * 1024 * 1024 + 1) }
    })
  });
  assert.equal(response.status, 413);
});

test("limita também o tamanho real do corpo quando não há content-length", async () => {
  const response = await runWith({
    fetchImpl: async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1), {
      status: 200,
      headers: { "content-type": "image/webp" }
    })
  });
  assert.equal(response.status, 413);
});

test("segue a política de não aceitar redirecionamentos do upstream", async () => {
  let redirectMode;
  const response = await runWith({
    fetchImpl: async (_url, options) => {
      redirectMode = options.redirect;
      throw new TypeError("redirect rejected");
    }
  });
  assert.equal(redirectMode, "error");
  assert.equal(response.status, 502);
});

test("entrega imagem permitida com cabeçalhos de segurança", async () => {
  let requestedUrl;
  let redirectMode;
  const response = await runWith({
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      redirectMode = options.redirect;
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/webp; charset=binary" }
      });
    }
  });
  assert.equal(response.status, 200);
  assert.equal(redirectMode, "error");
  assert.equal(new URL(requestedUrl).origin, "https://imaratperfumaria.com");
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("cache-control"), "public, max-age=86400");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
});
