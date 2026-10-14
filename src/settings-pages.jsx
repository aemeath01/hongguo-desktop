import React, { useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Monitor, Sun, Moon, Palette, Play, Sparkles, Keyboard, ArrowUpRight, RefreshCw, Download, Copy, FileText, MessageSquare, ShieldCheck, Info, ChevronDown, CircleHelp, Cpu, CheckCircle2 } from 'lucide-react';
import { PressButton } from './motion-system.jsx';
import { SelectMenu } from './ui-controls.jsx';
import { MovingSelection, PageHeading } from './desktop-pages.jsx';
import { APP_VERSION, SPEEDS, validShortcut } from './preferences.js';
import { RuntimeSettings, UpdatePanel } from './runtime-settings.jsx';
import { desktop,native } from './desktop-api.js';
import {SettingsRow as Row,SettingsGroup as Group} from './settings-primitives.jsx';
import {HardDrive} from 'lucide-react';
import './settings.css';

export function Switch({label,checked,onChange,describedBy}) {
  return <PressButton className="setting-switch" role="switch" aria-label={label} aria-checked={checked} aria-describedby={describedBy} onClick={()=>onChange(!checked)}><span><Check size={11}/></span></PressButton>;
}
function ToggleRow({title,description,setting,preferences,onPreference}) {
  return <Row title={title} description={description}><Switch label={title} checked={preferences[setting]} onChange={value=>onPreference(setting,value)}/></Row>;
}
function NativeNote({children='偏好保存在本机，在下一次打开播放器时应用。'}) {
  return <div className="settings-notice"><Info size={16}/><p>{children}</p><span>桌面版</span></div>;
}
const SECTIONS=[{id:'general',label:'外观与推荐',Icon:Palette},{id:'playback',label:'播放偏好',Icon:Play},{id:'picture',label:'画质与性能',Icon:Sparkles},{id:'shortcuts',label:'快捷键与窗口',Icon:Keyboard},{id:'storage',label:'模块与存储',Icon:HardDrive}];
const THEMES=[{id:'system',label:'跟随系统',hint:'随系统自动切换',Icon:Monitor},{id:'light',label:'浅色',hint:'清晰、轻盈',Icon:Sun},{id:'dark',label:'深色',hint:'沉浸进入故事',Icon:Moon}];

