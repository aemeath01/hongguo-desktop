import React, { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { Check, ChevronLeft, ChevronRight, Play, Plus } from 'lucide-react';
import { Tooltip } from './ui-controls.jsx';
import { PressButton, SPRING, useKineticRail, useTransition } from './motion-system.jsx';
import { GENRE_LABELS } from './home-feed.js';

export function PosterImage({ drama, alt='', ...props }) {
  return <img loading="lazy" decoding="async" {...props} src={drama.cover} width={drama.cover_width || 400} height={drama.cover_height || 600} alt={alt} draggable="false" />;
}
export function posterStyle(drama) {
  return {borderRadius:9,aspectRatio:drama.cover_width&&drama.cover_height?`${drama.cover_width} / ${drama.cover_height}`:undefined};
}
export function SaveIcon({ saved }) {
  const reduced = useReducedMotion();
  return <AnimatePresence initial={false} mode="popLayout"><motion.span key={saved ? 'saved' : 'add'} className="save-symbol" initial={{opacity:0, scale:reduced ? 1 : .5, rotate:reduced ? 0 : -45}} animate={{opacity:1,scale:1,rotate:0}} exit={{opacity:0,scale:reduced ? 1 : .5,rotate:reduced ? 0 : 45}} transition={reduced ? {duration:.1} : SPRING}>{saved ? <Check size={18} /> : <Plus size={19} />}</motion.span></AnimatePresence>;
}
export const Card = forwardRef(function Card({ drama, onOpen, saved, onSave, historyEntry, index=0, showGenre=false, reasons={} }, ref) {
  const source = `poster-${useId()}`;
  const reduced = useReducedMotion();
  const transition = useTransition();
  const frame = useRef(null);
  const rx = useMotionValue(0), ry = useMotionValue(0);
  const rotateX = useSpring(rx, {stiffness:220,damping:27});
  const rotateY = useSpring(ry, {stiffness:220,damping:27});
  const [active, setActive] = useState(false);
  function hover(e) {
    if (reduced || e.pointerType !== 'mouse' || e.buttons) return;
    const rect = frame.current.getBoundingClientRect();
    rx.set(-((e.clientY - rect.top)/rect.height - .5)*4);
    ry.set(((e.clientX - rect.left)/rect.width - .5)*4);
  }
  function reset() { setActive(false); rx.set(0); ry.set(0); }
  return <motion.article ref={ref} className="title-card portrait-card" layout={reduced ? false : 'position'} initial={{opacity:0,y:reduced ? 0 : 12}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.1}} exit={{opacity:0,scale:reduced ? 1 : .96}} transition={{...transition, opacity:{duration:.2,delay:Math.min(index,5)*.025}}}>
    <motion.div ref={frame} className="title-artwork" onFocus={()=>setActive(true)} onBlur={reset} onPointerEnter={e => { if(e.pointerType==='mouse') setActive(true); }} onPointerMove={hover} onPointerLeave={reset} onPointerDown={reset} style={{rotateX:reduced ? 0 : rotateX,rotateY:reduced ? 0 : rotateY,transformPerspective:900}} animate={{y:active && !reduced ? -6 : 0,scale:active && !reduced ? 1.025 : 1}} transition={SPRING}>
      <motion.div className="poster-surface" layoutId={reduced ? undefined : source} style={posterStyle(drama)} transition={transition}>
        <button className="open-title" aria-label={`查看 ${drama.title}`} onClick={() => onOpen(drama,source)}><PosterImage drama={drama} alt={drama.title} /><span className="artwork-vignette" /><motion.span className="artwork-play" animate={{opacity:active?1:0,scale:active?1:.78}} transition={transition}><Play size={24} fill="currentColor" /></motion.span><span className="card-episode">{historyEntry ? `上次打开第 ${historyEntry.episode} 集` : `全 ${drama.episode_cnt} 集`}</span></button>
      </motion.div>
      <PressButton className={`card-bookmark ${saved?'is-saved':''}`} tip={saved?'取消收藏':'加入收藏'} aria-label={`${saved?'取消收藏':'加入收藏'} ${drama.title}`} aria-pressed={saved} onClick={() => onSave(drama.series_id)}><SaveIcon saved={saved}/></PressButton>
    </motion.div>
    <Tooltip content={drama.title} overflowOnly><button className="card-name" onClick={() => onOpen(drama,source)}>{drama.title}</button></Tooltip><div className="card-caption"><span>{showGenre&&<b className="card-genre">{GENRE_LABELS[drama.genre]}</b>}{reasons[drama.series_id]||drama.category.split(' / ')[1]||drama.category}</span>{Number(drama.score)>0&&<span>{Number(drama.score).toFixed(1)} 分</span>}</div>
  </motion.article>;
});

export function Rail({ title, subtitle, items, onAll, ...cardProps }) {
  const track = useRef(null);
  const {move,bindings} = useKineticRail(track);
  const [limits,setLimits] = useState({start:true,end:false,overflowing:true});
  useEffect(() => {
    const el = track.current;
    if(!el) return;
    const update = () => setLimits(old => {
      const next = {start:el.scrollLeft<3,end:el.scrollLeft+el.clientWidth>=el.scrollWidth-3,overflowing:el.scrollWidth>el.clientWidth+3};
      return old.start===next.start && old.end===next.end && old.overflowing===next.overflowing ? old : next;
    });
    update(); const observer = new ResizeObserver(update); observer.observe(el); el.addEventListener('scroll',update,{passive:true});
    return () => {observer.disconnect();el.removeEventListener('scroll',update);};
  },[items.length]);
  if(!items.length)return null;
  return <section className="collection-row row-portrait" aria-label={title}><div className="row-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><div className="row-actions">{onAll&&<PressButton className="see-all" onClick={onAll}>查看全部<ChevronRight size={15}/></PressButton>}{limits.overflowing&&<div className="row-arrows"><PressButton tip="向前浏览" aria-label={`${title}，向前浏览`} disabled={limits.start} onClick={()=>move(-1)}><ChevronLeft size={19}/></PressButton><PressButton tip="向后浏览" aria-label={`${title}，向后浏览`} disabled={limits.end} onClick={()=>move(1)}><ChevronRight size={19}/></PressButton></div>}</div></div><div className="title-track" ref={track} tabIndex={0} aria-label={`${title}片单，可左右拖动`} {...bindings}>{items.map((drama,i)=><Card key={drama.series_id} drama={drama} index={i} {...cardProps} saved={cardProps.favorites.includes(drama.series_id)} historyEntry={cardProps.history?.find(h=>h.id===drama.series_id)}/>)}</div></section>;
}
