(function () {
  'use strict';

  // Motion helpers (DESIGN.md §9.6). Web Animations API on transform/opacity
  // only; with reduced motion every helper jumps to the final state.
  var EASE_ENTER = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var EASE_SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function canAnimate(el) {
    return el && typeof el.animate === 'function' && !reduced();
  }

  // Children rise 12px and fade in, one after another.
  function stagger(container, selector, options) {
    if (!container) return;
    var items = container.querySelectorAll(selector || ':scope > *');
    var step = (options && options.step) || 60;
    var delay = (options && options.delay) || 80;
    Array.prototype.forEach.call(items, function (el, i) {
      if (!canAnimate(el)) return;
      el.animate(
        [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
        { duration: 520, delay: delay + i * step, easing: EASE_ENTER, fill: 'backwards' }
      );
    });
  }

  // A soft spring pop, for confirmations and the success check.
  function pop(el, options) {
    if (!canAnimate(el)) return;
    var from = (options && options.from) || 0.6;
    el.animate(
      [{ opacity: 0, transform: 'scale(' + from + ')' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: (options && options.duration) || 620, easing: EASE_SPRING, fill: 'backwards', delay: (options && options.delay) || 0 }
    );
  }

  // Draw an SVG stroke (path or polyline) from nothing.
  function draw(path, options) {
    if (!path || reduced() || typeof path.getTotalLength !== 'function') return;
    var length = path.getTotalLength();
    path.style.strokeDasharray = String(length);
    path.animate(
      [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
      { duration: (options && options.duration) || 420, delay: (options && options.delay) || 0, easing: EASE_ENTER, fill: 'backwards' }
    );
  }

  // FLIP: animate `to` from the box of `from` (card -> detail header).
  function sharedElement(from, to) {
    if (!from || !canAnimate(to)) return;
    var a = from.getBoundingClientRect();
    var b = to.getBoundingClientRect();
    if (!a.width || !b.width) return;
    var dx = a.left - b.left;
    var dy = a.top - b.top;
    var sx = a.width / b.width;
    var sy = a.height / b.height;
    to.animate(
      [{ transformOrigin: 'top left', transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')' },
       { transformOrigin: 'top left', transform: 'none' }],
      { duration: 460, easing: EASE_ENTER }
    );
  }

  // A small press bounce for buttons that confirm something.
  function press(el) {
    if (!canAnimate(el)) return;
    el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(0.92)' }, { transform: 'scale(1)' }],
      { duration: 280, easing: EASE_SPRING }
    );
  }

  window.AcompanaMotion = { reduced: reduced, stagger: stagger, pop: pop, draw: draw, sharedElement: sharedElement, press: press };
})();
