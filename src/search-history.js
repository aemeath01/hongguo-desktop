export const SEARCH_HISTORY_KEY='hongguo.searchHistory';
export const SEARCH_HISTORY_LIMIT=20;
export function cleanSearchTerm(value){return typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,80):'';}
export function sanitizeSearchHistory(value){
 const seen=new Set();
 return (Array.isArray(value)?value:[]).map(cleanSearchTerm).filter(term=>{
  const key=term.toLocaleLowerCase();if(!term||seen.has(key))return false;seen.add(key);return true;
 }).slice(0,SEARCH_HISTORY_LIMIT);
}
export function readSearchHistory(storage){
 try{return sanitizeSearchHistory(JSON.parse(storage.getItem(SEARCH_HISTORY_KEY)));}catch{return [];}
}
export function writeSearchHistory(storage,items){
 const history=sanitizeSearchHistory(items);
 try{storage.setItem(SEARCH_HISTORY_KEY,JSON.stringify(history));return {history,error:false};}catch{return {history,error:true};}
}
export function rememberSearch(storage,term){
 const cleaned=cleanSearchTerm(term);
 return writeSearchHistory(storage,[cleaned,...readSearchHistory(storage)]);
}
