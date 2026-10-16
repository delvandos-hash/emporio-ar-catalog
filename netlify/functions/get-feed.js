export default async (req, context) => {
  try {
    const gistRawUrl = "https://gist.githubusercontent.com/delvandos-hash/bac3a717b309d02379455e971c9a9103/raw/catalogo.json";
    
    const response = await fetch(gistRawUrl);
    if (!response.ok) throw new Error('Falha ao buscar dados do Gist');
    
    const data = await response.json();
    const DATA = data.DATA || {};
    
    const baseUrl = 'https://emporioar.netlify.app';
    const feedItems = [];

    function normId(s) {
      return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    function escapeXml(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    }

    for (const line of Object.keys(DATA)) {
      for (const g of DATA[line]) {
        for (const item of g.items) {
          const preco = parseFloat(String(item.varejo).replace('.', '').replace(',', '.')) || 0;
          const id = `${normId(g.brand)}-${normId(item.nome)}-${normId(item.volume)}`;
          const titulo = escapeXml(`${item.nome} ${item.volume}`);
          const descricao = escapeXml((item.notas || item.nome).slice(0, 4900));
          const marca = escapeXml(g.brand);
          
          feedItems.push(`    <item>
      <g:id>${id}</g:id>
      <g:title>${titulo}</g:title>
      <g:description>${descricao}</g:description>
      <g:link>${baseUrl}/#${id}</g:link>
      <g:image_link>${item.foto || ''}</g:image_link>
      <g:availability>${item.disponivel === 'Sim' ? 'in_stock' : 'out_of_stock'}</g:availability>
      <g:price>${preco.toFixed(2)} BRL</g:price>
      <g:brand>${marca}</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
    </item>`);
        }
      }
    }

    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Empório A.R - Catálogo</title>
    <link>${baseUrl}</link>
    <description>Catálogo de perfumes Empório A.R</description>
${feedItems.join('\n')}
  </channel>
</rss>`;

    return new Response(feedXml, {
      status: 200,
      headers: { 
        "Content-Type": "application/xml; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      },
    });
    
  } catch (error) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${error.message}</error>`, {
      status: 500,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }
};
