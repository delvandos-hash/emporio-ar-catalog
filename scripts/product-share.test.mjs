import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("metadados Open Graph e canonical inserem quebras de linha reais no head", async () => {
  const source = await readFile(new URL("../netlify/edge-functions/product-share.ts", import.meta.url), "utf8");
  assert.equal(source.split("\\\\n</head>").length - 1, 0, "não deve inserir barra invertida duplicada no HTML");
  assert.equal(source.split("\\n</head>").length - 1, 2, "os dois fallbacks devem inserir quebras de linha");
  assert.match(source, /og:image/);
  assert.match(source, /canonical/);
});
