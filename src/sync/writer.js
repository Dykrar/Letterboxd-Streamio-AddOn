// Letterboxd has no write API for personal projects, so "writing" means appending diary rows to a
// CSV in Letterboxd's import format (letterboxd.com/about/importing-data/). You upload it at
// https://letterboxd.com/import/ . In DRY_RUN the rows are only logged.
const fs = require('fs');
const path = require('path');
const { file } = require('../store');

const PENDING = 'letterboxd-import.csv';
const HEADER = 'imdbID,Title,Year,WatchedDate,Rewatch\n';

function csvField(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toRow(e) {
  return [e.imdb, e.title || e.name, e.year || '', e.watchedDate, e.rewatch ? 'true' : 'false'].map(csvField).join(',') + '\n';
}

function write(events, { dryRun }) {
  for (const e of events) {
    console.log(`[sync]${dryRun ? ' DRY RUN, would log' : ' queued'}: ${e.title || e.name} (${e.imdb}) watched ${e.watchedDate}${e.rewatch ? ' (rewatch)' : ''}`);
  }
  if (dryRun || !events.length) return;
  const f = file(PENDING);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (!fs.existsSync(f)) fs.writeFileSync(f, HEADER);
  fs.appendFileSync(f, events.map(toRow).join(''));
}

function pendingPath() { const f = file(PENDING); return fs.existsSync(f) ? f : null; }

// After you've imported the file on Letterboxd: archive it so the next export starts empty.
function markImported() {
  const f = pendingPath();
  if (!f) return null;
  const dest = file(`imported-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
  fs.renameSync(f, dest);
  return path.basename(dest);
}

module.exports = { write, toRow, pendingPath, markImported, HEADER };
