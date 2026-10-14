import React, { forwardRef, useEffect, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Home, Trophy, Compass, Heart, History, Search, Monitor, Sun, Moon, SlidersHorizontal, Play, ChevronRight, X, Clock3, PanelLeftClose, PanelLeftOpen, Settings, Info } from 'lucide-react';
import { Card, PosterImage, SaveIcon, posterStyle } from './posters.jsx';
import { PressButton, useTransition } from './motion-system.jsx';
import { SelectMenu } from './ui-controls.jsx';
import {desktop,api,resultItems} from './desktop-api.js';
import {WindowControls} from './window-controls.jsx';
import { SidebarTipButton } from './sidebar-tooltip.jsx';

export const TYPES = [{id:'short_play',label:'短剧'},{id:'ai_series',label:'AI 剧'},{id:'comic_series',label:'漫剧'}];
const SECTIONS = [{id:'featured',label:'首页',Icon:Home},{id:'ranking',label:'排行榜',Icon:Trophy},{id:'explore',label:'探索',Icon:Compass},{id:'saved',label:'收藏',Icon:Heart},{id:'history',label:'历史',Icon:History}];
const UTILITIES = [{id:'settings',label:'设置',Icon:Settings},{id:'about',label:'关于与反馈',Icon:Info}];
const THEMES = [{id:'system',label:'跟随系统',Icon:Monitor},{id:'light',label:'浅色',Icon:Sun},{id:'dark',label:'深色',Icon:Moon}];
export function MovingSelection({id,className='selection-fill'}) {return <motion.span className={className} layoutId={id} transition={useTransition()}/>;}

