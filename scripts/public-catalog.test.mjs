import test from "node:test";
import assert from "node:assert/strict";
import { toPublicCatalog } from "./public-catalog.mjs";

test("publica somente os campos usados pela vitrine", () => {
  const result = toPublicCatalog({
    perfumes: [{
      brand: "Marca",
      cat: "Perfumes",
      cat_id: "interno-cat",
      items: [{
        id: "interno-id",
        id_origem: "123",
        nome: "Perfume",
        volume: "100ml",
        varejo: "199,90",
        atacado: "149,90",
        foto: "https://arquivos-cdn.facilzap.app.br/produtos/a.webp",
        fotos: ["https://acdn-us.mitiendanube.com/a.webp"],
        notas: "Baunilha",
        disponivel: "Sim",
        badge: "Novo",
        fonte: "imarat",
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
    "id_origem", "nome", "notas", "novoDesde", "varejo", "variacoes", "volume"
  ].sort());
  assert.equal(item.nome, "Perfume");
  assert.equal(item.id_origem, "123");
  assert.deepEqual(item.variacoes, [{ id: "v1", nome: "Único", estoque: 3 }]);
});

test("converte imagem da Imarat para rota same-origin e remove URL inválida", () => {
  const result = toPublicCatalog({
    perfumes: [{
      brand: "Marca",
      cat: "Perfumes",
      items: [{
        nome: "Produto",
        foto: "https://imaratperfumaria.com/uploads/products/item.webp",
        fotos: [
          "https://imaratperfumaria.com/uploads/products/item-2.webp",
          "https://host-nao-autorizado.example/track"
        ]
      }]
    }]
  });
  const item = result.perfumes[0].items[0];
  assert.equal(item.foto, "/api/product-image?path=%2Fuploads%2Fproducts%2Fitem.webp");
  assert.deepEqual(item.fotos, ["/api/product-image?path=%2Fuploads%2Fproducts%2Fitem-2.webp"]);
});

test("descarta imagem inválida sem remover o produto", () => {
  const result = toPublicCatalog({
    perfumes: [{
      brand: "Marca",
      cat: "Perfumes",
      items: [{ nome: "Produto sem imagem", foto: "https://host-nao-autorizado.example/a.webp" }]
    }]
  });
  assert.deepEqual(result.perfumes[0].items, [{ nome: "Produto sem imagem" }]);
});

test("normaliza estoque de variações e limita identificadores/textos", () => {
  const result = toPublicCatalog({
    roupas: [{
      brand: "Marca",
      cat: "Roupas",
      items: [{
        nome: "Vestido",
        id_origem: "x".repeat(150),
        variacoes: [
          { id: "v".repeat(150), nome: "Tamanho M".repeat(20), estoque: "4.8", sku: "interno" },
          { id: "v2", nome: "Tamanho G", estoque: -3, custo: 12 },
          { id: "v3", nome: "Tamanho P", estoque: "inválido" }
        ]
      }]
    }]
  });
  const item = result.roupas[0].items[0];
  assert.equal(item.id_origem.length, 120);
  assert.deepEqual(item.variacoes.map(v => v.estoque), [4, 0, 0]);
  assert.equal(item.variacoes[0].id.length, 120);
  assert.equal(item.variacoes[0].nome.length, 120);
  assert.equal("sku" in item.variacoes[0], false);
});

test("rejeita DATA inválido", () => {
  assert.throws(() => toPublicCatalog(null), /DATA inválido/);
  assert.throws(() => toPublicCatalog([]), /DATA inválido/);
});
