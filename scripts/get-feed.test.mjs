import test from "node:test";
import assert from "node:assert/strict";
import feed from "../netlify/functions/get-feed.js";

const originalFetch = globalThis.fetch;
const envKeys = ["CDN_IMAGE_BASE_URL", "CDN_IMAGE_FALLBACK_BASE_URL", "IMARAT_ORIGIN_URL"];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

function configureImages() {
  process.env.CDN_IMAGE_BASE_URL = "https://images-primary.example/";
  process.env.CDN_IMAGE_FALLBACK_BASE_URL = "https://images-secondary.example/";
  process.env.IMARAT_ORIGIN_URL = "https://products.example/";
}
function restoreEnvironment() {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}
function mockGist(payload) {
  globalThis.fetch = async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

test("feed publica imagens same-origin e não revela metadados de fornecedores", async () => {
  configureImages();
  mockGist({
    DATA: {
      feminino: [{
        brand: "Marca de teste",
        cat: "Perfumes",
        cat_id: "categoria-interna",
        items: [{
          nome: "Perfume de teste",
          volume: "100ml",
          varejo: "199,90",
          atacado: "149,90",
          disponivel: "Sim",
          foto: "https://images-primary.example/products/capa.webp",
          fotos: [
            "https://images-primary.example/products/capa.webp",
            "https://images-secondary.example/stores/loja/extra.webp"
          ],
          id_origem: "segredo-fornecedor-123",
          url_origem: "https://fornecedor-privado.example/produto",
          custo: 80,
          fonte: "fornecedor-privado"
        }]
      }]
    }
  });

  try {
    const response = await feed(new Request("https://catalogoemporio.netlify.app/feed.xml"), {});
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.match(xml, /<g:price>199\.90 BRL<\/g:price>/);
    assert.match(xml, /https:\/\/catalogoemporio\.netlify\.app\/api\/product-image\?source=a&path=/);
    assert.match(xml, /https:\/\/catalogoemporio\.netlify\.app\/api\/product-image\?source=b&path=/);
    assert.doesNotMatch(xml, /images-primary\.example|images-secondary\.example|products\.example/);
    assert.doesNotMatch(xml, /fornecedor-privado|segredo-fornecedor-123|id_origem|url_origem|categoria-interna/);
  } finally {
    restoreEnvironment();
  }
});

test("feed não inclui produtos sem imagem pública válida", async () => {
  configureImages();
  mockGist({
    DATA: {
      feminino: [{
        brand: "Marca de teste",
        cat: "Perfumes",
        items: [{
          nome: "Produto sem imagem",
          varejo: "99,90",
          foto: "https://host-nao-autorizado.example/tracker.webp"
        }]
      }]
    }
  });

  try {
    const response = await feed(new Request("https://catalogoemporio.netlify.app/feed.xml"), {});
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.doesNotMatch(xml, /Produto sem imagem/);
    assert.doesNotMatch(xml, /host-nao-autorizado\.example/);
  } finally {
    restoreEnvironment();
  }
});

test("feed oculta detalhes internos quando a origem de dados falha", async () => {
  configureImages();
  globalThis.fetch = async () => { throw new Error("segredo-interno-do-provedor"); };

  try {
    const response = await feed(new Request("https://catalogoemporio.netlify.app/feed.xml"), {});
    const xml = await response.text();
    assert.equal(response.status, 500);
    assert.match(xml, /Feed temporariamente indisponível/);
    assert.doesNotMatch(xml, /segredo-interno-do-provedor/);
  } finally {
    restoreEnvironment();
  }
});
