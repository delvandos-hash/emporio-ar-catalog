function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findProduct(data: any, publicId: string): any | null {
  if (!data || typeof data !== "object") return null;
  for (const groups of Object.values(data)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups as any[]) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        if (String(item?.public_id || "") === publicId) {
          return { ...item, brand: group?.brand || "", cat: group?.cat || "" };
        }
      }
    }
  }
  return null;
}

function setMeta(html: string, attribute: string, key: string, value: string): string {
  const escaped = escapeHtml(value);
  const pattern = new RegExp(`<meta\\s+[^>]*${attribute}=["']${key}["'][^>]*>`, "i");
  const replacement = `<meta ${attribute}="${key}" content="${escaped}" />`;
  if (pattern.test(html)) return html.replace(pattern, replacement);
  return html.replace("</head>", `  ${replacement}\n</head>`);
}

function setCanonical(html: string, url: string): string {
  const replacement = `<link rel="canonical" href="${escapeHtml(url)}" />`;
  const pattern = new RegExp('<link[^>]*canonical[^>]*>', 'i');
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace("</head>", `  ${replacement}\n</head>`);
}

export default async (request: Request, context: any) => {
  const response = await context.next();
  if (!response.ok) return response;

  const url = new URL(request.url);
  const match = url.pathname.match(new RegExp('^/p/(p_[a-f0-9]{20})/?$'));
  if (!match) return response;

  try {
    const catalogUrl = new URL("/api/catalogo", url.origin);
    const catalogResponse = await fetch(catalogUrl, { headers: { "Accept": "application/json" } });
    if (!catalogResponse.ok) return response;
    const payload = await catalogResponse.json();
    const product = findProduct(payload?.DATA, match[1]);
    if (!product) return response;

    const productUrl = new URL(`/p/${encodeURIComponent(match[1])}`, url.origin).toString();
    const rawImage = String(product.foto || product.fotos?.[0] || "/assets/logo.jpg");
    const imageUrl = new URL(rawImage, url.origin);
    if (imageUrl.origin !== url.origin || !new RegExp('^/(api/product-image|assets/)').test(imageUrl.pathname)) {
      imageUrl.pathname = "/assets/logo.jpg";
      imageUrl.search = "";
    }

    const title = `${product.nome || "Produto"} | Empório A.R`;
    const details = [
      product.brand,
      product.volume && product.volume !== "—" ? product.volume : "",
      product.varejo ? `Varejo: R$ ${product.varejo}` : "",
      product.atacado && product.atacado !== "—" ? `Atacado (6+): R$ ${product.atacado}` : ""
    ].filter(Boolean).join(" · ");
    const description = details
      ? `${details}. Confira este produto no catálogo Empório A.R.`
      : `Confira ${product.nome || "este produto"} no catálogo Empório A.R.`;

    let html = await response.text();
    html = html.replace(new RegExp('<title>[^<]*</title>', 'i'), '<title>' + escapeHtml(title) + '</title>');
    html = setMeta(html, "property", "og:title", title);
    html = setMeta(html, "property", "og:description", description);
    html = setMeta(html, "property", "og:url", productUrl);
    html = setMeta(html, "property", "og:image", imageUrl.toString());
    html = setMeta(html, "property", "og:image:alt", `Foto de ${product.nome || "produto"}`);
    html = setMeta(html, "name", "twitter:card", "summary_large_image");
    html = setMeta(html, "name", "twitter:title", title);
    html = setMeta(html, "name", "twitter:description", description);
    html = setMeta(html, "name", "twitter:image", imageUrl.toString());
    html = setCanonical(html, productUrl);

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
};
