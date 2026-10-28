const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fixture=require('./home-fixture.json');
const base=process.env.TEST_URL||'http://127.0.0.1:8769';
(async()=>{
 const engine=process.env.BROWSER==='webkit'?webkit:chromium;
 const browser=await engine.launch(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}:{headless:true});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:true,reducedMotion:'reduce'});
  const data=structuredClone(fixture.data);
  for(let i=0;i<24;i++)data.items.push({id:'extra-'+i,type:i%2?'show':'movie',title:'Extra '+i,owned:true});
  await context.addInitScript(data=>{if(!localStorage.getItem('comcast-collection-v1'))localStorage.setItem('comcast-collection-v1',JSON.stringify(data))},data);
  await context.route('https://posters.thomasboydspam.workers.dev/**',r=>r.fulfill({json:{results:[]}}));
  await context.route('https://art.test/**',async r=>{await new Promise(resolve=>setTimeout(resolve,250));await r.fulfill({status:404,body:''})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.evaluate(()=>metadata.stop());
  // Exercise Home after a Collections history entry, not only on a fresh page.
  await page.locator('#collectionsTab').click();await page.locator('.hub-card').first().click();
  await page.locator('#homeTab').click();
  const baseline=await page.evaluate(()=>localStorage.getItem('comcast-collection-v1'));
  // Both movie and TV routes, browser Back and existing app links, plus a full reload.
  for(const [kind,back] of [['show','browser'],['movie','link'],['show','link'],['movie','browser']]){
   await page.locator('.home-indicator').nth(2).click();
   await page.evaluate(()=>{
    statusFilter='owned';$('statusFilter').value='owned';view='grid';opened.add('test-selection');
    window.dispatchEvent(new Event('touchstart'));
    const strips=document.querySelectorAll('.home-poster-strip');strips[0].scrollLeft=360;strips[1].scrollLeft=720;
    window.scrollTo(0,600);
   });
   const expected=await page.evaluate(()=>({y:scrollY,x:[...document.querySelectorAll('.home-poster-strip')].map(n=>n.scrollLeft),key:document.querySelector('.home-feature-card').dataset.recordKey}));
   await page.evaluate(kind=>document.querySelector('.home-poster-tile[data-record-key^="'+kind+':"]').click(),kind);
   await page.waitForURL('**/'+kind+'.html?**');
   if(back==='browser')await page.goBack();else await page.locator(kind==='show'?'#backLink':'#back').click();
   await page.waitForSelector('.home-poster-strip');await page.waitForTimeout(1700);
   async function check(){
    const actual=await page.evaluate(()=>({y:scrollY,x:[...document.querySelectorAll('.home-poster-strip')].map(n=>n.scrollLeft),key:document.querySelector('.home-feature-card').dataset.recordKey,filter:statusFilter,view,opened:[...opened]}));
    assert.deepEqual(actual.x,expected.x);assert(Math.abs(actual.y-expected.y)<=2,JSON.stringify({actual,expected}));assert.equal(actual.key,expected.key);assert.equal(actual.filter,'owned');assert.equal(actual.view,'grid');assert(actual.opened.includes('test-selection'));
   }
   await check();
   // A cached document can return with native scroll offsets already reset.
   // The departure snapshot must win over that transient DOM state.
   await page.evaluate(()=>{
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    document.querySelectorAll('.home-poster-strip').forEach(n=>n.scrollLeft=0);
    window.scrollTo(0,0);
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
   });
   await page.waitForTimeout(1700);await check();await page.reload();await page.waitForTimeout(1700);await check();
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForTimeout(1700);await check();
  }
  const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('comcast-collection-v1'))),before=JSON.parse(baseline);
  for(const key of ['items','channels','collectionChildren','custom'])assert.deepEqual(saved[key],before[key]);
  assert.equal(saved.showDetails.series.description,before.showDetails.series.description);
  assert.deepEqual(saved.showDetails['episode-show'].episodes,before.showDetails['episode-show'].episodes);
  assert.deepEqual(errors,[]);console.log('PASS '+width+'px: independent shelves, vertical scroll, featured slide, filters/selection, browser Back, app links, reload and render; ownership and manual data unchanged');await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
