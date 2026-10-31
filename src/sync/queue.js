// Queue of watches waiting to be logged on Letterboxd, in data/pending.json.
// Filled by the sync; emptied by the browser userscript (one entry at a time) or by a CSV import.
// An entry is never removed, only marked done, so the same viewing can't be queued twice.
const { readJson, writeJson } = require('../store');

const FILE = 'pending.json';

const idOf = e => `${e.imdb}:${e.watchedDate}`;
function all() { return readJson(FILE, []); }
function pending() { return all().filter(e => !e.doneAt); }

function add(events) {
  const list = all();
  const ids = new Set(list.map(e => e.id));
  let added = 0;
  for (const ev of events) {
    const id = idOf(ev);
    if (ids.has(id)) continue;
    list.push({ id, imdb: ev.imdb, title: ev.title || ev.name, year: ev.year || null, watchedDate: ev.watchedDate, rewatch: !!ev.rewatch, queuedAt: new Date().toISOString() });
    ids.add(id);
    added++;
  }
  if (added) writeJson(FILE, list);
  return added;
}

function markDone(ids, via) {
  const want = new Set(ids);
  const list = all();
  let n = 0;
  for (const e of list) if (want.has(e.id) && !e.doneAt) { e.doneAt = new Date().toISOString(); e.doneVia = via; n++; }
  if (n) writeJson(FILE, list);
  return n;
}

module.exports = { add, pending, markDone, idOf };
