const {test}=require('node:test');
const assert=require('node:assert/strict');
const {suggestions}=require('../search.js');
const data={channels:[{id:1,name:'Cartoon Network',num:'62'},{id:2,name:'Empty Channel',num:'700'}],items:[{id:1,title:'Animated Show',type:'show',channel:1},{id:2,title:'Film Collection',type:'movie'},{id:3,title:'Standalone Film',type:'movie'}],collectionChildren:[{id:4,title:'Child Film',parentId:2},{id:5,title:'Season 1',parentId:1},{id:6,title:'Orphan',parentId:99}]};
test('all result types have category and exact navigation context',()=>{
 assert.equal(suggestions(data,'Animated')[0].category,'TV Show · Cartoon Network 62');
 assert.equal(suggestions(data,'Standalone')[0].item.id,3);
 const child=suggestions(data,'Child')[0];assert.equal(child.item.id,4);assert.equal(child.parent.id,2);assert.equal(child.category,'Movie · Film Collection');
 const season=suggestions(data,'Season')[0];assert.equal(season.kind,'season');assert.equal(season.parent.id,1);
 assert.equal(suggestions(data,'Cartoon')[0].channel.id,1);assert.equal(suggestions(data,'62')[0].channel.id,1);assert.equal(suggestions(data,'700')[0].channel.id,2);
});
test('empty queries, Unicode normalization, and unknown parents',()=>{
 assert.deepEqual(suggestions(data,'   '),[]);assert.deepEqual(suggestions(data,'Orphan'),[]);
 assert.equal(suggestions({...data,items:[{id:9,type:'movie',title:'Amélie'}]},'amelie')[0].title,'Amélie');
});
test('limit eight, exact first then prefix; preserve duplicate titles with different IDs',()=>{
 const input={channels:[],items:Array.from({length:12},(_,id)=>({id,type:'movie',title:id===11?'Film':'A Film '+id})),collectionChildren:[]};
 const result=suggestions(input,'film');assert.equal(result.length,8);assert.equal(result[0].item.id,11);
 assert.equal(suggestions({channels:[],items:[{id:1,type:'movie',title:'Same'},{id:2,type:'movie',title:'Same'}]},'same').length,2);
});
test('suggestion indexing does not mutate collection data',()=>{
 const before=JSON.stringify(data);suggestions(data,'film');assert.equal(JSON.stringify(data),before);
});
