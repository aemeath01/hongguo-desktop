import {useLayoutEffect,useRef} from 'react';
import {desktop,native} from './desktop-api.js';
import {createVideoSurfaceSync} from './player-window.js';

export function useVideoSurface(surface,visible,layoutKey,onError){
  const live=useRef({visible,onError}),refresh=useRef(null);
  live.current={visible,onError};
  useLayoutEffect(()=>{
    if(!desktop)return;
    let frame;
    const sync=createVideoSurfaceSync(rect=>native('video_rect',rect),e=>live.current.onError?.(e.message));
    const update=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const r=surface.current?.getBoundingClientRect();
        if(r)sync.update({x:r.x,y:r.y,width:r.width,height:r.height,visible:live.current.visible});
      });
    };
    refresh.current=update;
    const observer=new ResizeObserver(update);
    if(surface.current)observer.observe(surface.current);
    window.addEventListener('resize',update);update();
    return()=>{refresh.current=null;observer.disconnect();window.removeEventListener('resize',update);cancelAnimationFrame(frame);sync.dispose();};
  },[surface]);
  useLayoutEffect(()=>{refresh.current?.();},[visible,layoutKey]);
}
