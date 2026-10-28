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
