function norm(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseDataJsContent(raw) {
  const match = String(raw).match(/export const DATA = (\{[\s\S]*?\});\s*(?=export const WHATSAPP|$)/);
  if (!match) throw new Error("DATA não encontrado no arquivo de catálogo.");
  const data = JSON.parse(match[1]);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Estrutura DATA inválida no snapshot.");
  }
  return data;
}

export function collectPublicIds(data) {
  const ids = new Set();
  for (const groups of Object.values(data || {})) {
    for (const group of groups || []) {
      for (const item of group.items || []) {
        const id = String(item?.public_id || "").trim();
        if (id) ids.add(id);
      }
    }
  }
  return ids;
}

export function mergeKnownGoodSnapshot(currentData, baselineData) {
  const merged = structuredClone(currentData);
  const currentIds = new Set();
  for (const groups of Object.values(merged || {})) {
    for (const group of groups || []) {
      for (const item of group.items || []) {
        const id = String(item?.public_id || "").trim();
        if (!id) continue;
        if (currentIds.has(id)) throw new Error("public_id duplicado na base atual: " + id);
        currentIds.add(id);
      }
    }
  }

  const baselineIds = new Set();
  const restoredIds = [];
  let skippedWithoutPublicId = 0;
  for (const [line, groups] of Object.entries(baselineData || {})) {
    for (const group of groups || []) {
      for (const item of group.items || []) {
        const id = String(item?.public_id || "").trim();
        if (!id) {
          skippedWithoutPublicId++;
          continue;
        }
        if (baselineIds.has(id)) throw new Error("public_id duplicado no snapshot conhecido: " + id);
        baselineIds.add(id);
        if (currentIds.has(id)) continue;

        if (!Array.isArray(merged[line])) merged[line] = [];
        const categoryKey = norm(group.cat);
        const brandKey = norm(group.brand);
        let target = merged[line].find(candidate =>
          norm(candidate.cat) === categoryKey && norm(candidate.brand) === brandKey
        );
        if (!target) {
          target = { cat: group.cat, brand: group.brand, items: [] };
          merged[line].push(target);
        }
        target.items.push(structuredClone(item));
        currentIds.add(id);
        restoredIds.push(id);
      }
    }
  }

  return { data: merged, baselineIds, restoredIds, skippedWithoutPublicId };
}

export function serializeDataJsContent(raw, data) {
  const pattern = /export const DATA = \{[\s\S]*?\};(?=\s*export const WHATSAPP)/;
  if (!pattern.test(String(raw))) throw new Error("Não foi possível localizar o bloco DATA para persistir a restauração.");
  return String(raw).replace(pattern, "export const DATA = " + JSON.stringify(data) + ";");
}
