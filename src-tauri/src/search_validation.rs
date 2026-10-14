//! Opt-in live integration check: cargo run -- --search-smoke-test
use crate::{backend::Backend,player::Player,search::Search,storage};
use serde_json::{json,Value};
use std::{path::PathBuf,sync::Arc,time::{Duration,Instant},fs};

pub fn run(ai:bool)->Result<(),String>{
 let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
 let data=root.join("work/smoke-data");storage::init_root(&data)?;storage::ensure_backend(&data)?;
 let service=Search::new()?;
 let local:Value=serde_json::from_slice(&fs::read(root.join("public/catalog.json")).map_err(|_|"catalog unavailable")?).map_err(|_|"invalid catalog")?;
 let mut reports=vec![];
 let mut targets=vec![];
 let cases=if ai {[("持械入宋","ai_series","持械入宋：第一季"),("持械入宋","ai_series","持械入宋：第二季")]} else {[("聚宝仙盆之杂灵根才是真BOSS","comic_series","聚宝仙盆之杂灵根才是真BOSS第二季"),("昼以继夜","short_play","昼以继夜2")]};
 for (query,genre,target_title) in cases{
  let first=service.page(query,genre,None)?;
  let rows=first["results"].as_array().ok_or("missing search rows")?;
  println!("online search: {query}, {} results, has_more={}",rows.len(),first["has_more"]);
  let target=rows.iter().find(|r|r["title"]==target_title).ok_or(format!("online season missing: {target_title}"))?.clone();
  let absent=!local.as_array().unwrap().iter().any(|r|r["series_id"]==target["series_id"]);
  if !absent{return Err("test season already in local catalog".into())}
  let replay=service.page(query,genre,None)?;if replay!=first{return Err("first-page cache changed".into())}
  let mut next_count=0;
  // AI playback acceptance is separate from the existing strict pagination
  // suite: later provider pages can fail even when the requested seasons exist.
  if !ai {if let Some(cursor)=first["next_cursor"].as_str(){let next=service.page(query,genre,Some(cursor))?;next_count=next["results"].as_array().unwrap().len();if service.page(query,genre,Some(cursor))?!=next{return Err("cursor replay changed".into())}println!("continuation: {next_count} new results, has_more={}",next["has_more"]);}}
  reports.push(json!({"query":query,"genre":genre,"firstPageCount":rows.len(),"secondPageCount":next_count,"onlineTitles":rows.iter().filter(|r|r["title"].as_str().unwrap_or("").starts_with(query)).map(|r|r["title"].clone()).collect::<Vec<_>>(),"target":target["title"],"seriesId":target["series_id"],"absentFromLocalCatalog":absent}));
  targets.push(target);
 }
 let all=if ai {Value::Null}else{service.page("首辅娇娘","all",None)?};
 let backend=Backend::start(&data)?;let c=&backend.connection;
 for (i,target) in targets.iter().enumerate(){
  let sid=target["series_id"].as_str().unwrap();let episodes=c.request("GET","/episodes",&[("series_id".into(),sid.into())])?;
  let count=episodes["episodes"].as_array().ok_or("missing episodes")?.len();if count==0{return Err("empty episodes".into())}
  println!("episodes: {}, {count}",target["title"]);
  let created=c.request("POST","/desktop/hls",&[("series_id".into(),sid.into()),("ep".into(),"1".into())])?;
  let id=created["id"].as_str().ok_or("HLS session missing")?;
  let played=(||->Result<Value,String>{
   let start=Instant::now();
   loop{let status=c.request("GET",&format!("/desktop/hls/{id}/status"),&[])?;if status["playlistReady"]==true{break}if status["state"]=="error"||start.elapsed()>Duration::from_secs(100){return Err("HLS did not become ready".into())}std::thread::sleep(Duration::from_secs(2));}
   let mut player=Player::launch(&root.join("runtime/mpv/mpv.exe"),&root.join("native/controls.lua"),0,Arc::new(|_|{}),true,None,&data.join("cache/shaders"))?;
   player.request(json!(["set_property","http-header-fields",[format!("x-api-key: {}",c.key)]]))?;
   player.request(json!(["loadfile",format!("http://127.0.0.1:{}/desktop/hls/{id}/index.m3u8",c.port)]))?;
   let start=Instant::now();let mut time=0.0;
   while start.elapsed()<Duration::from_secs(25){std::thread::sleep(Duration::from_secs(1));time=player.request(json!(["get_property","time-pos"])).ok().and_then(|v|v.as_f64()).unwrap_or(0.0);if time>3.0{break}}
   let video=player.request(json!(["get_property","video-params"]))?;
   if time<=3.0||video["w"].as_u64().unwrap_or(0)==0{return Err("mpv video decode did not advance".into())}
   Ok(json!({"episode":1,"episodeCount":count,"timeSeconds":time,"width":video["w"],"height":video["h"],"decoded":true}))
  })();
  c.delete_session(id);reports[i]["playback"]=played?;println!("playback verified: {}",reports[i]["playback"]);
 }
 let result=json!({"version":env!("CARGO_PKG_VERSION"),"checks":reports,"paginationTested":!ai,"allTabResultCount":all["results"].as_array().map(Vec::len),"containsCredentials":false});
 fs::write(root.join(if ai{"docs/ai-search-validation.json"}else{"docs/online-search-validation.json"}),serde_json::to_vec_pretty(&result).unwrap()).map_err(|_|"cannot save validation")?;
 Ok(())
}
