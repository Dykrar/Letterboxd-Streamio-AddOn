// JSON files in data/ (gitignored). Writes go through a temp file so a crash never leaves half a file.
const fs = require('fs');
const path = require('path');
const { dataDir } = require('./config');

function file(name) { return path.join(dataDir, name); }
function readJson(name, def) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return def; }
}
function writeJson(name, value) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = file(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file(name));
}
module.exports = { file, readJson, writeJson };
