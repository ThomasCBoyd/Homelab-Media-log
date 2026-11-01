const assert=require('node:assert/strict');
const test=require('node:test');
const {candidates,valid}=require('../custom-collections.js');
const data={items:[{id:1,type:'movie',title:'Standalone'},{id:2,type:'movie',title:'Box Set'},{id:3,type:'show',title:'Batman Beyond'}],collectionChildren:[{id:4,parentId:2,title:'Film One'},{id:5,parentId:3,title:'Season 1'}]};
test('movie selection includes standalone titles and box set movies, not folder duplicates',()=>{assert.deepEqual(candidates(data,'movie').map(x=>x.title),['Standalone','Film One'])});
test('TV selection includes series, not seasons',()=>{assert.deepEqual(candidates(data,'show').map(x=>x.title),['Batman Beyond'])});
test('saved references do not create or duplicate source records',()=>{const before=JSON.stringify(data);assert.deepEqual(valid(data,{type:'movie',members:['child:4','item:1','missing']} ).map(x=>x.title),['Standalone','Film One']);assert.equal(JSON.stringify(data),before)});
