const HORIZONTAL={ArrowLeft:-1,ArrowRight:1,a:-1,d:1};
export function createHoldController({getSpeed,setSpeed,seek,holdSpeed=2,seekSeconds=5,onHold=()=>{},schedule=setTimeout,cancel=clearTimeout}) {
  let active=null,timer=null,original=null,holding=false;
  function restore(){if(timer!==null)cancel(timer);timer=null;if(holding)setSpeed(original);active=null;holding=false;original=null;onHold(false);}
  return {
    down(key){key=key.length===1?key.toLowerCase():key;if(!(key in HORIZONTAL))return false;if(active!==null)return true;active=key;original=getSpeed();holding=false;timer=schedule(()=>{timer=null;holding=true;setSpeed(holdSpeed);onHold(true);},300);return true;},
    up(key){key=key.length===1?key.toLowerCase():key;if(key!==active)return false;const wasHolding=holding;restore();if(!wasHolding)seek(HORIZONTAL[key]*seekSeconds);return true;},
    cancel:restore,
  };
}
export function seasonQuery(title) {
  const text=String(title||'').trim().replace(/\s*[（(【\[]?(?:全集|完整版|合集|完结)[）)】\]]?\s*$/,'');
  return text.replace(/\s*[（(【\[]?(?:第?\s*[零〇一二三四五六七八九十百千万两\d]+\s*[季部篇卷]|(?:Season|S)\s*\d+)[）)】\]]?\s*$/i,'')
    .replace(/(?<=[\u3400-\u9fff])[2-9]$/,'').replace(/[\s·:：—-]+$/,'').trim()||String(title||'').trim();
}
export function seasonNumber(title) {
 const text=String(title||'').replace(/\s*[（(【\[]?(?:全集|完整版|合集|完结)[）)】\]]?\s*$/,'');
 const match=text.match(/(?:第?\s*([零〇一二三四五六七八九十百千万两\d]+)\s*[季部篇卷]|(?:Season|S)\s*(\d+))[）)】\]]?\s*$/i);
 const token=match?.[1]||match?.[2]||text.match(/(?<=[\u3400-\u9fff])([2-9])$/)?.[1];
 if(!token)return 1;
 if(/^\d+$/.test(token))return Number(token);
 const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9},units={十:10,百:100,千:1000,万:10000};
 let total=0,current=0;
 for(const char of token){if(char in digits)current=digits[char];else{total+=(current||1)*units[char];current=0;}}
 return total+current||1;
}
export const seasonKey=title=>seasonQuery(title).replace(/[\s，,。！!？?：:·、—-]/g,'').toLowerCase();
export const seasonGenre=genre=>['ai_series','comic_series'].includes(genre)?'animation':genre;
export const seasonFamily=drama=>`${seasonGenre(drama.genre)}:${seasonKey(drama.title)}`;
export const sortSeasons=items=>[...items].sort((a,b)=>seasonNumber(a.title)-seasonNumber(b.title)||a.title.localeCompare(b.title,'zh-CN',{numeric:true})||String(a.series_id).localeCompare(String(b.series_id)));
export function seekPlan(target,origin,available,fullDuration) {
 const position=Math.max(0,Math.min(target,Math.max(0,fullDuration-0.2)));
 return {position,reload:position<origin||position>=origin+Math.max(0,available-2),offset:Math.max(0,position-origin)};
}
export function seasonCandidates(items,current) {
 const query=seasonKey(current.title);
 const seen=new Set([String(current.series_id)]);
 return sortSeasons(items.filter(d=>{const id=String(d.series_id||'');if(!id||seen.has(id)||!query)return false;seen.add(id);return seasonKey(d.title)===query&&(!d.genre||!current.genre||seasonGenre(d.genre)===seasonGenre(current.genre));}));
}
export const formatTime=(time=0)=>{const n=Math.max(0,Math.floor(Number(time)||0));return n>=3600?`${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
