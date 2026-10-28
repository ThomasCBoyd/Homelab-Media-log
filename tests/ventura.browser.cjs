const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.TEST_URL||'http://127.0.0.1:8769';
const key='comcast-collection-v1';
const output=process.env.SCREENSHOT_DIR||'docs/ventura/screenshots';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const data={channels:[],items:[{id:'box',type:'movie',title:'Voyager Collection',owned:true},{id:'film',type:'movie',title:'The Last Horizon',owned:true,ripped:false,added:false},{id:'tv',type:'show',title:'Beyond the Blue',owned:true,ripped:false,added:false}],collectionChildren:[{id:'child',parentId:'box',title:'Voyager',owned:false,ripped:true,added:false},{id:'s1',parentId:'tv',title:'Season 1',owned:true}],movieDetails:{film:{year:'2024',genres:'Adventure, Science Fiction',runtime:'126 minutes',description:'A crew follows a distant signal across an ocean of stars. Every discovery brings them closer to the home they left behind.',tmdb:{backdrop_path:'/wide.svg'}},child:{description:'A saved movie in your collection.'}},showDetails:{tv:{year:'2023',description:'New worlds. Familiar faces. A journey through the unexplored, one season at a time.',tmdb:{backdrop:'https://art.test/broken.jpg'},episodes:{s1:[{id:'e1',number:1,title:'A New Beginning',overview:'The journey begins.',owned:true,ripped:false,added:false},{id:'e2',number:2,title:'The Signal',owned:false,ripped:false,added:true}]},deletedEpisodes:{s1:['n:9']}}},custom:{untouched:['personal',42]},deletedMovieChildren:{box:['old']}};
const posters={film:'https://art.test/poster.svg',tv:'https://art.test/poster.svg',child:'https://art.test/poster.svg'};
(async()=>{
 const browser=await engine.launch(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}:{headless:true});
 try{for(const width of [320,390,844,1280]){
 const context=await browser.newContext({viewport:{width,height:width===844?390:844},isMobile:width<900,hasTouch:true});
 await context.addInitScript(({data,posters,key})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(data));localStorage.setItem('comcast-posters-v1',JSON.stringify(posters));localStorage.setItem('comcast-manual-posters-v1','["film"]')}},{data,posters,key});
 // Disable background requests to measure presentation-only storage behavior exactly.
 await context.route('**/metadata.js',r=>r.fulfill({contentType:'text/javascript',body:'window.ClassicMetadata={create:()=>({folder:x=>x.id==="box",scan:()=>{},lookup:()=>Promise.resolve(),interactive:()=>{},alias:()=>{}})}'}));
 await context.route(/^https:\/\/(?:art\.test|image\.tmdb\.org)\//,r=>r.request().url().endsWith('.jpg')?r.fulfill({status:404}):r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g"><stop stop-color="#123c62"/><stop offset="1" stop-color="#b49b62"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1600v1000H0z"/><circle cx="1200" cy="200" r="100" fill="#f4dc99"/><path d="M0 800L400 300 800 850 1200 400 1600 800v200H0" fill="#0c304a"/></svg>'}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 const fit=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
 await page.goto(base+'/movie.html?id=film');assert.equal(await page.locator('.detail-art img').getAttribute('src'),'https://image.tmdb.org/t/p/w1280/wide.svg');await fit();assert.deepEqual(await read(),data);
 assert.equal(await page.locator('#collectionCard').isVisible(),false);
 await page.evaluate(k=>{const d=JSON.parse(localStorage.getItem(k));d.custom.concurrent='keep';localStorage.setItem(k,JSON.stringify(d))},key);
 await page.getByRole('checkbox',{name:'Ripped The Last Horizon',exact:true}).check();
 let expected=structuredClone(data);expected.custom.concurrent='keep';expected.items[1].ripped=true;assert.deepEqual(await read(),expected);
 await page.getByRole('checkbox',{name:'In Jellyfin The Last Horizon',exact:true}).check();expected.items[1].added=true;assert.deepEqual(await read(),expected);
 await page.evaluate(()=>{window.oldSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error('Full')}});
 await page.getByRole('checkbox',{name:'Owned The Last Horizon',exact:true}).click();assert(await page.getByRole('checkbox',{name:'Owned The Last Horizon',exact:true}).isChecked());assert.deepEqual(await read(),expected);
 await page.evaluate(()=>Storage.prototype.setItem=window.oldSet);
 await page.locator('#editInfo').click();await page.locator('#titleInput').fill('Cancelled title');await page.locator('#cancelInfo').click();assert.deepEqual(await read(),expected);
 page.once('dialog',d=>d.accept('https://art.test/new.svg'));await page.locator('#changePoster').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('comcast-posters-v1')).film),'https://art.test/new.svg');
 await page.evaluate(()=>{document.getElementById('status').textContent='';scrollTo(0,0)});await fit();fs.mkdirSync(output,{recursive:true});await page.screenshot({path:`${output}/movie-${process.env.BROWSER||'chrome'}-${width}.png`,fullPage:true});
 await page.locator('#editInfo').click();await page.locator('#descriptionInput').fill('My saved overview');await page.locator('#saveInfo').click();assert.equal((await read()).movieDetails.film.description,'My saved overview');assert.deepEqual((await read()).custom,expected.custom);
 await page.goto(base+'/movie.html?id=child&parent=box');assert.equal(await page.locator('#collectionRelationship').textContent(),'Part of Voyager Collection');await fit();
 await page.goto(base+'/movie.html?id=box');assert.equal(await page.locator('body').evaluate(x=>x.classList.contains('cinematic')),false);
 await page.goto(base+'/show.html?id=tv');await fit();assert.equal(await page.locator('.season-head').count(),1);await page.locator('.season-head').press('Enter');await fit();
 if(process.env.COMPACT){assert((await page.locator('.season-head').boundingBox()).height<=64);assert.equal(await page.locator('progress').count(),3);assert.equal(await page.locator('progress').first().getAttribute('max'),'2');assert.equal(await page.locator('progress').first().getAttribute('value'),'1');await page.locator('.season-head').press('Space');assert.equal(await page.locator('.episode-row').count(),0);await page.locator('.season-head').press('Enter');}

 await page.getByRole('checkbox',{name:'Ripped A New Beginning',exact:true}).check();assert.equal((await read()).showDetails.tv.episodes.s1[0].ripped,true);
 await page.getByRole('button',{name:'Mark All Owned',exact:true}).click();assert((await read()).showDetails.tv.episodes.s1.every(x=>x.owned));
 await page.locator('.ep-name').first().press('Enter');assert.equal(await page.locator('.episode-detail').textContent(),'The journey begins.');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Remove The Signal',exact:true}).click();await page.getByRole('button',{name:'↶ Undo Delete',exact:true}).click();assert.equal((await read()).showDetails.tv.episodes.s1.length,2);
 await page.waitForFunction(()=>document.querySelector('.detail-art img')?.src.endsWith('poster.svg'));await page.evaluate(()=>{document.getElementById('status').textContent='';scrollTo(0,0)});await fit();await page.screenshot({path:`${output}/tv-${process.env.BROWSER||'chrome'}-${width}.png`,fullPage:true});
 assert.deepEqual(errors,[]);await page.evaluate(k=>localStorage.setItem(k,'{unreadable'),key);for(const route of ['/movie.html?id=film','/show.html?id=tv']){await page.goto(base+route);assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),'{unreadable')}assert.deepEqual(errors,[]);await context.close();console.log(`${process.env.BROWSER||'chrome'} ${width}: layout, controls, storage, fallbacks passed`);
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
