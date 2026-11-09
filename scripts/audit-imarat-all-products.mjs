import { readFileSync } from "node:fs";

const IMARAT_API = process.env.IMARAT_API_URL;
if (!IMARAT_API) throw new Error("IMARAT_API_URL não configurado.");

const norm = (s) => String(s || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

// Espelha literalmente as funções de comparação do sync-catalog.mjs.
function limparParaComparacao(s) {
  return norm(s).replace(/\s*\d+\s*(ml|g)\b/gi, "").replace(/\s+/g, " ").trim();
}
const PREFIXOS_MINI_IMARAT = ["mini armaf", "miniatura armaf", "miniatura", "mini"];
const MARCAS_NO_NOME_MINI = [
  "armaf", "lattafa", "orientica", "afeer", "clive dorris",
  "french avenue", "maison alhambra", "al wataniah", "only you", "mais you", "meryam",
];
function removerPrefixosMini(s) {
  let resultado = norm(s);
  for (const prefixo of [...PREFIXOS_MINI_IMARAT].sort((a,b)=>b.length-a.length)) {
    const p=norm(prefixo);
    if (resultado.startsWith(p+" ")) resultado=resultado.slice(p.length).trim();
    else if (resultado===p) resultado="";
  }
  return resultado;
}
function removerMarcaDoNome(s) {
  let resultado=norm(s);
  for (const marca of [...MARCAS_NO_NOME_MINI].sort((a,b)=>b.length-a.length)) {
    const m=norm(marca);
    if (resultado.startsWith(m+" ")) resultado=resultado.slice(m.length).trim();
    if (resultado.endsWith(" "+m)) resultado=resultado.slice(0,-(m.length+1)).trim();
  }
  return resultado;
}
function chaveComparacaoMini(nome) {
  return removerMarcaDoNome(removerPrefixosMini(limparParaComparacao(nome)));
}
function isOleo(nome) {
  const n=norm(nome);
  return n.startsWith("oleo") || n.includes(" oleo ");
}
function volumeFrom(sizeMl,nome) {
  if (sizeMl) return String(sizeMl)+"ml";
  const m=String(nome||"").toUpperCase().match(/(\d+(?:[.,]\d+)?)\s*ML\b/);
  if(m) return m[1].replace(",",".")+"ml";
  const g=String(nome||"").toUpperCase().match(/(\d+)\s*G\b/);
  if(g) return g[1]+"g";
  return "—";
}
function isMiniatura(nome,volume,categoria) {
  const n=norm(nome), cat=norm(categoria||"");
  if(n.includes("mini ")||n.includes("miniatura")||n.includes("mini-")) return true;
  if(cat.includes("miniatura")) return true;
  if(volume) {
    const v=Number.parseFloat(String(volume).replace("ml",""));
    if(!Number.isNaN(v)&&v<=50) return true;
  }
  return false;
}
function syncKey(nome,volume,categoria) {
  const mini=isMiniatura(nome,volume,categoria)&&!isOleo(nome);
  const base=mini?chaveComparacaoMini(nome):limparParaComparacao(nome);
  return (mini?"mini|":"normal|")+base;
}
function parseInternalData() {
  const source=readFileSync(new URL("../js/data.js",import.meta.url),"utf8");
  const marker="export const DATA = ";
  const start=source.indexOf(marker);
  const end=source.indexOf(";\nexport const WHATSAPP",start);
  if(start<0||end<0) throw new Error("Não foi possível extrair DATA de js/data.js.");
  return JSON.parse(source.slice(start+marker.length,end));
}
async function fetchAllImarat() {
  const all=[]; let page=1,total=0,fetched=0;
  for(let guard=0;guard<40;guard++) {
    const response=await fetch(`${IMARAT_API}?page=${page}&perPage=60`,{
      headers:{Accept:"application/json","User-Agent":"EmporioAR-All-Products-Audit/2.0"}
    });
    if(!response.ok) throw new Error(`Imarat HTTP ${response.status} na página ${page}`);
    const data=await response.json();
    total=Number(data.total||total);
    const products=Array.isArray(data.products)?data.products:[];
    if(!products.length) break;
    all.push(...products); fetched+=products.length;
    if((total&&fetched>=total)||products.length<60) break;
    page++;
  }
  if(total&&fetched<total) throw new Error(`Paginação incompleta: recebidos ${fetched} de ${total} produtos.`);
  return {all,total,pages:page};
}
function add(map,key,value) {
  if(!key||key.endsWith("|")) return;
  if(!map.has(key)) map.set(key,[]);
  map.get(key).push(value);
}

// Testes de contrato: evitam que a auditoria se afaste da regra real do sincronizador.
const checks=[
  [limparParaComparacao("Perfume Exemplo 100ml"),"perfume exemplo","normalização convencional"],
  [chaveComparacaoMini("Miniatura Lattafa Yara Candy 30ml"),"yara candy","chave miniatura com prefixo/marca"],
  [chaveComparacaoMini("Mini Yara Candy Only You 30ml"),"yara candy","chave miniatura com marca sufixada"],
  [syncKey("Óleo Karseell Cabelo","50ml","Óleos"),"normal|oleo karseell cabelo","óleo não deve entrar na chave de miniatura"],
  [syncKey("Perfume Alfa","100ml","Perfumes"),"normal|perfume alfa","produto convencional"],
  [syncKey("Miniatura Alfa","30ml","Miniaturas"),"mini|alfa","produto miniatura"],
];
for(const [actual,expected,label] of checks) {
  if(actual!==expected) throw new Error(`Falha no teste ${label}: esperado "${expected}", recebido "${actual}"`);
}

const DATA=parseInternalData();
const catalog=[];
for(const [line,groups] of Object.entries(DATA)) {
  if(!Array.isArray(groups)) continue;
  for(const group of groups) for(const item of (Array.isArray(group?.items)?group.items:[])) {
    const name=String(item.nome||"").trim();
    if(!name) continue;
    const volume=String(item.volume||volumeFrom(null,name));
    catalog.push({
      line,brand:String(group.brand||"Sem marca"),category:String(group.cat||"Sem categoria"),
      name,volume,retail:item.varejo??"",wholesale:item.atacado??"",
      source:String(item.fonte||""),originId:String(item.id_origem||""),
      manual:item.precoManual??false,
      key:syncKey(name,volume,group.cat),item
    });
  }
}
const {all:source,total,pages}=await fetchAllImarat();
const imaratNameSet = new Set(source.map(p => norm(p.name)).filter(Boolean));
const unmatchedCandidates = catalog.filter(x =>
  ["perfumes","miniaturas","oleos"].includes(norm(x.category)) &&
  !imaratNameSet.has(norm(x.name)) &&
  x.source.toLowerCase() !== "imarat"
);
console.log("AUDITORIA DE PROCEDÊNCIA DOS TÍTULOS NÃO LOCALIZADOS NA IMARAT: "+unmatchedCandidates.length);
for (const x of unmatchedCandidates) {
  const imageValues = [x.item?.foto, ...(Array.isArray(x.item?.fotos) ? x.item.fotos : [])].filter(Boolean);
  const imageInfo = imageValues.map(value => {
    const raw = String(value);
    const match = raw.match(/[?&]source=([^&]+)/i);
    let host = "";
    try { host = new URL(raw, "https://catalogoemporio.netlify.app").hostname; } catch {}
    return { source: match?.[1] || "", host, prefix: raw.slice(0, 110) };
  });
  console.log("ORIGEM NÃO CONFIRMADA "+JSON.stringify({
    nome:x.name, marca:x.brand, categoria:x.category, fonte:x.source||"",
    id_origem:x.originId||"", campos:Object.keys(x.item||{}), imagens:imageInfo
  }));
}
const catalogByKey=new Map();
for(const item of catalog) add(catalogByKey,item.key,item);
const apiByKey=new Map();
for(const p of source) {
  const name=String(p.name||"").trim();
  if(!name) continue;
  const volume=volumeFrom(p.sizeMl,name);
  const category=p.categoria_nome||p.categoria||"";
  const key=syncKey(name,volume,category);
  add(apiByKey,key,{
    name,brand:String(p.brand||"Sem marca"),volume,slug:String(p.slug||""),
    id:String(p.id||p.productId||"")
  });
}
const catalogDuplicateGroups=[...catalogByKey].filter(([,items])=>items.length>1);
const apiDuplicateGroups=[...apiByKey].filter(([,items])=>items.length>1);
const imaratKeys=new Set(apiByKey.keys());
const imaratDuplicateGroups=catalogDuplicateGroups.filter(([key,items])=>
  imaratKeys.has(key)||items.some(x=>x.source.toLowerCase()==="imarat"||x.originId)
);
// Simula, em memória, a ordem de importação da Imarat usando as mesmas chaves
// e as mesmas atualizações de índice de sync-catalog.mjs. Não altera DATA/Gist.
const normalIndex=new Set();
const miniIndex=new Set();
for(const item of catalog) {
  normalIndex.add(limparParaComparacao(item.name));
  normalIndex.add(`${limparParaComparacao(item.name)}|${norm(item.brand)}`);
  if(isMiniatura(item.name,item.volume,item.category)&&!isOleo(item.name))
    miniIndex.add(chaveComparacaoMini(item.name));
}
const initialNormalIndex=new Set(normalIndex);
const initialMiniIndex=new Set(miniIndex);
const simulatedNew=[];
const blockedByCatalog=[];
const blockedWithinImarat=[];
for(const p of source) {
  const name=String(p.name||"").trim();
  if(!name) continue;
  const volume=volumeFrom(p.sizeMl,name);
  const category=p.categoria_nome||p.categoria||"";
  const brand=String(p.brand||"Outros").toUpperCase();
  const mini=isMiniatura(name,volume,category)&&!isOleo(name);
  const normalKey=limparParaComparacao(name);
  const miniKey=chaveComparacaoMini(name);
  const duplicate=mini
    ? (miniIndex.has(miniKey)||miniIndex.has(`${miniKey}|${norm(brand)}`)
      ||miniIndex.has(`${miniKey}|armaf`)||miniIndex.has(`${miniKey}|outros`)||miniIndex.has(`${miniKey}|outra`))
    : (normalIndex.has(`${normalKey}|${norm(brand)}`)||normalIndex.has(normalKey));
  if(duplicate) {
    const entry={name,brand,volume,key:mini?`mini|${miniKey}`:`normal|${normalKey}`};
    const existedBefore=mini?initialMiniIndex.has(miniKey):initialNormalIndex.has(normalKey);
    (existedBefore?blockedByCatalog:blockedWithinImarat).push(entry);
    continue;
  }
  simulatedNew.push({name,brand,volume,key:mini?`mini|${miniKey}`:`normal|${normalKey}`});
  normalIndex.add(normalKey);
  normalIndex.add(`${normalKey}|${norm(brand)}`);
  if(mini) {
    miniIndex.add(miniKey);
    miniIndex.add(`${miniKey}|${norm(brand)}`);
  }
}
console.log("AUDITORIA GLOBAL DE DUPLICIDADE — IMARAT (SOMENTE LEITURA)");
console.log(`Produtos recebidos da API: ${source.length} | total informado: ${total||"não informado"} | páginas: ${pages}`);
console.log(`Grupos de colisão de chave no catálogo (2+ itens para chave Imarat): ${imaratDuplicateGroups.length}`);
console.log(`Grupos duplicados na própria API Imarat: ${apiDuplicateGroups.length}`);

console.log(`Simulação do sincronizador: ${simulatedNew.length} novos produtos únicos | ${blockedByCatalog.length} bloqueados pelo catálogo atual | ${blockedWithinImarat.length} bloqueados por repetição na própria lista Imarat`);
if(new Set(simulatedNew.map(x=>x.key)).size!==simulatedNew.length) throw new Error("Simulação detectou chave duplicada entre novos produtos: regra global falhou.");
const imaratSourceCatalog=catalog.filter(x=>x.source.toLowerCase()==="imarat");
const repeatedOriginIds=[...new Set(imaratSourceCatalog.filter(x=>x.originId).map(x=>x.originId))]
  .filter(id=>imaratSourceCatalog.filter(x=>x.originId===id).length>1);
console.log(`IDs de origem repetidos em itens com fonte Imarat declarada: ${repeatedOriginIds.length}`);
for(const id of repeatedOriginIds) {
  console.log("ID DE ORIGEM REPETIDO "+id);
  for(const x of imaratSourceCatalog.filter(item=>item.originId===id))
    console.log(JSON.stringify({linha:x.line,marca:x.brand,categoria:x.category,nome:x.name,volume:x.volume,fonte:x.source||"não informada"}));
}
for(const [key,items] of imaratDuplicateGroups) {
  console.log("COLISÃO DE CHAVE NO CATÁLOGO "+key);
  for(const x of items) console.log(JSON.stringify({
    linha:x.line,marca:x.brand,categoria:x.category,nome:x.name,volume:x.volume,
    varejo:x.retail,atacado:x.wholesale,fonte:x.source||"não informada",
    id_origem:x.originId||"não informado",precoManual:x.manual
  }));
}
for(const [key,items] of apiDuplicateGroups) {
  console.log("DUPLICIDADE NA API "+key);
  for(const x of items) console.log(JSON.stringify(x));
}
console.log("AUDITORIA CONCLUÍDA: nenhuma exclusão, alteração de preço ou gravação no Gist foi realizada.");
