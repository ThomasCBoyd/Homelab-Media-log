/* TV Land offline shell. Never cache personal collection records or TMDB API responses. */
const VERSION='tv-land-shell-20261101-v6';
const POSTERS='tv-land-posters-v1';
const MAX_POSTERS=180;
function posterRequest(url){
 return url.protocol==='https:'&&url.hostname==='image.tmdb.org'&&url.pathname.startsWith('/t/p/');
}
async function storePoster(request,response){
 if(!response||(!response.ok&&response.type!=='opaque'))return;
 const type=response.headers.get('content-type')||'';
 if(response.type!=='opaque'&&!type.startsWith('image/'))return;
 try{
  const cache=await caches.open(POSTERS);
  await cache.put(request,response.clone());
  const keys=await cache.keys();
  if(keys.length>MAX_POSTERS)await Promise.all(keys.slice(0,keys.length-MAX_POSTERS).map(key=>cache.delete(key)));
 }catch(error){/* Storage quotas and private browsing may prevent caching. */}
}
const SHELL=['./','./index.html','./show.html','./movie.html','./metadata.js','./search.js','./collections.js','./home.js','./details.js','./collection-ops.js','./custom-collections.js','./search.css','./home.css','./collections.css','./details.css','./manifest.webmanifest'];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(VERSION);
  // Fail installation rather than claim offline readiness with a partial shell.
  await cache.addAll(SHELL);
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('tv-land-shell-')&&key!==VERSION).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const resource=new URL(request.url);
 if(posterRequest(resource)){
  event.respondWith((async()=>{
   const cache=await caches.open(POSTERS);
   const cached=await cache.match(request);
   if(cached)return cached;
   try{const response=await fetch(request);await storePoster(request,response);return response}catch(error){return Response.error()}
  })());
  return;
 }
 if(resource.origin!==self.location.origin)return;
 const url=new URL(request.url);
 const path=url.pathname;
 const allowed=/\.(?:html|js|css|webmanifest)$/.test(path)||path.endsWith('/Homelab-Media-log/')||path===self.registration.scope.replace(new URL(self.location.origin).origin,'');
 if(!allowed)return;
 event.respondWith((async()=>{
  const cache=await caches.open(VERSION);
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  try{return await fetch(request)}catch(error){
   if(request.mode==='navigate'){const fallback=await cache.match('./index.html');if(fallback)return fallback}
   throw error;
  }
 })());
});
