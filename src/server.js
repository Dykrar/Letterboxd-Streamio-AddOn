const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const config = require('./config');
const letterboxd = require('./providers/letterboxd');
const sync = require('./sync');
const writer = require('./sync/writer');
const queue = require('./sync/queue');
const fs = require('fs');
const path = require('path');

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
  if (!config.syncEnabled) return res.json({ ok: false, error: 'Sync is off. Set SYNC_ENABLED=true in .env to turn it on.' });
  try { res.json(await sync.runSync()); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
// Pending watches as a Letterboxd import CSV. After importing it on Letterboxd, POST /export/imported.
app.get('/export.csv', admin, (req, res) => {
  const entries = queue.pending();
  if (!entries.length) return res.status(404).send('Nothing to import yet.');
  res.attachment('letterboxd-import.csv').type('text/csv').send(writer.toCsv(entries));
});
app.post('/export/imported', admin, (req, res) => {
  res.json({ ok: true, marked: queue.markDone(queue.pending().map(e => e.id), 'csv') });
});

// Used by the browser userscript.
app.get('/pending.json', admin, (req, res) => res.json({ username: config.username, entries: queue.pending() }));
app.post('/pending/:id/done', admin, (req, res) => res.json({ ok: true, marked: queue.markDone([req.params.id], 'userscript') }));
app.get('/letterboxd-stremio.user.js', admin, (req, res) => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'userscript', 'letterboxd-stremio.user.js'), 'utf8')
    .replace("const ADDON_URL = 'http://localhost:7001';", `const ADDON_URL = ${JSON.stringify(`${req.protocol}://${req.get('host')}`)};`)
    .replace("const ADMIN_TOKEN = '';", `const ADMIN_TOKEN = ${JSON.stringify(config.adminToken ? String(req.query.token || '') : '')};`);
  res.type('application/javascript').send(src);
});
app.use(getRouter(builder.getInterface()));

if (require.main === module) {
  if (!config.username) console.warn('LETTERBOXD_USERNAME is not set: catalogs will be empty.');
  app.listen(config.port, () => {
    console.log(`Letterboxd addon on http://localhost:${config.port}/manifest.json`);
    sync.start();
  });
}

module.exports = { app, manifest, toMeta };
