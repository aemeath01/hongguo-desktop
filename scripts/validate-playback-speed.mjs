// Exercise the actual bundled mpv and native key bindings using a generated
// clip. No online media, user settings, viewing history or cache files change.
import {spawn} from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createPlaybackSpeed} from '../src/playback-speed.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const pipe=`\\\\.\\pipe\\hongguo-speed-test-${randomUUID()}`;
const child=spawn(path.join(root,'runtime/mpv/mpv.exe'),[
  '--no-config','--idle=yes','--keep-open=no','--vo=null','--ao=null','--terminal=no',
  '--input-default-bindings=no',`--input-ipc-server=${pipe}`,`--script=${path.join(root,'native/controls.lua')}`,
],{windowsHide:true,stdio:'ignore'});
let childError;child.on('error',e=>childError=e);
let socket,buffer='',id=0;
const pending=new Map(),events=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(command){
  const request_id=++id;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(request_id);reject(new Error('mpv reply timed out'));},5000);
    pending.set(request_id,{resolve,reject,timer});
    socket.write(JSON.stringify({command,request_id})+'\n');
  });
}
async function until(check,label){
  const started=Date.now();
  while(Date.now()-started<5000){if(await check())return;await delay(40);}
  throw new Error(label+' timed out');
}
const selected=createPlaybackSpeed(1),preferences={speed:1};
const report={date:new Date().toISOString(),checks:[]};
const expectSpeed=async(speed,label)=>{
  await until(async()=>await request(['get_property','speed'])===speed,label);
  report.checks.push({name:label,speed,passed:true});
};
async function openEpisode(){
  await request(['stop']);
  await request(['script-message','set-speed',String(selected.forEpisode(preferences).speed)]);
  await request(['loadfile','av://lavfi:testsrc2=size=64x96:rate=30:duration=8','replace']);
  await until(async()=>{
    try{return await request(['get_property','time-pos'])>0.05;}catch{return false;}
  },'new episode playback');
}
try{
  const start=Date.now();
  while(!socket&&Date.now()-start<5000){
    if(childError)throw childError;
    socket=await new Promise(resolve=>{const candidate=net.createConnection(pipe);candidate.once('connect',()=>resolve(candidate));candidate.once('error',()=>{candidate.destroy();resolve(null);});});
    if(!socket)await delay(50);
  }
  if(!socket)throw new Error('mpv IPC unavailable');
  socket.on('error',()=>{});
  socket.on('data',chunk=>{
    buffer+=chunk.toString('utf8');
    let end;
    while((end=buffer.indexOf('\n'))!==-1){
      const text=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!text)continue;
      const reply=JSON.parse(text);if(reply.event)events.push(reply);
      const waiting=pending.get(reply.request_id);
      if(waiting){pending.delete(reply.request_id);clearTimeout(waiting.timer);reply.error==='success'?waiting.resolve(reply.data):waiting.reject(new Error(reply.error));}
    }
  });
  await openEpisode();await expectSpeed(1,'default');
  selected.select(2);await request(['script-message','set-speed','2']);await expectSpeed(2,'menu selection');
  await openEpisode();await expectSpeed(2,'manual next episode');
  await request(['script-message','preferences','3','5','true']);
  await request(['keydown','RIGHT']);await expectSpeed(3,'native hold');
  await request(['keyup','RIGHT']);await expectSpeed(2,'native release');
  await request(['keydown','RIGHT']);await expectSpeed(3,'hold during transition');
  await openEpisode();await request(['keyup','RIGHT']);await expectSpeed(2,'transition cancels temporary speed');
  events.length=0;
  await request(['loadfile','av://lavfi:testsrc2=size=64x96:rate=30:duration=0.5','replace']);
  await until(async()=>events.some(e=>e.event==='end-file'&&e.reason==='eof'),'end of episode');
  await openEpisode();await expectSpeed(2,'EOF next episode');
  await request(['keydown','LEFT']);await expectSpeed(3,'hold before menu change');
  selected.select(1.5);await request(['script-message','set-speed','1.5']);await expectSpeed(1.5,'menu change cancels native hold');
  await request(['keyup','LEFT']);await delay(150);assert.equal(await request(['get_property','speed']),1.5);
  report.checks.push({name:'late key-up preserves new menu speed',speed:1.5,passed:true});
  await openEpisode();await expectSpeed(1.5,'new menu speed carries to next episode');
  assert.equal(preferences.speed,1);report.passed=true;
  await fs.writeFile(path.join(root,'docs/playback-speed-validation.json'),JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify(report,null,2));
} finally {
  for(const waiting of pending.values()){clearTimeout(waiting.timer);waiting.reject(new Error('player stopped'));}
  pending.clear();socket?.destroy();
  if(child.exitCode===null&&!childError){const exited=once(child,'exit');child.kill();await exited;}
}
