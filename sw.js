'use strict';

// Service worker for Acompaña PWA.
// Precaches the app shell. Network-first, cache as offline fallback.
// NEVER caches /api/* (network only). Versioned cache name.

var CACHE = 'acompana-pwa-v18';

var SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/sw.js',
  '/css/fonts.css',
  '/fonts/poppins-latin-400-normal.woff2',
  '/fonts/poppins-latin-500-normal.woff2',
  '/fonts/poppins-latin-600-normal.woff2',
  '/js/icons.js',
  '/js/motion.js',
  '/css/components.css',
  '/css/shell.css',
  '/css/screens/sheets.css',
  '/css/screens/nurse.css',
  '/css/screens/readers.css',
  '/css/tokens.css',
  '/css/app.css',
  '/css/ai.css',
  '/css/theme.css',
  '/css/home.css',
  '/css/detail.css',
  '/css/android.css',
  '/js/theme.js',
  '/js/views/nurse.js',
  '/js/views/patient.js',
  '/js/views/family.js',
  '/js/views/sheets.js',
  '/js/views/chat.js',
  '/js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  // API is network-only: never cache, never intercept the response.
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  if (event.request.method !== 'GET') return;
  // Network-first so edits show up on the next load; the cache is only the
  // offline fallback, refreshed on every successful fetch.
  event.respondWith(
    fetch(event.request).then(function (response) {
      if (response.ok && url.origin === self.location.origin) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
      }
      return response;
    }).catch(function () {
      return caches.match(event.request).then(function (cached) {
        return cached || caches.match('/index.html');
      });
    })
  );
});
