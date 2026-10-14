import React,{useEffect,useState} from 'react';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {Minus,Square,Copy,X} from 'lucide-react';
import {desktop} from './desktop-api.js';
import {PressButton as SidebarTipButton} from './motion-system.jsx';
import './window-controls.css';

export function WindowControls({onError,compact=false,tipPlacement='bottom'}) {
  const [maximized,setMaximized]=useState(false);
  useEffect(()=>{
    if(!desktop)return;
    const win=getCurrentWindow();let gone=false,dispose;
    const sync=()=>win.isMaximized().then(v=>{if(!gone)setMaximized(v);}).catch(()=>{});
    sync();win.onResized(sync).then(f=>gone?f():dispose=f);
    return()=>{gone=true;dispose?.();};
  },[]);
  if(!desktop)return null;
  async function run(action){try{await getCurrentWindow()[action]();}catch{onError?.('窗口操作未完成，请重试。');}}
  return <div className={`window-controls ${compact?'compact':''}`} role="group" aria-label="窗口控制">
    <SidebarTipButton aria-label="最小化窗口" tip="最小化" tipPlacement={tipPlacement} onClick={()=>run('minimize')}><Minus size={16}/></SidebarTipButton>
    {!compact&&<SidebarTipButton aria-label={maximized?'还原窗口':'最大化窗口'} tip={maximized?'还原':'最大化'} tipPlacement={tipPlacement} onClick={()=>run('toggleMaximize')}>{maximized?<Copy size={13}/>:<Square size={13}/>}</SidebarTipButton>}
    <SidebarTipButton className="window-close" aria-label="关闭窗口" tip="关闭" tipPlacement={tipPlacement} onClick={()=>run('close')}><X size={18}/></SidebarTipButton>
  </div>;
}
