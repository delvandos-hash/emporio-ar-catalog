import { readFileSync } from "node:fs";
import { toPublicCatalog } from "./public-catalog.mjs";
import { findExactInternalPriceMatch, findImaratSourceByOriginRef } from "./audit-catalog-match.mjs";

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
function volumeMatch(value,name) {
  let raw=String(value||"").trim();
  if(raw && /^\d+(?:[.,]\d+)?$/.test(raw)) raw += "ml";
  const match=raw.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i)||
    String(name||"").match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
  return match ? String(Number(match[1].replace(",", ".")))+match[2].toLowerCase() : "";
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
function publicFingerprint(item) {
  const photos = Array.isArray(item?.fotos) && item.fotos.length ? item.fotos : (item?.foto ? [item.foto] : []);
  return JSON.stringify({
    nome: norm(item?.nome), volume: volumeMatch(item?.volume,item?.nome),
    varejo: String(item?.varejo ?? "").trim(), atacado: String(item?.atacado ?? "").trim(),
    foto: String(item?.foto ?? "").trim(),
    fotos: [...new Set(photos.map(x=>String(x??"").trim()).filter(Boolean))].sort(),
    notas: String(item?.notas ?? ""), badge: String(item?.badge ?? ""),
    novoDesde: String(item?.novoDesde ?? ""), disponivel: String(item?.disponivel ?? ""),
    variacoes: item?.variacoes || [], stock_ref: String(item?.stock_ref ?? ""),
    stock_route: String(item?.stock_route ?? ""), origin_ref: String(item?.origin_ref ?? "")
  });
}

function publicPhotoFingerprint(item) {
  const primary = String(item?.foto || (Array.isArray(item?.fotos) ? item.fotos[0] : "") || "").trim();
  return primary ? JSON.stringify(primary) : "[]";
}

function looseIdentity(line, group, item) {
  const name = String(item?.nome || "").replace(/\d+(?:[.,]\d+)?\s*(?:ml|g)\b/gi, " ");
  return [norm(group?.brand), norm(name)].join("|");
}

