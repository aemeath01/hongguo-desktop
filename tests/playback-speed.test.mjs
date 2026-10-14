import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackSpeed} from '../src/playback-speed.js';
import {createHoldController} from '../src/player-controls.js';

test('menu speed survives next, previous, season changes and player recovery without changing the default',()=>{
  const preferences={speed:1,autoNext:true};
  const session=createPlaybackSpeed(preferences.speed);
  session.select(2);
  for(const transition of ['next','previous','season','seek-reload','enhancement-recovery']) {
    assert.equal(session.forEpisode(preferences).speed,2,transition);
  }
  assert.equal(preferences.speed,1);
  assert.equal(createPlaybackSpeed(preferences.speed).value,1,'a newly opened player starts with the default');
});

test('a held 3x speed never becomes the 2x speed selected for the next episode',()=>{
  const session=createPlaybackSpeed(1);session.select(2);
  let observed=2,fire;
  const hold=createHoldController({getSpeed:()=>session.value,setSpeed:v=>observed=v,seek:()=>{},holdSpeed:3,schedule:fn=>{fire=fn;return 1;},cancel:()=>{}});
  hold.down('ArrowRight');fire();assert.equal(observed,3);
  assert.equal(session.forEpisode({speed:1}).speed,2);
  hold.cancel();assert.equal(observed,2);
  hold.up('ArrowRight');assert.equal(observed,2);
});

test('invalid speeds cannot corrupt a session, and updated non-speed preferences are retained',()=>{
  const session=createPlaybackSpeed(NaN);assert.equal(session.value,1);
  session.select(1.75);
  for(const bad of [NaN,Infinity,0,-1,9,'2',null])session.select(bad);
  assert.deepEqual(session.forEpisode({speed:1,autoNext:false,holdSpeed:4}),{speed:1.75,autoNext:false,holdSpeed:4});
});
