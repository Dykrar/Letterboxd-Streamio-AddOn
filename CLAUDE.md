# CLAUDE.md

Stremio addon that shows my Letterboxd watchlist and diary as movie catalogs and queues films I watch in Stremio back to Letterboxd. Sibling of the MAL addon (Dykrar/MAL-Stremio-ADDON); same rules.

## Commands
- `npm install` : install dependencies
- `npm start` : run the addon on `http://localhost:7001` (manifest at `/manifest.json`)
- `npm test` : run tests (parsers, sync logic)
- `npm run stremio:login` : save a Stremio auth key into `.env` without printing it
- `DRY_RUN=true npm start` : sync logs what it would add to Letterboxd without writing anything
- Manual endpoints: `/sync`, `/refresh`, `/export.csv`, `POST /export/imported`

## Stack
- Node.js 20+, `stremio-addon-sdk`, `express`, `dotenv`. No HTML/XML parser dependency: parsers are small regex functions with tests.

## Project layout
- `src/server.js` : addon definition and HTTP routes
- `src/providers/letterboxd.js` : list provider (`getList(name)`); reads public pages only
- `src/letterboxd/parse.js` : pure parsers for RSS, watchlist grid and film pages
- `src/mapping/films.js` : Letterboxd slug -> IMDb/TMDB ids, cached in `data/film-ids.json`
- `src/sync/` : Stremio library polling, watch detection (`progress.js`), CSV writer
- `src/cache/` : TTL cache
- `data/` : film id cache, sync state, pending import CSV. **Gitignored**

## Rules (important)
1. **Never write to my real Letterboxd account without a dry run first.** Ask before the first real write. Today "write" means the import CSV I upload myself; any automatic write route needs my explicit go-ahead.
2. **Never create duplicate diary entries.** A viewing is exported once. Stored watch counts never go down.
3. **Never log or print secrets** (Stremio auth key, any Letterboxd credentials). Secrets live in `.env` or `data/`, both gitignored. Keep `.env.example` updated with empty values.
4. **Don't assume API or markup details, verify them.** Letterboxd markup and Stremio's API change. Check current behaviour and tell me if something differs.
5. Be polite to Letterboxd: pace requests, cache film ids forever, back off on 429/5xx. A failed lookup must not crash the addon.
6. Don't add dependencies without a reason. Say why if you do.

## Conventions
- Catalog ids are IMDb `tt` ids so Cinemeta and stream addons work. No meta handler.
- An entry counts as watched at >= `WATCHED_THRESHOLD` (default 0.85), on Stremio's watched flag, or when Stremio counts a full watch.
- Write tests for the parsers and the sync logic before changing them.
- Keep `README.md` accurate.
