import fs from "node:fs";
import path from "node:path";
import {
  collectPublicIds,
  mergeKnownGoodSnapshot,
  parseDataJsContent,
  serializeDataJsContent
} from "./catalog-baseline-restore.mjs";

const baselinePath = process.env.CATALOG_BASELINE_PATH;
if (!baselinePath) throw new Error("CATALOG_BASELINE_PATH não configurado.");
const currentPath = process.env.CATALOG_CURRENT_DATA_PATH || path.resolve("js/data.js");
const baselineRaw = fs.readFileSync(baselinePath, "utf8");
const currentRaw = fs.readFileSync(currentPath, "utf8");
const baseline = parseDataJsContent(baselineRaw);
const current = parseDataJsContent(currentRaw);
const baselineIds = collectPublicIds(baseline);
if (baselineIds.size < 2000) {
  throw new Error("Snapshot conhecido incompleto: apenas " + baselineIds.size + " public_ids.");
}
const result = mergeKnownGoodSnapshot(current, baseline);
if (result.restoredIds.length > 200) {
  throw new Error("Restauração excede limite seguro de 200 itens: " + result.restoredIds.length);
}
const next = serializeDataJsContent(currentRaw, result.data);
fs.writeFileSync(currentPath, next, "utf8");
console.log("KNOWN_GOOD_BASELINE_PUBLIC_IDS=" + result.baselineIds.size);
console.log("KNOWN_GOOD_BASELINE_RESTORED=" + result.restoredIds.length);
console.log("KNOWN_GOOD_BASELINE_WITHOUT_PUBLIC_ID_SKIPPED=" + result.skippedWithoutPublicId);
for (const id of result.restoredIds) console.log("KNOWN_GOOD_ITEM_RESTORED=" + id);
