// Letterboxd provider. Reads only public pages, so the profile, watchlist and diary must be public.
// Interface (shared shape with other list providers):
//   getList(name, { skip, limit }) -> [{ imdb, title, year, poster, slug }]
//   markWatched(film) -> handled by the sync's writer (see src/sync/writer.js); Letterboxd has no
//                        public write API for personal projects.
const { getText } = require('../http');
const { parseFilmGrid, parseLastPage, parseRss } = require('../letterboxd/parse');
const films = require('../mapping/films');
const { TtlCache } = require('../cache/ttl');
const config = require('../config');

const cache = new TtlCache(config.listCacheMinutes * 60 * 1000);
const MAX_PAGES = 60;
// Stremio gives up on slow catalogs, so answer within this time with what is resolved so far.
const CATALOG_BUDGET_MS = 8000;

function base() {
  if (!config.username) throw new Error('LETTERBOXD_USERNAME is not set');
  return `https://letterboxd.com/${encodeURIComponent(config.username)}`;
}

// All film slugs in the watchlist (newest added first, Letterboxd's default order).
function watchlistSlugs() {
  return cache.wrap('watchlist', async () => {
    const first = await getText(`${base()}/watchlist/`);
    const slugs = parseFilmGrid(first);
    const last = Math.min(parseLastPage(first), MAX_PAGES);
    for (let p = 2; p <= last; p++) {
      const page = parseFilmGrid(await getText(`${base()}/watchlist/page/${p}/`));
      if (!page.length) break;
      slugs.push(...page);
    }
    return [...new Set(slugs)];
  });
}

// Recent diary entries from the RSS feed (Letterboxd serves the latest ~50).
function diaryEntries() {
  return cache.wrap('diary', async () => parseRss(await getText(`${base()}/rss/`)));
}

async function getList(name, { skip = 0, limit = 100 } = {}) {
  let slugs;
  if (name === 'watchlist') slugs = await watchlistSlugs();
  else if (name === 'diary') slugs = [...new Set((await diaryEntries()).map(e => e.slug).filter(Boolean))];
  else throw new Error(`Unknown list ${name}`);
  // Only resolve the page Stremio asked for, so a 600-film watchlist doesn't trigger 600 lookups at once.
  const out = await films.resolveMany(slugs.slice(skip, skip + limit), { budgetMs: CATALOG_BUDGET_MS });
  return out.filter(f => f.tmdbType !== 'tv'); // catalogs are type movie; Letterboxd also lists some TV
}

function clearCache() { cache.clear(); }

module.exports = { id: 'letterboxd', getList, diaryEntries, watchlistSlugs, clearCache };
