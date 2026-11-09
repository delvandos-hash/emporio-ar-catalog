import { readFileSync } from "node:fs";

const IMARAT_API = process.env.IMARAT_API_URL;
const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";
const GIST_TOKEN = process.env.GIST_TOKEN;
if (!IMARAT_API) throw new Error("IMARAT_API_URL não configurado.");
if (!GIST_TOKEN) throw new Error("GIST_TOKEN não configurado.");

const norm = (s) => String(s || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/['’]s\b/gi, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

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
  let raw=String(sizeMl||"").trim();
  if(raw && /^\d+(?:[.,]\d+)?$/.test(raw)) raw += "ml";
  const explicit=raw.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  const fromName=String(nome||"").match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  const m=explicit||fromName;
  return m ? String(Number(m[1].replace(",", ".")))+m[2].toLowerCase() : "—";
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
async function fetchLiveCatalog() {
  const headers={
    Authorization:`Bearer ${GIST_TOKEN}`,
    Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"EmporioAR-All-Products-Audit/2.1"
  };
  const response=await fetch(`https://api.github.com/gists/${GIST_ID}`,{headers});
  if(!response.ok) throw new Error(`Falha ao ler Gist: HTTP ${response.status}`);
  const gist=await response.json();
  const file=gist.files?.["catalogo.json"];
  if(!file) throw new Error("Gist não contém catalogo.json.");
  let raw=file.content;
  if(file.truncated||!raw) {
    if(!file.raw_url) throw new Error("Gist truncado e sem raw_url.");
    const rawResponse=await fetch(file.raw_url,{headers});
    if(!rawResponse.ok) throw new Error(`Falha ao baixar snapshot: HTTP ${rawResponse.status}`);
    raw=await rawResponse.text();
  }
  if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1);
  const snapshot=JSON.parse(raw);
  const DATA=snapshot.DATA||snapshot;
  if(!DATA||typeof DATA!=="object"||Array.isArray(DATA)) throw new Error("Estrutura DATA inválida no Gist.");
  return DATA;
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

const onlyYouMiniKey=miniIdentityKey("Only You","Mini Marshmellow","30ml");
const armafMiniKey=miniIdentityKey("Armaf","Mini Marshmellow","30ml");
if(onlyYouMiniKey===armafMiniKey) throw new Error("Colisão indevida: marcas diferentes não podem compartilhar a chave de miniatura.");
if(onlyYouMiniKey!==miniIdentityKey("ONLY YOU","Mini Marshmellow","30ml")) throw new Error("Normalização de marca inconsistente na chave de miniatura.");
if(onlyYouMiniKey===miniIdentityKey("Only You","Mini Marshmellow","15ml")) throw new Error("Volumes diferentes não podem compartilhar a chave de miniatura.");

const INTERNAL_DATA=parseInternalData();
const internalIndex=new Map();
for(const [line,groups] of Object.entries(INTERNAL_DATA)) {
  if(!Array.isArray(groups)) continue;
  for(const group of groups) for(const item of (Array.isArray(group?.items)?group.items:[])) {
    const key=[norm(line),norm(group.brand),norm(item.nome),volumeFrom(item.volume,item.nome)].join("|");
    if(!internalIndex.has(key)) internalIndex.set(key,[]);
    internalIndex.get(key).push(item);
  }
}
const DATA=await fetchLiveCatalog();
const catalog=[];
for(const [line,groups] of Object.entries(DATA)) {
  if(!Array.isArray(groups)) continue;
  for(const group of groups) for(const item of (Array.isArray(group?.items)?group.items:[])) {
    const name=String(item.nome||"").trim();
    if(!name) continue;
    const volume=String(item.volume||volumeFrom(null,name));
    const internalKey=[norm(line),norm(group.brand),norm(name),volumeFrom(volume,name)].join("|");
    const internal=internalIndex.get(internalKey)?.[0];
    catalog.push({
      line,brand:String(group.brand||"Sem marca"),category:String(group.cat||"Sem categoria"),
      name,volume,retail:item.varejo??"",wholesale:item.atacado??"",
      source:"",originId:"",manual:internal?.precoManual??false,
      key:syncKey(name,volume,group.cat),item
    });
  }
}
const {all:source,total,pages}=await fetchAllImarat();
function volumeCompatible(left,right) {
  return left==="—" || right==="—" || !left || !right || left===right;
}
function sourceTitleKey(name,category,brand) {
  const cat=norm(category);
  let key=limparParaComparacao(name);
  if(cat.includes("miniatura")) key=chaveComparacaoMini(name);
  if(cat.includes("oleo")) key=key.replace(/^oleo\\s+/,"");
  if(norm(brand)==="arabiyat") key=key.replace(/^prestige\\s+/,"");
  return key;
}
function sourceBrandMatches(catalogBrand,sourceBrand) {
  const b=norm(catalogBrand), s=norm(sourceBrand);
  if(b==="arabiyat" && s.includes("arabiyat prestige")) return true;
  if(b==="emporio a r" && s==="imarat") return true;
  if(b==="outros" || b==="outra") return !s;
  return Boolean(b && s && b===s);
}
function matchSourceForCatalog(item) {
  const itemVolume=volumeFrom(item.volume,item.name);
  const itemKey=sourceTitleKey(item.name,item.category,item.brand);
  const generic=["outros","outra"].includes(norm(item.brand));
  const candidates=source.filter(p=>{
    if(!sourceBrandMatches(item.brand,p.brand)) return false;
    const sourceVolume=volumeFrom(p.sizeMl,p.name);
    if(!volumeCompatible(itemVolume,sourceVolume)) return false;
    const sourceKey=sourceTitleKey(p.name,p.categoria_nome||p.categoria||item.category,p.brand);
    return itemKey && itemKey===sourceKey;
  });
  if(generic) {
    const exact=candidates.filter(p=>norm(p.name)===norm(item.name));
    return exact.length===1 ? exact[0] : null;
  }
  return candidates.length===1 ? candidates[0] : null;
}
function sourceIdentity(p) {
  const id=String(p.id||p.productId||"").trim();
  if(id) return "id|"+id;
  const slug=String(p.slug||"").trim();
  if(slug) return "slug|"+slug;
  return "key|"+norm(p.brand)+"|"+sourceTitleKey(p.name,p.categoria_nome||p.categoria,p.brand)+"|"+volumeFrom(p.sizeMl,p.name);
}
function miniIdentityKey(brand,name,volume) {
  return "mini|"+norm(brand||"outros")+"|"+chaveComparacaoMini(name)+"|"+volumeFrom(volume,name);
}
function apiDuplicateKey(p) {
  const name=String(p.name||"").trim();
  const volume=volumeFrom(p.sizeMl,name);
  const category=p.categoria_nome||p.categoria||"";
  const mini=isMiniatura(name,volume,category)&&!isOleo(name);
  return mini
    ? miniIdentityKey(p.brand,name,volume)
    : "normal|"+norm(p.brand||"outros")+"|"+limparParaComparacao(name)+"|"+volume;
}
const matchedCatalog=catalog.map(item=>({...item,matchedSource:matchSourceForCatalog(item)}));
const catalogByKey=new Map();
for(const item of matchedCatalog) add(catalogByKey,item.key,item);
const catalogCollisionGroups=[...catalogByKey].filter(([,items])=>items.length>1);
const apiByKey=new Map();
for(const p of source) {
  const name=String(p.name||"").trim();
  if(!name) continue;
  add(apiByKey,apiDuplicateKey(p),{
    name,brand:String(p.brand||"Sem marca"),volume:volumeFrom(p.sizeMl,name),
    category:String(p.categoria_nome||p.categoria||"Sem categoria"),
    slug:String(p.slug||""),id:String(p.id||p.productId||"")
  });
}
const apiDuplicateGroups=[...apiByKey].filter(([,items])=>items.length>1);
const catalogBySourceIdentity=new Map();
for(const item of matchedCatalog) {
  if(!item.matchedSource) continue;
  const identity=sourceIdentity(item.matchedSource);
  if(!catalogBySourceIdentity.has(identity)) catalogBySourceIdentity.set(identity,[]);
  catalogBySourceIdentity.get(identity).push(item);
}
const confirmedNormalDuplicates=[...catalogBySourceIdentity].filter(([,items])=>items.length>1);
const miniGlobalGroups=new Map();
for(const item of matchedCatalog) {
  if(!item.matchedSource) continue;
  if(!isMiniatura(item.name,item.volume,item.category)||isOleo(item.name)) continue;
  const key=miniIdentityKey(item.brand,item.name,item.volume);
  if(!miniGlobalGroups.has(key)) miniGlobalGroups.set(key,[]);
  miniGlobalGroups.get(key).push(item);
}
const confirmedMiniDuplicates=[...miniGlobalGroups].filter(([,items])=>items.length>1);
const sourceDistinctCollisions=catalogCollisionGroups.filter(([,items])=>{
  const matched=items.filter(x=>x.matchedSource);
  if(matched.length<2) return false;
  const identities=new Set(matched.map(x=>sourceIdentity(x.matchedSource)));
  return identities.size>1;
});
const unconfirmedNameCollisions=catalogCollisionGroups.filter(([,items])=>
  items.filter(x=>x.matchedSource).length<2
);
const categoryMismatches=matchedCatalog.filter(x=>{
  if(!x.matchedSource) return false;
  const sourceCategory=String(x.matchedSource.categoria_nome||x.matchedSource.categoria||"").trim();
  return Boolean(sourceCategory) && norm(x.category)!==norm(sourceCategory);
});
// Simula, em memória, a ordem de importação da Imarat usando as mesmas chaves
// e as mesmas atualizações de índice de sync-catalog.mjs. Não altera DATA/Gist.
const normalIndex=new Set();
const miniIndex=new Set();
for(const item of catalog) {
  normalIndex.add(limparParaComparacao(item.name));
  normalIndex.add(`${limparParaComparacao(item.name)}|${norm(item.brand)}`);
  if(isMiniatura(item.name,item.volume,item.category)&&!isOleo(item.name))
    miniIndex.add(miniIdentityKey(item.brand,item.name,item.volume));
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
  const miniIdentity=miniIdentityKey(brand,name,volume);
  const duplicate=mini
    ? miniIndex.has(miniIdentity)
    : (normalIndex.has(`${normalKey}|${norm(brand)}`)||normalIndex.has(normalKey));
  if(duplicate) {
    const entry={name,brand,volume,key:mini?`mini|${norm(brand)}|${miniKey}|${volume}`:`normal|${normalKey}`};
    const existedBefore=mini?initialMiniIndex.has(miniKey):initialNormalIndex.has(normalKey);
    (existedBefore?blockedByCatalog:blockedWithinImarat).push(entry);
    continue;
  }
  simulatedNew.push({name,brand,volume,key:mini?`mini|${norm(brand)}|${miniKey}|${volume}`:`normal|${normalKey}`});
  normalIndex.add(normalKey);
  normalIndex.add(`${normalKey}|${norm(brand)}`);
  if(mini) {
    miniIndex.add([norm(brand),miniKey,volume].join("|"));
  }
}
console.log("AUDITORIA GLOBAL DE DUPLICIDADE — IMARAT (SOMENTE LEITURA)");
console.log(`Produtos recebidos da API: ${source.length} | total informado: ${total||"não informado"} | páginas: ${pages}`);
console.log(`Itens do catálogo com correspondência segura por marca/nome/volume: ${matchedCatalog.filter(x=>x.matchedSource).length}`);
console.log(`Duplicidades normais confirmadas pelo mesmo produto da origem: ${confirmedNormalDuplicates.length}`);
console.log(`Duplicidades de miniaturas confirmadas pela regra global: ${confirmedMiniDuplicates.length}`);
console.log(`Colisões de nome/chave no catálogo sem confirmação de duplicidade: ${unconfirmedNameCollisions.length}`);
console.log(`Colisões entre produtos distintos da origem (mesma chave global): ${sourceDistinctCollisions.length}`);
console.log(`Itens com categoria diferente da categoria da origem: ${categoryMismatches.length}`);
console.log(`Grupos duplicados na própria API por identidade de produto: ${apiDuplicateGroups.length}`);

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
for(const [identity,items] of confirmedNormalDuplicates) {
  console.log("DUPLICIDADE NORMAL CONFIRMADA "+identity);
  for(const x of items) console.log(JSON.stringify({
    linha:x.line,marca:x.brand,categoria:x.category,nome:x.name,volume:x.volume,
    varejo:x.retail,atacado:x.wholesale,marcaOrigem:x.matchedSource.brand||"sem marca",
    categoriaOrigem:x.matchedSource.categoria_nome||x.matchedSource.categoria||"não informada",
    generoOrigem:x.matchedSource.gender||x.matchedSource.genero||"não informado",
    idOrigem:x.matchedSource.id||x.matchedSource.productId||x.matchedSource.slug||"sem id"
  }));
}
for(const [key,items] of confirmedMiniDuplicates) {
  console.log("DUPLICIDADE GLOBAL DE MINIATURA CONFIRMADA "+key);
  for(const x of items) console.log(JSON.stringify({
    linha:x.line,marca:x.brand,categoria:x.category,nome:x.name,volume:x.volume,
    marcaOrigem:x.matchedSource.brand||"sem marca",
    idOrigem:x.matchedSource.id||x.matchedSource.productId||x.matchedSource.slug||"sem id"
  }));
}
for(const [key,items] of unconfirmedNameCollisions) {
  console.log("COLISÃO DE NOME/CHAVE SEM DUPLICIDADE CONFIRMADA "+key);
  for(const x of items) console.log(JSON.stringify({
    linha:x.line,marca:x.brand,categoria:x.category,nome:x.name,volume:x.volume,
    correspondenciaImarat:Boolean(x.matchedSource),marcaOrigem:x.matchedSource?.brand||"sem correspondência"
  }));
}
for(const [key,items] of sourceDistinctCollisions) {
  console.log("MESMA CHAVE, PRODUTOS DISTINTOS NA ORIGEM "+key);
  for(const x of items) console.log(JSON.stringify({
    linha:x.line,marca:x.brand,categoria:x.category,nome:x.name,volume:x.volume,
    marcaOrigem:x.matchedSource?.brand||"sem marca",
    idOrigem:x.matchedSource?.id||x.matchedSource?.productId||x.matchedSource?.slug||"sem id"
  }));
}
for(const x of categoryMismatches) console.log("CATEGORIA DIVERGENTE "+JSON.stringify({
  linha:x.line,marca:x.brand,nome:x.name,volume:x.volume,
  categoriaCatalogo:x.category,categoriaOrigem:x.matchedSource.categoria_nome||x.matchedSource.categoria||"não informada",
  generoOrigem:x.matchedSource.gender||x.matchedSource.genero||"não informado",
  marcaOrigem:x.matchedSource.brand||"sem marca",
  idOrigem:x.matchedSource.id||x.matchedSource.productId||x.matchedSource.slug||"sem id"
}));
for(const [key,items] of apiDuplicateGroups) {
  console.log("DUPLICIDADE NA API "+key);
  for(const x of items) console.log(JSON.stringify(x));
}
console.log("AUDITORIA CONCLUÍDA: nenhuma exclusão, alteração de preço ou gravação no Gist foi realizada.");
