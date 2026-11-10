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
  const currentRows = [];
  for (const [line, groups] of Object.entries(merged || {})) {
    for (const group of groups || []) {
      for (const item of group.items || []) {
        const id = String(item?.public_id || "").trim();
        if (id) {
          if (currentIds.has(id)) throw new Error("public_id duplicado na base atual: " + id);
          currentIds.add(id);
        }
        currentRows.push({ line, group, item });
      }
    }
  }

  const baselineRows = [];
  const baselineIds = new Set();
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
        baselineRows.push({ line, group, item, id });
      }
    }
  }

  const restoredIds = [];
  const rekeyedIds = [];
  const matchedCurrentItems = new Set();
  for (const row of baselineRows) {
    const { line, group, item, id } = row;
    if (currentIds.has(id)) {
      // IDs já presentes no catálogo conhecido também são imutáveis durante a
      // reconciliação: o Gist vivo pode ter uma chave diferente para o mesmo
      // produto e preserveLivePublicFields não deve substituir o ID aprovado.
      const existing = currentRows.find(candidate => String(candidate.item?.public_id || "").trim() === id);
      if (existing) existing.item._preserve_public_id = true;
      continue;
    }

    const stockRef = String(item?.stock_ref || "").trim();
    if (stockRef) {
      const matches = currentRows.filter(candidate => {
        if (matchedCurrentItems.has(candidate.item)) return false;
        if (String(candidate.item?.stock_ref || "").trim() !== stockRef) return false;
        return norm(candidate.line) === norm(line) &&
          norm(candidate.group?.cat) === norm(group?.cat) &&
          norm(candidate.group?.brand) === norm(group?.brand) &&
          norm(candidate.item?.nome) === norm(item?.nome) &&
          norm(candidate.item?.volume || "—") === norm(item?.volume || "—");
      });
      if (matches.length > 1) {
        throw new Error("stock_ref ambíguo no snapshot conhecido: " + stockRef);
      }
      if (matches.length === 1) {
        const currentItem = matches[0].item;
        const currentId = String(currentItem?.public_id || "").trim();
        // Não reaproveita um ID atual que também pertence a outro registro do snapshot anterior.
        if (!currentId || !baselineIds.has(currentId)) {
          if (currentId) currentIds.delete(currentId);
          currentItem.public_id = id;
          currentItem._preserve_public_id = true;
          currentIds.add(id);
          matchedCurrentItems.add(currentItem);
          rekeyedIds.push({ from: currentId, to: id, nome: item.nome, stock_ref: stockRef });
          continue;
        }
      }
    }

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
    const restoredItem = structuredClone(item);
    restoredItem._preserve_public_id = true;
    target.items.push(restoredItem);
    currentIds.add(id);
    restoredIds.push(id);
  }

  return { data: merged, baselineIds, restoredIds, rekeyedIds, skippedWithoutPublicId };
}

export function serializeDataJsContent(raw, data) {
  const pattern = /export const DATA = \{[\s\S]*?\};(?=\s*export const WHATSAPP)/;
  if (!pattern.test(String(raw))) throw new Error("Não foi possível localizar o bloco DATA para persistir a restauração.");
  return String(raw).replace(pattern, "export const DATA = " + JSON.stringify(data) + ";");
}
