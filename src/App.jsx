import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { Play, Pause, Check, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { PosterImage, Rail, posterStyle } from './posters.jsx';
import { Detail } from './dialogs.jsx';
import { SearchOverlay } from './search-overlay.jsx';
import { Theater } from './player.jsx';
import { desktop, native, api, resultItems } from './desktop-api.js';
import { StartupUpdates } from './update-service.jsx';
import { PressButton, SPRING, useTransition, usePageScrollLock } from './motion-system.jsx';
import { CollectionPage, DesktopSidebar, DesktopToolbar, ExplorePage, HistoryPage, MovingSelection, RankingPage } from './desktop-pages.jsx';
import { AboutPage, SettingsPage } from './settings-pages.jsx';
import { usePreferences } from './preferences.js';
import { GENRES, GENRE_LABELS, mixGenres, personalPicks, uniqueDramas } from './home-feed.js';
import { useThemeTransition } from './theme-transition.js';
import './streaming.css';
import './motion.css';
import './desktop.css';
import './ui-controls.css';
import './home.css';

const FEATURED = ['7686713195246930968','7691228619774905368','7692043430955863102'];
const STORIES = {
  '7686713195246930968':'现代杀手顾娇意外穿越，成了流落乡间的侯府千金。与身份神秘的赘婿萧六郎相遇，一段命运交织的故事就此展开。',
  '7689322645132692542':'生日这晚，顾悦己经历了失恋与负债。一位送来蛋糕的外卖员，让她的人生有了新的交集。',
  '7693823855940357144':'一场相亲中的意外邂逅，让京台女记者温稚遇见了一个身份未知的男人。再次碰面，故事才刚开始。',
};
function read(key,fallback) {try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function useStored(key,initial) {
  const [value,setValue]=useState(()=>read(key,initial));
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}},[key,value]);
  return [value,setValue];
}
function synopsis(drama) {return drama.intro||STORIES[drama.series_id]||'暂无剧情简介';}

