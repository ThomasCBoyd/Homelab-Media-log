/* Collections project existing records; only explicit tracking edits are persisted. */
(function(root){
'use strict';
const fields=['owned','ripped','added'],labels=['Owned','Ripped','Added to Jellyfin'];
const key=value=>String(value),same=(a,b)=>key(a)===key(b);
const unique=list=>{const seen=new Set();return list.filter(x=>{if(x.id==null)return true;const id=key(x.id);if(seen.has(id))return false;seen.add(id);return true})};
function detail(data,item){return (item.type==='show'?data.showDetails:data.movieDetails)?.[key(item.id)]||{}}
function episodes(data,show,season){return data.showDetails?.[key(show.id)]?.episodes?.[key(season.id)]||[]}
function seasonNumber(item){return Number(String(item.title||'').match(/Season\s*(\d+)/i)?.[1]||0)}
function members(data,item){return unique((data.collectionChildren||[]).filter(c=>same(c.parentId,item.id)))}
function releaseDate(data,item){
 const d=detail(data,item),value=d.releaseDate||d.tmdb?.releaseDate||d.tmdb?.release_date||d.metadata?.releaseDate||d.year||d.tmdb?.year||item.year;
 const date=String(value||'');return /^\d{4}(?:-\d{2}-\d{2})?$/.test(date)?(date.length===4?date+'-00-00':date):null;
}
function ordered(data,item,list){
 if(item.type==='show')return [...list].sort((a,b)=>seasonNumber(a)-seasonNumber(b));
 // Only reorder when every member has a saved release date/year; otherwise keep saved order.
 return list.every(m=>releaseDate(data,m))?[...list].sort((a,b)=>releaseDate(data,a).localeCompare(releaseDate(data,b))):[...list];
}
function groups(data){
 const result={movies:[],shows:[]};
 for(const item of unique(data.items||[])){
  const list=members(data,item);if(!list.length)continue;
  const group={item,members:ordered(data,item,list)};
  if(item.type==='movie')result.movies.push(group);
  if(item.type==='show'&&(item.owned||list.some(s=>s.owned||episodes(data,item,s).some(e=>e.owned))))result.shows.push(group);
 }
 return result;
}
function summary(list){return fields.map((f,i)=>list.filter(m=>m[f]).length+'/'+list.length+' '+labels[i]).join(' · ')}
function imageURL(value){
 if(typeof value!=='string')return null;
 if(/^\/[A-Za-z0-9][^\s]*$/.test(value)&&!value.startsWith('//'))return 'https://image.tmdb.org/t/p/w1280'+value;
 try{const url=new URL(value);return url.protocol==='https:'?url.href:null}catch{return null}
}
function artwork(data,item,poster,parent){
 const d=detail(data,item),season=parent&&parent.type==='show'?detail(data,parent).tmdb?.seasons?.find(s=>Number(s.number??s.season_number)===seasonNumber(item)):null;
 return [...new Set([d.backdrop,d.tmdb?.backdrop,d.metadata?.backdrop,d.tmdb?.backdrop_path,poster(item),item.poster,season?.poster,season?.poster_path,d.poster,d.tmdb?.poster,d.metadata?.poster].map(imageURL).filter(Boolean))];
}
function description(data,item){const d=detail(data,item);return d.manualFields?.includes('description')?(d.description||''):(d.description||d.tmdb?.overview||d.metadata?.overview||'')}
// Resolve against the latest stored data, so an edit cannot overwrite another tab's changes.
function setStatus(data,target,field,value){
 if(!fields.includes(field)||typeof value!=='boolean')return false;
 const parent=(data.items||[]).find(x=>same(x.id,target.parentId));if(!parent||!['movie','show'].includes(parent.type))return false;
 const member=(data.collectionChildren||[]).find(x=>same(x.parentId,parent.id)&&same(x.id,target.memberId));if(!member)return false;
 let record=member;
 if(target.kind==='episode'){
  if(parent.type!=='show')return false;
  const list=episodes(data,parent,member);
  record=target.episodeId!=null?list.find(e=>same(e.id,target.episodeId)):list[target.index];
  if(!record||(target.episodeId==null&&(record.title!==target.title||record.number!==target.number)))return false;
 }else if(target.kind!=='member')return false;
 record[field]=value;return true;
}
function render(root,adapter){
 const data=adapter.data,all=groups(data),item=(data.items||[]).find(x=>same(x.id,adapter.selected)),selected=item&&['show','movie'].includes(item.type)&&members(data,item).length?{item,members:ordered(data,item,members(data,item))}:null;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!=null)n.textContent=text;return n};
 const button=(text,fn,cls='')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b};
 function art(item,cls='hub-art',parent,hero=false){
  const holder=el('div',cls),urls=artwork(data,item,adapter.poster,parent);const fallback=el('span','hub-art-fallback','TV LAND');fallback.setAttribute('aria-hidden','true');holder.append(fallback);
  if(urls.length){const img=el('img');img.alt='';img.loading=hero?'eager':'lazy';let index=hero?0:Math.max(0,urls.indexOf(imageURL(adapter.poster(item))));img.src=urls[index];img.onerror=()=>{urls.splice(index,1);index=0;if(urls.length)img.src=urls[0];else img.remove()};holder.append(img)}return holder;
 }
 if(!selected){
  const heading=el('header','hub-heading');heading.append(el('h1','','Collections'),el('p','muted','Your movie box sets and television collections, together.'));root.append(heading);
  for(const [name,title] of [['movies','Movie Box Sets'],['shows','TV Series Collections']]){
   const section=el('section','hub-group');section.append(el('h2','',title+' ('+all[name].length+')'));const grid=el('div','hub-grid');
   for(const group of all[name]){const card=button('',()=>adapter.select(group.item.id),'hub-card');card.append(art(group.item),el('strong','',group.item.title),el('span','muted',group.members.length+' '+(name==='movies'?'movies':'seasons')),el('span','hub-summary',summary(group.members)));grid.append(card)}
   section.append(grid);if(!all[name].length)section.append(el('p','muted',name==='movies'?'No saved movie box sets with members yet. Add movies to a collection in Movies.':'No owned TV series with saved seasons yet. Manage series and seasons in TV Guide.'));root.append(section);
  }return;
 }
 const {item:parent,members:list}=selected,isTV=parent.type==='show',refreshers=[];
 root.classList.add('hub-detail-view');
 root.append(button('← All Collections',()=>adapter.select(null),'hub-back'));
 const hero=el('section','hub-detail hub-hero');hero.append(art(parent,'hub-backdrop',null,true));
 const copy=el('div','hub-hero-copy');copy.append(el('span','hub-eyebrow',isTV?'TV SERIES COLLECTION':'MOVIE BOX SET'),el('h2','',parent.title),el('p','hub-description',description(data,parent)||(isTV?'Explore the seasons and episodes saved in your collection.':'Explore the movies saved in your collection.')));
 const counts=el('div','hub-counts');
 const total=el('div','hub-count');total.append(el('strong','',list.length),el('span','',isTV?'Saved seasons':'Saved movies'));counts.append(total);
 for(const [i,field] of fields.entries()){const count=el('div','hub-count'),number=el('strong');count.append(number,el('span','',labels[i]));counts.append(count);refreshers.push(()=>number.textContent=list.filter(m=>m[field]).length+'/'+list.length)}
 copy.append(counts,el('p','hub-note',isTV?'Season checkboxes and episode checkboxes are tracked separately.':'Each status reflects the individual movie checkbox.'),button(isTV?'Edit series & seasons':'Edit box set & movies',()=>adapter.open(parent),'hub-primary'));hero.append(copy);root.append(hero);
 const live=el('p','hub-feedback');live.setAttribute('role','status');live.setAttribute('aria-live','polite');root.append(live);
 function controls(record,target,title){
  const box=el('fieldset','hub-tracking');box.append(el('legend','hub-sr','Tracking: '+title));
  fields.forEach((field,i)=>{const label=el('label'),input=el('input');input.type='checkbox';input.checked=!!record[field];input.disabled=!adapter.update;input.setAttribute('aria-label',labels[i]+' '+title);input.onchange=()=>{
   const value=input.checked;let saved=false;try{saved=adapter.update(target,field,value)===true}catch{}
   if(!saved){input.checked=!!record[field];live.textContent='Could not save this change. Reload and try again.';return}
   record[field]=value;refreshers.forEach(fn=>fn());live.textContent=labels[i]+' updated for '+title+'.';
  };label.append(input,el('span','',labels[i]));box.append(label)});return box;
 }
 const section=el('section','hub-library');section.append(el('h2','hub-subtitle',isTV?'Seasons & episodes':'Movies in this collection'),el('p','hub-note',isTV?'Expand a season to track its saved episodes.':list.every(m=>releaseDate(data,m))?'Ordered by saved release date.':'In your saved collection order.'));
 const grid=el('div',isTV?'hub-seasons':'hub-movies');
 for(const member of list){
  const target={kind:'member',parentId:parent.id,memberId:member.id};
  if(!isTV){
   const card=el('article','hub-movie'),open=button('',()=>adapter.open(member,parent),'hub-movie-open');open.append(art(member),el('h3','',member.title));const date=releaseDate(data,member);if(date)open.append(el('span','hub-note',date.slice(0,4)));card.append(open,controls(member,target,member.title));grid.append(card);continue;
  }
  const season=el('article','hub-season'),overview=el('div','hub-season-overview');overview.append(art(member,'hub-season-art',parent));
  const info=el('div','hub-season-info');info.append(button(member.title,()=>adapter.open(parent),'hub-season-title'));
  const eps=episodes(data,parent,member),seasonStats=el('p','hub-summary');refreshers.push(()=>seasonStats.textContent=eps.length?eps.length+' saved episodes · '+summary(eps):'No saved episodes.');info.append(seasonStats);overview.append(info);season.append(overview,controls(member,target,member.title));
  const expand=el('details','hub-episodes');expand.dataset.seasonId=key(member.id);expand.open=(adapter.expanded||[]).includes(key(member.id));expand.ontoggle=()=>adapter.expand?.(key(member.id),expand.open);
  const caption=el('summary','',eps.length?'Episode tracking ('+eps.length+')':'Episode tracking');expand.append(caption);
  if(!eps.length)expand.append(el('p','hub-note','No episodes saved for this season. Use Edit series & seasons to add or load episodes.'));
  else{const rows=el('ol','hub-episode-list');for(const episode of [...eps].sort((a,b)=>Number(a.number??Infinity)-Number(b.number??Infinity))){const row=el('li','hub-episode');row.append(el('h4','',(episode.number!=null?'E'+episode.number+' · ':'')+(episode.title||'Untitled saved episode')));if(episode.overview)row.append(el('p','hub-note',episode.overview));row.append(controls(episode,{kind:'episode',parentId:parent.id,memberId:member.id,episodeId:episode.id,index:eps.indexOf(episode),title:episode.title,number:episode.number},member.title+' — '+(episode.title||'Episode '+episode.number)));rows.append(row)}expand.append(rows)}
  season.append(expand);grid.append(season);
 }
 section.append(grid);root.append(section);refreshers.forEach(fn=>fn());
}
const api={groups,summary,render,ordered,artwork,description,setStatus};if(typeof module==='object')module.exports=api;else root.ClassicCollections=api;
})(typeof globalThis!=='undefined'?globalThis:this);
