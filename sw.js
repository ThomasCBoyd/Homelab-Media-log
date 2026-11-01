/* TV Land offline shell. Never cache personal collection records or TMDB API responses. */
const VERSION='tv-land-shell-20261031-v1';
const SHELL=['./','./index.html','./show.html','./movie.html','./metadata.js','./search.js','./collections.js','./home.js','./details.js','./search.css','./home.css','./collections.css','./details.css','./manifest.webmanifest'];
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
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
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
