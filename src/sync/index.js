// Sync loop: Stremio library -> new film watches -> Letterboxd import CSV (or dry-run log).
const config = require('../config');
const stremio = require('./stremio');
const { planSync } = require('./progress');
const writer = require('./writer');
const letterboxd = require('../providers/letterboxd');
const films = require('../mapping/films');
const { readJson, writeJson } = require('../store');

// Dry runs keep their own state file, so a dry run behaves exactly like a real run would
// without ever touching the real state.
const stateFile = () => (config.dryRun ? 'sync-state.dry-run.json' : 'sync-state.json');
let running = null;

async function diaryWithImdb() {
  try {
    const entries = await letterboxd.diaryEntries();
    const resolved = await films.resolveMany([...new Set(entries.map(e => e.slug).filter(Boolean))]);
    const bySlug = new Map(resolved.map(f => [f.slug, f.imdb]));
    return entries.map(e => ({ ...e, imdb: bySlug.get(e.slug) })).filter(e => e.imdb);
  } catch (e) {
    console.warn(`[sync] could not read Letterboxd diary, duplicate check limited to local state: ${e.message}`);
    return [];
  }
}

async function runSync() {
  if (running) return running;
  running = (async () => {
    const state = readJson(stateFile(), null);
    const firstRun = !state;
    const library = await stremio.getLibrary(config.stremioAuthKey);
    const diary = config.username ? await diaryWithImdb() : [];
    const { events, nextState } = planSync({
      library, state: state || {}, diary, threshold: config.watchedThreshold,
      firstRun, backfill: config.syncBackfill, tz: process.env.TZ,
    });

    let toWrite = events;
    if (events.length > config.maxExportsPerRun) {
      console.warn(`[sync] ${events.length} new watches, over MAX_EXPORTS_PER_RUN=${config.maxExportsPerRun}. Writing the first ${config.maxExportsPerRun}; the rest wait for the next run.`);
      toWrite = events.slice(0, config.maxExportsPerRun);
      // Roll back state for the ones we skipped so they are picked up next time.
      for (const e of events.slice(config.maxExportsPerRun)) {
        if (state && state.items && state.items[e.imdb]) nextState.items[e.imdb] = state.items[e.imdb];
        else delete nextState.items[e.imdb];
      }
    }
    // Add title/year from the Letterboxd mapping cache when we have it (the CSV matches on imdbID anyway).
    toWrite = toWrite.map(e => { const f = films.byImdb(e.imdb); return f ? { ...e, title: f.title, year: f.year } : e; });

    writer.write(toWrite, { dryRun: config.dryRun });
    writeJson(stateFile(), nextState);

    const summary = { firstRun, dryRun: config.dryRun, libraryMovies: library.filter(i => i.type === 'movie').length, newWatches: toWrite.length, events: toWrite };
    if (firstRun && !config.syncBackfill) console.log('[sync] first run: remembered your current watch history as the baseline; only watches from now on are exported (set SYNC_BACKFILL=true to export history).');
    return summary;
  })();
  try { return await running; } finally { running = null; }
}

function start() {
  if (!config.stremioAuthKey) { console.log('[sync] STREMIO_AUTH_KEY not set, sync disabled.'); return; }
  const every = Math.max(1, config.syncIntervalMinutes) * 60 * 1000;
  const tick = () => runSync().catch(e => console.warn(`[sync] failed: ${e.message}`));
  setTimeout(tick, 5000);
  setInterval(tick, every);
  console.log(`[sync] every ${config.syncIntervalMinutes} min, ${config.dryRun ? 'DRY RUN (nothing is written)' : 'writing to data/letterboxd-import.csv'}`);
}

module.exports = { runSync, start };
