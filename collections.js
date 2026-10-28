/* Read-only collections projection. No title inference or storage writes. */
(function(root){
'use strict';
function groups(data){
 const members=item=>(data.collectionChildren||[]).filter(c=>String(c.parentId)===String(item.id));
 const result={movies:[],shows:[]};
 for(const item of data.items||[]){
  const list=members(item);if(!list.length)continue;
  if(item.type==='movie')result.movies.push({item,members:list});
  if(item.type==='show'&&(item.owned||list.some(s=>s.owned||(data.showDetails?.[String(item.id)]?.episodes?.[String(s.id)]||[]).some(e=>e.owned))))result.shows.push({item,members:[...list].sort((a,b)=>Number(a.title.match(/Season\s*(\d+)/i)?.[1]||0)-Number(b.title.match(/Season\s*(\d+)/i)?.[1]||0))});
 }
 return result;
}
function summary(members){return ['owned','ripped','added'].map((field,i)=>members.filter(m=>m[field]).length+'/'+members.length+' '+['Owned','Ripped','Added to Jellyfin'][i]).join(' · ')}
function render(root,adapter){
 const data=adapter.data,all=groups(data),selected=[...all.movies,...all.shows].find(g=>String(g.item.id)===String(adapter.selected));
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!=null)n.textContent=text;return n};
 const button=(text,fn)=>{const b=el('button','',text);b.type='button';b.onclick=fn;return b};
 function poster(item){const holder=el('div','hub-art','No poster'),url=adapter.poster(item);if(url){const img=el('img');img.alt='';img.loading='lazy';img.src=url;img.onerror=()=>img.remove();holder.append(img)}return holder}
 function status(item){return ['owned','ripped','added'].map((f,i)=>(item[f]?'✓ ':'○ ')+['Owned','Ripped','Added to Jellyfin'][i]).join(' · ')}
 const heading=el('header','hub-heading');heading.append(el('h1','','Collections'),el('p','muted','Movie box sets and owned TV series with saved seasons. Counts reflect individual saved checkboxes, not complete-set ownership.'));root.append(heading);
 if(selected){
  const {item,members}=selected,isTV=item.type==='show';
  root.append(button('← All Collections',()=>adapter.select(null)));
  const hero=el('section','hub-detail');hero.append(poster(item));const copy=el('div');copy.append(el('h2','',item.title),el('p','muted',members.length+' saved '+(isTV?'seasons':'movies')),el('p','hub-summary',summary(members)),button(isTV?'Edit series & seasons':'Edit box set & movies',()=>adapter.open(item)));hero.append(copy);root.append(hero);
  root.append(el('h2','hub-subtitle',isTV?'Seasons':'Movies'));
  const list=el('ul','hub-members');for(const member of members){const row=el('li','hub-member');row.append(poster(member));const info=el('div');info.append(button(member.title,()=>adapter.open(isTV?item:member,isTV?null:item)),el('p','hub-summary',status(member)));row.append(info);list.append(row)}root.append(list);return;
 }
 for(const [key,title] of [['movies','Movie Box Sets'],['shows','TV Series Collections']]){
  const section=el('section','hub-group');section.append(el('h2','',title+' ('+all[key].length+')'));const grid=el('div','hub-grid');
  for(const group of all[key]){const card=button('',()=>adapter.select(group.item.id));card.className='hub-card';card.append(poster(group.item),el('strong','',group.item.title),el('span','muted',group.members.length+' '+(key==='movies'?'movies':'seasons')),el('span','hub-summary',summary(group.members)));grid.append(card)}
  section.append(grid);if(!all[key].length)section.append(el('p','muted',key==='movies'?'No saved movie box sets with members yet. Add movies to a collection in Movies.':'No owned TV series with saved seasons yet. Manage series and seasons in TV Guide.'));root.append(section);
 }
}
const api={groups,summary,render};if(typeof module==='object')module.exports=api;else root.ClassicCollections=api;
})(typeof globalThis!=='undefined'?globalThis:this);
