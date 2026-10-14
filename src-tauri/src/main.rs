#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod backend;
mod player;
mod video_host;
mod enhancement;
mod enhancement_guard;
mod enhancement_validation;
mod storage;
mod search;
mod search_validation;
use enhancement::apply_enhancement;
use storage::{storage_status,choose_directory,set_storage_directory,open_managed_folder,manage_runtime};
use backend::{Backend,Connection};
use player::Player;
use serde_json::{json,Value};
use std::{collections::HashMap,path::PathBuf,sync::{Arc,Mutex,RwLock,atomic::{AtomicIsize,AtomicU64,AtomicBool,Ordering}},time::{Duration,Instant},os::windows::process::CommandExt};
use tauri::{Emitter,Manager,State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt,ShortcutState};
use windows_sys::Win32::{Foundation::HWND,UI::WindowsAndMessaging::*};

struct Runtime {
 data:PathBuf, install:PathBuf, storage_notice:String, maintenance:RwLock<()>, resources:PathBuf, backend:Mutex<Option<Backend>>, player:Mutex<Option<Player>>,
 host:AtomicIsize, host_rect:Mutex<Option<video_host::VideoRect>>, generation:AtomicU64, session:Mutex<Option<(Connection,String)>>,
 preferences:Mutex<Value>,boss_paused:AtomicBool,search:search::Search,
}
impl Runtime {
 fn connection(&self)->Result<Connection,String>{
  let _guard=self.maintenance.try_read().map_err(|_|"模块正在安装或清理，请稍后重试")?;
  let mut b=self.backend.lock().map_err(|_|"后端状态异常")?;
  if b.as_mut().is_some_and(|x|!x.alive()){*b=None;}
  if b.is_none(){storage::ensure_backend(&self.data)?;*b=Some(Backend::start(&self.data)?);}
  Ok(b.as_ref().unwrap().connection.clone())
 }
 fn command(&self,c:Value)->Result<(),String>{self.player.lock().map_err(|_|"播放器状态异常")?.as_mut().ok_or("播放器尚未启动")?.send(c)}
 fn release_session(&self){if let Ok(mut s)=self.session.lock(){if let Some((c,id))=s.take(){std::thread::spawn(move||c.delete_session(&id));}}}
}
type Shared=Arc<Runtime>;
fn resource_root(app:&tauri::AppHandle)->PathBuf{if cfg!(debug_assertions){PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()}else{app.path().resource_dir().unwrap()}}

