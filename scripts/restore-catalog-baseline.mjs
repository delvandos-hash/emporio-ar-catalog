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
// O snapshot conhecido anterior contém 2.158 IDs; a validação real desta branch
// encontrou 204 ausências exatas, sem rekey nem stock_ref ambígua. Mantém-se
// um teto conservador de 220 para absorver pequenas variações sem liberar
// restaurações em massa silenciosamente.
const MAX_SAFE_BASELINE_RESTORE = 220;
if (result.restoredIds.length > MAX_SAFE_BASELINE_RESTORE) {
  throw new Error("Restauração excede limite seguro de " + MAX_SAFE_BASELINE_RESTORE + " itens: " + result.restoredIds.length);
}
if (process.env.CATALOG_BASELINE_RESTORE_FINAL === "1") {
  // Na etapa pós-sync, os IDs já não precisam proteger preserveLivePublicFields.
  // Remove o marcador interno antes de persistir o snapshot de homologação.
  for (const groups of Object.values(result.data || {})) {
    for (const group of groups || []) {
      for (const item of group.items || []) delete item._preserve_public_id;
    }
  }
}
const next = serializeDataJsContent(currentRaw, result.data);
fs.writeFileSync(currentPath, next, "utf8");
console.log("KNOWN_GOOD_BASELINE_PUBLIC_IDS=" + result.baselineIds.size);
console.log("KNOWN_GOOD_BASELINE_REKEYED=" + result.rekeyedIds.length);
console.log("KNOWN_GOOD_BASELINE_LEGACY_DUPLICATES_REMOVED=" + result.deduplicatedLegacyIds.length);
for (const entry of result.deduplicatedLegacyIds) console.log("KNOWN_GOOD_BASELINE_LEGACY_DUPLICATE_REMOVED=" + JSON.stringify(entry));
console.log("KNOWN_GOOD_BASELINE_AMBIGUOUS_STOCK_REFS=" + result.ambiguousStockRefs.length);
for (const entry of result.ambiguousStockRefs) console.log("KNOWN_GOOD_BASELINE_AMBIGUOUS_SKIPPED=" + JSON.stringify(entry));
console.log("KNOWN_GOOD_BASELINE_RESTORED=" + result.restoredIds.length);
console.log("KNOWN_GOOD_BASELINE_WITHOUT_PUBLIC_ID_SKIPPED=" + result.skippedWithoutPublicId);
for (const entry of result.rekeyedIds) console.log("KNOWN_GOOD_BASELINE_REKEYED_ITEM=" + JSON.stringify(entry));
for (const id of result.restoredIds) console.log("KNOWN_GOOD_ITEM_RESTORED=" + id);
