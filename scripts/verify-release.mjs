import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyTauriSignature} from './update-signature.mjs';
const version=JSON.parse(fs.readFileSync('package.json')).version,repo='aemeath01/hongguo-desktop';
const release=JSON.parse(execFileSync('gh',['release','view','v'+version,'--repo',repo,'--json','isDraft,tagName,assets'],{encoding:'utf8'}));
const root=path.join('releases','v'+version),names=[`Hongguo-${version}-windows-x64-setup.exe`,`Hongguo-${version}-windows-x64-setup.exe.sig`,`Hongguo-${version}-windows-x64-portable.zip`,'latest.json','SHA256SUMS.txt'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const name of names){const asset=release.assets.find(a=>a.name===name),bytes=fs.readFileSync(path.join(root,name));if(!asset||asset.size!==bytes.length||asset.digest!=='sha256:'+hash(bytes))throw Error('Remote asset mismatch: '+name);}
console.log('All 5 GitHub assets match local sizes and SHA-256.');
if(process.argv.includes('--public')){
 if(release.isDraft)throw Error('Release is still a draft');
 const fetchBytes=async url=>{const response=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error(`Public download HTTP ${response.status}`);return Buffer.from(await response.arrayBuffer());};
 const bytes=await fetchBytes(`https://github.com/${repo}/releases/latest/download/latest.json`),manifest=JSON.parse(bytes);
 if(manifest.version!==version||hash(bytes)!==hash(fs.readFileSync(path.join(root,'latest.json'))))throw Error('Latest manifest mismatch');
 const platform=manifest.platforms['windows-x86_64'];
 if(platform.url!==`https://github.com/${repo}/releases/download/v${version}/${names[0]}`)throw Error('Unexpected installer URL');
 const installer=await fetchBytes(platform.url);
 if(hash(installer)!==hash(fs.readFileSync(path.join(root,names[0]))))throw Error('Downloaded installer mismatch');
 const pubkey=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json')).plugins.updater.pubkey;
 if(!verifyTauriSignature(installer,platform.signature,pubkey))throw Error('Downloaded installer signature invalid');
 installer[128]^=1;if(verifyTauriSignature(installer,platform.signature,pubkey))throw Error('Tampered installer accepted');
 console.log('Public latest.json and installer downloaded without authentication. Signature valid; tampered bytes rejected.');
}
