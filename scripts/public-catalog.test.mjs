import test from "node:test";
import assert from "node:assert/strict";
import { toPublicCatalog } from "./public-catalog.mjs";
process.env.CDN_IMAGE_BASE_URL = "https://images-primary.example/";
process.env.CDN_IMAGE_FALLBACK_BASE_URL = "https://images-secondary.example/";
process.env.IMARAT_ORIGIN_URL = "https://products.example/";

test("publica somente os campos usados pela vitrine", () => {
  const result = toPublicCatalog({
    perfumes: [{
      brand: "Marca",
      cat: "Perfumes",
      cat_id: "interno-cat",
      items: [{
                        nome: "Perfume",
        volume: "100ml",
        varejo: "199,90",
        atacado: "149,90",
        foto: "https://images-primary.example/produtos/a.webp",
        fotos: ["https://images-secondary.example/a.webp"],
        notas: "Baunilha",
        disponivel: "Sim",
        badge: "Novo",
                novoDesde: "2026-11-07",
        variacoes: [{ id: "v1", nome: "Único", estoque: 3, sku: "privado", custo: 99 }],
        custo: 50,
        precoManual: true,
        url_origem: "/produto/123",
        campoDesconhecido: "não publicar"
      }]
    }]
  });

  const group = result.perfumes[0];
  const item = group.items[0];
  assert.deepEqual(Object.keys(group).sort(), ["brand", "cat", "items"]);
  assert.deepEqual(Object.keys(item).sort(), [
    "atacado", "badge", "disponivel", "fonte", "foto", "fotos",
    "nome", "notas", "novoDesde", "public_id", "varejo", "variacoes", "volume"
  ].sort());
  assert.equal(item.nome, "Perfume");
  assert.deepEqual(item.variacoes, [{ id: "v1", nome: "Único", estoque: 3 }]);
  assert.equal(item.fonte, "perfumaria");
  assert.match(item.public_id, /^p_[a-f0-9]{20}$/);
});

test("converte imagem da Imarat para rota same-origin e remove URL inválida", () => {
  const result = toPublicCatalog({
    perfumes: [{
      brand: "Marca",
      cat: "Perfumes",
      items: [{
        nome: "Produto",
        foto: "https://products.example/uploads/products/item.webp",
        fotos: [
          "https://products.example/uploads/products/item-2.webp",
          "https://host-nao-autorizado.example/track"
        ]
      }]
    }]
  });
  const item = result.perfumes[0].items[0];
  assert.equal(item.foto, "/api/product-image?source=p&path=%2Fuploads%2Fproducts%2Fitem.webp");
  assert.deepEqual(item.fotos, ["/api/product-image?source=p&path=%2Fuploads%2Fproducts%2Fitem-2.webp"]);
});

test("descarta imagem inválida sem remover o produto", () => {
  const result = toPublicCatalog({
    perfumes: [{
      brand: "Marca",
      cat: "Perfumes",
      items: [{ nome: "Produto sem imagem", foto: "https://host-nao-autorizado.example/a.webp" }]
    }]
  });
  assert.deepEqual(result.perfumes[0].items.map(x => x.nome), ["Produto sem imagem"]);
});

test("normaliza estoque de variações e limita identificadores/textos", () => {
  const result = toPublicCatalog({
    roupas: [{
      brand: "Marca",
      cat: "Roupas",
      items: [{
        nome: "Vestido",
                variacoes: [
          { id: "v".repeat(150), nome: "Tamanho M".repeat(20), estoque: "4.8", sku: "interno" },
          { id: "v2", nome: "Tamanho G", estoque: -3, custo: 12 },
          { id: "v3", nome: "Tamanho P", estoque: "inválido" }
        ]
      }]
    }]
  });
  const item = result.roupas[0].items[0];
  assert.deepEqual(item.variacoes.map(v => v.estoque), [4, 0, 0]);
  assert.equal(item.variacoes[0].id, "v1");
  assert.equal(item.variacoes[0].nome.length, 120);
  assert.equal("sku" in item.variacoes[0], false);
});

test("rejeita DATA inválido", () => {
  assert.throws(() => toPublicCatalog(null), /DATA inválido/);
  assert.throws(() => toPublicCatalog([]), /DATA inválido/);
});

import { sanitizePayload } from "../netlify/functions/get-catalog.mjs";

test("API e publicação no Gist mantêm a mesma projeção pública", () => {
  const source = {
    perfumes: [{
      brand: "Marca",
      cat: "Perfumes",
      cat_id: "interno",
      items: [{
        id: "privado",
                nome: "Perfume",
        volume: "100ml",
        varejo: "199,90",
        atacado: "149,90",
        foto: "https://products.example/uploads/products/a.webp",
        fotos: ["https://images-primary.example/produtos/b.webp"],
        notas: "Baunilha",
        disponivel: "Sim",
        variacoes: [{ id: 1, nome: "Único", estoque: "2", sku: "privado" }],
        custo: 70,
        precoManual: true,
        url_origem: "https://fornecedor.example/produto"
      }]
    }]
  };
  const fromGist = toPublicCatalog(source);
  const fromApi = sanitizePayload({
    DATA: source,
    WHATSAPP: "5562991134488",
    BRAND: { name: "Empório A.R.", phone: "privado", secret: "não publicar" },
    internal: "não publicar"
  }).DATA;

  assert.deepEqual(fromApi, fromGist);
});

test("remove identificadores internos e padroniza a fonte", () => {
  const result = toPublicCatalog({ roupas: [{ brand: "Marca", cat: "Roupas", items: [{
    nome: "Vestido", fonte: "fornecedor-interno", id_origem: "segredo-123",
    variacoes: [{ id: "id-privado", nome: "M", estoque: 2 }]
  }]}]});
  const item = result.roupas[0].items[0];
  assert.equal(item.fonte, "roupas");
  assert.equal("id_origem" in item, false);
  assert.equal(item.variacoes[0].id, "v1");
  assert.equal(JSON.stringify(result).includes("segredo-123"), false);
  assert.equal(JSON.stringify(result).includes("id-privado"), false);
});
