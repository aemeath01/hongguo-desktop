import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindowTransition,createVideoSurfaceSync} from '../src/player-window.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const rect=width=>({x:0,y:64,width,height:700,visible:true});

test('a burst of fullscreen actions cannot toggle the native window twice',async()=>{
 const gate=createWindowTransition(),wait=deferred();let fullscreen=false,calls=0;
 const toggle=()=>gate.run(async()=>{calls++;await wait.promise;fullscreen=!fullscreen;});
 const first=toggle();assert.equal(gate.busy,true);assert.equal(toggle(),first);
 wait.resolve();await first;assert.equal(calls,1);assert.equal(fullscreen,true);assert.equal(gate.busy,false);
 await toggle();assert.equal(fullscreen,false);
});
test('failed native transitions release the gate so exit/close can recover',async()=>{
 const gate=createWindowTransition();await assert.rejects(gate.run(()=>{throw Error('window failed');}));
 let recovered=false;await gate.run(()=>{recovered=true;});assert.equal(recovered,true);assert.equal(gate.busy,false);
});
test('resize bursts retain only the latest video rectangle, and identical rectangles do not repaint',async()=>{
 const wait=deferred(),sent=[];const sync=createVideoSurfaceSync(async r=>{sent.push(r);if(sent.length===1)await wait.promise;});
 sync.update(rect(800));sync.update(rect(1000));sync.update(rect(1200));
 assert.equal(sent.length,1);wait.resolve();await tick();assert.deepEqual(sent,[rect(800),rect(1200)]);
 sync.update(rect(1200));await tick();assert.equal(sent.length,2);
});
test('unmount cancels queued visible rectangles and hides after an outstanding native request',async()=>{
 const wait=deferred(),sent=[];const sync=createVideoSurfaceSync(async r=>{sent.push(r);if(sent.length===1)await wait.promise;});
 sync.update(rect(800));sync.update(rect(1200));sync.dispose();sync.update(rect(1400));
 wait.resolve();await tick();assert.equal(sent.length,2);assert.equal(sent.at(-1).visible,false);
});
test('failed surface updates remain retryable',async()=>{
 let attempts=0,errors=0;const sync=createVideoSurfaceSync(async()=>{if(++attempts===1)throw Error('IPC');},()=>errors++);
 sync.update(rect(800));await tick();sync.update(rect(800));await tick();assert.equal(attempts,2);assert.equal(errors,1);
});
