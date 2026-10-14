import React,{useEffect,useState,useRef} from 'react';
import {listen} from '@tauri-apps/api/event';
import {relaunch} from '@tauri-apps/plugin-process';
import {Cpu,RefreshCw,Download,FolderOpen,FolderCog,HardDrive,Trash2,RotateCcw,Server,Clapperboard,Sparkles,Info,LoaderCircle} from 'lucide-react';
import {native,desktop} from './desktop-api.js';
import {PressButton} from './motion-system.jsx';
import {SettingsGroup as Group,SettingsRow as Row} from './settings-primitives.jsx';

const MODULES=[
 {id:'mpv',title:'mpv 播放核心',Icon:Clapperboard,description:'从上游下载已固定版本的 Windows 播放内核，SHA-256 校验通过后安装。约 40 MB，首次播放前需安装一次。',hint:'基础组件 · 按需安装'},
 {id:'backend',title:'播放服务',Icon:Server,description:'剧库、详情与播放连接。导入原客户端的 backend 文件夹，在当前存储位置安装独立副本。',hint:'基础服务'},
 {id:'anime4k',title:'Anime4K 漫剧增强',Icon:Clapperboard,description:'轻量 GPU 着色器，适合动漫线条增强。安装后可在「画质与性能」中开启。',hint:'可选 · 默认关闭'},
 {id:'ai',title:'AI 超分与 RIFE 插帧',Icon:Sparkles,description:'VapourSynth + ncnn Vulkan，首次下载约 900 MB。支持 AMD、Intel 与 NVIDIA；效果和实时性能取决于硬件与片源。',hint:'实验性 · 默认关闭'}
];
function bytes(n){if(!Number.isFinite(n))return '—';if(n<1048576)return `${(n/1024).toFixed(0)} KB`;return n>=1073741824?`${(n/1073741824).toFixed(2)} GB`:`${(n/1048576).toFixed(1)} MB`;}

