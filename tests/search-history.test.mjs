import test from 'node:test';
import assert from 'node:assert/strict';
import {SEARCH_HISTORY_KEY,readSearchHistory,rememberSearch,writeSearchHistory,sanitizeSearchHistory} from '../src/search-history.js';
test('search history survives reopen, deduplicates and keeps the latest twenty',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 rememberSearch(storage,' 持械入宋 ');rememberSearch(storage,'首辅娇娘');rememberSearch(storage,'持械入宋');
 assert.deepEqual(readSearchHistory(storage),['持械入宋','首辅娇娘']);
 for(let i=0;i<25;i++)rememberSearch(storage,`剧集 ${i}`);
 assert.equal(readSearchHistory(storage).length,20);assert.equal(readSearchHistory(storage)[0],'剧集 24');
 writeSearchHistory(storage,readSearchHistory(storage).filter(v=>v!=='剧集 24'));
 assert.equal(readSearchHistory(storage)[0],'剧集 23');
 writeSearchHistory(storage,[]);assert.deepEqual(readSearchHistory(storage),[]);
 data.set(SEARCH_HISTORY_KEY,'broken json');assert.deepEqual(readSearchHistory(storage),[]);
});
test('history tolerates invalid records and reports storage errors',()=>{
 assert.deepEqual(sanitizeSearchHistory([null,4,' ',' AI  剧 ','ai 剧',{},'持械入宋']),['AI 剧','持械入宋']);
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('quota')}};
 assert.deepEqual(readSearchHistory(blocked),[]);assert.equal(rememberSearch(blocked,'持械入宋').error,true);
});
