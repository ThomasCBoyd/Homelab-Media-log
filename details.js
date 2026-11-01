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
    collectionButton(card, kind);
    if (parent) {
      let relation = document.getElementById('collectionRelationship');
      if (!relation) { relation = document.createElement('a'); relation.id = 'collectionRelationship'; document.getElementById('meta').after(relation); }
      relation.textContent = 'Part of ' + parent.title;
      relation.href = './movie.html?id=' + encodeURIComponent(parent.id);
    }
  }
  function collectionButton(card, kind) {
    if (card.querySelector('#addToCollection')) return;
    const button = document.createElement('button');
    button.id = 'addToCollection'; button.type = 'button'; button.textContent = '+ Add to Collection';
    card.append(button);
    button.onclick = () => {
      const key = 'comcast-collection-v1', id = new URLSearchParams(location.search).get('id');
      let data;
      try { data = JSON.parse(localStorage.getItem(key)); } catch { alert('Could not read your collection.'); return; }
      const type = kind === 'Movie' ? 'movie' : 'show';
      const record = (data?.items || []).find(x => String(x.id) === id && x.type === type);
      const child = type === 'movie' && (data?.collectionChildren || []).find(x => String(x.id) === id && (data.items || []).some(p => p.type === 'movie' && String(p.id) === String(x.parentId)));
      if (!record && !child) { alert('This title could not be found.'); return; }
      const member = (child ? 'child:' : 'item:') + id;
      const groups = (data.customCollections || []).filter(x => x.type === type);
      if (!groups.length) { alert('Create a ' + (type === 'movie' ? 'movie' : 'TV') + ' collection first.'); return; }
      const dialog = document.createElement('dialog');
      const heading = document.createElement('h2'); heading.textContent = 'Add to Collection'; dialog.append(heading);
      for (const group of groups) {
        const label = document.createElement('label'), box = document.createElement('input');
        box.type = 'checkbox'; box.value = group.id; box.checked = (group.members || []).includes(member);
        label.style.display = 'block'; label.append(box, document.createTextNode(' ' + group.name)); dialog.append(label);
      }
      const save = document.createElement('button'); save.textContent = 'Save';
      const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.onclick = () => dialog.close();
      save.onclick = () => {
        try {
          const latest = JSON.parse(localStorage.getItem(key));
          const exists = child ? (latest.collectionChildren || []).some(x => String(x.id) === id) : (latest.items || []).some(x => String(x.id) === id && x.type === type);
          if (!exists) throw Error();
          for (const box of dialog.querySelectorAll('input')) {
            const group = (latest.customCollections || []).find(x => String(x.id) === box.value && x.type === type);
            if (!group) continue;
            group.members = (group.members || []).filter(x => x !== member);
            if (box.checked) group.members.push(member);
          }
          localStorage.setItem(key, JSON.stringify(latest)); dialog.close();
        } catch { alert('Could not save your selection.'); }
      };
      dialog.append(save, cancel); document.body.append(dialog); dialog.onclose = () => dialog.remove(); dialog.showModal();
    };
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
