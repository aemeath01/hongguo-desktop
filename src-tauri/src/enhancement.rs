use std::{fs,io::{Read,Write},path::{Path,PathBuf},process::Command,os::windows::process::CommandExt,time::Duration};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use tauri::{Emitter,State};
use crate::Shared;

pub fn ai_path(s:&crate::Runtime)->PathBuf{crate::storage::module_path(&s.data,"ai")}
pub fn mpv_path(s:&crate::Runtime)->PathBuf{
 let registry=crate::storage::read_json(&s.data.join("modules.json"));
 let managed=crate::storage::module_path(&s.data,"mpv").join("mpv.exe");
 if managed.is_file()||registry["disabled"]["mpv"]==true{return managed}
 // Preserve older local installations and developer runtimes. Public packages
 // do not bundle this third-party binary; users install it from its upstream.
 let bundled=s.resources.join("runtime/mpv/mpv.exe");
 if bundled.is_file(){bundled}else{managed}
}
fn download(app:&tauri::AppHandle,url:&str,file:&Path,sha:&str)->Result<(),String>{
 if file.is_file(){let b=fs::read(file).map_err(|_|"无法读取模块文件")?;if format!("{:x}",Sha256::digest(b))==sha{return Ok(())}}
 let client=reqwest::blocking::Client::builder().timeout(Duration::from_secs(1200)).build().map_err(|_|"下载器无法启动")?;
 let mut response=client.get(url).send().map_err(|_|"下载失败，请检查网络后重试")?.error_for_status().map_err(|_|"模块下载地址暂时不可用")?;
 let total=response.content_length().unwrap_or(0);let mut count=0u64;let mut last=0u64;let mut hash=Sha256::new();
 let temp=file.with_extension("partial");let mut target=fs::File::create(&temp).map_err(|_|"无法创建模块文件")?;let mut buf=[0u8;65536];
 loop{let n=response.read(&mut buf).map_err(|_|"下载中断，请重试")?;if n==0{break}target.write_all(&buf[..n]).map_err(|_|"磁盘写入失败")?;hash.update(&buf[..n]);count+=n as u64;if count-last>1_048_576{last=count;let _=app.emit("module-progress",json!({"downloaded":count,"total":total,"file":file.file_name().unwrap().to_string_lossy()}));}}
 drop(target);if format!("{:x}",hash.finalize())!=sha{let _=fs::remove_file(&temp);return Err("模块校验失败，已拒绝加载".into())}
 if file.exists(){fs::remove_file(file).map_err(|_|"无法替换模块文件")?;}fs::rename(temp,file).map_err(|_|"无法保存模块".into())
}
fn unpack(file:&Path,target:&Path)->Result<(),String>{let result=Command::new("tar.exe").arg("-xf").arg(file).arg("-C").arg(target).creation_flags(0x08000000).output().map_err(|_|"系统解压工具不可用")?;if !result.status.success(){return Err("模块解压失败".into())}Ok(())}

