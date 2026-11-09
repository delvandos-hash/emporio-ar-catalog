import { readFileSync } from "node:fs";

const IMARAT_API = process.env.IMARAT_API_URL;
if (!IMARAT_API) throw new Error("IMARAT_API_URL não configurado.");

const norm = (value) => String(value || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const cleanName = (value) => norm(value).replace(/\s*\d+(?:[.,]\d+)?\s*(ml|g)\b/gi, "").replace(/\s+/g, " ").trim();
const miniBrands = ["armaf","lattafa","orientica","afeer","clive dorris","french avenue","maison alhambra","al wataniah","only you","mais you","meryam"];
function isOil(name) { const n=norm(name); return n.startsWith("oleo") || n.includes(" oleo "); }
function volumeOf(item) {
  const explicit=String(item?.volume || "").trim();
  if (explicit && explicit !== "—") return norm(explicit).replaceAll(" ","");
  const m=String(item?.nome || item?.name || "").match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  return m ? norm(m[1].replace(",",".")+m[2]) : "sem-volume";
}
function isMini(item, group) {
  const name=norm(item?.nome || item?.name);
  const category=norm(group?.cat || item?.categoria_nome || item?.categoria);
  const volume=volumeOf(item);
  const ml=Number.parseFloat(volume);
  return !isOil(name) && (name.includes("mini ") || name.includes("miniatura") || name.includes("mini-")
    || category.includes("miniatura") || (volume !== "sem-volume" && volume.endsWith("ml") && Number.isFinite(ml) && ml <= 50));
}
function miniKey(name) {
  let value=cleanName(name);
  for (const prefix of ["miniatura armaf","mini armaf","miniatura","mini"]) {
    if (value.startsWith(prefix+" ")) { value=value.slice(prefix.length).trim(); break; }
    if (value===prefix) { value=""; break; }
  }
  for (const brand of [...miniBrands].sort((a,b)=>b.length-a.length)) {
    if (value.startsWith(brand+" ")) value=value.slice(brand.length).trim();
    if (value.endsWith(" "+brand)) value=value.slice(0,-brand.length-1).trim();
  }
  return value;
}
function keyFor(item, group) {
  const name=item?.nome || item?.name || "";
  return isMini(item,group) ? "mini|"+miniKey(name) : "normal|"+cleanName(name);
}
function parseInternalData() {
  const source=readFileSync(new URL("../js/data.js",import.meta.url),"utf8");
  const marker="export const DATA = ";
  const start=source.indexOf(marker);
  const end=source.indexOf(";\nexport const WHATSAPP",start);
  if(start<0 || end<0) throw new Error("Não foi possível extrair DATA de js/data.js.");
  return JSON.parse(source.slice(start+marker.length,end));
}
async function fetchAllImarat() {
  const all=[]; let page=1,total=0,fetched=0;
  for(let guard=0;guard<40;guard++) {
    const response=await fetch(`${IMARAT_API}?page=${page}&perPage=60`,{headers:{Accept:"application/json", "User-Agent":"EmporioAR-All-Products-Audit/1.0"}});
    if(!response.ok) throw new Error(`Imarat HTTP ${response.status} na página ${page}`);
    const data=await response.json(); total=Number(data.total||total);
    const products=Array.isArray(data.products)?data.products:[];
    if(!products.length) break;
    all.push(...products); fetched+=products.length;
    if((total && fetched>=total)||products.length<60) break;
    page++;
  }
  return {all,total,pages:page};
}
const DATA=parseInternalData();
const catalog=[];
for(const [line,groups] of Object.entries(DATA)) {
  if(!Array.isArray(groups)) continue;
  for(const group of groups) for(const item of (Array.isArray(group?.items)?group.items:[])) {
    catalog.push({line,brand:String(group.brand||"Sem marca"),category:String(group.cat||"Sem categoria"),
      name:String(item.nome||""),volume:volumeOf(item),retail:item.varejo??"",wholesale:item.atacado??"",
      source:String(item.fonte||"não identificado"),originId:item.id_origem??"",manual:item.precoManual??false,
      key:keyFor(item,group),item});
  }
}
const {all:source,total,pages}=await fetchAllImarat();
const sourceNames=new Map();
for(const p of source) {
  const k=cleanName(p.name);
  if(!sourceNames.has(k)) sourceNames.set(k,[]);
  sourceNames.get(k).push(p);
}
const imaratCatalog=catalog.filter(r=>r.source==="imarat" || (sourceNames.get(cleanName(r.name))||[]).some(p=>{
  const a=norm(p.brand),b=norm(r.brand);
  return !a || !b || a===b || a.includes(b) || b.includes(a);
}));
const byKey=new Map();
for(const r of catalog) {
  if(!byKey.has(r.key)) byKey.set(r.key,[]);
  byKey.get(r.key).push(r);
}
const catalogDuplicateGroups=[...byKey.entries()].filter(([,items])=>items.length>1);
const imaratDuplicateGroups=catalogDuplicateGroups.filter(([,items])=>items.some(x=>imaratCatalog.includes(x)));
const byApiKey=new Map();
for(const p of source) {
  const g={cat:p.categoria_nome||p.categoria||""};
  const key=keyFor({name:p.name,volume:p.sizeMl?String(p.sizeMl)+"ml":""},g);
  if(!byApiKey.has(key)) byApiKey.set(key,[]);
  byApiKey.get(key).push({name:p.name,brand:p.brand||"Sem marca",volume:p.sizeMl||"—",slug:p.slug||""});
}
const apiDuplicateGroups=[...byApiKey.entries()].filter(([,items])=>items.length>1);
const catalogByKey=byKey;
const apiAlreadyPresent=source.filter(p=>{
  const group={cat:p.categoria_nome||p.categoria||""};
  const key=keyFor({name:p.name,volume:p.sizeMl?String(p.sizeMl)+"ml":""},group);
  return catalogByKey.has(key);
});
console.log("AUDITORIA GLOBAL DE DUPLICIDADE — IMARAT (SOMENTE LEITURA)");
console.log(`Produtos informados pela API: ${source.length} | total informado: ${total||"não informado"} | páginas consultadas: ${pages}`);
console.log(`Produtos do catálogo identificados como origem Imarat: ${imaratCatalog.length}`);
console.log(`Grupos duplicados no catálogo que envolvem ao menos um produto Imarat: ${imaratDuplicateGroups.length}`);
console.log(`Grupos duplicados dentro da própria listagem da Imarat: ${apiDuplicateGroups.length}`);
console.log(`Produtos da API cuja chave já existe no catálogo (bloqueio esperado): ${apiAlreadyPresent.length}`);
for(const [key,items] of imaratDuplicateGroups) {
  console.log("DUPLICIDADE NO CATÁLOGO "+key);
  for(const x of items) console.log(JSON.stringify({line:x.line,brand:x.brand,category:x.category,name:x.name,volume:x.volume,varejo:x.retail,atacado:x.wholesale,fonte:x.source,id_origem:x.originId,precoManual:x.manual}));
}
for(const [key,items] of apiDuplicateGroups) {
  console.log("DUPLICIDADE NA API "+key);
  for(const x of items) console.log(JSON.stringify(x));
}
console.log("Nenhum produto foi removido, nenhum preço foi alterado e nenhum Gist foi gravado.");