export function DesktopSidebar({nav,onNavigate,theme,onTheme,favoriteCount,historyCount,collapsed}) {
  return <aside className="desktop-sidebar" id="desktop-sidebar"><SidebarTipButton className="desktop-brand" aria-label="红果首页" tip="红果首页" tipEnabled={collapsed} onClick={()=>onNavigate('featured')}><img src="/icon.svg" alt=""/><div><strong>红果<span>免费短剧</span></strong><small>每个故事，都值得入戏</small></div></SidebarTipButton>
    <nav className="desktop-nav" aria-label="主导航">{SECTIONS.map(({id,label,Icon},i)=><React.Fragment key={id}>{i===3&&<div className="nav-divider"><span>我的剧场</span></div>}<SidebarTipButton className={`sidebar-link ${nav===id?'selected':''}`} aria-label={label} tip={label} tipEnabled={collapsed} aria-current={nav===id?'page':undefined} onClick={()=>onNavigate(id)}>{nav===id&&<MovingSelection id="sidebar-selection"/>}<Icon size={20} strokeWidth={nav===id?2:1.7}/><span>{label}</span>{id==='saved'&&favoriteCount>0&&<small>{favoriteCount}</small>}{id==='history'&&historyCount>0&&<small>{historyCount}</small>}</SidebarTipButton></React.Fragment>)}</nav>
    <div className="sidebar-bottom"><nav className="sidebar-utility" aria-label="应用选项">{UTILITIES.map(({id,label,Icon})=><SidebarTipButton key={id} className={`sidebar-link ${nav===id?'selected':''}`} aria-label={label} tip={label} tipEnabled={collapsed} aria-current={nav===id?'page':undefined} onClick={()=>onNavigate(id)}>{nav===id&&<MovingSelection id="sidebar-selection"/>}<Icon size={19}/><span>{label}</span></SidebarTipButton>)}</nav><div className="sidebar-appearance"><span>外观</span><div className="appearance-switch" role="group" aria-label="外观主题">{THEMES.map(({id,label,Icon})=><SidebarTipButton key={id} aria-label={label} tip={label} aria-pressed={theme===id} className={theme===id?'selected':''} data-theme-choice={id} onClick={e=>onTheme(id,e)}>{theme===id&&<MovingSelection id="theme-choice"/>}<Icon size={15}/></SidebarTipButton>)}</div></div><p className="desktop-preview-label"><span/>红果免费短剧</p></div>
  </aside>;
}
export function DesktopToolbar({nav,onSearch,sidebarCollapsed,onToggleSidebar}) {
  const ToggleIcon=sidebarCollapsed?PanelLeftOpen:PanelLeftClose;
  const toggleLabel=sidebarCollapsed?'展开侧边栏':'收起侧边栏';
  return <header className="desktop-toolbar" data-tauri-drag-region><div className="toolbar-drag-fill" data-tauri-drag-region aria-hidden="true"/><div className="workspace-navigation"><PressButton className="sidebar-toggle" aria-label={toggleLabel} tip={toggleLabel} tipPlacement="bottom" aria-expanded={!sidebarCollapsed} aria-controls="desktop-sidebar" onClick={onToggleSidebar}><ToggleIcon size={19}/></PressButton><span className="workspace-title" data-tauri-drag-region>{[...SECTIONS,...UTILITIES].find(x=>x.id===nav)?.label}</span></div><PressButton className="desktop-search" aria-label="搜索剧集" onClick={onSearch}><Search size={17}/><span>搜索剧名、题材</span><kbd>Ctrl K</kbd></PressButton><WindowControls/></header>;
}
export function PageHeading({title,subtitle,children}) {return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>;}
export function TypeTabs({value,onChange,scope,all=false}) {
  const tabs=[...(all?[{id:'all',label:'全部'}]:[]),...TYPES];
  function navigate(e) {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const current=tabs.findIndex(t=>t.id===value);
    const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(current+(e.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length;
    onChange(tabs[next].id);document.getElementById(`${scope}-${tabs[next].id}`)?.focus();
  }
  return <div className="content-type-tabs" role="tablist" aria-label={scope==='explore'?'探索内容分类':'排行榜内容分类'} onKeyDown={navigate}>{tabs.map(({id,label})=><PressButton key={id} role="tab" tabIndex={value===id?0:-1} aria-selected={value===id} aria-controls={`${scope}-panel`} id={`${scope}-${id}`} className={value===id?'selected':''} onClick={()=>onChange(id)}><span>{label}</span>{value===id&&<MovingSelection id={`${scope}-type`} className="tab-underline"/>}</PressButton>)}</div>;
}
function PosterGrid({items,favorites,onOpen,onSave}) {
  const reduced=useReducedMotion();
  return <motion.div className="browse-grid" layout={reduced?false:'position'}><AnimatePresence initial={false} mode="popLayout">{items.map((d,i)=><Card key={d.series_id} drama={d} index={i} onOpen={onOpen} onSave={onSave} saved={favorites.includes(d.series_id)}/>)}</AnimatePresence></motion.div>;
}
function EmptyLibrary({kind,onExplore}) {
  const Icon=kind==='history'?History:Heart;
  return <motion.div className="empty-library" initial={{opacity:0}} animate={{opacity:1}}><Icon size={38}/><h2>{kind==='history'?'你的故事，从这里开始':'把想看的故事收藏起来'}</h2><p>{kind==='history'?'打开过的剧集会出现在这里，方便下次回来。':'点击海报上的加号，下次就能在这里找到它。'}</p><PressButton className="primary-button" onClick={onExplore}>去探索剧集<ChevronRight size={15}/></PressButton></motion.div>;
}
export function ExplorePage({catalog,type,onType,category,onCategory,order,onOrder,...cards}) {
  const items=catalog.filter(d=>d.genre===type);
  const categories=['全部题材',...new Set(items.flatMap(d=>d.category.split(' / ').slice(0,2)))];
  const filtered=items.filter(d=>category==='全部题材'||d.category.split(' / ').includes(category)).sort((a,b)=>order==='score'?Number(b.score)-Number(a.score):b.play_cnt-a.play_cnt);
  return <section className="desktop-page explore-page"><PageHeading title="探索" subtitle="短剧、AI 剧、漫剧，找到下一部想看的故事。"/><TypeTabs value={type} onChange={onType} scope="explore"/><div id="explore-panel" role="tabpanel" aria-labelledby={`explore-${type}`}><div className="explore-filter-row"><div className="browse-filters" aria-label="题材筛选">{categories.map(c=><PressButton key={c} aria-pressed={category===c} className={category===c?'selected':''} onClick={()=>onCategory(c)}>{category===c&&<MovingSelection id="explore-filter"/>}<span>{c}</span></PressButton>)}</div><SelectMenu className="sort-menu" label="排序方式" value={order} onChange={onOrder} Icon={SlidersHorizontal} options={[{value:"popular",label:"播放最多"},{value:"score",label:"评分最高"}]}/></div><p className="results-note">{filtered.length} 部剧集</p><PosterGrid items={filtered} {...cards}/>{!filtered.length&&<p className="no-results">当前题材暂无内容，换个分类看看。</p>}</div></section>;
}
function countLabel(count) {const n=Number(count)||0;return n>=100000000?`${(n/100000000).toFixed(1)} 亿`:n>=10000?`${Math.round(n/10000)} 万`:n.toLocaleString('zh-CN');}
function RankedTitle({drama,rank,metric,onOpen,onSave,saved,podium=false}) {
  const source=`rank-poster-${useId()}`,reduced=useReducedMotion(),transition=useTransition();
  return <motion.article className={`${podium?'rank-podium-card':'rank-list-card'} rank-${rank}`} layout={reduced?false:'position'} transition={transition}>
    <span className="rank-number" aria-label={`第 ${rank} 名`}>{String(rank).padStart(2,'0')}</span>
    <motion.div className="rank-poster poster-surface" style={posterStyle(drama)} layoutId={reduced?undefined:source} transition={transition}><button aria-label={`查看 ${drama.title}`} onClick={()=>onOpen(drama,source)}><PosterImage drama={drama} alt={drama.title}/></button></motion.div>
    <div className="rank-information"><button className="rank-title" onClick={()=>onOpen(drama,source)}>{drama.title}</button><p>{drama.category.split(' / ')[1]}<span>全 {drama.episode_cnt} 集</span></p><div className="rank-metric"><strong>{metric==='score'?Number(drama.score).toFixed(1):countLabel(drama.play_cnt)}</strong><small>{metric==='score'?'分':'次播放'}</small></div></div>
    <PressButton className={`rank-save ${saved?'is-saved':''}`} tip={saved?'取消收藏':'加入收藏'} aria-label={`${saved?'取消收藏':'收藏'} ${drama.title}`} aria-pressed={saved} onClick={()=>onSave(drama.series_id)}><SaveIcon saved={saved}/></PressButton>
  </motion.article>;
}
export function RankingPage({catalog,favorites,...actions}) {
  const [type,setType]=useState('all'),[metric,setMetric]=useState('popular'),[online,setOnline]=useState([]),[rankStatus,setRankStatus]=useState('');
  useEffect(()=>{if(!desktop||type!=='comic_series'||metric!=='popular')return;let gone=false;setRankStatus('正在加载漫剧热播榜…');api('/rank',{board:'hot',limit:30}).then(data=>{if(!gone){setOnline(resultItems({...data,genre:'comic_series'}));setRankStatus('漫剧热播榜 · 在线数据');}}).catch(()=>{if(!gone)setRankStatus('在线榜单暂不可用，下方按当前剧库排序');});return()=>{gone=true;};},[type,metric]);
  const sorted=useMemo(()=>catalog.filter(d=>type==='all'||d.genre===type).sort((a,b)=>metric==='score'?Number(b.score)-Number(a.score)||b.play_cnt-a.play_cnt:b.play_cnt-a.play_cnt).slice(0,10),[catalog,type,metric]);
  const items=type==='comic_series'&&metric==='popular'&&online.length?online:sorted;
  return <section className="desktop-page ranking-page"><PageHeading title="排行榜" subtitle="看看大家正在追什么。"><div className="ranking-switch" role="group" aria-label="榜单排序">{[{id:'popular',label:'人气榜'},{id:'score',label:'高分榜'}].map(m=><PressButton key={m.id} aria-pressed={metric===m.id} className={metric===m.id?'selected':''} onClick={()=>setMetric(m.id)}>{metric===m.id&&<MovingSelection id="ranking-metric"/>}<span>{m.label}</span></PressButton>)}</div></PageHeading><TypeTabs value={type} onChange={setType} scope="ranking" all/><div id="ranking-panel" role="tabpanel" aria-labelledby={`ranking-${type}`}><div className="ranking-context"><span>{metric==='score'?'评分最高的故事':'此刻人气之选'}</span><small>按当前剧库{metric==='score'?'评分':'累计播放量'}排序</small></div><div className="rank-podium">{items.slice(0,3).map((d,i)=><RankedTitle key={d.series_id} drama={d} rank={i+1} metric={metric} saved={favorites.includes(d.series_id)} {...actions} podium/>)}</div><div className="rank-list">{items.slice(3).map((d,i)=><RankedTitle key={d.series_id} drama={d} rank={i+4} metric={metric} saved={favorites.includes(d.series_id)} {...actions}/>)}</div><p className="ranking-footnote">{type==='comic_series'&&metric==='popular'&&desktop?rankStatus:`按当前剧库 ${catalog.length} 部作品排序，不代表全平台排名。`}</p></div></section>;
}
export function CollectionPage({catalog,favorites,onExplore,...cards}) {
  const items=[...favorites].reverse().map(id=>catalog.find(d=>d.series_id===id)).filter(Boolean);
  return <section className="desktop-page collection-page"><PageHeading title="收藏" subtitle="想看的故事，留在自己的剧场。"><span className="library-count">{items.length} 部剧集</span></PageHeading>{items.length?<PosterGrid items={items} favorites={favorites} {...cards}/>:<EmptyLibrary kind="saved" onExplore={onExplore}/>}</section>;
}
function dateGroup(timestamp) {
  const now=new Date(),date=new Date(timestamp);const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());const day=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const age=Math.round((today-day)/86400000);return age===0?'今天':age===1?'昨天':`${date.getFullYear()} 年 ${date.getMonth()+1} 月 ${date.getDate()} 日`;
}
const HistoryTitle=forwardRef(function HistoryTitle({drama,entry,onOpen,onPlay,onRemove,onSave,saved},ref) {
  const source=`history-poster-${useId()}`,reduced=useReducedMotion(),transition=useTransition();
  return <motion.article ref={ref} className="history-card" layout={reduced?false:'position'} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,x:reduced?0:15}} transition={transition}>
    <motion.div className="history-poster poster-surface" style={posterStyle(drama)} layoutId={reduced?undefined:source}><button aria-label={`查看 ${drama.title}`} onClick={()=>onOpen(drama,source)}><PosterImage drama={drama} alt={drama.title}/></button></motion.div>
    <div className="history-information"><button onClick={()=>onOpen(drama,source)}>{drama.title}</button><p>{drama.category.split(' / ')[1]} · 全 {drama.episode_cnt} 集</p><span><Clock3 size={12}/>上次打开第 {entry.episode} 集<small>{new Date(entry.opened).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small></span></div>
    <div className="history-actions"><PressButton className="history-resume" onClick={()=>onPlay(drama,entry.episode)}><Play size={14} fill="currentColor"/>打开第 {entry.episode} 集</PressButton><PressButton className="history-save" tip={saved?'取消收藏':'加入收藏'} aria-label={`${saved?'取消收藏':'收藏'} ${drama.title}`} aria-pressed={saved} onClick={()=>onSave(drama.series_id)}><SaveIcon saved={saved}/></PressButton><PressButton className="history-remove" tip="移除这条历史" aria-label={`移除历史 ${drama.title}`} onClick={()=>onRemove(drama.series_id)}><X size={17}/></PressButton></div>
  </motion.article>;
});
export function HistoryPage({catalog,history,favorites,onExplore,...actions}) {
  const groups=new Map();
  [...history].sort((a,b)=>b.opened-a.opened).forEach(entry=>{const drama=catalog.find(d=>d.series_id===entry.id);if(!drama)return;const label=dateGroup(entry.opened);if(!groups.has(label))groups.set(label,[]);groups.get(label).push({drama,entry});});
  return <section className="desktop-page history-page"><PageHeading title="历史" subtitle="从上次打开的那一集，接着进入故事。"/><p className="history-preview-note">预览阶段记录打开过的集数；接入视频后会保存观看进度。</p>{groups.size?<div className="history-groups">{Array.from(groups,([label,items])=><section key={label} className="history-group" aria-label={label}><h2>{label}<small>{items.length} 部</small></h2><AnimatePresence initial={false} mode="popLayout">{items.map(({drama,entry})=><HistoryTitle key={entry.id} drama={drama} entry={entry} saved={favorites.includes(entry.id)} {...actions}/>)}</AnimatePresence></section>)}</div>:<EmptyLibrary kind="history" onExplore={onExplore}/>}</section>;
}
