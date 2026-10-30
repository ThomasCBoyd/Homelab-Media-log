const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const fixture={
 channels:[{id:'ch-1',num:'62',name:'Cartoon Network'}],
 items:[{id:'local-1',type:'show',title:'Local Hero',channel:'ch-1',owned:false,ripped:false,added:false}],
 collectionChildren:[],showDetails:{},movieDetails:{},deletedMovieChildren:[],customCollectionField:{keep:true}
};
const movie={id:501,title:'Spider-Man: Homecoming',release_date:'2017-07-07',overview:'A young hero joins the Avengers.',poster:'/poster.jpg',genres:['Action'],runtime:133};
const show={id:502,name:'The Bear',first_air_date:'2022-06-23',overview:'A chef returns to Chicago.',poster:'/bear.jpg',genres:['Drama'],episode_run_time:[30]};

test('TMDB discovery previews and confirms movies and TV without changing existing search or storage',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},is_mobile:true,has_touch:true});
 await context.addInitScript(value=>localStorage.setItem('comcast-collection-v1',JSON.stringify(value)),fixture);
 const page=await context.newPage(),detailCalls=[];
 await page.route('https://posters.thomasboydspam.workers.dev/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path.endsWith('/movie/search'))return route.fulfill({json:{results:[{id:501,title:movie.title,release_date:movie.release_date,overview:movie.overview,poster:movie.poster}]}});
  if(path.endsWith('/tv/search'))return route.fulfill({json:{results:[{id:502,name:show.name,first_air_date:show.first_air_date,overview:show.overview,poster:show.poster}]}});
  if(path.endsWith('/movie/details')){detailCalls.push(path);return route.fulfill({json:movie})}
  if(path.endsWith('/tv/details')){detailCalls.push(path);return route.fulfill({json:show})}
  return route.fulfill({status:404,json:{error:'unexpected route'}});
 });
 await page.goto('http://127.0.0.1:8000', {waitUntil:'domcontentloaded'});
 await page.evaluate(()=>metadata.stop());
 const search=page.locator('#search');
 await search.fill('Local Hero');
 assert.equal(await page.locator('#searchSuggestions .search-title').first().textContent(),'Local Hero');
 assert.equal(await page.locator('#content').getByText('Local Hero').count(),1);
 await search.fill('Spider-Man');
 await page.getByRole('option',{name:/Spider-Man: Homecoming/}).waitFor();
 assert.ok(await page.locator('#searchSuggestions .search-group').allTextContents().then(x=>x.includes('TMDB Movies')));
 assert.ok(await page.locator('#searchSuggestions .search-group').allTextContents().then(x=>x.includes('TMDB TV Shows')));
 const before=await page.evaluate(()=>localStorage.getItem('comcast-collection-v1'));
 await page.getByRole('option',{name:/Spider-Man: Homecoming/}).click();
 await page.getByRole('dialog').getByText('A young hero joins the Avengers.').waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('comcast-collection-v1')),before,'preview must not write collection data');
 await page.getByRole('button',{name:'Add to Movies / Movie Collection'}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('comcast-collection-v1')).items.some(x=>x.title==='Spider-Man: Homecoming'));
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('comcast-collection-v1')));
 assert.equal(saved.items.find(x=>x.title==='Spider-Man: Homecoming').type,'movie');
 assert.equal(saved.movieDetails[saved.items.find(x=>x.title==='Spider-Man: Homecoming').id].tmdbId,501);
 assert.deepEqual(saved.customCollectionField,{keep:true});
 assert.equal(saved.items.filter(x=>x.title==='Spider-Man: Homecoming').length,1);
 assert.deepEqual(detailCalls,['/movie/details']);

 await search.fill('Spider-Man');
 await page.getByRole('option',{name:/Spider-Man: Homecoming/}).click();
 const duplicate=page.getByRole('dialog').getByRole('button',{name:'Already in your collection'});
 await duplicate.waitFor();assert.equal(await duplicate.isDisabled(),true);
 await page.getByRole('button',{name:'Cancel'}).click();

 await search.fill('The Bear');
 await page.getByRole('option',{name:/The Bear/}).click();
 await page.getByRole('dialog').getByText('A chef returns to Chicago.').waitFor();
 await page.getByRole('button',{name:'Add to TV Shows / Comcast Guide'}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('comcast-collection-v1')).items.some(x=>x.title==='The Bear'&&x.type==='show'));
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('comcast-collection-v1')));
 assert.equal(saved.items.filter(x=>x.title==='The Bear').length,1);
 assert.equal(saved.showDetails[saved.items.find(x=>x.title==='The Bear').id].tmdbId,502);
 assert.deepEqual(detailCalls,['/movie/details','/movie/details','/tv/details']);
 await browser.close();
});
