/* Read-only Home projection. Navigation and persistence stay with the existing app. */
(function(root){
  'use strict';
  const id=value=>String(value);
  function records(data){
    const children=data.collectionChildren||[], result=[],seen=new Set();
    function add(item,kind,parent){
      const key=kind+':'+(parent?id(parent.id)+':':'')+id(item.id);
      if(item.id==null||seen.has(key))return;seen.add(key);
      const detail=(kind==='show'?data.showDetails:data.movieDetails)?.[id(item.id)]||{};
      const seasons=kind==='show'?children.filter(x=>id(x.parentId)===id(item.id)):[];
      const episodes=seasons.flatMap(s=>Array.isArray(detail.episodes?.[id(s.id)])?detail.episodes[id(s.id)]:[]);
      const ownedSeasons=seasons.filter(s=>s.owned).length,ownedEpisodes=episodes.filter(e=>e.owned).length;
      const owned=!!item.owned||(kind==='show'&&(ownedSeasons>0||ownedEpisodes>0));
      const ownership=kind==='movie'?'Movie marked Owned':item.owned?'Series marked Owned':
        [ownedSeasons?ownedSeasons+' season'+(ownedSeasons===1?'':'s')+' marked Owned':'',ownedEpisodes?ownedEpisodes+' episode'+(ownedEpisodes===1?'':'s')+' marked Owned':''].filter(Boolean).join(' · ');
      const channel=kind==='show'?data.channels.find(c=>id(c.id)===id(item.channel)):null;
      result.push({key,item,kind,parent,detail,seasons,episodes,owned,ownership,channel});
    }
    for(const item of data.items||[]){
      if(item.type==='show')add(item,'show');
      if(item.type==='movie'){
        const members=children.filter(x=>id(x.parentId)===id(item.id));
        // Match the app's collection-folder convention; folders are never films.
        if(!members.length&&!/\b(collection|box\s*set|film\s*set)\b/i.test(item.title))add(item,'movie');
        for(const member of members)add(member,'movie',item);
      }
    }
    return result;
  }
  function organizingReason(record){
    if(record.kind==='show'&&!record.item.owned){
      if(record.episodes.some(e=>e.owned&&!e.ripped))return 'Review owned episodes not marked Ripped';
      if(record.seasons.some(s=>s.owned&&!s.ripped))return 'Review owned seasons not marked Ripped';
      return 'Review season & episode tracking';
    }
    if(!record.item.ripped)return 'Not marked Ripped';
    if(!record.item.added)return 'Not marked In Jellyfin';
    return 'Review saved details';
  }
  function model(data,now=Date.now()){
    const all=records(data),featured=all.filter(r=>r.owned);
    const recent=all.map(record=>({record,time:record.detail.metadataLookup?.updatedAt}))
      .filter(x=>x.record.detail.metadataLookup?.status==='ok'&&typeof x.time==='number'&&Number.isFinite(x.time)&&x.time>0&&x.time<=now&&now-x.time<=30*86400000)
      .sort((a,b)=>b.time-a.time).slice(0,6);
    // Status is evaluated at each saved tracking level, never inferred from a folder.
    function pending(record,field){
      const units=[record.item,...(record.kind==='show'?[...record.seasons,...record.episodes]:[])];
      return units.some(unit=>unit.owned&&(field==='ripped'?!unit.ripped:unit.ripped&&!unit.added));
    }
    const readyToRip=featured.filter(r=>pending(r,'ripped'));
    const readyForJellyfin=featured.filter(r=>pending(r,'added'));
    // Alternate media types while preserving saved order within each type.
    function mixed(entries){const shows=entries.filter(r=>r.kind==='show'),movies=entries.filter(r=>r.kind==='movie'),out=[];while(shows.length||movies.length){if(shows.length)out.push(shows.shift());if(movies.length)out.push(movies.shift())}return out}
    return {all,featured,recent,readyToRip,readyForJellyfin,shelves:[mixed(featured),mixed(all)],organizing:featured.slice(0,6).map(record=>({record,reason:organizingReason(record)}))};
  }
  function artwork(record,posters,manualIds=new Set()){
    const d=record.detail,poster=posters[id(record.item.id)]||d.poster||d.tmdb?.poster||d.metadata?.poster;
    const backdrop=d.backdrop||d.tmdb?.backdrop||d.metadata?.backdrop;
    const manual=manualIds.has(id(record.item.id))||d.manualPoster||(poster&&poster!==d.tmdb?.poster);
    // A wide backdrop is better suited to the hero than a thumbnail poster.
    // Upgrade TMDB image sizes without changing saved artwork or metadata.
    function highRes(url){
      if(typeof url!=='string'||!url.startsWith('https://'))return null;
      try{
        const parsed=new URL(url);
        if(parsed.hostname==='image.tmdb.org'){
          const segments=parsed.pathname.split('/');
          if(segments[1]==='t'&&segments[2]==='p'&&/^(?:w[0-9]+|original)$/.test(segments[3]||'')){
            segments[3]='original';
            parsed.pathname=segments.join('/');
            return parsed.toString();
          }
        }
      }catch(_){}
      return url;
    }
    return [...new Set([backdrop,poster].filter(Boolean).map(highRes).filter(Boolean))];
  }
  // One timeout, always cancelled before another is scheduled. Mount owns cleanup.
  function rotation({next,setTimer=setTimeout,clearTimer=clearTimeout}){
    let timer=null,count=0,destroyed=false;const pauses=new Set();
    function schedule(){if(timer!==null)clearTimer(timer);timer=null;if(!destroyed&&count>1&&!pauses.size)timer=setTimer(()=>{timer=null;next();schedule()},6000)}
    return {count(value){count=value;schedule()},pause(reason,value){value?pauses.add(reason):pauses.delete(reason);schedule()},reset:schedule,destroy(){destroyed=true;if(timer!==null)clearTimer(timer);timer=null},get running(){return timer!==null}};
  }
  function create(adapter){
    let cleanup=()=>{},currentKey=null,userPaused=false,restoreFocus=null;
    const failedImages=new Set();
    function mount(target){
      cleanup();
      const document=target.ownerDocument,win=document.defaultView,content=model(adapter.getData());
      const listeners=[];function on(node,event,callback,options){node.addEventListener(event,callback,options);listeners.push(()=>node.removeEventListener(event,callback,options))}
      function el(tag,cls,text){const node=document.createElement(tag);node.className=cls||'';if(text!=null)node.textContent=text;return node}
      function button(text,cls,action,label){const node=el('button',cls,text);node.type='button';if(label)node.setAttribute('aria-label',label);on(node,'click',action);return node}
      const home=el('div','home-screen');target.append(home);
      const masthead=el('div','home-masthead');masthead.append(el('span','home-eyebrow','TV LAND / YOUR PERSONAL LINEUP'),el('h2','','Welcome to your collection'),el('p','','Your channels. Your classics. All in one place.'));home.append(masthead);
      const carousel=el('section','home-feature');carousel.setAttribute('role','region');carousel.setAttribute('aria-roledescription','carousel');carousel.setAttribute('aria-label','Featured From Your Collection');
      carousel.append(el('h3','home-section-label','Featured From Your Collection'));home.append(carousel);
      const motion=win.matchMedia('(prefers-reduced-motion: reduce)');
      let index=Math.max(0,content.featured.findIndex(r=>r.key===currentKey)),animation=null,artGeneration=0;
      const clock=rotation({next:()=>show(index+1,false)});
      const status=el('p','home-sr-only');status.setAttribute('role','status');
      let card,indicators=[],countLabel,pause;
      function draw(){
        const record=content.featured[index];currentKey=record.key;
        animation?.cancel();const generation=++artGeneration;
        const art=el('span','home-feature-art');art.setAttribute('aria-hidden','true');
        const choices=artwork(record,adapter.getPosters(),adapter.getManualIds?.()||new Set()).filter(url=>!failedImages.has(url));
        function load(){
          const url=choices.shift();if(!url||generation!==artGeneration)return;
          const image=el('img','');image.alt='';image.decoding='async';
          image.onerror=()=>{if(generation!==artGeneration)return;failedImages.add(url);image.remove();load()};image.src=url;art.append(image);
        }
        load();
        const copy=el('span','home-feature-copy');
        copy.append(el('span','home-kicker',record.kind==='show'?'ON YOUR TV DIAL':'FROM YOUR MOVIE SHELF'),el('span','home-feature-title',record.item.title),el('span','home-ownership',record.ownership));
        const meta=record.kind==='show'?(record.channel?record.channel.name+' · Channel '+record.channel.num:'TV Series'):(record.parent?'Movie · '+record.parent.title:'Movie');
        copy.append(el('span','home-feature-meta',[meta,record.detail.year||record.detail.tmdb?.firstAirDate?.slice(0,4)].filter(Boolean).join(' · ')));
        const description=record.detail.manualFields?.includes('description')?record.detail.description:(record.detail.description||record.detail.tmdb?.overview);
        if(description)copy.append(el('span','home-feature-description',description));
        copy.append(el('span','home-feature-cta','Open collection details →'));
        card.replaceChildren(art,copy);card.setAttribute('aria-label',record.item.title+'. '+record.ownership+'. Open details');card.dataset.recordKey=record.key;
        indicators.forEach((node,n)=>{node.setAttribute('aria-current',String(n===index));node.tabIndex=n===index?0:-1});
        const selectedDot=indicators[index],strip=selectedDot.parentElement,left=selectedDot.getBoundingClientRect().left-strip.getBoundingClientRect().left+strip.scrollLeft;
        if(left<strip.scrollLeft)strip.scrollLeft=left;else if(left+selectedDot.offsetWidth>strip.scrollLeft+strip.clientWidth)strip.scrollLeft=left+selectedDot.offsetWidth-strip.clientWidth;
        countLabel.textContent=(index+1)+' / '+content.featured.length;
        if(!motion.matches&&card.animate)animation=card.animate([{opacity:.35},{opacity:1}],{duration:450,easing:'ease-out'});
      }
      function show(next,manual=true){index=(next+content.featured.length)%content.featured.length;draw();if(manual){status.textContent=content.featured[index].item.title+'. '+(index+1)+' of '+content.featured.length;clock.reset()}}
      let preventClickUntil=0;
      if(!content.featured.length){
        const empty=el('div','home-feature-empty');empty.append(el('span','home-empty-mark','YOUR NEXT CLASSIC AWAITS'),el('h4','','Make this lineup yours'),el('p','','Titles you mark Owned will appear here. Owned seasons and episodes count too. Nothing in your collection has been changed.'),button('Browse TV Guide','home-gold',()=>adapter.tab('guide')));carousel.append(empty);
      }else{
        card=button('','home-feature-card',()=>{if(Date.now()>preventClickUntil)adapter.open(content.featured[index])});carousel.append(card);
        const controls=el('div','home-carousel-controls');
        const prev=button('←','home-control',()=>show(index-1), 'Previous featured title');
        const next=button('→','home-control',()=>show(index+1), 'Next featured title');
        const dots=el('div','home-indicators');dots.setAttribute('role','group');dots.setAttribute('aria-label','Choose a featured title');
        content.featured.forEach((record,n)=>{const dot=button('','home-indicator',()=>show(n),'Feature '+record.item.title);dot.append(el('span',''));on(dot,'keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const target=(n+(event.key==='ArrowRight'?1:-1)+indicators.length)%indicators.length;show(target);indicators[target].focus()});indicators.push(dot);dots.append(dot)});
        countLabel=el('span','home-slide-count');countLabel.setAttribute('aria-live','off');
        pause=button('','home-control home-pause',()=>{userPaused=!userPaused;clock.pause('user',userPaused);if(!userPaused){clock.pause('focus',false);clock.pause('hover',false)}updatePause()});
        function updatePause(){pause.textContent=motion.matches?'Motion off':userPaused?'Resume':'Pause';pause.disabled=content.featured.length<2||motion.matches;pause.setAttribute('aria-label',motion.matches?'Automatic carousel disabled for reduced motion':userPaused?'Resume automatic carousel':'Pause automatic carousel');pause.setAttribute('aria-pressed',String(userPaused))}
        updatePause();prev.disabled=next.disabled=content.featured.length<2;
        controls.append(prev,next,countLabel,dots,pause);carousel.append(controls,status);draw();
        clock.pause('hover',win.matchMedia('(hover: hover)').matches&&carousel.matches(':hover'));clock.pause('user',userPaused);clock.pause('motion',motion.matches);clock.pause('hidden',document.hidden);clock.count(content.featured.length);
        on(document,'visibilitychange',()=>clock.pause('hidden',document.hidden));
        on(win,'pagehide',()=>clock.pause('pagehide',true));on(win,'pageshow',()=>clock.pause('pagehide',false));
        const changeMotion=()=>{clock.pause('motion',motion.matches);if(motion.matches)animation?.cancel();updatePause()};
        if(motion.addEventListener)on(motion,'change',changeMotion);else{motion.addListener(changeMotion);listeners.push(()=>motion.removeListener(changeMotion))}
        on(carousel,'focusin',()=>clock.pause('focus',true));on(carousel,'focusout',event=>{if(!carousel.contains(event.relatedTarget))clock.pause('focus',false)});
        on(carousel,'pointerenter',event=>{if(event.pointerType==='mouse')clock.pause('hover',true)});on(carousel,'pointerleave',()=>clock.pause('hover',false));
        let gesture=null;
        on(card,'pointerdown',event=>{if(!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;gesture={x:event.clientX,y:event.clientY,id:event.pointerId};clock.pause('gesture',true);card.setPointerCapture?.(event.pointerId)});
        on(card,'pointerup',event=>{if(!gesture||gesture.id!==event.pointerId)return;const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){preventClickUntil=Date.now()+500;show(index+(dx<0?1:-1))}clock.pause('gesture',false)});
        on(card,'pointercancel',()=>{gesture=null;clock.pause('gesture',false)});
      }
      const shortcuts=el('section','home-status-shortcuts');shortcuts.setAttribute('aria-label','Collection tasks');home.append(shortcuts);
      let activeQueue=null;
      for(const [label,entries,hint] of [['Ready to Rip',content.readyToRip,'Owned, not marked Ripped'],['Ready for Jellyfin',content.readyForJellyfin,'Owned and Ripped, not marked In Jellyfin']]){
        const shortcut=button('','home-status-shortcut',()=>{
          const opening=activeQueue!==label;activeQueue=opening?label:null;
          [...shortcuts.children].forEach(node=>node.setAttribute('aria-expanded',String(opening&&node===shortcut)));
          queue.hidden=!opening;queue.replaceChildren();
          if(opening){queue.append(el('h3','',label),el('p','home-note',hint+'. Shows may have pending seasons or episodes.'));
            if(!entries.length)queue.append(el('p','home-note','No titles match these saved checkboxes.'));
            for(const record of entries)queue.append(button(record.item.title+' →','home-queue-title',()=>adapter.open(record)));
          }
        });
        shortcut.setAttribute('aria-expanded','false');shortcut.setAttribute('aria-controls','home-task-queue');
        shortcut.append(el('span','home-status-count',String(entries.length)),el('span','home-status-label',label+' →'));shortcuts.append(shortcut);
      }
      const queue=el('section','home-task-queue');queue.id='home-task-queue';queue.hidden=true;home.append(queue);
      function posterShelf(title,note,entries){
        const section=el('section','home-shelf');section.append(el('h3','',title),el('p','home-note',note));
        const list=el('div','home-poster-strip');list.setAttribute('role','group');list.setAttribute('aria-label',title);home.append(section);section.append(list);
        if(!entries.length){section.append(el('p','home-note','No titles here yet. Add titles and track ownership in TV Guide or Movies.'));return}
        for(const record of entries){
          const tile=button('','home-poster-tile',()=>adapter.open(record),record.item.title+'. Open '+(record.kind==='show'?'TV show':'movie')+' details');tile.dataset.recordKey=record.key;
          const art=el('span','home-poster-art',record.kind==='show'?'TV':'MOVIE');art.setAttribute('aria-hidden','true');
          const d=record.detail,choices=[adapter.getPosters()[id(record.item.id)],d.poster,d.tmdb?.poster,d.metadata?.poster].filter(url=>typeof url==='string'&&url.startsWith('https://')&&!failedImages.has(url));
          function loadPoster(){const url=choices.shift();if(!url)return;const img=el('img','');img.alt='';img.loading='lazy';img.decoding='async';img.onerror=()=>{failedImages.add(url);img.remove();loadPoster()};img.src=url;art.append(img)}loadPoster();
          const scope=record.kind==='show'?'TV Show':record.parent?'Movie · '+record.parent.title:'Movie';
          const tracking=record.item.owned?[record.item.ripped?'Ripped':'Not ripped',record.item.added?'In Jellyfin':'Not in Jellyfin'].join(' · '):record.owned?'Owned seasons / episodes':'Not marked Owned';
          tile.append(art,el('span','home-poster-title',record.item.title),el('span','home-poster-kind',scope),el('span','home-poster-status',tracking));list.append(tile);
        }
      }
      posterShelf('On Your Shelves','Owned movies & TV shows · swipe to browse',content.shelves[0]);
      posterShelf('Explore Your Collection','All saved movies & TV shows · collection order, not recently added',content.shelves[1]);
      if(restoreFocus){const focusTarget=restoreFocus==='card'?card:[...carousel.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===restoreFocus);focusTarget?.focus({preventScroll:true});restoreFocus=null}
      cleanup=()=>{if(carousel.contains(document.activeElement))restoreFocus=document.activeElement===card?'card':document.activeElement.getAttribute('aria-label');++artGeneration;clock.destroy();animation?.cancel();listeners.forEach(remove=>remove());};
    }
    return {mount,unmount(){cleanup();cleanup=()=>{};}};
  }
  root.ClassicHome={records,model,artwork,organizingReason,rotation,create};
  if(typeof module!=='undefined')module.exports=root.ClassicHome;
})(typeof window==='undefined'?globalThis:window);

