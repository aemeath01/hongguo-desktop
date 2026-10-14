import {useEffect,useSyncExternalStore} from 'react';
import {check} from '@tauri-apps/plugin-updater';
import {relaunch} from '@tauri-apps/plugin-process';
import {desktop,native} from './desktop-api.js';
let state={status:'从项目 GitHub Release 检查更新',busy:false,update:null,downloaded:false,portable:false};
const subscribers=new Set();
const patch=values=>{state={...state,...values};subscribers.forEach(fn=>fn());};
export const useUpdateState=()=>useSyncExternalStore(fn=>{subscribers.add(fn);return()=>subscribers.delete(fn);},()=>state);
let started=false;
export async function downloadUpdate(){
 if(!state.update||state.busy||state.downloaded||state.portable)return;
 patch({busy:true});let received=0,total=0;
 try{await state.update.download(e=>{if(e.event==='Started')total=e.data.contentLength||0;if(e.event==='Progress'){received+=e.data.chunkLength;patch({status:`下载更新 ${total?Math.min(100,Math.round(received/total*100))+'%':Math.round(received/1048576)+' MB'}`});}});patch({downloaded:true,status:'更新已下载并通过签名校验。安装时应用将关闭，请先结束观看。'});}
 catch(e){patch({status:String(e.message||e)});}finally{patch({busy:false});}
}
export async function checkUpdate(autoDownload=false){
 if(state.busy||state.downloaded)return;
 patch({busy:true,status:'正在检查更新…'});
 try{const config=await native('update_status');patch({portable:!!config.portable});if(!config.configured){patch({status:'发布源未配置。配置签名公钥和更新地址后可检查新版本。'});return;}
 const found=await check();if(state.update)await state.update.close().catch(()=>{});patch({update:found,downloaded:false,status:found?`发现新版本 ${found.version}${config.portable?' · 便携版请下载 ZIP 更新':''}`:'已是最新版本'});
 }catch(e){patch({status:String(e.message||e)});}finally{patch({busy:false});}
 if(autoDownload&&state.update)await downloadUpdate();
}
export async function installUpdate(){if(!state.downloaded||!state.update||state.busy||state.portable)return;patch({busy:true});try{await native('stop_player');await state.update.install();await relaunch();}catch(e){patch({status:String(e.message||e),busy:false});}}
export async function openRelease(){try{await native('open_project_link',{kind:'releases'});}catch(e){patch({status:e.message});}}
export function StartupUpdates({preferences,onAvailable}){
 useEffect(()=>{if(started||!desktop||!preferences.checkUpdates)return;started=true;checkUpdate(preferences.downloadUpdates).then(()=>{if(state.update)onAvailable(state.update.version);});},[preferences.checkUpdates,preferences.downloadUpdates]);return null;
}
