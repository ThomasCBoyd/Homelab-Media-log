/* Collection operations use the latest stored record and never delete media files. */
(function(root){
'use strict';
const same=(a,b)=>String(a)===String(b);
function entries(data,type){
 const parents=(data.items||[]).filter(x=>x.type===type);
 if(type==='show')return parents.map(x=>({key:'item:'+x.id,title:x.title,item:x}));
 const childParents=new Set((data.collectionChildren||[]).map(x=>String(x.parentId)));
 return [...parents.filter(x=>!childParents.has(String(x.id))).map(x=>({key:'item:'+x.id,title:x.title,item:x})),...(data.collectionChildren||[]).filter(x=>childParents.has(String(x.parentId))).map(x=>({key:'child:'+x.id,title:x.title,item:x}))];
}
function members(data,group){return entries(data,group.type).filter(x=>(group.members||[]).includes(x.key))}
function softDelete(data,kind,id,parentId){
 const next=JSON.parse(JSON.stringify(data)),bin=next.tvLandTrash||[];
 let record,detail,related=[],memberships=[];
 if(kind==='collection'){
  record=(next.customCollections||[]).find(x=>same(x.id,id));if(!record)return null;
  next.customCollections=next.customCollections.filter(x=>!same(x.id,id));
 }else if(kind==='item'){
  record=next.items.find(x=>same(x.id,id));if(!record)return null;
  detail=record.type==='show'?next.showDetails?.[id]:next.movieDetails?.[id];
  related=(next.collectionChildren||[]).filter(x=>same(x.parentId,id));
  // Refuse deletion of a legacy box set with child movies; avoid orphaning them.
  if(record.type==='movie'&&related.length)return {error:'This box set contains movies. Remove or move its movies before deleting the box set.'};
  next.items=next.items.filter(x=>!same(x.id,id));
  if(record.type==='show')next.collectionChildren=(next.collectionChildren||[]).filter(x=>!same(x.parentId,id));
  if(record.type==='show')delete next.showDetails?.[id];else delete next.movieDetails?.[id];
  memberships=(next.customCollections||[]).filter(g=>(g.members||[]).includes('item:'+id)).map(g=>g.id);
  next.customCollections=(next.customCollections||[]).map(g=>({...g,members:(g.members||[]).filter(k=>k!=='item:'+id)}));
 }else if(kind==='child'){
  record=(next.collectionChildren||[]).find(x=>same(x.id,id)&&same(x.parentId,parentId));if(!record)return null;
  detail=next.movieDetails?.[id];
  next.collectionChildren=next.collectionChildren.filter(x=>!(same(x.id,id)&&same(x.parentId,parentId)));
  delete next.movieDetails?.[id];
  memberships=(next.customCollections||[]).filter(g=>(g.members||[]).includes('child:'+id)).map(g=>g.id);
  next.customCollections=(next.customCollections||[]).map(g=>({...g,members:(g.members||[]).filter(k=>k!=='child:'+id)}));
 }else return null;
 bin.push({id:'trash-'+Date.now()+'-'+Math.random().toString(36).slice(2),kind,record,detail,related,memberships,parentId,deletedAt:Date.now()});
 next.tvLandTrash=bin;return next;
}
function restore(data,trashId){
 const next=JSON.parse(JSON.stringify(data)),item=(next.tvLandTrash||[]).find(x=>same(x.id,trashId));if(!item)return null;
 const id=item.record.id;
 if(item.kind==='collection'){
  if((next.customCollections||[]).some(x=>same(x.id,id)))return null;
  (next.customCollections||=[]).push(item.record);
 }else if(item.kind==='item'){
  if(next.items.some(x=>same(x.id,id)))return null;
  next.items.push(item.record);
  if(item.record.type==='show'&&item.related?.length)(next.collectionChildren||=[]).push(...item.related);
  if(item.detail)(item.record.type==='show'?(next.showDetails||={}):(next.movieDetails||={}))[id]=item.detail;
 }else if(item.kind==='child'){
  if((next.collectionChildren||[]).some(x=>same(x.id,id)))return null;
  (next.collectionChildren||=[]).push(item.record);
  if(item.detail)(next.movieDetails||={})[id]=item.detail;
 }
 if(item.memberships?.length){const key=(item.kind==='child'?'child:':'item:')+id;next.customCollections=(next.customCollections||[]).map(g=>item.memberships.includes(g.id)?{...g,members:[...new Set([...(g.members||[]),key])]}:g)}
 next.tvLandTrash=next.tvLandTrash.filter(x=>!same(x.id,trashId));return next;
}
root.TVLandCollectionOps={entries,members,softDelete,restore};
if(typeof module==='object')module.exports=root.TVLandCollectionOps;
})(typeof globalThis!=='undefined'?globalThis:this);
