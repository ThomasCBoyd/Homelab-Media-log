const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_URL||'http://127.0.0.1:8769';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const storageKey='comcast-collection-v1';
const data={
 channels:[],
 items:[{id:'box',type:'movie',title:'Saved Movie Trilogy',owned:true,ripped:false,added:false},{id:'tv',type:'show',title:'Saved Space Series',owned:true,ripped:false,added:false}],
 collectionChildren:[
  {id:'film2',parentId:'box',title:'Second Saved Movie',owned:true,ripped:false,added:false},
  {id:'film1',parentId:'box',title:'First Saved Movie',owned:true,ripped:true,added:false},
  {id:'film3',parentId:'box',title:'Third Saved Movie',owned:false,ripped:false,added:false},
  {id:'s2',parentId:'tv',title:'Season 2',owned:true,ripped:false,added:false},
  {id:'s1',parentId:'tv',title:'Season 1',owned:true,ripped:false,added:true},
  {id:'s3',parentId:'tv',title:'Season 3',owned:false,ripped:false,added:false}
 ],
 movieDetails:{box:{description:'A collection of adventures, exactly as saved in your library.',manualFields:['description'],tmdb:{backdrop:'https://art.test/wide.svg'}},film1:{year:'2001'},film2:{year:'2004'},film3:{year:'2007'}},
 showDetails:{tv:{description:'Across new worlds and familiar faces. Explore the seasons you have saved.',tmdb:{backdrop:'https://art.test/broken.jpg',poster:'https://art.test/poster.svg',seasons:[{number:1,poster:'https://art.test/season.svg'}]},episodes:{s1:[{id:'e2',number:2,title:'Second saved episode',overview:'A saved description.',owned:false,ripped:false,added:true},{id:'e1',number:1,title:'Pilot — custom title',owned:true,ripped:false,added:false,customTitle:true}],s2:[{id:'e3',number:1,title:'Return',owned:false,ripped:false,added:false}]},deletedEpisodes:{s1:['n:9']}}},
 deletedMovieChildren:{box:['deleted-record']},custom:{preserve:['unknown',42]}
};
for(const item of [...data.items,...data.collectionChildren.filter(x=>x.parentId==='box')]){
 if(item.id==='box')continue;
 const d=item.type==='show'?data.showDetails[item.id]:data.movieDetails[item.id];
 const year=d.year||'';
 d.metadataLookup={identity:(item.type==='show'?'tv':'movie')+'|'+item.title.toLowerCase()+'|'+year,status:'unavailable',nextAttempt:Date.now()+86400000};
}
const posters={box:'https://art.test/poster.svg',film1:'https://art.test/poster.svg',film2:'https://art.test/poster.svg',film3:'https://art.test/missing.jpg',tv:'https://art.test/poster.svg'};
(async()=>{
 const browser=await engine.launch(engine===chromium?{executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}:{headless:true});
 try{
 for(const width of [320,390,844,1280]){
  const context=await browser.newContext({viewport:{width,height:width===844?390:844},isMobile:width<900,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(({data,posters,key})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(data));localStorage.setItem('comcast-posters-v1',JSON.stringify(posters));localStorage.setItem('comcast-manual-posters-v1','["box","film1"]')}},{data,posters,key:storageKey});
  await context.route('https://posters.thomasboydspam.workers.dev/**',r=>r.fulfill({json:{results:[]}}));
  await context.route('https://art.test/**',r=>r.request().url().endsWith('.jpg')?r.fulfill({status:404,body:''}):r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g"><stop stop-color="#123d68"/><stop offset="1" stop-color="#9d885b"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1600v900H0z"/><circle cx="1200" cy="200" r="90" fill="#f4cf85"/><path d="M0 700L400 300l300 400 400-400 500 450v150H0" fill="#173e58"/></svg>'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.evaluate(()=>metadata.stop());
  const original=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
  const otherStorage=await page.evaluate(()=>[localStorage.getItem(POSTER_KEY),localStorage.getItem(MANUAL_KEY)]);
  const fit=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow at '+width);
  const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
  await page.locator('#collectionsTab').click();assert.equal(await page.locator('.hub-card').count(),2);
  await page.getByRole('button',{name:/Saved Movie Trilogy/}).click();await fit();
  assert.deepEqual(await page.locator('.hub-movie h3').allTextContents(),['First Saved Movie','Second Saved Movie','Third Saved Movie']);
  assert.equal(await page.locator('.hub-backdrop img').getAttribute('src'),'https://art.test/wide.svg');
  assert.equal(await page.locator('.hub-count strong').nth(1).innerText(),'2/3');
  await page.locator('.hub-movie').nth(2).scrollIntoViewIfNeeded();await page.locator('.hub-movie').nth(2).locator('img').waitFor({state:'detached'});
  assert.deepEqual(await read(),original);
  await page.goBack();await page.waitForSelector('.hub-card');await page.goForward();await page.waitForSelector('.hub-movie');
  // Patch a different field after rendering to simulate another tab's newer saved data.
  await page.evaluate(key=>{const d=JSON.parse(localStorage.getItem(key));d.custom.concurrent='keep me';localStorage.setItem(key,JSON.stringify(d))},storageKey);
  const expected=structuredClone(original);expected.custom.concurrent='keep me';
  await page.getByRole('checkbox',{name:'Ripped Second Saved Movie',exact:true}).check();expected.collectionChildren[0].ripped=true;
  assert.deepEqual(await read(),expected);assert.equal(await page.locator('.hub-count strong').nth(2).innerText(),'2/3');
  await page.getByRole('checkbox',{name:'Added to Jellyfin Second Saved Movie',exact:true}).check();expected.collectionChildren[0].added=true;
  assert.deepEqual(await read(),expected);
  // Write failure rolls the checkbox back and leaves stored data untouched.
  await page.evaluate(()=>{window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='comcast-collection-v1')throw new DOMException('Full','QuotaExceededError');return window.originalStorageSet.call(this,k,v)}});
  await page.getByRole('checkbox',{name:'Owned Third Saved Movie',exact:true}).click();
  assert.equal(await page.getByRole('checkbox',{name:'Owned Third Saved Movie',exact:true}).isChecked(),false);assert.match(await page.locator('.hub-feedback').innerText(),/Could not save/);assert.deepEqual(await read(),expected);
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageSet});
  await page.getByRole('checkbox',{name:'Added to Jellyfin Second Saved Movie',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Added to Jellyfin Second Saved Movie',exact:true}).check();assert.deepEqual(await read(),expected);
  await page.screenshot({path:'/private/tmp/cinematic-movies-'+(engine===webkit?'webkit':'chrome')+'-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:/First Saved Movie/}).click();await page.waitForURL('**/movie.html?id=film1&parent=box');await page.goBack();await page.waitForSelector('.hub-movie');await page.evaluate(()=>metadata.stop());
  await page.getByRole('button',{name:'← All Collections'}).click();await page.getByRole('button',{name:/Saved Space Series/}).click();await fit();
  assert.deepEqual(await page.locator('.hub-season-title').allTextContents(),['Season 1','Season 2','Season 3']);
  await page.waitForFunction(()=>document.querySelector('.hub-backdrop img')?.src==='https://art.test/poster.svg');
  const first=page.locator('.hub-episodes').first();await first.locator('summary').click();assert.deepEqual(await first.locator('h4').allTextContents(),['E1 · Pilot — custom title','E2 · Second saved episode']);
  await page.getByRole('checkbox',{name:'Ripped Season 1 — Pilot — custom title',exact:true}).check();expected.showDetails.tv.episodes.s1[1].ripped=true;
  assert.deepEqual(await read(),expected);assert.equal(await page.getByRole('checkbox',{name:'Ripped Season 1',exact:true}).isChecked(),false);
  await page.getByRole('checkbox',{name:'Owned Season 2',exact:true}).uncheck();expected.collectionChildren[3].owned=false;
  assert.deepEqual(await read(),expected);assert.equal(await page.locator('.hub-count strong').nth(1).innerText(),'1/3');
  await page.locator('.hub-episodes').nth(2).locator('summary').click();assert.match(await page.locator('.hub-episodes').nth(2).innerText(),/No episodes saved/);
  await page.reload();await page.evaluate(()=>metadata.stop());assert(await first.evaluate(n=>n.open));assert(await page.getByRole('checkbox',{name:'Ripped Season 1 — Pilot — custom title',exact:true}).isChecked());
  await page.screenshot({path:'/private/tmp/cinematic-tv-'+(engine===webkit?'webkit':'chrome')+'-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:'Season 1',exact:true}).click();await page.waitForURL('**/show.html?id=tv');await page.locator('#backLink').click();await page.waitForSelector('.hub-season');await page.evaluate(()=>metadata.stop());
  assert(await first.evaluate(n=>n.open));assert.deepEqual(await read(),expected);
  await page.locator('#search').fill('First Saved Movie');await page.locator('#searchDone').click();assert.match(await page.locator('#content').innerText(),/First Saved Movie/);await page.locator('#searchClear').click();assert.equal(await page.locator('.hub-detail h2').innerText(),'Saved Space Series');
  assert.deepEqual(await page.evaluate(()=>[localStorage.getItem(POSTER_KEY),localStorage.getItem(MANUAL_KEY)]),otherStorage);assert.deepEqual(errors,[]);await fit();
  // A prior Collections history entry must not hijack a later Home detail-page return.
  await page.locator('#homeTab').click();await page.waitForSelector('.home-poster-tile');
  await page.evaluate(()=>document.querySelector('.home-poster-tile[data-record-key^="movie:"]').click());
  await page.waitForURL('**/movie.html?**');await page.goBack();await page.waitForSelector('.home-poster-tile');
  assert.equal(await page.locator('#homeTab').getAttribute('class'),'active');assert.equal(await page.locator('.hub-detail').count(),0);
  assert.deepEqual(await read(),expected);assert.deepEqual(errors,[]);
  console.log('PASS '+(engine===webkit?'WebKit':'Chrome')+' '+width+'px: hero/fallbacks, movie/season/episode order, independent edits, exact data preservation, concurrent edit, failed save, Back/Forward, detail links, expansion/reload, search and layout');
  await context.close();
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