function rekeyLiveVariants(liveDATA, internalPublic) {
  const byBase = new Map();
  const byLooseIdentity = new Map();
  const byOriginRef = new Map();
  const byPublicId = new Map();
  const byPublicIdContext = new Map();
  const byStockRef = new Map();
  for (const [line,groups] of Object.entries(internalPublic || {})) for (const group of groups || []) {
    for (const item of group.items || []) {
      const key=[norm(line),norm(group.brand),norm(group.cat),norm(item.nome),volumeMatch(item.volume,item.nome)].join("|");
      if(!byBase.has(key)) byBase.set(key,[]);
      byBase.get(key).push(item);
      const looseKey=looseIdentity(line,group,item);
      if(!byLooseIdentity.has(looseKey))byLooseIdentity.set(looseKey,[]);
      byLooseIdentity.get(looseKey).push(item);
      const publicId=String(item.public_id||"").trim();
      if(publicId){
        if(!byPublicId.has(publicId))byPublicId.set(publicId,[]);
        byPublicId.get(publicId).push(item);
        if(!byPublicIdContext.has(publicId))byPublicIdContext.set(publicId,[]);
        byPublicIdContext.get(publicId).push({line,group,item});
      }
      const stockRef=String(item.stock_ref||"").trim();
      if(stockRef){if(!byStockRef.has(stockRef))byStockRef.set(stockRef,[]);byStockRef.get(stockRef).push(item);}
      const originRef=String(item.origin_ref||"").trim();
      if(originRef){if(!byOriginRef.has(originRef))byOriginRef.set(originRef,[]);byOriginRef.get(originRef).push(item);}
    }
  }
  const used=new Set(); let rekeyed=0, unmatched=0;
  for (const [line,groups] of Object.entries(liveDATA || {})) for (const group of groups || []) {
    for (const item of group.items || []) {
      const key=[norm(line),norm(group.brand),norm(group.cat),norm(item.nome),volumeMatch(item.volume,item.nome)].join("|");
      const fp=publicFingerprint(item);
      const candidates=(byBase.get(key)||[]).filter(candidate=>!used.has(candidate));
      const byGlobalId=item.public_id?(byPublicId.get(String(item.public_id))||[]).filter(candidate=>!used.has(candidate)):[];
      const byStock=item.stock_ref?((byStockRef.get(String(item.stock_ref))||[]).filter(candidate=>!used.has(candidate))):[];
      const byExistingId=item.public_id?candidates.filter(candidate=>candidate.public_id===item.public_id):[];
      const byOrigin=String(item.origin_ref||"").trim()?((byOriginRef.get(String(item.origin_ref).trim())||[]).filter(candidate=>!used.has(candidate))):[];
      const photoFingerprint=publicPhotoFingerprint(item);
      const byPhoto=photoFingerprint!=="[]"?candidates.filter(candidate=>publicPhotoFingerprint(candidate)===photoFingerprint):[];
      const samePublicIdRepresentations=item.public_id
        ? (byPublicIdContext.get(String(item.public_id))||[]).filter(candidate=>
            norm(candidate.group?.brand)===norm(group?.brand) &&
            norm(candidate.item?.nome)===norm(item?.nome) &&
            String(candidate.item?.varejo??"").trim()===String(item?.varejo??"").trim() &&
            String(candidate.item?.atacado??"").trim()===String(item?.atacado??"").trim() &&
            photoFingerprint!=="[]" &&
            publicPhotoFingerprint(candidate.item)===photoFingerprint
          )
        : [];
      if(byGlobalId.length===0 && samePublicIdRepresentations.length===1 &&
        used.has(samePublicIdRepresentations[0].item)) {
        console.log("GIST_VARIANT_ALREADY_REPRESENTED "+JSON.stringify({
          nome:item.nome,public_id:item.public_id||"",linhaLegada:line,categoriaLegada:group.cat||"",
          volumeLegado:item.volume||"",linhaCanonica:samePublicIdRepresentations[0].line,
          categoriaCanonica:samePublicIdRepresentations[0].group?.cat||"",
          volumeCanonico:samePublicIdRepresentations[0].item?.volume||""
        }));
        continue;
      }
      const looseKey=looseIdentity(line,group,item);
      const byLoose=(byLooseIdentity.get(looseKey)||[]).filter(candidate=>!used.has(candidate));
      const byLoosePhoto=photoFingerprint!=="[]"?byLoose.filter(candidate=>publicPhotoFingerprint(candidate)===photoFingerprint):[];
      const byExactContent=candidates.filter(candidate=>publicFingerprint(candidate)===fp);
      const match=byGlobalId.length===1?byGlobalId[0]
        :byStock.length===1?byStock[0]
        :byExistingId.length===1?byExistingId[0]
        :byOrigin.length===1?byOrigin[0]
        :byPhoto.length===1?byPhoto[0]
        :byExactContent.length===1?byExactContent[0]
        :candidates.length===1?candidates[0]
        :byLoosePhoto.length===1?byLoosePhoto[0]
        :byLoose.length===1?byLoose[0]:null;
      if(!match){unmatched++;const sameNameKeys=[...byLooseIdentity.keys()].filter(k=>k.endsWith("|"+norm(item.nome))).slice(0,8);console.log("VARIANTE GIST SEM CORRESPONDÊNCIA INEQUÍVOCA "+JSON.stringify({linha:line,marca:group.brand,categoria:group.cat,nome:item.nome,looseKey:looseKey,sameNameKeys,public_id_global:byGlobalId.length,stock_ref_global:byStock.length,candidatas:candidates.length,origin_ref:byOrigin.length,fotosCompativeis:byPhoto.length,identidadeFlexivel:byLoose.length,fotoFlexivel:byLoosePhoto.length,conteudoExato:byExactContent.length}));continue;}
      used.add(match);
      if(item.public_id!==match.public_id){item.public_id=match.public_id;rekeyed++;}
    }
  }
  return {rekeyed,unmatched};
}

