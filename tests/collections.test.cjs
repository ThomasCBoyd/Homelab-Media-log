const {test}=require('node:test'),assert=require('node:assert/strict');
const {groups,summary}=require('../collections.js');
test('groups only saved movie members and owned TV series with seasons without changing data',()=>{
 const data={items:[{id:'m',type:'movie',title:'Box',owned:true},{id:'single',type:'movie'},{id:'tv',type:'show'},{id:'unowned',type:'show'},{id:'empty',type:'show',owned:true}],collectionChildren:[{id:'c',parentId:'m',title:'Film',owned:false},{id:'s',parentId:'tv',title:'Season 2',owned:true},{id:'u',parentId:'unowned',title:'Season 1'}],custom:{keep:true}};
 const before=JSON.stringify(data),result=groups(data);assert.deepEqual(result.movies.map(g=>g.item.id),['m']);assert.deepEqual(result.shows.map(g=>g.item.id),['tv']);assert.equal(summary(result.movies[0].members),'0/1 Owned · 0/1 Ripped · 0/1 Added to Jellyfin');assert.equal(JSON.stringify(data),before);
});
test('episode ownership qualifies only through an existing season; seasons sort without mutation',()=>{
 const data={items:[{id:'tv',type:'show'}],collectionChildren:[{id:'s2',parentId:'tv',title:'Season 2'},{id:'s1',parentId:'tv',title:'Season 1'}],showDetails:{tv:{episodes:{s1:[{owned:true}],orphan:[{owned:true}]}}}};
 const before=JSON.stringify(data),g=groups(data).shows[0];assert.deepEqual(g.members.map(s=>s.id),['s1','s2']);assert.equal(summary(g.members),'0/2 Owned · 0/2 Ripped · 0/2 Added to Jellyfin');assert.equal(JSON.stringify(data),before);data.showDetails.tv.episodes.s1=[];assert.equal(groups(data).shows.length,0);
});
test('empty storage stays empty',()=>assert.deepEqual(groups({}),{movies:[],shows:[]}));
const {ordered,artwork,description,setStatus}=require('../collections.js');
test('movie release order uses saved metadata only, with stable saved order for missing dates',()=>{
 const parent={id:'box',type:'movie'},list=[{id:'b'},{id:'a'},{id:'c'}],data={movieDetails:{a:{year:'2001'},b:{tmdb:{releaseDate:'2004-05-19'}},c:{year:'2007'}}};
 assert.deepEqual(ordered(data,parent,list).map(x=>x.id),['a','b','c']);assert.deepEqual(list.map(x=>x.id),['b','a','c']);delete data.movieDetails.a.year;assert.deepEqual(ordered(data,parent,list),list);
});
test('saved backdrop, manual poster and season artwork fallbacks never mutate metadata',()=>{
 const show={id:'tv',type:'show'},season={id:'s',title:'Season 2'},data={showDetails:{tv:{manualFields:['description'],description:'',tmdb:{overview:'Must not override blank',backdrop:'https://art.test/wide.jpg',seasons:[{number:2,poster:'/season.jpg'}]}}}};
 const before=JSON.stringify(data);assert.equal(description(data,show),'');assert.deepEqual(artwork(data,show,()=> 'https://art.test/manual.jpg'),['https://art.test/wide.jpg','https://art.test/manual.jpg']);assert.deepEqual(artwork(data,season,()=>null,show),['https://image.tmdb.org/t/p/w1280/season.jpg']);assert.deepEqual(artwork({},show,()=> 'javascript:alert(1)'),[]);assert.equal(JSON.stringify(data),before);
});
test('tracking changes exactly one saved field and refuses stale/deleted targets',()=>{
 const data={items:[{id:'tv',type:'show'},{id:'box',type:'movie'}],collectionChildren:[{id:'s',parentId:'tv',owned:true,ripped:false},{id:'film',parentId:'box',owned:false,ripped:false,added:true}],showDetails:{tv:{episodes:{s:[{id:'e',title:'Saved',owned:false,ripped:false,customTitle:true}]},deletedEpisodes:{s:['n:5']}}},custom:{keep:'yes'}};
 const expected=structuredClone(data),target={kind:'member',parentId:'box',memberId:'film'};assert(setStatus(data,target,'owned',true));expected.collectionChildren[1].owned=true;assert.deepEqual(data,expected);
 assert(setStatus(data,{kind:'episode',parentId:'tv',memberId:'s',episodeId:'e'},'ripped',true));expected.showDetails.tv.episodes.s[0].ripped=true;assert.deepEqual(data,expected);
 for(const bad of [{...target,parentId:'tv'},{...target,memberId:'missing'},{kind:'episode',parentId:'tv',memberId:'s',episodeId:'gone'}])assert.equal(setStatus(data,bad,'owned',true),false);
 assert.equal(setStatus(data,target,'title',true),false);assert.equal(setStatus(data,target,'owned','true'),false);assert.deepEqual(data,expected);
});
test('legacy episodes without IDs are guarded by saved identity and never created',()=>{
 const data={items:[{id:'tv',type:'show'}],collectionChildren:[{id:'s',parentId:'tv'}],showDetails:{tv:{episodes:{s:[{title:'Pilot',number:1}]}}}},target={kind:'episode',parentId:'tv',memberId:'s',index:0,title:'Pilot',number:1};
 assert(setStatus(data,target,'added',true));assert.equal(setStatus(data,{...target,title:'Wrong'},'added',false),false);assert.equal(data.showDetails.tv.episodes.s.length,1);
});
test('duplicate saved collection IDs do not produce duplicate directory cards',()=>{
 const item={id:'box',type:'movie'},member={id:'m',parentId:'box'};assert.equal(groups({items:[item,item],collectionChildren:[member,member]}).movies.length,1);assert.equal(groups({items:[item],collectionChildren:[member,member]}).movies[0].members.length,1);
});
