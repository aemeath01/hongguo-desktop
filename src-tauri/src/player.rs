use std::{fs::{File,OpenOptions}, io::{Read,BufRead,BufReader,Write}, path::Path, process::{Child,Command,Stdio}, os::windows::{process::CommandExt,io::AsRawHandle}, sync::{Arc,Mutex}, time::{Duration,Instant}};
use serde_json::{json,Value};
use crate::backend::Job;

pub type Sink=Arc<dyn Fn(Value)+Send+Sync>;
pub struct Player { child:Child, pipe:File, _job:Job, pub snapshot:Arc<Mutex<Value>>, request_id:u64, reply_buffer:Vec<u8> }
impl Drop for Player {fn drop(&mut self){let _=self.child.kill();let _=self.child.wait();}}
impl Player {
 pub fn launch(executable:&Path,script:&Path,hwnd:isize,sink:Sink,headless:bool,ai:Option<&Path>,cache:&Path)->Result<Self,String>{
    if !executable.is_file(){return Err("尚未安装播放核心，请到「设置 → 模块与存储」安装 mpv".into())}
    let pipe_name=format!(r"\\.\pipe\hongguo-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
    std::fs::create_dir_all(cache).map_err(|_|"无法创建播放器缓存")?;
    let mut cmd=Command::new(executable);
    cmd.arg(format!("--gpu-shader-cache-dir={}",cache.display())).env("TEMP",cache).env("TMP",cache);
    if let Some(ai)=ai{if ai.join("ready.json").is_file(){cmd.env("VSSCRIPT_PATH",ai.join("Lib/site-packages/vapoursynth/vsscript.dll")).env("PYTHONHOME",ai).env("PATH",format!("{};{};{}",ai.display(),ai.join("Lib/site-packages/vapoursynth").display(),std::env::var("PATH").unwrap_or_default()));}}
    cmd.args(["--no-config","--idle=yes","--keep-open=no","--force-window=no","--terminal=no","--osc=no","--input-default-bindings=no","--input-vo-keyboard=yes","--hwdec=auto-safe","--volume=60","--cache=yes","--demuxer-max-bytes=96MiB","--network-timeout=90","--osd-font=Microsoft YaHei UI","--osd-font-size=24"])
      .arg(format!("--input-ipc-server={pipe_name}")).arg(format!("--script={}",script.display()));
    let fullscreen_script=script.with_file_name("fullscreen.lua");
    if fullscreen_script.is_file(){cmd.arg(format!("--script={}",fullscreen_script.display()));}
    if headless{cmd.args(["--vo=null","--ao=null"]);}else{cmd.arg(format!("--wid={hwnd}")).args(["--vo=gpu-next","--gpu-api=d3d11"]);}
    let job=Job::new()?;
    let mut child=cmd.creation_flags(0x08000000).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_|"mpv 无法启动")?;
    if let Err(e)=job.assign(&child){let _=child.kill();return Err(e)}
    let start=Instant::now();
    let pipe=loop{if let Ok(f)=OpenOptions::new().read(true).write(true).open(&pipe_name){break f}
      if child.try_wait().ok().flatten().is_some(){return Err("mpv 启动后退出，请检查运行时完整性".into())}
      if start.elapsed()>Duration::from_secs(10){return Err("mpv 控制通道连接超时".into())} std::thread::sleep(Duration::from_millis(50));};
    // Windows synchronous pipe handles serialize reads/writes even after DuplicateHandle.
    // Use two independent connections: a read-only observer and a request/reply channel.
    let start=Instant::now();let mut reader=loop{match OpenOptions::new().read(true).write(true).open(&pipe_name){Ok(f)=>break f,Err(_)=>{if start.elapsed()>Duration::from_secs(5){return Err("无法订阅播放状态".into())}std::thread::sleep(Duration::from_millis(30));}}};
    for (id,p) in ["time-pos","duration","pause","speed","volume","mute","paused-for-cache","hwdec-current","video-params","estimated-vf-fps","frame-drop-count","decoder-frame-drop-count","eof-reached","container-fps","avsync","seeking"].iter().enumerate(){let msg=json!({"command":["observe_property",id+1,p]}).to_string()+"\n";reader.write_all(msg.as_bytes()).map_err(|_|"无法订阅播放状态")?;}
    reader.write_all(b"{\"command\":[\"request_log_messages\",\"warn\"]}\n").map_err(|_|"无法订阅模块状态")?;
    let snapshot=Arc::new(Mutex::new(json!({"pause":false,"time-pos":0,"duration":0,"speed":1,"volume":60})));
    let values=snapshot.clone();
    std::thread::spawn(move||{
      for line in BufReader::new(reader).lines().map_while(Result::ok){
        let Ok(event)=serde_json::from_str::<Value>(&line) else{continue};
        match event["event"].as_str().unwrap_or("") {
          "property-change"=>{if let Some(name)=event["name"].as_str(){if let Ok(mut s)=values.lock(){s[name]=event["data"].clone();}} sink(event);},
          "file-loaded"|"playback-restart"=>sink(event),
          "end-file"=>sink(json!({"event":"end-file","reason":event["reason"],"error":event.get("error").map(|_|"播放失败，请重试或换集")})),
          "client-message"=>{if event["args"][0]=="hongguo"{sink(event)}},
          "log-message"=>{let prefix=event["prefix"].as_str().unwrap_or("");let text=event["text"].as_str().unwrap_or("");if (prefix.contains("vapoursynth")||text.contains("Disabling filter"))&&(text.contains("failed")||text.contains("could not init")||text.contains("Error")){sink(json!({"event":"enhancement-error","message":"增强模块运行失败"}));}},
          _=>{}
        }
      }
      sink(json!({"event":"disconnected"}));
    });
    Ok(Self{child,pipe,_job:job,snapshot,request_id:0,reply_buffer:Vec::new()})
 }
 pub fn send(&mut self,command:Value)->Result<(),String>{
    self.request(command).map(|_|())
 }
 pub fn alive(&mut self)->bool{matches!(self.child.try_wait(),Ok(None))}
 pub fn enable_video_input(&mut self,host:isize)->Result<(),String>{
   use windows_sys::Win32::{Foundation::HWND,UI::{WindowsAndMessaging::*,Input::KeyboardAndMouse::{EnableWindow,IsWindowEnabled}}};
   // mpv deliberately disables its --wid child on Windows. Our controls live
   // on that surface, so explicitly restore input after the VO is created.
   // Never enable an unrelated HWND supplied by a stale player response.
   let id=self.request(json!(["get_property","window-id"]))?.as_i64().ok_or("视频输入窗口尚未就绪")?;
   unsafe{
     let window=id as HWND;let mut pid=0;
     GetWindowThreadProcessId(window,&mut pid);
     if id==0||pid!=self.child.id()||IsChild(host as HWND,window)==0{return Err("视频输入窗口校验失败".into())}
     EnableWindow(window,1);
     if IsWindowEnabled(window)==0{return Err("无法启用视频鼠标输入".into())}
   }
   Ok(())
 }
 pub fn request(&mut self,command:Value)->Result<Value,String>{
   self.request_id+=1;let id=self.request_id;
   let payload=json!({"command":command,"request_id":id}).to_string()+"\n";
   self.pipe.write_all(payload.as_bytes()).map_err(|_|"播放器连接中断")?;
   let start=Instant::now();
   let result=loop{
    if let Some(end)=self.reply_buffer.iter().position(|b|*b==b'\n'){let line:Vec<u8>=self.reply_buffer.drain(..=end).collect();if let Ok(v)=serde_json::from_slice::<Value>(&line){if v["request_id"]==id{break v}}continue;}
    if start.elapsed()>Duration::from_secs(15){let _=self.child.kill();let _=self.child.wait();return Err("播放器响应超时，已停止无响应的增强进程".into())}
    let mut available=0;let ok=unsafe{windows_sys::Win32::System::Pipes::PeekNamedPipe(self.pipe.as_raw_handle() as _,std::ptr::null_mut(),0,std::ptr::null_mut(),&mut available,std::ptr::null_mut())};
    if ok==0{return Err("播放器连接已断开".into())}if available==0{std::thread::sleep(Duration::from_millis(2));continue;}
    let mut bytes=vec![0;available.min(65536) as usize];let n=self.pipe.read(&mut bytes).map_err(|_|"播放器响应中断")?;self.reply_buffer.extend_from_slice(&bytes[..n]);
   };
   if result["error"]!="success"{return Err(format!("播放器未接受操作：{}",result["error"].as_str().unwrap_or("unknown")))}
   Ok(result["data"].clone())
 }
}
