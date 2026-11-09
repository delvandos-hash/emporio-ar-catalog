import assert from "node:assert/strict";

const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";
const PREVIEW = process.env.NETLIFY_PREVIEW_URL || "";
const SOURCES = {
  a: { env: "CDN_IMAGE_BASE_URL", label: "CDN principal" },
  b: { env: "CDN_IMAGE_FALLBACK_BASE_URL", label: "CDN secundário" },
  p: { env: "IMARAT_ORIGIN_URL", label: "Imarat" },
  d: { env: "DANDE_BASE_URL", label: "Dande" },
};

const previewUrl = new URL(PREVIEW);
assert.equal(previewUrl.protocol, "https:", "A prévia deve usar HTTPS");
assert.match(
  previewUrl.hostname,
  /^deploy-preview-\d+--catalogoemporio\.netlify\.app$/,
  "A validação deve apontar exclusivamente para um Deploy Preview do projeto catalogoemporio"
);

for (const [key, source] of Object.entries(SOURCES)) {
  const raw = process.env[source.env];
  assert.ok(raw, `Variável ausente: ${source.env}`);
  const origin = new URL(raw);
  assert.equal(origin.protocol, "https:", `${source.env} deve usar HTTPS`);
  assert.equal(origin.username, "", `${source.env} não pode conter credenciais`);
  assert.equal(origin.password, "", `${source.env} não pode conter credenciais`);
  assert.equal(origin.search, "", `${source.env} não pode conter query string`);
  assert.equal(origin.hash, "", `${source.env} não pode conter fragmento`);
  console.log(`Configuração validada: source=${key} (${source.label}); HTTPS e formato seguros.`);
}

const gistResponse = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
  headers: {
    Accept: "application/vnd.github+json",
    "User-Agent": "EmporioAR-Image-Validation/1.0",
  },
});
assert.ok(gistResponse.ok, `Falha ao ler snapshot público: HTTP ${gistResponse.status}`);
const gist = await gistResponse.json();
const file = gist.files?.["catalogo.json"];
assert.ok(file, "O Gist público não contém catalogo.json");

// O GitHub pode truncar file.content em Gists grandes. Nessa situação,
// é obrigatório buscar o arquivo completo pelo raw_url antes do JSON.parse.
let snapshot = file.content;
if (file.truncated || !snapshot) {
  assert.ok(file.raw_url, "O Gist sinalizou conteúdo truncado, mas não forneceu raw_url");
  const rawResponse = await fetch(file.raw_url, {
    headers: { "User-Agent": "EmporioAR-Image-Validation/1.0" },
  });
  assert.ok(rawResponse.ok, `Falha ao ler snapshot bruto: HTTP ${rawResponse.status}`);
  snapshot = await rawResponse.text();
}
assert.ok(snapshot, "O conteúdo do catálogo não foi disponibilizado pelo Gist");
const cleanSnapshot = snapshot.charCodeAt(0) === 0xFEFF ? snapshot.slice(1) : snapshot;
const catalog = JSON.parse(cleanSnapshot);

const pathsBySource = new Map(Object.keys(SOURCES).map(key => [key, new Set()]));
function visit(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(visit);
    return;
  }

  for (const key of ["foto", "fotos", "image", "images"]) {
    const entries = Array.isArray(value[key]) ? value[key] : [value[key]];
    for (const entry of entries) {
      if (typeof entry !== "string") continue;
      try {
        const url = new URL(entry, "https://catalogo-interno.invalid");
        if (url.pathname !== "/api/product-image") continue;
        const source = url.searchParams.get("source");
        const path = url.searchParams.get("path");
        if (!pathsBySource.has(source) || !path?.startsWith("/") || path.startsWith("//")) continue;
        if (source === "p" && !path.startsWith("/uploads/products/")) continue;
        if (source === "d" && !path.startsWith("/products/")) continue;
        pathsBySource.get(source).add(path);
      } catch {
        // URLs malformadas são ignoradas; a função de proxy também as rejeita.
      }
    }
  }
  Object.values(value).forEach(visit);
}
visit(catalog);

const totalPaths = [...pathsBySource.values()].reduce((sum, paths) => sum + paths.size, 0);
assert.ok(totalPaths > 0, "Nenhum caminho de imagem do proxy foi encontrado no snapshot público");

let checked = 0;
let failures = 0;
for (const [source, paths] of pathsBySource) {
  const sample = [...paths].slice(0, 5);
  console.log(`source=${source}: ${paths.size} caminho(s) no snapshot; testando ${sample.length}`);

  if (paths.size === 0) {
    console.log(`AVISO: o snapshot não contém imagens para source=${source}`);
    continue;
  }

  for (const path of sample) {
    const endpoint = new URL("/api/product-image", previewUrl);
    endpoint.searchParams.set("source", source);
    endpoint.searchParams.set("path", path);

    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
      });
      const contentType = (response.headers.get("content-type") || "")
        .split(";")[0].trim().toLowerCase();
      const valid = response.status === 200 && contentType.startsWith("image/");
      checked++;
      console.log(
        `${valid ? "OK" : "FALHA"} source=${source} status=${response.status} ` +
        `type=${contentType || "n/a"}`
      );
      if (!valid) failures++;
      await response.body?.cancel();
    } catch (error) {
      checked++;
      failures++;
      console.log(`FALHA source=${source}: erro de conexão ou resposta inválida (detalhes omitidos para proteger a origem e o caminho).`);
    }
  }
}

console.log(`Resultado: ${checked} imagem(ns) testada(s), ${failures} falha(s).`);
if (failures > 0) process.exitCode = 1;
