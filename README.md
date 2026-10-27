# Classic Comcast

A static movie/TV collection tracker. Run `python3 -m http.server 8000 --bind 127.0.0.1`
from this checkout. There is no package installation or build step.

## Metadata

All pages load `metadata.js`. Adding a movie, TV show, or movie inside a collection
queues a search followed by a full-detail request. Existing entries are checked on
startup too, including entries that already have posters. **Repair All Metadata**
on the guide refreshes verified records and fills missing fields across the library.
It respects failure cooldowns; it does not reset or replace collection data.

Matching normalizes Unicode, punctuation, apostrophes, and ampersands. A trailing
release year, e.g. `Title (2020)` or `Title [2020]`, distinguishes remakes. Search
results' original titles are considered. If multiple records match, background
lookup saves an ambiguous state rather than guessing. Open the detail page and
use **Load TMDB Info** / **Refresh Movie Info** to choose the correct result.
**Use Alternate Title** adds an original/regional search title without renaming
the entry. A year in that alternate title supplies a missing release year.
No production title aliases or film-specific TMDB IDs are hardcoded.

Verified IDs are stored in `movieDetails[id]` / `showDetails[id]` as `tmdbId` and
`metadataLookup.id`. The lookup identity includes media type, normalized title,
year, and user aliases. Refreshes use that ID; renaming invalidates the identity.
Existing unverified IDs are checked against full details before reuse. Verified
source details live in `tmdb`; display fields are filled only when empty and not
marked in `manualFields`. Populated legacy fields are preserved conservatively
because their provenance is unknown. Empty fields explicitly saved in the editor
are also manual. Existing posters and manual poster choices are preserved.

Network/timeouts, invalid responses, HTTP 408/429, and server failures use persisted
exponential backoff starting at 30 seconds, capped at six hours, and honor
`Retry-After`. Missing/ambiguous records and other HTTP 4xx responses cool down for
30 days. Successful records refresh after 30 days. Timers retry while a page is
open; after reopening, persisted eligibility determines whether another lookup
is due. An explicit lookup on a detail page can retry early. One client serializes
background work and deduplicates concurrent requests for an entry. Changes made
while a lookup is running, including another tab's saved changes, are reconciled
before metadata is committed; removed/renamed entries reject stale responses.

Collection/box-set folders are not individual films. Their child movies receive
independent IDs and full metadata; folders retain existing artwork or display a
child's poster. TV season rows are never searched as movies. TV season/episode
imports retain their separate controls and existing tracking/custom titles.
Legacy season migration no longer seeds a particular series or moves existing
shows to a hardcoded channel.

## Verified Worker contract

Live GET checks on 2026-10-27 against
`https://posters.thomasboydspam.workers.dev` established these routes:

| Route | Parameters | Response |
| --- | --- | --- |
| `/movie/search` | `query` (`title` also accepted) | `{results: [{id, title, original_title, year, release_date, overview, description, poster}]}` |
| `/movie/details` | `id` | `{id, title, original_title, overview, description, year, release_date, genres: [string], runtime: number, poster, ...}` |
| `/tv/search` | `title` | `{results: [{id, title, year, overview, poster}]}` |
| `/tv/details` | `id` | `{id, title, overview, firstAirDate, genres: [string], poster, seasons: [{number, ...}], ...}` |
| `/tv/season` | `id`, `season` | `{number, name, episodes: [{number, title, overview, airDate, still}]}` |

`/movie/<id>` also returned movie details. `/poster?title=...&type=movie`
returns search results, not full details; neither legacy route is needed for the
new client. Invalid IDs return HTTP 400 with `{error: ...}`.
`/movie/alternative_titles` returned HTTP 404: the client does not invent a route
for that feature. Alternate titles must be present in search results or supplied
by the user. The observed TV detail payload contains no runtime, so TV runtime is
shown only if a future response supplies it. No keys or credentials are needed
in browser storage for this Worker.

## Tests

With Node 18+:

```sh
node --test tests/metadata.test.cjs
```

With Python Playwright and Chromium at `/usr/bin/chromium`, and the static server
running on port 8000:

```sh
python3 tests/browser_metadata.py
python3 tests/live_metadata.py --curl-transport
```

The first browser suite intercepts the verified Worker routes with deterministic
fixtures and exercises actual UI controls and localStorage persistence. It tests
new movies/shows, both child-add controls, existing records, manual and blank
edits, repair, tracking, channels, dashboards, and unknown collection fields.

The live suite uses real Worker responses for an existing movie, a newly added
movie, a newly added TV show, and a newly added collection child. It checks IDs,
full metadata, detail rendering, reload persistence, and actual poster downloads.
`--curl-transport` bridges each browser metadata request through curl using normal
TLS verification. This cloud's native Chromium requests fail with
`ERR_CERT_AUTHORITY_INVALID` for the platform proxy; **no certificate checks are
disabled**. Native browser-to-Worker HTTPS/CORS and browser image rendering remain
unverified here. Without that flag, the suite uses native browser networking.
Live results depend on the external service and can change over time.

No merge or deployment is part of these tests.
