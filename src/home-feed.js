export const GENRES = ['short_play', 'comic_series', 'ai_series'];
export const GENRE_LABELS = {short_play:'短剧', comic_series:'漫剧', ai_series:'AI 剧'};

export function uniqueDramas(items) {
  const seen = new Set();
  return items.filter(d => {
    const id = String(d?.series_id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// Preserve each category's own ordering, so one large category cannot fill the rail.
export function mixGenres(items, limit = 15) {
  const unique = uniqueDramas(items);
  const queues = GENRES.map(genre => unique.filter(d => d.genre === genre));
  const mixed = [];
  for (let i = 0; mixed.length < Math.min(limit, unique.length); i++) {
    let added = false;
    for (const queue of queues) {
      if (queue[i] && mixed.length < limit) { mixed.push(queue[i]); added = true; }
    }
    if (!added) break;
  }
  return mixed;
}

const tags = drama => [...new Set((drama?.category || '').split(/\s*[/·,，]\s*/).filter(Boolean))];
export function personalPicks(catalog, favorites, history, now = Date.now()) {
  const byId = new Map(catalog.map(d => [String(d.series_id), d]));
  history.forEach(h => { if (h.drama && !byId.has(String(h.id))) byId.set(String(h.id), h.drama); });
  const known = new Set([...favorites, ...history.map(h => h.id)].map(String));
  const weights = new Map(), genres = new Map();
  function learn(drama, weight) {
    if (!drama) return;
    for (const tag of tags(drama)) weights.set(tag, (weights.get(tag) || 0) + weight);
    genres.set(drama.genre, (genres.get(drama.genre) || 0) + weight);
  }
  favorites.forEach(id => learn(byId.get(String(id)), 4));
  history.forEach(h => {
    const days = Math.max(0, (now - (Number(h.opened) || now)) / 86400000);
    learn(byId.get(String(h.id)), 2 / (1 + days / 14));
  });
  const ranked = uniqueDramas(catalog).filter(d => !known.has(String(d.series_id))).map(drama => {
    const matched = tags(drama).filter(tag => weights.has(tag)).sort((a,b) => weights.get(b) - weights.get(a));
    const score = matched.reduce((n,tag) => n + weights.get(tag), 0) + (genres.get(drama.genre) || 0) * .15;
    return {drama, score, reason:matched[0] ? `你常看的${matched[0]}` : '发现另一种故事'};
  }).filter(d => d.score > 0).sort((a,b) => b.score - a.score || Number(b.drama.play_cnt) - Number(a.drama.play_cnt));
  return {items:ranked.slice(0,15).map(x => x.drama), reasons:Object.fromEntries(ranked.map(x => [x.drama.series_id,x.reason])), hasTaste:weights.size > 0};
}
