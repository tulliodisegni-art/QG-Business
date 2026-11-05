/* QG Business, version installable : remplace window.claude (base de données, IA, téléchargements)
   par des équivalents locaux. Les données restent sur l'appareil (IndexedDB). */
(()=>{
"use strict";
window.QG_PWA=true;
const KEY="qg_aikey";
const getKey=()=>{try{return localStorage.getItem(KEY)||""}catch{return ""}};
window.QG={hasKey:()=>!!getKey(),setKey:k=>{try{k?localStorage.setItem(KEY,k.trim()):localStorage.removeItem(KEY)}catch{}}};

/* ---------- IndexedDB ---------- */
const idb=new Promise((ok,ko)=>{
  const r=indexedDB.open("qgbusiness",2);
  r.onupgradeneeded=()=>{const d=r.result;["docs","blobs","meta"].forEach(n=>{if(!d.objectStoreNames.contains(n))d.createObjectStore(n)})};
  r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);
});
const tx=(store,mode,fn)=>idb.then(d=>new Promise((ok,ko)=>{const t=d.transaction(store,mode);const res=fn(t.objectStore(store));t.oncomplete=()=>ok(res&&"result" in res?res.result:undefined);t.onerror=()=>ko(t.error);t.onabort=()=>ko(t.error)}));

/* ---------- db : collections / documents ---------- */
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const isObj=v=>v&&typeof v==="object"&&!Array.isArray(v);
const rid=n=>{const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",a=crypto.getRandomValues(new Uint8Array(n));return Array.from(a,x=>c[x%62]).join("")};
let cache=null;
const loadAll=()=>cache||(cache=idb.then(d=>new Promise((ok,ko)=>{
  const m=new Map(),t=d.transaction("docs","readonly"),cur=t.objectStore("docs").openCursor();
  cur.onsuccess=()=>{const c=cur.result;if(c){m.set(c.key,c.value);c.continue()}else ok(m)};cur.onerror=()=>ko(cur.error);
})));
const subs=new Map();// coll -> Set(fn) ; "coll/id" -> Set(fn)
const snapColl=(m,coll)=>{const p=coll+"/",docs=[];for(const [k,v] of m)if(k.startsWith(p)&&!k.slice(p.length).includes("/")){const id=k.slice(p.length),d=clone(v);docs.push({id,exists:true,data:()=>clone(d)})}return {docs,size:docs.length,empty:!docs.length}};
const snapDoc=(m,key)=>{const id=key.split("/").pop(),v=m.get(key);return {id,exists:v!==undefined,data:()=>v===undefined?undefined:clone(v)}};
function notify(key){
  const coll=key.slice(0,key.lastIndexOf("/"));
  loadAll().then(m=>{
    for(const fn of subs.get(coll)||[])setTimeout(()=>fn(snapColl(m,coll)));
    for(const fn of subs.get(key)||[])setTimeout(()=>fn(snapDoc(m,key)));
  });
}
async function write(key,val,remoteTs){
  const m=await loadAll();
  if(val===undefined){m.delete(key);await tx("docs","readwrite",s=>s.delete(key))}
  else{val=clone(val);m.set(key,val);await tx("docs","readwrite",s=>s.put(val,key))}
  const ts=remoteTs||Date.now();await tx("meta","readwrite",s=>{s.put(ts,"ts:"+key);if(remoteTs)s.delete("out:"+key);else s.put(ts,"out:"+key)});
  notify(key);if(!remoteTs)Sync.soon();
}
function deepMerge(a,b){const o=isObj(a)?{...a}:{};for(const k in b)o[k]=isObj(b[k])&&isObj(o[k])?deepMerge(o[k],b[k]):b[k];return o}
function sub(key,fn,init){let set=subs.get(key);if(!set)subs.set(key,set=new Set());set.add(fn);loadAll().then(m=>{if(set.has(fn))fn(init(m))});return ()=>set.delete(fn)}
function docRef(coll,id){
  id=id||rid(20);const key=coll+"/"+id;
  return {id,path:key,
    get:async()=>snapDoc(await loadAll(),key),
    set:async(d,o)=>{const m=await loadAll();await write(key,o&&o.merge?deepMerge(m.get(key),d):d)},
    update:async d=>{const m=await loadAll();const cur=m.get(key);if(cur===undefined){const e=new Error("Document introuvable");e.code="not_found";throw e}
      const v=clone(cur);for(const [p,x] of Object.entries(d)){const parts=p.split(".");let o=v;for(let i=0;i<parts.length-1;i++){if(!isObj(o[parts[i]]))o[parts[i]]={};o=o[parts[i]]}if(x===undefined)delete o[parts.at(-1)];else o[parts.at(-1)]=x}
      await write(key,v)},
    delete:async()=>write(key,undefined),
    onSnapshot:(fn,err)=>sub(key,fn,m=>snapDoc(m,key)),
    collection:n=>collRef(key+"/"+n)};
}
function collRef(coll){
  return {id:coll.split("/").pop(),path:coll,
    doc:id=>docRef(coll,id),
    add:async d=>{const r=docRef(coll);await r.set(d);return r},
    get:async()=>snapColl(await loadAll(),coll),
    onSnapshot:(fn,err)=>sub(coll,fn,m=>snapColl(m,coll))};
}
const db=Object.freeze({collection:collRef,doc:p=>{const i=p.lastIndexOf("/");return docRef(p.slice(0,i),p.slice(i+1))}});

/* ---------- synchronisation (Supabase) ---------- */
/* Base dédiée à QG Business. Table qg_docs (voir README) protégée par compte : chacun ne voit que ses données. */
const SYNC_DEFAULT={url:"",key:""};
const SK="qg_sync";
const getCfg=()=>{try{return Object.assign({},SYNC_DEFAULT,JSON.parse(localStorage.getItem(SK)||"{}"))}catch{return {...SYNC_DEFAULT}}};
const setCfg=c=>{try{localStorage.setItem(SK,JSON.stringify(c))}catch{}};
const metaGet=k=>tx("meta","readonly",s=>s.get(k));
const metaAll=prefix=>idb.then(d=>new Promise((ok,ko)=>{const out=[],t=d.transaction("meta","readonly"),c=t.objectStore("meta").openCursor();c.onsuccess=()=>{const x=c.result;if(x){if(String(x.key).startsWith(prefix))out.push([x.key,x.value]);x.continue()}else ok(out)};c.onerror=()=>ko(c.error)}));
const Sync={st:{last:"",error:"",busy:false},listeners:new Set(),timer:null,
  cfg:getCfg,
  on(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn)},
  emit(){const s2=this.status();this.listeners.forEach(f=>{try{f(s2)}catch{}})},
  status(){const c=getCfg();return {configured:!!(c.url&&c.key),connected:!!(c.url&&c.key&&c.refresh),email:c.email||"",url:c.url||"",hasDefault:!!SYNC_DEFAULT.url,last:this.st.last,error:this.st.error,busy:this.st.busy}},
  async auth(path,body){const c=getCfg();const r=await fetch(c.url.replace(/\/$/,"")+"/auth/v1/"+path,{method:"POST",headers:{"content-type":"application/json",apikey:c.key},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));
    if(!r.ok){const m=j.error_description||j.msg||j.message||("erreur "+r.status);throw new Error(/invalid login/i.test(m)?"Email ou mot de passe incorrect.":/already registered/i.test(m)?"Ce compte existe déjà : utilisez « Se connecter ».":/not confirmed/i.test(m)?"Confirmez d'abord votre email (lien reçu), puis connectez-vous.":m)}return j},
  keep(j){const c=getCfg();c.access=j.access_token;c.refresh=j.refresh_token;c.exp=Date.now()+(j.expires_in||3600)*1000-60000;c.uid=(j.user&&j.user.id)||c.uid;if(j.user&&j.user.email)c.email=j.user.email;setCfg(c)},
  async token(){const c=getCfg();if(!c.refresh)throw new Error("Non connecté");if(c.access&&c.exp>Date.now())return c.access;const j=await this.auth("token?grant_type=refresh_token",{refresh_token:c.refresh});this.keep(j);return j.access_token},
  async connect({url,key,email,password,create}){const c=getCfg();if(url)c.url=url.trim().replace(/\/$/,"");if(key)c.key=key.trim();c.email=email.trim();setCfg(c);
    if(!c.url||!c.key)throw new Error("Il manque l'adresse ou la clé du projet Supabase.");
    let j;if(create){j=await this.auth("signup",{email:c.email,password});if(!j.access_token)throw new Error("Compte créé : confirmez votre email (lien reçu), puis revenez ici et cliquez sur « Se connecter ».")}
    else j=await this.auth("token?grant_type=password",{email:c.email,password});
    this.keep(j);const m=await loadAll();await tx("meta","readwrite",s=>{for(const k of m.keys())s.put(1,"out0:"+k)});localStorage.removeItem("qg_pull");await this.run();return this.status()},
  disconnect(){const c=getCfg();delete c.access;delete c.refresh;delete c.uid;setCfg(c);this.emit()},
  soon(){clearTimeout(this.timer);if(this.status().connected)this.timer=setTimeout(()=>this.run(),1500)},
  async rest(path,opt={}){const c=getCfg();const t=await this.token();const r=await fetch(c.url+"/rest/v1/"+path,{...opt,headers:{"content-type":"application/json",apikey:c.key,authorization:"Bearer "+t,...(opt.headers||{})}});
    if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(/qg_docs/.test(j.message||"")&&/exist|find/i.test(j.message||"")?"La table qg_docs n'existe pas encore : collez le script SQL dans Supabase.":(j.message||("erreur "+r.status)))}return r.status===204?null:r.json().catch(()=>null)},
  async run(){if(this.st.busy||!this.status().connected||navigator.onLine===false)return;this.st.busy=true;this.emit();
    try{const c=getCfg();const m=await loadAll();
      // 1. récupérer les changements des autres appareils
      let since=localStorage.getItem("qg_pull")||"1970-01-01T00:00:00Z";
      for(let page=0;page<50;page++){const rows=await this.rest("qg_docs?select=col,id,data,deleted,ts,updated_at&order=updated_at.asc&limit=1000&updated_at=gt."+encodeURIComponent(since));if(!rows||!rows.length)break;
        for(const r of rows){const key=r.col+"/"+r.id;const lt=(await metaGet("ts:"+key))||0;const local=m.has(key);
          if(Number(r.ts)>lt||(!local&&!r.deleted&&!lt)){await write(key,r.deleted?undefined:r.data,Math.max(1,Number(r.ts)||1));await tx("meta","readwrite",s=>s.delete("out0:"+key))}
          since=r.updated_at}
        localStorage.setItem("qg_pull",since);if(rows.length<1000)break}
      // 2. envoyer les changements de cet appareil
      const out=(await metaAll("out:")).map(([k,v])=>[String(k).slice(4),v]).concat((await metaAll("out0:")).map(([k])=>[String(k).slice(5),0]));
      for(let i=0;i<out.length;i+=200){const part=out.slice(i,i+200);const rows=[];
        for(const [key,ts0] of part){const j=key.lastIndexOf("/");const ts=(await metaGet("ts:"+key))||ts0||1;const v=m.get(key);rows.push({user_id:c.uid,col:key.slice(0,j),id:key.slice(j+1),data:v===undefined?null:v,deleted:v===undefined,ts})}
        if(rows.length)await this.rest("qg_docs?on_conflict=user_id,col,id",{method:"POST",headers:{prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});
        await tx("meta","readwrite",s=>{for(const [key] of part){s.delete("out:"+key);s.delete("out0:"+key)}})}
      this.st.last=new Date().toISOString();this.st.error=""}
    catch(e){this.st.error=e.message||"Synchronisation impossible"}
    finally{this.st.busy=false;this.emit()}}};
window.QG.sync=Sync;
setInterval(()=>{if(document.visibilityState==="visible")Sync.run()},60000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")Sync.run()});
window.addEventListener("online",()=>Sync.run());

/* ---------- downloads ---------- */
const downloads=Object.freeze({save:async({filename,data})=>{
  const blob=data instanceof Blob?data:new Blob([data]);
  const file=new File([blob],filename,{type:blob.type||"application/octet-stream"});
  if(navigator.canShare&&navigator.canShare({files:[file]})&&/iPhone|iPad|Android/i.test(navigator.userAgent)){
    try{await navigator.share({files:[file],title:filename});return}catch(e){if(e&&e.name==="AbortError"){const x=new Error("Annulé");x.code="declined";throw x}}
  }
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000);
}});

/* ---------- IA : Claude avec la clé de la personne ---------- */
const MODELS={quick:"claude-haiku-5-5",default:"claude-sonnet-5-5",complex:"claude-opus-5-5"};
const err=(code,text)=>{const e=new Error(text||code);e.code=code;if(text)e.mjText=text;return e};
async function imgPart(blob){
  let type=blob.type||"image/jpeg";
  const ok=/^image\/(jpeg|png|webp|gif)$/.test(type);
  let out=blob;
  if(!ok||blob.size>3.5e6){
    try{
      const bmp=await createImageBitmap(blob,{imageOrientation:"from-image"});
      const s=Math.min(1,2400/Math.max(bmp.width,bmp.height));
      const c=document.createElement("canvas");c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);
      c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);bmp.close&&bmp.close();
      out=await new Promise(r=>c.toBlob(r,"image/jpeg",.86));type="image/jpeg";
    }catch{if(!ok)throw err("image_rejected")}
  }
  const b64=await new Promise((ok2,ko)=>{const r=new FileReader();r.onload=()=>ok2(String(r.result).split(",")[1]);r.onerror=()=>ko(r.error);r.readAsDataURL(out)});
  return {type:"image",source:{type:"base64",media_type:type,data:b64}};
}
/* Sans clé sur le téléphone : la lecture passe par la fonction « ia » partagée avec Good Food (Supabase),
   qui garde la clé côté serveur. Rien à payer ni à saisir. */
