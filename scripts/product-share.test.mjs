import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("metadados Open Graph e canonical inserem quebras de linha reais no head", async () => {
  const source = await readFile(new URL("../netlify/edge-functions/product-share.ts", import.meta.url), "utf8");
  assert.equal(source.includes("\\\\n</head>"), false, "não deve inserir os caracteres literais \\n no HTML");
  assert.equal((source.match(/\\n<\\/head>/g) || []).length, 2, "os dois fallbacks devem inserir uma quebra de linha real");
  assert.match(source, /og:image/);
  assert.match(source, /canonical/);
});
