const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  triggerEnabled: true,
  modifier: 'shift', // shift | alt | ctrl
  shortcut: 'CommandOrControl+Shift+Space',
  outputMode: 'same', // same | folder
  outputDir: '',
  openAtLogin: false,
  onboarded: false,
};

const file = () => path.join(app.getPath('userData'), 'settings.json');
let cache = null;

function get() {
  if (!cache) {
    try { cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }; } catch { cache = { ...DEFAULTS }; }
  }
  return cache;
}

function set(patch) {
  cache = { ...get(), ...patch };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  return cache;
}

module.exports = { get, set };
