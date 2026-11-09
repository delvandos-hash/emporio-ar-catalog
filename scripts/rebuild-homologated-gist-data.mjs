import fs from "node:fs";
import { DATA } from "../js/data.js";
import { toPublicCatalog } from "./public-catalog.mjs";

const imageOptions = {
  cdnBase: process.env.CDN_IMAGE_BASE_URL || "https://arquivos-cdn.facilzap.app.br/",
  cdnFallbackBase: process.env.CDN_IMAGE_FALLBACK_BASE_URL || "https://acdn-us.mitiendanube.com/",
  productBase: process.env.IMARAT_ORIGIN_URL || "https://imaratperfumaria.com/"
};
const publicData = toPublicCatalog(DATA, imageOptions);
const payload = {
  DATA: publicData,
  WHATSAPP: "5562991134488",
  BRAND: { name: "Empório A.R", phone: "(62) 99113-4488" },
  ultimaAtualizacao: "2026-11-08T02:19:18.000Z"
};
const groups = Object.values(publicData).flat();
const products = groups.flatMap(g => Array.isArray(g.items) ? g.items : []);
const photos = products.flatMap(p => [...(p.foto ? [p.foto] : []), ...(Array.isArray(p.fotos) ? p.fotos : [])]);
const report = {
  sourceCommit: "471dcd18817239069df7311418548a3b6909b8ee",
  groupCount: groups.length,
  productCount: products.length,
  productsWithPhoto: products.filter(p => p.foto || (p.fotos || []).length).length,
  productsWithoutPhoto: products.filter(p => !p.foto && !(p.fotos || []).length).length,
  photoUrlCount: photos.length,
  invalidPhotoUrlCount: photos.filter(u => !(u.startsWith("/api/product-image?source=a&path=") || u.startsWith("/api/product-image?source=b&path=") || u.startsWith("/api/product-image?source=p&path="))).length,
  metadata: { WHATSAPP: payload.WHATSAPP, BRAND: payload.BRAND, ultimaAtualizacao: payload.ultimaAtualizacao },
  imageOptions
};
if (!products.length || !report.productsWithPhoto || report.invalidPhotoUrlCount) {
  throw new Error("Snapshot inválido; Gist não será atualizado: " + JSON.stringify(report));
}
fs.mkdirSync("rebuild-output", { recursive: true });
fs.writeFileSync("rebuild-output/catalogo.json", JSON.stringify(payload));
fs.writeFileSync("rebuild-output/relatorio-validacao.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
