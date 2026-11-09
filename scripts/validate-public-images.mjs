import assert from "node:assert/strict";

const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";
const PREVIEW = process.env.NETLIFY_PREVIEW_URL || "https://deploy-preview-10--catalogoemporio.netlify.app";
const SOURCES = {
  a: process.env.CDN_IMAGE_BASE_URL,
  b: process.env.CDN_IMAGE_FALLBACK_BASE_URL,
  p: process.env.IMARAT_ORIGIN_URL,
};
const EXPECTED_HOSTS = {
  a: "arquivos-cdn.facilzap.app.br",
  b: "acdn-us.mitiendanube.com",
  p: "imaratperfumaria.com",
};

for (const [key, value] of Object.entries(SOURCES)) {
  assert.ok(value, `Variável de origem ausente para source=${key}`);
  assert.equal(new URL(value).hostname, EXPECTED_HOSTS[key], `Host inesperado para source=${key}`);
}

const gistResponse = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
  headers: { Accept: "application/vnd.github+json", "User-Agent": "EmporioAR-Image-Validation/1.0" },
});
assert.ok(gistResponse.ok, `Não foi possível ler o snapshot público: HTTP ${gistResponse.status}`);
const gist = await gistResponse.json();
const file = gist.files?.["catalogo.json"];
assert.ok(file?.content, "O Gist público não contém catalogo.json");
const catalog = JSON.parse(file.content.replace(/^\\uFEFF/, ""));

const found = new Map([["a", new Set()], ["b", new Set()], ["p", new Set()]]);
function visit(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach(visit);
  for (const key of ["foto", "fotos", "image", "images"]) {
    const entries = Array.isArray(value[key]) ? value[key] : [value[key]];
    for (const entry of entries) {
      if (typeof entry !== "string") continue;
      try {
        const url = new URL(entry, "https://catalogo-interno.invalid");
        if (url.pathname !== "/api/product-image") continue;
        const source = url.searchParams.get("source");
        const path = url.searchParams.get("path");
        if (found.has(source) && path?.startsWith("/") && !path.startsWith("//")) {
          found.get(source).add(path);
        }
      } catch {}
    }
  }
  Object.values(value).forEach(visit);
}
visit(catalog);

let failures = 0;
for (const source of ["a", "b", "p"]) {
  const paths = [...found.get(source)].slice(0, 5);
  console.log(`source=${source}: ${found.get(source).size} caminho(s) encontrados; testando ${paths.length}`);
  if (!paths.length) {
    console.log(`AVISO: sem imagens publicadas para validar source=${source}`);
    continue;
  }
  for (const path of paths) {
    const endpoint = new URL("/api/product-image", PREVIEW);
    endpoint.searchParams.set("source", source);
    endpoint.searchParams.set("path", path);
    try {
      const response = await fetch(endpoint, { headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" } });
      const type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
      const bytes = Number(response.headers.get("content-length") || 0);
      const valid = response.ok && type.startsWith("image/");
      console.log(`${valid ? "OK" : "FALHA"} source=${source} status=${response.status} type=${type || "n/a"} bytes=${bytes || "stream"} path=${path}`);
      if (!valid) failures++;
      await response.body?.cancel();
    } catch (error) {
      failures++;
      console.log(`FALHA source=${source} path=${path}: ${error.message}`);
    }
  }
}
if (failures) process.exitCode = 1;
