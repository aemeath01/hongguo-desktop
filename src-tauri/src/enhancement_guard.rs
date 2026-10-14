//! Bounded, isolated check of the exact filter at the current source dimensions.
//! The active player's IPC and decoder remain untouched while this runs.
use std::{path::Path,sync::{Arc,Mutex,OnceLock},collections::HashMap,time::{Duration,Instant}};
use serde_json::{json,Value};
use crate::player::Player;

pub fn filter(resources:&Path,ai:&Path,profile:&str,interpolation:&str,backend:&str)->Value{
 let args=json!({"runtime":ai,"profile":profile,"interpolation":interpolation,"backend":backend});
 json!([{"name":"vapoursynth","label":"hongguo-ai","params":{"file":resources.join("native/ai.vpy"),"user-data":args.to_string(),"buffered-frames":"8","concurrent-frames":"1"}}])
}
pub fn video_spec(snapshot:&Value)->Result<(u64,u64,f64),String>{
 let w=snapshot["video-params"]["w"].as_u64().unwrap_or(0);
 let h=snapshot["video-params"]["h"].as_u64().unwrap_or(0);
 let fps=snapshot["container-fps"].as_f64().filter(|f|f.is_finite()&&*f>0.0).ok_or("无法读取片源帧率，保留原始画面")?;
 if w==0||h==0||w>8192||h>8192||fps>240.0{return Err("无法确认视频规格，保留原始画面".into())}
 Ok((w,h,fps))
}
pub fn passes(elapsed:f64,advance:f64)->bool{elapsed>=2.8&&advance/elapsed>=0.9}
type Cache=HashMap<String,(Instant,Value)>;
static CACHE:OnceLock<Mutex<Cache>>=OnceLock::new();
pub fn probe(executable:&Path,resources:&Path,ai:&Path,cache:&Path,profile:&str,interpolation:&str,backend:&str,spec:(u64,u64,f64),current:impl Fn()->bool)->Result<Value,String>{
 let (w,h,fps)=spec;
 let key=format!("{}|{profile}|{interpolation}|{backend}|{w}x{h}|{fps:.3}",ai.display());
 // Serializes probes only; never locks the foreground player. Cache is process
 // local and expires, so changing drivers/modules or relaunching tests again.
 let mut results=CACHE.get_or_init(||Mutex::new(HashMap::new())).lock().map_err(|_|"增强检测状态异常")?;
 if !current(){return Err("已取消增强检测".into())}
 results.retain(|_,(t,_)|t.elapsed()<Duration::from_secs(600));
 if let Some((_,v))=results.get(&key){return Ok(v.clone())}
 let failed=Arc::new(std::sync::atomic::AtomicBool::new(false));let flag=failed.clone();
 let mut p=Player::launch(executable,&resources.join("native/controls.lua"),0,Arc::new(move|e|{
  if e["event"]=="enhancement-error"||e["event"]=="disconnected"{flag.store(true,std::sync::atomic::Ordering::SeqCst);}
 }),true,Some(ai),cache)?;
 p.request(json!(["set_property","hwdec","no"]))?;
 p.request(json!(["set_property","vf",filter(resources,ai,profile,interpolation,backend)]))?;
 p.request(json!(["loadfile",format!("av://lavfi:testsrc2=size={w}x{h}:rate={fps:.6}")]))?;
 let began=Instant::now();let mut baseline=None;let mut elapsed=0.0;let mut advance=0.0;let mut output_fps=0.0;
 while began.elapsed()<Duration::from_secs(9){
  if !current(){return Err("已取消增强检测".into())}
  if failed.load(std::sync::atomic::Ordering::SeqCst){return Err("AI 模块运行失败，保留原始画面".into())}
  std::thread::sleep(Duration::from_millis(200));
  let v=p.snapshot.lock().map_err(|_|"无法读取增强检测结果")?.clone();
  let pos=v["time-pos"].as_f64().unwrap_or(0.0);
  output_fps=v["estimated-vf-fps"].as_f64().unwrap_or(0.0);
  if baseline.is_none()&&pos>0.05{baseline=Some((Instant::now(),pos));}
  if let Some((t,start))=baseline{elapsed=t.elapsed().as_secs_f64();advance=(pos-start).max(0.0);if elapsed>=3.0{break}}
 }
 // Drop kills the isolated process even if model inference is stuck.
 drop(p);
 let expected=if interpolation=="rife2x"{fps*2.0}else if interpolation=="rife60"{(fps*2.0).min(60.0).max(fps)}else{fps};
 let accepted=passes(elapsed,advance)&&output_fps>=expected*0.98;
 let report=json!({"accepted":accepted,"width":w,"height":h,"sourceFps":fps,"targetFps":expected,"outputFps":output_fps,"sampleSeconds":elapsed,"advancedSeconds":advance,"reason":if accepted{"sample_passed"}else{"below_realtime"}});
 if results.len()>=32{results.clear();}results.insert(key,(Instant::now(),report.clone()));Ok(report)
}

#[cfg(test)]mod tests{
 use super::*;
 #[test]fn requires_sustained_realtime_progress(){assert!(passes(3.0,2.9));assert!(!passes(3.0,0.04));assert!(!passes(1.0,1.0));assert!(!passes(3.0,f64::NAN));}
 #[test]fn missing_source_fps_is_not_guessed(){assert!(video_spec(&json!({"video-params":{"w":1080,"h":1920}})).is_err());assert_eq!(video_spec(&json!({"video-params":{"w":1080,"h":1920},"container-fps":25})).unwrap(),(1080,1920,25.0));}
}
