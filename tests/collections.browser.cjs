const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
const base=process.env.TEST_URL||'http://127.0.0.1:8769';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const width of [320,390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
  await context.route('https://posters.thomasboydspam.workers.dev/**',r=>r.fulfill({json:{results:[]}}));
  await context.route('https://art.test/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="navy"/></svg>'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  await page.evaluate(()=>{localStorage.clear();const d={channels:[],items:[{id:'box',title:'Test Movie Box',type:'movie',owned:true},{id:'tv',title:'Test TV Collection',type:'show',owned:true}],collectionChildren:[{id:'film',parentId:'box',title:'Test Film',owned:false,ripped:true,added:false},{id:'season',parentId:'tv',title:'Season 1',owned:true,ripped:false,added:true}],showDetails:{tv:{episodes:{},deletedEpisodes:{},metadataLookup:{identity:'tv|test tv collection|',status:'unavailable',nextAttempt:Date.now()+86400000}}},movieDetails:{film:{metadataLookup:{identity:'movie|test film|',status:'unavailable',nextAttempt:Date.now()+86400000}}},deletedMovieChildren:{},custom:{untouched:'yes'}};localStorage.setItem('comcast-collection-v1',JSON.stringify(d));localStorage.setItem('comcast-posters-v1',JSON.stringify({box:'https://art.test/poster.svg'}));localStorage.setItem('comcast-manual-posters-v1','["box"]');sessionStorage.clear()});await page.reload();await page.evaluate(()=>metadata.stop());
  const before=await page.evaluate(()=>[localStorage.getItem(KEY),localStorage.getItem(POSTER_KEY),localStorage.getItem(MANUAL_KEY)]);
  await page.locator('#collectionsTab').click();assert.equal(await page.locator('.hub-card').count(),2);assert(await page.locator('.hub-card').first().innerText().then(t=>t.includes('0/1 Owned')));
  const fit=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow at '+width);await fit();await page.screenshot({path:'/private/tmp/collections-overview-'+width+'.png',fullPage:true});
  assert(await page.locator('.hub-art img').first().evaluate(img=>img.complete&&img.naturalWidth>0));
  await page.getByRole('button',{name:/Test Movie Box/}).click();await fit();await page.reload();assert.equal(await page.locator('.hub-detail h2').innerText(),'Test Movie Box');
  await page.getByRole('button',{name:'Test Film',exact:true}).click();await page.waitForURL('**/movie.html?id=film&parent=box');await page.locator('#back').click();await page.waitForSelector('.hub-detail');assert.equal(await page.locator('.hub-detail h2').innerText(),'Test Movie Box');
  await page.getByRole('button',{name:'← All Collections'}).click();await page.getByRole('button',{name:/Test TV Collection/}).click();await page.getByRole('button',{name:'Season 1',exact:true}).click();await page.waitForURL('**/show.html?id=tv');await page.locator('#backLink').click();await page.waitForSelector('.hub-detail');assert.equal(await page.locator('.hub-detail h2').innerText(),'Test TV Collection');
  await page.locator('#search').fill('Test Film');await page.locator('#searchDone').click();assert((await page.locator('#content').innerText()).includes('Test Film'));await page.locator('#searchClear').click();assert.equal(await page.locator('.hub-detail h2').innerText(),'Test TV Collection');
  const after=await page.evaluate(()=>[localStorage.getItem(KEY),localStorage.getItem(POSTER_KEY),localStorage.getItem(MANUAL_KEY)]);assert.deepEqual(after,before);assert.deepEqual(errors,[]);
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()});await page.reload();await page.locator('#collectionsTab').click();assert.equal(await page.locator('.hub-card').count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(KEY)).items.length),0);await fit();
  await page.screenshot({path:'/private/tmp/collections-'+width+'.png',fullPage:true});console.log('PASS '+width+'px: layout, posters, summary, movie/season editor routes, return, reload, search, data preservation, empty state');await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
