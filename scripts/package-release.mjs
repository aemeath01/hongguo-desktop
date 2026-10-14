import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyTauriSignature} from './update-signature.mjs';
import {execFileSync} from 'node:child_process';
const version=JSON.parse(fs.readFileSync('package.json')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid release version');
const config=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json'));
if(config.version!==version)throw Error('Version mismatch');
const root=path.resolve('releases',`v${version}`),portable=path.join(root,'portable');
if(fs.existsSync(root))throw Error('Release directory already exists; inspect it before replacing.');
const setupSource=path.resolve(`src-tauri/target/release/bundle/nsis/红果免费短剧_${version}_x64-setup.exe`);
const signature=fs.readFileSync(setupSource+'.sig','utf8').trim();
// Tauri uses minisign's prehashed Ed25519 format. Verify the signature before
// copying any release artifacts; a stale key or stale installer must fail.
const setupBytes=fs.readFileSync(setupSource);
if(!verifyTauriSignature(setupBytes,signature,config.plugins.updater.pubkey))throw Error('Updater signature verification failed');
const tampered=Buffer.from(setupBytes);tampered[128]^=1;
if(verifyTauriSignature(tampered,signature,config.plugins.updater.pubkey))throw Error('Tamper rejection failed');
fs.mkdirSync(portable,{recursive:true});
for(const [from,to] of [
 ['src-tauri/target/release/hongguo-desktop.exe','红果免费短剧.exe'],['native','native'],['LICENSE','LICENSE'],['README.md','README.md'],['THIRD-PARTY-NOTICES.md','THIRD-PARTY-NOTICES.md'],['docs/licenses','docs/licenses'],['docs/assets','docs/assets']
])fs.cpSync(from,path.join(portable,to),{recursive:true});
fs.writeFileSync(path.join(portable,'portable.json'),JSON.stringify({portable:true,version})+'\n');
fs.writeFileSync(path.join(portable,'开始使用.txt'),'红果免费短剧 '+version+'\r\n\r\n完整解压后运行「红果免费短剧.exe」。\r\n首次使用：设置 → 模块与存储 → 安装 mpv → 导入已有客户端的 backend。\r\n需要 Windows 10/11 x64 和 Microsoft WebView2 Runtime。\r\n便携版更新：退出后覆盖程序文件，保留 data 和 hongguo-storage.json。\r\nhttps://github.com/aemeath01/hongguo-desktop\r\n');
const prefix=`Hongguo-${version}-windows-x64`,setup=`${prefix}-setup.exe`,zip=`${prefix}-portable.zip`;
fs.copyFileSync(setupSource,path.join(root,setup));fs.writeFileSync(path.join(root,setup+'.sig'),signature+'\n');
execFileSync('tar.exe',['-a','-cf',path.join(root,zip),'-C',portable,'.']);
const listing=execFileSync('tar.exe',['-tf',path.join(root,zip)],{encoding:'utf8'});
if(/(^|\/)(data|runtime|\.git|node_modules|backend|EBWebView)\/|hongguo-storage|\.key|password\.txt/m.test(listing))throw Error('Forbidden portable content');
const notes=fs.readFileSync(`docs/releases/v${version}.md`,'utf8');
fs.writeFileSync(path.join(root,'latest.json'),JSON.stringify({version,notes,pub_date:new Date().toISOString(),platforms:{'windows-x86_64':{signature,url:`https://github.com/aemeath01/hongguo-desktop/releases/download/v${version}/${setup}`}}},null,2)+'\n');
const names=[setup,setup+'.sig',zip,'latest.json'];
fs.writeFileSync(path.join(root,'SHA256SUMS.txt'),names.map(name=>`${createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}  ${name}`).join('\n')+'\n');
console.log(`Release v${version}: installer + clean portable + signed updater manifest. Signature and tamper rejection passed.`);
