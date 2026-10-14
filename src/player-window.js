// Native window changes must finish before another mode change can begin.
// Holding F or double-clicking a control must not race two fullscreen requests.
export function createWindowTransition() {
  let pending=null,generation=0;
  return {
    get busy(){return pending!==null;},
    get generation(){return generation;},
    get settled(){return pending??Promise.resolve();},
    run(operation){
      if(pending)return pending;
      generation++;
      pending=Promise.resolve().then(operation).finally(()=>{pending=null;});
      return pending;
    },
  };
}

// Coalesce resize notifications and serialize IPC. A late response must never
// resurrect an obsolete rectangle (especially after leaving the player).
export function createVideoSurfaceSync(send,onError=()=>{}) {
  const hidden={x:0,y:0,width:0,height:0,visible:false};
  let pending=null,active=false,last=null,closed=false;
  const equal=(a,b)=>a&&b&&Object.keys(hidden).every(k=>a[k]===b[k]);
  async function drain(){
    if(active)return;
    active=true;
    while(pending){
      const next=pending;pending=null;
      if(equal(next,last))continue;
      try{await send(next);last=next;}catch(error){last=null;onError(error);}
    }
    active=false;
  }
  return {
    update(rect){if(closed)return;pending=rect.visible?rect:hidden;void drain();},
    dispose(){closed=true;pending=hidden;void drain();},
  };
}
