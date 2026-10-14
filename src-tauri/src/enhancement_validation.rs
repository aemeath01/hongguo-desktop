//! Live, opt-in acceptance: original playback, old unguarded filter, then the
//! guard on the same source specification. Outputs only allowlisted metrics.
use crate::{backend::Backend,player::Player,storage,enhancement_guard};
use std::{path::PathBuf,sync::Arc,time::{Duration,Instant},fs};
use serde_json::{json,Value};
fn snapshot(p:&Player)->Value{p.snapshot.lock().unwrap().clone()}
pub fn run()->Result<(),String>{
 let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
 let data=root.join("work/smoke-data");storage::init_root(&data)?;storage::ensure_backend(&data)?;
 let portable=root.join("releases/portable/data");let ai=storage::module_path(&portable,"ai");
 if !ai.join("ready.json").is_file(){return Err("AI module unavailable".into())}
 let backend=Backend::start(&data)?;let c=&backend.connection;
 let payload=c.request("POST","/desktop/hls",&[("series_id".into(),"7671966197985856536".into()),("ep".into(),"1".into())])?;
 let id=payload["id"].as_str().ok_or("missing session")?;
 let result=(||->Result<Value,String>{
  let start=Instant::now();loop{let status=c.request("GET",&format!("/desktop/hls/{id}/status"),&[])?;if status["playlistReady"]==true{break}if status["state"]=="error"||start.elapsed()>Duration::from_secs(90){return Err("source unavailable".into())}std::thread::sleep(Duration::from_secs(1));}
  let mut p=Player::launch(&root.join("runtime/mpv/mpv.exe"),&root.join("native/controls.lua"),0,Arc::new(|_|{}),true,Some(&ai),&data.join("cache/shaders"))?;
  p.request(json!(["set_property","http-header-fields",[format!("x-api-key: {}",c.key)]]))?;
  p.request(json!(["loadfile",format!("http://127.0.0.1:{}/desktop/hls/{id}/index.m3u8",c.port)]))?;
  let began=Instant::now();while snapshot(&p)["time-pos"].as_f64().unwrap_or(0.0)<3.0{if began.elapsed()>Duration::from_secs(30){return Err("original playback stalled".into())}std::thread::sleep(Duration::from_millis(300));}
  let original=snapshot(&p);let spec=enhancement_guard::video_spec(&original)?;
  println!("original: {}x{} @ {} fps, time {}",spec.0,spec.1,spec.2,original["time-pos"]);
  // Preserve the old unguarded behavior solely for a bounded regression probe.
  p.request(json!(["set_property","hwdec","auto-copy"]))?;
  p.request(json!(["set_property","vf",enhancement_guard::filter(&root,&ai,"original","rife2x","vulkan")]))?;
  let before=snapshot(&p)["time-pos"].as_f64().unwrap_or(0.0);
  std::thread::sleep(Duration::from_secs(12));
  let raw=snapshot(&p);let advance=raw["time-pos"].as_f64().unwrap_or(0.0)-before;
  println!("unguarded: 12 wall seconds, {advance:.3} media seconds, output fps {}",raw["estimated-vf-fps"]);
  drop(p);
  let guard=enhancement_guard::probe(&root.join("runtime/mpv/mpv.exe"),&root,&ai,&data.join("cache/shaders"),"original","rife2x","vulkan",spec,||true)?;
  println!("guard: {guard}");
  let mut recovered=Player::launch(&root.join("runtime/mpv/mpv.exe"),&root.join("native/controls.lua"),0,Arc::new(|_|{}),true,Some(&ai),&data.join("cache/shaders"))?;
  recovered.request(json!(["set_property","http-header-fields",[format!("x-api-key: {}",c.key)]]))?;
  recovered.request(json!(["loadfile",format!("http://127.0.0.1:{}/desktop/hls/{id}/index.m3u8",c.port)]))?;
  std::thread::sleep(Duration::from_secs(2));let restored_start=snapshot(&recovered)["time-pos"].as_f64().unwrap_or(0.0);
  std::thread::sleep(Duration::from_secs(3));let restored=snapshot(&recovered);
  let restored_advance=restored["time-pos"].as_f64().unwrap_or(0.0)-restored_start;
  if restored_advance<2.5{return Err("original recovery failed".into())}
  drop(recovered);
  let small=enhancement_guard::probe(&root.join("runtime/mpv/mpv.exe"),&root,&ai,&data.join("cache/shaders"),"original","rife2x","vulkan",(256,144,25.0),||true)?;
  if small["accepted"]!=true{return Err(format!("small video guard unexpectedly failed: {small}"))}
  println!("small video guard: {small}");
  Ok(json!({"version":env!("CARGO_PKG_VERSION"),"source":"持械入宋：第一季 第1集","width":spec.0,"height":spec.1,"sourceFps":spec.2,"originalSeconds":original["time-pos"],"unguarded":{"wallSeconds":12,"advancedSeconds":advance,"declaredOutputFps":raw["estimated-vf-fps"]},"guard":guard,"restoredSeconds":restored["time-pos"],"restoredAdvanceInThreeSeconds":restored_advance,"smallVideoGuard":small,"containsCredentials":false}))
 })();c.delete_session(id);
 let report=result?;fs::write(root.join("docs/enhancement-validation.json"),serde_json::to_vec_pretty(&report).unwrap()).map_err(|_|"could not save report")?;println!("restored: {} seconds",report["restoredSeconds"]);Ok(())
}
