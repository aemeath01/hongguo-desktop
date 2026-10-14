import test from 'node:test';
import assert from 'node:assert/strict';
import {createHoldController,seasonQuery,seasonCandidates,seasonNumber,sortSeasons,seasonFamily,formatTime,seekPlan} from '../src/player-controls.js';
function rig(){let trigger,speed=1.25;const seeks=[],changes=[];const ctrl=createHoldController({getSpeed:()=>speed,setSpeed:v=>{speed=v;changes.push(v)},seek:v=>seeks.push(v),holdSpeed:3,schedule:fn=>{trigger=fn;return 1},cancel:()=>{trigger=null}});return{ctrl,seeks,changes,fire:()=>trigger?.(),get speed(){return speed;}};}
test('tap seeks once, repeat keydown does not duplicate',()=>{const r=rig();r.ctrl.down('ArrowLeft');r.ctrl.down('ArrowLeft');r.ctrl.up('ArrowLeft');assert.deepEqual(r.seeks,[-5]);assert.equal(r.speed,1.25);});
test('hold accelerates without seeking and restores exact original speed',()=>{const r=rig();r.ctrl.down('D');r.fire();assert.equal(r.speed,3);r.ctrl.up('d');assert.equal(r.speed,1.25);assert.deepEqual(r.seeks,[]);});
test('blur cancels pending tap and restores active hold',()=>{const r=rig();r.ctrl.down('a');r.ctrl.cancel();r.ctrl.up('a');assert.deepEqual(r.seeks,[]);r.ctrl.down('a');r.fire();r.ctrl.cancel();assert.equal(r.speed,1.25);assert.deepEqual(r.seeks,[]);});
test('opposite or unrelated key release does not stop held key',()=>{const r=rig();r.ctrl.down('ArrowRight');r.fire();r.ctrl.up('ArrowLeft');assert.equal(r.speed,3);r.ctrl.up('ArrowRight');assert.equal(r.speed,1.25);});
test('season query removes suffix only; preserves numeric story titles',()=>{assert.equal(seasonQuery('聚宝仙盆之杂灵根才是真BOSS第十三季'),'聚宝仙盆之杂灵根才是真BOSS');assert.equal(seasonQuery('家有五女'),'家有五女');assert.equal(seasonQuery('某剧（第二季）'),'某剧');});
test('season candidates exclude current, duplicates, unrelated titles',()=>{const current={series_id:'1',title:'某剧第一季'};assert.deepEqual(seasonCandidates([{series_id:'1',title:'某剧第一季'},{series_id:'2',title:'某剧第二季'},{series_id:'2',title:'某剧第二季'},{series_id:'3',title:'其他剧'}],current).map(d=>d.series_id),['2']);});
test('time displays finite nonnegative duration and hours',()=>{assert.equal(formatTime(NaN),'0:00');assert.equal(formatTime(-5),'0:00');assert.equal(formatTime(3661),'1:01:01');});
test('seek uses HLS window origin and reloads outside buffered range',()=>{assert.deepEqual(seekPlan(105,100,30,300),{position:105,reload:false,offset:5});assert.equal(seekPlan(95,100,30,300).reload,true);assert.equal(seekPlan(200,100,30,300).reload,true);assert.equal(seekPlan(-5,0,30,300).position,0);});
test('numeric sequel searches include the original and preserve years',()=>{assert.equal(seasonQuery('禁止闪婚：甜桃烈酒2'),'禁止闪婚：甜桃烈酒');assert.equal(seasonQuery('重返1998'),'重返1998');});
test('seasons sort numerically across Arabic, Chinese and English suffixes',()=>{
 const titles=['故事第十二季','故事第2季','故事','故事 Season 3','故事第十季','故事第一百零二季'];
 assert.deepEqual(sortSeasons(titles.map((title,i)=>({title,series_id:String(i)}))).map(d=>seasonNumber(d.title)),[1,2,3,10,12,102]);
 assert.equal(seasonQuery('故事：第十二季（完整版）'),'故事');assert.equal(seasonQuery('我们的第二季节'),'我们的第二季节');
});
test('same-name matching rejects unrelated extensions and other content categories',()=>{
 const current={series_id:'1',title:'故事第一季',genre:'comic_series'};
 assert.deepEqual(seasonCandidates([{series_id:'2',title:'故事第二季',genre:'comic_series'},{series_id:'3',title:'故事之外第2季'},{series_id:'4',title:'故事第二季',genre:'short_play'},{title:'故事第三季'}],current).map(d=>d.series_id),['2']);
});
test('AI search seasons keep the same family when the provider labels them animated',()=>{
 const current={series_id:'8',title:'持械入宋：第八季',genre:'ai_series'};
 const found=[{series_id:'2',title:'持械入宋：第二季',genre:'comic_series',genre_source:'search_tab'},{series_id:'1',title:'持械入宋：第一季',genre:'comic_series',genre_source:'search_tab'},{series_id:'3',title:'持械入宋：宣和铁骑',genre:'comic_series'}];
 assert.deepEqual(seasonCandidates(found,current).map(d=>d.series_id),['1','2']);
 assert.equal(seasonFamily(current),seasonFamily(found[0]));
});