function syncKey(nome,volume,categoria,brand) {
  const mini=isMiniatura(nome,volume,categoria)&&!isOleo(nome);
  return mini
    ? `mini|${norm(brand||"outros")}|${chaveComparacaoMini(nome)}|${volumeMatch(volume,nome)}`
    : `normal|${norm(brand||"outros")}|${limparParaComparacao(nome)}|${volumeMatch(volume,nome)}`;
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
  [syncKey("Óleo Karseell Cabelo","50ml","Óleos","Karseell"),"normal|karseell|oleo karseell cabelo|50ml","óleo não deve entrar na chave de miniatura"],
  [syncKey("Perfume Alfa","100ml","Perfumes","Marca A"),"normal|marca a|perfume alfa|100ml","produto convencional"],
  [syncKey("Miniatura Alfa","30ml","Miniaturas","Lattafa"),"mini|lattafa|alfa|30ml","produto miniatura"],
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
    const key=[norm(line),norm(group.brand),norm(group.cat),norm(item.nome),volumeMatch(item.volume,item.nome)].join("|");
    if(!internalIndex.has(key)) internalIndex.set(key,[]);
    internalIndex.get(key).push(item);
  }
}
const DATA=await fetchLiveCatalog();
const internalPublicData=toPublicCatalog(INTERNAL_DATA);
const rekeyAudit=rekeyLiveVariants(DATA,internalPublicData);
console.log(`GIST_VARIANTS_REKEYABLE=${rekeyAudit.rekeyed} unmatchedLiveVariants=${rekeyAudit.unmatched}`);
const internalPublicIndex=new Map();
const publicBuckets=new Map();
for(const [line,groups] of Object.entries(internalPublicData)) for(const group of groups||[]) for(const item of group.items||[]) {
  const base=[norm(line),norm(group.brand),norm(group.cat),norm(item.nome),volumeMatch(item.volume,item.nome)].join("|");
  if(!publicBuckets.has(base)) publicBuckets.set(base,[]);
  publicBuckets.get(base).push(item);
}
for(const [line,groups] of Object.entries(INTERNAL_DATA)) for(const group of groups||[]) for(const item of group.items||[]) {
  const base=[norm(line),norm(group.brand),norm(group.cat),norm(item.nome),volumeMatch(item.volume,item.nome)].join("|");
  const publicItem=publicBuckets.get(base)?.shift();
  if(publicItem?.public_id) internalPublicIndex.set(publicItem.public_id,{line,group,item,publicItem});
}
const catalog=[];
for(const [line,groups] of Object.entries(DATA)) {
  if(!Array.isArray(groups)) continue;
  for(const group of groups) for(const item of (Array.isArray(group?.items)?group.items:[])) {
    const name=String(item.nome||"").trim();
    if(!name) continue;
    const volume=String(item.volume||volumeFrom(null,name));
    const internalKey=[norm(line),norm(group.brand),norm(group.cat),norm(name),volumeMatch(volume,name)].join("|");
    const internalCandidates=internalIndex.get(internalKey)||[];
    // Nunca atribua um ID de origem apenas porque o nome/volume coincide.
    // Se os preços não identificam uma única variante interna, a origem fica
    // sem correspondência e a auditoria não pode fabricar uma duplicidade.
    const internal=findExactInternalPriceMatch(internalCandidates,item);
    catalog.push({
      line,brand:String(group.brand||"Sem marca"),category:String(group.cat||"Sem categoria"),
      name,volume,retail:item.varejo??"",wholesale:item.atacado??"",
      source:"",originId:String(internal?.id_origem||""),manual:internal?.precoManual??false,
      key:syncKey(name,volume,group.cat,group.brand),item
    });
  }
}
const publicIdCollisionMap = new Map();
for (const item of catalog) {
  const id = String(item.item?.public_id || "").trim();
  if (!id) continue;
  if (!publicIdCollisionMap.has(id)) publicIdCollisionMap.set(id, []);
  publicIdCollisionMap.get(id).push({
    line: item.line, brand: item.brand, category: item.category, name: item.name,
    fonte: item.item?.fonte || "", id_origem: item.item?.id_origem || "",
    stock_ref: item.item?.stock_ref || "", origin_ref: item.item?.origin_ref || ""
  });
}
const publicIdCollisions = [...publicIdCollisionMap].filter(([, rows]) => rows.length > 1);
function publicIdRowsConflict(rows) {
  const identities = rows.map(row => {
    const brand = norm(row.brand), name = norm(row.name);
    const origin = String(row.origin_ref || "").trim();
    const stock = String(row.stock_ref || "").trim();
    if (origin) return "origin|" + brand + "|" + name + "|" + origin;
    if (stock) return "stock|" + brand + "|" + name + "|" + stock;
    return "";
  });
  return identities.some(identity => !identity) || new Set(identities).size > 1;
}
const publicIdIdentityConflicts = publicIdCollisions.filter(([, rows]) => publicIdRowsConflict(rows));
console.log(`PUBLIC_ID_DUPLICATE_REPRESENTATION_GROUPS=${publicIdCollisions.length - publicIdIdentityConflicts.length}`);
console.log(`PUBLIC_ID_IDENTITY_CONFLICT_GROUPS=${publicIdIdentityConflicts.length}`);
for (const [public_id, rows] of publicIdIdentityConflicts) {
  console.log("PUBLIC_ID_IDENTITY_CONFLICT_DETAIL " + JSON.stringify({ public_id, rows }));
}

