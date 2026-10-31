// Gets a Stremio auth key and saves it into .env as STREMIO_AUTH_KEY without printing it.
// Your email and password are sent only to api.strem.io and are not stored.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { login } = require('../src/sync/stremio');

function ask(q, hidden) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = s => { if (s.includes(q)) process.stdout.write(s); };
    rl.question(q, a => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}

(async () => {
  const email = await ask('Stremio email: ');
  const password = await ask('Stremio password (hidden): ', true);
  const key = await login(email, password);
  if (!key) throw new Error('Stremio did not return an auth key');
  const envPath = path.join(__dirname, '..', '.env');
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  env = /^STREMIO_AUTH_KEY=.*$/m.test(env) ? env.replace(/^STREMIO_AUTH_KEY=.*$/m, `STREMIO_AUTH_KEY=${key}`) : env + `\nSTREMIO_AUTH_KEY=${key}\n`;
  fs.writeFileSync(envPath, env);
  console.log('Saved STREMIO_AUTH_KEY to .env (not shown). Restart the addon.');
})().catch(e => { console.error(e.message); process.exit(1); });
