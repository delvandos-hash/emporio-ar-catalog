/**
 * Feed Google Merchant Center (RSS 2.0 + namespace g)
 * URL pública: https://catalogoemporio.netlify.app/feed.xml
 */
const GIST_RAW =
  "https://gist.githubusercontent.com/delvandos-hash/11918b7196b3ee6a0d8a91739167b312/raw/catalogo.json";
const BASE_URL = "https://catalogoemporio.netlify.app";
const IMG_BASE = "https://arquivos-cdn.facilzap.app.br/";

function normId(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePrice(v) {
  if (v == null || v === "" || v === "—") return 0;
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function absImg(u) {
  if (!u) return "";
  const s = String(u.url || u).trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return IMG_BASE + s.replace(/^\//, "");
}

function escapeCdata(s) {
  return String(s || "").replace(/]]>/g, "]] >");
}

function productId(brand, nome, volume) {
  return `${normId(brand)}-${normId(nome)}-${normId(volume || "")}`;
}

export default async (req, context) => {
  try {
    const response = await fetch(GIST_RAW, {
      headers: { "User-Agent": "EmporioAR-Feed/1.0" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Falha ao buscar dados do Gist: HTTP " + response.status);

    let rawText = await response.text();
    if (rawText.charCodeAt(0) === 0xfeff) rawText = rawText.slice(1);
    if (rawText.startsWith("\uFEFF")) rawText = rawText.slice(1);

    const data = JSON.parse(rawText);
    const DATA = data.DATA || {};
    const feedItems = [];

    for (const line of Object.keys(DATA)) {
      for (const g of DATA[line] || []) {
        const brand = g.brand || "Empório A.R";
        const cat = g.cat || "";
        for (const item of g.items || []) {
          const preco = parsePrice(item.varejo);
          if (preco <= 0) continue;

          const id = productId(brand, item.nome, item.volume);
          const link = `${BASE_URL}/?produto=${encodeURIComponent(id)}`;

          const fotosRaw = Array.isArray(item.fotos) && item.fotos.length
            ? item.fotos
            : item.foto
              ? [item.foto]
              : [];
          const fotos = fotosRaw.map(absImg).filter(Boolean);
          const imagem = fotos[0] || absImg(item.foto) || "";
          if (!imagem) continue; // Google exige image_link

          const disponivel =
            item.disponivel === "Sim" || item.disponivel === true || Number(item.total_estoque) > 0
              ? "in_stock"
              : "out_of_stock";

          const isRoupas = line === "roupas" || item.fonte === "roupas";
          const title = isRoupas
            ? `${item.nome}${cat ? " - " + cat : ""}`
            : `${item.nome}${item.volume && item.volume !== "—" ? " " + item.volume : ""}`.trim();

          let description = (item.notas || item.nome || title).trim();
          if (description.length > 4900) description = description.slice(0, 4900);

          const extraImages = fotos
            .slice(1, 11)
            .map(
              (src) =>
                `      <g:additional_image_link><![CDATA[${src}]]></g:additional_image_link>`
            )
            .join("\n");

          const productType = isRoupas
            ? `Roupas > ${cat || "Moda"}`
            : `Perfumes > ${cat || line || "Geral"}`;

          feedItems.push(`    <item>
      <g:id><![CDATA[${escapeCdata(id)}]]></g:id>
      <g:title><![CDATA[${escapeCdata(title)}]]></g:title>
      <g:description><![CDATA[${escapeCdata(description)}]]></g:description>
      <g:link><![CDATA[${link}]]></g:link>
      <g:image_link><![CDATA[${imagem}]]></g:image_link>
${extraImages}
      <g:availability><![CDATA[${disponivel}]]></g:availability>
      <g:price>${preco.toFixed(2)} BRL</g:price>
      <g:brand><![CDATA[${escapeCdata(brand)}]]></g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>false</g:identifier_exists>
      <g:product_type><![CDATA[${escapeCdata(productType)}]]></g:product_type>
      <g:google_product_category>${isRoupas ? "166" : "297"}</g:google_product_category>
    </item>`);
        }
      }
    }

    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title><![CDATA[Empório A.R - Catálogo]]></title>
    <link>${BASE_URL}</link>
    <description><![CDATA[Catálogo Empório A.R — perfumes e roupas. Preços de varejo e atacado.]]></description>
${feedItems.join("\n")}
  </channel>
</rss>`;

    return new Response(feedXml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error><![CDATA[${String(error.message || error)}]]></error>`,
      {
        status: 500,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      }
    );
  }
};