const internalPublicIdCollisionMap = new Map();
for (const [line, groups] of Object.entries(internalPublicData)) {
  for (const group of groups || []) for (const item of group.items || []) {
    const id = String(item?.public_id || "").trim();
    if (!id) continue;
    if (!internalPublicIdCollisionMap.has(id)) internalPublicIdCollisionMap.set(id, []);
    internalPublicIdCollisionMap.get(id).push({
      line, brand: group.brand || "", category: group.cat || "", name: item.nome || "",
      origin_ref: item.origin_ref || "", stock_ref: item.stock_ref || ""
    });
  }
}
const internalPublicIdCollisions = [...internalPublicIdCollisionMap].filter(([, rows]) => rows.length > 1);
const internalPublicIdIdentityConflicts = internalPublicIdCollisions.filter(([, rows]) => publicIdRowsConflict(rows));
console.log(`INTERNAL_PUBLIC_ID_DUPLICATE_REPRESENTATION_GROUPS=${internalPublicIdCollisions.length - internalPublicIdIdentityConflicts.length}`);
console.log(`INTERNAL_PUBLIC_ID_IDENTITY_CONFLICT_GROUPS=${internalPublicIdIdentityConflicts.length}`);
for (const [public_id, rows] of internalPublicIdIdentityConflicts) {
  console.log("INTERNAL_PUBLIC_ID_IDENTITY_CONFLICT_DETAIL " + JSON.stringify({ public_id, rows }));
}
const internalItemCount=internalPublicIndex.size;
const liveKeySet=new Set(catalog.map(x=>String(x.item.public_id||"")));
const internalOnlyKeys=[...internalPublicIndex.keys()].filter(key=>!liveKeySet.has(key));
const liveOnlyKeys=[...liveKeySet].filter(key=>!internalPublicIndex.has(key));
console.log(`COMPARAÇÃO POR PUBLIC ID: data.js interno=${internalItemCount} IDs; Gist vivo=${catalog.length} itens; IDs só no data.js=${internalOnlyKeys.length}; IDs só no Gist=${liveOnlyKeys.length}; variantes sem correspondência=${rekeyAudit.unmatched}`);
const allowedAdditiveSources = new Set(["imarat", "brand", "roupas", "acessorios"]);
const internalOnlySourceRows = internalOnlyKeys.map(key => ({ key, row: internalPublicIndex.get(key) }));
const liveStockRefs = new Set(catalog.map(x => String(x.item?.stock_ref || "").trim()).filter(Boolean));
const duplicateInternalSourceRows = internalOnlySourceRows.filter(({ row }) =>
  Boolean(String(row?.publicItem?.stock_ref || "").trim()) &&
  liveStockRefs.has(String(row.publicItem.stock_ref).trim())
);
const liveLoosePhotoKeys = new Set(catalog.map(x => {
  const photo = publicPhotoFingerprint(x.item);
  return photo ? looseIdentity(x.line, x.group, x.item) + "|" + photo : "";
}).filter(Boolean));
const legacyBrandDuplicateRows = internalOnlySourceRows.filter(({ row }) => {
  if (norm(row?.item?.fonte) || !norm(row?.group?.cat).includes("brand")) return false;
  const photo = publicPhotoFingerprint(row?.publicItem);
  return Boolean(photo && liveLoosePhotoKeys.has(looseIdentity(row.line, row.group, row.item) + "|" + photo));
});
const duplicateInternalKeys = new Set([
  ...duplicateInternalSourceRows.map(x => x.key),
  ...legacyBrandDuplicateRows.map(x => x.key)
]);
const eligibleInternalOnlyRows = internalOnlySourceRows.filter(({ key }) => !duplicateInternalKeys.has(key));
const KNOWN_BRAND_GROUPS = new Set(["arabic collection","beauty brand","body splash","colecao dream","colecao brand","dream brand 80 100ml","dream brand","flaconete brand","sapatinho good girl","tubetes brand"]);
function effectiveAdditiveSource(row) {
  const source = norm(row?.item?.fonte);
  if (source) return source;
  return norm(row?.group?.cat) === "brand" && KNOWN_BRAND_GROUPS.has(norm(row?.group?.brand)) ? "brand" : "";
}
const internalOnlySourceConfirmed = eligibleInternalOnlyRows.every(({ row }) =>
  Boolean(row) &&
  allowedAdditiveSources.has(effectiveAdditiveSource(row)) &&
  (effectiveAdditiveSource(row) === "brand" || Boolean(String(row.item?.id_origem || "").trim()))
);
const additiveReconciliationSafe =
  // Ambiguidades de rekey não bloqueiam a preservação: os itens permanecem no Gist
  // e a publicação aditiva só prossegue se nenhum ID público ficar sem representação.
  liveOnlyKeys.length === 0 &&
  publicIdIdentityConflicts.length === 0 &&
  internalPublicIdIdentityConflicts.length === 0 &&
  eligibleInternalOnlyRows.length <= 80 &&
  internalOnlyKeys.length <= 80 &&
  Math.abs(catalog.length - internalItemCount) <= 80 &&
  internalOnlySourceConfirmed;
