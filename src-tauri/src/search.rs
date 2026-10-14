//! The installed client's native search uses Novelfm, not the Python /search API.
//! Only public catalog metadata is requested. No account, device or signing keys.
use std::{collections::{HashMap,HashSet},io::Read,sync::Mutex,time::{Duration,Instant}};
use serde_json::{json,Value};

const ENDPOINT:&str="https://api5-sinfonlinea.novelfm.com/novelfm/bookmall/search/page/v1/";
const TTL:Duration=Duration::from_secs(600);
const GAP:Duration=Duration::from_secs(3);
const MAX_BYTES:u64=2*1024*1024;

#[derive(Clone)]
struct Track {tab:u32,offset:u64,search_id:String,more:bool}
#[derive(Clone)]
struct Session {query:String,mode:String,tracks:Vec<Track>,seen:HashSet<String>,expires:Instant,replay:Option<Value>}
#[derive(Default)]
struct Cache {sessions:HashMap<String,Session>,first:HashMap<(String,String),(Instant,Value)>,pages:HashMap<(String,u32,u64,String),(Instant,Value)>,last_request:Option<Instant>}
pub struct Search {client:reqwest::blocking::Client,cache:Mutex<Cache>}
impl Search {
 pub fn new()->Result<Self,String>{Ok(Self{client:reqwest::blocking::Client::builder().user_agent(concat!("HongguoFreeDrama/",env!("CARGO_PKG_VERSION"))).timeout(Duration::from_secs(25)).connect_timeout(Duration::from_secs(10)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"在线搜索组件启动失败")?,cache:Mutex::new(Cache::default())})}
 pub fn page(&self,query:&str,mode:&str,cursor:Option<&str>)->Result<Value,String>{
  let query=query.trim();
  if query.is_empty()||query.chars().count()>80{return Err("请输入 1–80 个字符的搜索词".into())}
  let tabs=match mode {"all"=>vec![10,13],"short_play"=>vec![10],"comic_series"|"ai_series"=>vec![13],_=>return Err("搜索分类无效".into())};
  let mut cache=self.cache.lock().map_err(|_|"搜索状态不可用")?;
  let now=Instant::now();
  cache.sessions.retain(|_,s|s.expires>now);cache.first.retain(|_,(expires,_)|*expires>now);cache.pages.retain(|_,(expires,_)|*expires>now);
  let key=(query.to_string(),mode.to_string());
  let mut state=if let Some(token)=cursor.filter(|c|!c.is_empty()){
   let s=cache.sessions.get(token).filter(|s|s.query==query&&s.mode==mode).ok_or("搜索会话已过期，请重新搜索")?;
   if let Some(result)=&s.replay{return Ok(result.clone())}s.clone()
  }else{
   if let Some((_,result))=cache.first.get(&key){return Ok(result.clone())}
   Session{query:query.into(),mode:mode.into(),tracks:tabs.into_iter().map(|tab|Track{tab,offset:0,search_id:String::new(),more:true}).collect(),seen:HashSet::new(),expires:now+TTL,replay:None}
  };
  if cache.sessions.len()>=256||cache.first.len()>=128{return Err("搜索会话较多，请稍后重试".into())}
  let mut rows=vec![];let mut warnings=vec![];
  // A failed tab keeps its continuation. Other successful categories can still
  // be displayed, with an explicit warning and a retryable next cursor.
  for track in state.tracks.iter_mut().filter(|t|t.more){
   let parsed=match self.fetch(query,track,&mut cache).and_then(|data|parse_page(&data,track.tab,track.offset)){
    Ok(page)=>page,Err(error)=>{warnings.push(format!("{}：{error}",if track.tab==10{"真人短剧"}else{"漫剧 / AI"}));continue}
   };
   let old_seen=state.seen.len();
   for row in parsed.rows {if state.seen.insert(row["series_id"].as_str().unwrap().to_string()){rows.push(row);}}
   if parsed.more&&state.seen.len()==old_seen{return Err("搜索结果未继续推进，请重新搜索".into())}
   track.offset=parsed.offset;track.search_id=parsed.search_id;track.more=parsed.more;
  }
  if rows.is_empty()&&!warnings.is_empty(){return Err(warnings.join("；"))}
  let more=state.tracks.iter().any(|t|t.more);
  let token=if more {Some(cursor_token()?)}else{None};
  let result=json!({"query":query,"results":rows,"has_more":more,"next_cursor":token,"source":"online","unique_results_seen":state.seen.len(),"warnings":warnings});
  if let Some(token)=token {state.expires=Instant::now()+TTL;cache.sessions.insert(token,state);}
  if let Some(token)=cursor.filter(|c|!c.is_empty()){if let Some(s)=cache.sessions.get_mut(token){s.replay=Some(result.clone());}}
  // A partial response must not hide a recovered AI/comic channel for ten minutes.
  else if cacheable(&result) {cache.first.insert(key,(Instant::now()+TTL,result.clone()));}
  Ok(result)
 }
 fn fetch(&self,query:&str,track:&Track,cache:&mut Cache)->Result<Value,String>{
  // All / AI / comic searches share tab 13. Keep a successfully validated
  // provider page across entry points, including a partially failed all search.
  let page_key=(query.to_string(),track.tab,track.offset,track.search_id.clone());
  if let Some((expires,data))=cache.pages.get(&page_key){if *expires>Instant::now(){return Ok(data.clone())}}
  for attempt in 0..2 {
   if let Some(last)=cache.last_request {std::thread::sleep(GAP.saturating_sub(last.elapsed()));}
   cache.last_request=Some(Instant::now());
   let response=self.client.post(ENDPOINT).query(&[("device_platform","android"),("aid","3040"),("manifest_version_code","628"),("update_version_code","62832")]).header("Accept","application/json").json(&request_body(query,track)).send().map_err(|_|"在线搜索连接超时或网络不可用，请重试")?;
   let status=response.status();
   if !status.is_success(){return Err(format!("在线搜索返回 HTTP {}，请稍后重试",status.as_u16()))}
   if response.content_length().is_some_and(|n|n>MAX_BYTES){return Err("搜索响应过大".into())}
   let mut bytes=Vec::new();response.take(MAX_BYTES+1).read_to_end(&mut bytes).map_err(|_|"搜索响应读取失败")?;
   if bytes.len() as u64>MAX_BYTES{return Err("搜索响应过大".into())}
   let payload:Value=serde_json::from_slice(&bytes).map_err(|_|"搜索返回格式异常，请稍后重试")?;
   let code=integer(&payload["code"]).ok_or("搜索返回缺少状态码")?;
   if code==0{
    let data=payload["data"].clone();parse_page(&data,track.tab,track.offset)?;
    if cache.pages.len()>=256{if let Some(oldest)=cache.pages.iter().min_by_key(|(_,v)|v.0).map(|(k,_)|k.clone()){cache.pages.remove(&oldest);}}
    cache.pages.insert(page_key,(Instant::now()+TTL,data.clone()));return Ok(data)
   }
   // The provider occasionally returns code 6000 (network error).
   // One delayed retry only; never refresh identities or retry access failures.
   if code==6000&&attempt==0 {std::thread::sleep(Duration::from_secs(4));continue}
   return Err(format!("在线搜索暂不可用（代码 {code}），请稍后重试"));
  }
  unreachable!()
 }
}
fn cursor_token()->Result<String,String>{let mut bytes=[0u8;24];getrandom::fill(&mut bytes).map_err(|_|"无法创建搜索会话")?;Ok(bytes.iter().map(|b|format!("{b:02x}")).collect())}
fn cacheable(result:&Value)->bool {result["warnings"].as_array().is_some_and(|w|w.is_empty())}
fn request_body(query:&str,track:&Track)->Value{json!({"limit":20,"offset":track.offset,"query":query,"search_ctx_info":"","search_entrance":json!({"type":1,"tab_type":39,"default_tab_type":10,"bottom_type":1,"search_tab_id":track.tab}).to_string(),"search_id":track.search_id,"sub_tab_type":31,"tab_type":track.tab})}
fn integer(v:&Value)->Option<u64>{v.as_u64().or_else(||v.as_str()?.parse().ok())}
fn text(v:&Value)->String{v.as_str().map(str::to_string).or_else(||v.as_u64().map(|n|n.to_string())).unwrap_or_default()}
struct Page {rows:Vec<Value>,more:bool,offset:u64,search_id:String}
fn parse_page(data:&Value,tab:u32,previous:u64)->Result<Page,String>{
 let more=match &data["has_more"] {Value::Bool(b)=>*b,Value::Number(n) if n.as_u64()==Some(0)=>false,Value::Number(n) if n.as_u64()==Some(1)=>true,_=>return Err("搜索响应缺少分页状态".into())};
 let cells=data["search_data"].as_array().ok_or("搜索响应缺少结果列表")?;
 if cells.len()>200{return Err("搜索页大小异常".into())}
 let offset=integer(&data["next_offset"]).unwrap_or(previous);
 let search_id=text(&data["search_id"]);
 if more&&(offset<=previous||search_id.is_empty()||search_id.len()>512){return Err("搜索游标没有推进，请重新搜索".into())}
 let mut rows=vec![];let mut seen=HashSet::new();
 for cell in cells {collect_books(cell,tab,0,&mut rows,&mut seen)?;}
 if more&&rows.is_empty(){return Err("搜索返回空分页，请稍后重试".into())}
 Ok(Page{rows,more,offset,search_id})
}
fn collect_books(value:&Value,tab:u32,depth:usize,rows:&mut Vec<Value>,seen:&mut HashSet<String>)->Result<(),String>{
 if depth>8{return Err("搜索结果层级异常".into())}
 if let Some(array)=value.as_array(){for item in array{collect_books(item,tab,depth+1,rows,seen)?;}return Ok(())}
 let Some(object)=value.as_object()else{return Ok(())};
 if let Some(title)=object.get("book_name").and_then(Value::as_str){
  let id=text(&value["book_id"]);let count=integer(&value["chapter_number"]).or_else(||integer(&value["serial_count"])).unwrap_or(0);
  if !(8..=24).contains(&id.len())||!id.bytes().all(|b|b.is_ascii_digit())||title.trim().is_empty()||title.chars().count()>200||count==0||count>10000{return Ok(())}
  if !seen.insert(id.clone()){return Ok(())}
  let genre=match text(&value["genre"]).as_str(){"203"=>"short_play","205"=>"comic_series",_=>if tab==10{"short_play"}else{"comic_series"}};
  rows.push(json!({"series_id":id,"title":title,"episode_cnt":count,"genre":genre,"genre_source":"search_tab","creator":text(&value["author"]),"category":text(&value["tags"]).split(',').filter(|s|!s.is_empty()).collect::<Vec<_>>().join(" / "),"cover":cover(&value["thumb_url"]),"intro":text(&value["abstract"]),"score":text(&value["score"]),"play_cnt":integer(&value["play_num"]).unwrap_or(0),"source":"online"}));
  return Ok(())
 }
 // Nested result groups contain books; do not traverse arbitrary schema strings.
 for key in ["books","book_data","data","items","search_data"]{if let Some(child)=object.get(key){collect_books(child,tab,depth+1,rows,seen)?;}}
 Ok(())
}
fn cover(value:&Value)->String{
 let Some(s)=value.as_str()else{return String::new()};let Ok(mut url)=reqwest::Url::parse(s)else{return String::new()};
 if !matches!(url.scheme(),"http"|"https")||!url.username().is_empty()||url.password().is_some(){return String::new()}
 if !url.host_str().is_some_and(|h|["byteimg.com","fqnovelpic.com","novelfmpic.com"].iter().any(|d|h==*d||h.ends_with(&format!(".{d}")))){return String::new()}
 let _=url.set_scheme("https");url.to_string()
}