export function RuntimeSettings(){
 const [storage,setStorage]=useState(null),[caps,setCaps]=useState(null),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[progress,setProgress]=useState(null);
 const mounted=useRef(true),inFlight=useRef(false);
 async function refresh(){const value=await native('storage_status');if(mounted.current)setStorage(value);return value;}
 useEffect(()=>{
   mounted.current=true;let dispose,gone=false;
   if(desktop){refresh().catch(e=>setMessage(e.message));native('capabilities').then(v=>mounted.current&&setCaps(v)).catch(()=>{});
     listen('module-progress',({payload})=>{if(mounted.current)setProgress(payload);}).then(f=>{if(gone)f();else dispose=f;}).catch(()=>{});
   }
   return()=>{gone=true;mounted.current=false;dispose?.();};
 },[]);
 useEffect(()=>{if(!storage?.busy||busy)return;const timer=setInterval(()=>refresh().catch(()=>{}),2000);return()=>clearInterval(timer);},[storage?.busy,busy]);
 const disabled=!desktop||!!busy||!!storage?.busy;
 async function run(id,fn){
   if(inFlight.current)return;inFlight.current=true;setBusy(id);setFailed(false);setMessage('');setProgress(null);
   try{const result=await fn();if(mounted.current&&result?.message)setMessage(result.message);}
   catch(e){if(mounted.current){setFailed(true);setMessage(e.message||String(e));}}
   finally{if(mounted.current){await refresh().catch(()=>{});setBusy('');setProgress(null);}inFlight.current=false;}
 }
 const open=target=>run('open-'+target,()=>native('open_managed_folder',{target}));
 const manage=(module,action,source=null)=>native('manage_runtime',{module,action,source});
 const pickBackend=()=>run('backend',async()=>{const source=await native('choose_directory',{purpose:'backend'});if(source)return manage('backend','install',source);});
 const pickStorage=()=>run('location',async()=>{const directory=await native('choose_directory',{purpose:'storage'});if(directory)return native('set_storage_directory',{directory});});
 const installedCount=storage?.modules.filter(m=>m.installed).length;
 const progressLabel=progress?.stage|| (progress?.file?`正在下载 ${progress.file}`:'');
 const percent=progress?.total?Math.min(100,Math.round(progress.downloaded/progress.total*100)):null;
 return <div className="runtime-manager">
   {!desktop&&<div className="settings-notice"><Info size={16}/><p>目录与安装管理在桌面客户端中可用。</p><span>界面预览</span></div>}
   <Group title="存储位置" description="播放服务、可选模块和缓存集中存放，默认位于软件安装目录的 data 文件夹。">
     <div className="storage-location"><div className="runtime-symbol"><FolderCog size={21}/></div><div className="storage-location-info"><strong>{storage?.directory||'软件安装目录 / data'}</strong><p>{storage?.pendingDirectory?'下次启动迁移至：'+storage.pendingDirectory:'自定义位置会新建 HongguoData 文件夹，重启时迁移现有数据。'}</p></div><div className="runtime-actions"><PressButton className="settings-button" disabled={disabled} onClick={()=>open('data')}><FolderOpen size={14}/>打开文件夹</PressButton><PressButton className="settings-button" disabled={disabled} onClick={pickStorage}>更改位置</PressButton></div></div>
     <div className="storage-location-footer"><span>{storage?.notice||'切换目录会保留收藏、历史和偏好，旧数据保留为备份。'}</span>{storage?.pendingDirectory?<PressButton className="settings-button primary-action" disabled={disabled} onClick={()=>run('restart',relaunch)}><RefreshCw size={13}/>重启并迁移</PressButton>:storage&&storage.directory!==storage.defaultDirectory?<PressButton className="runtime-text-button" disabled={disabled} onClick={()=>run('location',()=>native('set_storage_directory',{directory:null}))}>恢复默认位置</PressButton>:<span className="runtime-mini-tag">随安装位置</span>}</div>
   </Group>
   <Group title="播放服务与可选模块" description="统一管理安装与卸载；重新安装失败时保留原有可用版本。">
     <div className="module-summary"><span><Server size={14}/>{installedCount==null?'服务与增强组件':`${installedCount} 个组件已安装`}</span><PressButton className="runtime-text-button" disabled={disabled} onClick={()=>run('check',async()=>{await native('backend_status');return {message:'播放服务已连接。'};})}><RefreshCw size={13}/>检查播放服务</PressButton></div>
     {MODULES.map(({id,title,Icon,description,hint})=>{const item=storage?.modules.find(m=>m.id===id);const installed=item?.installed;return <div className="runtime-module" key={id}><div className="runtime-module-heading"><div className="runtime-symbol"><Icon size={20}/></div><div><h3>{title}<span className={`module-state ${installed?'installed':''}`}>{installed?'已安装':item?.bytes>0?'待清理':desktop&&storage?'未安装':'待检测'}</span></h3><p>{hint}{item?.bytes>0&&` · ${bytes(item.bytes)}`}</p></div></div><p className="runtime-description">{description}</p><div className="runtime-module-bottom"><span className="runtime-path">{item?.path||`data / ${['backend','mpv'].includes(id)?`services/${id}`:`enhancements/${id}`}`}</span><div className="runtime-actions"><PressButton className="settings-button" disabled={disabled} onClick={()=>open(id)} aria-label={`打开${title}文件夹`}><FolderOpen size={14}/><span>打开文件夹</span></PressButton>{installed?<><PressButton className="settings-button" disabled={disabled} onClick={()=>run(id,()=>manage(id,'reinstall'))} aria-label={`重新安装${title}`}><RotateCcw size={14}/><span>重装</span></PressButton><PressButton className="settings-button quiet-danger" disabled={disabled} onClick={()=>run(id,()=>manage(id,'uninstall'))} aria-label={`卸载${title}`}><Trash2 size={14}/><span>卸载</span></PressButton></>:<>{item?.bytes>0&&<PressButton className="settings-button" disabled={disabled} onClick={()=>run(id,()=>manage(id,'uninstall'))}><Trash2 size={14}/>清理残留</PressButton>}<PressButton className="settings-button primary-action" disabled={disabled} onClick={()=>id==='backend'?pickBackend():run(id,()=>manage(id,'install'))}><Download size={14}/>{id==='backend'?'选择目录并安装':'安装模块'}</PressButton></>}</div></div>{id==='backend'&&installed&&<div className="module-source"><span>重装来源：{storage.backendSource}</span><PressButton className="runtime-text-button" disabled={disabled} onClick={pickBackend}>更换来源</PressButton></div>}</div>;})}

   </Group>
   {(busy||message||storage?.busy)&&<div className={`runtime-operation ${failed?'error':''}`} role="status" aria-live="polite">{busy||storage?.busy?<LoaderCircle size={16} className="is-spinning"/>:<Info size={16}/>}<div><p>{busy?(progressLabel||'正在处理…'):message||(storage?.busy?'正在准备服务，请稍候…':'')}</p>{progress?.downloaded!=null&&<small>{bytes(progress.downloaded)}{progress.total?` / ${bytes(progress.total)} · ${percent}%`:''}</small>}{percent!=null&&<div className="module-progress" role="progressbar" aria-label="模块下载进度" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${percent}%`}}/></div>}</div></div>}
   <Group title="缓存管理" description="清理已缓存的视频文件、播放片段、封面缓存和安装临时文件，保留收藏、历史、偏好及已安装模块。">
     <Row title={<span className="cache-title"><HardDrive size={16}/>视频文件 <b>{bytes(storage?.videoCacheBytes)}</b></span>} description="观看时保存的视频源；再次播放可复用，清理后需重新获取。"><div className="runtime-actions"><PressButton className="settings-button" disabled={disabled} onClick={()=>open('videocache')}><FolderOpen size={14}/>视频文件夹</PressButton><PressButton className="settings-button" disabled={disabled} onClick={()=>open('cache')}><FolderOpen size={14}/>播放片段</PressButton></div></Row>
     <Row title={<span className="cache-title">缓存合计 <b>{bytes(storage?.cacheBytes)}</b></span>} description={storage?.webCachePending?'封面与界面缓存将在下次重启时清理。':'包含上方视频文件。请先关闭播放器；清理后再次观看会重新准备片源。'}><div className="runtime-actions"><PressButton className="settings-button" disabled={disabled} onClick={()=>open('webcache')}><FolderOpen size={14}/>封面缓存</PressButton><PressButton className="settings-button" disabled={disabled} onClick={()=>run('cache',()=>manage('cache','clear'))}><Trash2 size={14}/>一键清理</PressButton></div></Row>
     {storage?.webCachePending&&<div className="storage-location-footer"><span>界面正在使用的文件需要关闭应用后清理。</span><PressButton className="settings-button" disabled={disabled} onClick={()=>run('restart',relaunch)}>重启完成清理</PressButton></div>}
   </Group>
   <Group title="硬件与兼容性"><Row title={caps?'检测到的显卡':'硬件检测'} description={caps?(Array.isArray(caps.gpus)?caps.gpus:[caps.gpus]).map(g=>g?.Name).filter(Boolean).join(' / '):'检测显卡与可用播放核心。'}><PressButton className="settings-button" disabled={disabled} onClick={()=>run('gpu',async()=>{setCaps(await native('capabilities'));return {message:'硬件信息已刷新。'};})}><RefreshCw size={14}/>重新检测</PressButton></Row><div className="settings-footnote"><Cpu size={15}/><span>增强默认关闭；已检测到硬件不代表能实时满帧，完整视频性能仍需实测。</span></div></Group>
 </div>;
}
