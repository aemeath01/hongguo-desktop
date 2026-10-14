// Keep one intent through a trackpad gesture, including its momentum tail.
export function createWheelIntent(idle=180) {
  let last=-Infinity,axis=null,target=null;
  return (x,y,time,rail)=>{
    if(time-last>idle){axis=null;target=null;}
    last=time;
    if(!axis&&(x||y)){axis=Math.abs(x)>Math.abs(y)?'x':'y';target=rail;}
    return {axis,target};
  };
}
export function dragAxis(x,y,threshold=7) {
  if(Math.max(Math.abs(x),Math.abs(y))<threshold)return null;
  return Math.abs(x)>Math.abs(y)?'x':'y';
}
export function installAxisScroll(root,mode) {
  const intent=createWheelIntent();
  const doc=root.ownerDocument,view=doc.defaultView;
  const scrollY=(origin,delta)=>{
    let el=origin instanceof view.Element?origin:root;
    while(el&&el!==doc.body){
      if(/^(auto|scroll)$/.test(view.getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight){el.scrollTop+=delta;return;}
      el=el.parentElement;
    }
    doc.scrollingElement.scrollTop+=delta;
  };
  const wheel=e=>{
    if(e.ctrlKey||e.defaultPrevented)return; // Preserve browser pinch zoom.
    let x=e.deltaX,y=e.deltaY;
    if(e.shiftKey&&!x){x=y;y=0;}
    const unit=e.deltaMode===1?16:e.deltaMode===2?view.innerHeight:1;
    const rail=mode==='rails'?e.target.closest?.('.title-track'):null;
    const {axis,target}=intent(x,y,e.timeStamp,rail);
    if(!axis)return;
    e.preventDefault();
    doc.dispatchEvent(new view.Event('rail-scroll-interrupt'));
    if(mode!=='rails')scrollY(e.target,y*unit);
    else if(axis==='x'){if(target?.isConnected)target.scrollLeft+=x*unit;}
    else scrollY(e.target,y*unit);
  };
  root.addEventListener('wheel',wheel,{passive:false});
  return ()=>root.removeEventListener('wheel',wheel);
}