pub fn install_into(app:&tauri::AppHandle,module:&str,dir:&Path)->Result<(),String>{
 if module=="mpv"{
  fs::create_dir_all(dir).map_err(|_|"无法创建播放核心目录")?;
  let url="https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20261013/mpv-x86_64-20261013-git-9d144e57b6.7z";
  let sha="551c3ec2e18db657d4f13775902145a72fb1900478719b9004ec446465fd93b9";
  let archive=dir.join("mpv.7z");download(app,url,&archive,sha)?;unpack(&archive,dir)?;
  if !dir.join("mpv.exe").is_file(){return Err("播放核心文件不完整".into())}
  fs::write(dir.join("source.json"),json!({"url":url,"sha256":sha,"license":"GPL-2.0-or-later","project":"https://mpv.io","build":"https://github.com/shinchiro/mpv-winbuild-cmake"}).to_string()).map_err(|_|"无法保存播放核心来源")?;
  fs::remove_file(archive).map_err(|_|"无法清理安装临时文件")?;
  return Ok(())
 }
 if module=="anime4k"{
  fs::create_dir_all(dir).map_err(|_|"无法创建模块目录")?;
  for (path,sha) in [("Restore/Anime4K_Restore_CNN_S.glsl","97c24dc370ab300c108bfaa09db7f175aeff343674842c299cf3940a3d330427"),("Upscale/Anime4K_Upscale_CNN_x2_S.glsl","4c53ec2e287908f7ee7bcb266b0170421626d663576468b7d7dafc62962649a4")]{download(&app,&format!("https://raw.githubusercontent.com/bloc97/Anime4K/v4.0.1/glsl/{path}"),&dir.join(path.split('/').next_back().unwrap()),sha)?;}
  return Ok(())
 }
 if module!="ai"{return Err("未知增强模块".into())}
 let cache=dir.join("downloads");fs::create_dir_all(&cache).map_err(|_|"无法创建模块目录")?;
 for (url,name,sha,dest) in [
  ("https://www.python.org/ftp/python/3.13.10/python-3.13.10-embed-amd64.zip","python.zip","e0780912ee37496035bfc81120cc18a0d93921842012d5e83a71b42110452965",dir.to_path_buf()),
  ("https://github.com/vapoursynth/vapoursynth/releases/download/R79/VapourSynth64-Portable-R79.zip","vapoursynth79.zip","625b3410d903943107291592e90d6f521f829ebb8291d952ee91b8d674bbb153",dir.to_path_buf()),
  ("https://github.com/AmusementClub/vs-mlrt/releases/download/v15.16/VSNCNN-Windows-x64.v15.16.7z","ncnn.7z","2ccf0ec1f84cd60f4a744c04d2a40d988da32f6970542f4f81669d44e9ea2ff1",dir.join("vs-plugins")),
  ("https://github.com/AmusementClub/vs-mlrt/releases/download/v15.16/models.v15.16.7z","models.7z","d4eaa8c1c4459082185a9e1a2c54d7e2c776abeea6aef6aee0cb8f6c151dfb02",dir.join("vs-plugins")),
 ]{fs::create_dir_all(&dest).map_err(|_|"无法创建模块目录")?;let file=cache.join(name);download(&app,url,&file,sha)?;let _=app.emit("module-progress",json!({"stage":"解压模块","file":name}));unpack(&file,&dest)?;}
 let site=dir.join("Lib/site-packages");fs::create_dir_all(&site).map_err(|_|"无法创建模型目录")?;
 let wheel=fs::read_dir(dir.join("wheel")).map_err(|_|"模块不完整")?.filter_map(Result::ok).find(|f|f.file_name().to_string_lossy().contains("-79-")).ok_or("缺少 VapourSynth 模块")?;
 unpack(&wheel.path(),&site)?;
 fs::write(dir.join("python313._pth"),"python313.zip\n.\nLib/site-packages\nimport site\n").map_err(|_|"无法保存 Python 配置")?;
 download(&app,"https://raw.githubusercontent.com/AmusementClub/vs-mlrt/v15.16/scripts/vsmlrt.py",&site.join("vsmlrt.py"),"a9bff9b859e5813dca5e2d466e6c13050cca4383d2a2623d53916bc34045058b")?;
 let result=Command::new(dir.join("python.exe")).args(["-c","import vapoursynth as vs; vs.core.std.LoadPlugin('vs-plugins/vsncnn.dll'); import vsmlrt"]).current_dir(&dir).creation_flags(0x08000000).output().map_err(|_|"AI 模块检测失败")?;
 if !result.status.success(){return Err("AI 模块未通过加载检测，保留原始播放".into())}
 fs::write(dir.join("ready.json"),json!({"vapoursynth":"R79","vsmlrt":"v15.16","backends":["vulkan"],"performanceTested":false}).to_string()).map_err(|_|"模块状态保存失败")?;
 // Downloads are verified archives owned by this installer. Keep only the installed runtime.
 for e in fs::read_dir(&cache).map_err(|_|"无法读取下载目录")?.flatten(){if e.file_type().is_ok_and(|t|t.is_file()){let _=fs::remove_file(e.path());}}
 Ok(())
}

