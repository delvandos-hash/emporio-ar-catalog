function norm(value) {
  return String(value ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function volumeOf(item) {
  const raw = String(item?.volume ?? "").trim();
  const value = raw && raw !== "—" ? raw : String(item?.nome ?? "");
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  return match ? String(Number(match[1].replace(",", "."))) + match[2].toLowerCase() : "";
}
function manualPrice(item) {
  return item?.precoManual === true || item?.precoManual === "true" || item?.precoManual === 1;
}
function complete(item) {
  return Object.values(item ?? {}).filter(v => v !== null && v !== undefined && v !== "" && v !== "—").length;
}
function mergeDetails(keep, other) {
  for (const [key, value] of Object.entries(other ?? {})) {
    if (["nome", "volume", "varejo", "atacado", "precoManual", "id_origem", "fonte"].includes(key)) continue;
    if (keep[key] == null || keep[key] === "" || keep[key] === "—") keep[key] = value;
  }
  const photos = [
    ...(Array.isArray(keep.fotos) ? keep.fotos : []), keep.foto,
    ...(Array.isArray(other.fotos) ? other.fotos : []), other.foto
  ].filter(Boolean);
  const unique = [...new Set(photos)];
  if (unique.length) {
    keep.fotos = unique;
    if (!keep.foto) keep.foto = unique[0];
  }
  if (other.disponivel === "Sim") keep.disponivel = "Sim";
  return keep;
}

/**
 * Remove only cross-group repetitions whose source identity proves they are
 * the same product: same source, brand, origin ID, exact normalized title
 * and volume. Different origin IDs, brands, titles or volumes are preserved.
 * Imarat has a dedicated reconciliation path and is intentionally excluded.
 */
export function dedupeConfirmedSourceProducts(DATA) {
  const seen = new Map();
  const conflicts = [];
  const blockedKeys = new Set();
  let removed = 0;
  for (const [line, groups] of Object.entries(DATA ?? {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      const kept = [];
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        const source = norm(item?.fonte);
        const id = String(item?.id_origem ?? "").trim();
        const brand = source === "brand" ? "brand-collection" : norm(group?.brand);
        const name = norm(item?.nome);
        const volume = volumeOf(item);
        if (!source || source === "imarat" || !id || !brand || !name) {
          kept.push(item);
          continue;
        }
        const key = [source, brand, id].join("|");
        if (blockedKeys.has(key)) { kept.push(item); continue; }
        const prior = seen.get(key);
        if (!prior) {
          const row = { item, group, line, name, volume };
          seen.set(key, row);
          kept.push(item);
          continue;
        }
        if (prior.name !== name || prior.volume !== volume) {
          conflicts.push({ source, id, brand, firstName: prior.item.nome, nextName: item.nome,
            firstVolume: prior.volume, nextVolume: volume });
          blockedKeys.add(key);
          kept.push(item);
          continue;
        }
        const firstPrice = String(prior.item.varejo ?? "") + "|" + String(prior.item.atacado ?? "");
        const nextPrice = String(item.varejo ?? "") + "|" + String(item.atacado ?? "");
        if (firstPrice !== nextPrice &&
            manualPrice(prior.item) && manualPrice(item)) {
          conflicts.push({ source, id, brand, reason: "manual-price-conflict" });
          blockedKeys.add(key);
          kept.push(item);
          continue;
        }
        if (firstPrice !== nextPrice &&
            !manualPrice(prior.item) && !manualPrice(item)) {
          // A source ID proves product identity. When neither price is marked
          // manual, keep the first source-backed value and remove the duplicate.
          conflicts.push({ source, id, brand, reason: "non-manual-price-conflict",
            resolution: "kept-first-source-record" });
        }
        let keeper = prior.item;
        if (manualPrice(item) && !manualPrice(prior.item)) {
          keeper = item;
          mergeDetails(keeper, prior.item);
          if (prior.group === group) {
            const priorIndex = kept.indexOf(prior.item);
            if (priorIndex >= 0) kept.splice(priorIndex, 1);
          } else {
            const priorList = prior.group.items;
            const priorIndex = priorList.indexOf(prior.item);
            if (priorIndex >= 0) priorList.splice(priorIndex, 1);
          }
          kept.push(item);
          prior.item = item;
          prior.group = group;
          prior.line = line;
        } else {
          mergeDetails(keeper, item);
        }
        removed++;
      }
      group.items = kept;
    }
  }
  return { removed, conflicts };
}