const ROTATION_SECONDS=7;
function Hero({featured,index,setIndex,onOpen,onPlay,enabled,autoRotate,onAutoRotate}) {
  const feature=featured[index]||featured[0];
  const reduced=useReducedMotion(),transition=useTransition();
  const [hovered,setHovered]=useState(false),[keyboardFocus,setKeyboardFocus]=useState(false),[visible,setVisible]=useState(!document.hidden),[cycle,setCycle]=useState(0);
  const running=enabled&&autoRotate&&!hovered&&!keyboardFocus&&visible&&featured.length>1;
  useEffect(()=>{const update=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
  useEffect(()=>{if(!running)return;const timer=setTimeout(()=>setIndex(i=>(i+1)%featured.length),ROTATION_SECONDS*1000);return()=>clearTimeout(timer);},[running,index,cycle,featured.length,setIndex]);
  function select(next){setIndex((next+featured.length)%featured.length);setCycle(c=>c+1);}
  return <section className="cinematic-hero" aria-label="精选剧集轮播" aria-roledescription="轮播" onKeyDownCapture={()=>setKeyboardFocus(true)} onPointerDownCapture={()=>setKeyboardFocus(false)} onPointerEnter={e=>{if(e.pointerType==='mouse')setHovered(true);}} onPointerLeave={()=>setHovered(false)} onFocusCapture={e=>{if(e.target.matches(':focus-visible'))setKeyboardFocus(true);}} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setKeyboardFocus(false);}}>
    <AnimatePresence initial={false}><motion.div key={feature.series_id} className="hero-ambience" style={{backgroundImage:`url("${feature.cover}")`}} initial={{opacity:0}} animate={{opacity:.24}} exit={{opacity:0}} transition={{duration:reduced ? .15 : .45}}/></AnimatePresence>
    <div className="hero-story-stage" aria-live={running?'off':'polite'}><AnimatePresence initial={false} mode="popLayout"><motion.div className="hero-story" key={feature.series_id} initial={{opacity:0,y:reduced?0:14}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:-8}} transition={{...transition,opacity:{duration:.2}}}>
      <div className="hero-genre"><span className="brand-seed"/>红果精选<span>{GENRE_LABELS[feature.genre]}</span></div><h1>{feature.title}</h1><div className="hero-metadata"><b>{Number(feature.score)>0?`${Number(feature.score).toFixed(1)} 分`:'精选故事'}</b><span>全 {feature.episode_cnt} 集</span><span>{feature.category.split(' / ')[2]}</span></div><p>{synopsis(feature)}</p><div className="cinema-actions"><PressButton className="watch-button" onClick={()=>onPlay(feature)}><Play size={18} fill="currentColor"/>立即播放</PressButton><PressButton className="more-button" onClick={()=>onOpen(feature,`hero-${feature.series_id}`)}><Info size={19}/>详细信息</PressButton></div>
    </motion.div></AnimatePresence></div>
    <div className="hero-poster-stage"><AnimatePresence initial={false}><motion.div className="hero-poster-holder" key={feature.series_id} initial={{opacity:0,x:reduced?0:25}} animate={{opacity:1,x:0}} exit={{opacity:0,x:reduced?0:-16}} transition={transition}>
      <motion.div className="hero-poster poster-surface" layoutId={reduced?undefined:`hero-${feature.series_id}`} style={posterStyle(feature)} transition={transition}><button aria-label={`查看精选 ${feature.title}`} onClick={()=>onOpen(feature,`hero-${feature.series_id}`)}><PosterImage drama={feature} alt={feature.title}/></button></motion.div>
    </motion.div></AnimatePresence></div>
    <div className="feature-selector" aria-label="切换精选剧集"><div className="feature-selector-heading">本期精选<span>03 STORIES</span></div>{featured.map((d,i)=><PressButton key={d.series_id} aria-label={`精选：${d.title}`} aria-pressed={index===i} className={index===i?'selected':''} onClick={()=>select(i)}><PosterImage drama={d}/><span className="feature-option-copy"><small>{GENRE_LABELS[d.genre]} · 全 {d.episode_cnt} 集</small><strong>{d.title}</strong></span><span className="feature-option-index">{String(i+1).padStart(2,'0')}</span></PressButton>)}</div>
    <div className="carousel-controls"><PressButton tip="上一部精选" aria-label="上一部精选" onClick={()=>select(index-1)}><ChevronLeft size={15}/></PressButton><span className="carousel-count"><b>{String(index+1).padStart(2,'0')}</b> / {String(featured.length).padStart(2,'0')}</span><PressButton tip="下一部精选" aria-label="下一部精选" onClick={()=>select(index+1)}><ChevronRight size={15}/></PressButton><div className="carousel-progress" aria-hidden="true"><motion.div key={`${index}-${cycle}-${running}`} initial={{scaleX:0}} animate={{scaleX:running?1:0}} transition={{duration:running?ROTATION_SECONDS:0,ease:'linear'}}/></div><PressButton aria-label={autoRotate?'暂停自动轮播':'开启自动轮播'} tip={autoRotate?'暂停自动轮播':'开启自动轮播'} aria-pressed={autoRotate} onClick={()=>onAutoRotate(!autoRotate)}>{!autoRotate?<Play size={12} fill="currentColor"/>:<Pause size={13}/>}</PressButton></div>
  </section>;
}

