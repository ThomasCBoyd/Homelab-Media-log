const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
// Reuse the existing Home fixture without requiring Python Playwright.
const fixture=JSON.parse(fs.readFileSync(process.env.HOME_FIXTURE||require('node:path').join(__dirname,'home-fixture.json'),'utf8'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:true,isMobile:width<600,reducedMotion:'reduce'});
  await context.addInitScript(({data,posters})=>{if(!localStorage.getItem('comcast-collection-v1')){localStorage.setItem('comcast-collection-v1',JSON.stringify(data));localStorage.setItem('comcast-posters-v1',JSON.stringify(posters));}},fixture);
  await context.route('https://posters.thomasboydspam.workers.dev/**',r=>r.fulfill({json:{results:[]}}));
  await context.route('https://art.test/**',r=>r.fulfill({status:404,body:''}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  async function home(){await page.goto('http://127.0.0.1:8000');await page.evaluate(()=>metadata.stop());}
  await home();const baseline=await page.evaluate(()=>localStorage.getItem('comcast-collection-v1'));
  assert.equal(await page.locator('.home-indicator').count(),5);
  assert.equal(await page.locator('.home-shelf').count(),2);
  assert.equal(await page.locator('.home-status-count').allTextContents().then(x=>x.join(',')),'3,1');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.evaluate(()=>document.querySelector('.home-masthead').nextElementSibling.classList.contains('main-tabs')));
  await page.getByRole('button',{name:/Ready to Rip/}).click();
  assert.equal(await page.locator('.home-queue-title').count(),3);
  await page.getByRole('button',{name:/Ready for Jellyfin/}).click();
  await page.locator('.home-queue-title').click();await page.waitForURL('**/movie.html?id=movie');
  await home();await page.locator('.home-poster-tile[data-record-key="movie:folder:child"]').first().click();await page.waitForURL('**/movie.html?id=child&parent=folder');
  await home();await page.locator('.home-poster-tile[data-record-key="show:series"]').first().click();await page.waitForURL('**/show.html?id=series');
  await home();
  if(width===390){assert(await page.locator('.home-poster-strip').first().evaluate(n=>n.scrollWidth>n.clientWidth));await page.locator('.home-poster-strip').first().evaluate(n=>n.scrollLeft=150);assert(await page.locator('.home-poster-strip').first().evaluate(n=>n.scrollLeft>0));}
  const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('comcast-collection-v1'))),before=JSON.parse(baseline);
  for(const key of ['items','collectionChildren','channels','custom'])assert.deepEqual(saved[key],before[key]);
  assert.equal(saved.showDetails.series.description,before.showDetails.series.description);assert.deepEqual(saved.showDetails['episode-show'].episodes,before.showDetails['episode-show'].episodes);
  assert(await page.evaluate(()=>{const before=localStorage.getItem('comcast-collection-v1');render();return before===localStorage.getItem('comcast-collection-v1')}));
  await page.getByRole('button',{name:'⚙ Tools',exact:true}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Backup',exact:true}).click();
  const exported=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));assert.deepEqual(exported.items,fixture.data.items);assert.deepEqual(exported.collectionChildren,fixture.data.collectionChildren);
  exported.roundTrip='verified';await page.locator('#restoreFile').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('comcast-collection-v1')).roundTrip==='verified');
  await page.locator('#guideTab').click();await page.locator('#movieTab').click();await page.locator('#dashboardTab').click();
  await page.locator('#search').fill('Owned Child');assert(await page.locator('#searchSuggestions').isVisible());await page.locator('#searchClear').click();await page.locator('#homeTab').click();
  await page.screenshot({path:`/tmp/home-redesign-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: layout, queues, shelves, exact routes, storage, backup/restore, tabs/search, no runtime errors`);await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
