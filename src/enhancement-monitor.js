// Observe wall-clock progress independently of mpv's drop counter. A blocked
// VapourSynth graph can freeze without producing dropped-frame notifications.
export function createEnhancementMonitor(){
 let baseline=null,bad=0,last=null;
 return {reset(){baseline=null;bad=0;last=null;},sample(now,p){
  const position=Number(p['time-pos']);
  if(p.pause||p['paused-for-cache']||p.seeking||!Number.isFinite(position)){baseline=null;bad=0;last=null;return false;}
  if(last!==null&&(position<last-.5||position-last>3*Math.max(1,Number(p.speed)||1))){baseline=null;bad=0;}
  last=position;
  if(!baseline){baseline={now,position};return false;}
  const elapsed=(now-baseline.now)/1000;if(elapsed<3)return false;
  const ratio=(position-baseline.position)/elapsed/Math.max(.25,Number(p.speed)||1);
  bad=(ratio<.65||Math.abs(Number(p.avsync)||0)>1.5)?bad+1:0;
  baseline={now,position};return bad>=2;
 }};
}
