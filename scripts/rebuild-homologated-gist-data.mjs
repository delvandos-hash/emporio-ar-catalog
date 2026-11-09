import fs from "node:fs";
import { DATA } from "../js/data.js";
import { toPublicCatalog } from "./public-catalog.mjs";

const imageOptions = {
  cdnBase: process.env.CDN_IMAGE_BASE_URL || "https://arquivos-cdn.facilzap.app.br/",
  cdnFallbackBase: process.env.CDN_IMAGE_FALLBACK_BASE_URL || "https://acdn-us.mitiendanube.com/",
  productBase: process.env.IMARAT_ORIGIN_URL || "https://imaratperfumaria.com/"
};
const safe = toPublicCatalog(DATA, imageOptions);
const groups = Object.values(safe).flat();
const products = groups.flatMap(g => Array.isArray(g.items) ? g.items : []);
const report = {
  sourceCommit: "471dcd18817239069df7311418548a3b6909b8ee",
  groupCount: groups.length,
  productCount: products.length,
  productsWithPhoto: products.filter(p => p.foto || (p.fotos || []).length).length,
  productsWithoutPhoto: products.filter(p => !p.foto && !(p.fotos || []).length).length,
  photoUrlCount: products.reduce((n,p) => n + (p.foto ? 1 : 0) + (Array.isArray(p.fotos) ? p.fotos.length : 0), 0),
  imageOptions
};
fs.mkdirSync("rebuild-output", { recursive: true });
fs.writeFileSync("rebuild-output/DATA-homologada.json", JSON.stringify(safe));
fs.writeFileSync("rebuild-output/relatorio-validacao.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!products.length) throw new Error("Base homologada vazia: artefato não será considerado válido.");
if (!report.productsWithPhoto) throw new Error("Nenhuma foto foi preservada; artefato inválido.");
