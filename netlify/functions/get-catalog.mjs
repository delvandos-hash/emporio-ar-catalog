/**
 * API /api/catalogo — busca o catálogo no Gist atual
 */
export default async (req, context) => {
  const gistRawUrl =
    "https://gist.githubusercontent.com/delvandos-hash/11918b7196b3ee6a0d8a91739167b312/raw/catalogo.json";

  try {
    const response = await fetch(gistRawUrl, {
      headers: { "User-Agent": "EmporioAR-Catalog/1.0" }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          erro: "Falha ao buscar no Gist",
          status: response.status,
          statusText: response.statusText
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        erro: "Falha inesperada",
        mensagem: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
};