function ShortcutEditor({value,onSave,storageError}) {
  const [draft,setDraft]=useState(value),[message,setMessage]=useState('');
  const parts=draft.split('+'),key=parts.at(-1);
  function modifier(name) {
    const next=['Ctrl','Alt','Shift'].filter(m=>m===name?!parts.includes(m):parts.includes(m));
    setDraft([...next,key].join('+'));setMessage('');
  }
  function save() {
    if(!validShortcut(draft)){setMessage('请选择至少一个修饰键，并避开 Ctrl K、Alt F4 等常用快捷键。');return;}
    onSave(draft);setMessage('快捷键偏好已更新；桌面版需注册成功后才能全局使用。');
  }
  return <div className="shortcut-editor"><div className="shortcut-picker" role="group" aria-label="老板键组合">{['Ctrl','Alt','Shift'].map(name=><PressButton key={name} role="checkbox" aria-checked={parts.includes(name)} className={parts.includes(name)?'selected':''} onClick={()=>modifier(name)}><span className="mini-check">{parts.includes(name)&&<Check size={11}/>}</span>{name}</PressButton>)}<span>+</span><SelectMenu label="老板键按键" value={key} options={[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',...Array.from({length:12},(_,i)=>`F${i+1}`)].map(value=>({value,label:value}))} onChange={next=>{setDraft([...parts.slice(0,-1),next].join('+'));setMessage('');}}/></div><div className="shortcut-save"><p>已保存 <kbd>{value.replaceAll('+',' + ')}</kbd><small>{desktop?'切换到其他程序时也可使用；冲突会在页面提示':'浏览器预览不注册系统快捷键'}</small></p><PressButton className="settings-button" disabled={draft===value} onClick={save}>保存快捷键</PressButton></div>{message&&<p className={`inline-status ${storageError?'error':''}`} role="status">{storageError?'无法保存到本机，请检查浏览器存储权限。':message}</p>}</div>;
}

export function SettingsPage({preferences,onPreference,theme,onTheme,storageError}) {
  const [section,setSection]=useState('general'),reduced=useReducedMotion();
  const props={preferences,onPreference};
  function navigate(e) {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const i=SECTIONS.findIndex(s=>s.id===section);
    const next=e.key==='Home'?0:e.key==='End'?SECTIONS.length-1:(i+(e.key==='ArrowLeft'?-1:1)+SECTIONS.length)%SECTIONS.length;
    setSection(SECTIONS[next].id);document.getElementById(`settings-${SECTIONS[next].id}`)?.focus();
  }
  return <section className="desktop-page settings-page"><div className="settings-inner"><PageHeading title="设置" subtitle="把剧场，调成你喜欢的样子。"><span className={`preferences-state ${storageError?'error':''}`} role="status">{storageError?<Info size={14}/>:<CheckCircle2 size={14}/>} {storageError?'保存失败，仅本次有效':'偏好保存在本机'}</span></PageHeading>
    <div className="settings-tabs" role="tablist" aria-label="设置分类" onKeyDown={navigate}>{SECTIONS.map(({id,label,Icon})=><PressButton key={id} id={`settings-${id}`} role="tab" aria-selected={section===id} aria-controls="settings-panel" tabIndex={section===id?0:-1} className={section===id?'selected':''} onClick={()=>setSection(id)}>{section===id&&<MovingSelection id="settings-tab"/>}<Icon size={16}/><span>{label}</span></PressButton>)}</div>
    <motion.div key={section} id="settings-panel" role="tabpanel" aria-labelledby={`settings-${section}`} initial={{opacity:0,y:reduced?0:5}} animate={{opacity:1,y:0}} transition={{duration:.18}}>
      {section==='general'&&<><Group title="外观" description="侧边栏与所有页面都会同步切换。"><div className="theme-cards" role="group" aria-label="选择外观">{THEMES.map(({id,label,hint,Icon})=><PressButton key={id} aria-label={`${label}主题`} aria-pressed={theme===id} className={`theme-card theme-${id} ${theme===id?'selected':''}`} data-theme-choice={id} onClick={e=>onTheme(id,e)}><div className="theme-sample" aria-hidden="true"><i/><div><b/><span/><span/><span/></div></div><div className="theme-card-label"><Icon size={16}/><strong>{label}</strong><span className="theme-radio">{theme===id&&<Check size={11}/>}</span></div><small>{hint}</small></PressButton>)}</div></Group>
      <Group title="首页与发现"><ToggleRow title="首页自动轮播" description="精选故事每 7 秒切换；鼠标停留、操作控件时暂停。" setting="carousel" {...props}/><ToggleRow title="根据历史与收藏推荐" description="在首页「猜你喜欢」中按本机记录匹配题材，避开已经看过或收藏的作品。" setting="recommendations" {...props}/></Group>
      <Group title="观看记录"><ToggleRow title="保存观看历史" description="关闭后不新增记录，已有历史仍保留。记录实际播放位置。" setting="recordHistory" {...props}/><div className="settings-footnote"><ShieldCheck size={15}/><span>收藏、历史和偏好存储在当前设备，不上传推荐数据。</span></div></Group></>}
      {section==='playback'&&<><NativeNote/><Group title="连续观看"><ToggleRow title="自动播放下一集" description="当前集播完后继续，最后一集播完时停止。" setting="autoNext" {...props}/><ToggleRow title="记住播放位置" description="再次打开时从上次位置继续。恢复上次播放的集数和时间。" setting="resume" {...props}/><Row title="默认播放速度" description="为新打开的剧集应用此速度。"><SelectMenu label="默认播放速度" value={preferences.speed} options={SPEEDS.map(value=>({value,label:`${value} 倍${value===1?' · 正常':''}`}))} onChange={v=>onPreference('speed',v)}/></Row></Group><Group title="键盘控制"><Row title="长按播放速度" description="长按 ← → 或 A D 300 毫秒后加速，松开或窗口失焦时恢复原速度。"><SelectMenu label="长按播放速度" value={preferences.holdSpeed} options={[1.5,2,2.5,3,4].map(value=>({value,label:`${value} 倍`}))} onChange={v=>onPreference('holdSpeed',v)}/></Row><Row title="点按快进 / 快退" description="方向键和 WASD 共用设置；上下方向键与 W S 调整音量。"><SelectMenu label="快进快退步长" value={preferences.seekSeconds} options={[5,10,15,30].map(value=>({value,label:`${value} 秒`}))} onChange={v=>onPreference('seekSeconds',v)}/></Row></Group><Group title="观看时的行为"><ToggleRow title="播放时保持屏幕唤醒" description="仅在视频播放期间阻止自动休眠，暂停或退出后恢复。" setting="keepAwake" {...props}/><ToggleRow title="最小化时暂停" description="最小化窗口暂停播放；恢复窗口后由你决定继续。" setting="pauseOnMinimize" {...props}/></Group></>}
      {section==='picture'&&<><NativeNote>增强默认关闭。请先安装可选模块；不兼容或持续掉帧时回退到原始画面。</NativeNote><Group title="解码与流畅度"><Row title="硬件解码" description="自动优先使用受支持的 GPU 解码；失败时回退软件解码。"><SelectMenu label="硬件解码" value={preferences.decoding} options={[{value:'auto',label:'自动 · 推荐'},{value:'software',label:'软件兼容模式'}]} onChange={v=>onPreference('decoding',v)}/></Row><ToggleRow title="性能不足时降低增强强度" description="持续掉帧时回退原画。AI 启用前会检测当前画幅的性能；运行异常或画面停滞时始终自动恢复。" setting="adaptiveQuality" {...props}/></Group><Group title="画面增强" description="原始画面默认开启；增强偏好会在下次播放时应用。"><div className="quality-profiles" role="group" aria-label="画面增强方案">{[{id:'original',title:'原始画面',sub:'忠于片源',text:'保留原始画幅，不额外锐化。',Icon:Monitor},{id:'balanced',title:'清晰均衡',sub:'通用画面',text:'高质量缩放，兼顾画面与功耗。',Icon:Sparkles},{id:'anime',title:'漫剧增强',sub:'动漫专用 · 实验性',text:'Anime4K 轻量着色器，不建议用于真人剧。',Icon:Play}].map(({id,title,sub,text,Icon})=><PressButton key={id} aria-pressed={preferences.enhancement===id} onClick={()=>onPreference('enhancement',id)} className={`quality-profile ${preferences.enhancement===id?'selected':''}`}><div><Icon size={21}/><span className="theme-radio">{preferences.enhancement===id&&<Check size={11}/>}</span></div><strong>{title}</strong><small>{sub}</small><p>{text}</p></PressButton>)}</div></Group><Group title="超分与 AI 插帧" description="实验性选项。需先安装可选 AI 模块，支持运行不代表能实时满帧。">
        <Row title="视频超分" description="自动模式为漫剧选择 Anime4K、真人剧选择高质量缩放；模块不可用时恢复原画。"><SelectMenu label="视频超分" value={preferences.superResolution} onChange={v=>onPreference('superResolution',v)} options={[{value:'off',label:'关闭 · 默认'},{value:'auto',label:'自动选择可用方案'},{value:'realesrgan',label:'Real-ESRGAN · 实验性'}]}/></Row>
        <Row title="AI 插帧" description="按当前分辨率和帧率检测，达不到实时要求时保留原片。60 帧模式最多提升至两倍；插帧可能出现运动伪影。"><SelectMenu label="AI 插帧" value={preferences.interpolation} onChange={v=>onPreference('interpolation',v)} options={[{value:'off',label:'关闭 · 原始帧率'},{value:'rife2x',label:'RIFE · 2 倍帧率'},{value:'rife60',label:'RIFE · 目标 60 帧'}]}/></Row>
        <Row title="AI 加速后端" description="默认使用 Vulkan，按实际模块加载检测。OpenVINO、TensorRT 需另外安装对应插件。"><SelectMenu label="AI 加速后端" value={preferences.inferenceBackend} onChange={v=>onPreference('inferenceBackend',v)} options={[{value:'auto',label:'自动 · 推荐'},{value:'vulkan',label:'Vulkan · 跨显卡'},{value:'openvino',label:'OpenVINO · Intel'},{value:'tensorrt',label:'TensorRT · NVIDIA'}]}/></Row>
        <div className="settings-footnote"><Info size={15}/><span>核显与独显均纳入适配。AI 插帧默认关闭，实际效果和流畅度以桌面版测试为准。</span></div>
      </Group><p className="settings-caption">增强无法还原片源中不存在的细节。先看原片，再按画面与流畅度选择。</p></>}
      {section==='storage'&&<RuntimeSettings/>}
      {section==='shortcuts'&&<><NativeNote>桌面客户端可使用全局老板键与托盘。更换快捷键遇到冲突时，保留原来已注册的组合。</NativeNote><Group title="老板键" description="按一次隐藏窗口并暂停，再按一次恢复。只有被老板键暂停的视频才会继续播放。"><ToggleRow title="启用老板键" description="桌面版注册成功后，在其他应用中也可使用。" setting="bossEnabled" {...props}/>{preferences.bossEnabled&&<ShortcutEditor value={preferences.bossShortcut} onSave={v=>onPreference('bossShortcut',v)} storageError={storageError}/>}</Group><Group title="窗口"><Row title="关闭主窗口时" description="选择托盘后，可从托盘菜单重新打开或完整退出。"><SelectMenu label="关闭主窗口时" value={preferences.closeAction} options={[{value:'quit',label:'退出应用'},{value:'tray',label:'最小化到托盘'}]} onChange={v=>onPreference('closeAction',v)}/></Row></Group><Group title="现在就能用的快捷键"><div className="shortcut-reference"><p><span>搜索剧集</span><kbd>Ctrl K</kbd></p><p><span>关闭菜单或弹层</span><kbd>Esc</kbd></p><p><span>切换分类、选择菜单</span><kbd>← → / ↑ ↓</kbd></p></div></Group></>}
    </motion.div></div></section>;
}

function diagnostics(theme,preferences) {
  // Explicit allowlist. Never include library records, request URLs, paths or credentials.
  return ['红果免费短剧 · 诊断摘要',`应用版本：${APP_VERSION}`,`生成时间：${new Date().toISOString()}`,`运行环境：${desktop?'Windows 桌面版':'浏览器预览'}`,`外观偏好：${{system:'跟随系统',light:'浅色',dark:'深色'}[theme]||'未知'}`,`解码偏好：${preferences.decoding}`,`增强偏好：${preferences.enhancement}`,`超分偏好：${preferences.superResolution}`,`插帧偏好：${preferences.interpolation}`,`推理后端偏好：${preferences.inferenceBackend}`,'视频服务：本机后端 + mpv','更新服务：GitHub Release / 签名校验','播放错误：请附上界面显示的错误类别'].join('\n');
}
async function copyText(value) {await navigator.clipboard.writeText(value);}
export function AboutPage({preferences,onPreference,theme,storageError}) {
  const [updateMessage,setUpdateMessage]=useState(''),[connection,setConnection]=useState(''),[checking,setChecking]=useState(false),[summary,setSummary]=useState(''),[copyState,setCopyState]=useState('');
  const [kind,setKind]=useState('issue'),[subject,setSubject]=useState(''),[detail,setDetail]=useState(''),[includeDiagnostics,setIncludeDiagnostics]=useState(false),[feedbackMessage,setFeedbackMessage]=useState('');
  const checkInFlight=useRef(false),subjectRef=useRef(null);
  const props={preferences,onPreference};
  async function checkConnection() {
    if(checkInFlight.current)return;
    checkInFlight.current=true;setChecking(true);setConnection('');
    try {await native('backend_status');setConnection('播放服务已连接，HLS 服务正常。');}catch(e){setConnection(e.message);}finally{checkInFlight.current=false;setChecking(false);}
  }
  async function copySummary() {try{await copyText(summary);setCopyState('诊断摘要已复制');}catch{setCopyState('复制失败，请选中下方摘要手动复制。');}}
  async function copyFeedback() {
    if(!subject.trim()){setFeedbackMessage('请先填写问题或建议的标题。');subjectRef.current?.focus();return;}
    const text=[kind==='issue'?'问题反馈':'功能建议',`版本：${APP_VERSION}`,`标题：${subject.trim()}`,detail.trim()||'尚未填写详细描述',includeDiagnostics?diagnostics(theme,preferences):''].filter(Boolean).join('\n\n');
    try{await copyText(text);setFeedbackMessage('反馈草稿已复制。可打开 GitHub 反馈页面，检查后粘贴提交。');}catch{setFeedbackMessage('复制失败，请从下方手动复制。');}
    setFeedbackDraft(text);
  }
  const [feedbackDraft,setFeedbackDraft]=useState('');
  return <section className="desktop-page settings-page about-page"><div className="settings-inner"><PageHeading title="关于与反馈" subtitle="让每一次打开，都更好一点。"/>
    <div className="about-masthead"><img src="/icon.svg" alt=""/><div><h2>红果<span>免费短剧</span></h2><p>每个故事，都值得入戏</p></div><span className="version-tag">v{APP_VERSION}<small>桌面版</small></span></div>
    <UpdatePanel {...props}/><Group title="更新偏好"><ToggleRow title="启动时检查更新" description="发现更新后提示，不打断观看。" setting="checkUpdates" {...props}/><ToggleRow title="自动下载更新包" description="下载后仍由你决定何时安装。" setting="downloadUpdates" {...props}/></Group>
    <Group title="服务与诊断"><Row title="播放服务" description="检测本机后端是否正常响应。"><PressButton className="settings-button" disabled={checking} onClick={checkConnection}><RefreshCw size={14} className={checking?'is-spinning':''}/>{checking?'检查中…':'检查连接'}</PressButton></Row>{connection&&<p className="inline-status" role="status">{connection}</p>}<Row title="诊断摘要" description="仅包含版本、运行环境和播放配置，不包含账号、观看记录、路径或密钥。"><PressButton className="settings-button" onClick={()=>{setSummary(diagnostics(theme,preferences));setCopyState('');}}><FileText size={14}/>生成摘要</PressButton></Row>{summary&&<div className="diagnostics-result"><pre tabIndex={0} aria-label="诊断摘要内容">{summary}</pre><div><span role="status">{copyState||'仅在本机生成，不会自动发送'}</span><PressButton className="settings-button" onClick={copySummary}><Copy size={14}/>复制摘要</PressButton></div></div>}</Group>
    <Group title="使用帮助"><div className="help-list">{[
      ['历史和收藏存在哪里？','收藏、历史和偏好存储于此桌面应用的本机数据目录，不会同步到其他设备。'],
      ['无法播放或检查更新时怎么办？','在「模块与存储」安装 mpv，并导入原客户端的 backend 文件夹。更新失败时请检查 GitHub 连接，或从项目 Release 下载新版。'],
      ['画质增强和超分有什么区别？','高质量缩放和锐化不等同于 AI 超分。Anime4K 面向动漫，Real-ESRGAN 可用于图像恢复，RIFE 用于生成中间帧。桌面版将按 AMD、Intel、NVIDIA 的实际后端能力检测；支持运行不代表一定能实时满帧。'],
      ['有哪些快捷键？','方向键 / WASD：点按快进快退或调音量，长按左右键临时倍速。空格暂停，F 全屏，Esc 退出全屏或播放器，Ctrl K 搜索。'],
    ].map(([title,text])=><details key={title}><summary><CircleHelp size={15}/><span>{title}</span><ChevronDown size={15}/></summary><p>{text}</p></details>)}</div></Group>
    <Group title="反馈与建议" description="先把问题整理清楚，反馈会更容易解决。"><div className="feedback-form"><div className="feedback-form-top"><SelectMenu label="反馈类型" value={kind} onChange={v=>{setKind(v);setFeedbackDraft('');}} options={[{value:'issue',label:'问题反馈'},{value:'feature',label:'功能建议'}]}/><span>GitHub Issues · 不会自动发送</span></div><label htmlFor="feedback-title">{kind==='issue'?'遇到了什么问题？':'想增加什么功能？'}</label><input id="feedback-title" ref={subjectRef} value={subject} maxLength={100} placeholder={kind==='issue'?'例如：切换集数后画面停住':'例如：希望支持画中画'} onChange={e=>{setSubject(e.target.value);setFeedbackDraft('');setFeedbackMessage('');}}/><label htmlFor="feedback-detail">详细描述 <small>选填</small></label><textarea id="feedback-detail" value={detail} maxLength={3000} rows={4} placeholder="操作步骤、预期结果与实际情况。请不要填写密码、密钥等敏感信息。" onChange={e=>{setDetail(e.target.value);setFeedbackDraft('');}}/><div className="feedback-form-footer"><label className="feedback-diagnostic-toggle"><Switch label="附上诊断摘要" checked={includeDiagnostics} onChange={v=>{setIncludeDiagnostics(v);setFeedbackDraft('');}}/><span>附上诊断摘要</span></label><PressButton className="settings-button accent" onClick={copyFeedback}><Copy size={14}/>复制反馈草稿</PressButton><PressButton className="settings-button" onClick={()=>native('open_project_link',{kind:'issues'}).catch(e=>setFeedbackMessage(e.message))}><ArrowUpRight size={14}/>打开反馈页面</PressButton></div>{feedbackMessage&&<p className="inline-status" role="status">{feedbackMessage}</p>}{feedbackDraft&&<pre className="feedback-draft" tabIndex={0} aria-label="反馈草稿内容">{feedbackDraft}</pre>}</div></Group>
    <div className="about-resources"><div><MessageSquare size={18}/><strong>开源项目</strong><p>查看源码、使用说明与参考项目。</p><PressButton className="settings-button" onClick={()=>native('open_project_link',{kind:'home'}).catch(e=>setFeedbackMessage(e.message))}>前往 GitHub<ArrowUpRight size={13}/></PressButton></div><div><FileText size={18}/><strong>本版更新</strong><p>接入签名更新，提供安装版和便携版；播放核心支持按需安装。</p><span>v{APP_VERSION} · 桌面版</span></div></div><p className="about-footer">为桌面观影而设计<span>红果免费短剧</span></p>
  </div></section>;
}
