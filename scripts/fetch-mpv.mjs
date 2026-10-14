import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const tag='20261013', file='mpv-x86_64-20261013-git-9d144e57b6.7z';
const sha='551c3ec2e18db657d4f13775902145a72fb1900478719b9004ec446465fd93b9';
await mkdir('work',{recursive:true}); await mkdir('runtime/mpv',{recursive:true});
const url=`https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/${tag}/${file}`;
const res=await fetch(url); if(!res.ok) throw Error(`HTTP ${res.status}`);
const bytes=Buffer.from(await res.arrayBuffer());
if(createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('mpv SHA256 mismatch');
await writeFile(`work/${file}`,bytes);
execFileSync('tar.exe',['-xf',`work/${file}`,'-C','runtime/mpv'],{stdio:'inherit'});
await writeFile('runtime/mpv/source.json',JSON.stringify({tag,url,sha256:sha},null,2));
for(const name of ['LICENSE.GPL','LICENSE.LGPL','Copyright']){const response=await fetch(`https://raw.githubusercontent.com/mpv-player/mpv/9d144e57b6/${name}`);if(!response.ok)throw Error('Cannot fetch '+name);await writeFile(`runtime/mpv/${name}`,await response.text());}
await unlink(`work/${file}`);
console.log('mpv runtime downloaded and SHA256 verified');
