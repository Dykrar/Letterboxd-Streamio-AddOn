// Letterboxd has no write API for personal projects. New watches go into a local queue
// (src/sync/queue.js). From there they reach Letterboxd in one of two ways:
//   1. the userscript (userscript/letterboxd-stremio.user.js) logs them while you browse letterboxd.com
//   2. /export.csv gives them as a file in Letterboxd's import format for letterboxd.com/import/
// In DRY_RUN they are only logged.
const queue = require('./queue');

const HEADER = 'imdbID,Title,Year,WatchedDate,Rewatch\n';

function csvField(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toRow(e) {
  return [e.imdb, e.title || e.name, e.year || '', e.watchedDate, e.rewatch ? 'true' : 'false'].map(csvField).join(',') + '\n';
}
function toCsv(entries) { return HEADER + entries.map(toRow).join(''); }

function write(events, { dryRun }) {
  for (const e of events) {
    console.log(`[sync]${dryRun ? ' DRY RUN, would queue' : ' queued'}: ${e.title || e.name} (${e.imdb}) watched ${e.watchedDate}${e.rewatch ? ' (rewatch)' : ''}`);
  }
  if (!dryRun && events.length) queue.add(events);
}

module.exports = { write, toRow, toCsv, HEADER };
