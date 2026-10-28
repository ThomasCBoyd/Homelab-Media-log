# TV Land Ventura v1.2 — Compact Detail Sections

The detail sections now use smaller gold-outline season cards, tighter episode rows, compact inline movie status controls, and space-efficient collection movie/season entries. Cinematic hero artwork, Home, navigation and search retain their existing layout. Season and episode disclosures, edit/delete/undo, load/add and bulk actions retain their behavior. New accessible progress bars reflect only saved tracked episode flags; no totals or metadata are inferred.

## Recovery and release audit

Starting main: `61f230bbb6648a0e2a4d352507ed4e76597b4fdd` (Ventura v1.1).
Monterey has the immutable `v1.0.0-monterey` tag and published release. The fetched remote has no Ventura v1.1 tag and the release API lists only Monterey. Existing releases/tags were not modified. The starting commit is preserved by remote branch `backup/pre-ventura-v1.2-2026-10-28`; a local tag `pre-ventura-v1.2-2026-10-28` also marks the commit. No release is created for this proposal.

## Preservation

No storage keys, record schemas, persistence behavior, status meanings, or personal records are changed. Styling is scoped to detail content; the only index change is a collection stylesheet cache version. Episode counts and progress derive from the existing saved records. The update never accesses the user's production browser storage. Screenshots use fictional isolated test fixtures and intercepted artwork.

## Validation

43 automated unit tests pass. Chrome and mobile/touch WebKit detail checks pass at 320, 390, 844 and 1280 pixels, including compact header dimensions, progress values, keyboard collapse/expand, layout overflow, checkbox independence, concurrent-field preservation, save failures, editing, bulk ownership, delete/undo, corrupted storage and artwork fallback. Collections WebKit checks pass at the same sizes for exact data preservation, routing, history, expansion, search and failed saves. Home return checks cover shelf and vertical scroll, filters, featured slide, browser Back, app links and reload.

Reproduce using a local server on port 8769, Node and Playwright. Run `node --test tests/*.test.cjs`, then `COMPACT=1 BROWSER=webkit node tests/ventura.browser.cjs`, `BROWSER=webkit node tests/collections-detail.browser.cjs` and `BROWSER=webkit node tests/home-return.browser.cjs`. Set PLAYWRIGHT_MODULE for a non-default package location; omit BROWSER for Chrome. SCREENSHOT_DIR controls detail screenshot output.

## Before / after

| Detail (390px WebKit) | Before | After |
| --- | --- | --- |
| TV | [Before](before/tv-webkit-390.jpg) | [After](after/tv-webkit-390.jpg) |
| Movie | [Before](before/movie-webkit-390.jpg) | [After](after/movie-webkit-390.jpg) |
| TV collection | [Before](before/cinematic-tv-webkit-390.jpg) | [After](after/cinematic-tv-webkit-390.jpg) |
| Movie collection | [Before](before/cinematic-movies-webkit-390.jpg) | [After](after/cinematic-movies-webkit-390.jpg) |

Desktop 1280px equivalents are in the same folders. Before captures run against the exact preserved main commit and use matching test fixtures/actions.

## Limitations and approval

The earlier ChatGPT mockup image was unavailable from the referenced conversation; implementation follows the user's written approved specification. WebKit uses automated mobile/touch viewports, not physical iPhone Safari. Real-device Safari validation remains outstanding before deployment. Deterministic artwork fixtures validate presentation, not live TMDB availability. Existing metadata and application behavior remain in place.

Do not merge or deploy until the owner approves this PR. No production deployment or release publication is part of this change. For rollback after an approved deployment, prepare a reviewed PR restoring the preserved source tree; do not reset main or move release tags. Source snapshots do not back up browser-local personal records.