#[tauri::command]
async fn api_request(state:State<'_,Shared>,path:String,query:HashMap<String,String>)->Result<Value,String>{
 let allowed=["/search/page","/search","/episodes","/browse","/filters","/rank","/latest","/desktop/hls/capabilities"];
 if !allowed.contains(&path.as_str()){return Err("接口不支持".into())}
 let s=state.inner().clone();tauri::async_runtime::spawn_blocking(move||{
  if path=="/search/page"||path=="/search" {return s.search.page(query.get("q").map(String::as_str).unwrap_or(""),query.get("genre").map(String::as_str).unwrap_or("all"),query.get("cursor").map(String::as_str))}
  s.connection()?.request("GET",&path,&query.into_iter().collect::<Vec<_>>())
 }).await.map_err(|_|"接口任务中断")?
}
#[tauri::command]
async fn backend_status(state:State<'_,Shared>)->Result<Value,String>{let s=state.inner().clone();tauri::async_runtime::spawn_blocking(move||{let c=s.connection()?;let h=c.request("GET","/desktop/hls/capabilities",&[])?;Ok(json!({"connected":true,"hls":h}))}).await.map_err(|_|"检测中断")?}

#[tauri::command]
async fn video_rect(window:tauri::WebviewWindow,state:State<'_,Shared>,x:f64,y:f64,width:f64,height:f64,visible:bool)->Result<(),String>{
 let s=state.inner().clone();let parent=window.hwnd().map_err(|_|"无法读取播放窗口")?.0 as isize;
 let scale=window.scale_factor().map_err(|_|"无法读取窗口缩放")?;
 window.run_on_main_thread(move||unsafe{
  let h=s.host.load(Ordering::SeqCst) as HWND;
  let mut client=std::mem::zeroed();if GetClientRect(parent as HWND,&mut client)==0{return}
  let rect=video_host::VideoRect::from_logical(x,y,width,height,scale,client.right,client.bottom,visible);
  let Ok(mut last)=s.host_rect.lock()else{return};if last.as_ref()==Some(&rect){return}
  if rect.visible{
   // Raise only when revealing the child. Repeated HWND_TOP/SWP_SHOWWINDOW
   // invalidations race WebView's composition during fullscreen and resize.
   let showing=!last.as_ref().is_some_and(|v|v.visible);
   let flags=SWP_NOACTIVATE|SWP_NOCOPYBITS|if showing{SWP_SHOWWINDOW}else{SWP_NOZORDER};
   if SetWindowPos(h,HWND_TOP,rect.x,rect.y,rect.width,rect.height,flags)==0{return}
  }else{ShowWindow(h,SW_HIDE);}
  *last=Some(rect);
 }).map_err(|_|"视频窗口调整失败".into())
}

#[tauri::command]
async fn start_episode(app:tauri::AppHandle,state:State<'_,Shared>,series_id:String,episode:u32,preferences:Value,start_seconds:f64)->Result<Value,String>{
 if !series_id.chars().all(|c|c.is_ascii_digit())||series_id.is_empty()||episode==0{return Err("剧集参数无效".into())}
 let s=state.inner().clone();let generation=s.generation.fetch_add(1,Ordering::SeqCst)+1;
 tauri::async_runtime::spawn_blocking(move||{
   let _maintenance=s.maintenance.try_read().map_err(|_|"模块正在管理，请稍后播放")?;
   {let mut session=s.session.lock().map_err(|_|"会话状态异常")?;if s.generation.load(Ordering::SeqCst)!=generation{return Err("已取消切集".into())}if let Some((c,id))=session.take(){std::thread::spawn(move||c.delete_session(&id));}}
   let c=s.connection()?;
   {let mut p=s.player.lock().map_err(|_|"播放器状态异常")?;
    if p.as_mut().is_some_and(|p|!p.alive()){*p=None;}
    if p.is_none(){let app=app.clone();*p=Some(Player::launch(&enhancement::mpv_path(&s),&s.resources.join("native/controls.lua"),s.host.load(Ordering::SeqCst),Arc::new(move|event|{let _=app.emit("mpv-event",event);}),false,Some(&enhancement::ai_path(&s)),&s.data.join("cache/shaders"))?);}
   }
   if s.generation.load(Ordering::SeqCst)!=generation{return Err("已取消切集".into())}
   s.command(json!(["stop"]))?;
   let payload=c.request("POST","/desktop/hls",&[("series_id".into(),series_id),("ep".into(),episode.to_string()),("start_seconds".into(),start_seconds.max(0.0).to_string())])?;
   let id=payload["id"].as_str().ok_or("无法创建播放会话")?.to_string();
   struct PendingSession(Connection,Option<String>);
   impl Drop for PendingSession{fn drop(&mut self){if let Some(id)=self.1.take(){let c=self.0.clone();std::thread::spawn(move||c.delete_session(&id));}}}
   let mut pending=PendingSession(c.clone(),Some(id.clone()));
   let t=Instant::now();
   let status=loop{
     if s.generation.load(Ordering::SeqCst)!=generation{c.delete_session(&id);return Err("已取消切集".into())}
     let status=match c.request("GET",&format!("/desktop/hls/{id}/status"),&[]){Ok(v)=>v,Err(e)=>{c.delete_session(&id);return Err(e)}};
     if status["playlistReady"]==true {break status}
     if status["state"]=="failed"||status["state"]=="error"||t.elapsed()>Duration::from_secs(100){c.delete_session(&id);return Err(format!("片源准备失败（{}），请重试或换集",status["failureCode"].as_str().unwrap_or("timeout")))}
     std::thread::sleep(Duration::from_millis(350));
   };
   // Commit only the most recent request; stale requests release their own HLS job.
   let mut session=s.session.lock().map_err(|_|"会话状态异常")?;
   if s.generation.load(Ordering::SeqCst)!=generation{c.delete_session(&id);return Err("已取消切集".into())}
   s.command(json!(["set_property","http-header-fields",[format!("x-api-key: {}",c.key)]]))?;
   s.command(json!(["set_property","hwdec",if preferences["decoding"]=="software"{"no"}else{"auto-safe"}]))?;
   s.command(json!(["set_property","stop-screensaver",preferences["keepAwake"].as_bool().unwrap_or(true)]))?;
   s.command(json!(["script-message","set-speed",preferences["speed"].as_f64().unwrap_or(1.0).clamp(0.25,4.0).to_string()]))?;
   s.command(json!(["script-message","preferences",preferences["holdSpeed"].as_f64().unwrap_or(2.0).to_string(),preferences["seekSeconds"].as_u64().unwrap_or(5).to_string(),preferences["adaptiveQuality"].as_bool().unwrap_or(true).to_string()]))?;
   s.command(json!(["set_property","pause",false]))?;
   s.command(json!(["set_property","vf",[]]))?;s.command(json!(["set_property","glsl-shaders",[]]))?;
   s.command(json!(["loadfile",format!("http://127.0.0.1:{}/desktop/hls/{id}/index.m3u8",c.port),"replace"]))?;
   *session=Some((c,id));pending.1=None;Ok(json!({"generation":generation,"status":status}))
 }).await.map_err(|_|"播放任务中断")?
}
#[tauri::command]
async fn stop_player(state:State<'_,Shared>)->Result<(),String>{let s=state.inner().clone();let generation=s.generation.fetch_add(1,Ordering::SeqCst)+1;tauri::async_runtime::spawn_blocking(move||{let mut session=s.session.lock().map_err(|_|"会话状态异常")?;if s.generation.load(Ordering::SeqCst)!=generation{return Ok(())}if let Some((c,id))=session.take(){std::thread::spawn(move||c.delete_session(&id));}s.player.lock().map_err(|_|"播放器状态异常")?.take();Ok(())}).await.map_err(|_|"关闭播放器中断")?}
#[tauri::command]
fn player_snapshot(state:State<'_,Shared>)->Result<Value,String>{let p=state.player.lock().map_err(|_|"播放器状态异常")?;let value=p.as_ref().ok_or("播放器未启动")?.snapshot.lock().map_err(|_|"播放状态异常")?.clone();Ok(value)}
#[tauri::command]
async fn player_action(state:State<'_,Shared>,action:String,value:Option<f64>)->Result<(),String>{
 let v=value.filter(|x|x.is_finite()).unwrap_or(0.0);
 let command=match action.as_str(){
 "ping"=>json!(["get_property","idle-active"]),"pause"=>json!(["cycle","pause"]),"set-pause"=>json!(["set_property","pause",v!=0.0]),
 "select-speed"=>json!(["script-message","set-speed",v.clamp(0.25,4.0).to_string()]),
 "overlay-focus"=>json!(["script-message","fullscreen-focus",v.to_string()]),"overlay-activate"=>json!(["script-message","fullscreen-activate"]),
 "overlay-escape"=>json!(["script-message","fullscreen-escape"]),
 "speed"=>json!(["set_property","speed",v.clamp(0.25,4.0)]),"volume"=>json!(["set_property","volume",v.clamp(0.0,100.0)]),
 "seek"=>json!(["seek",v.clamp(-600.0,600.0),"relative+exact"]),"position"=>json!(["seek",v.max(0.0),"absolute+exact"]),
 "restore-speed"=>json!(["script-message","restore-speed"]),_=>return Err("未知播放操作".into())};let s=state.inner().clone();tauri::async_runtime::spawn_blocking(move||s.command(command)).await.map_err(|_|"播放操作中断")?
}

#[tauri::command]
async fn player_overlay(state:State<'_,Shared>,fullscreen:bool,episode:u32,total:u32,duration:f64,origin:f64,reduced:bool)->Result<(),String>{
 let finite=|v:f64|if v.is_finite(){v.max(0.0)}else{0.0};
 let token=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos().to_string();
 let command=json!(["script-message","fullscreen-ui",fullscreen.to_string(),episode.to_string(),total.to_string(),finite(duration).to_string(),finite(origin).to_string(),reduced.to_string(),token]);
 let s=state.inner().clone();tauri::async_runtime::spawn_blocking(move||{
  let mut guard=s.player.lock().map_err(|_|"播放器状态异常")?;
  let player=guard.as_mut().ok_or("播放器尚未启动")?;
  player.enable_video_input(s.host.load(Ordering::SeqCst))?;
  player.send(command)?;
  let start=Instant::now();
  while start.elapsed()<Duration::from_secs(2){
   if let Ok(status)=player.request(json!(["get_property","user-data/hongguo/fullscreen-controls"])){
    if status["token"]==token&&status["enabled"]==fullscreen{
     if status["error"].as_str().is_some_and(|e|!e.is_empty()){break}
     if !fullscreen||status["rendered"]==true{return Ok(())}
    }
   }
   std::thread::sleep(Duration::from_millis(20));
  }
  let _=player.send(json!(["script-message","fullscreen-ui","false"]));
  Err("全屏浮层未就绪，已保留底部控制栏".into())
 }).await.map_err(|_|"全屏控件同步中断")?
}
#[tauri::command]
fn update_status(app:tauri::AppHandle,state:State<'_,Shared>)->Value{let configured=app.config().plugins.0.get("updater").is_some_and(|v|v["pubkey"].as_str().is_some_and(|p|!p.is_empty())&&v["endpoints"].as_array().is_some_and(|a|!a.is_empty()));json!({"configured":configured,"portable":state.install.join("portable.json").is_file()})}

#[tauri::command]
async fn window_preferences(app:tauri::AppHandle,state:State<'_,Shared>,preferences:Value)->Result<(),String>{
 let old=state.preferences.lock().map_err(|_|"偏好状态异常")?.clone();
 let changed=old["bossShortcut"]!=preferences["bossShortcut"]||old["bossEnabled"]!=preferences["bossEnabled"];
 if changed{
  let new_key=preferences["bossShortcut"].as_str().unwrap_or("Ctrl+Shift+B").replace("Ctrl","Control");
  // Register the new shortcut before removing the old one: conflicts keep the previous binding.
  if preferences["bossEnabled"]==true{
   app.global_shortcut().on_shortcut(new_key.as_str(),|app,_,event|{
    if event.state()!=ShortcutState::Pressed{return}
    let app=app.clone();std::thread::spawn(move||{
     let s=app.state::<Shared>();if let Some(w)=app.get_webview_window("main"){
      if w.is_visible().unwrap_or(true){let playing=s.player.lock().ok().and_then(|p|p.as_ref().and_then(|p|p.snapshot.lock().ok().map(|v|v["pause"]==false&&v["time-pos"].is_number()))).unwrap_or(false);s.boss_paused.store(playing,Ordering::SeqCst);let _=s.command(json!(["script-message","restore-speed"]));let _=s.command(json!(["set_property","pause",true]));let _=w.hide();}
      else{let _=w.show();let _=w.set_focus();if s.boss_paused.swap(false,Ordering::SeqCst){let _=s.command(json!(["set_property","pause",false]));}}
     }
    });
   }).map_err(|_|"老板键被其他程序占用，请换一个组合；原快捷键仍保留")?;
  }
  if old["bossEnabled"]==true{let old_key=old["bossShortcut"].as_str().unwrap_or("Ctrl+Shift+B").replace("Ctrl","Control");let _=app.global_shortcut().unregister(old_key.as_str());}
 }
 *state.preferences.lock().map_err(|_|"偏好状态异常")?=preferences;Ok(())
}

#[tauri::command]
async fn capabilities(state:State<'_,Shared>)->Result<Value,String>{let s=state.inner().clone();tauri::async_runtime::spawn_blocking(move||{
 let output=std::process::Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-Command","[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM) | ConvertTo-Json -Compress"]).creation_flags(0x08000000).output().map_err(|_|"显卡检测失败")?;
 let gpu=serde_json::from_slice::<Value>(&output.stdout).unwrap_or(json!([]));
 let ai=enhancement::ai_path(&s);
 Ok(json!({"gpus":gpu,"mpv":enhancement::mpv_path(&s).is_file(),"anime4k":storage::installed(&s.data,"anime4k"),"aiInstalled":ai.join("ready.json").is_file(),"benchmarked":false,"dataDirectory":s.data}))
 }).await.map_err(|_|"硬件检测中断")?}

fn smoke_test()->Result<(),String>{
 let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();let data=root.join("work/smoke-data");
 storage::init_root(&data)?;
 if std::env::args().any(|a|a=="--reinstall"){storage::import_backend(&data,&PathBuf::from(r"D:\Software\红果免费短剧\backend"))?;}
 storage::ensure_backend(&data)?;let backend=Backend::start(&data)?;println!("backend: ready");
 for (path,q) in [("/episodes",vec![("series_id".into(),"7686713195246930968".into())]),("/search/page",vec![("q".into(),"首辅娇娘".into())]),("/browse",vec![("genre".into(),"short_play".into()),("limit".into(),"5".into())]),("/rank",vec![("board".into(),"hot".into()),("limit".into(),"5".into())]),("/desktop/hls/capabilities",vec![])]{
  match backend.connection.request("GET",path,&q){Ok(v)=>println!("{}: {}",path,if path.contains("capabilities"){v.to_string()}else{format!("keys={:?}, count={}",v.as_object().map(|m|m.keys().collect::<Vec<_>>()),v["episodes"].as_array().or(v["results"].as_array()).or(v["items"].as_array()).map_or(0,|v|v.len()))}),Err(e)=>println!("{path}: {e}")}
 }
 let c=&backend.connection;
 let created=c.request("POST","/desktop/hls",&[("series_id".into(),"7686713195246930968".into()),("ep".into(),"1".into())])?;
 let id=created["id"].as_str().ok_or("HLS session missing")?;
 let start=Instant::now();
 loop{let status=c.request("GET",&format!("/desktop/hls/{id}/status"),&[])?;println!("HLS: {}",status);if status["playlistReady"]==true{break}if start.elapsed()>Duration::from_secs(100){c.delete_session(id);return Err("HLS timeout".into())}std::thread::sleep(Duration::from_secs(3));}
 let mut p=Player::launch(&root.join("runtime/mpv/mpv.exe"),&root.join("native/controls.lua"),0,Arc::new(|e|{if matches!(e["event"].as_str(),Some("end-file"|"file-loaded")){println!("mpv {}",e);}}),true,Some(&root.join("runtime/ai")),&data.join("cache/shaders"))?;
 p.request(json!(["set_property","http-header-fields",[format!("x-api-key: {}",c.key)]]))?;
 p.request(json!(["loadfile",format!("http://127.0.0.1:{}/desktop/hls/{id}/index.m3u8",c.port)]))?;
 std::thread::sleep(Duration::from_secs(10));
 println!("mpv state: {}",p.snapshot.lock().unwrap());
 p.request(json!(["set_property","speed",1.5]))?;p.request(json!(["seek",5,"relative+exact"]))?;
 std::thread::sleep(Duration::from_secs(3));println!("mpv after seek: {}",p.snapshot.lock().unwrap());
 let played=p.snapshot.lock().unwrap()["time-pos"].as_f64().unwrap_or(0.0)>1.0;
 p.request(json!(["script-message","preferences","3","5","true"]))?;
 p.request(json!(["keydown","RIGHT"]))?;std::thread::sleep(Duration::from_millis(700));
 if p.request(json!(["get_property","speed"]))?!=3.0{return Err("Lua 长按倍速未生效".into())}
 p.request(json!(["keyup","RIGHT"]))?;std::thread::sleep(Duration::from_millis(150));
 if p.request(json!(["get_property","speed"]))?!=1.5{return Err("Lua 松手速度未恢复".into())}println!("native hold: 1.5 -> 3 -> 1.5 passed");
 let seek=c.request("POST","/desktop/hls",&[("series_id".into(),"7686713195246930968".into()),("ep".into(),"1".into()),("start_seconds".into(),"120".into())])?;
 let seek_id=seek["id"].as_str().ok_or("seek session missing")?;let began=Instant::now();
 loop{let status=c.request("GET",&format!("/desktop/hls/{seek_id}/status"),&[])?;if status["playlistReady"]==true{println!("seek window: {}",status);break}if began.elapsed()>Duration::from_secs(60){c.delete_session(seek_id);return Err("seek window timeout".into())}std::thread::sleep(Duration::from_secs(2));}
 p.request(json!(["loadfile",format!("http://127.0.0.1:{}/desktop/hls/{seek_id}/index.m3u8",c.port),"replace"]))?;std::thread::sleep(Duration::from_secs(4));println!("seek window decoded: {}",p.snapshot.lock().unwrap()["time-pos"]);c.delete_session(seek_id);
 drop(p);c.delete_session(id);if !played{return Err("未能解码播放".into())}
 Ok(())
}
#[tauri::command]
fn open_project_link(kind:String)->Result<(),String>{
 let base="https://github.com/aemeath01/hongguo-desktop";
 let url=match kind.as_str(){"home"=>base.to_string(),"releases"=>format!("{base}/releases/latest"),"issues"=>format!("{base}/issues/new/choose"),"help"=>format!("{base}#开始使用"),_=>return Err("未知项目链接".into())};
 std::process::Command::new("rundll32.exe").arg("url.dll,FileProtocolHandler").arg(url).creation_flags(0x08000000).spawn().map_err(|_|"无法打开默认浏览器")?;
 Ok(())
}
fn main(){
 if std::env::args().any(|a|a=="--enhancement-smoke-test"){if let Err(e)=enhancement_validation::run(){eprintln!("{e}");std::process::exit(1)}return}
 if let Some(mode)=std::env::args().find(|a|a=="--search-smoke-test"||a=="--search-ai-smoke-test"){if let Err(e)=search_validation::run(mode=="--search-ai-smoke-test"){eprintln!("{e}");std::process::exit(1)}return}
 if std::env::args().any(|a|a=="--smoke-test"){if let Err(e)=smoke_test(){eprintln!("{e}");std::process::exit(1)}return}
 tauri::Builder::default().plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_updater::Builder::new().build()).plugin(tauri_plugin_process::init()).plugin(tauri_plugin_global_shortcut::Builder::new().build())
 .setup(|app|{
  let install=if cfg!(debug_assertions){resource_root(app.handle())}else{std::env::current_exe()?.parent().unwrap().to_path_buf()};
  let storage=match storage::Storage::initialize(install.clone(),app.path().app_local_data_dir()?){
   Ok(s)=>s,Err(error)=>{
    // Preserve the old data and show an actionable error instead of silently disappearing.
    let _=std::fs::write(install.join("startup-error.txt"),&error);
    let handle=app.handle().clone();let message=format!("数据目录尚未准备好：{error}\n\n原有数据已保留。请关闭旧版客户端，检查目录空间和权限后重新打开。\n可在软件目录的 hongguo-storage.json 中查看已选择的位置。");
    use tauri_plugin_dialog::DialogExt;
    let exit_handle=handle.clone();
    handle.dialog().message(message).title("红果免费短剧 · 启动未完成").kind(tauri_plugin_dialog::MessageDialogKind::Error).show(move |_|exit_handle.exit(1));
    return Ok(());
   }
  };
  let _=std::fs::remove_file(install.join("startup-error.txt"));
  let window=tauri::WebviewWindowBuilder::from_config(app,&app.config().app.windows[0])?.data_directory(storage.data.clone()).build()?;
  let data=storage.data;
  let parent=window.hwnd()?.0 as HWND;
  // The web UI and mpv are sibling native windows. Keep the parent from
  // erasing the video child while WebView repaints its own title/controls.
  unsafe{SetWindowLongPtrW(parent,GWL_STYLE,GetWindowLongPtrW(parent,GWL_STYLE)|WS_CLIPCHILDREN as isize);}
  let class:Vec<u16>="STATIC\0".encode_utf16().collect();
  let host=unsafe{CreateWindowExW(0,class.as_ptr(),std::ptr::null(),WS_CHILD|WS_CLIPSIBLINGS|WS_CLIPCHILDREN,0,0,1,1,parent,std::ptr::null_mut(),std::ptr::null_mut(),std::ptr::null())};
  if host.is_null(){return Err("无法创建视频渲染窗口".into())}
  let state=Arc::new(Runtime{data,install:storage.install,storage_notice:storage.notice,maintenance:RwLock::new(()),resources:resource_root(app.handle()),backend:Mutex::new(None),player:Mutex::new(None),host:AtomicIsize::new(host as isize),host_rect:Mutex::new(None),generation:AtomicU64::new(0),session:Mutex::new(None),preferences:Mutex::new(json!({})),boss_paused:AtomicBool::new(false),search:search::Search::new()?});
  app.manage(state.clone());
  let menu=tauri::menu::Menu::with_items(app,&[&tauri::menu::MenuItem::with_id(app,"show","打开红果免费短剧",true,None::<&str>)?,&tauri::menu::MenuItem::with_id(app,"quit","退出",true,None::<&str>)?])?;
  tauri::tray::TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).tooltip("红果免费短剧").menu(&menu).on_menu_event(|app,e|match e.id.as_ref(){"show"=>{if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();}},"quit"=>app.exit(0),_=>{}}).build(app)?;
  let win=window.clone();window.on_window_event(move|event|{
   if let tauri::WindowEvent::CloseRequested{api,..}=event{if state.preferences.lock().ok().is_some_and(|p|p["closeAction"]=="tray"){api.prevent_close();let _=win.hide();let s=state.clone();std::thread::spawn(move||{let _=s.command(json!(["set_property","pause",true]));});}}
   if matches!(event,tauri::WindowEvent::Focused(false)){let s=state.clone();let minimize=win.is_minimized().unwrap_or(false);std::thread::spawn(move||{let _=s.command(json!(["script-message","restore-speed"]));if minimize&&s.preferences.lock().ok().is_some_and(|p|p["pauseOnMinimize"]==true){let _=s.command(json!(["set_property","pause",true]));}});}
  });
  Ok(())
 }).invoke_handler(tauri::generate_handler![api_request,backend_status,video_rect,start_episode,stop_player,player_snapshot,player_action,player_overlay,capabilities,storage_status,choose_directory,set_storage_directory,open_managed_folder,manage_runtime,apply_enhancement,update_status,open_project_link,window_preferences])
 .build(tauri::generate_context!()).expect("桌面应用创建失败").run(|app,event|{if let tauri::RunEvent::Exit=event{if let Some(state)=app.try_state::<Shared>(){state.generation.fetch_add(1,Ordering::SeqCst);state.release_session();state.player.lock().ok().map(|mut p|p.take());state.backend.lock().ok().map(|mut b|b.take());}}});
}