#[cfg(test)]
mod tests {
 use super::*;
 fn data()->Value{json!({"has_more":true,"next_offset":20,"search_id":"test-session","search_data":[{"books":[{"book_id":"7629943873896188990","book_name":"聚宝仙盆第二季","chapter_number":"111","genre":"205","thumb_url":"http://p3-novel.byteimg.com/novel-pic/example.jpeg","tags":"玄幻,逆袭"}]}]})}
 #[test]fn parses_nested_video_preserving_large_ids(){let page=parse_page(&data(),13,0).unwrap();assert_eq!(page.rows[0]["series_id"],"7629943873896188990");assert_eq!(page.rows[0]["episode_cnt"],111);assert_eq!(page.rows[0]["cover"],"https://p3-novel.byteimg.com/novel-pic/example.jpeg");assert_eq!(page.rows[0]["category"],"玄幻 / 逆袭");}
 #[test]fn missing_or_stalled_pagination_is_an_error(){let mut d=data();d["next_offset"]=json!(0);assert!(parse_page(&d,13,0).is_err());d["has_more"]=Value::Null;assert!(parse_page(&d,13,0).is_err());d["has_more"]=json!(false);assert!(parse_page(&d,13,0).is_ok());}
 #[test]fn empty_more_is_not_end_of_search(){let mut d=data();d["search_data"]=json!([]);assert!(parse_page(&d,13,0).is_err());d["has_more"]=json!(false);assert!(parse_page(&d,13,0).unwrap().rows.is_empty());}
 #[test]fn continuation_uses_returned_offset_and_session(){let body=request_body("剧名",&Track{tab:13,offset:37,search_id:"returned-session".into(),more:true});assert_eq!(body["offset"],37);assert_eq!(body["search_id"],"returned-session");assert_eq!(body["tab_type"],13);assert_eq!(body["limit"],20);}
 #[test]fn rejects_query_boundaries_without_network(){let search=Search::new().unwrap();assert!(search.page(" ","all",None).is_err());assert!(search.page(&"字".repeat(81),"all",None).is_err());assert!(search.page("剧名","all",Some("unknown")).is_err());}
 #[test]fn rejects_untrusted_image_hosts(){assert!(cover(&json!("https://evil.test/a.jpg")).is_empty());assert!(cover(&json!("https://byteimg.com.evil.test/a.jpg")).is_empty());assert!(cover(&json!("file:///a.jpg")).is_empty());}
 #[test]fn partial_failure_is_never_cached_as_a_complete_first_page(){assert!(!cacheable(&json!({"warnings":["6000"]})));assert!(cacheable(&json!({"warnings":[]})));}
 #[test]fn successful_ai_channel_page_is_reused_across_search_entry_points(){
  let search=Search::new().unwrap();let mut cache=Cache::default();let track=Track{tab:13,offset:0,search_id:String::new(),more:true};
  cache.pages.insert(("持械入宋".into(),13,0,String::new()),(Instant::now()+TTL,data()));
  assert_eq!(search.fetch("持械入宋",&track,&mut cache).unwrap(),data());assert!(cache.last_request.is_none());
 }
}
