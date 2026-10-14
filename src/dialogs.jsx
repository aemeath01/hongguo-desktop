import React, { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Play, X } from 'lucide-react';
import { desktop } from './desktop-api.js';
import { SelectMenu } from './ui-controls.jsx';
import { PosterImage, SaveIcon, posterStyle } from './posters.jsx';
import { FADE, PressButton, useDialogFocus, useTransition } from './motion-system.jsx';

const TYPES = {short_play:'短剧',comic_series:'漫剧',ai_series:'AI 剧'};
export function Detail({ drama, source, saved, onSave, onClose, onPlay, previous, summary }) {
  const dialog = useRef(null);
  const present = useDialogFocus(dialog);
  const reduced = useReducedMotion();
  const transition = useTransition();
  const [group,setGroup] = useState(Math.floor(((previous?.episode||1)-1)/24));
  return <motion.div className="dialog-shade" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={FADE} onClick={onClose} inert={!present}>
    <motion.section className="detail-modal" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={e=>e.stopPropagation()} initial={{opacity:0,y:reduced?0:22,scale:reduced?1:.975}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:22,scale:reduced?1:.975}} transition={transition} layoutRoot>
      <PressButton className="round-button close-detail" tip="关闭详情 · Esc" aria-label="关闭剧集详情" onClick={onClose}><X size={21}/></PressButton>
      <div className="detail-cinema">
        <div className="detail-ambience" style={{backgroundImage:`url("${drama.cover}")`}}/>
        <motion.div className="detail-poster poster-surface" layoutId={reduced?undefined:source} style={posterStyle(drama)} transition={transition}><PosterImage drama={drama} alt={drama.title}/></motion.div>
        <div className="detail-headline"><span>{TYPES[drama.genre]}</span><h2 id="detail-title">{drama.title}</h2><div className="story-meta"><b>{Number(drama.score).toFixed(1)} 分</b><span>全 {drama.episode_cnt} 集</span><span>{drama.category.split(' / ')[1]}</span></div><p className="detail-synopsis">{summary}</p><div className="cinema-actions"><PressButton className="watch-button" onClick={()=>onPlay(drama,previous?.episode||1)}><Play size={18} fill="currentColor"/>{previous?`打开第 ${previous.episode} 集`:'立即播放'}</PressButton><PressButton className={`round-button ${saved?'is-saved':''}`} tip={saved?'取消收藏':'加入收藏'} aria-label={saved?'取消收藏':'加入收藏'} aria-pressed={saved} onClick={()=>onSave(drama.series_id)}><SaveIcon saved={saved}/></PressButton></div>{!desktop&&<p className="detail-preview-note">打开桌面客户端即可播放</p>}</div>
      </div>
      <div className="detail-content"><div className="detail-category-list">{drama.category.split(' / ').slice(0,5).map(c=><span key={c}>{c}</span>)}</div><div className="detail-episodes-heading"><h3>剧集</h3><div className="episode-group-picker"><span>选择集数</span><SelectMenu label="剧集分组" value={group} onChange={setGroup} options={Array.from({length:Math.ceil(drama.episode_cnt/24)},(_,i)=>({value:i,label:`${i*24+1}–${Math.min(drama.episode_cnt,(i+1)*24)} 集`}))}/></div></div><motion.div className="modal-episodes" key={group} initial={{opacity:0,y:reduced?0:7}} animate={{opacity:1,y:0}} transition={transition}>{Array.from({length:Math.min(24,drama.episode_cnt-group*24)},(_,i)=>group*24+i+1).map(ep=><PressButton aria-label={`播放第 ${ep} 集`} key={ep} onClick={()=>onPlay(drama,ep)}><Play size={12}/><span>{String(ep).padStart(2,'0')}</span></PressButton>)}</motion.div></div>
    </motion.section>
  </motion.div>;
}

