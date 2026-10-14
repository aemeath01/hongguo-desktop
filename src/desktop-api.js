import { invoke, isTauri } from '@tauri-apps/api/core';
export const desktop = isTauri();
export async function native(command,args={}) {
  if(!desktop)throw new Error('请打开桌面客户端使用此功能');
  try{return await invoke(command,args);}catch(e){throw new Error(typeof e==='string'?e:e?.message||'操作未完成，请重试');}
}
export const api=(path,query={})=>native('api_request',{path,query:Object.fromEntries(Object.entries(query).map(([k,v])=>[k,String(v)]))});
export function normalizeDrama(d,genre='short_play') {
  return {...d,series_id:String(d.series_id??d.book_id??d.id??''),title:d.title||d.book_name||'未命名剧集',category:Array.isArray(d.category)?d.category.join(' / '):(d.category||'短剧'),genre:d.genre||genre,cover:d.cover||d.thumb_url||'',intro:d.intro||'',score:d.score||'',episode_cnt:Number(d.episode_cnt||d.serial_count||1),play_cnt:Number(d.play_cnt||0)};
}
export function resultItems(data,fallbackGenre='short_play'){return (Array.isArray(data)?data:data.results||data.items||data.data?.results||[]).map(d=>normalizeDrama(d,data.genre||fallbackGenre));}
