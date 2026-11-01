/* Non-destructive custom playlists for movies and TV shows. */
(function(root){
'use strict';
const str=x=>String(x);
function candidates(data,type){
 const parents=(data.items||[]).filter(x=>x.type===type);
 if(type==='show')return parents.map(x=>({id:'item:'+x.id,title:x.title,source:x}));
 const folders=new Set((data.collectionChildren||[]).map(x=>str(x.parentId)));
 return [...parents.filter(x=>!folders.has(str(x.id))).map(x=>({id:'item:'+x.id,title:x.title,source:x})),...(data.collectionChildren||[]).filter(x=>folders.has(str(x.parentId))).map(x=>({id:'child:'+x.id,title:x.title,source:x}))];
}
function valid(data,group){return candidates(data,group.type).filter(x=>(group.members||[]).includes(x.id))}
function mount(root,adapter){
 const data=adapter.data;data.customCollections ||= [];
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n};
 const btn=(label,click)=>{const n=el('button','',label);n.type='button';n.onclick=click;return n};
 const area=el('section','hub-group custom-collections'),header=el('div','custom-collections-header');header.append(el('h2','','My Custom Collections'),btn('+ New Collection',()=>editor(null)));area.append(header);
 const list=el('div','hub-grid');
 for(const group of data.customCollections){
  if(!group||!['movie','show'].includes(group.type))continue;
  const card=el('article','hub-card custom-collection-card'),titles=valid(data,group);
  const art=el('div','custom-cover'),image=el('img');image.alt='';image.loading='lazy';const urls=[group.cover,...valid(data,group).map(x=>adapter.poster(x.source))].filter(Boolean);let at=0;image.onerror=()=>{at++;if(urls[at])image.src=urls[at];else image.remove()};if(urls.length){image.src=urls[0];art.append(image)}else art.append(el('span','','TV LAND'));card.append(art);card.append(el('strong','',group.name),el('span','muted',(group.type==='show'?'TV Shows':'Movies')+' · '+titles.length+' titles'));
  if(group.description)card.append(el('p','muted',group.description));
  const detail=el('details');detail.append(el('summary','','View titles'));
  for(const title of titles){const line=el('div','custom-title-row');line.append(el('span','',title.title),btn('Remove',()=>{if(!confirm('Remove this title from the collection only?'))return;const latest=adapter.getData(),updated=(latest.customCollections||[]).map(g=>g.id===group.id?{...g,members:g.members.filter(k=>k!==title.id)}:g);if(adapter.save(updated)!==false)adapter.refresh()}));detail.append(line)}
  card.append(detail,btn('Edit',()=>editor(group)));
  list.append(card);
 }
 if(!list.childElementCount)area.append(el('p','muted','Create a movie or TV show collection and add titles already in TV Land.'));
 else area.append(list);
 const recovery=el('details');recovery.append(el('summary','','Recently Deleted'));for(const entry of (data.tvLandTrash||[]).slice().reverse()){const line=el('div','custom-title-row');line.append(el('span','',entry.record?.name||entry.record?.title||'Untitled'),btn('Restore',()=>adapter.restore(entry.id)));recovery.append(line)}area.append(recovery);root.prepend(area);
 function editor(existing){
  const backdrop=el('div','custom-collection-overlay'),dialog=el('section','custom-collection-dialog');
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label',existing?'Edit Collection':'New Collection');
  let phase=existing?1:0,kind=existing?.type||'movie',searchVersion=0,delay,remote=[];
  const selected=new Set(existing?.members||[]),name=el('input'),search=el('input'),cover=el('input'),body=el('div'),actions=el('div','custom-collection-actions');
  name.value=existing?.name||'';name.placeholder='Collection name';name.setAttribute('aria-label','Collection name');
  search.placeholder='Search your library and TMDB';search.setAttribute('aria-label','Search titles');
  cover.value=existing?.cover||'';cover.placeholder='Optional HTTPS collection artwork URL';cover.setAttribute('aria-label','Collection artwork');
  const close=()=>{clearTimeout(delay);searchVersion++;backdrop.remove()};
  function current(){return adapter.getData()}
  function entries(){return candidates(current(),kind)}
  function redrawResults(){
   const list=body.querySelector('.custom-collection-members'),count=body.querySelector('.custom-selected-count');if(!list)return;
   list.replaceChildren();
   const q=search.value.trim().toLowerCase(),available=entries().filter(x=>!q||x.title.toLowerCase().includes(q)).slice(0,20);
   const row=(label,click,active)=>{const r=el('div','custom-title-row');r.append(el('span','',label),btn(active?'✓ Added':'+ Add',click));list.append(r)};
   for(const item of available)row(item.title,()=>{if(selected.has(item.id))selected.delete(item.id);else selected.add(item.id);redrawResults()},selected.has(item.id));
   for(const item of remote.filter(x=>x.kind===kind))row(item.title+(item.year?' ('+item.year+')':'')+' · TMDB',async()=>{
    const result=await adapter.addTMDB(item);
    if(result?.id){selected.add('item:'+result.id);remote=[];search.value='';redrawResults();const status=body.querySelector('.custom-search-status');if(status)status.textContent='Added to TV Land and selected for this collection.'}
   },false);
   if(!available.length&&!remote.length)list.append(el('p','muted','No saved titles match. Try searching TMDB.'));
   count.textContent=selected.size+' titles selected';
  }
  function searchAll(){
   const query=search.value.trim(),version=++searchVersion;clearTimeout(delay);remote=[];redrawResults();
   const status=body.querySelector('.custom-search-status');
   if(query.length<2){if(status)status.textContent='Your saved titles appear above. Enter 2+ characters to search TMDB.';return}
   if(status)status.textContent='Searching TMDB…';
   delay=setTimeout(async()=>{try{const found=await adapter.discover(query);if(version!==searchVersion||phase!==1)return;remote=found.filter(x=>x.kind===kind).slice(0,8);if(status)status.textContent=remote.length?'Saved titles and TMDB results':'No TMDB matches';redrawResults()}catch{if(version===searchVersion&&status)status.textContent='TMDB unavailable. Saved titles are still available.'}},350);
  }
  function save(){
   if(!name.value.trim()){alert('Enter a collection name.');return}
   const latest=current(),id=existing?.id||'custom-'+Date.now()+'-'+Math.random().toString(36).slice(2);
   const url=cover.value.trim();if(url&&!/^https:\/\//i.test(url)){alert('Collection artwork must be an HTTPS URL.');return}
   const group={id,type:kind,name:name.value.trim(),description:existing?.description||'',cover:url,members:[...selected].filter(k=>candidates(latest,kind).some(x=>x.id===k))};
   const updated=existing?(latest.customCollections||[]).map(x=>x.id===id?group:x):[...(latest.customCollections||[]),group];
   if(adapter.save(updated)===false){alert('Could not save the collection.');return}
   close();adapter.refresh();if(!url&&adapter.findCover)adapter.findCover(group);
  }
  function draw(){
   body.replaceChildren();actions.replaceChildren();
   const step=el('p','muted','Step '+(phase+1)+' of 3');body.append(step);
   if(phase===0){
    body.append(el('h2','','New Collection'),el('p','muted','Choose Movies or TV Shows, then give your collection a name.'));
    const types=el('div','custom-collection-actions');
    for(const [value,label] of [['movie','Movies'],['show','TV Shows']])types.append(btn((kind===value?'✓ ':'')+label,()=>{kind=value;selected.clear();draw()}));
    body.append(types,el('label','','Collection name'),name);
    actions.append(btn('Continue',()=>{if(!name.value.trim()){alert('Enter a collection name.');return}phase=1;draw()}),btn('Cancel',close));
   }else if(phase===1){
    body.append(el('h2','','Add '+(kind==='movie'?'Movies':'TV Shows')),search,el('p','custom-search-status muted','Search saved titles or TMDB.'),el('div','custom-collection-members'),el('p','custom-selected-count muted'));
    actions.append(btn('Continue',()=>{phase=2;searchVersion++;clearTimeout(delay);draw()}),btn('Back',()=>{phase=0;searchVersion++;clearTimeout(delay);draw()}),btn('Cancel',close));
    search.oninput=searchAll;redrawResults();if(search.value.trim().length>=2)searchAll();
   }else{
    body.append(el('h2','','Review Collection'),el('strong','',name.value),el('p','muted',(kind==='movie'?'Movies':'TV Shows')+' · '+selected.size+' titles'));
    for(const item of entries().filter(x=>selected.has(x.id)))body.append(el('p','',item.title));
    body.append(el('label','','Custom collection artwork (optional)'),cover,el('p','muted','TV Land will try collection artwork first, then use a title poster. Empty collections are allowed.'));
    actions.append(btn('Save Collection',save),btn('Back',()=>{phase=1;draw()}),btn('Cancel',close));
   }
  }
  dialog.append(body,actions);backdrop.append(dialog);document.body.append(backdrop);draw();backdrop.onclick=e=>{if(e.target===backdrop)close()};dialog.onkeydown=e=>{if(e.key==='Escape')close()};
 }

}
const api={mount,candidates,valid};if(typeof module==='object')module.exports=api;else root.TVLandCustomCollections=api;
})(typeof globalThis!=='undefined'?globalThis:this);
