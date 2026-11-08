(function () {
  'use strict';

  // Light/dark theme with a "system" follower. Fresh profile opens light
  // (Claro default); the choice persists. Runs before app.js so the first
  // paint already has the saved theme.
  var KEY = 'acompana-theme';
  var MODES = ['light', 'dark', 'system'];
  var t = window.AcompanaI18n.t;
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    try { return window.localStorage.getItem(KEY); } catch (error) { return null; }
  }

  function mode() {
    var value = saved();
    return MODES.indexOf(value) !== -1 ? value : 'light';
  }

  function isDark() {
    var forced = root.getAttribute('data-theme');
    if (forced === 'dark') return true;
    if (forced === 'light') return false;
    return !!(media && media.matches);
  }

  function sync() {
    var dark = isDark();
    root.classList.toggle('is-dark', dark);
    document.querySelectorAll('[data-theme-toggle]').forEach(function (toggle) {
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.setAttribute('aria-label', t(dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'));
    });
    document.querySelectorAll('[data-theme-label]').forEach(function (label) {
      label.textContent = t(dark ? 'Tema claro' : 'Tema oscuro');
    });
    document.querySelectorAll('[data-theme-mode]').forEach(function (group) {
      var current = mode();
      group.querySelectorAll('[data-theme-option]').forEach(function (button) {
        var on = button.getAttribute('data-theme-option') === current;
        button.classList.toggle('is-active', on);
        button.setAttribute('aria-pressed', String(on));
      });
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.body || root).backgroundColor);
  }

  function apply(value) {
    var next = MODES.indexOf(value) !== -1 ? value : 'light';
    if (next === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', next);
    try { window.localStorage.setItem(KEY, next); } catch (error) { /* private mode: session only */ }
    sync();
  }

  // Theme and language both change every surface: one circular reveal for both.
  function reveal(event, change) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-color-scheme: reduce)').matches;
    if (!document.startViewTransition || reduce) {
      change();
      return;
    }
    var source = event && event.currentTarget ? event.currentTarget : event && event.target;
    var box = source && source.getBoundingClientRect ? source.getBoundingClientRect() : { left: 0, top: 0, width: 0 };
    root.style.setProperty('--reveal-x', (box.left + box.width / 2) + 'px');
    root.style.setProperty('--reveal-y', (box.top + box.height / 2) + 'px');
    document.startViewTransition(change);
  }

  function toggle(event) {
    var next = isDark() ? 'light' : 'dark';
    reveal(event, function () { apply(next); });
  }

  var initial = saved();
  if (initial === 'dark') root.setAttribute('data-theme', 'dark');
  else if (initial === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', 'light');

  // Delegated so the toggle also works inside per-view app bars that are
  // created after this script runs.
  document.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('[data-theme-toggle]') : null;
    if (button) toggle(event);
  });

  document.addEventListener('DOMContentLoaded', function () {
    if (media && media.addEventListener) media.addEventListener('change', sync);
    sync();
  });

  window.acompanaTheme = { toggle: toggle, sync: sync, isDark: isDark, reveal: reveal, apply: apply, mode: mode };
}());
