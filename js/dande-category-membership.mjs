/** Expande a exibição por categoria sem duplicar o cadastro original. */
export function expandDandeCategoryGroups(groups) {
  const buckets = new Map();
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const item of Array.isArray(group?.items) ? group.items : []) {
      const rawCategories = Array.isArray(item?.categorias_origem) && item.categorias_origem.length
        ? item.categorias_origem
        : [group?.cat || "Outros"];
      const categories = [...new Set(rawCategories.map(value => String(value || "").trim()).filter(Boolean))];
      for (const category of categories) {
        const brand = String(group?.brand || "");
        const key = brand + "\u0000" + category;
        if (!buckets.has(key)) buckets.set(key, { brand, cat: category, items: [] });
        buckets.get(key).items.push({ ...item, cat: category });
      }
    }
  }
  return [...buckets.values()]
    .map(group => ({
      ...group,
      items: group.items.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"))
    }))
    .sort((a, b) => a.cat.localeCompare(b.cat, "pt-BR"));
}
