import React,{useEffect,useRef,useState} from 'react';
import {ChevronDown,Search,RotateCcw,LoaderCircle,Play} from 'lucide-react';
import {PressButton} from './motion-system.jsx';
import {PosterImage} from './posters.jsx';
import {desktop,api,resultItems} from './desktop-api.js';
import {seasonQuery,seasonFamily,seasonNumber,seasonCandidates,sortSeasons} from './player-controls.js';
import {fetchSearchPages,preserveSearchGenres} from './online-search.js';

export function SeasonPanel({drama,catalog,total,episode,group,setGroup,reverse,setReverse,onChoose,onSeason}) {
 const family=seasonFamily(drama),request=useRef(0),cache=useRef(new Map()),current=useRef(drama),activeRow=useRef(null),previousSeries=useRef(drama.series_id);
 current.current=drama;
 const [result,setResult]=useState({key:'',items:[],status:'idle',message:''});
 useEffect(()=>()=>{request.current++;},[]);
 useEffect(()=>{request.current++;setResult(cache.current.get(family)||{key:family,items:[],status:'idle',message:''});},[family]);
 const state=result.key===family?result:{items:[],status:'idle',message:''};
 const candidates=seasonCandidates([...state.items,...catalog],drama);
 const seasons=sortSeasons([{...drama,episode_cnt:total},...candidates]);
 useEffect(()=>{
   if(previousSeries.current===drama.series_id)return;
   previousSeries.current=drama.series_id;
   const row=activeRow.current,panel=row?.closest('.player-episode-panel');
   if(!panel)return;
   row.querySelector('.season-header')?.focus({preventScroll:true});
   panel.scrollTo({top:panel.scrollTop+row.getBoundingClientRect().top-panel.getBoundingClientRect().top-12,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 },[drama.series_id]);
 async function find(continueSearch=false){
   const version=++request.current,source=drama;
   let progress=continueSearch&&!/过期|重新搜索/.test(state.message)?state:{items:[source],cursor:null,pages:0,hasMore:true};
   const valid=()=>version===request.current&&family===seasonFamily(current.current);
   const publish=(status,message)=>{if(!valid())return;const next={...progress,key:family,status,message};cache.current.set(family,next);setResult(next);};
   publish('loading','');
   try{
     if(!desktop){progress.hasMore=false;publish('done','浏览器预览仅展示本机片单；请在桌面版查找在线其他季。');return;}
     await fetchSearchPages({request:async query=>{const data=await api('/search/page',query);return {...data,results:preserveSearchGenres(resultItems(data),[...catalog,source])};},query:seasonQuery(source.title),genre:source.genre==='ai_series'?'comic_series':source.genre,initial:progress,maxPages:3,isCurrent:valid,onPage:page=>{progress=page;publish('loading','');}});
     publish(progress.warning?'error':'done',progress.warning|| (progress.hasMore?'已按季数排序，可继续查找更多在线结果。':'在线查询结束，已按季数排序；请核对同名版本。'));
   }catch(e){publish('error',`${e.message}。已找到的剧集仍可播放。`);}
 }
 const list=Array.from({length:Math.max(0,Math.min(30,total-group*30))},(_,i)=>group*30+i+1).sort((a,b)=>reverse?b-a:a-b);
 return <section className="season-library" aria-label="剧集与其他季">
   <div className="season-library-heading"><div><h3>剧集与季</h3><span>{seasons.length>1?`${seasons.length} 部同名作品`:'当前剧集'}</span></div><PressButton className="find-season-button" onClick={()=>find(false)} disabled={state.status==='loading'} aria-label={state.status==='idle'?'查找其他季':'重新查找其他季'}>{state.status==='loading'?<LoaderCircle size={14} className="loading-spinner"/>:state.status!=='idle'?<RotateCcw size={14}/>:<Search size={14}/>}<span>{state.status==='loading'?'查找中':state.status!=='idle'?'重新查找':'查找其他季'}</span></PressButton></div>
   {state.status!=='idle'&&<div className="season-search-summary" role="status"><strong>在线搜索「{seasonQuery(drama.title)}」</strong><p>{state.status==='loading'?`正在搜索${state.pages?` · 已读取 ${state.pages} 页`:''}，找到后即可点击播放。`:state.message}</p>{state.status==='done'&&!candidates.length&&<p>当前结果中暂未找到其他季。</p>}{state.status!=='loading'&&(state.hasMore||state.status==='error')&&<PressButton className="season-load-more" onClick={()=>find(true)}>{state.status==='error'?'重试在线查找':'继续查找更多'}</PressButton>}</div>}
   <div className="season-accordion">{seasons.map(d=>{
     const playing=d.series_id===drama.series_id;
     const panelId=`season-episodes-${d.series_id}`;
     return <section key={d.series_id} ref={playing?activeRow:null} className={`season-item ${playing?'is-playing':''}`}>
       <PressButton className="season-header" aria-expanded={playing} aria-controls={playing?panelId:undefined} aria-label={playing?`正在播放 ${d.title}`:`播放 ${d.title}，从第 1 集开始`} onClick={()=>{if(!playing)onSeason(d,1);}}>
         <PosterImage drama={d}/><span className="season-header-copy"><span className="season-label">第 {seasonNumber(d.title)} 季{playing&&<i>正在播放</i>}</span><strong>{d.title}</strong><small>{playing?`第 ${episode} 集 / 共 ${total} 集`:`全 ${d.episode_cnt} 集${d.creator?` · ${d.creator}`:' · 点击播放'}`}</small></span>{playing?<ChevronDown size={15}/>:<Play size={14}/>}</PressButton>
       {playing&&<div className="season-episode-content" id={panelId}><div className="player-list-heading"><span>选择剧集</span><PressButton onClick={()=>setReverse(v=>!v)}>{reverse?'倒序':'正序'}<ChevronDown size={13}/></PressButton></div>
         <div className="player-groups">{Array.from({length:Math.ceil(total/30)},(_,i)=><PressButton key={i} className={group===i?'selected':''} aria-pressed={group===i} onClick={()=>setGroup(i)}>{i*30+1===total?total:`${i*30+1}–${Math.min(total,(i+1)*30)}`}</PressButton>)}</div>
         <div className="player-episode-grid">{list.map(ep=><PressButton key={ep} aria-label={`播放第 ${ep} 集`} aria-pressed={episode===ep} className={episode===ep?'selected':''} onClick={()=>onChoose(ep)}>{ep===episode&&<span className="episode-playing-dot" aria-hidden="true"/>}<span>{String(ep).padStart(2,'0')}</span></PressButton>)}</div>
       </div>}
     </section>;
   })}</div>
 </section>;
}
