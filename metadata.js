/* Classic Comcast's shared Worker client. No TMDB key belongs in the browser. */
(function (root) {
  'use strict';
  const API = 'https://posters.thomasboydspam.workers.dev';
  const DAY = 86400000;
  const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const year = value => String(value || '').match(/\b(?:18|19|20|21)\d{2}\b/)?.[0] || '';
  function titleParts(title) {
    const match = String(title).match(/\s*[([]((?:18|19|20|21)\d{2})[)\]]\s*$/);
    return {title: match ? title.slice(0, match.index).trim() : title.trim(), year: match?.[1] || ''};
  }
  function recordId(record) {
    const value = Number(record?.id ?? record?.tmdbId ?? record?.tmdb_id);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  const names = record => [record.title, record.name, record.original_title, record.original_name,
    ...(Array.isArray(record.alternative_titles) ? record.alternative_titles.map(x => typeof x === 'string' ? x : x.title) : [])].filter(Boolean);
  const recordYear = record => year(record.year || record.release_date || record.firstAirDate || record.first_air_date);
  function candidates(results, query, wantedYear, aliases = []) {
    const titles = [query, ...aliases].map(normalize);
    return [...new Map(results.filter(record => recordId(record)).map(record => [recordId(record), record])).values()]
      .map(record => {
        const exact = names(record).some(name => titles.includes(normalize(name)));
        const date = recordYear(record);
        return {record, exact, score: (exact ? 100 : 0) + (wantedYear && date === wantedYear ? 20 : 0)
          - (wantedYear && date && date !== wantedYear ? 100 : 0)};
      }).sort((a, b) => b.score - a.score);
  }
  function confident(ranked) {
    return ranked[0]?.score >= 100 && (ranked.length === 1 || ranked[0].score > ranked[1].score);
  }
  function fields(info) {
    const genres = Array.isArray(info.genres) ? info.genres.map(g => typeof g === 'string' ? g : g.name).filter(Boolean).join(', ') : '';
    const minutes = info.runtime || info.episode_run_time?.[0];
    const rawPoster = info.poster || info.poster_path || '';
    return {description: info.overview || info.description || '', year: recordYear(info), genres,
      runtime: typeof minutes === 'number' && minutes > 0 ? minutes + ' minutes' : '',
      poster: rawPoster.startsWith('https://') ? rawPoster : rawPoster.startsWith('/') ? 'https://image.tmdb.org/t/p/w500' + rawPoster : ''};
  }
  class ServiceError extends Error {
    constructor(message, status = 0, retryAfter = 0) { super(message); this.status = status; this.retryAfter = retryAfter; }
  }
  async function request(path, params, fetcher = root.fetch.bind(root)) {
    const url = new URL(API + path);
    Object.entries(params).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetcher(url.toString(), {signal: controller.signal});
      const retryHeader = response.headers.get('Retry-After');
      const retryAfter = Number(retryHeader) * 1000 || Math.max(0, Date.parse(retryHeader) - Date.now()) || 0;
      if (!response.ok) throw new ServiceError('Metadata service returned HTTP ' + response.status, response.status, retryAfter);
      let body;
      try { body = await response.json(); } catch { throw new ServiceError('Metadata service returned invalid JSON'); }
      if (!body || typeof body !== 'object' || body.error) throw new ServiceError(body?.error || 'Invalid metadata response');
      return body;
    } finally { clearTimeout(timeout); }
  }
  async function discover(query, fetcher = root.fetch.bind(root)) {
    const term = String(query || '').trim();
    if (term.length < 2) return [];
    const lookups = await Promise.allSettled([
      request('/movie/search', {query: term}, fetcher),
      request('/tv/search', {title: term}, fetcher)
    ]);
    const output = [];
    for (const [index, result] of lookups.entries()) {
      if (result.status !== 'fulfilled' || !Array.isArray(result.value.results)) continue;
      const kind = index === 0 ? 'movie' : 'show';
      for (const record of result.value.results) {
        const id = recordId(record), title = record.title || record.name || record.original_title || record.original_name;
        if (!id || !title) continue;
        const meta = fields(record);
        const releaseYear = recordYear(record);
        output.push({id, kind, title: String(title), year: releaseYear,
          category: (kind === 'show' ? 'TV series' : 'Movie') + (releaseYear ? ' · ' + releaseYear : ''),
          overview: meta.description,
          poster: meta.poster, originalTitle: record.original_title || record.original_name || ''});
      }
    }
    return output;
  }
  function create(adapter, options = {}) {
    const now = options.now || Date.now;
    const fetcher = options.fetch || root.fetch.bind(root);
    const ask = options.prompt || (message => root.prompt(message));
    let running = false, rescan = false, timer, stopped = false;
    const active = new Map();
    function kind(target) {
      if (target.type === 'show') return 'tv';
      const parent = adapter.getData().items.find(x => String(x.id) === String(target.parentId));
      return parent?.type === 'show' ? null : 'movie';
    }
    function folder(target) {
      return kind(target) === 'movie' && !target.parentId &&
        (adapter.getData().collectionChildren.some(x => String(x.parentId) === String(target.id)) || /\b(collection|box\s*set|film\s*set)\b/i.test(target.title));
    }
    function detail(target) {
      const data = adapter.getData(), bucket = kind(target) === 'tv' ? 'showDetails' : 'movieDetails';
      data[bucket] ||= {};
      return data[bucket][String(target.id)] ||= {};
    }
    function targets() {
      const data = adapter.getData();
      return [...data.items.filter(x => ['movie', 'show'].includes(x.type)),
        ...data.collectionChildren.filter(x => data.items.some(p => p.type === 'movie' && String(p.id) === String(x.parentId)))];
    }
    function identity(target) {
      const parts = titleParts(target.title), d = detail(target);
      return [kind(target), normalize(parts.title), parts.year || year(d.year || target.year), ...(d.metadataAliases || []).map(normalize)].join('|');
    }
    // Merge another tab's persisted changes before accepting a late network response.
    // Keep object identities used by the page's controls and open detail views.
    function reconcile(current, incoming) {
      if (Array.isArray(incoming)) {
        const old = Array.isArray(current) ? current : [];
        const next = incoming.map((value, index) => {
          const prior = value && typeof value === 'object' && value.id != null
            ? old.find(x => x && String(x.id) === String(value.id)) : old[index];
          return reconcile(prior, value);
        });
        old.splice(0, old.length, ...next);
        return old;
      }
      if (incoming && typeof incoming === 'object') {
        const object = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
        for (const key of Object.keys(object)) if (!(key in incoming)) delete object[key];
        for (const [key, value] of Object.entries(incoming)) object[key] = reconcile(object[key], value);
        return object;
      }
      return incoming;
    }
    function sync() {
      if (options.storage === false) return;
      try {
        const latest = JSON.parse(root.localStorage.getItem('comcast-collection-v1'));
        if (latest && Array.isArray(latest.items) && Array.isArray(latest.channels)) reconcile(adapter.getData(), latest);
        const posters = JSON.parse(root.localStorage.getItem('comcast-posters-v1'));
        if (posters && !Array.isArray(posters) && typeof posters === 'object') reconcile(adapter.getPosters(), posters);
      } catch { /* unavailable storage is reported by the page's save path */ }
    }
    const storageChanged = event => {
      if (adapter.getData() && ['comcast-collection-v1', 'comcast-posters-v1', 'comcast-manual-posters-v1'].includes(event.key)) { sync(); adapter.changed?.(); }
    };
    root.addEventListener?.('storage', storageChanged);
    function exists(target, original) {
      sync();
      return targets().some(x => x === target) && identity(target) === original;
    }
    function persist() { adapter.save(); adapter.changed?.(); }
    function report(message) { adapter.status?.(message); }
    function merge(target, info, state) {
      const d = detail(target), manual = new Set(d.manualFields || []), values = fields(info);
      // Preserve populated legacy fields too: their provenance may be manual.
      for (const name of ['description', 'year', 'genres', 'runtime']) {
        if (!manual.has(name) && !d[name] && values[name]) d[name] = values[name];
      }
      const posters = adapter.getPosters();
      const saved = posters[String(target.id)] || d.poster || d.tmdb?.poster || d.metadata?.poster;
      if (!saved && values.poster && !d.manualPoster) {
        let manualPosters = [];
        try { manualPosters = JSON.parse(localStorage.getItem('comcast-manual-posters-v1') || '[]'); } catch {}
        if (!manualPosters.map(String).includes(String(target.id))) posters[String(target.id)] = values.poster;
      }
      // TMDB is a separate source record, never a replacement for user-owned fields.
      d.tmdb = {...(d.tmdb || {}), ...info, id: state.id};
      d.tmdbId = state.id;
      state.status = 'ok'; state.attempts = 0; state.nextAttempt = now() + 30 * DAY;
      d.metadataLookup = {...state, identity: identity(target), updatedAt: now()};
      persist();
    }
    function fail(target, original, state, status, message, retryAfter = 0) {
      if (!exists(target, original)) return;
      const attempts = (state.attempts || 0) + 1;
      const delay = status === 'temporary' ? Math.max(retryAfter, Math.min(6 * 3600000, 30000 * 2 ** Math.min(attempts - 1, 10))) : 30 * DAY;
      detail(target).metadataLookup = {...state, identity: original, status, message, attempts, nextAttempt: now() + delay};
      persist();
      return status;
    }
    async function perform(target, config) {
      const type = kind(target);
      if (!type || folder(target)) return 'folder';
      const d = detail(target), original = identity(target);
      let state = d.metadataLookup?.identity === original ? {...d.metadataLookup} : {identity: original};
      if (!config.interactive && state.nextAttempt > now() && !(config.refresh && state.status === 'ok')) return state.status;
      const parts = titleParts(target.title), wantedYear = parts.year || year(d.year || target.year);
      const aliases = d.metadataAliases || [];
      let selected;
      try {
        if (state.id) selected = {id: state.id};
        if (!selected) {
          const legacy = recordId(d.tmdb) || recordId({id: d.tmdbId});
          if (legacy && !state.status) {
            const info = await request('/' + type + '/details', {id: legacy}, fetcher);
            if (recordId(info) === legacy && confident(candidates([info], parts.title, wantedYear, aliases))) selected = info;
          }
        }
        if (!selected) {
          let results = [];
          for (const query of [...new Set([parts.title, ...aliases])]) {
            const body = await request('/' + type + '/search', type === 'tv' ? {title: query} : {query}, fetcher);
            if (!Array.isArray(body.results)) throw new ServiceError('Unexpected search response format');
            results.push(...body.results);
          }
          const ranked = candidates(results, parts.title, wantedYear, aliases);
          if (confident(ranked)) selected = ranked[0].record;
          else if (config.interactive && ranked.length) {
            selected = await chooseMatch(type, ranked);
            if (!selected) return 'cancelled';
          } else return fail(target, original, state, ranked.length ? 'ambiguous' : 'unavailable', ranked.length ? 'Choose a match on the detail page, or add a release year / alternate title.' : 'No matching title is available.');
        }
        const id = recordId(selected);
        const info = await request('/' + type + '/details', {id}, fetcher);
        if (recordId(info) !== id || !names(info).length) throw new ServiceError('Invalid detail response or mismatched TMDB ID');
        if (!exists(target, original)) return 'changed';
        state.id = id;
        merge(target, info, state);
        return 'ok';
      } catch (error) {
        const permanent = error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
        return fail(target, original, state, permanent ? 'unavailable' : 'temporary', error.message, error.retryAfter);
      }
    }
    function chooseMatch(type, ranked) {
      const choices = ranked.slice(0, 10);
      // Keep the injectable prompt for non-browser consumers and automated tests.
      if (!root.document || options.prompt) {
        const labels = choices.map((x, i) => `${i + 1}. ${names(x.record)[0]} (${recordYear(x.record) || 'year unknown'}) — TMDB ${recordId(x.record)}`).join('\n');
        const answer = ask('Choose the correct ' + (type === 'tv' ? 'TV show' : 'movie') + ':\n' + labels + '\nCancel to preserve existing metadata.');
        const n = Number(answer);
        return Promise.resolve(answer !== null && Number.isInteger(n) && n >= 1 && n <= choices.length ? choices[n - 1].record : null);
      }
      return new Promise(resolve => {
        const doc = root.document;
        const overlay = doc.createElement('div');
        overlay.setAttribute('role', 'presentation');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,8,25,.82);display:flex;align-items:center;justify-content:center;padding:16px';
        const dialog = doc.createElement('section');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', 'Choose the correct TMDB match');
        dialog.style.cssText = 'width:min(100%,540px);max-height:85dvh;overflow:auto;background:#092751;border:2px solid #ffd15a;border-radius:14px;padding:18px;color:white;box-shadow:0 16px 45px #0009';
        const heading = doc.createElement('h2');
        heading.textContent = 'Choose the correct ' + (type === 'tv' ? 'TV show' : 'movie');
        heading.style.cssText = 'color:#ffd15a;margin:0 0 8px';
        const hint = doc.createElement('p');
        hint.textContent = 'Tap a title to load its exact TMDB record.';
        hint.style.cssText = 'color:#bed8ef;margin:0 0 14px';
        dialog.append(heading, hint);
        const previousFocus = doc.activeElement;
        let finished = false;
        function finish(record) {
          if (finished) return;
          finished = true;
          root.removeEventListener('keydown', onKey);
          overlay.remove();
          if (previousFocus?.focus) previousFocus.focus();
          resolve(record);
        }
        function onKey(event) { if (event.key === 'Escape') { event.preventDefault(); finish(null); } }
        root.addEventListener('keydown', onKey);
        overlay.addEventListener('click', event => { if (event.target === overlay) finish(null); });
        for (const choice of choices) {
          const record = choice.record;
          const option = doc.createElement('button');
          option.type = 'button';
          option.style.cssText = 'display:block;width:100%;text-align:left;background:#16477c;color:white;border:1px solid #668dbb;border-radius:10px;margin:8px 0;padding:14px;min-height:56px;font:inherit;cursor:pointer';
          option.textContent = names(record)[0] + ' (' + (recordYear(record) || 'year unknown') + ') — TMDB ' + recordId(record);
          option.addEventListener('click', () => finish(record));
          dialog.append(option);
        }
        const cancel = doc.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel — keep existing metadata';
        cancel.style.cssText = 'width:100%;padding:14px;margin-top:12px;background:#304966;color:white;border:1px solid #89a9ca;border-radius:10px;min-height:48px;font:inherit';
        cancel.addEventListener('click', () => finish(null));
        dialog.append(cancel);
        overlay.append(dialog);
        doc.body.append(overlay);
        dialog.querySelector('button')?.focus();
      });
    }
    async function lookup(target, config = {}) {
      const key = String(target.id);
      if (active.has(key)) return active.get(key);
      const promise = perform(target, config);
      active.set(key, promise);
      try { return await promise; } finally { active.delete(key); }
    }
    function schedule() {
      clearTimeout(timer);
      if (stopped || options.schedule === false) return;
      const pending = targets().filter(x => !folder(x)).map(x => detail(x).metadataLookup?.nextAttempt).filter(t => t > now());
      if (pending.length) timer = setTimeout(() => scan(), Math.min(2147483647, Math.max(1000, Math.min(...pending) - now())));
    }
    async function scan(config = {}) {
      if (running) { rescan = true; return; }
      running = true;
      const counts = {};
      try {
        do {
          rescan = false;
          for (const target of targets()) {
            if (stopped) break;
            const result = await lookup(target, config);
            counts[result] = (counts[result] || 0) + 1;
          }
        } while (rescan && !stopped);
        const labels = {ok: 'ready', folder: 'collection folders skipped', temporary: 'waiting to retry', unavailable: 'unavailable', ambiguous: 'needing a match selection', changed: 'changed during lookup'};
        report('Metadata: ' + Object.entries(counts).map(([key, count]) => count + ' ' + (labels[key] || key)).join(', ') + '. Open a detail page to resolve missing matches. Saved edits and posters are preserved.');
      } finally { running = false; schedule(); }
      return counts;
    }
    async function interactive(target) {
      report('Looking up metadata…');
      const result = await lookup(target, {interactive: true, refresh: true});
      const state = detail(target).metadataLookup;
      report(result === 'ok' ? 'Metadata saved. Existing edits and posters preserved.' : result === 'folder' ? 'Collection folders use their child movies’ metadata. Add movies inside this collection.' : state?.message || 'Metadata selection cancelled.');
      schedule();
      return result;
    }
    function alias(target) {
      const value = ask('Alternate or original title (optional release year in parentheses). This does not rename your entry:');
      if (!value?.trim()) return;
      const parts = titleParts(value.trim()), d = detail(target);
      d.metadataAliases = [...new Set([...(d.metadataAliases || []), parts.title])];
      if (parts.year && !d.year) d.year = parts.year;
      persist();
      return interactive(target);
    }
    return {scan, lookup, interactive, alias, targets, detail, folder, stop() { stopped = true; clearTimeout(timer); root.removeEventListener?.('storage', storageChanged); }};
  }
  root.ClassicMetadata = {create, normalize, titleParts, candidates, confident, fields, request, discover};
  if (typeof module !== 'undefined') module.exports = root.ClassicMetadata;
})(typeof window === 'undefined' ? globalThis : window);

