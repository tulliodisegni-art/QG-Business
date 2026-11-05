/* QG Business : fonctionne hors ligne. Le site est servi d'abord depuis le réseau, puis depuis le cache. */
const CACHE="qgbusiness-v8";
const SHELL=["./","index.html","shim.js","manifest.webmanifest","seed.json","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png","icons/icon-maskable-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET")return;
  const cdn=/^(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname);
  if(u.origin!==location.origin&&!cdn)return;
  const req=u.origin===location.origin?new Request(e.request,{cache:"no-cache"}):e.request;
  e.respondWith(fetch(req).then(r=>{if(r.ok||r.type==="opaque"){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:u.origin===location.origin}).then(r=>r||(e.request.mode==="navigate"?caches.match("index.html"):Response.error()))));
});
