const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lbx-queue-'));
const queue = require('../src/sync/queue');
const writer = require('../src/sync/writer');

const ev = (imdb, watchedDate, extra = {}) => ({ imdb, name: `Film ${imdb}`, watchedDate, rewatch: false, ...extra });

test('queue: adds once per viewing, marks done, never re-adds a done viewing', () => {
  assert.strictEqual(queue.add([ev('tt1', '2026-10-31'), ev('tt2', '2026-10-31')]), 2);
  assert.strictEqual(queue.add([ev('tt1', '2026-10-31')]), 0);
  assert.deepStrictEqual(queue.pending().map(e => e.id), ['tt1:2026-10-31', 'tt2:2026-10-31']);
  assert.strictEqual(queue.markDone(['tt1:2026-10-31'], 'userscript'), 1);
  assert.strictEqual(queue.markDone(['tt1:2026-10-31'], 'userscript'), 0);
  assert.strictEqual(queue.add([ev('tt1', '2026-10-31')]), 0);
  assert.deepStrictEqual(queue.pending().map(e => e.id), ['tt2:2026-10-31']);
  // a rewatch on another day is a new viewing
  assert.strictEqual(queue.add([ev('tt1', '2026-11-05', { rewatch: true })]), 1);
});

test('dry run writes nothing to the queue', () => {
  const before = queue.pending().length;
  writer.write([ev('tt9', '2026-10-31')], { dryRun: true });
  assert.strictEqual(queue.pending().length, before);
});

test('CSV export from queue entries', () => {
  assert.strictEqual(writer.toCsv([{ imdb: 'tt0087884', title: 'Paris, Texas', year: 1984, watchedDate: '2026-10-31', rewatch: true }]),
    'imdbID,Title,Year,WatchedDate,Rewatch\ntt0087884,"Paris, Texas",1984,2026-10-31,true\n');
});
