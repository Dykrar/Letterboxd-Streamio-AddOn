const test = require('node:test');
const assert = require('node:assert');
const { isWatched, planSync, localDate } = require('../src/sync/progress');
const { toRow } = require('../src/sync/writer');

const movie = (id, state, extra = {}) => ({ _id: id, type: 'movie', name: `Film ${id}`, state, ...extra });
const TZ = 'UTC';

test('isWatched: flag, full watch count, threshold', () => {
  assert.ok(isWatched(movie('tt1', { flaggedWatched: 1 }), 0.85));
  assert.ok(isWatched(movie('tt1', { timesWatched: 1 }), 0.85));
  assert.ok(isWatched(movie('tt1', { timeOffset: 90, duration: 100 }), 0.85));
  assert.ok(!isWatched(movie('tt1', { timeOffset: 50, duration: 100 }), 0.85));
  assert.ok(!isWatched(movie('tt1', { timeOffset: 50, duration: 0 }), 0.85));
});

test('first run without backfill: history becomes the baseline, nothing exported', () => {
  const library = [movie('tt1', { timesWatched: 1, lastWatched: '2026-01-01T10:00:00Z' })];
  const { events, nextState } = planSync({ library, state: {}, firstRun: true, tz: TZ });
  assert.deepStrictEqual(events, []);
  assert.strictEqual(nextState.items.tt1.timesWatched, 1);
});

test('first run with backfill exports history', () => {
  const library = [movie('tt1', { timesWatched: 1, lastWatched: '2026-01-01T10:00:00Z' })];
  const { events } = planSync({ library, state: {}, firstRun: true, backfill: true, tz: TZ });
  assert.deepStrictEqual(events, [{ imdb: 'tt1', name: 'Film tt1', watchedDate: '2026-01-01', rewatch: false }]);
});

test('new watch after baseline is exported once, then not again', () => {
  const lib1 = [movie('tt2', { timeOffset: 95, duration: 100, lastWatched: '2026-10-31T20:00:00Z' })];
  const r1 = planSync({ library: lib1, state: { items: {} }, tz: TZ });
  assert.strictEqual(r1.events.length, 1);
  const r2 = planSync({ library: lib1, state: r1.nextState, tz: TZ });
  assert.strictEqual(r2.events.length, 0);
  // Stremio later counts the full watch: same viewing, no duplicate
  const lib3 = [movie('tt2', { timesWatched: 1, timeOffset: 0, duration: 100, lastWatched: '2026-10-31T20:30:00Z' })];
  const r3 = planSync({ library: lib3, state: r2.nextState, tz: TZ });
  assert.strictEqual(r3.events.length, 0);
});

test('watch count going up again is a rewatch', () => {
  const state = { items: { tt3: { timesWatched: 1, flagged: false, lastExport: '2026-05-01' } } };
  const lib = [movie('tt3', { timesWatched: 2, lastWatched: '2026-10-31T20:00:00Z' })];
  const { events } = planSync({ library: lib, state, tz: TZ });
  assert.deepStrictEqual(events, [{ imdb: 'tt3', name: 'Film tt3', watchedDate: '2026-10-31', rewatch: true }]);
});

test('watch count going down (Stremio reset) never exports and never lowers state', () => {
  const state = { items: { tt3: { timesWatched: 3, flagged: true, lastExport: '2026-05-01' } } };
  const lib = [movie('tt3', { timesWatched: 1, flaggedWatched: 1, lastWatched: '2026-10-31T20:00:00Z' })];
  const { events, nextState } = planSync({ library: lib, state, tz: TZ });
  assert.strictEqual(events.length, 0);
  assert.strictEqual(nextState.items.tt3.timesWatched, 3);
});

test('already logged by hand on Letterboxd within a day: skipped', () => {
  const lib = [movie('tt4', { flaggedWatched: 1, lastWatched: '2026-10-31T23:30:00Z' })];
  const diary = [{ imdb: 'tt4', watchedDate: '2026-10-30' }];
  const { events, nextState } = planSync({ library: lib, state: { items: {} }, diary, tz: TZ });
  assert.strictEqual(events.length, 0);
  assert.ok(nextState.items.tt4);
});

test('in the Letterboxd diary on an older date: exported as rewatch', () => {
  const lib = [movie('tt5', { flaggedWatched: 1, lastWatched: '2026-10-31T20:00:00Z' })];
  const diary = [{ imdb: 'tt5', watchedDate: '2025-01-01' }];
  const { events } = planSync({ library: lib, state: { items: {} }, diary, tz: TZ });
  assert.strictEqual(events[0].rewatch, true);
});

test('series, non-IMDb ids and unwatched items are ignored', () => {
  const lib = [
    movie('tt6', { timesWatched: 1 }, { type: 'series' }),
    movie('kitsu:1', { timesWatched: 1 }),
    movie('tt7', { timeOffset: 10, duration: 100 }),
  ];
  assert.strictEqual(planSync({ library: lib, state: { items: {} }, tz: TZ }).events.length, 0);
});

test('local date uses the timezone', () => {
  assert.strictEqual(localDate('2026-10-31T23:30:00Z', 'Europe/Lisbon'), '2026-10-31');
  assert.strictEqual(localDate('2026-10-31T23:30:00Z', 'Asia/Tokyo'), '2026-11-01');
});

test('CSV row is in Letterboxd import format and quotes commas', () => {
  assert.strictEqual(toRow({ imdb: 'tt0087884', title: 'Paris, Texas', year: 1984, watchedDate: '2026-10-31', rewatch: false }),
    'tt0087884,"Paris, Texas",1984,2026-10-31,false\n');
});

test('caught by threshold, then flagged by hand: still one entry', () => {
  const lib1 = [movie('tt8', { timeOffset: 95, duration: 100, lastWatched: '2026-10-31T20:00:00Z' })];
  const r1 = planSync({ library: lib1, state: { items: {} }, tz: TZ });
  const lib2 = [movie('tt8', { flaggedWatched: 1, timesWatched: 1, lastWatched: '2026-10-31T20:05:00Z' })];
  assert.strictEqual(planSync({ library: lib2, state: r1.nextState, tz: TZ }).events.length, 0);
});
