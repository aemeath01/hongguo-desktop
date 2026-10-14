// Tests the actual mpv -> VapourSynth -> GPU model pipeline with synthetic video.
// This does not establish full-resolution real-time performance.
import {spawn} from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
const root=process.cwd();
const option=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const ai=path.resolve(option('runtime')||path.join(root,'runtime/ai'));
const size=option('size')||'256x144',seconds=Number(option('seconds')||12);
if(!/^\d+x\d+$/.test(size)||!Number.isFinite(seconds)||seconds<1||seconds>60)throw Error('Invalid probe dimensions / duration');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function probe(profile,interpolation){
 const pipe=`\\\\.\\pipe\\hg-ai-test-${process.pid}-${Date.now()}`;
 const p=spawn(path.join(root,'runtime/mpv/mpv.exe'),['--no-config','--idle=yes','--vo=null','--ao=null','--hwdec=no','--terminal=yes','--msg-level=all=warn','--input-ipc-server='+pipe],{windowsHide:true,env:{...process.env,VSSCRIPT_PATH:path.join(ai,'Lib/site-packages/vapoursynth/vsscript.dll'),PYTHONHOME:ai,PATH:ai+';'+path.join(ai,'Lib/site-packages/vapoursynth')+';'+process.env.PATH}});
 let log='';p.stdout.on('data',b=>{log+=b.toString();});p.stderr.on('data',b=>{log+=b.toString();});
 let socket;const pending=new Map();let id=0,buffer='';
 try{
 for(let i=0;i<100;i++){try{socket=await new Promise((resolve,reject)=>{const s=net.connect(pipe,()=>resolve(s));s.once('error',reject);});break;}catch{await wait(100);}}
 if(!socket)throw Error('IPC unavailable');socket.on('error',()=>{});
 socket.on('data',b=>{buffer+=b;let nl;while((nl=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,nl);buffer=buffer.slice(nl+1);try{const data=JSON.parse(line);if(pending.has(data.request_id)){pending.get(data.request_id)(data);pending.delete(data.request_id);}}catch{}}});
 const cmd=command=>new Promise((resolve,reject)=>{const key=++id;const timeout=setTimeout(()=>{pending.delete(key);reject(Error('IPC timeout'));},45000);pending.set(key,r=>{clearTimeout(timeout);r.error==='success'?resolve(r.data):reject(Error(r.error));});socket.write(JSON.stringify({command,request_id:key})+'\n');});
 const config={runtime:ai,profile,interpolation,backend:'vulkan'};
 await cmd(['set_property','vf',[{name:'vapoursynth',params:{file:path.join(root,'native/ai.vpy'),'user-data':JSON.stringify(config),'buffered-frames':'8','concurrent-frames':'2'}}]]);
 await cmd(['loadfile',`av://lavfi:testsrc2=size=${size}:rate=25`]);
 const began=performance.now();
 await wait(seconds*1000);
 const result={profile,interpolation,size,time:await cmd(['get_property','time-pos']),fps:await cmd(['get_property','estimated-vf-fps']),output:await cmd(['get_property','video-out-params']),wallSeconds:(performance.now()-began)/1000};
 console.log(JSON.stringify(result));
 if(!result.output||result.time<1)throw Error('No decoded output');
 if(profile==='realesrgan'&&result.output.w!==Number(size.split('x')[0])*2)throw Error('Upscaling did not produce 2x output');
 if(interpolation==='rife2x'&&result.fps<49)throw Error('Interpolation did not report 50fps output');
 }catch(e){console.log(JSON.stringify({profile,interpolation,error:e.message,log:log.slice(-2500)}));process.exitCode=1;}
 finally{socket?.destroy();const ended=new Promise(r=>p.once('exit',r));if(p.exitCode===null){p.kill();await ended;}}
}
if(process.argv.includes('--sr'))await probe('realesrgan','off');else if(process.argv.includes('--rife'))await probe('original','rife2x');else {await probe('original','rife2x');await probe('realesrgan','off');}
