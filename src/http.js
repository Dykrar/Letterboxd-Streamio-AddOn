// fetch with a polite pace, timeout and backoff on 429/5xx. Never logs request bodies (they may hold secrets).
const UA = 'letterboxd-stremio-addon/0.1 (personal use)';
const MIN_GAP_MS = Number(process.env.HTTP_MIN_GAP_MS || 400);
let last = 0;
let chain = Promise.resolve();

function pace() {
  // Serialise request starts so we never exceed ~2.5 req/s to any site.
  chain = chain.then(async () => {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
  });
  return chain;
}

async function request(url, opts = {}, { retries = 3, timeoutMs = 15000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    await pace();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: ctrl.signal });
    } catch (e) {
      if (attempt >= retries) throw new Error(`Request failed: ${new URL(url).host}${new URL(url).pathname}: ${e.message}`);
      await sleep(backoff(attempt));
      continue;
    } finally { clearTimeout(t); }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt));
      continue;
    }
    return res;
  }
}
const backoff = a => Math.min(30000, 1000 * 2 ** a) + Math.floor(Math.random() * 300);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getText(url, opts) {
  const res = await request(url, opts);
  if (!res.ok) { const e = new Error(`HTTP ${res.status} for ${new URL(url).pathname}`); e.status = res.status; throw e; }
  return res.text();
}
module.exports = { request, getText };
