const {test}=require('node:test');
const assert=require('node:assert/strict');
const H=require('../home.js');
function data(){return {channels:[{id:'ch',name:'Channel',num:'42'}],items:[
 {id:'show',title:'Series',type:'show',channel:'ch',owned:false},
 {id:'movie',title:'Film',type:'movie',owned:true,ripped:false},
 {id:'unowned',title:'Not Owned',type:'movie',owned:false},
 {id:'box',title:'Film Box Set',type:'movie',owned:true}],
 collectionChildren:[{id:'season',parentId:'show',title:'Season 1',owned:false},{id:'child',parentId:'box',title:'Child Film',owned:true},{id:'other',parentId:'box',title:'Other Film',owned:false}],showDetails:{show:{episodes:{season:[{id:'ep',owned:false}]}}},movieDetails:{}}}
test('only owned individual titles qualify; folder ownership does not imply child ownership',()=>{
 const m=H.model(data());assert.deepEqual(m.featured.map(r=>r.item.id),['movie','child']);assert.equal(m.featured[1].parent.id,'box');
});
test('season-only ownership includes the show with a scoped label and does not mutate the checkbox',()=>{
 const d=data();d.collectionChildren[0].owned=true;const before=JSON.stringify(d);const r=H.model(d).featured.find(r=>r.kind==='show');assert.equal(r.ownership,'1 season marked Owned');assert.equal(r.item.owned,false);assert.equal(JSON.stringify(d),before);
});
test('episode-only ownership includes the parent show; orphaned episode data does not count',()=>{
 const d=data();d.showDetails.show.episodes.season[0].owned=true;assert.equal(H.model(d).featured[0].ownership,'1 episode marked Owned');
 d.showDetails.show.episodes.season[0].owned=false;d.showDetails.show.episodes.removed=[{owned:true}];assert.ok(!H.model(d).featured.some(r=>r.kind==='show'));
});
test('stable IDs deduplicate repeated records but not distinct titles with equal names',()=>{
 const d=data();d.items.push(d.items[1],{...d.items[1],id:'different'});d.collectionChildren.push(d.collectionChildren[1]);const m=H.model(d);assert.equal(m.featured.length,3);assert.equal(new Set(m.featured.map(r=>r.key)).size,3);
});
test('empty and singleton featured collections are supported without synthetic entries',()=>{
 assert.deepEqual(H.model({items:[],channels:[]}).featured,[]);const d=data();d.collectionChildren[1].owned=false;assert.equal(H.model(d).featured.length,1);
});
test('series-level Owned is labeled as a checkbox, not a complete-series ownership claim',()=>{
 const d=data();d.items[0].owned=true;assert.equal(H.model(d).featured[0].ownership,'Series marked Owned');
});
test('featured artwork preserves backdrop-first priority and validates URLs',()=>{
 const r=H.model(data()).featured[0];r.detail={tmdb:{poster:'https://a.test/p.jpg',backdrop:'https://a.test/b.jpg'}};
 assert.deepEqual(H.artwork(r,{}),['https://a.test/b.jpg','https://a.test/p.jpg']);
 assert.deepEqual(H.artwork(r,{'movie':'https://a.test/custom.jpg'}),['https://a.test/b.jpg','https://a.test/custom.jpg']);
 assert.equal(H.artwork(r,{},new Set(['movie']))[0],'https://a.test/b.jpg');
 r.detail={poster:'javascript:bad'};assert.deepEqual(H.artwork(r,{}),[]);
});
test('recent activity uses only actual successful metadata refresh timestamps within 30 days',()=>{
 const d=data(),now=2000000000000;d.items[1].updatedAt=now;d.movieDetails.movie={metadataLookup:{status:'ok',updatedAt:now-1000}};d.movieDetails.child={metadataLookup:{status:'ok',updatedAt:now-2000}};
 assert.deepEqual(H.model(d,now).recent.map(x=>x.record.item.id),['movie','child']);
 d.movieDetails.movie.metadataLookup.updatedAt=now+1;d.movieDetails.child.metadataLookup.updatedAt=now-31*86400000;assert.deepEqual(H.model(d,now).recent,[]);
});
test('organizing labels are based on saved partial ownership and actual status flags',()=>{
 const d=data();d.showDetails.show.episodes.season[0].owned=true;const m=H.model(d);assert.match(m.organizing[0].reason,/owned episodes/);assert.equal(m.organizing[1].reason,'Not marked Ripped');
});
function fakeClock(){let serial=0;const tasks=new Map();return {tasks,setTimer:(f,delay)=>{assert.equal(delay,6000);tasks.set(++serial,f);return serial},clearTimer:id=>tasks.delete(id),tick(){const pending=[...tasks];tasks.clear();for(const [,f] of pending)f()}}}
test('autoplay runs every six seconds with one timer; reset and destruction clean it up',()=>{
 const f=fakeClock();let calls=0;const r=H.rotation({...f,next:()=>calls++});r.count(3);assert.equal(f.tasks.size,1);r.reset();r.count(4);assert.equal(f.tasks.size,1);f.tick();assert.equal(calls,1);assert.equal(f.tasks.size,1);r.destroy();assert.equal(f.tasks.size,0);r.reset();assert.equal(f.tasks.size,0);
});
test('hidden, reduced-motion, focus, hover, gesture and explicit pause compose independently',()=>{
 const f=fakeClock(),r=H.rotation({...f,next:()=>{}});r.count(2);
 for(const reason of ['hidden','motion','focus','hover','gesture','user']){r.pause(reason,true);assert.equal(f.tasks.size,0);r.pause(reason,false);assert.equal(f.tasks.size,1)}
 r.pause('hidden',true);r.pause('motion',true);r.pause('hidden',false);assert.equal(f.tasks.size,0);r.pause('motion',false);assert.equal(f.tasks.size,1);r.count(1);assert.equal(f.tasks.size,0);r.count(0);assert.equal(f.tasks.size,0);r.destroy();
});


test('queues evaluate owned units and shelves mix types without changing saved order or data',()=>{
 const d=data();d.collectionChildren[0].owned=true;d.collectionChildren[0].ripped=true;
 d.items[1].ripped=true;d.items[1].added=false;d.collectionChildren[1].ripped=false;
 const before=JSON.stringify(d),m=H.model(d);
 assert.deepEqual(m.readyToRip.map(r=>r.item.id),['child']);
 assert.deepEqual(m.readyForJellyfin.map(r=>r.item.id),['show','movie']);
 assert.deepEqual(m.shelves[0].map(r=>r.kind),['show','movie','movie']);
 assert.equal(m.shelves[1].length,m.all.length);assert.equal(JSON.stringify(d),before);
 d.showDetails.show.episodes.season[0]={owned:true,ripped:false,added:true};
 assert.equal(H.model(d).readyToRip[0].item.id,'show');
 d.collectionChildren[0].owned=false;d.showDetails.show.episodes.season[0].owned=false;
 assert.ok(!H.model(d).readyForJellyfin.some(r=>r.kind==='show'));
});
