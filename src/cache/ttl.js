// Tiny in-memory TTL cache. Values can be promises, so concurrent callers share one fetch.
class TtlCache {
  constructor(ttlMs) { this.ttlMs = ttlMs; this.map = new Map(); }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) { this.map.delete(key); return undefined; }
    return hit.value;
  }
  set(key, value, ttlMs = this.ttlMs) { this.map.set(key, { value, expires: Date.now() + ttlMs }); return value; }
  async wrap(key, fn) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const p = Promise.resolve().then(fn);
    this.set(key, p);
    try { return await p; } catch (e) { this.map.delete(key); throw e; }
  }
  clear() { this.map.clear(); }
}
module.exports = { TtlCache };
