import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchSearchPages,mergeSearchItems,preserveSearchGenres} from '../src/online-search.js';
test('continuation follows returned cursors and merges remote seasons absent locally',async()=>{
 const calls=[],progress=[];
 const page=await fetchSearchPages({query:'故事',initial:{items:[{series_id:'1',title:'故事'}]},maxPages:3,request:async q=>{calls.push(q);return q.cursor?{results:[{series_id:'1',title:'故事'},{series_id:'12',title:'故事第十二季'}],has_more:false,next_cursor:null}:{results:[{series_id:'2',title:'故事第二季'}],has_more:true,next_cursor:'next'};},onPage:p=>progress.push(p)});
 assert.deepEqual(page.items.map(x=>x.series_id),['1','2','12']);assert.equal(calls.length,2);assert.equal(calls[1].cursor,'next');assert.equal(page.hasMore,false);assert.equal(progress.length,2);
});
test('network error preserves partial results and retry continuation',async()=>{
 let progress;await assert.rejects(fetchSearchPages({query:'剧名',maxPages:3,request:async q=>{if(q.cursor)throw Error('offline');return {results:[{series_id:'9'}],has_more:true,next_cursor:'retry-here'};},onPage:p=>{progress=p;}}),/offline/);
 assert.equal(progress.cursor,'retry-here');assert.equal(progress.items.length,1);
});
test('late response after query change cannot publish or continue',async()=>{
 let current=true,published=0;const result=await fetchSearchPages({query:'旧查询',maxPages:3,isCurrent:()=>current,request:async()=>{current=false;return {results:[],has_more:true,next_cursor:'next'};},onPage:()=>published++});assert.equal(result,null);assert.equal(published,0);
});
test('looped cursor is an error instead of silent truncation',async()=>{
 await assert.rejects(fetchSearchPages({query:'剧名',initial:{cursor:'same'},request:async()=>({results:[],has_more:true,next_cursor:'same'})}),/分页异常/);
});
test('online metadata replaces the local duplicate without losing other items',()=>{assert.deepEqual(mergeSearchItems([{series_id:'1',title:'old'},{series_id:'2'}],[{series_id:'1',title:'new'}]),[{series_id:'1',title:'new'},{series_id:'2'}]);});
test('shared search channel preserves known AI genre and keeps remote-only seasons',()=>{
 const items=preserveSearchGenres([{series_id:'8',genre:'comic_series',genre_source:'search_tab',episode_cnt:100},{series_id:'1',genre:'comic_series',genre_source:'search_tab',episode_cnt:100}],[{series_id:'8',genre:'ai_series',episode_cnt:90}]);
 assert.equal(items[0].genre,'ai_series');assert.equal(items[0].episode_cnt,100);assert.equal(items[1].series_id,'1');
});
