'use strict';

// Shared UI steps that survive the move from in-app role tabs and a
// "Registrar" nav tab to an Android-style demo menu and a FAB.

async function visible(locator) {
  return (await locator.count()) > 0 && locator.first().isVisible().catch(() => false);
}

// Switch the reader the way a person would: close any open sheet, then use
// the demo "Ver como" menu if the app has one, else the role tabs.
async function viewAs(page, role) {
  if (await visible(page.locator('.registration-layer.is-open, .ai-layer.is-open'))) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  }
  const menu = page.locator('[data-demo-menu]');
  if (await visible(menu)) {
    await menu.first().click();
    await page.locator('[data-view-as="' + role + '"]').first().click();
    return;
  }
  const tab = page.locator('.role-tab[data-role="' + role + '"]');
  if (await visible(tab)) {
    await tab.first().click();
    return;
  }
  // Phone stage (no role tabs): switch readers from Settings > Demo mode.
  await openSettings(page);
  await page.locator('.view.is-active [data-view-as="' + role + '"]').first().click();
  await page.waitForTimeout(400);
}

async function openSettings(page) {
  const gear = page.locator('[data-nav-settings]').first();
  if (await visible(gear)) await gear.click();
  else {
    const cfg = page.locator('#bottomNav [data-nav="config"]');
    if (await visible(cfg)) await cfg.first().click();
  }
  await page.waitForTimeout(400);
}

async function setLang(page, lang) {
  await openSettings(page);
  await page.locator('.view.is-active [data-set-lang="' + lang + '"]').first().click();
  await page.waitForTimeout(400);
}

async function triggerError(page) {
  await openSettings(page);
  await page.locator('.view.is-active [data-simulate-error]').first().click();
  await page.waitForTimeout(500);
}

async function openRegister(page) {
  // The +FAB hides on Settings/Help (and for other readers): step back to the
  // tab first, then use the FAB (or the detail CTA that replaces it).
  let fab = page.locator('[data-fab-register]');
  if (!(await visible(fab))) {
    const back = page.locator('.view.is-active [data-settings-back]');
    if (await visible(back)) {
      await back.first().click();
      await page.waitForTimeout(450);
    }
  }
  fab = page.locator('[data-fab-register]');
  if (await visible(fab)) await fab.first().click();
  else await page.locator('.view.is-active [data-open-register]').first().click();
}

module.exports = { viewAs, openRegister, openSettings, setLang, triggerError };
