// Pure logic: which Stremio library items count as newly watched films. No I/O here.

// A movie counts as watched when Stremio flagged it, counted a full watch, or it is past the threshold.
function isWatched(item, threshold) {
  const s = item.state || {};
  if (s.flaggedWatched === 1 || s.flaggedWatched === true) return true;
  if ((s.timesWatched || 0) > 0) return true;
  return s.duration > 0 && s.timeOffset / s.duration >= threshold;
}

function isMovie(item) {
  return item && item.type === 'movie' && /^tt\d+$/.test(item._id || '');
}

// "2026-10-31T21:05:00.000Z" -> local calendar date "2026-10-31" (Letterboxd diary dates have no time).
function localDate(iso, tz) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return localDate(null, tz);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function dayDiff(a, b) { return Math.abs((Date.parse(a) - Date.parse(b)) / 86400000); }

// Decide what to log on Letterboxd.
//   library: Stremio library items
//   state:   { items: { [imdb]: { timesWatched, flagged, lastExport } } } from data/sync-state.json
//   diary:   recent Letterboxd diary entries, each with { imdb, watchedDate }
// Returns { events: [{ imdb, name, watchedDate, rewatch }], nextState } without mutating inputs.
function planSync({ library, state, diary = [], threshold = 0.85, firstRun = false, backfill = false, tz }) {
  const items = { ...(state.items || {}) };
  const events = [];
  for (const item of library) {
    if (!isMovie(item) || !isWatched(item, threshold)) continue;
    const s = item.state || {};
    const imdb = item._id;
    const times = s.timesWatched || 0;
    const flagged = s.flaggedWatched === 1 || s.flaggedWatched === true;
    const prev = items[imdb];
    const snapshot = { timesWatched: Math.max(times, prev ? prev.timesWatched : 0), flagged: flagged || !!(prev && prev.flagged) };

    let isNew;
    if (!prev) isNew = !(firstRun && !backfill); // first run: remember history, don't export it
    else isNew = times > prev.timesWatched || (flagged && !prev.flagged);
    if (!isNew) { items[imdb] = { ...prev, ...snapshot }; continue; }

    const watchedDate = localDate(s.lastWatched, tz);
    const logged = diary.filter(e => e.imdb === imdb);
    // Already in the Letterboxd diary within a day (logged by hand): don't add a second entry.
    if (logged.some(e => dayDiff(e.watchedDate, watchedDate) <= 1)) {
      items[imdb] = { ...prev, ...snapshot, lastExport: prev && prev.lastExport };
      continue;
    }
    const rewatch = !!(prev && prev.lastExport) || times > 1 || logged.length > 0;
    events.push({ imdb, name: item.name || imdb, watchedDate, rewatch });
    // Count this viewing as done: when it was caught by the threshold before Stremio counted it,
    // Stremio's later timesWatched=1 or "mark as watched" must not export it a second time.
    items[imdb] = { ...prev, timesWatched: Math.max(snapshot.timesWatched, 1), flagged: true, lastExport: watchedDate };
  }
  return { events, nextState: { ...state, items, initialisedAt: state.initialisedAt || new Date().toISOString() } };
}

module.exports = { isWatched, isMovie, localDate, planSync };
