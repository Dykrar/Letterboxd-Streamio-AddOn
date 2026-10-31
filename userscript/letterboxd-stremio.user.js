// ==UserScript==
// @name         Letterboxd: log my Stremio watches
// @namespace    https://github.com/Dykrar/Letterboxd-Streamio-AddOn
// @version      0.1.0
// @description  While you browse letterboxd.com (logged in), logs the films your Stremio addon queued as diary entries.
// @match        https://letterboxd.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---- Settings ----------------------------------------------------------
  const ADDON_URL = 'http://localhost:7001';
  const ADMIN_TOKEN = '';
  // Ask before each entry. Turn off once you trust it (Tampermonkey > this script > edit).
  const CONFIRM_EACH = true;
  const MAX_PER_VISIT = 10;
  const GAP_MS = 1500;
  // -------------------------------------------------------------------------

  // Run at most once a minute across tabs, and only in the top window.
  if (window.top !== window.self) return;
  const last = Number(GM_getValue('lastRun', 0));
  if (Date.now() - last < 60 * 1000) return;
  GM_setValue('lastRun', Date.now());

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const withToken = p => ADDON_URL + p + (ADMIN_TOKEN ? `${p.includes('?') ? '&' : '?'}token=${encodeURIComponent(ADMIN_TOKEN)}` : '');

  function addon(method, p) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method, url: withToken(p), timeout: 5000,
        onload: r => (r.status >= 200 && r.status < 300 ? resolve(JSON.parse(r.responseText || '{}')) : reject(new Error(`addon HTTP ${r.status}`))),
        onerror: () => reject(new Error('addon not reachable')),
        ontimeout: () => reject(new Error('addon timed out')),
      });
    });
  }

  function toast(text, isError) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:fixed;z-index:99999;right:16px;bottom:16px;max-width:360px;padding:10px 14px;border-radius:6px;
      font:13px/1.4 sans-serif;color:#fff;background:${isError ? '#b3261e' : '#00a35c'};box-shadow:0 2px 8px rgba(0,0,0,.4)`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), isError ? 12000 : 6000);
  }

  function csrf() {
    const c = document.cookie.match(/(?:^|;\s*)com\.xk72\.webparts\.csrf=([^;]+)/);
    if (c) return decodeURIComponent(c[1]);
    const input = document.querySelector('input[name="__csrf"]');
    return input ? input.value : null;
  }

  function signedInAs(username) {
    return !!document.querySelector(`a[href="/${username}/"]`) && !document.querySelector('a[href="/sign-in/"], a[href*="/create-account/"]');
  }

  // Letterboxd redirects /imdb/<tt>/ to the film page; the page carries the internal film id.
  async function filmIdFor(imdb) {
    const res = await fetch(`/imdb/${imdb}/`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`film lookup HTTP ${res.status}`);
    const html = await res.text();
    const m = html.match(/data-production-uid="film:(\d+)"/) || html.match(/"uid"\s*:\s*"film:(\d+)"/) || html.match(/data-film-id="(\d+)"/);
    if (!m) throw new Error('film id not found on the film page');
    return m[1];
  }

  async function logEntry(entry, token) {
    const filmId = await filmIdFor(entry.imdb);
    const body = new URLSearchParams({
      __csrf: token, json: 'true', viewingId: '', filmId,
      specifiedDate: 'true', viewingDateStr: entry.watchedDate,
      rewatch: entry.rewatch ? 'true' : 'false',
      review: '', tags: '', rating: '0', liked: 'false', containsSpoilers: 'false',
    });
    const res = await fetch('/s/save-diary-entry', {
      method: 'POST', credentials: 'same-origin', body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    if (res.ok && json && (json.result === true || json.result === 'success')) return;
    const why = json && json.messages ? json.messages.join(' ') : `HTTP ${res.status}`;
    throw new Error(`Letterboxd refused the diary entry (${why})`);
  }

  (async () => {
    let data;
    try { data = await addon('GET', '/pending.json'); } catch (e) { return; } // addon not running: stay quiet
    const entries = (data.entries || []).slice(0, MAX_PER_VISIT);
    if (!entries.length) return;
    if (!data.username || !signedInAs(data.username)) return;
    const token = csrf();
    if (!token) { toast('Stremio sync: could not find Letterboxd\'s form token. Use the CSV export instead.', true); return; }

    let done = 0;
    for (const e of entries) {
      const label = `${e.title || e.imdb}${e.year ? ` (${e.year})` : ''}, watched ${e.watchedDate}${e.rewatch ? ', rewatch' : ''}`;
      if (CONFIRM_EACH && !window.confirm(`Log on Letterboxd from Stremio?\n\n${label}`)) continue;
      try {
        await logEntry(e, token);
        await addon('POST', `/pending/${encodeURIComponent(e.id)}/done`);
        done++;
      } catch (err) {
        toast(`Stremio sync stopped at ${label}: ${err.message}`, true);
        return; // stop on the first failure so a site change can't cause a burst of bad requests
      }
      await sleep(GAP_MS);
    }
    if (done) toast(`Stremio sync: logged ${done} film${done > 1 ? 's' : ''} in your diary.`);
  })();
})();
