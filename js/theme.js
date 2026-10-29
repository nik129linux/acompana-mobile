(function () {
  'use strict';

  // Light/dark theme. Runs before app.js so the first paint already has the
  // saved theme. Without a saved choice the OS preference wins (tokens.css).
  var KEY = 'acompana-theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    try { return window.localStorage.getItem(KEY); } catch (error) { return null; }
  }

  function isDark() {
    var forced = root.getAttribute('data-theme');
    if (forced) return forced === 'dark';
    return !!(media && media.matches);
  }

  function sync() {
    var dark = isDark();
    root.classList.toggle('is-dark', dark);
    var toggle = document.querySelector('[data-theme-toggle]');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.setAttribute('aria-label', dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.body || root).backgroundColor);
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    try { window.localStorage.setItem(KEY, theme); } catch (error) { /* private mode: session only */ }
    sync();
  }

  function toggle(event) {
    var next = isDark() ? 'light' : 'dark';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) {
      apply(next);
      return;
    }
    var box = event.currentTarget.getBoundingClientRect();
    root.style.setProperty('--reveal-x', (box.left + box.width / 2) + 'px');
    root.style.setProperty('--reveal-y', (box.top + box.height / 2) + 'px');
    document.startViewTransition(function () { apply(next); });
  }

  var initial = saved();
  if (initial === 'light' || initial === 'dark') root.setAttribute('data-theme', initial);

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.querySelector('[data-theme-toggle]');
    if (button) button.addEventListener('click', toggle);
    if (media && media.addEventListener) media.addEventListener('change', sync);
    sync();
  });
})();
