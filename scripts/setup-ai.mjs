// Optional, project-local VapourSynth + ncnn Vulkan runtime. No system Python changes.
import {mkdir,writeFile,readFile,readdir,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const target=path.resolve(process.argv[2]||'runtime/ai'),cache=path.join(target,'downloads');
await mkdir(cache,{recursive:true});
async function download(url,name,digest){const file=path.join(cache,name);let b;try{b=await readFile(file);}catch{}if(!b||digest&&createHash('sha256').update(b).digest('hex')!==digest){console.log('Downloading',name);const r=await fetch(url);if(!r.ok)throw Error(`Download ${name}: ${r.status}`);b=Buffer.from(await r.arrayBuffer());if(digest&&createHash('sha256').update(b).digest('hex')!==digest)throw Error('Checksum mismatch: '+name);await writeFile(file,b);}return file;}
function unpack(file,dir){execFileSync('tar.exe',['-xf',file,'-C',dir],{stdio:'inherit'});}
unpack(await download('https://www.python.org/ftp/python/3.13.10/python-3.13.10-embed-amd64.zip','python.zip','e0780912ee37496035bfc81120cc18a0d93921842012d5e83a71b42110452965'),target);
unpack(await download('https://github.com/vapoursynth/vapoursynth/releases/download/R79/VapourSynth64-Portable-R79.zip','vapoursynth79.zip','625b3410d903943107291592e90d6f521f829ebb8291d952ee91b8d674bbb153'),target);
const site=path.join(target,'Lib/site-packages');await mkdir(site,{recursive:true});
const wheel=(await readdir(path.join(target,'wheel'))).find(n=>n.endsWith('.whl')&&n.includes('-79-'));unpack(path.join(target,'wheel',wheel),site);
await writeFile(path.join(target,'python313._pth'),'python313.zip\n.\nLib/site-packages\nimport site\n');
const plugins=path.join(target,'vs-plugins');await mkdir(plugins,{recursive:true});
unpack(await download('https://github.com/AmusementClub/vs-mlrt/releases/download/v15.16/VSNCNN-Windows-x64.v15.16.7z','vsncnn.7z','2ccf0ec1f84cd60f4a744c04d2a40d988da32f6970542f4f81669d44e9ea2ff1'),plugins);
unpack(await download('https://github.com/AmusementClub/vs-mlrt/releases/download/v15.16/models.v15.16.7z','models.7z','d4eaa8c1c4459082185a9e1a2c54d7e2c776abeea6aef6aee0cb8f6c151dfb02'),plugins);
const wrapper=await download('https://raw.githubusercontent.com/AmusementClub/vs-mlrt/v15.16/scripts/vsmlrt.py','vsmlrt.py','a9bff9b859e5813dca5e2d466e6c13050cca4383d2a2623d53916bc34045058b');await cp(wrapper,path.join(site,'vsmlrt.py'));
const probe=execFileSync(path.join(target,'python.exe'),['-c',"import vapoursynth as vs; vs.core.std.LoadPlugin('vs-plugins/vsncnn.dll'); print(vs.core.ncnn.Version()); import vsmlrt; print('VSMLRT_READY')"],{cwd:target,windowsHide:true,encoding:'utf8'});console.log(probe);
await writeFile(path.join(target,'ready.json'),JSON.stringify({vapoursynth:'R79',vsmlrt:'v15.16',backends:['vulkan'],performanceTested:false},null,2));
console.log('AI module ready at',target);
// Only remove verified download files created by this script, never arbitrary directories.
for(const name of ['python.zip','vapoursynth79.zip','vsncnn.7z','models.7z','vsmlrt.py'])await rm(path.join(cache,name),{force:true});
