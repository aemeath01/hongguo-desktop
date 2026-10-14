// Each continuation is supplied by the service; never guess offsets or stop
// just because a page contains duplicates. A failed page keeps its retry cursor.
export const mergeSearchItems=(...lists)=>[...new Map(lists.flat().map(d=>[String(d.series_id),d])).values()];
// Novelfm's 205 channel contains both AI and animated productions. Keep a
// known catalog classification without discarding any newly found online ID.
export function preserveSearchGenres(items,catalog) {
 const known=new Map(catalog.map(d=>[String(d.series_id),d]));
 return items.map(d=>{const previous=known.get(String(d.series_id));return d.genre_source==='search_tab'&&['comic_series','ai_series'].includes(previous?.genre)?{...d,genre:previous.genre}:d;});
}
export async function fetchSearchPages({request,query,genre='all',initial={},maxPages=1,isCurrent=()=>true,onPage=()=>{}}){
 let progress={items:initial.items||[],cursor:initial.cursor||null,hasMore:true,pages:initial.pages||0};
 const seenCursors=new Set();
 for(let i=0;i<maxPages;i++){
  if(!isCurrent())return null;
  const data=await request({q:query,genre,...(progress.cursor?{cursor:progress.cursor}:{})});
  if(!isCurrent())return null;
  if(!Array.isArray(data.results)||typeof data.has_more!=='boolean'||(data.has_more&&(!data.next_cursor||data.next_cursor===progress.cursor||seenCursors.has(data.next_cursor))))throw new Error('在线搜索分页异常，请重新搜索');
  seenCursors.add(data.next_cursor);
  progress={items:mergeSearchItems(progress.items,data.results),cursor:data.next_cursor||null,hasMore:data.has_more,pages:progress.pages+1,warning:(data.warnings||[]).join('；')};
  onPage(progress);
  if(!progress.hasMore||progress.warning)break;
 }
 return progress;
}
