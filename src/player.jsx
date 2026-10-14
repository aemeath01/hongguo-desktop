import {WindowControls} from './window-controls.jsx';
import React,{useEffect,useRef,useState,useCallback} from 'react';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow,LogicalSize,PhysicalPosition,PhysicalSize} from '@tauri-apps/api/window';
import {ArrowLeft,Play,Pause,SkipBack,SkipForward,Volume2,VolumeX,Maximize,Minimize,PictureInPicture2,ListVideo,ChevronDown,Search,RotateCcw,LoaderCircle,X} from 'lucide-react';
import {PressButton,useDialogFocus} from './motion-system.jsx';
import {PosterImage,SaveIcon} from './posters.jsx';
import {desktop,native,api,normalizeDrama} from './desktop-api.js';
import {createHoldController,formatTime,seekPlan} from './player-controls.js';
import {SPEEDS} from './preferences.js';
import './player.css';
import {SeasonPanel} from './season-panel.jsx';
import {createEnhancementMonitor} from './enhancement-monitor.js';
import {createPlaybackSpeed} from './playback-speed.js';
import {createWindowTransition} from './player-window.js';
import {useVideoSurface} from './use-video-surface.js';
import {useReducedMotion} from 'motion/react';

export function Theater({drama,episode,onChoose,onClose,saved,onSave,preferences,onPreference,onSeason,onProgress,resumePosition=0,catalog=[]}) {
 const dialog=useRef(null),surface=useRef(null),live=useRef({}),savedBounds=useRef(null),startCounter=useRef(0),lastProgress=useRef(0),windowOrigin=useRef(0),fullDuration=useRef(0),opening=useRef(false),enhancePending=useRef(false),seekTarget=useRef(null),preservePause=useRef(false),forceOriginal=useRef(false),enhancementAttempted=useRef(false);
 useDialogFocus(dialog);
 const reducedMotion=useReducedMotion();
 const [dragTime,setDragTime]=useState(null);
 const [drawer,setDrawer]=useState(true),[group,setGroup]=useState(Math.floor((episode-1)/30)),[reverse,setReverse]=useState(false);
 const [playback,setPlayback]=useState({'pause':false,'time-pos':0,duration:0,speed:preferences.speed,volume:60});
 const [status,setStatus]=useState('正在连接播放服务…'),[error,setError]=useState(''),[ready,setReady]=useState(false),[retry,setRetry]=useState(0);
 const [fullscreen,setFullscreen]=useState(false),[pip,setPip]=useState(false),[speedMenu,setSpeedMenu]=useState(false),[held,setHeld]=useState(false),[notice,setNotice]=useState('');
 const [windowChanging,setWindowChanging]=useState(false);
 const [overlayReady,setOverlayReady]=useState(false);
 const modeTransition=useRef(null);
 if(!modeTransition.current)modeTransition.current=createWindowTransition();
 const [meta,setMeta]=useState(drama);
 const speedSession=useRef(null),holdControl=useRef(null);
 if(!speedSession.current)speedSession.current=createPlaybackSpeed(preferences.speed);
 const health=useRef(createEnhancementMonitor()),enhancementActive=useRef(false);
 const [enhancementStatus,setEnhancementStatus]=useState('');
 const total=Number(meta.episode_cnt)||drama.episode_cnt;
 live.current={playback,drama,episode,total,preferences,onChoose,onClose,onProgress,ready,fullscreen,pip,overlayReady};
 const action=useCallback((action,value)=>native('player_action',{action,value}).catch(e=>setNotice(e.message)),[]);
 function selectSpeed(value){holdControl.current?.cancel();const speed=speedSession.current.select(value);setPlayback(v=>({...v,speed}));action('select-speed',speed);setSpeedMenu(false);}
 const changeWindow=operation=>modeTransition.current.run(async()=>{
  setWindowChanging(true);setSpeedMenu(false);
  try{await operation(getCurrentWindow());}catch(e){setNotice(String(e));}
  finally{try{setFullscreen(await getCurrentWindow().isFullscreen());}catch{}setWindowChanging(false);}
 });
 function toggleFullscreen(){
  if(!desktop){setNotice('请在桌面客户端使用全屏');return;}
  // PiP has its own restore target; do not overwrite it with F.
  if(live.current.pip)return;
  return changeWindow(async win=>{await win.setFullscreen(!(await win.isFullscreen()));});
 }
 function togglePip(){
  if(!desktop){setNotice('请在桌面客户端使用画中画');return;}
  return changeWindow(async win=>{
   if(!savedBounds.current){
    savedBounds.current={size:await win.innerSize(),position:await win.outerPosition(),maximized:await win.isMaximized(),fullscreen:await win.isFullscreen()};
    await win.setFullscreen(false);await win.unmaximize();await win.setMinSize(new LogicalSize(340,280));await win.setAlwaysOnTop(true);await win.setSize(new LogicalSize(480,640));setPip(true);
   }else{
    const b=savedBounds.current;await win.setAlwaysOnTop(false);await win.setMinSize(new LogicalSize(800,580));await win.setSize(new PhysicalSize(b.size.width,b.size.height));await win.setPosition(new PhysicalPosition(b.position.x,b.position.y));if(b.maximized)await win.maximize();if(b.fullscreen)await win.setFullscreen(true);savedBounds.current=null;setPip(false);
   }
  });
 }
 const closing=useRef(false);
 const close=useRef(); close.current=async()=>{
  if(closing.current)return;closing.current=true;
  if(ready&&playback['time-pos']>0)onProgress?.(episode,playback['time-pos']+windowOrigin.current);
  await modeTransition.current.settled;
  if(savedBounds.current)await togglePip();
  if(desktop)await getCurrentWindow().setFullscreen(false).catch(()=>{});
  onClose();
 };
 const full=useRef();full.current=toggleFullscreen;
 const overlayActions=useRef();overlayActions.current={selectSpeed,togglePip};
 const seek=useRef();seek.current=(target)=>{const l=live.current;if(!l.ready)return;const plan=seekPlan(target,windowOrigin.current,l.playback.duration||0,fullDuration.current||l.playback.duration||0);if(plan.reload){seekTarget.current=plan.position;preservePause.current=!!l.playback.pause;setRetry(n=>n+1);}else action('position',plan.offset);};
 const recoverOriginal=useRef();recoverOriginal.current=(message='增强运行异常，已回退原始画面')=>{
  if(forceOriginal.current||!enhancementAttempted.current)return false;
  forceOriginal.current=true;enhancementActive.current=false;opening.current=true;
  seekTarget.current=(live.current.playback['time-pos']||0)+windowOrigin.current;preservePause.current=!!live.current.playback.pause;
  setEnhancementStatus(message);setReady(false);setStatus('正在恢复原始画面…');
  const version=startCounter.current;
  // Terminate a stuck model instead of sending another command through its
  // blocked IPC channel. Do not repeat the same failing enhancement on retry.
  native('stop_player').then(()=>{if(version===startCounter.current)setRetry(n=>n+1);}).catch(e=>{setError(e.message);setStatus('');});return true;
 };
 const applyEnhancement=useRef();applyEnhancement.current=()=>{
  if(!enhancePending.current||forceOriginal.current)return;enhancePending.current=false;
  const p=live.current.preferences,version=startCounter.current;
  const profile=p.superResolution==='realesrgan'?'realesrgan':p.superResolution==='auto'?(['comic_series','ai_series'].includes(live.current.drama.genre)?'anime':'balanced'):p.enhancement;
  if(profile!=='original'||p.interpolation!=='off'){
   enhancementAttempted.current=true;
   if(profile==='realesrgan'||p.interpolation!=='off')setEnhancementStatus('正在检测当前画幅的 AI 性能，原片继续播放…');
   native('apply_enhancement',{profile,interpolation:p.interpolation,backend:p.inferenceBackend}).then(r=>{
    if(version!==startCounter.current||forceOriginal.current)return;
    enhancementActive.current=!!r.applied;enhancementAttempted.current=!!r.applied;health.current.reset();
    setEnhancementStatus(r.applied?'':r.message);setNotice(r.message);
   }).catch(e=>{if(version!==startCounter.current||forceOriginal.current)return;setEnhancementStatus(e.message);if(e.message.includes('超时')||e.message.includes('断开'))recoverOriginal.current();else enhancementAttempted.current=false;});
  }
 };
 useEffect(()=>{setGroup(Math.floor((episode-1)/30));},[episode,drama.series_id]);
 useEffect(()=>{seekTarget.current=null;preservePause.current=false;},[drama.series_id]);
 useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(id);},[notice]);
 useEffect(()=>{
  if(!desktop)return;
  const win=getCurrentWindow();let dead=false,unlisten,revision=0;
  const sync=async()=>{if(modeTransition.current.busy)return;const request=++revision,generation=modeTransition.current.generation;try{const next=await win.isFullscreen();if(!dead&&request===revision&&!modeTransition.current.busy&&generation===modeTransition.current.generation)setFullscreen(next);}catch{}};
  sync();win.onResized(sync).then(f=>dead?f():unlisten=f);
  return()=>{dead=true;unlisten?.();};
 },[]);
 useEffect(()=>{if(!desktop)return;let pending=false;const timer=setInterval(()=>{if(pending||opening.current||!live.current.ready)return;pending=true;native('player_action',{action:'ping'}).catch(()=>recoverOriginal.current()).finally(()=>{pending=false;});},6000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(!desktop)return;const timer=setInterval(()=>{if(!enhancementActive.current||opening.current||!live.current.ready)return;if(health.current.sample(performance.now(),live.current.playback))recoverOriginal.current('增强处理跟不上播放，已回退原始画面');},1000);return()=>{clearInterval(timer);startCounter.current++;};},[]);
 useEffect(()=>{let dead=false;setMeta(drama);if(desktop)api('/episodes',{series_id:drama.series_id}).then(data=>{if(!dead&&data.meta)setMeta(normalizeDrama({...drama,...data.meta}));}).catch(()=>{});return()=>{dead=true};},[drama.series_id]);
 useEffect(()=>{
   if(!desktop)return;let gone=false;let unlisten;
   listen('mpv-event',({payload:e})=>{
    if(gone||opening.current)return;
    if(e.event==='property-change'){
      setPlayback(v=>({...v,[e.name]:e.data}));
      if(e.name==='time-pos'&&typeof e.data==='number'&&e.data>0&&Date.now()-lastProgress.current>3000){lastProgress.current=Date.now();live.current.onProgress?.(live.current.episode,e.data+windowOrigin.current);}
    }
    if(e.event==='file-loaded'||e.event==='playback-restart'){setReady(true);setStatus('');setError('');applyEnhancement.current();if(preservePause.current){preservePause.current=false;action('set-pause',1);}}
    if(e.event==='end-file'&&e.reason==='eof'){const l=live.current;if(l.preferences.autoNext&&l.episode<l.total)l.onChoose(l.episode+1);else{setStatus(l.episode>=l.total?'全剧播放完毕':'本集播放完毕');setReady(false);}}
    if(e.event==='end-file'&&e.reason==='error'){if(!recoverOriginal.current()){setError(e.error||'播放失败，请重试');setReady(false);}}
    if(e.event==='disconnected'){if(!recoverOriginal.current()){setReady(false);setError('播放器已断开，请重新加载');}}
    if(e.event==='enhancement-error')recoverOriginal.current();
    if(e.event==='client-message'){
      const command=e.args?.[1];if(command==='seek')seek.current((live.current.playback['time-pos']||0)+windowOrigin.current+Number(e.args?.[2]||0));if(command==='fullscreen')full.current();if(command==='escape'){if(live.current.fullscreen)full.current();else close.current();}
      if(command==='seek-absolute')seek.current(Number(e.args?.[2]||0));
      if(command==='previous'&&live.current.episode>1)live.current.onChoose(live.current.episode-1);
      if(command==='next'&&live.current.episode<live.current.total)live.current.onChoose(live.current.episode+1);
      if(command==='select-speed')overlayActions.current.selectSpeed(Number(e.args?.[2]));
      if(command==='pip')overlayActions.current.togglePip();
      if(command==='performance-fallback')recoverOriginal.current('检测到持续掉帧，已回退原始画面');
    }
   }).then(f=>{if(gone)f();else unlisten=f;});
   const blur=()=>{action('restore-speed');};window.addEventListener('blur',blur);
   return()=>{gone=true;unlisten?.();window.removeEventListener('blur',blur);native('stop_player').catch(()=>{});};
 },[]);
 useEffect(()=>{
  let dead=false;const request=++startCounter.current;opening.current=true;enhancePending.current=true;enhancementActive.current=false;health.current.reset();if(!forceOriginal.current)setEnhancementStatus('');const target=seekTarget.current??(preferences.resume?resumePosition:0);seekTarget.current=null;windowOrigin.current=target;fullDuration.current=0;setDragTime(null);setReady(false);setError('');setStatus('正在准备片源…');setPlayback(v=>({...v,'time-pos':0,duration:0,speed:speedSession.current.value}));
  if(!desktop){setStatus('桌面播放器');setError('浏览器仅供界面预览。打开红果免费短剧桌面客户端即可观看。');return;}
  native('start_episode',{seriesId:drama.series_id,episode,preferences:speedSession.current.forEpisode(preferences),startSeconds:target}).then(response=>{
    if(dead||request!==startCounter.current)return;
    windowOrigin.current=Number(response.status.windowOrigin)||0;fullDuration.current=Number(response.status.duration)||0;opening.current=false;setStatus('正在缓冲…');
    // mpv may have emitted file-loaded before the invoke reply arrived.
    native('player_snapshot').then(v=>{if(!dead&&request===startCounter.current){setPlayback(v);if(v['time-pos']!=null&&v['video-params']){setReady(true);setStatus('');applyEnhancement.current();if(preservePause.current){preservePause.current=false;action('set-pause',1);}}}}).catch(()=>{});
  }).catch(e=>{if(!dead&&request===startCounter.current){opening.current=false;setError(e.message);setStatus('');}});
  return()=>{dead=true;};
 },[drama.series_id,episode,retry]);
 useVideoSurface(surface,ready&&!windowChanging,`${drawer}:${pip}:${fullscreen}:${speedMenu}`,setNotice);
 useEffect(()=>{
   const hold=createHoldController({getSpeed:()=>speedSession.current.value,setSpeed:v=>action('speed',v),seek:v=>seek.current((live.current.playback['time-pos']||0)+windowOrigin.current+v),holdSpeed:preferences.holdSpeed,seekSeconds:preferences.seekSeconds,onHold:setHeld});
   holdControl.current=hold;
   const ignored=t=>t?.closest('input,textarea,[contenteditable="true"],[role="combobox"],[role="listbox"],[role="slider"]');
   const down=e=>{
    if(e.defaultPrevented||ignored(e.target)||e.ctrlKey||e.altKey||e.metaKey)return;
    if(live.current.fullscreen&&live.current.overlayReady&&['Tab','Enter'].includes(e.key)){
     e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)action(e.key==='Tab'?'overlay-focus':'overlay-activate',e.shiftKey?-1:1);return;
    }
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!e.repeat){if(live.current.fullscreen&&live.current.overlayReady)action('overlay-escape');else if(live.current.fullscreen)full.current();else close.current();}return;}
    if(!live.current.ready)return;
    if(hold.down(e.key)){e.preventDefault();return;}
    const key=e.key.toLowerCase();if([' ','arrowup','arrowdown','w','s','f'].includes(key)){e.preventDefault();if(key===' '&&!e.repeat)action('pause');else if(key==='f'&&!e.repeat)full.current();else if(['arrowup','arrowdown','w','s'].includes(key))action('volume',(live.current.playback.volume||0)+(['arrowup','w'].includes(key)?5:-5));}
   };
   const up=e=>{if(hold.up(e.key))e.preventDefault();};const cancel=()=>hold.cancel();
   window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',cancel);
   return()=>{hold.cancel();if(holdControl.current===hold)holdControl.current=null;window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',cancel);};
 },[preferences.holdSpeed,preferences.seekSeconds,episode]);
 const current=(playback['time-pos']||0)+windowOrigin.current,duration=fullDuration.current||playback.duration||0;
 const wantsOverlay=desktop&&fullscreen&&!pip&&ready;
 const nativeOverlay=wantsOverlay&&overlayReady;
 useEffect(()=>{
  let stale=false;
  if(!wantsOverlay)setOverlayReady(false);
  if(!desktop||!ready)return;
  native('player_overlay',{fullscreen:wantsOverlay,episode,total,duration,origin:windowOrigin.current,reduced:!!reducedMotion})
   .then(()=>{if(!stale)setOverlayReady(wantsOverlay);})
   .catch(e=>{if(!stale){setOverlayReady(false);setNotice(e.message);}});
  return()=>{stale=true;};
 },[wantsOverlay,ready,episode,total,duration,reducedMotion]);
 const commitSeek=()=>{if(dragTime!==null){seek.current(dragTime);setDragTime(null);}};
 return <section className={`native-player ${drawer?'show-episodes':''} ${pip?'mini-player':''} ${fullscreen?'is-fullscreen':''} ${nativeOverlay?'has-native-controls':''}`} ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${drama.title}播放器`}>
  <header className="player-heading" data-tauri-drag-region hidden={fullscreen}><PressButton className="player-back" onClick={()=>close.current()} aria-label="返回剧库"><ArrowLeft size={20}/>{!pip&&'返回'}</PressButton><div className="player-title" data-tauri-drag-region><strong data-tauri-drag-region>{drama.title}</strong><span>第 {episode} 集 · 共 {total} 集</span></div>{pip?<PressButton tip="退出画中画" aria-label="退出画中画" disabled={windowChanging} onClick={togglePip}><PictureInPicture2 size={19}/></PressButton>:<PressButton className={drawer?'active':''} aria-label={drawer?'收起集数栏':'展开集数栏'} tip={drawer?'收起集数栏 · 保持窗口播放':'展开集数栏'} aria-expanded={drawer} aria-controls="player-episodes" onClick={()=>setDrawer(v=>!v)}><ListVideo size={19}/>{drawer?'收起选集':'展开选集'}</PressButton>}{!fullscreen&&<WindowControls compact={pip} onError={setNotice} tipPlacement="left"/>}</header>
  <div className="player-layout"><div className="player-main"><div className="native-video-surface" ref={surface}>{!ready&&<div className="player-placeholder">{error?<><Play size={34}/><h2>{desktop?'暂时无法播放':'桌面播放器'}</h2><p role="alert">{error}</p>{desktop&&<PressButton onClick={()=>setRetry(n=>n+1)}><RotateCcw size={15}/>重新加载</PressButton>}</>:<><LoaderCircle size={30} className={status.includes('完毕')?'':'loading-spinner'}/><p role="status">{status}</p></>}</div>}</div>
  <div className="native-player-controls"><div className="playback-feedback" role="status">{held?`长按 ${preferences.holdSpeed} 倍速 · 松开恢复`:notice||enhancementStatus||(playback['paused-for-cache']?'正在缓冲…':status||'')}</div><div className="player-timeline"><time>{formatTime(current)}</time><input aria-label="播放进度" type="range" min="0" max={duration||1} step="0.1" value={Math.min(dragTime??current,duration||1)} disabled={!ready||!duration} onChange={e=>setDragTime(Number(e.target.value))} onPointerUp={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek}/><time>{formatTime(duration)}</time></div>
  <div className="player-control-row"><PressButton aria-label={playback.pause?'播放':'暂停'} tip="空格 · 播放 / 暂停" disabled={!ready} onClick={()=>action('pause')}>{playback.pause?<Play size={22} fill="currentColor"/>:<Pause size={22} fill="currentColor"/>}</PressButton><PressButton aria-label="上一集" tip="上一集" disabled={episode<=1} onClick={()=>onChoose(episode-1)}><SkipBack size={19}/></PressButton><PressButton aria-label="下一集" tip="下一集" disabled={episode>=total} onClick={()=>onChoose(episode+1)}><SkipForward size={19}/></PressButton><div className="volume-control"><PressButton aria-label={playback.volume?'静音':'恢复音量'} onClick={()=>action('volume',playback.volume?0:60)}>{playback.volume?<Volume2 size={19}/>:<VolumeX size={19}/>}</PressButton><input aria-label="音量" type="range" min="0" max="100" value={playback.volume||0} onChange={e=>action('volume',Number(e.target.value))}/></div><span className="controls-spacer"/>{fullscreen&&<span className="fullscreen-episode-label">第 {episode} 集 <span>· Esc 退出全屏</span></span>}<PressButton className="speed-trigger" aria-expanded={speedMenu} onClick={()=>setSpeedMenu(v=>!v)}>{Number(playback.speed||1)}×</PressButton>{!pip&&<><PressButton aria-label="画中画" tip="置顶小窗 · 画中画" disabled={windowChanging} onClick={togglePip}><PictureInPicture2 size={20}/></PressButton><PressButton aria-label={fullscreen?'退出全屏':'全屏播放'} aria-pressed={fullscreen} tip={fullscreen?'Esc / F · 退出全屏':'F / 双击画面 · 全屏播放'} disabled={windowChanging} onClick={toggleFullscreen}>{fullscreen?<Minimize size={20}/>:<Maximize size={20}/>}</PressButton></>}</div>
  {speedMenu&&<div className="inline-speed-options" role="group" aria-label="播放倍速">{SPEEDS.map(s=><PressButton key={s} disabled={!ready} aria-pressed={speedSession.current.value===s} onClick={()=>selectSpeed(s)}>{s}×</PressButton>)}</div>}</div></div>
  <aside id="player-episodes" className="player-episode-panel" hidden={!drawer||pip||fullscreen}><div className="player-series-card"><PosterImage drama={drama}/><div><h2>{drama.title}</h2><p>{drama.category}</p><PressButton aria-pressed={saved} onClick={()=>onSave(drama.series_id)}><SaveIcon saved={saved}/>{saved?'已收藏':'收藏'}</PressButton></div></div><div className="player-auto-next"><span>自动连播</span><PressButton role="switch" aria-label="自动连播" aria-checked={preferences.autoNext} className={`compact-switch ${preferences.autoNext?'on':''}`} onClick={()=>onPreference('autoNext',!preferences.autoNext)}><span/></PressButton></div><SeasonPanel drama={drama} catalog={catalog} total={total} episode={episode} group={group} setGroup={setGroup} reverse={reverse} setReverse={setReverse} onChoose={onChoose} onSeason={onSeason}/><p className="player-key-hint">← → / A D 点按快退快进，长按 {preferences.holdSpeed} 倍速<br/>↑ ↓ / W S 音量 · 空格暂停 · F 全屏</p></aside></div>
 </section>;
}
