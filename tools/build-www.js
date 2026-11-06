'use strict';

// Copies the web app into www/ for Capacitor, with the deployed server
// address baked into www/js/config.js. Run: node tools/build-www.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const ENTRIES = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'media', 'icons', 'fonts'];
const SKIP = new Set([path.join('media', 'raw')]);

function copy(src, rel) {
  const dest = path.join(WWW, rel);
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((name) => {
      const childRel = path.join(rel, name);
      if (SKIP.has(childRel)) return;
      copy(path.join(src, name), childRel);
    });
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

ENTRIES.forEach((entry) => {
  const src = path.join(ROOT, entry);
  if (fs.existsSync(src)) copy(src, entry);
});

const apiBase = process.env.ACOMPANA_API_BASE || '';
// Shared app key the server checks (APP_KEY there). Not a secret from anyone
// who unpacks the APK; it keeps scanners and casual scripts out.
const appKey = process.env.ACOMPANA_APP_KEY || '';
const config = "'use strict';\n\n" +
  '// Build-time server address; empty means "no server" (on-device rules only).\n' +
  'window.ACOMPANA_CONFIG = { apiBase: ' + JSON.stringify(apiBase) + ', appKey: ' + JSON.stringify(appKey) + ' };\n';
fs.mkdirSync(path.join(WWW, 'js'), { recursive: true });
fs.writeFileSync(path.join(WWW, 'js', 'config.js'), config);

console.log('www built: ' + WWW);
