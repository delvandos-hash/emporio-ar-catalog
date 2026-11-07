/**
 * Publica somente a projeção sanitizada do snapshot local js/data.js no Gist.
 *
 * Seguro por padrão: sem --publish, apenas valida e exibe resumo (dry-run).
 * Para publicar, exige --publish e ALLOW_PUBLIC_GIST_WRITE=yes, além de GIST_TOKEN.
 * Não consulta fornecedores, não recalcula preços e não altera js/data.js.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toPublicCatalog } from "./public-catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "js", "data.js");
const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";
const GIST_FILE = "catalogo.json";
const API = "https://api.github.com";
const hasPublishFlag = process.argv.includes("--publish");

export function parseCatalogData(source) {
  if (typeof source !== "string") throw new Error("Fonte data.js inválida");
  const match = source.match(/export const DATA = ([\s\S]*?);\s*\nexport const WHATSAPP/);
  if (!match) throw new Error("DATA não encontrado em js/data.js");
  const parsed = JSON.parse(match[1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DATA inválido em js/data.js");
  }
  return parsed;
}

export function buildPublicPayload(source, now = new Date().toISOString()) {
  const DATA = toPublicCatalog(parseCatalogData(source));
  const productCount = Object.values(DATA).reduce(
    (sum, groups) => sum + groups.reduce((n, group) => n + group.items.length, 0), 0
  );
  return {
    payload: {
      DATA,
      WHATSAPP: "5562991134488",
      BRAND: { name: "Empório A.R", phone: "(62) 99113-4488" },
      ultimaAtualizacao: now
    },
    productCount,
    groupCount: Object.values(DATA).reduce((sum, groups) => sum + groups.length, 0)
  };
}

export async function getCompleteGistFileContent(file, fetchImpl = fetch) {
  if (!file || typeof file !== "object") {
    throw new Error("Metadados do arquivo catalogo.json inválidos.");
  }

  let content = file.content;
  if (file.truncated === true || typeof content !== "string") {
    let rawUrl;
    try {
      rawUrl = new URL(file.raw_url);
    } catch {
      throw new Error("Arquivo truncado e endereço raw indisponível; publicação cancelada.");
    }
    if (rawUrl.protocol !== "https:" || rawUrl.hostname !== "gist.githubusercontent.com") {
      throw new Error("Endereço raw do Gist não autorizado; publicação cancelada.");
    }

    const response = await fetchImpl(rawUrl, { method: "GET", redirect: "error" });
    if (!response.ok) {
      throw new Error(\`Não foi possível obter o arquivo integral do Gist (HTTP \${response.status}).\`);
    }
    content = await response.text();
  }

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Conteúdo integral de catalogo.json indisponível; publicação cancelada.");
  }
  try {
    JSON.parse(content.replace(/^\\uFEFF/, ""));
  } catch {
    throw new Error("O conteúdo integral de catalogo.json não é JSON válido; publicação cancelada.");
  }
  return content;
}

async function gistRequest(token, method = "GET", body) {
  const response = await fetch(`${API}/gists/${GIST_ID}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) {
    // Não imprimir corpo da resposta: evita exposição acidental de dados do provedor.
    throw new Error(`GitHub Gist API retornou HTTP ${response.status}`);
  }
  return response.json();
}

async function main() {
  const sourceBefore = fs.readFileSync(DATA_PATH, "utf8");
  const { payload, productCount, groupCount } = buildPublicPayload(sourceBefore);
  const serialized = JSON.stringify(payload, null, 2);
  console.log(`Validação concluída: ${groupCount} grupos e ${productCount} produtos.`);
  console.log("Campos publicados: DATA sanitizado, WHATSAPP, BRAND e ultimaAtualizacao.");
  console.log("Preços varejo/atacado são copiados do snapshot; nenhuma rotina de preço ou fornecedor é executada.");
  console.log("js/data.js será somente lido; nenhum arquivo local será alterado.");

  if (!hasPublishFlag) {
    console.log("DRY-RUN: nada foi enviado ao Gist. Use --publish com ALLOW_PUBLIC_GIST_WRITE=yes para autorizar a escrita.");
    return;
  }
  if (process.env.ALLOW_PUBLIC_GIST_WRITE !== "yes") {
    throw new Error("Publicação bloqueada: defina ALLOW_PUBLIC_GIST_WRITE=yes explicitamente.");
  }
  const token = process.env.GIST_TOKEN;
  if (!token) throw new Error("GIST_TOKEN não configurado.");

  const before = await gistRequest(token);
  if (!before.files || !before.files[GIST_FILE]) {
    throw new Error(`Gist não contém o arquivo esperado ${GIST_FILE}; publicação cancelada.`);
  }
  // Arquivos grandes podem vir truncados pela API do Gist; nesse caso,
  // recupera o conteúdo integral pelo raw_url oficial antes de validar.
  await getCompleteGistFileContent(before.files[GIST_FILE]);

  await gistRequest(token, "PATCH", {
    files: { [GIST_FILE]: { content: "\uFEFF" + serialized } }
  });

  const after = await gistRequest(token);
  const publishedRaw = await getCompleteGistFileContent(after.files?.[GIST_FILE]);
  const published = JSON.parse(publishedRaw.replace(/^\uFEFF/, ""));
  if (JSON.stringify(published) !== JSON.stringify(payload)) {
    throw new Error("A verificação posterior do Gist divergiu do conteúdo preparado.");
  }
  const sourceAfter = fs.readFileSync(DATA_PATH, "utf8");
  if (sourceAfter !== sourceBefore) throw new Error("O arquivo js/data.js mudou durante a publicação.");
  console.log("PUBLICAÇÃO CONFIRMADA: catalogo.json corresponde exatamente à projeção sanitizada.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Falha na publicação isolada: ${error.message}`);
    process.exitCode = 1;
  });
}
