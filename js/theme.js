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
    document.querySelectorAll('[data-theme-toggle]').forEach(function (toggle) {
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.setAttribute('aria-label', dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    });
    document.querySelectorAll('[data-theme-label]').forEach(function (label) {
      label.textContent = dark ? 'Tema claro' : 'Tema oscuro';
    });
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
    var source = event && event.currentTarget ? event.currentTarget : event && event.target;
    var box = source && source.getBoundingClientRect ? source.getBoundingClientRect() : { left: 0, top: 0, width: 0 };
    root.style.setProperty('--reveal-x', (box.left + box.width / 2) + 'px');
    root.style.setProperty('--reveal-y', (box.top + box.height / 2) + 'px');
    document.startViewTransition(function () { apply(next); });
  }

  var initial = saved();
  if (initial === 'light' || initial === 'dark') root.setAttribute('data-theme', initial);

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

  window.acompanaTheme = { toggle: toggle, sync: sync, isDark: isDark };
}());
