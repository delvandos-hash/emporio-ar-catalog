import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  // Conecta ao mesmo "balde" que o robô usou
  const store = getStore("catalogo");
  
  // Tenta pegar os dados salvos
  const data = await store.get("catalogo_completo", { type: "json" });
  
  // Se os dados não existirem ainda, retorna um objeto vazio
  // para o site não quebrar
  if (!data) {
    return new Response(JSON.stringify({ 
      DATA: {}, 
      WHATSAPP: "",
      BRAND: {},
      erro: "Nenhum dado encontrado no Blobs ainda." 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  // Devolve os dados para o site
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
};
