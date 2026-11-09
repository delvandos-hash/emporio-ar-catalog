import { readFileSync } from "node:fs";

const GIST_ID = "11918b7196b3ee6a0d8a91739167b312";
const token = process.env.GIST_TOKEN;
const IMARAT_API = process.env.IMARAT_API_URL;
if (!token || !IMARAT_API) throw new Error("GIST_TOKEN e IMARAT_API_URL são obrigatórios.");

const norm = value => String(value || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const publicBrand = value => norm(value) === "imarat" ? "emporio a r" : norm(value);
function volume(value, name) {
  const explicit = String(value || "").match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  const fromName = String(name || "").match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  const m = explicit || fromName;
  return m ? String(Number(m[1].replace(",", "."))) + m[2].toLowerCase() : "";
}
function editDistance(a, b) {
  const prev = Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) {
    let diagonal=prev[0]; prev[0]=i;
    for(let j=1;j<=b.length;j++) {
      const above=prev[j];
      prev[j]=Math.min(prev[j]+1,prev[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));
      diagonal=above;
    }
  }
  return prev[b.length];
}
function similarity(a,b) {
  if(!a||!b) return 0;
  return 1-editDistance(a,b)/Math.max(a.length,b.length);
}
function titleKey(name, category) {
  let n=norm(name).replace(/\b\d+(?:[.,]\d+)?\s*(ml|g)\b/g," ").replace(/\s+/g," ").trim();
  if(norm(category).includes("mini")) {
    n=n.replace(/^(miniatura|mini)\s+/,"");
    n=n.replace(/\s+(afeer|only you|lattafa|armaf|meryam|orientica)$/,"");
  }
  return n;
}
async function fetchAllImarat() {
  const all=[]; let page=1,total=0;
  for(let guard=0;guard<40;guard++) {
    const r=await fetch(IMARAT_API+"?page="+page+"&perPage=60",{headers:{Accept:"application/json","User-Agent":"EmporioAR-Title-Audit/1.0"}});
    if(!r.ok) throw new Error("Imarat HTTP "+r.status+" na página "+page);
    const data=await r.json(); total=Number(data.total||total);
    const products=Array.isArray(data.products)?data.products:[];
    if(!products.length) break;
    all.push(...products);
    if((total&&all.length>=total)||products.length<60) break;
    page++;
  }
  if(total&&all.length<total) throw new Error("Paginação incompleta: "+all.length+"/"+total);
  return all;
}
const headers={Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"EmporioAR-Title-Audit/1.0"};
const gr=await fetch("https://api.github.com/gists/"+GIST_ID,{headers});
if(!gr.ok) throw new Error("Gist HTTP "+gr.status);
const gist=await gr.json(); const file=gist.files?.["catalogo.json"];
if(!file) throw new Error("catalogo.json ausente no Gist");
let raw=file.content;
if(file.truncated||!raw) {
  const rr=await fetch(file.raw_url,{headers});
  if(!rr.ok) throw new Error("Snapshot HTTP "+rr.status);
  raw=await rr.text();
}
const snapshot=JSON.parse(raw); const DATA=snapshot.DATA||snapshot;
const api=await fetchAllImarat();
const apiByBrand=new Map();
for(const p of api) {
  const brand=publicBrand(p.brand||"");
  if(!apiByBrand.has(brand)) apiByBrand.set(brand,[]);
  apiByBrand.get(brand).push(p);
}
const exact=[], likely=[], ambiguous=[], noCandidate=[];
let scanned=0;
for(const [line,groups] of Object.entries(DATA)) for(const group of groups||[]) {
  const category=String(group.cat||"");
  if(!["perfumes","miniaturas","oleos"].includes(norm(category))) continue;
  const brand=publicBrand(group.brand||"");
  const candidates=[...(apiByBrand.get(brand)||[])];
  if(brand==="arabiyat") candidates.push(...api.filter(p=>norm(p.brand).includes("arabiyat prestige")));
  if(["outros","outra"].includes(brand)) candidates.push(...api.filter(p=>!norm(p.brand)));
  const unique=[...new Map(candidates.map(p=>[String(p.id||p.slug||p.name),p])).values()];
  for(const item of group.items||[]) {
    const name=String(item.nome||"").trim(); if(!name) continue;
    scanned++;
    const itemVol=volume(item.volume,name);
    const key=titleKey(name,category);
    const scored=unique.filter(p=>{
      const sourceVol=volume(p.sizeMl,p.name);
      return !itemVol||!sourceVol||itemVol===sourceVol;
    }).map(p=>({p,score:similarity(key,titleKey(p.name,category))}))
      .sort((a,b)=>b.score-a.score);
    const best=scored[0], second=scored[1];
    const exactHit=unique.find(p=>norm(p.name)===norm(name));
    const row={line,brand:group.brand||"",category,name,volume:itemVol||"—",
      sourceTitle:exactHit?.name||best?.p?.name||"",
      sourceBrand:exactHit?.brand||best?.p?.brand||"",
      score:exactHit?1:Number((best?.score||0).toFixed(3)),
      secondScore:Number((second?.score||0).toFixed(3)),
      fonte:item.fonte||"não informada"};
    if(exactHit) exact.push(row);
    else if(best?.score>=0.86 && (!second||best.score-second.score>=0.08)) likely.push(row);
    else if(best?.score>=0.68) ambiguous.push(row);
    else noCandidate.push(row);
  }
}
console.log("AUDITORIA DE TÍTULOS IMARAT — COMPARAÇÃO SOMENTE LEITURA");
console.log("Produtos na API raiz: "+api.length);
console.log("Itens do catálogo avaliados nas categorias Imarat: "+scanned);
console.log("Títulos exatos por marca: "+exact.length);
console.log("Possíveis correções de alta confiança (não aplicadas): "+likely.length);
console.log("Correspondências ambíguas para revisão: "+ambiguous.length);
console.log("Sem candidato seguro na marca/volume: "+noCandidate.length);
for(const row of likely) console.log("TÍTULO PROVÁVEL "+JSON.stringify(row));
for(const row of ambiguous) console.log("TÍTULO AMBÍGUO "+JSON.stringify(row));
for(const row of noCandidate) console.log("SEM CORRESPONDÊNCIA "+JSON.stringify(row));
console.log("AUDITORIA CONCLUÍDA: nenhuma alteração, exclusão ou publicação foi realizada.");
