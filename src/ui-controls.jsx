import React, { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';

export function Tooltip({ content, enabled=true, placement='top', rail=false, overflowOnly=false, children }) {
  const id=useId(), reduced=useReducedMotion(), timer=useRef(), bubble=useRef();
  const [point,setPoint]=useState(null), [position,setPosition]=useState(null);
  const visible=enabled&&point;
  const cancel=()=>clearTimeout(timer.current);
  const close=()=>{cancel();setPoint(null);};
  function show(target,delay=280) {
    cancel();
    if(!enabled||target.disabled||(overflowOnly&&target.scrollHeight<=target.clientHeight+1&&target.scrollWidth<=target.clientWidth+1))return;
    timer.current=setTimeout(()=>{
      if(!target.isConnected||target.closest('[inert]'))return;
      const rect=target.getBoundingClientRect();
      const edge=rail?target.closest('.desktop-sidebar')?.getBoundingClientRect().right:rect.right;
      setPosition(null);
      setPoint({left:rect.left,right:edge??rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height});
    },delay);
  }
  const leave=()=>{cancel();timer.current=setTimeout(()=>setPoint(null),100);};
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{close();},[enabled,content]);
  useLayoutEffect(()=>{
    if(!visible||!bubble.current)return;
    const {width,height}=bubble.current.getBoundingClientRect();
    let left=point.left+(point.width-width)/2,top=point.top-height-8;
    if(placement==='right'){left=point.right+8;top=point.top+(point.height-height)/2;}
    else if(placement==='left'){left=point.left-width-8;top=point.top+(point.height-height)/2;}
    else if(placement==='bottom'||top<8)top=point.bottom+8;
    setPosition({left:Math.max(8,Math.min(innerWidth-width-8,left)),top:Math.max(8,Math.min(innerHeight-height-8,top))});
  },[visible,placement]);
  useEffect(()=>{
    if(!visible)return;
    const dismiss=e=>{if(e.key==='Escape'){e.stopPropagation();close();}};
    document.addEventListener('keydown',dismiss);
    window.addEventListener('resize',close);
    window.addEventListener('scroll',close,true);
    return()=>{document.removeEventListener('keydown',dismiss);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};
  },[visible]);
  const compose=(name,fn)=>e=>{children.props[name]?.(e);if(!e.defaultPrevented)fn(e);};
  return <>{cloneElement(children,{
    title:undefined,
    'aria-describedby':visible?id:children.props['aria-describedby'],
    onPointerEnter:compose('onPointerEnter',e=>{if(e.pointerType!=='touch')show(e.currentTarget);}),
    onPointerLeave:compose('onPointerLeave',leave),
    onFocus:compose('onFocus',e=>{if(e.currentTarget.matches(':focus-visible'))show(e.currentTarget,0);}),
    onBlur:compose('onBlur',close),
    onPointerDown:compose('onPointerDown',close),
    onClick:compose('onClick',close),
  })}{createPortal(<AnimatePresence>{visible&&<motion.div key={id} className="ui-tooltip-anchor" style={position||{left:0,top:0,visibility:'hidden'}}
    initial={{opacity:0}} animate={{opacity:position?1:0}} exit={{opacity:0}} transition={{duration:reduced?0:.12}}
    onPointerEnter={cancel} onPointerLeave={leave}>
    <div ref={bubble} id={id} role="tooltip" className="ui-tooltip">{content}</div>
  </motion.div>}</AnimatePresence>,document.fullscreenElement||document.body)}</>;
}

export function SelectMenu({ label, value, options, onChange, Icon, className='' }) {
  const id=useId(), root=useRef(), trigger=useRef(), list=useRef(), reduced=useReducedMotion();
  const [open,setOpen]=useState(false), [active,setActive]=useState(0), [layout,setLayout]=useState({side:'bottom',height:260});
  const selected=Math.max(0,options.findIndex(o=>o.value===value));
  function show(index=selected) {
    const rect=trigger.current.getBoundingClientRect();
    const below=innerHeight-rect.bottom-16,above=rect.top-16;
    const height=Math.min(260,options.length*38+12);
    const side=below<height&&above>below?'top':'bottom';
    setLayout({side,height:Math.max(50,Math.min(height,side==='top'?above:below))});
    setActive(index);setOpen(true);
  }
  function choose(index) {onChange(options[index].value);setOpen(false);trigger.current.focus({preventScroll:true});}
  function keyDown(e) {
    if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);return;}
    if(e.key==='Tab'){setOpen(false);return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
      e.preventDefault();
      const next=e.key==='Home'?0:e.key==='End'?options.length-1:!open?selected:(active+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
      if(open)setActive(next);else show(next);
    }else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(open)choose(active);else show();}
  }
  useEffect(()=>{
    if(!open)return;
    const outside=e=>{if(!root.current.contains(e.target))setOpen(false);};
    const dismiss=()=>setOpen(false);
    document.addEventListener('pointerdown',outside);
    window.addEventListener('resize',dismiss);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);};
  },[open]);
  useLayoutEffect(()=>{
    const option=list.current?.children[active];
    if(!open||!option)return;
    const top=option.offsetTop,bottom=top+option.offsetHeight,menu=list.current;
    if(top<menu.scrollTop)menu.scrollTop=top;
    else if(bottom>menu.scrollTop+menu.clientHeight)menu.scrollTop=bottom-menu.clientHeight;
  },[open,active]);
  return <div ref={root} className={`select-menu ${className}`} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
    <button ref={trigger} type="button" className="select-trigger" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined} aria-activedescendant={open?`${id}-${active}`:undefined}
      onKeyDown={keyDown} onClick={()=>open?setOpen(false):show()}>{Icon&&<Icon size={15}/>}<span>{options[selected]?.label}</span><ChevronDown size={14} className="select-chevron"/></button>
    <AnimatePresence>{open&&<motion.div className="select-popover" data-side={layout.side} initial={{opacity:0,y:reduced?0:layout.side==='top'?4:-4,scale:reduced?1:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0}} transition={{duration:reduced?0:.14}}>
      <ul ref={list} id={id} role="listbox" aria-label={label} style={{maxHeight:layout.height}}>
        {options.map((option,i)=><li id={`${id}-${i}`} key={option.value} role="option" aria-selected={value===option.value} className={active===i?'active':''} onMouseDown={e=>e.preventDefault()} onPointerMove={e=>{if(e.pointerType==='mouse')setActive(i);}} onClick={()=>choose(i)}><span>{option.label}</span>{value===option.value&&<Check size={14}/>}</li>)}
      </ul>
    </motion.div>}</AnimatePresence>
  </div>;
}
