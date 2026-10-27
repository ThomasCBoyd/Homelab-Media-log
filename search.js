/* Local-only autocomplete. The page owns filtering, navigation and collection data. */
(function (root) {
  'use strict';
  const normalize = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function suggestions(data, query) {
    const needle = normalize(query);
    if (!needle) return [];
    const results = [];
    const channels = new Map(data.channels.map(channel => [String(channel.id), channel]));
    const parents = new Map(data.items.map(item => [String(item.id), item]));
    const collectionIds = new Set((data.collectionChildren || []).map(item => String(item.parentId)));
    const channelLabel = channel => channel ? `${channel.name} ${channel.num}` : 'Unassigned channel';
    for (const channel of data.channels) results.push({title: channel.name, category: `Channel · ${channel.num}`, channel,
      search: `${channel.name} ${channel.num}`});
    for (const item of data.items) {
      if (!['show', 'movie'].includes(item.type)) continue;
      const channel = channels.get(String(item.channel));
      const category = item.type === 'show' ? `TV Show · ${channelLabel(channel)}`
        : collectionIds.has(String(item.id)) || /\b(collection|box\s*set)\b/i.test(item.title) ? 'Collection' : 'Movie';
      results.push({title: item.title, category, item, kind: item.type, search: item.title});
    }
    for (const item of data.collectionChildren || []) {
      const parent = parents.get(String(item.parentId));
      if (!parent || !['show', 'movie'].includes(parent.type)) continue;
      const season = parent.type === 'show';
      results.push({title: item.title, category: season ? `Season · ${parent.title}` : `Movie · ${parent.title}`,
        item, parent, kind: season ? 'season' : 'movie', search: `${item.title} ${parent.title}`});
    }
    return results.filter(result => normalize(result.search).includes(needle))
      .map((result, index) => ({result, index, rank: normalize(result.title) === needle ? 0 : normalize(result.title).startsWith(needle) ? 1 : 2}))
      .sort((a, b) => a.rank - b.rank || a.index - b.index).slice(0, 8).map(match => match.result);
  }
  function attach({input, clear, list, status, container, getData, changed, selected}) {
    let matches = [], active = -1;
    function close() {
      list.hidden = true; input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant'); active = -1;
      for (const option of list.children) option.setAttribute('aria-selected', 'false');
      status.textContent = '';
    }
    function highlight(index) {
      active = index;
      [...list.children].forEach((option, n) => option.setAttribute('aria-selected', String(n === active)));
      if (active >= 0) {
        const option = list.children[active];
        input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({block: 'nearest'});
      } else input.removeAttribute('aria-activedescendant');
    }
    function choose(index) {
      const result = matches[index];
      if (!result) return;
      close(); input.blur(); selected(result);
    }
    function update(open = true) {
      clear.hidden = !input.value.length;
      matches = suggestions(getData(), input.value); active = -1;
      list.replaceChildren(); input.removeAttribute('aria-activedescendant');
      for (const [index, result] of matches.entries()) {
        const option = document.createElement('li');
        option.id = `search-option-${index}`; option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        const title = document.createElement('span'), category = document.createElement('span');
        title.className = 'search-title'; title.textContent = result.title;
        category.className = 'search-category'; category.textContent = result.category;
        option.append(title, category);
        // Preserve input focus for mouse selection; touch clicks remain native for scrolling.
        option.addEventListener('mousedown', event => event.preventDefault());
        option.addEventListener('click', () => choose(index));
        list.append(option);
      }
      const visible = open && input.value.trim() && matches.length > 0;
      list.hidden = !visible; input.setAttribute('aria-expanded', String(!!visible));
      status.textContent = open && input.value.trim() ? `${matches.length} suggestions. Use up and down arrows to choose, then Enter. Full search results are below.` : '';
    }
    input.addEventListener('input', () => { changed(); update(); });
    input.addEventListener('focus', () => update());
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); if (list.hidden) update();
        if (matches.length) highlight((active + (event.key === 'ArrowDown' ? 1 : active < 0 ? 0 : -1) + matches.length) % matches.length);
      } else if (event.key === 'Enter' && !list.hidden && active >= 0) { event.preventDefault(); choose(active); }
      else if (event.key === 'Tab') close();
    });
    function reset() { input.value = ''; close(); clear.hidden = true; changed(); }
    clear.addEventListener('click', () => { reset(); input.focus(); });
    document.addEventListener('pointerdown', event => { if (!container.contains(event.target)) close(); });
    document.addEventListener('focusin', event => { if (!container.contains(event.target)) close(); });
    root.addEventListener('pageshow', () => update(false));
    update(false);
    return {close, reset, update};
  }
  root.ClassicSearch = {suggestions, attach};
  if (typeof module !== 'undefined') module.exports = root.ClassicSearch;
})(typeof window === 'undefined' ? globalThis : window);
