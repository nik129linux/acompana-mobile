const assert = require('assert');
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout;
    window.__splashTimerAt = null;
    window.setTimeout = function () {
      if (arguments[1] === 1200 && window.__splashTimerAt === null) window.__splashTimerAt = performance.now();
      return nativeSetTimeout.apply(window, arguments);
    };
  });
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(() => document.querySelector('#splashLayer').classList.contains('is-leaving'), null, { timeout: 2500 });
  const timing = await page.evaluate(() => ({ timerAt: window.__splashTimerAt, elapsed: performance.now() - window.__splashTimerAt }));
  assert(timing.timerAt !== null, 'reduced-motion splash timer was not scheduled');
  assert(timing.elapsed >= 1100 && timing.elapsed <= 1500, `reduced-motion splash timing is ${timing.elapsed}ms`);
  await page.locator('[data-view-key="nurse-home"]').waitFor({ state: 'visible', timeout: 1000 });
  await page.waitForFunction(() => document.querySelector('#splashLayer').getAttribute('aria-hidden') === 'true', null, { timeout: 1000 });
  const phone = await page.locator('.phone').evaluate(node => ({ width: getComputedStyle(node).width, height: getComputedStyle(node).height, radius: getComputedStyle(node).borderRadius, shadow: getComputedStyle(node).boxShadow }));
  const videoState = await page.locator('.loop').evaluateAll(nodes => nodes.map(node => ({ paused: node.paused, autoplay: node.autoplay })));
  assert(videoState.length > 0 && videoState.every(state => state.paused && !state.autoplay), 'reduced-motion videos are not paused');
  assert.strictEqual(await page.locator('#splashLayer').getAttribute('aria-hidden'), 'true', 'reduced-motion splash did not finish');
  const transition = await page.locator('.view').first().evaluate(node => getComputedStyle(node).transitionDuration).catch(() => 'not-mounted');
  const splashTransition = await page.locator('#splashLayer').evaluate(node => getComputedStyle(node).transitionDuration);
  assert.strictEqual(transition, '1e-06s', 'reduced-motion transition is not disabled');
  assert.strictEqual(splashTransition, '1e-06s', 'reduced-motion splash transition is not disabled');
  assert.strictEqual(errors.length, 0, `page errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ elapsed: timing.elapsed, phone, videoState, transition, splashTransition, errors }, null, 2));
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
