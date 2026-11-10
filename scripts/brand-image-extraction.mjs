const IMAGE_FIELDS = [
  "imagens", "images", "fotos", "photos",
  "imagem", "foto", "image", "image_url", "imageUrl",
  "imagem_url", "url_imagem", "url_foto", "foto_url",
  "imagem_principal", "foto_principal", "thumbnail", "thumbnail_url", "src"
];

export function brandImageCandidates(product, cdnBase) {
  const candidates = [];
  const add = value => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    if (typeof value === "object") {
      const nested = ["url", "src", "path", "image", "imagem", "foto", "thumbnail", "href"];
      let found = false;
      for (const key of nested) {
        if (value[key]) {
          add(value[key]);
          found = true;
        }
      }
      if (!found) Object.values(value).forEach(add);
      return;
    }
    const raw = String(value).trim();
    if (!raw || raw === "null" || raw === "undefined") return;
    let url;
    if (/^https?:\/\//i.test(raw)) {
      url = raw;
    } else if (raw.startsWith("//")) {
      url = "https:" + raw;
    } else {
      if (!cdnBase) return;
      try {
        const base = new URL(cdnBase);
        if (!base.pathname.endsWith("/")) base.pathname += "/";
        url = new URL(raw.replace(/^\/+/, ""), base).toString();
        if (!/[?&](width|height)=/i.test(url)) {
          url += (url.includes("?") ? "&" : "?") + "width=700&height=700&quality=85&format=webp";
        }
      } catch {
        return;
      }
    }
    if (!candidates.includes(url)) candidates.push(url);
  };
  for (const field of IMAGE_FIELDS) add(product?.[field]);
  return candidates;
}
