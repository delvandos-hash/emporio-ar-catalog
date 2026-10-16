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

    for (const line of Object.keys(DATA)) {
      for (const g of DATA[line]) {
        for (const item of g.items) {
          const preco = parseFloat(String(item.varejo).replace('.', '').replace(',', '.')) || 0;
          const id = `${normId(g.brand)}-${normId(item.nome)}-${normId(item.volume)}`;
          
          const link = `${baseUrl}/#${id}`;
          const imagem = item.foto || '';
          const disponibilidade = item.disponivel === 'Sim' ? 'in_stock' : 'out_of_stock';
          
          feedItems.push(`    <item>
      <g:id><![CDATA[${id}]]></g:id>
      <g:title><![CDATA[${item.nome} ${item.volume}]]></g:title>
      <g:description><![CDATA[${(item.notas || item.nome).slice(0, 4900)}]]></g:description>
      <g:link><![CDATA[${link}]]></g:link>
      <g:image_link><![CDATA[${imagem}]]></g:image_link>
      <g:availability><![CDATA[${disponibilidade}]]></g:availability>
      <g:price>${preco.toFixed(2)} BRL</g:price>
      <g:brand><![CDATA[${g.brand}]]></g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
    </item>`);
        }
      }
    }

    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title><![CDATA[Empório A.R - Catálogo]]></title>
    <link>${baseUrl}</link>
    <description><![CDATA[Catálogo de perfumes Empório A.R]]></description>
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
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><error><![CDATA[${error.message}]]></error>`, {
      status: 500,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }
};
