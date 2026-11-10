import test from "node:test";
import assert from "node:assert/strict";
import { brandImageCandidates } from "./brand-image-extraction.mjs";

test("normaliza galeria relativa e absoluta do campo imagens", () => {
  const result = brandImageCandidates({
    imagens: ["/products/a.webp", { url: "https://cdn.example/b.webp" }]
  }, "https://images.example/catalog");
  assert.deepEqual(result, [
    "https://images.example/catalog/products/a.webp?width=700&height=700&quality=85&format=webp",
    "https://cdn.example/b.webp"
  ]);
});

test("aceita aliases de imagem usados por APIs de catálogo", () => {
  const result = brandImageCandidates({
    imagem: "/a.webp",
    foto: { src: "/b.webp" },
    image_url: "https://images.example/c.webp"
  }, "https://images.example/");
  assert.deepEqual(result, [
    "https://images.example/a.webp?width=700&height=700&quality=85&format=webp",
    "https://images.example/b.webp?width=700&height=700&quality=85&format=webp",
    "https://images.example/c.webp"
  ]);
});

test("não inventa imagem quando a origem não fornece nenhum campo de mídia", () => {
  assert.deepEqual(brandImageCandidates({ nome: "Produto sem foto" }, "https://images.example/"), []);
});

test("remove URLs repetidas preservando a ordem da galeria", () => {
  assert.deepEqual(brandImageCandidates({
    imagens: ["/a.webp", "/a.webp"],
    foto: "/a.webp"
  }, "https://images.example/"), [
    "https://images.example/a.webp?width=700&height=700&quality=85&format=webp"
  ]);
});
