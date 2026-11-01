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
  card.append(el('strong','',group.name),el('span','muted',(group.type==='show'?'TV Shows':'Movies')+' · '+titles.length+' titles'));
  if(group.description)card.append(el('p','muted',group.description));
  const detail=el('details');detail.append(el('summary','','View titles'));
  for(const title of titles)detail.append(el('p','',title.title));
  card.append(detail,btn('Edit',()=>editor(group)));
  list.append(card);
 }
 if(!list.childElementCount)area.append(el('p','muted','Create a movie or TV show collection and add titles already in TV Land.'));
 else area.append(list);
 root.prepend(area);
 function editor(existing){
  const backdrop=el('div','custom-collection-overlay'),dialog=el('section','custom-collection-dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label',existing?'Edit collection':'Create collection');
  const heading=el('h2','',existing?'Edit Collection':'Create Collection'),name=el('input'),desc=el('textarea'),type=el('select'),selection=el('div','custom-collection-members'),search=el('input');
  name.placeholder='Collection name';name.setAttribute('aria-label','Collection name');name.value=existing?.name||'';
  desc.placeholder='Description (optional)';desc.setAttribute('aria-label','Description');desc.value=existing?.description||'';
  for(const [value,label] of [['movie','Movies'],['show','TV Shows']]){const o=el('option','',label);o.value=value;type.append(o)}
  type.value=existing?.type||'movie';type.setAttribute('aria-label','Collection type');if(existing)type.disabled=true;
  search.placeholder='Find saved titles';search.setAttribute('aria-label','Search saved titles');
  const selected=new Set(existing?.members||[]);
  function choices(){
   selection.replaceChildren();
   const matches=candidates(data,type.value).filter(x=>x.title.toLowerCase().includes(search.value.trim().toLowerCase()));
   for(const item of matches){const label=el('label'),check=el('input');check.type='checkbox';check.checked=selected.has(item.id);check.onchange=()=>check.checked?selected.add(item.id):selected.delete(item.id);label.append(check,document.createTextNode(' '+item.title));selection.append(label)}
   if(!matches.length)selection.append(el('p','muted','No matching saved titles. Add them to TV Land first.'));
  }
  type.onchange=()=>{selected.clear();choices()};search.oninput=choices;choices();
  const remoteArea=el('section','custom-collection-remote'),remoteStatus=el('p','muted','Search TMDB to add a title not already in TV Land.'),remoteList=el('div','custom-collection-members'),remoteSearch=el('input');
  remoteSearch.placeholder='Search TMDB movies or TV shows';remoteSearch.setAttribute('aria-label','Search TMDB');remoteArea.append(el('h3','','Add a new title from TMDB'),remoteSearch,remoteStatus,remoteList);
  let searchSequence=0,searchDelay;
  remoteSearch.oninput=()=>{
   const query=remoteSearch.value.trim(),sequence=++searchSequence;clearTimeout(searchDelay);remoteList.replaceChildren();
   if(query.length<2){remoteStatus.textContent='Enter at least two characters.';return}
   remoteStatus.textContent='Searching…';
   searchDelay=setTimeout(async()=>{
    try{
     const results=await adapter.discover(query);if(sequence!==searchSequence)return;
     const filtered=results.filter(x=>x.kind===type.value).slice(0,8);
     remoteStatus.textContent=filtered.length?'Choose a title to preview and confirm.':'No matching TMDB titles found.';
     for(const item of filtered){const b=btn(item.title+(item.year?' ('+item.year+')':'')+' — Preview',async()=>{
       const result=await adapter.addTMDB(item);
       if(result?.id){selected.add('item:'+result.id);data.items=adapter.getData().items;choices();remoteStatus.textContent='Added to TV Land and selected for this collection. Save the collection to finish.';remoteList.replaceChildren()}
     });remoteList.append(b)}
    }catch{if(sequence===searchSequence)remoteStatus.textContent='TMDB search unavailable. Check your connection.'}
   },300);
  };
  type.onchange=()=>{selected.clear();choices();remoteList.replaceChildren();remoteStatus.textContent='Search TMDB to add a title not already in TV Land.'};
  const actions=el('div','custom-collection-actions'),close=()=>backdrop.remove();
  actions.append(btn('Save Collection',()=>{
   const clean=name.value.trim();if(!clean){alert('Enter a collection name.');return}
   const next={id:existing?.id||'custom-'+Date.now()+'-'+Math.random().toString(36).slice(2),type:type.value,name:clean,description:desc.value.trim(),members:[...selected].filter(id=>candidates(data,type.value).some(x=>x.id===id))};
   const latest=adapter.getData(),previous=latest.customCollections||[];
   const updated=existing?previous.map(x=>x.id===existing.id?next:x):[...previous,next];
   if(adapter.save(updated)===false){alert('Could not save this collection.');return}
   close();adapter.refresh();
  }),btn('Cancel',close));
  if(existing)actions.append(btn('Delete Collection',()=>{
   if(!confirm('Delete only this custom collection? Its movies and TV shows will remain saved.'))return;
   const latest=adapter.getData(),previous=latest.customCollections||[];
   if(adapter.save(previous.filter(x=>x.id!==existing.id))===false){alert('Could not save deletion.');return}
   close();adapter.refresh();
  }));
  dialog.append(heading,el('label','','Collection name'),name,el('label','','Type'),type,el('label','','Description'),desc,el('label','','Add existing titles'),search,selection,remoteArea,actions);
  backdrop.append(dialog);document.body.append(backdrop);name.focus();backdrop.onclick=e=>{if(e.target===backdrop)close()};dialog.onkeydown=e=>{if(e.key==='Escape')close()};
 }
}
const api={mount,candidates,valid};if(typeof module==='object')module.exports=api;else root.TVLandCustomCollections=api;
})(typeof globalThis!=='undefined'?globalThis:this);
