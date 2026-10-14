#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct VideoRect {pub x:i32,pub y:i32,pub width:i32,pub height:i32,pub visible:bool}
impl VideoRect {
 pub fn from_logical(x:f64,y:f64,width:f64,height:f64,scale:f64,client_width:i32,client_height:i32,visible:bool)->Self{
  let hidden=Self{x:0,y:0,width:0,height:0,visible:false};
  if !visible||![x,y,width,height,scale].iter().all(|v|v.is_finite())||width<=0.0||height<=0.0||scale<=0.0{return hidden}
  let edge=|value:f64,bound:i32|(value*scale).round().max(0.0).min(bound.max(0) as f64) as i32;
  let left=edge(x,client_width);let top=edge(y,client_height);
  let right=edge(x+width,client_width);let bottom=edge(y+height,client_height);
  if right<=left||bottom<=top{return hidden}
  Self{x:left,y:top,width:right-left,height:bottom-top,visible:true}
 }
}

#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn shared_edges_round_once_at_fractional_dpi(){
  let r=VideoRect::from_logical(0.4,64.4,800.4,600.4,1.25,1800,1200,true);
  assert_eq!(r.x+r.width,1001);assert_eq!(r.y+r.height,831);
 }
 #[test]fn stale_resize_cannot_escape_client_area(){
  let r=VideoRect::from_logical(-4.0,64.0,2000.0,1500.0,1.5,1320,860,true);
  assert_eq!(r,VideoRect{x:0,y:96,width:1320,height:764,visible:true});
 }
 #[test]fn invalid_or_hidden_surfaces_never_show(){
  for width in [0.0,-1.0,f64::NAN,f64::INFINITY]{assert!(!VideoRect::from_logical(0.0,0.0,width,500.0,1.0,800,600,true).visible);}
  assert!(!VideoRect::from_logical(0.0,0.0,800.0,500.0,1.0,800,600,false).visible);
 }
}