console.log(`ADDITIVE_RECONCILIATION_SAFE=${additiveReconciliationSafe} liveOnly=${liveOnlyKeys.length} internalOnly=${internalOnlyKeys.length} duplicateSourceRepresentations=${duplicateInternalSourceRows.length} legacyBrandRepresentations=${legacyBrandDuplicateRows.length} eligibleInternalOnly=${eligibleInternalOnlyRows.length} sourceConfirmed=${internalOnlySourceConfirmed} countDelta=${Math.abs(catalog.length - internalItemCount)}`);
for (const row of internalOnlySourceRows) {
  const item = row.row?.item || {};
  const group = row.row?.group || {};
  console.log("ADDITIVE SOURCE ITEM " + JSON.stringify({
    key: row.key, linha: row.row?.line || "", categoria: group.cat || "", fonte: item.fonte || "", id_origem: item.id_origem || "",
    marca: group.brand || "", nome: item.nome || "", precoManual: item.precoManual || false
  }));
}

const summarizeRows=rows=>{
  const byBrand=new Map();
  for(const row of rows) {
    const brand=norm(row?.group?.brand)||"sem marca";
    byBrand.set(brand,(byBrand.get(brand)||0)+1);
  }
  return [...byBrand.entries()].sort((x,y)=>y[1]-x[1]).map(([brand,count])=>({brand,count}));
};
const liveOnlyRows=liveOnlyKeys.map(key=>catalog.find(x=>String(x.item.public_id||"")===key));
console.log("DIFERENÇAS AGRUPADAS — SÓ DATA.JS "+JSON.stringify(summarizeRows(internalOnlyKeys.map(key=>internalPublicIndex.get(key)))));
console.log("DIFERENÇAS AGRUPADAS — SÓ GIST "+JSON.stringify(summarizeRows(liveOnlyRows)));
for(const key of internalOnlyKeys) console.log("SÓ NO DATA.JS "+JSON.stringify({public_id:key,nome:internalPublicIndex.get(key)?.item?.nome||"",marca:internalPublicIndex.get(key)?.group?.brand||""}));
for(const key of liveOnlyKeys) console.log("SÓ NO GIST "+JSON.stringify({public_id:key,nome:catalog.find(x=>String(x.item.public_id||"")===key)?.name||"",marca:catalog.find(x=>String(x.item.public_id||"")===key)?.brand||""}));

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
  const generic=new Set(["outros","outra","sem marca","sem marca definida","nao informado","n/a"]);
  if(b==="arabiyat" && s.includes("arabiyat prestige")) return true;
  if(b==="emporio a r" && s==="imarat") return true;
  if(generic.has(b)) return generic.has(s) || !s;
  if(generic.has(s)) return generic.has(b);
  return Boolean(b && s && b===s);
}
function matchSourceForCatalog(item) {
  const originRef = String(item.item?.origin_ref || "").trim();
  if (originRef) {
    const exactOrigin = findImaratSourceByOriginRef(source, originRef);
    if (!exactOrigin) return null;
    if (!sourceBrandMatches(item.brand, exactOrigin.brand)) return null;
    if (!volumeCompatible(volumeFrom(item.volume,item.name), volumeFrom(exactOrigin.sizeMl,exactOrigin.name))) return null;
    return exactOrigin;
  }
  const sourceId=String(item.originId||"").trim();
  if(sourceId) {
    const exactIdMatches=source.filter(p=>String(p.id??p.productId??p.slug??"").trim()===sourceId);
    if(exactIdMatches.length!==1) return null;
    const exact=exactIdMatches[0];
    if(!sourceBrandMatches(item.brand,exact.brand)) return null;
    if(!volumeCompatible(volumeFrom(item.volume,item.name),volumeFrom(exact.sizeMl,exact.name))) return null;
    return exact;
  }
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
  const id=String(p.id||p.productId||p.slug||"").trim();
  if(id) return "source-id|"+norm(p.brand||"outros")+"|"+id;
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
const confirmedMiniDuplicates=[...miniGlobalGroups].filter(([,items])=>{
  const identities=items.filter(x=>x.matchedSource).map(x=>sourceIdentity(x.matchedSource));
  return identities.length>1 && new Set(identities).size===1;
});
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
const normalNameVolumeIndex=new Set();
const miniIndex=new Set();
const miniNameVolumeIndex=new Set();
for(const item of catalog) {
  const normalKey=limparParaComparacao(item.name);
  const volumeKey=volumeMatch(item.volume,item.name);
  normalIndex.add(`${norm(item.brand)}|${normalKey}|${volumeKey}`);
  normalNameVolumeIndex.add(`${normalKey}|${volumeKey}`);
  if(isMiniatura(item.name,item.volume,item.category)&&!isOleo(item.name)) {
    const miniKey=chaveComparacaoMini(item.name);
    miniIndex.add(miniIdentityKey(item.brand,item.name,item.volume));
    miniNameVolumeIndex.add(`${miniKey}|${volumeKey}`);
  }
}
const initialNormalIndex=new Set(normalIndex);
const initialNormalNameVolumeIndex=new Set(normalNameVolumeIndex);
const initialMiniIndex=new Set(miniIndex);
const initialMiniNameVolumeIndex=new Set(miniNameVolumeIndex);
const simulatedNew=[];
const blockedByCatalog=[];
const blockedWithinImarat=[];
for(const p of source) {
  const name=String(p.name||"").trim();
  if(!name) continue;
  const volume=volumeFrom(p.sizeMl,name);
  const category=p.categoria_nome||p.categoria||"";
  const brand=String(p.brand||"Outros").toUpperCase();
  const brandKnown=Boolean(String(p.brand||"").trim())&&!["outros","outra","sem marca","sem marca definida","nao informado","n/a"].includes(norm(brand));
  const mini=isMiniatura(name,volume,category)&&!isOleo(name);
  const normalKey=limparParaComparacao(name);
  const miniKey=chaveComparacaoMini(name);
  const volumeKey=volumeMatch(volume,name);
  const miniIdentity=miniIdentityKey(brand,name,volume);
  const duplicate=mini
    ? miniIndex.has(miniIdentity)||(!brandKnown&&miniNameVolumeIndex.has(`${miniKey}|${volumeKey}`))
    : normalIndex.has(`${norm(brand)}|${normalKey}|${volumeKey}`)||(!brandKnown&&normalNameVolumeIndex.has(`${normalKey}|${volumeKey}`));
  if(duplicate) {
    const entry={name,brand,volume,key:mini?`mini|${norm(brand)}|${miniKey}|${volume}`:`normal|${norm(brand)}|${normalKey}|${volume}`};
    const existedBefore=mini
      ? initialMiniIndex.has(miniIdentity)||(!brandKnown&&initialMiniNameVolumeIndex.has(`${miniKey}|${volumeKey}`))
      : initialNormalIndex.has(`${norm(brand)}|${normalKey}|${volumeKey}`)||(!brandKnown&&initialNormalNameVolumeIndex.has(`${normalKey}|${volumeKey}`));
    (existedBefore?blockedByCatalog:blockedWithinImarat).push(entry);
    continue;
  }
  simulatedNew.push({name,brand,volume,key:mini?`mini|${norm(brand)}|${miniKey}|${volume}`:`normal|${norm(brand)}|${normalKey}|${volume}`});
  normalIndex.add(`${norm(brand)}|${normalKey}|${volumeKey}`);
  normalNameVolumeIndex.add(`${normalKey}|${volumeKey}`);
  if(mini) {
    miniIndex.add(miniIdentity);
    miniNameVolumeIndex.add(`${miniKey}|${volumeKey}`);
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

const onlyYouProducts=source.filter(p=>norm(p.brand)==="only you");
console.log(`VERIFICAÇÃO ESPECÍFICA ONLY YOU — origem: ${onlyYouProducts.length} produtos`);
for(const p of onlyYouProducts) {
  const identity=sourceIdentity(p);
  const inCatalog=catalogBySourceIdentity.has(identity);
  const volume=volumeFrom(p.sizeMl,p.name);
  const inNew=simulatedNew.some(x=>norm(x.brand)==="only you"&&norm(x.name)===norm(p.name)&&x.volume===volume);
  const inBlockedCatalog=blockedByCatalog.some(x=>norm(x.brand)==="only you"&&norm(x.name)===norm(p.name)&&x.volume===volume);
  const inBlockedApi=blockedWithinImarat.some(x=>norm(x.brand)==="only you"&&norm(x.name)===norm(p.name)&&x.volume===volume);
  const status=inCatalog?"PRESENTE NO CATÁLOGO":inNew?"SERÁ REIMPORTADO NA PRÓXIMA SINCRONIZAÇÃO":inBlockedCatalog?"BLOQUEADO POR COLISÃO COM ITEM DO CATÁLOGO":inBlockedApi?"REPETIDO NA PRÓPRIA API":"SEM CORRESPONDÊNCIA — REVISÃO NECESSÁRIA";
  console.log("ONLY YOU "+JSON.stringify({id:p.id||p.productId||p.slug||"",nome:p.name,volume, categoria:p.categoria_nome||p.categoria||"",status}));
}
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
