/* Ventura presentation only: no storage migrations or inferred ownership. */
window.TVLandDetails = (() => {
  let artworkKey = '';
  const safeImage = value => {
    if (typeof value === 'string' && /^\/[A-Za-z0-9][^\s]*$/.test(value)) return 'https://image.tmdb.org/t/p/w1280' + value;
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
  };
  function hero(detail, poster, kind, parent) {
    document.body.classList.add('cinematic');
    const card = document.querySelector('main > section');
    card.classList.add('cinematic-hero');
    let art = card.querySelector('.detail-art');
    if (!art) { art = document.createElement('div'); art.className = 'detail-art'; art.setAttribute('aria-hidden', 'true'); card.prepend(art); }
    const sources = [...new Set([detail.backdrop, detail.tmdb?.backdrop, detail.metadata?.backdrop, detail.tmdb?.backdrop_path, poster].map(safeImage).filter(Boolean))];
    const key = JSON.stringify(sources);
    if (key !== artworkKey) {
      artworkKey = key; art.replaceChildren();
      const next = () => { const url = sources.shift(); if (!url) return; const image = new Image(); image.alt = ''; image.onerror = () => { image.remove(); next(); }; image.src = url; art.replaceChildren(image); };
      next();
    }
    let eyebrow = card.querySelector('.detail-eyebrow');
    if (!eyebrow) { eyebrow = document.createElement('p'); eyebrow.className = 'detail-eyebrow'; document.getElementById('title').before(eyebrow); }
    eyebrow.textContent = kind;
    if (parent) {
      let relation = document.getElementById('collectionRelationship');
      if (!relation) { relation = document.createElement('a'); relation.id = 'collectionRelationship'; document.getElementById('meta').after(relation); }
      relation.textContent = 'Part of ' + parent.title;
      relation.href = './movie.html?id=' + encodeURIComponent(parent.id);
    }
  }
  function statuses(show) {
    let root = document.getElementById('seriesStatuses');
    if (!root) { root = document.createElement('div'); root.id = 'seriesStatuses'; root.className = 'series-statuses'; document.getElementById('meta').after(root); }
    root.replaceChildren();
    for (const [field, label] of [['owned','Owned'],['ripped','Ripped'],['added','In Jellyfin']]) {
      const badge = document.createElement('span'); badge.textContent = label + (show[field] ? ' ✓' : ' —'); root.append(badge);
    }
    root.setAttribute('aria-label', 'Saved series-level statuses; episode tracking is separate');
  }
  function flag(key, target, field, value, seasonId, showId) {
    // Read the latest saved tree so a checkbox cannot discard another tab's records.
    if (target.id == null) throw new Error('Saved identity unavailable');
    const latest = JSON.parse(localStorage.getItem(key));
    const record = seasonId ? latest?.showDetails?.[String(showId)]?.episodes?.[String(seasonId)]?.find(x => String(x.id) === String(target.id)) : [...(latest?.items || []), ...(latest?.collectionChildren || [])].find(x => String(x.id) === String(target.id));
    if (!record) throw new Error('Saved record unavailable');
    record[field] = value;
    localStorage.setItem(key, JSON.stringify(latest));
    return latest;
  }
  return {hero, statuses, flag};
})();
