// Letterboxd film slug -> { imdb, tmdb, title, year }, read from the public film page once and cached
// forever in data/film-ids.json (a film's IMDb id does not change). Failed lookups are retried after a day.
const { getText } = require('../http');
const { parseFilmPage } = require('../letterboxd/parse');
const { readJson, writeJson } = require('../store');

const FILE = 'film-ids.json';
const RETRY_FAILED_MS = 24 * 3600 * 1000;
let db = null;
let dirty = false;
const inflight = new Map();

function load() { if (!db) db = readJson(FILE, {}); return db; }
function save() { if (dirty) { writeJson(FILE, db); dirty = false; } }

function cached(slug) {
  const e = load()[slug];
  if (!e) return undefined;
  if (e.failedAt && Date.now() - e.failedAt > RETRY_FAILED_MS) return undefined;
  return e;
}

async function resolve(slug) {
  const hit = cached(slug);
  if (hit) return hit.failedAt ? null : hit;
  if (inflight.has(slug)) return inflight.get(slug);
  const p = (async () => {
    try {
      const info = parseFilmPage(await getText(`https://letterboxd.com/film/${slug}/`));
      load()[slug] = info.imdb ? { ...info, slug } : { slug, failedAt: Date.now(), title: info.title };
      dirty = true;
      return info.imdb ? load()[slug] : null;
    } catch (e) {
      console.warn(`[mapping] could not read film page for ${slug}: ${e.message}`);
      if (e.status === 404) { load()[slug] = { slug, failedAt: Date.now() }; dirty = true; }
      return null;
    } finally { inflight.delete(slug); }
  })();
  inflight.set(slug, p);
  return p;
}

// Resolve many slugs with small concurrency; keeps input order, drops films with no IMDb id.
async function resolveMany(slugs, concurrency = 3) {
  const out = new Array(slugs.length);
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < slugs.length) { const k = i++; out[k] = await resolve(slugs[k]); }
  }));
  save();
  return out.filter(Boolean);
}

// Reverse lookups for the sync (IMDb id -> slug), from what we have already cached.
function byImdb(imdb) { return Object.values(load()).find(e => e.imdb === imdb) || null; }

module.exports = { resolve, resolveMany, byImdb, _reset: () => { db = {}; dirty = false; } };
