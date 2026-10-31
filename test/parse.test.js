const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseCsrf, parseRss, parseFilmGrid, parseLastPage, parseFilmPage, slugFrom } = require('../src/letterboxd/parse');
const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

test('RSS: diary entries with tmdb id, watched date, rewatch; lists skipped', () => {
  const items = parseRss(fx('rss.xml'));
  assert.strictEqual(items.length, 2);
  assert.deepStrictEqual(
    { slug: items[0].slug, title: items[0].title, year: items[0].year, tmdb: items[0].tmdb, watchedDate: items[0].watchedDate, rewatch: items[0].rewatch, rating: items[0].rating },
    { slug: 'primetime-2026', title: 'Primetime', year: 2026, tmdb: 1375441, watchedDate: '2026-10-30', rewatch: false, rating: 3.5 });
  assert.strictEqual(items[1].rewatch, true);
  assert.match(items[0].poster, /^https:\/\/a\.ltrbxd\.com\//);
});

test('watchlist grid: old and new markup, deduped, in order', () => {
  assert.deepStrictEqual(parseFilmGrid(fx('watchlist.html')), ['the-thing', 'paris-texas']);
  assert.strictEqual(parseLastPage(fx('watchlist.html')), 23);
  assert.strictEqual(parseLastPage('<p>no pages</p>'), 1);
});

test('film page: imdb, tmdb, title, year', () => {
  assert.deepStrictEqual(parseFilmPage(fx('film.html')), {
    imdb: 'tt0087884', tmdb: 655, tmdbType: 'movie', title: 'Paris, Texas', year: 1984, poster: 'https://a.ltrbxd.com/p.jpg', filmId: '51469' });
  assert.strictEqual(parseFilmPage('<html></html>').imdb, null);
});

test('slugFrom handles member, film and plain forms', () => {
  assert.strictEqual(slugFrom('https://letterboxd.com/dave/film/the-thing/1/'), 'the-thing');
  assert.strictEqual(slugFrom('/film/the-thing/'), 'the-thing');
  assert.strictEqual(slugFrom('the-thing'), 'the-thing');
  assert.strictEqual(slugFrom('/dave/list/x/'), null);
});

test('csrf token from hidden input', () => {
  assert.strictEqual(parseCsrf('<input type="hidden" name="__csrf" value="abc123">'), 'abc123');
  assert.strictEqual(parseCsrf('<p></p>'), null);
});
