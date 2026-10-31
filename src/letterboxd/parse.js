// Pure parsers for public Letterboxd pages and feeds. No network here, so they are easy to test.
// Markup verified 2026-10-31 for the RSS feed. The watchlist and film page markup is matched
// loosely on purpose (several attribute names), because Letterboxd changes it from time to time.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#039': "'" };
function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .trim();
}

// "/film/the-thing/", "/dave/film/the-thing/1/", "https://letterboxd.com/film/the-thing/" or "the-thing" -> "the-thing"
function slugFrom(value) {
  if (!value) return null;
  const m = String(value).match(/\/film\/([a-z0-9-]+)/i);
  if (m) return m[1].toLowerCase();
  return /^[a-z0-9-]+$/i.test(value) ? value.toLowerCase() : null;
}

// Film slugs on a watchlist / list / films page, in page order.
function parseFilmGrid(html) {
  const slugs = [];
  const seen = new Set();
  const re = /data-(?:film-slug|item-slug|target-link|item-link|film-link)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const slug = slugFrom(decode(m[1]));
    if (slug && !seen.has(slug)) { seen.add(slug); slugs.push(slug); }
  }
  return slugs;
}

// Highest page number linked from the paginator, or 1.
function parseLastPage(html) {
  let max = 1;
  const re = /\/page\/(\d+)\/?"/g;
  let m;
  while ((m = re.exec(html))) max = Math.max(max, Number(m[1]));
  return max;
}

// A film page: IMDb id (from the IMDb button), TMDB id, title and year.
function parseFilmPage(html) {
  const imdb = (html.match(/imdb\.com\/title\/(tt\d+)/i) || [])[1] || null;
  const tmdbType = (html.match(/data-tmdb-type="(\w+)"/) || [])[1] || null;
  const tmdb = (html.match(/data-tmdb-id="(\d+)"/) || html.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/) || [])[1] || null;
  const og = decode((html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || '');
  let title = og, year = null;
  const ym = og.match(/^(.*)\s\((\d{4})\)$/);
  if (ym) { title = ym[1]; year = Number(ym[2]); }
  // Letterboxd's internal numeric id (verified 2026-10-31: data-production-uid="film:51469" and "uid":"film:51469").
  const filmId = (html.match(/data-production-uid="film:(\d+)"/) || html.match(/"uid"\s*:\s*"film:(\d+)"/) || html.match(/data-film-id="(\d+)"/) || [])[1] || null;
  const poster = decode((html.match(/<meta property="og:image" content="([^"]*)"/) || [])[1] || '') || null;
  return { imdb, tmdb: tmdb ? Number(tmdb) : null, tmdbType, title: title || null, year, poster, filmId };
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : null;
}

// Member RSS feed (letterboxd.com/<user>/rss/): diary entries (and reviews/lists, which we skip).
function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const watchedDate = tag(b, 'letterboxd:watchedDate');
    const link = tag(b, 'link');
    if (!watchedDate) continue; // lists and reviews without a watch
    const rating = tag(b, 'letterboxd:memberRating');
    const desc = tag(b, 'description') || '';
    items.push({
      slug: slugFrom(link),
      link,
      title: tag(b, 'letterboxd:filmTitle'),
      year: Number(tag(b, 'letterboxd:filmYear')) || null,
      tmdb: Number(tag(b, 'tmdb:movieId')) || null,
      watchedDate,
      rewatch: tag(b, 'letterboxd:rewatch') === 'Yes',
      rating: rating ? Number(rating) : null,
      liked: tag(b, 'letterboxd:memberLike') === 'Yes',
      poster: (desc.match(/<img src="([^"]+)"/) || [])[1] || null,
    });
  }
  return items;
}

// Hidden CSRF token in any Letterboxd page (also sent as the com.xk72.webparts.csrf cookie).
function parseCsrf(html) {
  return (html.match(/name="__csrf"\s+value="([^"]+)"/) || html.match(/supermodelCSRF\s*=\s*'([^']+)'/) || [])[1] || null;
}

module.exports = { parseCsrf, decode, slugFrom, parseFilmGrid, parseLastPage, parseFilmPage, parseRss };
