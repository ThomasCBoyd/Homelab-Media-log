const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../metadata.js');
global.localStorage = {getItem: () => '[]'};
function setup({items, children = [], details = {}, posters = {}, handler, prompt} = {}) {
  let time = 1000000;
  const data = {channels:[{id:1,name:'Custom',num:'42'}],items:items || [{id:'m',type:'movie',title:'Example (2020)',owned:true,ripped:true,added:false}],collectionChildren:children,movieDetails:details,showDetails:{}};
  const calls = []; let saves = 0;
  const fetch = async url => {
    const u = new URL(url); calls.push(u);
    const custom = handler?.(u, calls.length);
    if (custom) return await custom;
    return Response.json(u.pathname.endsWith('/search') ? {results:[{id:123,title:'Example',year:'2020'}]} : {id:123,title:'Example',year:'2020',overview:'Description',genres:['Drama'],runtime:95,poster:'https://image.tmdb.org/t/p/w500/test.jpg'});
  };
  const client = M.create({getData:()=>data,getPosters:()=>posters,save:()=>saves++}, {fetch,now:()=>time,schedule:false,prompt:prompt || (()=>null)});
  return {data,posters,client,calls,get saves(){return saves},advance:ms=>time+=ms};
}
test('Unicode, punctuation, ampersands and year normalization is generic',()=>{
  assert.equal(M.normalize('Amélie: Rock & Roll!'),M.normalize('Amelie Rock and Roll'));
  assert.deepEqual(M.titleParts('A Story [1998]'),{title:'A Story',year:'1998'});
});
test('original and alternate titles, deduplication, and release-year disambiguation',()=>{
  const ranked=M.candidates([{id:1,title:'Other',original_title:'Original',year:'2001'},{id:2,title:'Original',year:'2020'},{id:2,title:'Original',year:'2020'}],'Original','2020');
  assert.equal(ranked.length,2);assert.ok(M.confident(ranked));assert.equal(ranked[0].record.id,2);
  assert.ok(M.confident(M.candidates([{id:1,title:'Regional',alternative_titles:['Alias']}],'Alias','')));
  assert.equal(M.confident(M.candidates([{id:1,title:'Same'},{id:2,title:'Same'}],'Same','')),false);
});
test('movie search is followed by full details and saves all fields and verified identity',async()=>{
  const s=setup();await s.client.scan();
  assert.deepEqual(s.calls.map(x=>x.pathname),['/movie/search','/movie/details']);
  assert.equal(s.calls[0].searchParams.get('query'),'Example');
  const d=s.data.movieDetails.m;
  assert.equal(d.tmdbId,123);assert.equal(d.runtime,'95 minutes');assert.equal(d.genres,'Drama');assert.equal(d.year,'2020');assert.equal(d.description,'Description');assert.equal(d.metadataLookup.status,'ok');assert.ok(s.posters.m);
  assert.deepEqual([s.data.items[0].owned,s.data.items[0].ripped,s.data.items[0].added],[true,true,false]);
  await s.client.scan();assert.equal(s.calls.length,2);
});
test('TV records use verified TV routes and persist show metadata',async()=>{
  const s=setup({items:[{id:'tv',type:'show',title:'Example'}]});await s.client.scan();
  assert.deepEqual(s.calls.map(x=>x.pathname),['/tv/search','/tv/details']);assert.equal(s.calls[0].searchParams.get('title'),'Example');assert.equal(s.data.showDetails.tv.tmdbId,123);
});
test('collection children get individual metadata; folders and TV seasons never get movie IDs',async()=>{
  const s=setup({items:[{id:'box',type:'movie',title:'Example Box Set'},{id:'tv',type:'show',title:'Example'}],children:[{id:'child',parentId:'box',title:'Example'},{id:'season',parentId:'tv',title:'Season 1'}]});
  await s.client.scan();assert.equal(s.data.movieDetails.child.tmdbId,123);assert.equal(s.data.movieDetails.box?.tmdbId,undefined);assert.equal(s.data.movieDetails.season,undefined);
});
test('manual fields including blanks and existing posters survive repair',async()=>{
  const s=setup({details:{m:{description:'',year:'2020',genres:'Custom',runtime:'My runtime',manualFields:['description','genres','runtime']}},posters:{m:'https://example.org/manual.jpg'}});
  const channels=JSON.stringify(s.data.channels);await s.client.scan({refresh:true});
  const d=s.data.movieDetails.m;assert.equal(d.description,'');assert.equal(d.genres,'Custom');assert.equal(d.runtime,'My runtime');assert.equal(s.posters.m,'https://example.org/manual.jpg');assert.equal(JSON.stringify(s.data.channels),channels);
});
test('legacy populated fields and legacy detail poster are preserved',async()=>{
  const s=setup({details:{m:{description:'Legacy edit',poster:'https://example.org/legacy.jpg'}}});await s.client.scan();assert.equal(s.data.movieDetails.m.description,'Legacy edit');assert.equal(s.posters.m,undefined);
});
test('verified ID survives serialization and refresh bypasses ambiguous search',async()=>{
  const s=setup();await s.client.scan();const restored=JSON.parse(JSON.stringify(s.data));
  const t=setup({items:restored.items,details:restored.movieDetails});await t.client.scan({refresh:true});
  assert.deepEqual(t.calls.map(x=>x.pathname),['/movie/details']);
});
test('unavailable titles are negative cached even during Repair All',async()=>{
  const s=setup({handler:()=>Response.json({results:[]})});await s.client.scan();await s.client.scan({refresh:true});assert.equal(s.calls.length,1);assert.equal(s.data.movieDetails.m.metadataLookup.status,'unavailable');
  s.advance(31*86400000);await s.client.scan();assert.equal(s.calls.length,2);
});
test('ambiguous results never silently select; user selection is stored by ID',async()=>{
  const s=setup({items:[{id:'m',type:'movie',title:'Example'}],handler:u=>u.pathname.endsWith('search')?Response.json({results:[{id:123,title:'Example',year:'2020'},{id:124,title:'Example',year:'2021'}]}):null,prompt:()=> '1'});
  await s.client.scan();assert.equal(s.calls.length,1);assert.equal(s.data.movieDetails.m.metadataLookup.status,'ambiguous');await s.client.interactive(s.data.items[0]);assert.equal(s.data.movieDetails.m.tmdbId,123);
});
test('temporary failures back off, retry, then recover',async()=>{
  let broken=true;const s=setup({handler:()=>broken?new Response('unavailable',{status:503}):null});
  await s.client.scan();await s.client.scan({refresh:true});assert.equal(s.calls.length,1);
  s.advance(30001);await s.client.scan();assert.equal(s.calls.length,2);assert.equal(s.data.movieDetails.m.metadataLookup.attempts,2);
  broken=false;s.advance(60001);await s.client.scan();assert.equal(s.data.movieDetails.m.metadataLookup.status,'ok');
});
test('429 respects Retry-After',async()=>{
  const s=setup({handler:()=>new Response('',{status:429,headers:{'Retry-After':'120'}})});await s.client.scan();s.advance(60000);await s.client.scan();assert.equal(s.calls.length,1);s.advance(60001);await s.client.scan();assert.equal(s.calls.length,2);
});
test('malformed Worker responses are failures, never successful empty searches',async()=>{
  const s=setup({handler:()=>Response.json({unexpected:[]})});await s.client.scan();assert.equal(s.data.movieDetails.m.metadataLookup.status,'temporary');assert.equal(s.data.movieDetails.m.tmdbId,undefined);
});
test('mismatched detail ID cannot be stored as verified',async()=>{
  const s=setup({handler:u=>u.pathname.endsWith('details')?Response.json({id:999,title:'Wrong'}):null});await s.client.scan();assert.equal(s.data.movieDetails.m.tmdbId,undefined);assert.equal(s.data.movieDetails.m.metadataLookup.status,'temporary');
});
test('late response does not attach to renamed or removed entry',async()=>{
  for(const remove of [false,true]){
    let release;const s=setup({handler:u=>u.pathname.endsWith('details')?new Promise(r=>release=()=>r(Response.json({id:123,title:'Example',overview:'Late'}))):null});
    const job=s.client.lookup(s.data.items[0]);while(!release)await new Promise(r=>setImmediate(r));
    if(remove)s.data.items=[];else s.data.items[0].title='Different';release();await job;assert.equal(s.data.movieDetails.m.tmdbId,undefined);
  }
});
test('edits made while request is pending survive',async()=>{
  let release;const s=setup({handler:u=>u.pathname.endsWith('details')?new Promise(r=>release=()=>r(Response.json({id:123,title:'Example',overview:'Automatic'}))):null});
  const job=s.client.lookup(s.data.items[0]);while(!release)await new Promise(r=>setImmediate(r));
  s.data.movieDetails.m.description='User typed this';s.data.items[0].added=true;release();await job;assert.equal(s.data.movieDetails.m.description,'User typed this');assert.equal(s.data.items[0].added,true);
});
test('user-supplied alternate title searches generically without renaming',async()=>{
  const s=setup({items:[{id:'m',type:'movie',title:'Regional Name'}],prompt:()=> 'Example (2020)'});
  await s.client.alias(s.data.items[0]);assert.equal(s.data.items[0].title,'Regional Name');assert.deepEqual(s.data.movieDetails.m.metadataAliases,['Example']);assert.equal(s.data.movieDetails.m.tmdbId,123);
});
test('cross-tab changes are reconciled before metadata commits',async()=>{
  const originalStorage=global.localStorage;let stored=null;
  try {
    let release;const s=setup({handler:u=>u.pathname.endsWith('details')?new Promise(r=>release=()=>r(Response.json({id:123,title:'Example',overview:'Automatic'}))):null});
    global.localStorage={getItem:key=>key==='comcast-collection-v1'?stored:null};
    const job=s.client.lookup(s.data.items[0]);while(!release)await new Promise(r=>setImmediate(r));
    const otherTab=JSON.parse(JSON.stringify(s.data));otherTab.items[0].added=true;otherTab.movieDetails.m.description='Edited in other tab';otherTab.channels[0].name='Renamed elsewhere';stored=JSON.stringify(otherTab);
    release();await job;assert.equal(s.data.items[0].added,true);assert.equal(s.data.movieDetails.m.description,'Edited in other tab');assert.equal(s.data.channels[0].name,'Renamed elsewhere');assert.equal(s.data.movieDetails.m.tmdbId,123);
  } finally {global.localStorage=originalStorage}
});
test('entries added during a scan are picked up in its next pass',async()=>{
  let release;const s=setup({handler:(u,n)=>n===1?new Promise(r=>release=()=>r(Response.json({results:[{id:123,title:'Example',year:'2020'}]}))):null});
  const scan=s.client.scan();while(!release)await new Promise(r=>setImmediate(r));
  s.data.items.push({id:'second',type:'movie',title:'Example (2020)'});await s.client.scan();release();await scan;assert.equal(s.data.movieDetails.second.tmdbId,123);
});
