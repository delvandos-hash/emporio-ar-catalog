import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicPayload, parseCatalogData, getCompleteGistFileContent } from "./publish-public-catalog.mjs";

process.env.CDN_IMAGE_BASE_URL = "https://images-primary.example/";
process.env.CDN_IMAGE_FALLBACK_BASE_URL = "https://images-secondary.example/";
process.env.IMARAT_ORIGIN_URL = "https://products.example/";

const catalog = {
  perfumes: [{
    brand: "Marca",
    cat: "Perfumes",
    items: [{
      nome: "Perfume",
      volume: "100ml",
      varejo: "199,90",
      atacado: "149,90",
      disponivel: "Sim",
      foto: "https://products.example/uploads/products/a.webp",
      custo: 80,
      precoManual: true,
      url_origem: "https://fornecedor.example/item"
    }]
  }]
};
const source = `export const DATA = ${JSON.stringify(catalog)};
export const WHATSAPP = "5562991134488";
`;

test("prepara projeção pública sem alterar valores comerciais do snapshot", () => {
  const { payload, productCount, groupCount } = buildPublicPayload(source, "2026-11-07T12:00:00.000Z");
  const item = payload.DATA.perfumes[0].items[0];
  assert.equal(productCount, 1);
  assert.equal(groupCount, 1);
  assert.equal(item.varejo, "199,90");
  assert.equal(item.atacado, "149,90");
  assert.equal(item.foto, "/api/product-image?source=p&path=%2Fuploads%2Fproducts%2Fa.webp");
  assert.equal("custo" in item, false);
  assert.equal("precoManual" in item, false);
  assert.equal("url_origem" in item, false);
  assert.equal(payload.ultimaAtualizacao, "2026-11-07T12:00:00.000Z");
});

test("rejeita fonte sem DATA reconhecível ou DATA inválido", () => {
  assert.throws(() => parseCatalogData("const DATA = [];"), /DATA não encontrado/);
  assert.throws(() => parseCatalogData("export const DATA = null;\nexport const WHATSAPP"), /DATA inválido/);
});


test("recupera e valida o JSON integral quando a API informa conteúdo truncado", async () => {
  const fullJson = JSON.stringify({ DATA: { produto: "fragrância" } });
  let requestedUrl;
  const content = await getCompleteGistFileContent({
    content: fullJson.slice(0, 12),
    truncated: true,
    raw_url: "https://gist.githubusercontent.com/owner/id/raw/hash/catalogo.json"
  }, async (url, options) => {
    requestedUrl = String(url);
    assert.equal(options.redirect, "error");
    return { ok: true, text: async () => fullJson };
  });
  assert.equal(content, fullJson);
  assert.match(requestedUrl, /^https:\/\/gist\.githubusercontent\.com\//);
});

test("rejeita endereço raw fora do host oficial do Gist", async () => {
  await assert.rejects(
    getCompleteGistFileContent({
      content: "{",
      truncated: true,
      raw_url: "https://example.com/catalogo.json"
    }),
    /não autorizado/
  );
});

test("rejeita JSON integral inválido sem tentar publicá-lo", async () => {
  await assert.rejects(
    getCompleteGistFileContent({ content: '{"produto":"sem fechamento', truncated: false }),
    /não é JSON válido/
  );
});
