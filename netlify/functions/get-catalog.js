export default async (req, context) => {
  try {
    const gistRawUrl = "https://gist.githubusercontent.com/delvandos-hash/bac3a717b309d02379455e971c9a9103/raw/catalogo.json";
    
    const response = await fetch(gistRawUrl);
    
    if (!response.ok) {
      return new Response(JSON.stringify({
        erro: "Falha ao buscar no Gist",
        status: response.status,
        statusText: response.statusText
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      erro: "Falha inesperada",
      mensagem: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
