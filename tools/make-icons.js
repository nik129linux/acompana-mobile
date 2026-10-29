'use strict';

// Generates PNG icons for the PWA manifest by rendering an inline SVG
// with playwright. No new dependencies. Run: node tools/make-icons.js

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ICONS_DIR = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

// 100x100 viewBox: rounded blue tile + white medical cross
const SYMBOL = [
  '<rect x="4" y="4" width="92" height="92" rx="20" fill="#0086fc"/>',
  '<rect x="40" y="18" width="20" height="64" rx="10" fill="#fff"/>',
  '<rect x="18" y="40" width="64" height="20" rx="10" fill="#fff"/>'
].join('');

function pageHtml(size, maskable) {
  if (!maskable) {
    return '<body style="margin:0">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 100 100">' +
      SYMBOL + '</svg></body>';
  }
  // maskable: 80% safe zone (10% padding each side)
  var inner = Math.round(size * 0.8);
  var pad = Math.round(size * 0.1);
  return '<body style="margin:0;background:#0086fc">' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + inner + '" height="' + inner + '" ' +
    'viewBox="0 0 100 100" style="position:absolute;left:' + pad + 'px;top:' + pad + 'px">' +
    SYMBOL + '</svg></body>';
}

async function render(size, maskable) {
  var file = maskable ? 'icon-maskable-' + size + '.png' : 'icon-' + size + '.png';
  var browser = await chromium.launch();
  var page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(pageHtml(size, maskable));
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(ICONS_DIR, file), type: 'png' });
  await browser.close();
  console.log('wrote icons/' + file);
}

(async function () {
  await render(192, false);
  await render(512, false);
  await render(512, true);
  console.log('icons done');
})();
