import test from "node:test";
import assert from "node:assert/strict";
import { toPublicCatalog } from "./public-catalog.mjs";
process.env.CDN_IMAGE_BASE_URL = "https://images-primary.example/";
process.env.CDN_IMAGE_FALLBACK_BASE_URL = "https://images-secondary.example/";
process.env.IMARAT_ORIGIN_URL = "https://products.example/";

test("publica somente os campos usados pela vitrine", () => {
  const result = toPublicCatalog({
    feminino: [{
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

  const group = result.feminino[0];
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

test("converte imagens de catálogo para rota same-origin e remove URL inválida", () => {
  const result = toPublicCatalog({
    feminino: [{
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
  const item = result.feminino[0].items[0];
  assert.equal(item.foto, "/api/product-image?source=p&path=%2Fuploads%2Fproducts%2Fitem.webp");
  assert.deepEqual(item.fotos, ["/api/product-image?source=p&path=%2Fuploads%2Fproducts%2Fitem-2.webp"]);
});

test("descarta imagem inválida sem remover o produto", () => {
  const result = toPublicCatalog({
    feminino: [{
      brand: "Marca",
      cat: "Perfumes",
      items: [{ nome: "Produto sem imagem", foto: "https://host-nao-autorizado.example/a.webp" }]
    }]
  });
  assert.deepEqual(result.feminino[0].items.map(x => x.nome), ["Produto sem imagem"]);
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

test("gera referência opaca para estoque ao vivo sem publicar IDs de origem", () => {
  const source = { roupas: [{ brand: "Empório A.R", cat: "VESTIDOS", items: [{
    nome: "Vestido", id_origem: "franny-987654", fonte: "roupas",
    variacoes: [{ id: "tamanho-privado", nome: "M", estoque: 2 }]
  }]}] };
  const result = toPublicCatalog(source);
  const item = result.roupas[0].items[0];
  assert.match(item.stock_ref, /^s_[a-f0-9]{24}$/);
  assert.equal(item.stock_route, "b");
  assert.equal(JSON.stringify(result).includes("franny-987654"), false);
  assert.equal(JSON.stringify(result).includes("987654"), false);
  assert.equal(JSON.stringify(result).includes("tamanho-privado"), false);
  assert.equal(toPublicCatalog(source).roupas[0].items[0].stock_ref, item.stock_ref);
  const secondPass = toPublicCatalog(result).roupas[0].items[0];
  assert.equal(secondPass.stock_ref, item.stock_ref);
  assert.equal(secondPass.stock_route, "b");
});

test("rejeita DATA inválido", () => {
  assert.throws(() => toPublicCatalog(null), /DATA inválido/);
  assert.throws(() => toPublicCatalog([]), /DATA inválido/);
});

import { sanitizePayload } from "../netlify/functions/get-catalog.mjs";

test("API e publicação no Gist mantêm a mesma projeção pública", () => {
  const source = {
    feminino: [{
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

test("usa a primeira foto pública quando foto contém somente nome relativo inválido", () => {
  const result = toPublicCatalog({ feminino: [{ brand: "Marca", cat: "Perfumes", items: [{
    nome: "Produto", foto: "arquivo-sem-base.webp",
    fotos: ["https://images-secondary.example/stores/a/produto.webp"]
  }]}]});
  const item = result.feminino[0].items[0];
  assert.equal(item.foto, "/api/product-image?source=b&path=%2Fstores%2Fa%2Fproduto.webp");
  assert.deepEqual(item.fotos, [item.foto]);
});

test("não preserva nomes de origem em chaves de linha públicas", () => {
  const result = toPublicCatalog({
    "fornecedor-privado": [{ brand: "Marca", cat: "Categoria", items: [{ nome: "Produto", fonte: "fornecedor-privado" }] }]
  });
  assert.deepEqual(Object.keys(result), ["outros"]);
  assert.equal(JSON.stringify(result).includes("fornecedor-privado"), false);
});

test("gera public_id distinto para variantes do mesmo nome, mantendo a URL antiga no item canônico", () => {
  const source = {
    feminino: [{ brand: "Afeer", cat: "Miniaturas", items: [
      { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "95,00", atacado: "65,00", foto: "https://products.example/a.webp", id_origem: "1474", fonte: "imarat" },
      { nome: "Miniatura Atherri Afeer", volume: "30ml", varejo: "105,00", atacado: "75,00", foto: "https://products.example/b.webp", id_origem: "1481", fonte: "imarat" }
    ]}]
  };
  const first = toPublicCatalog(source).feminino[0].items;
  const second = toPublicCatalog(source).feminino[0].items;
  assert.notEqual(first[0].public_id, first[1].public_id);
  assert.equal(first[0].public_id, second[0].public_id);
  assert.equal(first[1].public_id, second[1].public_id);
  assert.equal(JSON.stringify(first).includes("1474"), false);
  assert.equal(JSON.stringify(first).includes("1481"), false);
});

test("public_id legado é reservado antes de gerar IDs de variantes", () => {
  const single = toPublicCatalog({
    roupas: [{ brand: "Empório A.R", cat: "Roupas", items: [
      { nome: "Calça Resinada", varejo: "99,90", atacado: "69,90", foto: "https://img.example/a.webp" }
    ]}]
  });
  const legacyId = single.roupas[0].items[0].public_id;
  const mixed = toPublicCatalog({
    roupas: [{ brand: "Empório A.R", cat: "Roupas", items: [
      { nome: "Calça Resinada", varejo: "109,90", atacado: "79,90", foto: "https://img.example/b.webp" },
      { public_id: legacyId, nome: "Calça Resinada", varejo: "99,90", atacado: "69,90", foto: "https://img.example/a.webp" }
    ]}]
  });
  const items = mixed.roupas[0].items;
  assert.equal(items[1].public_id, legacyId);
  assert.notEqual(items[0].public_id, legacyId);
  assert.notEqual(items[0].public_id, items[1].public_id);
});

test("gera referência opaca e estável da origem sem expor o ID interno", () => {
  const DATA = { masculino: [{ brand: "Lattafa", cat: "Miniaturas", items: [
    { nome: "Mini Asad", volume: "30ml", id_origem: "1157", fonte: "imarat" }
  ] }] };
  const item = toPublicCatalog(DATA).masculino[0].items[0];
  assert.match(item.origin_ref, /^o_[a-f0-9]{24}$/);
  assert.equal(item.id_origem, undefined);
  assert.equal(toPublicCatalog(DATA).masculino[0].items[0].origin_ref, item.origin_ref);
});

test("IDs públicos permanecem globais e distintos para IDs de origem diferentes", () => {
  const DATA = {
    acessorios: [
      { brand: "Empório A.R", cat: "Lançamentos", items: [
        { nome: "Colar Coração Vazado Semijoia Italiana", id_origem: "362483462", fonte: "acessorios", public_id: "p_d18982fe0d395bd8e799" }
      ] },
      { brand: "Empório A.R", cat: "Semijoia Italiana", items: [
        { nome: "Colar Coração Vazado Semijoia Italiana", id_origem: "313263798", fonte: "acessorios", public_id: "p_d18982fe0d395bd8e799" }
      ] }
    ]
  };
  const out = toPublicCatalog(DATA);
  const ids = out.acessorios.flatMap(g => g.items.map(i => i.public_id));
  assert.equal(new Set(ids).size, 2);
});
test("mesmo ID de origem repetido em categorias distintas conserva uma única identidade pública", () => {
  const DATA = {
    roupas: [
      { brand: "Empório A.R", cat: "CALÇA/SHORT", items: [
        { nome: "Calça Cargo", id_origem: "4239995", fonte: "roupas" }
      ] },
      { brand: "Empório A.R", cat: "URBANA JEANS", items: [
        { nome: "Calça Cargo", id_origem: "4239995", fonte: "roupas" }
      ] }
    ]
  };
  const out = toPublicCatalog(DATA);
  const ids = out.roupas.flatMap(g => g.items.map(i => i.public_id));
  assert.equal(new Set(ids).size, 1);
});

test("marcas ONLY YOU e MAIS YOU permanecem separadas mesmo com nomes semelhantes", () => {
  const DATA = {
    feminino: [
      { brand: "ONLY YOU", cat: "Miniaturas", items: [
        { nome: "Mini Onlyyou 212", volume: "30ml", id_origem: "only-212", fonte: "imarat" }
      ] },
      { brand: "MAIS YOU", cat: "Miniaturas", items: [
        { nome: "Mini Onlyyou 212", volume: "30ml", id_origem: "mais-212", fonte: "imarat" }
      ] }
    ]
  };
  const out = toPublicCatalog(DATA);
  assert.equal(out.feminino.length, 2);
  assert.deepEqual(out.feminino.map(group => group.brand), ["ONLY YOU", "MAIS YOU"]);
  const ids = out.feminino.map(group => group.items[0].public_id);
  assert.equal(new Set(ids).size, 2);
});

test("stock_ref já validado prevalece sobre ID de origem alterado", () => {
  const DATA = {
    acessorios: [{ brand: "Empório A.R", cat: "Masculinos", items: [{
      nome: "Colar Masculino 3x1 Aço Inoxidavel",
      id_origem: "novo-id-da-fonte",
      fonte: "acessorios",
      stock_ref: "s_df05a28999eac34ac1580fe3",
      stock_route: "a"
    }] }]
  };
  const item = toPublicCatalog(DATA).acessorios[0].items[0];
  assert.equal(item.stock_ref, "s_df05a28999eac34ac1580fe3");
  assert.equal(item.stock_route, "a");
  assert.equal(item.id_origem, undefined);
});
