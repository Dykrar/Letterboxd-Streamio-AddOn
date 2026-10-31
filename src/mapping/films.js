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
// Letterboxd sits behind Cloudflare. A burst of film page requests gets this IP challenged (HTTP 403)
// for a while, so on 403/429 we stop fetching film pages for COOLDOWN_MS and serve what is cached.
const COOLDOWN_MS = 30 * 60 * 1000;
let cooldownUntil = 0;

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
  if (Date.now() < cooldownUntil) return null;
  if (inflight.has(slug)) return inflight.get(slug);
  const p = (async () => {
    try {
      const info = parseFilmPage(await getText(`https://letterboxd.com/film/${slug}/`));
      load()[slug] = info.imdb ? { ...info, slug } : { slug, failedAt: Date.now(), title: info.title };
      dirty = true;
      return info.imdb ? load()[slug] : null;
    } catch (e) {
      if (e.status === 403 || e.status === 429) {
        if (Date.now() >= cooldownUntil) console.warn(`[mapping] Letterboxd answered ${e.status} (rate limit or Cloudflare challenge). Pausing film lookups for ${COOLDOWN_MS / 60000} min.`);
        cooldownUntil = Date.now() + COOLDOWN_MS;
        return null;
      }
      console.warn(`[mapping] could not read film page for ${slug}: ${e.message}`);
      if (e.status === 404) { load()[slug] = { slug, failedAt: Date.now() }; dirty = true; }
      return null;
    } finally { inflight.delete(slug); }
  })();
  inflight.set(slug, p);
  return p;
}

// Resolve slugs one at a time (the http pacer spaces requests out). Returns once all are done or
// budgetMs has passed, with the films resolved so far in input order; the rest keep resolving in the
// background, so the next catalog load (or /refresh) shows them. Films with no IMDb id are dropped.
function resolveMany(slugs, { budgetMs = Infinity } = {}) {
  const out = new Array(slugs.length);
  const work = (async () => {
    for (let k = 0; k < slugs.length; k++) {
      out[k] = await resolve(slugs[k]);
      if (k % 10 === 9) save();
    }
    save();
  })();
  const snapshot = () => out.filter(Boolean);
  if (!Number.isFinite(budgetMs)) return work.then(snapshot);
  return Promise.race([work, new Promise(r => setTimeout(r, budgetMs).unref())]).then(snapshot);
}

// Reverse lookups for the sync (IMDb id -> slug), from what we have already cached.
function byImdb(imdb) { return Object.values(load()).find(e => e.imdb === imdb) || null; }

module.exports = { resolve, resolveMany, byImdb, _reset: () => { db = {}; dirty = false; cooldownUntil = 0; } };