const IA={url:"https://vvxkkqcmjrwytagbxdfg.supabase.co/functions/v1/ia",key:"sb_publishable_A-kJQIoJXxdXmjHF8iM40g_RP6myhMo"};
async function jpeg64(blob,max=1568,q=.82){
  // toujours réduite (comme Good Food) : un envoi trop lourd fait tomber le serveur avant qu'il ne réponde
  let out;
  try{const bmp=await createImageBitmap(blob,{imageOrientation:"from-image"});const s=Math.min(1,max/Math.max(bmp.width,bmp.height));
    const c=document.createElement("canvas");c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);bmp.close&&bmp.close();
    out=await new Promise(r=>c.toBlob(r,"image/jpeg",q))}catch{throw err("image_rejected")}
  return await new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(",")[1]);r.onerror=()=>ko(r.error);r.readAsDataURL(out)});
}
async function callServer(input,o){
  const prompt=typeof input==="string"?input:input.map(m=>(m.role==="assistant"?"Ta réponse précédente : ":"")+m.content).join("\n\n");
  if(prompt.length>30000)throw err("prompt_too_large");
  const send=async(max,q)=>{const images=[];for(const b of (o.images||[]).slice(0,6))images.push(await jpeg64(b,max,q));
    return fetch(IA.url,{method:"POST",signal:o.signal,headers:{"content-type":"application/json",apikey:IA.key},body:JSON.stringify({prompt,images,web:false})})};
  let r;
  try{r=await send(1568,.82)}
  catch(e){if(o.signal&&o.signal.aborted)throw err("cancelled");
    // deuxième essai avec des images plus légères
    try{r=await send(1024,.75)}catch(e2){if(o.signal&&o.signal.aborted)throw err("cancelled");throw err("network",navigator.onLine===false?"Pas de connexion. Vérifie internet et réessaie.":"Le serveur n'a pas répondu. Réessaie dans un instant.")}}
  const out=await r.json().catch(()=>({}));
  if(!r.ok){const st=out.status||r.status;if(st===429)throw err("rate_limited");if(r.status===400)throw err("prompt_too_large");throw err("api_error","Claude n'a pas pu répondre ("+st+"). Réessaie dans un instant.")}
  const text=String(out.text||"");o.onText&&o.onText({text,delta:text});
  return {text,truncated:false,modelApplied:"serveur"};
}
async function call(input,o={}){
  if(!getKey())return callServer(input,o);
  const msgs=typeof input==="string"?[{role:"user",content:input}]:input.map(m=>({role:m.role,content:m.content}));
  const imgs=o.images||[];
  if(imgs.length){const last=msgs[msgs.length-1];const parts=[];for(const b of imgs)parts.push(await imgPart(b));last.content=[...parts,{type:"text",text:String(last.content)}]}
  const model=o.model||MODELS[o.modelTier]||MODELS.default;
  let r;
  try{
    r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",signal:o.signal,
      headers:{"content-type":"application/json","x-api-key":getKey(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model,max_tokens:16000,stream:true,messages:msgs})});
  }catch(e){if(o.signal&&o.signal.aborted)throw err("cancelled");throw err("network","Pas de connexion à Claude. Vérifie internet et réessaie.")}
  if(!r.ok){
    let msg="";try{msg=(await r.json())?.error?.message||""}catch{}
    if(r.status===401){window.QG.setKey("");throw err("not_granted","Ta clé Claude n'est pas valide. ")}
    if(r.status===429||r.status===529)throw err("rate_limited");
    if(r.status===413||/too long|too large|maximum/i.test(msg))throw err("prompt_too_large");
    if(/image/i.test(msg))throw err("image_rejected");
    if(/credit|billing/i.test(msg))throw err("billing","Ton compte Anthropic n'a plus de crédit. Recharge-le sur console.anthropic.com.");
    throw err("api_error","Claude a répondu une erreur ("+r.status+"). Réessaie dans un instant.");
  }
  const rd=r.body.getReader(),dec=new TextDecoder();let buf="",text="",stop="";
  try{
    for(;;){const {value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});
      let i;while((i=buf.indexOf("\n"))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line.startsWith("data:"))continue;
        let ev;try{ev=JSON.parse(line.slice(5))}catch{continue}
        if(ev.type==="content_block_delta"&&ev.delta?.type==="text_delta"){text+=ev.delta.text;o.onText&&o.onText({text,delta:ev.delta.text})}
        else if(ev.type==="message_delta"&&ev.delta?.stop_reason)stop=ev.delta.stop_reason;
        else if(ev.type==="error"){const t=ev.error?.type;if(t==="overloaded_error"||t==="rate_limit_error")throw err("rate_limited");throw err("api_error","Claude a eu un souci. Réessaie.")}
      }}
  }catch(e){if(o.signal&&o.signal.aborted)throw err("cancelled");throw e.code?e:err("network","La connexion a été coupée. Réessaie.")}
  return {text,truncated:stop==="max_tokens",modelApplied:model};
}
function parseJSON(t){
  t=String(t||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"");
  try{return JSON.parse(t)}catch{}
  const s=t.search(/[\[{]/);if(s<0)throw err("invalid_json");
  const open=t[s],close=open==="{"?"}":"]",e=t.lastIndexOf(close);
  try{return JSON.parse(t.slice(s,e+1))}catch{throw err("invalid_json")}
}
const JSON_NOTE="\n\nRéponds uniquement avec le JSON demandé, sans texte autour ni balises de code.";
const sample=Object.freeze(Object.assign((i,o)=>call(i,o),{
  json:async(i,o)=>{const inp=typeof i==="string"?i+JSON_NOTE:i.map((m,k)=>k===i.length-1?{...m,content:m.content+JSON_NOTE}:m);return parseJSON((await call(inp,o)).text)},
  limits:async()=>({images:{maxCount:4}})
}));

/* ---------- premier lancement : reprend les données de départ (seed.json) ---------- */
window.QG.ready=(async()=>{try{const m=await loadAll();if(m.size||localStorage.getItem("qg_seeded"))return;
  const r=await fetch("seed.json",{cache:"no-store"});if(!r.ok)return;const seed=await r.json();
  for(const [k,v] of Object.entries(seed)){m.set(k,v);await tx("docs","readwrite",s=>s.put(v,k))}
  localStorage.setItem("qg_seeded","1");new Set(Object.keys(seed).map(k=>k.slice(0,k.lastIndexOf("/")))).forEach(c=>notify(c+"/_"))}catch(e){}})();

/* ---------- window.claude ---------- */
const caps={db,downloads,sample};
window.QG.ready.then(()=>setTimeout(()=>Sync.run(),800));
window.claude=Object.freeze({use:name=>window.QG.ready.then(()=>caps[name]||null)});

/* ---------- appli installable ---------- */
if("serviceWorker" in navigator){let had=!!navigator.serviceWorker.controller,done=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(had&&!done){done=true;location.reload()}had=true});
  navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>{const up=()=>r.update().catch(()=>{});document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")up()})}).catch(()=>{})}
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch{}
})();
