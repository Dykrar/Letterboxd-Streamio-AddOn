require('dotenv').config();

function num(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== '' ? v : def;
}
function bool(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return /^(1|true|yes)$/i.test(v);
}

module.exports = {
  username: (process.env.LETTERBOXD_USERNAME || '').trim().toLowerCase(),
  stremioAuthKey: process.env.STREMIO_AUTH_KEY || '',
  port: num('PORT', 7001),
  adminToken: process.env.ADMIN_TOKEN || '',
  syncIntervalMinutes: num('SYNC_INTERVAL_MINUTES', 3),
  watchedThreshold: num('WATCHED_THRESHOLD', 0.85),
  syncEnabled: bool('SYNC_ENABLED', false),
  dryRun: bool('DRY_RUN', true),
  syncBackfill: bool('SYNC_BACKFILL', false),
  maxExportsPerRun: num('MAX_EXPORTS_PER_RUN', 10),
  listCacheMinutes: num('LIST_CACHE_MINUTES', 15),
  dataDir: process.env.DATA_DIR || require('path').join(__dirname, '..', 'data'),
};
