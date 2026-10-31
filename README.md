# Letterboxd Stremio addon (personal)

Shows your Letterboxd **Watchlist** and **Recently watched** (diary) as movie catalogs in Stremio, and
queues films you finish in Stremio as Letterboxd diary entries.

Catalog items use IMDb ids (`tt…`), so Cinemeta supplies the details page and your existing stream
addons work with no extra setup.

## How it talks to Letterboxd (checked 2026-10-31)

| Need | What works today | Used here |
|---|---|---|
| Official API (`api.letterboxd.com`) | Invite-only, and not offered for personal projects. It has a "mark watched" endpoint, but you need an approved API key | No |
| Watchlist | Public page `letterboxd.com/<you>/watchlist/`, 28 films per page | Yes (read) |
| Diary | Public RSS `letterboxd.com/<you>/rss/`: latest ~50 entries, with watched date, rewatch, rating and TMDB id | Yes (read) |
| IMDb id of a film | The IMDb button on `letterboxd.com/film/<slug>/`, read once per film and cached in `data/film-ids.json` | Yes |
| Writing watches | **No public write route.** Letterboxd's CSV importer (`letterboxd.com/import/`) accepts `imdbID, WatchedDate, Rewatch` and creates diary entries | Yes: the addon builds that CSV, you upload it |

Your profile, watchlist and diary must be **public** for the catalogs to work.

## Setup

1. Node.js 20 or newer.
2. `npm install`
3. `cp .env.example .env` (Windows: `copy .env.example .env`) and set `LETTERBOXD_USERNAME` and `TZ` (for example `Europe/Lisbon`).
4. Stremio auth key: run `npm run stremio:login`. It asks for your Stremio email and password, sends them only to
   `api.strem.io`, and writes the key into `.env` without printing it. If you already have the key from the MAL addon, paste
   the same value into `STREMIO_AUTH_KEY`.
5. `npm start`, then open `http://localhost:7001/manifest.json` to check it runs.

Port 7001 is the default so this can run next to the MAL addon on 7000.

## Install in Stremio

Stremio > Addons > paste `http://localhost:7001/manifest.json` into the search box > Install. The two catalogs
appear on the Board and under Discover > Movies.

## How sync works

Every `SYNC_INTERVAL_MINUTES` (and on `GET /sync`):

1. Reads your Stremio library (`POST api.strem.io/api/datastoreGet`, collection `libraryItem`).
2. A **movie** counts as watched when Stremio flags it watched, counts a full watch (`timesWatched`), or you are past
   `WATCHED_THRESHOLD` (default 85%) of its runtime.
3. **First run:** everything you have already watched becomes the baseline and is *not* exported, so your Stremio history
   doesn't flood your diary. Set `SYNC_BACKFILL=true` if you want that history.
4. Skips films already in your Letterboxd diary within one day of the Stremio watch date (you logged them by hand).
   A film that is in your diary on an older date, or that Stremio counts a second time, is marked as a rewatch.
5. **Dry run (`DRY_RUN=true`, the default):** only logs `DRY RUN, would log: <film> …`. It keeps its own
   `data/sync-state.dry-run.json` and never touches the real state or the CSV.
6. **Real run:** appends rows to `data/letterboxd-import.csv` and records them in `data/sync-state.json` so a film is
   never queued twice for the same viewing. At most `MAX_EXPORTS_PER_RUN` rows per run.

To send them to Letterboxd: download `http://localhost:7001/export.csv`, upload it at https://letterboxd.com/import/,
check the matches Letterboxd shows, and import. Then `curl -X POST http://localhost:7001/export/imported` archives
the file so the next one starts empty.

## Endpoints

- `/manifest.json`: addon manifest
- `/sync`: run a sync now and return what it found
- `/refresh`: clear the catalog cache (watchlist and diary are cached for `LIST_CACHE_MINUTES`)
- `/export.csv`: download the pending Letterboxd import file
- `POST /export/imported`: archive the pending file after you imported it

If `ADMIN_TOKEN` is set, these need `?token=<ADMIN_TOKEN>`. Set it if you ever deploy the addon publicly.

## Tests

`npm test` covers the page/RSS parsers and the sync logic (baseline, no duplicates, rewatches, watch count never going
down, already-logged films, timezones, CSV format).

## Known limitations

- **Watching does not reach Letterboxd by itself.** You upload the CSV. Automatic writes were tried on 2026-10-31:
  Letterboxd's sign-in page sits behind a Cloudflare challenge that a script can't pass (HTTP 403 "Just a moment"),
  and getting around it isn't something this addon does. Automatic writes need an approved Letterboxd API key.
- **Recently watched** shows only what the RSS feed carries (about the last 50 diary entries).
- The first watchlist load reads one film page per film, about one per second, cached forever after. Stremio gets
  whatever is ready within 8 seconds and the rest fill in on later loads.
- Letterboxd is behind Cloudflare. Too many requests in a burst get your IP challenged (HTTP 403) for a while. The addon
  then pauses film lookups for 30 minutes and serves what it has cached.
- Films with no IMDb link on Letterboxd are left out of the catalogs. TV entries on Letterboxd are left out too.
- Watchlist and film page markup has not been checked against live HTML yet. The parser accepts several attribute names
  (`data-film-slug`, `data-item-slug`, `data-target-link`, `data-item-link`). If the Watchlist catalog is empty while the
  page is public, the markup changed.
- Ratings, likes and reviews are not synced. Stremio has none of them.
- Stremio's own counters can be reset (for example after removing an item from the library). The sync never lowers its
  stored count, so a reset doesn't create a duplicate entry. It also means a reset item only exports again once its count
  passes the old one.
