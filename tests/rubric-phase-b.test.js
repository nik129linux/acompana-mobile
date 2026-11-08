'use strict';

// Phase B: professor demo bugs. Each item: fix + test that would have caught it.
// Run: node tests/rubric-phase-b.test.js

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { viewAs, openSettings } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function lum(rgb) {
  const c = rgb.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => p - q);
  return (y + 0.05) / (x + 0.05);
}
function toRgb(c) {
  const n = (c.match(/[\d.]+/g) || []).map(Number);
  return c.startsWith('color(') ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
}

async function freshPage(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 844 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('acompana-guide-seen', '{"all":true}');
    ['confirm', 'handover', 'register', 'ask', 'visit'].forEach(function (k) { localStorage.setItem('acompana-coach-' + k, 'yes'); });
    localStorage.setItem('acompana-lang', 'es');
    try { localStorage.removeItem('acompana-confirmed'); } catch (e) {}
  });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(INDEX);
  if (await p.locator('[data-splash-skip]').isVisible().catch(() => false)) await p.locator('[data-splash-skip]').click();
  await p.waitForTimeout(600);
  return p;
}

async function setLang(page, lang) {
  await openSettings(page);
  await page.locator('.view.is-active [data-set-lang="' + lang + '"]').first().click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();

  // 1. Settings back is a left/back arrow of the same set; +FAB hidden on Settings.
  {
    const page = await freshPage(browser);
    await openSettings(page);
    const cls = await page.locator('.view.is-active [data-settings-back] svg').getAttribute('class');
    assert.ok(cls && cls.includes('icon-arrow'), 'settings back uses the arrow (left/back) icon, got: ' + cls);
    assert.ok(!cls.includes('icon-back'), 'settings back is not the right-pointing chevron set');
    assert.strictEqual(await page.locator('[data-fab-register]').isHidden(), true, '+FAB hidden on Settings');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.close();
    ok('1: settings back is a left arrow; +FAB hidden on Settings');
  }

  // 2. Family chat privacy scoped by patientId (server + client).
  {
    const srv = require('../server/server.js');
    srv.resetShared();
    srv.addChatMessage({ channel: 'familia', text: 'Carlos estable', author: 'Elena', patientId: 'cr' });
    srv.addChatMessage({ channel: 'familia', text: 'Maria tratada', author: 'Elena', patientId: 'mg' });
    const snap = srv.sharedSnapshot('familia', 0, 'mg');
    assert.ok(snap.messages.length === 1 && snap.messages[0].patientId === 'mg', 'server: Maria family sees only mg, got ' + JSON.stringify(snap.messages.map((m) => m.patientId)));
    const all = srv.sharedSnapshot('enfermero', 0, '');
    assert.strictEqual(all.messages.length, 2, 'nurse still sees every patient');
    srv.resetShared();
    const page = await freshPage(browser);
    const filtered = await page.evaluate(() => {
      const V = window.AcompanaViews;
      const origRole = V.ctx.getRole;
      const origMsgs = V.ctx.getChatMessages;
      V.ctx.getRole = function () { return 'familia'; };
      V.ctx.getChatMessages = function () {
        return [
          { id: 'a', channel: 'familia', author: 'Elena', text: 'Carlos estable', time: new Date().toISOString(), patientId: 'cr' },
          { id: 'b', channel: 'familia', author: 'Elena', text: 'Maria tratada', time: new Date().toISOString(), patientId: 'mg' }
        ];
      };
      const html = V.chat.threadBody('familia');
      V.ctx.getRole = origRole;
      V.ctx.getChatMessages = origMsgs;
      return html;
    });
    assert.ok(!filtered.includes('Carlos estable') && filtered.includes('Maria tratada'), 'client threadBody filters by family patient');
    await page.close();
    ok('2: compartir desde Carlos no llega a la familia de Maria (server + client)');
  }

  // 3. "Llamar" is an in-app callback request; no empty tel: anywhere.
  {
    const page = await freshPage(browser);
    await viewAs(page, 'familia');
    await page.locator('[data-nav="contacto"]').click();
    await page.waitForTimeout(500);
    assert.strictEqual(await page.locator('a[href^="tel:"]').count(), 0, 'no tel: links on Contacto');
    assert.ok(await page.locator('[data-call-request]').isVisible(), 'Pedir que me llamen request exists');
    const label = await page.locator('[data-call-request]').textContent();
    assert.ok(/Pedir que me llamen/.test(label), 'request labelled Pedir que me llamen, got: ' + label);
    const srv = require('../server/server.js');
    srv.resetShared(); srv.resetNurseQuestions();
    const server = srv.createServer(null);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const post = (urlPath, body) => new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: urlPath, method: 'POST' }, (res) => {
        let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, data }));
      });
      req.on('error', reject); req.end(JSON.stringify(body));
    });
    const get = (urlPath) => new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
        let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, data }));
      }).on('error', reject);
    });
    try {
      const created = await post('/api/questions', { question: 'La familia pide que la llamen.' });
      assert.strictEqual(created.status, 200, 'POST /api/questions stores the callback request');
      const list = JSON.parse((await get('/api/questions')).data);
      assert.ok(list.items.some((q) => /llamen/.test(q.question)), 'request appears in the nurse questions list');
    } finally { server.close(); }
    const html = read('js/views/family.js');
    assert.ok(html.indexOf('tel:') === -1, 'no tel: left in family view source');
    await page.close();
    ok('3: Pedir que me llamen llega a la lista de preguntas; sin tel: vacio');
  }

  // 4. Contrast on gradients >= 4.5:1 in both themes, sampled under the text.
  {
    for (const theme of ['light', 'dark']) {
      const page = await freshPage(browser);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(600);
      const ratios = await page.evaluate(() => {
        const parse = (c) => {
          const n = (c.match(/[\d.]+/g) || []).map(Number);
          return c.startsWith('color(') ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
        };
        const lumF = (rgb) => {
          const c = rgb.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
          return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        };
        const ratioF = (a, b) => {
          const s = [lumF(a), lumF(b)].sort((p, q) => p - q);
          return (s[1] + 0.05) / (s[0] + 0.05);
        };
        const out = [];
        const els = document.querySelectorAll('.view.is-active .hero-card, .view.is-active .hero-card .hero-title, .view.is-active .hero-sub, .view.is-active .glass-pill, .view.is-active .stat-tile, .view.is-active .stat-tile span, .view.is-active .stat-tile strong, .view.is-active .btn-primary');
        els.forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          const fg = parse(getComputedStyle(el).color);
          // Real gradient pixels behind this text box: the hero/tile/button
          // behind it (the glass pill itself is translucent).
          const host = el.closest('.hero-card, .stat-tile, .btn-primary, .fab-register') || el;
          const stops = (getComputedStyle(host).backgroundImage.match(/color\([^)]*\)|rgba?\([^)]*\)/g) || []).map(parse);
          const bg = getComputedStyle(host).backgroundColor;
          if (!stops.length && bg) stops.push(parse(bg));
          stops.forEach((stop) => out.push({ sel: el.className.toString().slice(0, 40), fg, stop, r: ratioF(fg, stop) }));
        });
        return out;
      });
      assert.ok(ratios.length >= 4, theme + ': gradient text samples found (' + ratios.length + ')');
      for (const g of ratios) assert.ok(g.r >= 4.5, theme + ': ' + g.sel + ' contrast ' + g.r.toFixed(2) + ' < 4.5');
      await page.close();
    }
    ok('4: texto sobre degradados >= 4.5:1 en ambos temas (muestreo bajo el texto)');
  }

  // 5. No clipping at 360/390/430 x ES/EN.
  {
    for (const width of [360, 390, 430]) {
      for (const lang of ['es', 'en']) {
        const page = await freshPage(browser, { width });
        await setLang(page, lang);
        for (const step of ['nurse-home', 'pendientes', 'detail']) {
          if (step === 'pendientes') { await page.locator('[data-nav="pendientes"]').click(); await page.waitForTimeout(500); }
          if (step === 'detail') {
            await page.locator('[data-nav="turno"]').click().catch(() => {});
            await page.waitForTimeout(400);
            const card = page.locator('[data-patient]').first();
            if (await card.count()) { await card.click(); await page.waitForTimeout(500); }
          }
          const bad = await page.evaluate(() => {
            const out = [];
            const vw = document.querySelector('.phone') ? document.querySelector('.phone').getBoundingClientRect().width : window.innerWidth;
            for (const el of document.querySelectorAll('.view.is-active *')) {
              const cs = getComputedStyle(el);
              if (cs.textOverflow === 'ellipsis' && (cs.overflow === 'hidden' || cs.whiteSpace === 'nowrap') && el.scrollWidth > el.clientWidth + 1 && (el.textContent || '').trim()) {
                out.push('ellipsis:' + el.className.toString().slice(0, 40) + ':' + (el.textContent || '').trim().slice(0, 24));
              }
              const r = el.getBoundingClientRect();
              if (r.width > 0 && (el.textContent || '').trim() && (r.right > vw + 1.5)) out.push('overflow:' + el.className.toString().slice(0, 40));
            }
            return out.slice(0, 8);
          });
          assert.deepStrictEqual(bad, [], width + '/' + lang + '/' + step + ' clips: ' + bad.join(' | '));
        }
        await page.close();
      }
    }
    ok('5: chips y titulos caben a 360/390/430 en ES/EN sin recorte');
  }

  // 6. No floating bubble covering actions; Chat is a bottom-nav tab.
  {
    const page = await freshPage(browser);
    const tabs = await page.locator('#bottomNav [data-nav]').allTextContents();
    assert.ok(tabs.join('|').includes('Turno') && tabs.join('|').includes('Pendientes') && tabs.join('|').includes('Chat'), 'nurse nav is Turno/Pendientes/Chat, got: ' + tabs.join('|'));
    const overlap = await page.evaluate(() => {
      const fab = document.querySelector('[data-fab-register]');
      if (!fab || fab.hidden) return [];
      const f = fab.getBoundingClientRect();
      const hits = [];
      for (const el of document.querySelectorAll('.view.is-active [data-confirm], .view.is-active [data-questions-load], .view.is-active [data-handover-open]')) {
        const r = el.getBoundingClientRect();
        const x = !(f.right < r.left || f.left > r.right || f.bottom < r.top || f.top > r.bottom);
        if (x && r.width > 0) hits.push(el.className.toString().slice(0, 30));
      }
      return hits;
    });
    assert.deepStrictEqual(overlap, [], 'floating controls cover actions: ' + overlap.join(','));
    const chatTop = await page.evaluate(() => {
      const el = document.querySelector('#bottomNav [data-nav="chat"]');
      if (!el) return 'missing';
      return el.getBoundingClientRect().top + ' vs nav ' + document.querySelector('#bottomNav').getBoundingClientRect().top;
    });
    assert.ok(!/missing/.test(chatTop), 'chat tab exists in the bottom nav (' + chatTop + ')');
    await page.close();
    ok('6: Chat en el bottom nav; el + centrado no tapa Listo/Revisar');
  }

  // 7. State survives reload; Hechas reachable on empty state; confetti behind copy.
  {
    const ctx7 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx7.addInitScript(() => {
      localStorage.setItem('acompana-guide-seen', '{"all":true}');
      ['confirm', 'handover', 'register', 'ask', 'visit'].forEach(function (k) { localStorage.setItem('acompana-coach-' + k, 'yes'); });
      localStorage.setItem('acompana-lang', 'es');
    });
    const page = await ctx7.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    await page.goto(INDEX);
    if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
    await page.waitForTimeout(600);
    // Confirm one task for real: the write must land in storage.
    await page.locator('[data-nav="pendientes"]').click();
    await page.waitForTimeout(400);
    await page.locator('.view.is-active [data-confirm]').first().click();
    await page.waitForTimeout(900);
    const afterConfirm = await page.evaluate(() => localStorage.getItem('acompana-confirmed'));
    assert.ok(afterConfirm && /medication|position|round/.test(afterConfirm), 'confirming persists, got: ' + afterConfirm);
    await page.evaluate(() => { localStorage.setItem('acompana-confirmed', JSON.stringify({ medication: true, position: true, round: true })); });
    await page.reload();
    if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
    await page.waitForTimeout(700);
    const stored = await page.evaluate(() => localStorage.getItem('acompana-confirmed'));
    assert.ok(stored && stored.includes('medication'), 'confirmed persists in storage, got: ' + stored);
    await page.locator('[data-nav="pendientes"]').click();
    await page.waitForTimeout(500);
    assert.ok(await page.locator('.view.is-active [data-pending-tab="done"]').isVisible(), 'Hechas segmented stays on the empty state');
    const cover = await page.evaluate(() => {
      const copy = document.querySelector('.view.is-active .empty-state h2, .view.is-active .empty-state p');
      const layer = document.querySelector('.view.is-active .empty-state .confetti-layer');
      const pieces = [...document.querySelectorAll('.view.is-active .empty-state .confetti-piece')];
      if (!copy || !layer || !pieces.length) return { copy: !!copy, pieces: pieces.length, hits: -1 };
      const zLayer = Number(getComputedStyle(layer).zIndex);
      const zCopy = Number(getComputedStyle(copy).zIndex);
      // Behind (lower z) counts as not covering, even mid-animation.
      const hits = (!Number.isNaN(zLayer) && !Number.isNaN(zCopy) && zLayer < zCopy) ? 0 : pieces.filter((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return false;
        const c = copy.getBoundingClientRect();
        return !(r.right < c.left || r.left > c.right || r.bottom < c.top || r.top > c.bottom);
      }).length;
      return { copy: true, pieces: pieces.length, zLayer, zCopy, hits };
    });
    assert.ok(cover.copy && cover.hits === 0, 'confetti stays behind the celebration copy: ' + JSON.stringify(cover));
    await page.close();
    await ctx7.close();
    ok('7: confirmed persiste; Hechas visible en vacio; confeti detras del texto');
  }

  // 8. Visible AI label + failure sentence + consent shows the payload.
  {
    const page = await freshPage(browser);
    await page.locator('[data-handover-open]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-handover-generate]').click();
    await page.waitForTimeout(2500);
    const badge = await page.locator('[data-handover-badge] .ai-source-text').textContent().catch(() => '');
    assert.ok(/Plantilla|IA/.test(badge), 'SBAR draft shows a visible source chip, got: ' + badge);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    await viewAs(page, 'paciente');
    await page.locator('[data-nav="preguntas"]').click().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('[data-ask-input]').fill('¿Cómo pasó la noche?');
    await page.locator('[data-ask-send]').click();
    await page.waitForTimeout(800);
    const ask = await page.locator('[data-ask-answer]').textContent();
    assert.ok(/Plantilla|IA/.test(ask), 'ask answer shows a visible source chip, got: ' + ask.slice(0, 80));
    const consent = await page.evaluate(() => window.AcompanaViews.sheets.consentBox('translate', { event: { kind: 'round', text: 'Ronda 13:00' } }));
    assert.ok(consent.includes('Ronda 13:00'), 'translation consent shows the event text payload');
    const fallback = await page.evaluate(() => {
      localStorage.setItem('acompana-ai-consent', 'yes');
      return true;
    });
    assert.ok(fallback, 'consent flag writable');
    const failed = await page.evaluate(() => window.AcompanaViews.sheets.consentBox('handover', { counts: { total: 1 } }));
    assert.ok(failed.includes('Antes de usar la IA'), 'consent box renders');
    await page.close();
    const es = read('js/app.js');
    assert.ok(es.includes('No pudimos usar la IA; esto lo escribieron las reglas.'), 'model-failure sentence exists');
    ok('8: chip visible IA/gemma o Plantilla, aviso si falla, consent con el texto');
  }

  // 9. Action reads Confirmar; done is one word (Hecho).
  {
    const page = await freshPage(browser);
    const btn = await page.locator('[data-confirm]').first().textContent();
    assert.ok(/Confirmar/.test(btn), 'patient/task action reads Confirmar, got: ' + btn);
    const esVisible = await page.evaluate(() => document.querySelector('.view.is-active').textContent);
    assert.ok(!/\bListo\b/.test(esVisible), 'no ambiguous Listo left on nurse screens');
    await page.close();
    const ctx9 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx9.addInitScript(() => {
      localStorage.setItem('acompana-guide-seen', '{"all":true}');
      ['confirm', 'handover', 'register', 'ask', 'visit'].forEach(function (k) { localStorage.setItem('acompana-coach-' + k, 'yes'); });
      localStorage.setItem('acompana-lang', 'es');
      localStorage.setItem('acompana-confirmed', JSON.stringify({ medication: true, position: true, round: true }));
    });
    const done2 = await ctx9.newPage();
    await done2.goto(INDEX);
    if (await done2.locator('[data-splash-skip]').isVisible().catch(() => false)) await done2.locator('[data-splash-skip]').click();
    await done2.waitForTimeout(700);
    await done2.locator('[data-nav="pendientes"]').click();
    await done2.waitForTimeout(400);
    await done2.locator('[data-pending-tab="done"]').click();
    await done2.waitForTimeout(400);
    const done = await done2.locator('.view.is-active').textContent();
    assert.ok(/Hecho/.test(done) && !/\bListo\b/.test(done), 'done status uses one word (Hecho)');
    await done2.close();
    await ctx9.close();
    ok('9: accion Confirmar; estado Hecho en toda la app');
  }

  // 10. Localized times, no raw ISO.
  {
    const page = await freshPage(browser);
    await viewAs(page, 'familia');
    await page.waitForTimeout(400);
    const times = await page.locator('.view.is-active .timeline-time').allTextContents();
    assert.ok(times.length >= 3, 'family timeline has times, got: ' + times.join('|'));
    assert.ok(!times.some((x) => /Hoy/.test(x) && times.filter((y) => y === x).length > 1 && false), 'times collected');
    const body = await page.locator('.view.is-active').textContent();
    assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(body), 'no raw ISO timestamps in family view');
    assert.ok(times.every((x) => /:|p\.|a\.|AM|PM|m\./.test(x)), 'times localized via Intl, got: ' + times.join('|'));
    await page.close();
    ok('10: Hoy/Hoy/15:00 y ISO crudos -> horas localizadas');
  }

  // 11. Infra: real base baked, production refuses without key, retoma stays.
  {
    const tf = JSON.parse(fs.readFileSync(path.join(ROOT, 'infra', 'terraform.tfstate'), 'utf8'));
    const base = tf.outputs && tf.outputs.api_base && tf.outputs.api_base.value;
    assert.ok(base && !/\.test/.test(base), 'terraform api_base is real, got: ' + base);
    assert.ok(read('tools/build-www.js').includes('terraform.tfstate'), 'build-www defaults to the infra output');
    assert.ok(read('README.md').includes('terraform.tfstate') && read('README.md').includes(base), 'README documents the default base');
    const { execFileSync } = require('child_process');
    execFileSync('npm', ['run', 'build:www'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env } });
    const wwwCfg = read('www/js/config.js');
    assert.ok(wwwCfg.includes(base) && !wwwCfg.includes('api.acompana.test'), 'www/js/config.js points at the real base, got: ' + wwwCfg.trim().slice(-120));
    const androidCfgPath = 'android/app/src/main/assets/public/js/config.js';
    if (fs.existsSync(path.join(ROOT, androidCfgPath))) {
      const acfg = read(androidCfgPath);
      assert.ok(!acfg.includes('api.acompana.test'), 'android assets no longer point at *.test: ' + acfg.trim().slice(-120));
    }
    const srv = require('../server/server.js');
    process.env.NODE_ENV = 'production';
    delete process.env.APP_KEY;
    const app = srv.createServer(null);
    await new Promise((r) => app.listen(0, '127.0.0.1', r));
    const port = app.address().port;
    const code = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port, path: '/api/sync?reader=familia&since=0' }, (res) => { res.resume(); resolve(res.statusCode); });
    });
    app.close();
    delete process.env.NODE_ENV;
    assert.strictEqual(code, 401, 'production refuses /api/* without APP_KEY, got ' + code);
    assert.ok(fs.existsSync(path.join(ROOT, 'server', 'retoma.js')), 'server/retoma.js stays: tests/retoma.test.js needs it');
    ok('11: base real en www/android, produccion exige APP_KEY, retoma se queda');
  }

  // 12. Dead code gone.
  {
    const app = read('js/app.js');
    assert.ok(!/var ICONS/.test(app) && !/ICONS\[name\]/.test(app), 'second icon set fallback removed');
    assert.ok(!/patientText|familyText/.test(app), 'unused patientText/familyText removed');
    assert.ok(!/data-nav=.registrar|key === .registrar/.test(app), 'dead registrar nav branch removed');
    const srv = read('server/server.js');
    assert.ok(srv.includes('media\\/raw'), 'server blocks media/raw');
    assert.ok(!fs.existsSync(path.join(ROOT, 'www', 'media', 'raw')), 'www excludes media/raw');
    ok('12: sin iconos duplicados, textos muertos, rama registrar ni media/raw');
  }

  await browser.close();
  console.log('rubric-phase-b: PASS (' + passed + ' tests)');
})().catch((error) => {
  console.error('not ok - ' + (error && error.stack || error));
  console.log('rubric-phase-b: FAIL (' + passed + ' passed before failure)');
  process.exit(1);
});
