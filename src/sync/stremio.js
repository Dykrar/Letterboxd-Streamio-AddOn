// Stremio library via api.strem.io. Endpoint and payload as used by stremio-core
// (verified against its source on 2026-10-31; re-check if sync stops finding items).
const { request } = require('../http');

const API = 'https://api.strem.io/api';

async function call(method, body) {
  const res = await request(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) {
    const msg = json && json.error ? (json.error.message || JSON.stringify(json.error)) : `HTTP ${res.status}`;
    throw new Error(`Stremio ${method} failed: ${msg}`); // never include the request body: it holds the auth key
  }
  return json.result;
}

async function getLibrary(authKey) {
  if (!authKey) throw new Error('STREMIO_AUTH_KEY is not set');
  const result = await call('datastoreGet', { authKey, collection: 'libraryItem', ids: [], all: true });
  return Array.isArray(result) ? result : [];
}

async function login(email, password) {
  const result = await call('login', { type: 'Login', email, password, facebook: false });
  return result.authKey;
}

module.exports = { getLibrary, login };