function AppContent() {
  const reduced=useReducedMotion(),transition=useTransition();
  const [catalog,setCatalog]=useState([]),[loadError,setLoadError]=useState(false),[catalogStatus,setCatalogStatus]=useState(''),[refreshCatalog,setRefreshCatalog]=useState(0);
  const [latest,setLatest]=useStored('hongguo.latest',[]),[latestStatus,setLatestStatus]=useState(desktop?'正在获取三类新剧…':'最新上架 · 本机片单');
  const [nav,setNav]=useState('featured'),[exploreType,setExploreType]=useState('short_play'),[category,setCategory]=useState('全部题材'),[order,setOrder]=useState('popular');
  const pageRef=useRef(null);
  usePageScrollLock(pageRef,nav==='featured'?'rails':nav==='settings'?'vertical':nav==='about'?'vertical-about':null);
  const [theme,setTheme]=useStored('hongguo.theme','system'),[favorites,setFavorites]=useStored('hongguo.favorites',[]),[history,setHistory]=useStored('hongguo.history',[]);
  const changeTheme=useThemeTransition(theme,setTheme);
  const [preferences,onPreference,storageError]=usePreferences();
  const [sidebarPreference,setSidebarPreference]=useStored('hongguo.sidebarCollapsed',null);
  const [compactWindow,setCompactWindow]=useState(()=>window.matchMedia('(max-width: 760px)').matches);
  const sidebarCollapsed=typeof sidebarPreference==='boolean'?sidebarPreference:compactWindow;
  useEffect(()=>{const media=window.matchMedia('(max-width: 760px)');const update=()=>setCompactWindow(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const [featureIndex,setFeatureIndex]=useState(0),[detail,setDetail]=useState(null),[detailSource,setDetailSource]=useState(null),[watching,setWatching]=useState(null),[episode,setEpisode]=useState(1);
  const [searchOpen,setSearchOpen]=useState(false),[toast,setToast]=useState('');
  const [nativeSettingsError,setNativeSettingsError]=useState('');
  useEffect(()=>{if(!desktop)return;let gone=false;native('window_preferences',{preferences}).then(()=>{if(!gone)setNativeSettingsError('');}).catch(e=>{if(!gone)setNativeSettingsError(e.message);});return()=>{gone=true;};},[preferences.bossEnabled,preferences.bossShortcut,preferences.closeAction,preferences.pauseOnMinimize]);
  useEffect(()=>{fetch('/catalog.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{const saved=read('hongguo.library',[]);const all=[...data,...read('hongguo.latest',[]),...saved,...history.map(h=>h.drama).filter(Boolean)];setCatalog(prev=>[...new Map([...all,...prev].map(d=>[d.series_id,d])).values()]);}).catch(()=>setLoadError(true));},[]);
  useEffect(()=>{if(!desktop)return;let gone=false;setCatalogStatus('正在同步在线剧库…');Promise.allSettled(['short_play','comic_series','ai_series'].map(genre=>api('/browse',{genre,sort:'hot_score',limit:36}))).then(results=>{if(gone)return;const items=results.filter(r=>r.status==='fulfilled').flatMap(r=>resultItems(r.value));if(items.length)setCatalog(prev=>[...new Map([...prev,...items].map(d=>[d.series_id,d])).values()]);setCatalogStatus(results.every(r=>r.status==='fulfilled')?'在线剧库已同步':items.length?'部分分类暂不可用，已显示可用内容':'在线剧库暂不可用，正在显示本机资料');});return()=>{gone=true;};},[refreshCatalog]);
  useEffect(()=>{let gone=false;
    if(!desktop){fetch('/home-latest.json').then(r=>r.ok?r.json():null).then(data=>{if(!gone&&data?.items?.length){setLatest(data.items);setCatalog(prev=>[...new Map([...prev,...data.items].map(d=>[d.series_id,d])).values()]);setLatestStatus(`上新片单 · ${data.date} 同步`);}}).catch(()=>{});return()=>{gone=true;};}
    setLatestStatus('正在获取三类新剧…');
    Promise.allSettled(GENRES.map(genre=>api('/latest',{genre,only_today:false,limit:18}))).then(results=>{
      if(gone)return;
      const successful=results.map((r,i)=>r.status==='fulfilled'?{genre:GENRES[i],items:resultItems({...r.value,genre:GENRES[i]})}:null).filter(Boolean);
      setLatest(previous=>GENRES.flatMap(genre=>successful.find(x=>x.genre===genre)?.items??previous.filter(d=>d.genre===genre)));
      const items=successful.flatMap(x=>x.items);
      if(items.length)setCatalog(prev=>[...new Map([...prev,...items].map(d=>[d.series_id,d])).values()]);
      setLatestStatus(successful.length===3?'短剧最新上架 · 漫剧与 AI 剧近 7 天上新':successful.length?'部分分类同步中断，保留上次片单':'暂时无法同步，保留上次片单');
    });return()=>{gone=true;};
  },[refreshCatalog]);
  useEffect(()=>{if(!toast)return;const timeout=setTimeout(()=>setToast(''),2100);return()=>clearTimeout(timeout);},[toast]);
  useEffect(()=>{const onKey=e=>{if(e.defaultPrevented)return;if(e.key==='Escape'){if(watching)return;else if(detail)setDetail(null);else setSearchOpen(false);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!watching&&!detail)setSearchOpen(true);}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[watching,detail]);
  function go(page){setNav(page);setDetail(null);setSearchOpen(false);window.scrollTo({top:0});}
  function explore(type='short_play',filter='全部题材'){setExploreType(type);setCategory(filter);go('explore');}
  function changeType(type){setExploreType(type);setCategory('全部题材');}
  function save(id){const added=!favorites.includes(id);setFavorites(prev=>added?[...prev,id]:prev.filter(x=>x!==id));setToast(added?'已加入收藏':'已取消收藏');}
  function remember(drama,ep){if(!preferences.recordHistory)return;setHistory(prev=>[{id:drama.series_id,episode:ep,position:history.find(h=>h.id===drama.series_id&&h.episode===ep)?.position||0,drama,opened:Date.now()},...prev.filter(h=>h.id!==drama.series_id)].slice(0,50));}
  function openDetail(drama,source){setSearchOpen(false);setDetail(drama);setDetailSource(source);}
  function play(drama,ep=1){setCatalog(prev=>prev.some(d=>d.series_id===drama.series_id)?prev:[...prev,drama]);setWatching(drama);setEpisode(ep);remember(drama,ep);}
  function choose(ep){setEpisode(ep);remember(watching,ep);}
  function progress(ep,position){if(!preferences.recordHistory)return;setHistory(prev=>[{id:watching.series_id,episode:ep,position,drama:watching,opened:Date.now()},...prev.filter(h=>h.id!==watching.series_id)].slice(0,50));}
  function removeHistory(id){setHistory(prev=>prev.filter(h=>h.id!==id));setToast('已移除这条历史记录');}
  const featured=uniqueDramas([...FEATURED.map(id=>catalog.find(d=>d.series_id===id)).filter(Boolean),...mixGenres(catalog,3)]).slice(0,3);
  const popular=useMemo(()=>catalog.filter(d=>d.genre==='short_play').sort((a,b)=>b.play_cnt-a.play_cnt),[catalog]);
  const ancient=popular.filter(d=>/古风|古装|玄幻/.test(d.category)),romance=popular.filter(d=>/都市爱情/.test(d.category));
  const recommended=useMemo(()=>mixGenres([...catalog].sort((a,b)=>Number(b.score)-Number(a.score)||b.play_cnt-a.play_cnt)),[catalog]);
  const hot=useMemo(()=>mixGenres([...catalog].sort((a,b)=>b.play_cnt-a.play_cnt)),[catalog]);
  const newShows=useMemo(()=>mixGenres(latest),[latest]);
  const personal=useMemo(()=>preferences.recommendations?personalPicks(catalog,favorites,history):{items:[],reasons:{},hasTaste:false},[catalog,favorites,history,preferences.recommendations]);
  useEffect(()=>{if(catalog.length)try{localStorage.setItem('hongguo.library',JSON.stringify(catalog.filter(d=>favorites.includes(d.series_id)||history.some(h=>h.id===d.series_id))));}catch{}},[catalog,favorites,history]);
  const personalItems=personal.items.length?personal.items:recommended.filter(d=>!favorites.includes(d.series_id)&&!history.some(h=>h.id===d.series_id));
  const cards={favorites,onOpen:openDetail,onSave:save};
  return <div className={`streaming-app desktop-app ${sidebarCollapsed?'sidebar-collapsed':'sidebar-expanded'}`}><div className="desktop-shell" inert={!!(detail||watching||searchOpen)}><DesktopSidebar nav={nav} onNavigate={go} theme={theme} onTheme={changeTheme} favoriteCount={favorites.length} historyCount={history.length} collapsed={sidebarCollapsed}/><DesktopToolbar nav={nav} onSearch={()=>setSearchOpen(true)} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={()=>setSidebarPreference(!sidebarCollapsed)}/>
    <div className="desktop-workspace"><motion.main key={nav} ref={pageRef} initial={{opacity:0,y:reduced?0:8}} animate={{opacity:1,y:0}} transition={{duration:.24,ease:'easeOut'}}>
      {nav==='settings'?<SettingsPage preferences={preferences} onPreference={onPreference} theme={theme} onTheme={changeTheme} storageError={storageError}/>:nav==='about'?<AboutPage preferences={preferences} onPreference={onPreference} theme={theme} storageError={storageError}/>:!catalog.length?<div className="loading-page"><h1>{loadError?'剧库暂时无法加载':desktop?'欢迎来到红果免费短剧':'请打开桌面版连接剧库'}</h1>{desktop&&<><p>首次使用，请在「设置 → 模块与存储」安装 mpv，并导入播放服务。</p><PressButton className="primary-button" onClick={()=>go('settings')}>打开设置</PressButton></>}{loadError&&<PressButton className="primary-button" onClick={()=>window.location.reload()}>重新加载</PressButton>}</div>:
      nav==='featured'?<>
        <Hero featured={featured} index={featureIndex} setIndex={setFeatureIndex} onOpen={openDetail} onPlay={d=>play(d,preferences.resume?(history.find(h=>h.id===d.series_id)?.episode||1):1)} enabled={!detail&&!watching&&!searchOpen} autoRotate={preferences.carousel} onAutoRotate={v=>onPreference('carousel',v)}/>
        <div className="home-collections">
          <Rail title="推荐剧场" subtitle="短剧 · 漫剧 · AI 剧，换一种故事也精彩" items={recommended} showGenre {...cards}/>
          <Rail title="正在热播" subtitle="三类剧场的人气故事，按各自播放热度排列" items={hot} showGenre onAll={()=>go('ranking')} {...cards}/>
          {newShows.length?<Rail title="最新剧场" subtitle={latestStatus} items={newShows} showGenre {...cards}/>:<section className="home-empty-row" aria-label="最新剧场"><h2>最新剧场</h2><p>{latestStatus}</p><PressButton onClick={()=>setRefreshCatalog(v=>v+1)}>刷新上新片单</PressButton></section>}
          {preferences.recommendations&&personalItems.length?<Rail title="猜你喜欢" subtitle={personal.hasTaste?(personal.items.length?'根据本机历史与收藏，为你挑选相似题材':'熟悉的故事都看过了，试试这些新选择'):'先看看这些故事，观看或收藏后会更懂你'} items={personalItems} showGenre reasons={personal.reasons} {...cards}/>:<section className="home-empty-row" aria-label="猜你喜欢"><h2>猜你喜欢</h2><p>{preferences.recommendations?'当前片单都已看过或收藏，刷新剧库后再来发现新故事。':'个性化推荐已关闭，开启后根据这台设备上的历史与收藏挑选。'}</p><PressButton onClick={()=>preferences.recommendations?setRefreshCatalog(v=>v+1):onPreference('recommendations',true)}>{preferences.recommendations?'刷新剧库':'开启本地推荐'}</PressButton></section>}
          <div className="home-section-break"><span>更多好故事</span><p>跟随喜欢的题材，继续探索</p></div>
          <Rail title="人气短剧" subtitle="从这些故事开始" items={popular.slice(0,10)} onAll={()=>go('ranking')} {...cards}/>
          <Rail title="古风与奇遇" items={ancient} onAll={()=>explore('short_play','古风爱情')} {...cards}/>
          <Rail title="都市里的心动时刻" items={romance.slice(0,10)} onAll={()=>explore('short_play','都市爱情')} {...cards}/>
          <Rail title="漫剧剧场" items={catalog.filter(d=>d.genre==='comic_series')} onAll={()=>explore('comic_series')} {...cards}/>
          <Rail title="AI 剧场" items={catalog.filter(d=>d.genre==='ai_series')} onAll={()=>explore('ai_series')} {...cards}/>
        </div></>:
      nav==='explore'?<ExplorePage catalog={catalog} type={exploreType} onType={changeType} category={category} onCategory={setCategory} order={order} onOrder={setOrder} {...cards}/>:
      nav==='ranking'?<RankingPage catalog={catalog} {...cards}/>:
      nav==='saved'?<CollectionPage catalog={catalog} {...cards} onExplore={()=>explore()}/>:
      <HistoryPage catalog={catalog} history={history} {...cards} onPlay={play} onRemove={removeHistory} onExplore={()=>explore()}/>}
    </motion.main><div className="desktop-data-note">{desktop&&<><span role="status">{catalogStatus}</span><PressButton onClick={()=>setRefreshCatalog(v=>v+1)}>刷新剧库</PressButton></>}{desktop?'红果免费短剧 · 桌面版':'浏览器界面预览 · 请使用桌面版播放'}</div></div></div>
    <AnimatePresence initial={false}>{searchOpen&&!watching&&!detail&&<SearchOverlay key="search" catalog={catalog} onClose={()=>setSearchOpen(false)} onOpen={openDetail}/>}</AnimatePresence>
    <AnimatePresence initial={false}>{detail&&!watching&&<Detail key={detail.series_id} drama={detail} source={detailSource} saved={favorites.includes(detail.series_id)} onSave={save} onClose={()=>setDetail(null)} onPlay={play} previous={preferences.resume?history.find(h=>h.id===detail.series_id):undefined} summary={synopsis(detail)}/>}</AnimatePresence>
    {watching&&<Theater catalog={catalog} drama={watching} episode={episode} onChoose={choose} onClose={()=>setWatching(null)} saved={favorites.includes(watching.series_id)} onSave={save} preferences={preferences} onPreference={onPreference} onSeason={play} onProgress={progress} resumePosition={history.find(h=>h.id===watching.series_id&&h.episode===episode)?.position||0}/>}
    <StartupUpdates preferences={preferences} onAvailable={v=>setToast(`发现新版本 ${v}，可在关于中安装`)}/>
    {nativeSettingsError&&!watching&&<div className="feedback-toast" role="alert">{nativeSettingsError}</div>}
    <AnimatePresence>{toast&&<motion.div key={toast} className="feedback-toast" role="status" initial={{opacity:0,y:reduced?0:12,scale:reduced?1:.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:8}} transition={transition}><Check size={18}/>{toast}</motion.div>}</AnimatePresence>
  </div>;
}
export default function App(){return <MotionConfig reducedMotion="user" transition={SPRING}><LayoutGroup><AppContent/></LayoutGroup></MotionConfig>;}