#[tauri::command]
pub async fn apply_enhancement(state:State<'_,Shared>,profile:String,interpolation:String,backend:String)->Result<Value,String>{
 if !["original","balanced","anime","realesrgan"].contains(&profile.as_str())||!["off","rife2x","rife60"].contains(&interpolation.as_str())||!["auto","vulkan","openvino","tensorrt"].contains(&backend.as_str()){return Err("增强参数无效".into())}
 let s=state.inner().clone();let generation=s.generation.load(std::sync::atomic::Ordering::SeqCst);tauri::async_runtime::spawn_blocking(move||{
  let _maintenance=s.maintenance.try_read().map_err(|_|"模块正在管理，请稍后重试")?;
  let dir=ai_path(&s);let selected=if backend=="auto"{"vulkan"}else{&backend};
  let current=||s.generation.load(std::sync::atomic::Ordering::SeqCst)==generation;
  let mut report=Value::Null;
  if profile=="realesrgan"||interpolation!="off"{
   if !dir.join("ready.json").is_file(){return Err("请先在设置中安装 AI 模块".into())}
   let dll=match selected{"openvino"=>"vsov.dll","tensorrt"=>"vstrt.dll",_=>"vsncnn.dll"};if !dir.join("vs-plugins").join(dll).exists(){return Err("所选推理后端未安装，请选择自动或 Vulkan".into())}
   // file-loaded may precede the first decoded frame / container-fps event.
   // Wait for actual metadata without holding the player's control lock.
   let began=std::time::Instant::now();
   let spec=loop{
    if !current(){return Err("已取消增强检测".into())}
    let snapshot={let guard=s.player.lock().map_err(|_|"播放器状态异常")?;let p=guard.as_ref().ok_or("请先打开播放器")?;let v=p.snapshot.lock().map_err(|_|"播放状态异常")?.clone();v};
    match crate::enhancement_guard::video_spec(&snapshot){Ok(spec)=>break spec,Err(e)=>{if began.elapsed()>Duration::from_secs(3){return Err(e)}}}
    std::thread::sleep(Duration::from_millis(100));
   };
   report=crate::enhancement_guard::probe(&mpv_path(&s),&s.resources,&dir,&s.data.join("cache/shaders"),&profile,&interpolation,selected,spec,current)?;
   if report["accepted"]!=true{return Ok(json!({"applied":false,"probe":report,"message":format!("AI 增强未达到 {}×{} 的实时播放要求，本次保留原始画面",spec.0,spec.1)}))}
  }
  if !current(){return Err("已取消增强检测".into())}
  let mut guard=s.player.lock().map_err(|_|"播放器状态异常")?;let p=guard.as_mut().ok_or("请先打开播放器")?;
  if !current(){return Err("已取消增强检测".into())}
  p.request(json!(["set_property","vf",[]]))?;p.request(json!(["set_property","glsl-shaders",[]]))?;
  p.request(json!(["set_property","scale",if profile=="balanced"{"ewa_lanczossharp"}else{"bilinear"}]))?;
  let result=(||->Result<(),String>{
   if profile=="anime"{let dir=crate::storage::module_path(&s.data,"anime4k");let files=[dir.join("Anime4K_Restore_CNN_S.glsl"),dir.join("Anime4K_Upscale_CNN_x2_S.glsl")];if !files.iter().all(|f|f.is_file()){return Err("请先在设置中安装 Anime4K 模块".into())}p.request(json!(["set_property","glsl-shaders",files]))?;}
   if profile=="realesrgan"||interpolation!="off"{
    let dir=ai_path(&s);if !dir.join("ready.json").is_file(){return Err("请先在设置中安装 AI 模块".into())}
    let selected=if backend=="auto"{"vulkan"}else{&backend};let dll=match selected{"openvino"=>"vsov.dll","tensorrt"=>"vstrt.dll",_=>"vsncnn.dll"};if !dir.join("vs-plugins").join(dll).exists(){return Err("所选推理后端未安装，请选择自动或 Vulkan".into())}
    p.request(json!(["set_property","hwdec","auto-copy"]))?;
    p.request(json!(["set_property","vf",crate::enhancement_guard::filter(&s.resources,&dir,&profile,&interpolation,selected)]))?;
   } Ok(())
  })();
  if let Err(e)=result{let _=p.request(json!(["set_property","vf",[]]));let _=p.request(json!(["set_property","glsl-shaders",[]]));return Err(format!("{e}；已恢复原始画面"))}
  Ok(json!({"applied":profile!="original"||interpolation!="off","probe":report,"message":if profile=="original"&&interpolation=="off"{"已恢复原始画面"}else{"增强已启用；持续掉帧或画面停滞时自动回退"}}))
 }).await.map_err(|_|"增强操作中断")?
}
