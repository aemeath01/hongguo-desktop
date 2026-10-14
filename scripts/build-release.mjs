import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const local=process.argv.includes('--local');
const env={...process.env};
// Keep local Windows account and build paths out of Rust panic/debug metadata.
const remaps=[os.homedir(),process.cwd()].map((p,i)=>`--remap-path-prefix=${p}=${i?'project':'builder'}`);
env.CARGO_ENCODED_RUSTFLAGS=[...(env.CARGO_ENCODED_RUSTFLAGS?.split('\x1f')||[]),...remaps].join('\x1f');
if(!local&&env.HONGGUO_SIGNING_DIR){
 env.TAURI_SIGNING_PRIVATE_KEY=fs.readFileSync(path.join(env.HONGGUO_SIGNING_DIR,'updater.key'),'utf8');
 env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD=fs.readFileSync(path.join(env.HONGGUO_SIGNING_DIR,'password.txt'),'utf8').trim();
}
if(!local&&!env.TAURI_SIGNING_PRIVATE_KEY)throw Error('Set TAURI_SIGNING_PRIVATE_KEY or HONGGUO_SIGNING_DIR before release build.');
const args=['node_modules/@tauri-apps/cli/tauri.js','build'];
if(local)args.push('--config',JSON.stringify({bundle:{createUpdaterArtifacts:false}}));
const result=spawnSync(process.execPath,args,{env,stdio:'inherit'});process.exit(result.status??1);
