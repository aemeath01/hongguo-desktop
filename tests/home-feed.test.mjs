import test from 'node:test';
import assert from 'node:assert/strict';
import {mixGenres,personalPicks} from '../src/home-feed.js';
const drama=(id,genre,category,play_cnt=1)=>({series_id:id,title:id,genre,category,play_cnt});
test('mixed rails include every available category and preserve within-category order',()=>{
 const items=[drama('a','short_play','爱'),drama('b','short_play','爱'),drama('c','ai_series','爱'),drama('d','comic_series','爱')];
 assert.deepEqual(mixGenres([...items,items[0]]).map(d=>d.series_id),['a','d','c','b']);
 assert.equal(mixGenres(items,2).length,2);
 assert.deepEqual(mixGenres([]),[]);
});
test('personal picks learn from stored history metadata and exclude watched/favorited shows',()=>{
 const catalog=[drama('fav','short_play','爱情 / 都市'),drama('new','short_play','爱情 / 都市'),drama('comic','comic_series','玄幻 / 修真'),drama('unrelated','ai_series','科幻')];
 const history=[{id:'old',drama:drama('old','comic_series','玄幻 / 修真'),opened:1000}];
 const result=personalPicks(catalog,['fav'],history,1000);
 assert.equal(result.hasTaste,true);assert.deepEqual(result.items.map(d=>d.series_id),['new','comic']);assert.match(result.reasons.new,/爱情|都市/);
});
test('repeated tags do not inflate recommendation scores and recent history matters more',()=>{
 const now=1e12;
 const catalog=[drama('a','short_play','历史 / 历史 / 历史'),drama('b','short_play','爱情')];
 const history=[{id:'old',opened:now-90*86400000,drama:drama('old','short_play','历史')},{id:'recent',opened:now,drama:drama('recent','short_play','爱情')}];
 assert.equal(personalPicks(catalog,[],history,now).items[0].series_id,'b');
 assert.equal(personalPicks(catalog,[],[],now).hasTaste,false);
});
