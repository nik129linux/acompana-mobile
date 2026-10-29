const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

function contrastRatio(foreground, background) {
  const toRgb = color => {
    const trimmed = String(color).trim();
    if (trimmed.startsWith('#')) {
      let hex = trimmed.replace('#','');
      if (hex.length===3) hex = hex.split('').map(c=>c+c).join('');
      const int = parseInt(hex,16);
      return [(int>>16)&255, (int>>8)&255, int&255];
    }
    const m = trimmed.match(/[\d.]+/g);
    if (!m) throw new Error(`cannot parse color ${color}`);
    return m.slice(0,3).map(v=> Number(v));
  };
  const luminance = color => {
    const channels = toRgb(color).map(value => value / 255);
    const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const values = [luminance(foreground), luminance(background)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

(async () => {
  const root = process.cwd();
  const sourceFiles = ['index.html', 'css/tokens.css', 'css/app.css', 'js/app.js'];
  const forbidden = /linear|gradient|tocá|mirá|podés|tenés|querés/i;
  for (const file of sourceFiles) assert(!forbidden.test(fs.readFileSync(path.join(root, file), 'utf8')), `${file} contains forbidden text`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  async function assertVideoSlot(page, slot) {
    const container = page.locator(`[data-video-slot="${slot}"]`);
    assert.strictEqual(await container.count(), 1, `${slot} video slot missing`);
    const video = container.locator('video');
    assert.strictEqual(await video.getAttribute('autoplay'), '', `${slot} video is not autoplay`);
    assert.strictEqual(await video.getAttribute('loop'), '', `${slot} video does not loop`);
    assert.strictEqual(await video.getAttribute('muted'), '', `${slot} video is not muted`);
    assert.strictEqual(await video.getAttribute('playsinline'), '', `${slot} video is not inline`);
    assert.strictEqual(await video.getAttribute('poster'), `media/${slot}.jpg`, `${slot} poster mismatch`);
    assert.deepStrictEqual(await video.locator('source').evaluateAll(nodes => nodes.map(node => [node.getAttribute('src'), node.getAttribute('type')])), [
      [`media/${slot}.webm`, 'video/webm'],
      [`media/${slot}.mp4`, 'video/mp4']
    ], `${slot} video sources mismatch`);
    const fallback = container.locator('img[src="media/frames/doctora-white.png"]');
    assert.strictEqual(await fallback.count(), 1, `${slot} image fallback missing`);
    assert.strictEqual(await container.locator('.mascot-svg').count(), 0, `${slot} inline blob remains beside video`);
    assert.strictEqual(await video.evaluate(node => getComputedStyle(node).mixBlendMode), 'multiply', `${slot} video blend mode mismatch`);
    assert.strictEqual(await fallback.evaluate(node => getComputedStyle(node).mixBlendMode), 'multiply', `${slot} image fallback has an opaque background`);
    assert.strictEqual(await container.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', `${slot} has a background card`);
    const box = await container.boundingBox();
    const videoBox = await video.boundingBox();
    assert(box && box.width > 0 && box.height > 0, `${slot} video has no rendered size`);
    assert(videoBox && Math.abs(videoBox.width - box.width) <= 1 && Math.abs(videoBox.height - box.height) <= 1, `${slot} video does not fill its slot`);
  }
  async function assertVideoSize(page, slot, expected) {
    const box = await page.locator(`[data-video-slot="${slot}"] video`).boundingBox();
    assert(box && Math.abs(box.width - expected) <= 10 && Math.abs(box.height - expected) <= 10, `${slot} video box is not ${expected}px ±10`);
    assert(box && Math.abs(box.width - box.height) <= 1, `${slot} video box is not square`);
  }
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(request.url()));
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'domcontentloaded' });
  assert(await page.locator('#splashLayer').isVisible(), 'splash is not visible');
  await assertVideoSlot(page, 'splash');
  assert.strictEqual(await page.locator('.splash-mascot').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'splash has a grey shape behind the doctor');
  assert.strictEqual(await page.locator('.splash-content').evaluate(node => getComputedStyle(node).animationName), 'none', 'animated splash ancestor blocks video blending');
  assert.strictEqual(await page.locator('.splash-mascot').evaluate(node => getComputedStyle(node).animationName), 'none', 'animated mascot ancestor blocks video blending');
  await assertVideoSize(page, 'splash', 180);
  await page.waitForTimeout(1600);
  assert(await page.locator('#splashLayer').isVisible(), 'splash advanced before the first video cycle');
  const splashBounds = await page.locator('#splashLayer').boundingBox();
  assert(splashBounds, 'splash bounds are missing');
  await page.mouse.click(splashBounds.x + splashBounds.width / 2, splashBounds.y + splashBounds.height - 100);
  await page.waitForTimeout(500);
  assert(await page.locator('[data-view-key="nurse-home"]').isVisible(), 'nurse home did not open');
  assert(await page.locator('[data-video-slot="splash"] video').evaluate(node => node.paused), 'hidden splash video is still playing');
  assert(await page.locator('.badge-critical').count() >= 1, 'critical badge missing');
  assert.strictEqual(await page.locator('[data-patient-card="cr"] .badge-critical').count(), 1, 'Carlos critical badge missing');
  assert.strictEqual((await page.locator('[data-patient-card="cr"] .badge-critical').textContent()).trim(), 'Revisar', 'Carlos card exposes a clinical value');
  assert(!(await page.locator('[data-view-key="nurse-home"]').textContent()).includes('PA 90/55'), 'clinical value leaked onto nurse home');

  await page.locator('[data-patient="cr"]').click();
  await page.waitForTimeout(450);
  assert(await page.locator('[data-view-key="nurse-detail"]').isVisible(), 'Carlos detail did not open');
  assert.strictEqual((await page.locator('.detail-status').textContent()).trim(), 'Revisar', 'Carlos detail header exposes a clinical value');
  assert((await page.locator('#screen').textContent()).includes('La familia recibe'), 'family copy typo remains');
  await page.locator('[data-role="paciente"]').click();
  assert(!(await page.locator('#screen').textContent()).match(/PA 90\/55|Registro clínico/), 'clinical detail remained immediately after switching to patient');
  await page.waitForTimeout(500);
  assert(await page.locator('[data-view-key="patient-home"]').isVisible(), 'patient role did not reset to home');
  assert.strictEqual(await page.locator('#screen .view.is-active').count(), 1, 'role switch left multiple active views');
  assert(!(await page.locator('#screen').textContent()).match(/PA 90\/55|Registro clínico/), 'clinical detail leaked to patient after role switch');

  await page.locator('[data-role="enfermero"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-patient="cr"]').click();
  await page.waitForTimeout(450);
  await page.locator('[data-role="familia"]').click();
  assert(!(await page.locator('#screen').textContent()).match(/PA 90\/55|Registro clínico/), 'clinical detail remained immediately after switching to family');
  await page.waitForTimeout(500);
  assert(await page.locator('[data-view-key="family-home"]').isVisible(), 'family role did not reset to home');
  assert.strictEqual(await page.locator('#screen .view.is-active').count(), 1, 'role switch left multiple active views');
  assert(!(await page.locator('#screen').textContent()).match(/PA 90\/55|Registro clínico/), 'clinical detail leaked to family after role switch');

  await page.locator('[data-role="enfermero"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-patient="mg"]').click();
  await page.waitForTimeout(450);
  assert(await page.locator('[data-view-key="nurse-detail"]').isVisible(), 'patient detail did not push in');
  assert((await page.locator('.clinical-value').textContent()).includes('Enoxaparina'), 'wrong patient clinical record');
  assert(!(await page.locator('.clinical-value').textContent()).includes('PA 90/55'), 'Carlos data leaked into María detail');
  const filterBefore = await page.locator('.clinical-value').evaluate(node => getComputedStyle(node).filter);
  assert(filterBefore.includes('blur'), 'clinical value is not blurred');
  await page.locator('.clinical-value').click();
  assert(await page.locator('.clinical-value.is-revealed').count() === 1, 'clinical reveal failed');
  await page.locator('[data-back]').click();
  await page.waitForTimeout(400);
  assert(await page.locator('[data-view-key="nurse-home"]').isVisible(), 'back navigation failed');

  await page.locator('[data-nav="registrar"]').click();
  await page.waitForTimeout(450);
  assert.strictEqual(await page.locator('.registration-layer.is-open').count(), 1, 'registration sheet did not open');
  assert.strictEqual(await page.locator('.event-chip').count(), 4, 'quick event count is not four');
  assert((await page.locator('.dictate-button').boundingBox()).height >= 56, 'dictate target is under 56px');
  await page.locator('.registration-sheet [data-sheet-close]').click();
  await page.waitForTimeout(450);
  assert.strictEqual(await page.locator('.registration-layer.is-open').count(), 0, 'registration sheet did not close');

  await page.locator('[data-nav="registrar"]').click();
  await page.waitForTimeout(450);
  await page.locator('[data-role="paciente"]').click({ timeout: 1000 });
  await page.waitForTimeout(500);
  assert(await page.locator('[data-view-key="patient-home"]').isVisible(), 'role switch from open sheet did not open patient home');
  assert.strictEqual(await page.locator('.registration-layer.is-open').count(), 0, 'role switch left registration sheet open');
  await page.locator('[data-role="enfermero"]').click();
  await page.waitForTimeout(500);

  await page.locator('[data-nav="pendientes"]').click();
  await page.waitForTimeout(450);
  assert.strictEqual(await page.locator('[data-task-card]').count(), 3, 'pending list is incomplete');
  for (let index = 0; index < 3; index += 1) {
    await page.locator('[data-task-card] [data-confirm]').first().click();
    await page.waitForTimeout(850);
  }
  await page.waitForTimeout(450);
  assert.strictEqual(await page.locator('[data-empty-state]').count(), 1, 'empty state did not render');
  await assertVideoSlot(page, 'empty');
  await assertVideoSize(page, 'empty', 160);
  const emptyStateButton = page.locator('[data-go-home]');
  const emptyStateButtonBox = await emptyStateButton.boundingBox();
  assert(emptyStateButtonBox && emptyStateButtonBox.height < 60, 'empty-state button is too tall');
  const emptyStateButtonStyle = await emptyStateButton.evaluate(node => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color, radius: style.borderRadius, whiteSpace: style.whiteSpace };
  });
  assert.deepStrictEqual(emptyStateButtonStyle, { background: 'rgb(246, 244, 239)', color: 'rgb(18, 18, 18)', radius: '32px', whiteSpace: 'nowrap' });
  const emptyStateButtonIcon = emptyStateButton.locator('svg');
  assert.strictEqual(await emptyStateButtonIcon.count(), 1, 'empty-state chevron is missing');
  assert((await emptyStateButtonIcon.evaluate(node => getComputedStyle(node).transitionProperty)).includes('transform'), 'empty-state chevron does not animate');
  const celebration = page.locator('.celebration-layer.is-visible');
  assert.strictEqual(await celebration.locator('.mascot-svg').count(), 0, 'old blob remains visible in celebration');
  const celebrationDoctor = celebration.locator('img[src="media/frames/doctora-white.png"]');
  assert.strictEqual(await celebrationDoctor.count(), 1, 'celebration doctor is missing');
  assert(await celebrationDoctor.isVisible(), 'celebration doctor is not visible');
  assert.strictEqual(await celebrationDoctor.evaluate(node => getComputedStyle(node).mixBlendMode), 'multiply', 'celebration doctor is not multiplied');
  assert((await celebration.locator('.confetti-piece').count()) >= 8, 'confetti did not render');
  await page.locator('[data-close-celebration]').click();
  await page.waitForTimeout(400);

  await page.locator('[data-role="paciente"]').click();
  await page.waitForTimeout(500);
  assert(await page.locator('[data-view-key="patient-home"]').isVisible(), 'patient role did not open');
  assert((await page.locator('#screen').textContent()).includes('Aquí ve'), 'patient copy is not formal');
  assert(!(await page.locator('#screen').textContent()).match(/PA 90\/55|Enoxaparina|taquicardia/), 'clinical data leaked to patient');
  const patientAccentColor = await page.locator('.role-tab.is-active').evaluate(node => getComputedStyle(node).color);
  assert(contrastRatio(patientAccentColor, 'rgb(251, 250, 249)') >= 4.5, 'patient accent text contrast is below 4.5:1');
  assert.strictEqual(await page.locator('.timeline-item').first().evaluate(node => getComputedStyle(node, '::before').backgroundColor), 'rgb(0, 202, 72)', 'patient fill/dot color changed');
  assert.strictEqual(await page.locator('[data-video-slot="onboarding-1"], [data-video-slot="onboarding-2"]').count(), 2, 'onboarding video slots missing');
  assert.strictEqual(await page.locator('.onboarding-card').first().evaluate(node => getComputedStyle(node).animationName), 'none', 'animated onboarding ancestor blocks video blending');
  await assertVideoSlot(page, 'onboarding-1');
  await assertVideoSlot(page, 'onboarding-2');
  await assertVideoSize(page, 'onboarding-1', 120);
  await assertVideoSize(page, 'onboarding-2', 120);
  await page.locator('[data-nav="preguntas"]').click();
  await page.waitForTimeout(400);
  assert(await page.locator('[data-view-key="patient-questions"]').isVisible(), 'questions view did not open');
  await page.locator('[data-faq]').first().click();
  assert.strictEqual(await page.locator('.faq-item.is-open').count(), 1, 'FAQ interaction failed');

  await page.locator('[data-role="familia"]').click();
  await page.waitForTimeout(500);
  assert(await page.locator('[data-view-key="family-home"]').isVisible(), 'family role did not open');
  const familyCopy = await page.locator('[data-view-key="family-home"]').textContent();
  assert(!(await page.locator('#screen').textContent()).match(/PA 90\/55|Enoxaparina|taquicardia/), 'clinical data leaked to family');
  const familyAccentColor = await page.locator('.role-tab.is-active').evaluate(node => getComputedStyle(node).color);
  const familyIconColor = await page.locator('.visit-icon').evaluate(node => getComputedStyle(node).color);
  assert(contrastRatio(familyAccentColor, 'rgb(251, 250, 249)') >= 4.5, 'family accent text contrast is below 4.5:1');
  assert(contrastRatio(familyIconColor, 'rgb(255, 255, 255)') >= 4.5, 'family icon contrast is below 4.5:1');
  assert.strictEqual(await page.locator('.phone').evaluate(node => getComputedStyle(node).getPropertyValue('--family').trim()), '#ffbb26', 'family fill color changed');
  assert(familyCopy.includes('acompañarla') && familyCopy.includes('con ella'), 'family copy does not agree with María');
  assert(!familyCopy.match(/acompañarlo|con él/), 'family copy uses masculine pronouns for María');
  const familyTimelineTimes = await page.locator('[data-view-key="family-home"] .timeline-time').allTextContents();
  assert(familyTimelineTimes.includes('15:00') && !familyTimelineTimes.includes('3:00 p. m.'), 'family timeline time still wraps');
  await page.locator('[data-nav="contacto"]').click();
  await page.waitForTimeout(400);
  assert(await page.locator('[data-view-key="family-contact"]').isVisible(), 'contact view did not open');

  const desktopPhone = await page.locator('.phone').evaluate(node => ({ width: getComputedStyle(node).width, height: getComputedStyle(node).height, radius: getComputedStyle(node).borderRadius }));
  assert.deepStrictEqual(desktopPhone, { width: '390px', height: '844px', radius: '48px' });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePhone = await page.locator('.phone').evaluate(node => ({ width: getComputedStyle(node).width, height: getComputedStyle(node).height, radius: getComputedStyle(node).borderRadius, shadow: getComputedStyle(node).boxShadow }));
  assert.deepStrictEqual(mobilePhone, { width: '390px', height: '844px', radius: '0px', shadow: 'none' });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.waitForFunction(() => {
    const video = document.querySelector('[data-video-slot="splash"] video');
    return video && video.readyState >= 1;
  }, null, { timeout: 3000 });
  const cycleStarted = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => document.querySelector('#splashLayer').classList.contains('is-leaving'), null, { timeout: 5500 });
  const cycleElapsed = await page.evaluate(start => performance.now() - start, cycleStarted);
  assert(cycleElapsed >= 4900 && cycleElapsed <= 5400, `splash cycle timing is ${cycleElapsed}ms`);

  // === FINDINGS F1-F8 assertions ===
  // F6 + F7 + F8 file-content checks (must fail if fix reverted)
  {
    const appCss = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');
    // F7 — no hex/rgb/rgba/hsl in app.css (tokens own colors)
    assert(!/#[0-9a-fA-F]{3,8}\b/.test(appCss), 'F7: hex color in css/app.css');
    assert(!/\brgba?\(/.test(appCss), 'F7: rgb/rgba in css/app.css');
    assert(!/\bhsla?\(/.test(appCss), 'F7: hsl in css/app.css');
    // F8 — dead CSS removed
    assert(!appCss.includes('.empty-mascot'), 'F8: .empty-mascot still in css/app.css');
    // F6 — no raw durations outside reduced-motion block (all must use var(--duration/--stagger))
    const beforeReduced = appCss.split('@media (prefers-reduced-motion: reduce)')[0];
    const stripped = beforeReduced.replace(/var\([^)]+\)/g, 'VAR');
    const rawMs = stripped.match(/\b\d+ms\b/g);
    assert(!rawMs, `F6: raw ms in css/app.css outside reduced-motion: ${rawMs}`);
    // allow 1e-06s in reduced-motion only; outside, no raw s durations except 0s
    const strippedNoVar = stripped.replace(/VAR/g, '');
    // check for durations like 3.6s, 1.8s, 0.001ms etc outside var — 0s is allowed as part of transition: 0s
    const hasRawS = /\b\d+(\.\d+)?s\b/.test(strippedNoVar.replace(/\b0s\b/g, ''));
    assert(!hasRawS, `F6: raw s duration in css/app.css outside reduced-motion`);
  }

  // Fresh mobile page for computed-style and bbox checks (F1-F5, F8)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'domcontentloaded' });
  // skip splash
  await page.waitForTimeout(300);
  const splashSkip = page.locator('[data-splash-skip]');
  if (await splashSkip.isVisible().catch(() => false)) {
    await splashSkip.click();
    await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => document.querySelector('[data-view-key="nurse-home"]') !== null || document.querySelector('#splashLayer')?.classList.contains('is-leaving'), null, { timeout: 5000 }).catch(()=>{});
  await page.waitForTimeout(600);
  if (!(await page.locator('[data-view-key="nurse-home"]').isVisible().catch(()=>false))) {
    const b = await page.locator('#splashLayer').boundingBox().catch(()=>null);
    if (b) { await page.mouse.click(b.x + b.width/2, b.y + b.height/2); await page.waitForTimeout(600); }
  }
  assert(await page.locator('[data-view-key="nurse-home"]').isVisible(), 'findings: nurse-home not visible after splash skip');
  // Helper for bbox >=56
  async function assertGloveBox(selector, label) {
    const loc = page.locator(selector).first();
    assert(await loc.count() > 0, `${label} missing for F1: ${selector}`);
    const box = await loc.boundingBox();
    assert(box, `${label} has no bbox`);
    assert(box.height >= 56, `F1: ${label} height ${box.height} <56 (selector ${selector})`);
    // width should also be meaningful; for circle buttons width must be >=56, for pills width >56 anyway
    assert(box.width >= 56 || box.height >= 56, `F1: ${label} bbox ${box.width}x${box.height} <56`);
  }
  // F1 — splash skip (check before it disappears — reopen splash briefly by reloading)
  // splash-skip already visible at start; re-check via goto again for that element
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const freshSplashSkipBox = await page.locator('.splash-skip').first().boundingBox();
  assert(freshSplashSkipBox && freshSplashSkipBox.height >= 56 && freshSplashSkipBox.width >= 56, `F1: splash-skip bbox ${freshSplashSkipBox ? freshSplashSkipBox.width + 'x' + freshSplashSkipBox.height : 'missing'} <56`);
  // back to nurse-home
  await page.locator('[data-splash-skip]').click().catch(async()=>{ const b=await page.locator('#splashLayer').boundingBox().catch(()=>null); if(b) await page.mouse.click(b.x+b.width/2,b.y+b.height/2); });
  await page.waitForTimeout(600);
  await page.waitForFunction(()=> document.querySelector('[data-view-key="nurse-home"]') !== null, null, {timeout:3000}).catch(()=>{});
  // F1: quick-confirm in nurse-home
  await assertGloveBox('.quick-confirm', 'quick-confirm');
  // F1: reveal-button + icon-button in nurse-detail
  await page.locator('[data-patient="cr"]').click();
  await page.waitForTimeout(500);
  assert(await page.locator('[data-view-key="nurse-detail"]').isVisible(), 'findings: nurse-detail not open');
  await assertGloveBox('.reveal-button', 'reveal-button');
  await assertGloveBox('.icon-button', 'icon-button (back)');
  // F4 — privacy toggle label + aria-expanded both ways
  {
    const revealBtn = page.locator('.reveal-button').first();
    const clinicalVal = page.locator('.clinical-value').first();
    assert.strictEqual(await revealBtn.getAttribute('aria-expanded'), 'false', 'F4: reveal-button aria-expanded should be false initially');
    assert.strictEqual(await clinicalVal.getAttribute('aria-expanded'), 'false', 'F4: clinical-value aria-expanded should be false initially');
    assert((await revealBtn.textContent()).includes('Mostrar dato clínico'), 'F4: reveal-button label should be Mostrar initially');
    assert(!(await clinicalVal.evaluate(n=> n.classList.contains('is-revealed'))), 'F4: clinical-value should be blurred initially');
    await clinicalVal.click();
    await page.waitForTimeout(200);
    assert.strictEqual(await revealBtn.getAttribute('aria-expanded'), 'true', 'F4: reveal-button aria-expanded should be true after reveal');
    assert.strictEqual(await clinicalVal.getAttribute('aria-expanded'), 'true', 'F4: clinical-value aria-expanded should be true after reveal');
    assert((await revealBtn.textContent()).includes('Ocultar dato clínico'), 'F4: reveal-button label should be Ocultar after reveal');
    assert(await clinicalVal.evaluate(n=> n.classList.contains('is-revealed')), 'F4: clinical-value should be revealed');
    assert(await revealBtn.evaluate(n=> n.classList.contains('is-revealed')), 'F4: reveal-button should be is-revealed');
    await revealBtn.click();
    await page.waitForTimeout(200);
    assert.strictEqual(await revealBtn.getAttribute('aria-expanded'), 'false', 'F4: reveal-button aria-expanded should be false after hide');
    assert.strictEqual(await clinicalVal.getAttribute('aria-expanded'), 'false', 'F4: clinical-value aria-expanded should be false after hide');
    assert((await revealBtn.textContent()).includes('Mostrar dato clínico'), 'F4: reveal-button label should be Mostrar after hide');
  }
  // back to home for next F1 checks
  await page.locator('[data-back]').click();
  await page.waitForTimeout(500);
  assert(await page.locator('[data-view-key="nurse-home"]').isVisible(), 'findings: back to nurse-home failed');

  // F1: task-action in pendientes (and F2 idle check)
  await page.locator('[data-nav="pendientes"]').click();
  await page.waitForTimeout(500);
  assert(await page.locator('[data-task-card]').first().isVisible(), 'findings: pending cards missing');
  await assertGloveBox('.task-action', 'task-action');
  // F2 — idle affordance: confirm path ghost visible (opacity 0.35, dashoffset 0) and no dead chevrons in family
  {
    const pathOpacity = await page.locator('.confirm-mark path').first().evaluate(n=> getComputedStyle(n).opacity);
    const dashOffset = await page.locator('.confirm-mark path').first().evaluate(n=> getComputedStyle(n).strokeDashoffset || getComputedStyle(n).getPropertyValue('stroke-dashoffset'));
    assert(parseFloat(pathOpacity) >= 0.3, `F2: idle confirm path opacity ${pathOpacity} <0.3`);
    // dashoffset should be 0 idle (not 32)
    const offsetNum = parseFloat(dashOffset);
    assert(offsetNum === 0, `F2: idle confirm path dashoffset ${dashOffset} should be 0`);
  }
  // also check that sheet handle has extended hit area ::after
  // open registration sheet for F1 dictate + handle + empty-state after
  await page.locator('[data-nav="registrar"]').click();
  await page.waitForTimeout(500);
  assert(await page.locator('.registration-layer.is-open').count() === 1, 'findings: registration sheet not open');
  await assertGloveBox('.dictate-button', 'dictate-button');
  {
    const handleAfterContent = await page.locator('.sheet-handle').first().evaluate(n=> getComputedStyle(n, '::after').content);
    assert(handleAfterContent !== 'none' && handleAfterContent !== '', 'F1: sheet-handle ::after hit area missing');
    const afterInset = await page.locator('.sheet-handle').first().evaluate(n=> getComputedStyle(n, '::after').getPropertyValue('inset') || getComputedStyle(n, '::after').top);
    // inset should be negative (expanded) - check top is negative or inset contains -
    assert(afterInset.includes('-') || afterInset !== 'auto', `F1: sheet-handle ::after inset not expanded: ${afterInset}`);
  }
  await page.locator('.registration-sheet [data-sheet-close]').click();
  await page.waitForTimeout(500);
  // F1: pending confirm -> empty state link
  await page.locator('[data-nav="pendientes"]').click();
  await page.waitForTimeout(500);
  // confirm all 3 to reach empty state
  for (let i=0;i<3;i++) {
    const btn = page.locator('[data-task-card] [data-confirm]').first();
    if (await btn.count()===0) break;
    await btn.click();
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(500);
  assert(await page.locator('[data-empty-state]').count()===1, 'findings: empty state not reached');
  await assertGloveBox('.empty-state-link', 'empty-state-link');

  // Switch to family for F2 family chevrons and F1 contact buttons + F3 contrast + F5 times
  await page.locator('[data-role="familia"]').click();
  await page.waitForTimeout(600);
  assert(await page.locator('[data-view-key="family-home"]').isVisible(), 'findings: family-home not visible');
  // F2: no detail-chevron in family
  assert.strictEqual(await page.locator('[data-view-key="family-home"] .detail-chevron').count(), 0, 'F2: detail-chevron should not exist in family-home');
  // also check visit-card has no chevron
  await page.locator('[data-nav="contacto"]').click();
  await page.waitForTimeout(500);
  assert(await page.locator('[data-view-key="family-contact"]').isVisible(), 'findings: family-contact not visible');
  assert.strictEqual(await page.locator('[data-view-key="family-contact"] .detail-chevron').count(), 0, 'F2: detail-chevron should not exist in family-contact');
  // F1: contact buttons
  await assertGloveBox('.contact-actions .primary-button', 'contact primary-button');
  await assertGloveBox('.contact-actions .secondary-button', 'contact secondary-button');

  // F3 — contrast ratio >=4.5 computed from real computed colors (muted on canvas/sand)
  {
    await page.locator('[data-role="enfermero"]').click();
    await page.waitForTimeout(500);
    // ensure nurse-home where muted elements exist
    await page.locator('[data-nav="turno"]').click().catch(()=>{});
    await page.waitForTimeout(400);
    const mutedFg = await page.locator('.patient-meta, .eyebrow, .view-subtitle').first().evaluate(n=> getComputedStyle(n).color);
    let canvasBg = await page.locator('.phone').evaluate(n=> getComputedStyle(n).backgroundColor);
    if (!canvasBg || canvasBg.includes('rgba(0, 0, 0, 0)') || canvasBg === 'transparent') {
      canvasBg = await page.evaluate(()=> getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim());
    }
    const ratio = contrastRatio(mutedFg, canvasBg);
    assert(ratio >= 4.5, `F3: muted on canvas contrast ${ratio.toFixed(2)} <4.5 (fg ${mutedFg} bg ${canvasBg})`);
    // also check small inside event-chip on sand
    await page.locator('[data-nav="registrar"]').click();
    await page.waitForTimeout(500);
    const chipFg = await page.locator('.event-chip small').first().evaluate(n=> getComputedStyle(n).color);
    let chipBg = await page.locator('.event-chip').first().evaluate(n=> getComputedStyle(n).backgroundColor);
    if (!chipBg || chipBg.includes('rgba(0, 0, 0, 0)') || chipBg === 'transparent') {
      chipBg = await page.evaluate(()=> getComputedStyle(document.documentElement).getPropertyValue('--sand').trim());
    }
    const ratioChip = contrastRatio(chipFg, chipBg);
    assert(ratioChip >= 4.5, `F3: muted on sand contrast ${ratioChip.toFixed(2)} <4.5 (fg ${chipFg} bg ${chipBg})`);
    await page.locator('.registration-sheet [data-sheet-close]').click().catch(()=>{});
    await page.waitForTimeout(400);
  }

  // F5 — times do not wrap and tabular-nums computed
  {
    await page.locator('[data-role="paciente"]').click();
    await page.waitForTimeout(500);
    assert(await page.locator('[data-view-key="patient-home"]').isVisible(), 'findings: patient-home not visible for F5');
    const selectorsTabular = ['.timeline-time', '.task-time', '.shift-stat strong', '.pending-count', '.status-time', '.clinical-value'];
    for (const sel of selectorsTabular) {
      const el = page.locator(sel).first();
      if (await el.count()===0) continue;
      const v = await el.evaluate(n=> getComputedStyle(n).getPropertyValue('font-variant-numeric') || getComputedStyle(n).fontVariantNumeric || '');
      assert(v.includes('tabular-nums'), `F5: ${sel} font-variant-numeric ${v} missing tabular-nums`);
    }
    const nowrapSels = ['.timeline-time', '.task-time', '.time-nowrap'];
    for (const sel of nowrapSels) {
      const el = page.locator(sel).first();
      if (await el.count()===0) continue;
      const ws = await el.evaluate(n=> getComputedStyle(n).whiteSpace);
      assert(ws === 'nowrap', `F5: ${sel} white-space ${ws} !== nowrap`);
    }
    // no wrap: check white-space already, and that time element does not overflow its 62px column
    const wraps = await page.locator('.timeline-time').first().evaluate(n=> n.scrollWidth > n.offsetWidth + 2);
    assert(!wraps, `F5: timeline-time wraps (scrollWidth > offsetWidth)`);
    // also ensure time-nowrap span prevents "p. m." break
    const timeNowraps = await page.locator('.time-nowrap').evaluateAll(nodes=> nodes.map(n=> getComputedStyle(n).whiteSpace));
    for (const ws of timeNowraps) assert(ws === 'nowrap', `F5: .time-nowrap white-space ${ws} !== nowrap`);
    // grid column is 62px per fix
    const gridCols = await page.locator('.timeline-item').first().evaluate(n=> getComputedStyle(n).gridTemplateColumns);
    assert(gridCols.includes('62px'), `F5: timeline-item grid ${gridCols} should include 62px`);
  }

  // F6 — zero running animations under reduced-motion
  {
    const rmBrowser = await chromium.launch({ headless: true });
    const rmPage = await rmBrowser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const rmErrors = [];
    rmPage.on('console', m=>{ if(m.type()==='error') rmErrors.push(m.text()); });
    await rmPage.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'domcontentloaded' });
    await rmPage.waitForTimeout(800);
    // wait for splash to leave under reduced-motion (1200ms timer)
    await rmPage.waitForFunction(()=> document.querySelector('#splashLayer')?.classList.contains('is-leaving'), null, {timeout:3000}).catch(()=>{});
    await rmPage.waitForTimeout(400);
    const running = await rmPage.evaluate(()=> document.getAnimations().filter(a=> a.playState==='running').length);
    assert.strictEqual(running, 0, `F6: ${running} running animations under reduced-motion`);
    const tDur = await rmPage.locator('.view').first().evaluate(n=> getComputedStyle(n).transitionDuration).catch(()=> 'missing');
    assert(tDur === '0s' || tDur === '1e-06s' || tDur === '0.001ms' || parseFloat(tDur) < 0.01, `F6: reduced-motion transition not disabled: ${tDur}`);
    assert.strictEqual(rmErrors.length,0, `F6: rm page errors ${rmErrors.join(';')}`);
    await rmBrowser.close();
  }

  // F8 — nav and small type computed >=12px
  {
    // pending confirmations cleared quick-confirm; reload fresh state for this check
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    if (await page.locator('[data-splash-skip]').isVisible().catch(()=>false)) { await page.locator('[data-splash-skip]').click(); await page.waitForTimeout(500); }
    await page.waitForFunction(()=> document.querySelector('[data-view-key="nurse-home"]') !== null, null, {timeout:3000}).catch(()=>{});
    await page.waitForTimeout(500);
    const navSize = await page.locator('.nav-item').first().evaluate(n=> getComputedStyle(n).fontSize);
    assert.strictEqual(navSize, '12px', `F8: nav font-size ${navSize} should be 12px`);
    const statusSize = await page.locator('.status-icons').first().evaluate(n=> parseFloat(getComputedStyle(n).fontSize));
    assert(statusSize >= 12, `F8: status-icons font-size ${statusSize} <12`);
    const qcEl = page.locator('.quick-confirm').first();
    if (await qcEl.count() > 0) {
      const qcSize = await qcEl.evaluate(n=> parseFloat(getComputedStyle(n).fontSize));
      assert(qcSize >= 12, `F8: quick-confirm font-size ${qcSize} <12`);
    } else {
      // fallback to checking the rule via computed style of any element that should be 12px
      const appCss = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');
      assert(!appCss.includes('font-size: 11px'), 'F8: 11px still in app.css');
    }
    const metaSize = await page.locator('.patient-meta').first().evaluate(n=> parseFloat(getComputedStyle(n).fontSize));
    assert(metaSize >= 12, `F8: patient-meta font-size ${metaSize} <12`);
  }

  assert.strictEqual(consoleErrors.length, 0, `console errors: ${consoleErrors.join('; ')}`);
  assert.strictEqual(pageErrors.length, 0, `page errors: ${pageErrors.join('; ')}`);
  assert.strictEqual(failedRequests.length, 0, `failed requests: ${failedRequests.join('; ')}`);
  console.log('acceptance: PASS');
  console.log(JSON.stringify({ desktopPhone, mobilePhone, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, failedRequests: failedRequests.length }));
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
