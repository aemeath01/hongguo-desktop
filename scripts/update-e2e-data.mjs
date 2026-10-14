// Offline inspection of a fresh, isolated WebView2 test profile. Never point this at user data.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const sandbox=path.resolve('work/update-validation');
const mode=process.argv[2],root=path.resolve(process.argv[3]||sandbox+'/installed-default/data');
if(!root.startsWith(sandbox+path.sep))throw Error('Only work/update-validation profiles are allowed');
const directory=path.join(root,'EBWebView/Default/Local Storage/leveldb');
function variable(value){const bytes=[];do{const n=value&127;value=Math.floor(value/128);bytes.push(n|(value?128:0));}while(value);return Buffer.from(bytes);}
function readVariable(buffer,cursor){let value=0,factor=1;for(let n=0;n<5;n++){const b=buffer[cursor.i++];if(b===undefined)throw Error('Truncated varint');value+=(b&127)*factor;if(b<128)return value;factor*=128;}throw Error('Oversized varint');}
function crc32c(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0x82f63b78:0);}return (~crc)>>>0;}
function logRecord(batch){const head=Buffer.alloc(7),crc=crc32c(Buffer.concat([Buffer.from([1]),batch]));head.writeUInt32LE((((crc>>>15)|(crc<<17))+0xa282ead8)>>>0);head.writeUInt16LE(batch.length,4);head[6]=1;return Buffer.concat([head,batch]);}
function batches(){
 if(fs.readdirSync(directory).some(n=>/\.(?:ldb|sst)$/.test(n)))throw Error('Profile compacted; use the UI to validate, do not infer missing table records');
 const found=[];
 for(const file of fs.readdirSync(directory).filter(n=>n.endsWith('.log')).sort()){
  const data=fs.readFileSync(path.join(directory,file));let at=0,parts=[];
  while(at+7<=data.length){const left=32768-(at%32768);if(left<7){at+=left;continue;}const length=data.readUInt16LE(at+4),type=data[at+6];if(!length&&!type){at+=left;continue;}const part=data.subarray(at+7,at+7+length);if(part.length!==length)break;at+=7+length;
   if(type===1)found.push(part);else if(type===2)parts=[part];else if(type===3)parts.push(part);else if(type===4){parts.push(part);found.push(Buffer.concat(parts));parts=[];}
  }
 }
 return found;
}
function entries(){const values=new Map();let max=0n;for(const batch of batches()){
 const sequence=batch.readBigUInt64LE(),count=batch.readUInt32LE(8),cursor={i:12};
 for(let i=0;i<count;i++){const tag=batch[cursor.i++],keyLength=readVariable(batch,cursor),key=batch.subarray(cursor.i,cursor.i+=keyLength);let value=null;if(tag===1){const length=readVariable(batch,cursor);value=batch.subarray(cursor.i,cursor.i+=length);}else if(tag!==0)throw Error('Unknown WriteBatch tag');const seq=sequence+BigInt(i),hex=key.toString('hex');if(seq>max)max=seq;if(!values.has(hex)||values.get(hex).seq<seq)values.set(hex,{key,value,seq});}
 }return {values,max};}
function jsonValues(){const result={};for(const {key,value}of entries().values.values()){if(!value)continue;const at=key.indexOf(Buffer.from('\0\x01hongguo.'));if(at<0)continue;const name=key.subarray(at+2).toString('latin1'),text=value.subarray(1).toString(value[0]===0?'utf16le':'latin1');result[name]=JSON.parse(text);}return result;}
function fixture(){
 const drama=(id,title,genre)=>({series_id:id,title,genre,category:'剧情 / 成长 / 测试记录',cover:'',episode_cnt:80,score:'8.2',play_cnt:250000,intro:'仅用于自动更新数据保留实测。'});
 const library=[drama('9000000000000000001','更新验证 · 短剧','short_play'),drama('9000000000000000002','更新验证 · AI 剧','ai_series'),drama('9000000000000000003','更新验证 · 漫剧','comic_series')];
 return {'hongguo.library':library,'hongguo.favorites':library.map(d=>d.series_id),'hongguo.history':[{id:library[0].series_id,episode:7,position:43.25,drama:library[0],opened:1791957600000},{id:library[1].series_id,episode:12,position:76.5,drama:library[1],opened:1791871200000}],
 'hongguo.settings':{carousel:false,recommendations:false,recordHistory:true,autoNext:false,speed:2,holdSpeed:3,seekSeconds:15,resume:true,preload:'smart',keepAwake:false,pauseOnMinimize:true,decoding:'software',enhancement:'original',adaptiveQuality:true,superResolution:'off',interpolation:'off',inferenceBackend:'vulkan',bossEnabled:false,bossShortcut:'Ctrl+Alt+J',closeAction:'quit',checkUpdates:false,downloadUpdates:false},
 'hongguo.theme':'light','hongguo.sidebarCollapsed':false,'hongguo.searchHistory':['更新验证 · 短剧','更新验证 · AI 剧','更新验证 · 漫剧'],'hongguo.latest':[]};
}
if(mode==='seed'){
 const {values,max}=entries(),origin=Buffer.from('_http://tauri.localhost\0\x01','latin1');const changes=Object.entries(fixture()).map(([name,value])=>({key:Buffer.concat([origin,Buffer.from(name)]),value:Buffer.concat([Buffer.from([0]),Buffer.from(JSON.stringify(value),'utf16le')])}));
 const metadata=[...values.values()].find(v=>v.key.toString().startsWith('META:'));if(metadata?.value)changes.push({key:metadata.key,value:metadata.value});
 const header=Buffer.alloc(12);header.writeBigUInt64LE(max+1n);header.writeUInt32LE(changes.length,8);const batch=Buffer.concat([header,...changes.flatMap(({key,value})=>[Buffer.from([1]),variable(key.length),key,variable(value.length),value])]);if(batch.length>32761)throw Error('Fixture too large');
 const log=path.join(directory,fs.readdirSync(directory).filter(n=>n.endsWith('.log')).sort().at(-1));const offset=fs.statSync(log).size%32768;if(32768-offset<batch.length+7)fs.appendFileSync(log,Buffer.alloc(32768-offset));fs.appendFileSync(log,logRecord(batch));
 fs.writeFileSync(path.join(root,'desktop-config.json'),JSON.stringify({backendDisabled:true}));assert.deepEqual(jsonValues()['hongguo.history'],fixture()['hongguo.history']);console.log('Seeded synthetic records in isolated, closed WebView profile.');
}else if(mode==='snapshot'){
 const values=jsonValues(),file=path.join(sandbox,process.argv[4]||'before.json');fs.writeFileSync(file,JSON.stringify(values,null,2)+'\n');console.log(JSON.stringify({file,keys:Object.keys(values),history:values['hongguo.history']?.length,favorites:values['hongguo.favorites']?.length}));
}else if(mode==='compare'){
 const before=JSON.parse(fs.readFileSync(path.join(sandbox,process.argv[4]||'before.json'),'utf8')),after=jsonValues();for(const key of ['hongguo.history','hongguo.favorites','hongguo.settings','hongguo.theme','hongguo.sidebarCollapsed','hongguo.searchHistory','hongguo.library'])assert.deepEqual(after[key],before[key],key+' changed during update');
 fs.writeFileSync(path.join(sandbox,process.argv[5]||'after.json'),JSON.stringify(after,null,2)+'\n');console.log('PASS: history, episode/position, favorites, all settings, theme, sidebar, search records and library match exactly.');
}else throw Error('Use seed, snapshot or compare');
