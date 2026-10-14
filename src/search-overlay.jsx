import React,{useEffect,useRef,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {ChevronRight,Clock3,LoaderCircle,Search,Trash2,X} from 'lucide-react';
import {desktop,api,resultItems} from './desktop-api.js';
import {PosterImage} from './posters.jsx';
import {FADE,PressButton,useDialogFocus,useTransition} from './motion-system.jsx';
import {fetchSearchPages,mergeSearchItems,preserveSearchGenres} from './online-search.js';
import {readSearchHistory,rememberSearch,writeSearchHistory} from './search-history.js';
import './search.css';

export function SearchOverlay({catalog,onClose,onOpen}){
 const dialog=useRef(null),input=useRef(null),generation=useRef(0),busy=useRef(false);
 const present=useDialogFocus(dialog),reduced=useReducedMotion(),transition=useTransition();
 const [query,setQuery]=useState(''),[genre,setGenre]=useState('all');
 const [composing,setComposing]=useState(false),[history,setHistory]=useState(()=>readSearchHistory(localStorage)),[historyError,setHistoryError]=useState(false);
 const searched=useRef('');
 const remember=term=>{if(!term.trim())return;const result=rememberSearch(localStorage,term);setHistory(result.history);setHistoryError(result.error);};
 const chooseQuery=term=>{remember(term);setQuery(term);input.current?.focus();};
 const clearQuery=()=>{remember(searched.current);searched.current='';setQuery('');input.current?.focus();};
 // Commit the last executed query on dismissal, including Escape/unmount.
 // IME composition never fills history with intermediate prefixes.
 useEffect(()=>()=>{if(searched.current)rememberSearch(localStorage,searched.current);},[]);
 const q=query.trim(),key=`${genre}:${q}`;
 const [state,setState]=useState({key:'',items:[],loading:false,error:'',cursor:null,hasMore:false,pages:0});
 const active=state.key===key?state:{items:[],loading:!!q&&desktop,error:'',cursor:null,hasMore:false,pages:0};
 useEffect(()=>input.current?.focus(),[]);
 async function load(version,initial){
  if(version!==generation.current)return;
  busy.current=true;let progress=initial;
  setState({...progress,key,loading:true,error:''});
  try{
   await fetchSearchPages({query:q,genre,initial,maxPages:1,isCurrent:()=>version===generation.current,request:async params=>{const data=await api('/search/page',params);return {...data,results:resultItems(data)};},onPage:page=>{progress=page;}});
   if(version===generation.current){setState({...progress,key,loading:false,error:progress.warning||''});remember(q);}
  }catch(e){if(version===generation.current)setState({...progress,key,loading:false,error:e.message});}
  finally{if(version===generation.current)busy.current=false;}
 }
 useEffect(()=>{
  const version=++generation.current;busy.current=false;
  const initial={items:[],cursor:null,hasMore:false,pages:0};
  setState({...initial,key,loading:!!q&&desktop,error:''});
  if(!q||composing)return;
  const timer=setTimeout(()=>{searched.current=q;if(desktop)load(version,initial);else remember(q);},400);
  return()=>{generation.current++;clearTimeout(timer);};
 },[q,genre,composing]);
 const local=q?catalog.filter(d=>(genre==='all'||d.genre===genre||(genre==='comic_series'&&d.genre==='ai_series'))&&(d.title+' '+d.category).toLowerCase().includes(q.toLowerCase())):[];
 const remoteIds=new Set(active.items.map(d=>d.series_id));
 const results=preserveSearchGenres(mergeSearchItems(active.items,local.filter(d=>!remoteIds.has(d.series_id))),catalog);
 const more=()=>{if(!busy.current)load(generation.current,/过期|重新搜索/.test(active.error)?{items:active.items,cursor:null,pages:0}:active);};
 return <motion.div className="dialog-shade search-shade" onClick={onClose} inert={!present} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={FADE}>
  <motion.section className="search-dialog" role="dialog" aria-modal="true" aria-label="搜索剧集" ref={dialog} tabIndex={-1} onClick={e=>e.stopPropagation()} initial={{opacity:0,y:reduced?0:-18,scale:reduced?1:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:-18,scale:reduced?1:.97}} transition={transition}>
   <div className="search-input"><Search size={23}/><input ref={input} placeholder="搜索剧名、题材" aria-label="搜索剧名或题材" value={query} maxLength={80} onChange={e=>setQuery(e.target.value)} onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing&&!composing){remember(q);searched.current=q;}}}/>{query&&<PressButton className="clear-search" aria-label="清空搜索" tip="清空搜索" onClick={clearQuery}><X size={15}/></PressButton>}<PressButton tip="关闭搜索 · Esc" aria-label="关闭搜索" onClick={onClose}><X size={20}/></PressButton></div>
   <div className="search-kind-tabs" role="group" aria-label="搜索范围">{[['all','全部'],['short_play','真人短剧'],['comic_series','漫剧 / AI']].map(([id,label])=><PressButton key={id} aria-pressed={genre===id} className={genre===id?'selected':''} onClick={()=>setGenre(id)}>{label}</PressButton>)}<span>{desktop?'在线剧库':'本机预览'}</span></div>
   {!q?<div className="search-empty-content">
    {history.length>0&&<section className="search-history" aria-label="搜索记录"><header><h3><Clock3 size={14}/>最近搜索</h3><PressButton aria-label="清空搜索记录" onClick={()=>{const result=writeSearchHistory(localStorage,[]);setHistory(result.history);setHistoryError(result.error);}}><Trash2 size={13}/>清空</PressButton></header><div className="search-history-list">{history.map(term=><div className="search-history-chip" key={term}><PressButton className="search-history-term" onClick={()=>chooseQuery(term)}>{term}</PressButton><PressButton className="search-history-remove" aria-label={`删除搜索记录：${term}`} onClick={()=>{const result=writeSearchHistory(localStorage,history.filter(t=>t!==term));setHistory(result.history);setHistoryError(result.error);}}><X size={12}/></PressButton></div>)}</div></section>}
    {historyError&&<p className="search-history-error" role="status">本机存储暂时不可用，搜索记录未能保存。</p>}
    <div className="search-suggestions"><p>试试这些题材</p><div>{['都市爱情','古风爱情','女性成长','逆袭','玄幻'].map(word=><PressButton key={word} onClick={()=>chooseQuery(word)}>{word}</PressButton>)}</div><small>搜索记录仅保存在本机 · 输入主剧名，也能找到其他季</small></div>
   </div>:<div className="search-results" aria-busy={active.loading}>
    <div className="search-result-status" role="status">{active.loading&&<LoaderCircle size={14} className="loading-spinner"/>}<span>{active.loading?(active.pages?'正在加载更多在线结果…':'正在搜索在线剧库…'):results.length?`已找到 ${results.length} 部剧集${active.hasMore?(active.error?' · 可重试继续查找':' · 下方可加载更多'):''}`:active.error?'在线搜索未完成':'没有找到相关剧集，换个关键词试试'}</span></div>
    {active.error&&<div className="search-error" role="alert"><span>{active.error}。{active.items.length>0?'已找到的在线剧集仍可打开。':local.length>0?'已保留本机匹配结果。':''}</span><PressButton onClick={more}>重试</PressButton></div>}
    {results.map(d=><motion.button key={d.series_id} className="search-result" onClick={()=>{remember(q);onOpen(d);}} initial={{opacity:0,y:reduced?0:5}} animate={{opacity:1,y:0}} transition={transition}><PosterImage drama={d}/><span><strong>{d.title}</strong><small>{d.source==='online'?'在线 · ':''}全 {d.episode_cnt} 集{d.category?` · ${d.category.split(' / ').slice(0,2).join(' / ')}`:''}</small></span><ChevronRight size={19}/></motion.button>)}
    {active.hasMore&&!active.error&&<PressButton className="search-load-more" disabled={active.loading} onClick={more}>{active.loading?'加载中…':'加载更多在线结果'}</PressButton>}
    {!active.loading&&!active.error&&active.pages>0&&!active.hasMore&&results.length>0&&<p className="search-end">已展示本次查询的全部在线结果</p>}
   </div>}
  </motion.section>
 </motion.div>;
}
