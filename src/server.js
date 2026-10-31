const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const config = require('./config');
const letterboxd = require('./providers/letterboxd');
const sync = require('./sync');
const writer = require('./sync/writer');

const PAGE = 100;
const manifest = {
  id: 'community.letterboxd.personal',
  version: '0.1.0',
  name: 'Letterboxd (personal)',
  description: `Your Letterboxd watchlist and diary${config.username ? ` (${config.username})` : ''} as Stremio catalogs, with watched films queued back to Letterboxd.`,
  resources: ['catalog'], // meta comes from Cinemeta, because catalog ids are IMDb tt ids
  types: ['movie'],
  idPrefixes: ['tt'],
  catalogs: [
    { type: 'movie', id: 'letterboxd-watchlist', name: 'Letterboxd: Watchlist', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'letterboxd-diary', name: 'Letterboxd: Recently watched', extra: [{ name: 'skip' }] },
  ],
};

const LISTS = { 'letterboxd-watchlist': 'watchlist', 'letterboxd-diary': 'diary' };

function toMeta(f) {
  return {
    id: f.imdb,
    type: 'movie',
    name: f.title || f.slug,
    releaseInfo: f.year ? String(f.year) : undefined,
    poster: `https://images.metahub.space/poster/medium/${f.imdb}/img`,
  };
}

const builder = new addonBuilder(manifest);
builder.defineCatalogHandler(async ({ id, extra }) => {
  const list = LISTS[id];
  if (!list) return { metas: [] };
  try {
    const skip = Number(extra && extra.skip) || 0;
    const items = await letterboxd.getList(list, { skip, limit: PAGE });
    return { metas: items.map(toMeta), cacheMaxAge: 300 };
  } catch (e) {
    console.warn(`[catalog] ${id} failed: ${e.message}`);
    return { metas: [] }; // a failed lookup must not crash the addon
  }
});

const app = express();
function admin(req, res, next) {
  if (config.adminToken && req.query.token !== config.adminToken) return res.status(401).send('Unauthorized');
  next();
}
app.get('/', (req, res) => res.redirect('/manifest.json'));
app.get('/refresh', admin, (req, res) => { letterboxd.clearCache(); res.json({ ok: true, cleared: 'catalog cache' }); });
app.get('/sync', admin, async (req, res) => {
  try { res.json(await sync.runSync()); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.get('/export.csv', admin, (req, res) => {
  const f = writer.pendingPath();
  if (!f) return res.status(404).send('Nothing to import yet.');
  res.download(f, 'letterboxd-import.csv');
});
app.post('/export/imported', admin, (req, res) => res.json({ ok: true, archivedAs: writer.markImported() }));
app.use(getRouter(builder.getInterface()));

if (require.main === module) {
  if (!config.username) console.warn('LETTERBOXD_USERNAME is not set: catalogs will be empty.');
  app.listen(config.port, () => {
    console.log(`Letterboxd addon on http://localhost:${config.port}/manifest.json`);
    sync.start();
  });
}

module.exports = { app, manifest, toMeta };
