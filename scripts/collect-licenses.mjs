import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const entries=[];
async function collect(name,version,license,dir,repository){
 const files=[];
 const visit=(base,depth=0)=>{for(const file of fs.readdirSync(base,{withFileTypes:true})){
  if(file.isFile()&&/^(licen[cs]e|copying|copyright|notice)([.\-_]|$)/i.test(file.name)){
   const full=path.join(base,file.name);if(fs.statSync(full).size<500000)files.push({name:path.relative(dir,full).replaceAll('\\','/'),text:fs.readFileSync(full,'utf8')});
  }else if(depth===0&&file.isDirectory()&&/^(license|licenses|legal)$/i.test(file.name))visit(path.join(base,file.name),1);
 }};visit(dir);
 const repo=typeof repository==='string'?repository:repository?.url;
 if(!files.length&&name.startsWith('cargo:')&&/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repo||'')){
  const vcs=JSON.parse(fs.readFileSync(path.join(dir,'.cargo_vcs_info.json'))),commit=vcs.git.sha1;
  if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Invalid upstream commit');
  const names=['LICENSE','LICENSE-MIT','LICENSE-APACHE','LICENSE.txt','COPYING'];
  const upstream=await Promise.all(names.map(async filename=>{
   const cache=path.join('docs/licenses/upstream',`${name.slice(6)}-${version}-${filename}`);
   const url=`https://raw.githubusercontent.com/${repo.slice(19)}/${commit}/${filename}`;
   if(fs.existsSync(cache))return {name:filename+' — '+url,text:fs.readFileSync(cache,'utf8')};
   const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(response.status===404)return null;if(!response.ok)throw Error('License download failed: '+url);
   const text=await response.text();if(!text.trim()||text.includes('<html'))throw Error('Invalid license response');
   fs.mkdirSync(path.dirname(cache),{recursive:true});fs.writeFileSync(cache,text);
   return {name:filename+' — '+url,text};
  }));files.push(...upstream.filter(Boolean));
  if(!files.length&&license==='MPL-2.0'){
   const cache='docs/licenses/upstream/MPL-2.0.txt',url='https://www.mozilla.org/MPL/2.0/index.txt';
   let text;if(fs.existsSync(cache))text=fs.readFileSync(cache,'utf8');else{const response=await fetch(url);if(!response.ok)throw Error('MPL license unavailable');text=await response.text();if(!text.includes('Mozilla Public License Version 2.0'))throw Error('Invalid MPL license');fs.writeFileSync(cache,text);}
   files.push({name:'MPL-2.0 — '+url,text});
  }
 }
 entries.push({name,version,license,repository:repo,files});
}
const lock=JSON.parse(fs.readFileSync('package-lock.json'));
for(const [location,meta] of Object.entries(lock.packages)){if(!location||meta.dev)continue;const pkg=JSON.parse(fs.readFileSync(path.join(location,'package.json')));await collect('npm:'+pkg.name,pkg.version,pkg.license,location,pkg.repository);}
const cargo=process.env.CARGO||'cargo';
const metadata=JSON.parse(execFileSync(cargo,['metadata','--locked','--format-version','1','--filter-platform','x86_64-pc-windows-msvc','--manifest-path','src-tauri/Cargo.toml'],{maxBuffer:30*1024*1024,encoding:'utf8'}));
const resolved=new Set(metadata.resolve.nodes.map(n=>n.id));
await Promise.all(metadata.packages.filter(p=>p.source&&resolved.has(p.id)).map(p=>collect('cargo:'+p.name,p.version,p.license||'See source license',path.dirname(p.manifest_path),p.repository)));
entries.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const missing=entries.filter(e=>!e.files.length);
if(missing.length){console.error('Missing license files: '+missing.map(e=>e.name+'@'+e.version).join(', '));process.exitCode=1;}
const header='THIRD-PARTY DEPENDENCY NOTICES\nGenerated from package-lock.json and Cargo.lock. Includes build/transitive crates.\nThird-party names and copyrights belong to their respective authors.\n';
const text=entries.map(e=>`\n${'='.repeat(76)}\n${e.name} ${e.version}\nLicense: ${e.license}\n${e.repository||''}\n${e.name.startsWith('cargo:')?`Unmodified source: https://crates.io/api/v1/crates/${e.name.slice(6)}/${e.version}/download\n`:''}${e.files.map(f=>`\n--- ${f.name} ---\n${f.text}`).join('')}`).join('');
fs.mkdirSync('docs/licenses',{recursive:true});fs.writeFileSync('docs/licenses/THIRD-PARTY.txt',header+text);
console.log(`Collected ${entries.length} dependency notices; ${missing.length} missing license files.`);
