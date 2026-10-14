import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnhancementMonitor} from '../src/enhancement-monitor.js';
test('frozen/slow video and sustained AV desync trigger fallback without drops',()=>{
 for(const advance of [0,.1]){const m=createEnhancementMonitor();assert.equal(m.sample(0,{'time-pos':0}),false);assert.equal(m.sample(3000,{'time-pos':advance}),false);assert.equal(m.sample(6000,{'time-pos':advance*2}),true);}
 const m=createEnhancementMonitor();m.sample(0,{'time-pos':0,avsync:2});m.sample(3000,{'time-pos':3,avsync:2});assert.equal(m.sample(6000,{'time-pos':6,avsync:2}),true);
});
test('pause, network buffering, seeking and playback speeds do not cause false fallback',()=>{
 for(const reason of ['pause','paused-for-cache','seeking']){const m=createEnhancementMonitor();for(let n=0;n<=9;n++)assert.equal(m.sample(n*1000,{'time-pos':0,[reason]:true}),false);assert.equal(m.sample(10000,{'time-pos':1}),false);}
 const m=createEnhancementMonitor();for(let n=0;n<=9;n++)assert.equal(m.sample(n*1000,{'time-pos':n*.5,speed:.5}),false);
 m.reset();assert.equal(m.sample(20000,{'time-pos':100}),false);
});
