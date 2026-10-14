// Exercise the production Lua overlay in the bundled mpv without a visible
// window, network media, user data, or a second UI automation mechanism.
import {spawn} from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const pipe=`\\\\.\\pipe\\hongguo-overlay-test-${randomUUID()}`;
const child=spawn(path.join(root,'runtime/mpv/mpv.exe'),['--no-config','--idle=yes','--vo=null','--ao=null','--terminal=no','--input-default-bindings=no',`--input-ipc-server=${pipe}`,`--script=${path.join(root,'native/controls.lua')}`,`--script=${path.join(root,'native/fullscreen.lua')}`],{windowsHide:true,stdio:'ignore'});
let childError,socket,buffer='',id=0;child.on('error',e=>childError=e);
const pending=new Map(),events=[],scriptErrors=[],report={date:new Date().toISOString(),checks:[]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function request(command){return new Promise((resolve,reject)=>{const request_id=++id;const timer=setTimeout(()=>{pending.delete(request_id);reject(Error('mpv reply timed out'));},5000);pending.set(request_id,{resolve,reject,timer});socket.write(JSON.stringify({command,request_id})+'\n');});}
async function until(check,label,timeout=5000){const start=Date.now();while(Date.now()-start<timeout){if(await check())return;await delay(20);}throw Error(label+' timed out');}
const state=()=>request(['get_property','user-data/hongguo/fullscreen-controls']);
let configuration=0;
const configure=(on,reduced=false)=>request(['script-message','fullscreen-ui',String(on),'2','5','90','10',String(reduced),String(++configuration)]);
const pass=name=>report.checks.push({name,passed:true});
try{
 await until(async()=>{
  if(childError)throw childError;
  socket=await new Promise(resolve=>{const s=net.createConnection(pipe);s.once('connect',()=>resolve(s));s.once('error',()=>{s.destroy();resolve(null);});});return !!socket;
 },'IPC');
 socket.on('error',()=>{});socket.on('data',chunk=>{
  buffer+=chunk.toString('utf8');let end;
  while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line)continue;const reply=JSON.parse(line);if(reply.event)events.push(reply);if(reply.event==='log-message'&&reply.prefix?.includes('fullscreen')&&['error','fatal'].includes(reply.level))scriptErrors.push(reply);const p=pending.get(reply.request_id);if(p){pending.delete(reply.request_id);clearTimeout(p.timer);reply.error==='success'?p.resolve(reply.data):p.reject(Error(reply.error));}}
 });
 await request(['request_log_messages','warn']);
 await delay(150);await configure(true);
 await until(async()=>{try{return (await state()).opacity>0;}catch{return false;}},'overlay script loaded');
 assert.ok((await state()).opacity<1,'fade-in has intermediate frames');
 await until(async()=>(await state()).opacity===1,'fade-in completion');pass('Lua state animates in (not a visible-window rendering test)');
 assert.equal((await state()).token,String(configuration));assert.equal((await state()).rendered,true);assert.equal((await state()).error,'');pass('overlay command succeeds and acknowledges the current request');
 await until(async()=>(await state()).opacity===0,'idle auto-hide',4500);pass('2.5 second idle hides controls');
 await request(['mouse',400,200]);
 await until(async()=>(await state()).opacity===1,'movement reveal');pass('mpv mouse position command reveals controls without a forced MOUSE_MOVE key');
 // Keyboard navigation also works while HTML controls are hidden.
 for(let i=0;i<5;i++)await request(['script-message','fullscreen-focus','1']);
 await request(['script-message','fullscreen-activate']);
 await until(async()=>(await state()).menu,'speed menu');
 await delay(3000);assert.equal((await state()).opacity,1);pass('open speed menu remains visible');
 await request(['script-message','fullscreen-escape']);await until(async()=>!(await state()).menu,'close menu');
 assert.equal((await state()).enabled,true);pass('first Escape dismisses menu without leaving fullscreen');
 events.length=0;await request(['script-message','fullscreen-escape']);
 await until(async()=>events.some(e=>e.event==='client-message'&&e.args?.[1]==='escape'),'fullscreen Escape');pass('second Escape requests fullscreen exit');
 await configure(false);await configure(true,true);await until(async()=>(await state()).opacity===1,'reduced motion');pass('reduced motion skips animation');
 await request(['script-message','fullscreen-focus','1']);await request(['script-message','fullscreen-focus','1']);
 events.length=0;await request(['script-message','fullscreen-activate']);await until(async()=>events.some(e=>e.args?.[1]==='previous'),'previous episode');pass('previous episode routes to application');
 await configure(false);await until(async()=>!(await state()).enabled,'disable overlay');
 await request(['set_property','pause',false]);await request(['keypress','MBTN_LEFT']);await until(async()=>await request(['get_property','pause'])===true,'windowed click');pass('leaving fullscreen restores windowed input bindings');
 assert.equal(scriptErrors.length,0,JSON.stringify(scriptErrors));
 report.passed=true;await fs.writeFile(path.join(root,'docs/fullscreen-controls-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{
 for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('player stopped'));}pending.clear();socket?.destroy();
 if(child.exitCode===null&&!childError){const exited=once(child,'exit');child.kill();await exited;}
}
