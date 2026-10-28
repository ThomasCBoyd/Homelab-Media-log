# TV Land Ventura v1.1 — proposed next release

## Monterey baseline verified before edits

- Current `main`: `a5c0a16d9017118521cef49053309d5071882841`.
- Existing tag: `v1.0.0-monterey`, pointing to that exact commit.
- Published release: [TV Land Monterey v1.0](https://github.com/ThomasCBoyd/Homelab-Media-log/releases/tag/v1.0.0-monterey).
- GitHub's release response reports `immutable: true`. No baseline tag was created, moved, or replaced during this work.
- [Pages build and deployment](https://github.com/ThomasCBoyd/Homelab-Media-log/actions/runs/40634384639) independently verified `completed / success` for the same SHA.

Ventura is a separate feature branch and proposed next named release. No Ventura release is published by this PR. No merge, deployment, or deployment setting changes are authorized.

## Implementation

Individual movies and TV shows gain a cached TMDB backdrop/poster hero with navy overlays, gold headings and borders, and responsive poster/title/overview layouts. Failed or missing backdrops fall back to a saved poster, then the existing navy treatment. Only HTTPS artwork is used. Existing manual posters remain the foreground poster.

Movies retain metadata, Owned/Ripped/In Jellyfin checkboxes, manual editing and poster controls. Collection children show their actual parent collection link. Non-folder movies no longer show an empty “Movies in This Collection” editor. Actual collection-folder pages retain Monterey styling and their existing controls. The previously broken movie Change Poster control now initializes the existing manual-poster list correctly.

TV pages show explicitly saved series-level statuses separately from tracked episode totals. Season cards retain Load Episodes, Add Episode, Mark All Owned, expansion, title editing, deletion and undo. Season and episode disclosure controls support keyboard activation. Counts describe saved tracked episodes, not a show's complete episode inventory. Metadata seasons are still imported only through the existing explicit action.

There is no supported physical-media schema, so no physical-media section is invented. No file paths, playback links, codecs, discs, seasons or episode totals are synthesized.

## Storage and scope

No keys, schemas, migrations, seeded records or new persistence fields. Unknown collection fields are retained. The new checkbox save path reads the latest stored tree, updates only the selected existing record/field, rejects missing identities/records and reports failed writes while restoring the control. Existing record IDs and `owned`, `ripped`, `added` meanings remain unchanged. Viewing the new presentation does not write collection data; pre-existing background metadata behavior is unchanged.

`index.html`, `home.js`, `home.css`, `metadata.js`, `collections.js`, `collections.css`, and search assets are unchanged. This preserves the top header/Tools, Home carousel, guide navigation, Collections hub and existing return-state behavior. No real personal browser storage was used for testing.

## Validation

- All 43 existing Node unit tests pass.
- `tests/ventura.browser.cjs`: Chrome and WebKit at 320, 390, 844 landscape and 1280 pixels. Checks no horizontal overflow, cached art/fallback, exact viewing preservation, independent checkbox semantics, concurrent unknown-field preservation, rejected storage writes, edit cancel/save, manual poster replacement, actual child-parent relationship, folder isolation, keyboard disclosures, TV bulk ownership, delete/undo, and unreadable collection JSON left byte-for-byte intact.
- Existing `collections-detail.browser.cjs`: Chrome and WebKit at 320/390/844/1280; order, independent tracking, save failures, concurrent edits, Back/Forward, exact detail routes, expansion/reload, search and storage preservation pass.
- Existing `home-return.browser.cjs`: Chrome and WebKit at 390/1280; vertical and shelf scroll, slide/selection/filter restoration, browser Back, app links and reload pass.
- Existing `collections.browser.cjs`: Chrome at 320/390/768/1280; routing, return/reload, empty state and data preservation pass.
- Existing `home-redesign.browser.cjs`: Chrome at 390/1280; queues, shelves, exact navigation, backup/restore, tabs/search and storage pass.
- `git diff --check` passes. Screenshots visually reviewed at phone and desktop sizes.

WebKit is automated desktop WebKit with mobile/touch viewports, **not physical iPhone Safari**. A real iPhone Safari check remains required before approving deployment. Screenshots use fictional isolated records and local intercepted artwork; they demonstrate layout, not live TMDB content or a personal collection. New presentation tests disable background metadata for exact storage comparison; existing integration suites retain the actual metadata module with deterministic network fixtures. No live service availability claim is made.

To reproduce: serve this checkout on 8769 for the detail/Collections/return suites, and 8000 for the existing Home suite. Run `node --test tests/*.test.cjs`; run the browser scripts with Playwright and Chrome installed. Set `PLAYWRIGHT_MODULE` and `CHROME_PATH` as needed; select WebKit with `BROWSER=webkit` for the suites supporting it.

## Screenshots

[Movie, phone WebKit](screenshots/movie-webkit-390.png) · [TV, phone WebKit](screenshots/tv-webkit-390.png)

[Movie, desktop Chrome](screenshots/movie-chrome-1280.png) · [TV, desktop Chrome](screenshots/tv-chrome-1280.png)

## Compare and rollback

Compare the PR to `v1.0.0-monterey` (the base main SHA is identical). Preview each checkout on a separate local origin with a copy of sample/backup data; localStorage is origin-specific, and the release source archive does not include personal collection data.

Before any approved deployment or rollback, export a current backup through Tools in the original Safari profile/site. To restore Monterey, create a new rollback branch/PR with the application tree matching `a5c0a16d9017118521cef49053309d5071882841`, verify using a copy of data, and merge/deploy only with explicit owner approval. Do not move the immutable Monterey tag or reset/force-push main. Keep the original production origin and storage keys. A code rollback does not restore collection data.
