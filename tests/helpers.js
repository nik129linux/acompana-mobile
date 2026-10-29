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
  } else {
    await page.locator('.role-tab[data-role="' + role + '"]').first().click();
  }
}

async function openRegister(page) {
  const fab = page.locator('[data-fab-register]');
  if (await visible(fab)) await fab.first().click();
  else await page.locator('.bottom-nav [data-nav="registrar"]').first().click();
}

module.exports = { viewAs, openRegister };
