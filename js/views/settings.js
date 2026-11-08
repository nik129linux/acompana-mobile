(function () {
  'use strict';

  var V = window.AcompanaViews = window.AcompanaViews || {};
  var t = window.AcompanaI18n.t;
  function ctx() { return V.ctx; }
  function escapeHtml(value) { return ctx().escapeHtml(value); }
  function icon(name) { return ctx().icon(name); }

  var GUIDE_KEY = 'acompana-guide-seen';
  var COACH_PREFIX = 'acompana-coach-';

  function readJson(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch (error) { return null; }
  }

  function guideSeen(role) {
    var seen = readJson(GUIDE_KEY) || {};
    return Boolean(seen[role || 'all'] || seen.all);
  }

  function markGuideSeen(role) {
    var seen = readJson(GUIDE_KEY) || {};
    seen[role || 'all'] = true;
    seen.all = true;
    try { window.localStorage.setItem(GUIDE_KEY, JSON.stringify(seen)); } catch (error) {}
  }

  function coachSeen(key) {
    try { return window.localStorage.getItem(COACH_PREFIX + key) === 'yes'; } catch (error) { return true; }
  }

  function markCoachSeen(key) {
    try { window.localStorage.setItem(COACH_PREFIX + key, 'yes'); } catch (error) {}
  }

  function guideSteps(role) {
    if (role === 'paciente') {
      return [
        { title: 'Lo que sigue', body: 'Mira lo esencial del turno en palabras claras.' },
        { title: 'Su día de hoy', body: 'Sigue el tratamiento en palabras sencillas.' },
        { title: 'Cómo preguntar', body: 'Escribe tu duda con calma' }
      ];
    }
    if (role === 'familia') {
      return [
        { title: 'Tu resumen sencillo', body: 'Un resumen sencillo de su cuidado.' },
        { title: 'Visita y contacto', body: 'Horarios de visita y cómo hablar con el equipo.' },
        { title: 'Pregunta al equipo', body: 'Escribe tu duda y el equipo responde.' }
      ];
    }
    return [
      { title: 'Tu turno a la vista', body: 'Mira tus pacientes y lo que falta por hacer.' },
      { title: 'Registra en un toque', body: 'Confirma o registra cada cuidado justo cuando pasa.' },
      { title: 'La IA solo ayuda con tu permiso', body: 'Borradores y respuestas solo si aceptas. Tus datos se quedan aquí.' }
    ];
  }

  function helpHtml() {
    var faq = [
      ['Turno: la lista de pacientes y sus tareas.', 'Tus pacientes'],
      ['Pendientes: confirma tareas y revisa lo hecho.', 'Pendientes'],
      ['Chat: habla con la familia y el equipo.', 'Chat'],
      ['Registrar: anota cada cuidado con el botón +.', 'Registrar'],
      ['Entrega de turno (SBAR): borrador editable antes de copiar.', 'Entrega de turno'],
      ['Mi estado: lo que sigue y su día en palabras sencillas.', 'Mi estado'],
      ['Preguntas: respuestas del equipo y dudas frecuentes.', 'Preguntas'],
      ['Qué pasa: resumen sencillo del cuidado.', 'Qué pasa'],
      ['Contacto: llamar, escribir o ver horarios de visita.', 'Contacto']
    ];
    var statuses = ['Revisar', 'Medicación 11:00', '1 toque', 'Hecho', 'Registrado', 'Pendiente', 'Confirmar', 'Plantilla', 'Borrador con IA'];
    var icons = ['list', 'clock', 'message', 'heart', 'help', 'phone', 'pill', 'move', 'ruler', 'mic', 'clipboard', 'eye', 'shield', 'calendar', 'check'];
    return '<div class="help-block"><h3>' + escapeHtml(t('Todo lo que hace la guía')) + '</h3>' +
      '<div class="faq-list">' + faq.map(function (item, i) {
        return '<article class="faq-item" data-faq-item="help-' + i + '"><button type="button" class="faq-question" data-faq="help-' + i + '" aria-expanded="false"><span class="question-text">' + escapeHtml(t(item[1])) + '</span></button><div class="faq-answer"><div>' + escapeHtml(t(item[0])) + '</div></div></article>';
      }).join('') + '</div></div>' +
      '<div class="help-block"><h3>' + escapeHtml(t('Iconos y estados')) + '</h3><ul class="help-icons">' +
      icons.map(function (name) { return '<li><span class="help-icon" aria-hidden="true">' + icon(name) + '</span><span>' + escapeHtml(name) + '</span></li>'; }).join('') +
      statuses.map(function (s) { return '<li><span class="status-pill">' + escapeHtml(t(s)) + '</span></li>'; }).join('') + '</ul></div>' +
      '<div class="help-block"><h3>' + escapeHtml(t('Glosario')) + '</h3><dl class="help-gloss">' +
      '<dt>SBAR</dt><dd>' + escapeHtml(t('SBAR: Situación, Antecedentes, Evaluación, Recomendación.')) + '</dd>' +
      '<dt>' + escapeHtml(t('Ronda')) + '</dt><dd>' + escapeHtml(t('Ronda: revisión periódica de signos.')) + '</dd></dl></div>';
  }

  function aiOn() {
    try { return window.localStorage.getItem('acompana-ai-consent') === 'yes'; } catch (error) { return false; }
  }

  function renderSettings(role) {
    var lang = window.AcompanaI18n.lang();
    var themeMode = window.acompanaTheme ? window.acompanaTheme.mode() : 'light';
    var on = aiOn();
    var themeBtn = function (value, label) {
      var active = themeMode === value;
      return '<button type="button" class="segment' + (active ? ' is-active' : '') + '" data-set-theme="' + value + '" data-theme-option="' + value + '" aria-pressed="' + String(active) + '">' + escapeHtml(t(label)) + '</button>';
    };
    return '<div class="view-header" data-settings-screen><button type="button" class="icon-button back-button" data-back data-settings-back aria-label="' + escapeHtml(t('Atrás')) + '"><span class="arrow-icon" aria-hidden="true">' + icon('arrow') + '</span></button><div class="view-header-copy"><h1 class="view-title small-title screen-title">' + escapeHtml(t('Configuración')) + '</h1></div></div>' +
      '<section class="settings-block" aria-labelledby="set-lang"><h2 id="set-lang">' + escapeHtml(t('Idioma')) + '</h2>' +
      '<div class="segmented" role="group" aria-label="' + escapeHtml(t('Idioma')) + '">' +
      '<button type="button" class="segment' + (lang === 'es' ? ' is-active' : '') + '" data-set-lang="es" aria-pressed="' + String(lang === 'es') + '">Español</button>' +
      '<button type="button" class="segment' + (lang === 'en' ? ' is-active' : '') + '" data-set-lang="en" aria-pressed="' + String(lang === 'en') + '" lang="en">English</button></div></section>' +
      '<section class="settings-block" aria-labelledby="set-theme"><h2 id="set-theme">' + escapeHtml(t('Tema')) + '</h2>' +
      '<div class="segmented" role="group" aria-label="' + escapeHtml(t('Tema')) + '" data-theme-mode>' + themeBtn('light', 'Claro') + themeBtn('dark', 'Oscuro') + themeBtn('system', 'Sistema') + '</div></section>' +
      '<section class="settings-block" aria-labelledby="set-ai"><h2 id="set-ai">' + escapeHtml(t('Inteligencia artificial')) + '</h2>' +
      '<p class="view-copy">' + escapeHtml(t('Solo funciona con tu permiso. Puedes cambiarlo cuando quieras.')) + '</p>' +
      '<p class="ai-state" role="status">' + escapeHtml(t(on ? 'Con IA' : 'Sin IA')) + '</p>' +
      '<button type="button" class="btn btn-secondary" data-ai-toggle>' + escapeHtml(t(on ? 'Desactivar' : 'Activar')) + '</button></section>' +
      '<section class="settings-block" aria-labelledby="set-priv"><h2 id="set-priv">' + escapeHtml(t('Privacidad')) + '</h2>' +
      '<p class="view-copy"><strong>' + escapeHtml(t('Qué se guarda en este equipo')) + '</strong><br>' + escapeHtml(t('Idioma, tema, permiso de IA, eventos del turno y guía vista. Nada sale sin tu permiso.')) + '</p>' +
      '<button type="button" class="btn btn-secondary" data-wipe>' + escapeHtml(t('Borrar mis datos')) + '</button></section>' +
      '<section class="settings-block" aria-labelledby="set-help"><h2 id="set-help">' + escapeHtml(t('Ayuda')) + '</h2>' +
      '<button type="button" class="btn btn-tonal" data-guide-replay>' + escapeHtml(t('Ver la guía otra vez')) + '</button>' + helpHtml() + '</section>' +
      '<section class="settings-block" aria-labelledby="set-demo"><h2 id="set-demo">' + escapeHtml(t('Modo demostración')) + '</h2>' +
      '<div class="segmented" role="radiogroup" aria-label="' + escapeHtml(t('Ver como')) + '">' +
      ['enfermero', 'paciente', 'familia'].map(function (r) {
        var label = r === 'enfermero' ? 'Enfermero' : r === 'paciente' ? 'Paciente' : 'Familia';
        return '<button type="button" class="segment' + (role === r ? ' is-active' : '') + '" role="radio" aria-checked="' + String(role === r) + '" data-view-as="' + r + '">' + escapeHtml(t(label)) + '</button>';
      }).join('') + '</div>' +
      '<button type="button" class="btn btn-secondary" data-simulate-error>' + escapeHtml(t('Simular un error')) + '</button></section>';
  }

  // ---- Guide overlay (level 1) + coach marks (level 2) ----
  var guideReturn = null;

  function ensureLayer() {
    var layer = document.getElementById('guideLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'guideLayer';
    layer.className = 'guide-layer';
    layer.setAttribute('aria-hidden', 'true');
    var phone = document.querySelector('.phone');
    (phone || document.body).appendChild(layer);
    layer.addEventListener('click', function (event) {
      if (event.target.closest('[data-coach-close]')) { closeCoach(); return; }
      if (event.target.closest('[data-guide-done]') || event.target.closest('[data-guide-close]')) { closeGuide(); return; }
      var next = event.target.closest('[data-guide-next]');
      if (next) { openGuide(layer.dataset.role || 'enfermero', Number(next.getAttribute('data-guide-index')) + 1); return; }
      var prev = event.target.closest('[data-guide-prev]');
      if (prev) { openGuide(layer.dataset.role || 'enfermero', Number(layer.dataset.step || '1') - 1); }
    });
    return layer;
  }

  function trapFocus(container, event) {
    var focusable = container.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
    focusable = Array.prototype.filter.call(focusable, function (el) { return !el.disabled; });
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function openGuide(role, step) {
    var layer = ensureLayer();
    var steps = guideSteps(role);
    var index = Math.max(0, Math.min(step || 0, steps.length - 1));
    guideReturn = document.activeElement;
    var dots = steps.map(function (_, i) { return '<span class="guide-dot' + (i === index ? ' is-active' : '') + '" aria-hidden="true"></span>'; }).join('');
    layer.innerHTML = '<div class="guide-backdrop" data-guide-close></div>' +
      '<section class="guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-title" data-guide-card>' +
      '<h2 id="guide-title">' + escapeHtml(t('Bienvenido a Acompaña')) + '</h2>' +
      '<p class="guide-step-title">' + escapeHtml(t(steps[index].title)) + '</p>' +
      '<p class="guide-step-body">' + escapeHtml(t(steps[index].body)) + '</p>' +
      '<div class="guide-dots" aria-hidden="true">' + dots + '</div>' +
      '<div class="guide-actions">' +
      (index > 0 ? '<button type="button" class="btn btn-secondary" data-guide-prev>' + escapeHtml(t('Atrás')) + '</button>' : '') +
      (index < steps.length - 1
        ? '<button type="button" class="btn btn-primary" data-guide-next data-guide-index="' + index + '">' + escapeHtml(t('Siguiente')) + '</button>'
        : '<button type="button" class="btn btn-primary" data-guide-done>' + escapeHtml(t('Listo')) + '</button>') +
      '<button type="button" class="guide-skip" data-guide-close>' + escapeHtml(t('Saltar')) + '</button>' +
      '<button type="button" class="icon-button guide-x" data-guide-close aria-label="' + escapeHtml(t('Cerrar guía')) + '">✕</button>' +
      '</div></section>';
    layer.classList.add('is-open');
    layer.setAttribute('aria-hidden', 'false');
    layer.dataset.role = role;
    layer.dataset.step = String(index);
    var card = layer.querySelector('[data-guide-card]');
    var onKey = function (event) {
      if (event.key === 'Escape') { event.stopPropagation(); closeGuide(); }
      else if (event.key === 'Tab') trapFocus(card, event);
    };
    layer._onKey = onKey;
    document.addEventListener('keydown', onKey, true);
    var focusTarget = layer.querySelector('[data-guide-next]') || layer.querySelector('[data-guide-done]');
    if (focusTarget) focusTarget.focus();
  }

  function closeGuide() {
    var layer = document.getElementById('guideLayer');
    if (!layer || !layer.classList.contains('is-open')) return;
    markGuideSeen(layer.dataset.role || 'all');
    layer.classList.remove('is-open');
    layer.setAttribute('aria-hidden', 'true');
    if (layer._onKey) document.removeEventListener('keydown', layer._onKey, true);
    window.setTimeout(function () { if (!layer.classList.contains('is-open')) layer.innerHTML = ''; }, 340);
    if (guideReturn && guideReturn.focus) guideReturn.focus();
    guideReturn = null;
  }

  function showCoach(key, text) {
    if (coachSeen(key)) return false;
    var layer = ensureLayer();
    guideReturn = document.activeElement;
    layer.innerHTML = '<section class="coach-card" role="dialog" aria-modal="false" aria-label="' + escapeHtml(t(text)) + '" data-coach-card>' +
      '<p>' + escapeHtml(t(text)) + '</p>' +
      '<button type="button" class="btn btn-primary" data-coach-close>' + escapeHtml(t('Hecho')) + '</button></section>';
    layer.classList.add('is-open');
    layer.setAttribute('aria-hidden', 'false');
    layer.dataset.coach = key;
    var card = layer.querySelector('[data-coach-card]');
    var onKey = function (event) {
      if (event.key === 'Escape') { event.stopPropagation(); closeCoach(); }
      else if (event.key === 'Tab') trapFocus(card, event);
    };
    layer._onKey = onKey;
    document.addEventListener('keydown', onKey, true);
    var button = layer.querySelector('[data-coach-close]');
    if (button) button.focus();
    return true;
  }

  function closeCoach() {
    var layer = document.getElementById('guideLayer');
    if (!layer || !layer.classList.contains('is-open')) return;
    if (layer.dataset.coach) markCoachSeen(layer.dataset.coach);
    delete layer.dataset.coach;
    layer.classList.remove('is-open');
    layer.setAttribute('aria-hidden', 'true');
    if (layer._onKey) document.removeEventListener('keydown', layer._onKey, true);
    window.setTimeout(function () { if (!layer.classList.contains('is-open')) layer.innerHTML = ''; }, 340);
    if (guideReturn && guideReturn.focus) guideReturn.focus();
    guideReturn = null;
  }

  V.settings = {
    renderSettings: renderSettings,
    helpHtml: helpHtml,
    openGuide: openGuide,
    closeGuide: closeGuide,
    showCoach: showCoach,
    closeCoach: closeCoach,
    guideSeen: guideSeen,
    markGuideSeen: markGuideSeen,
    guideSteps: guideSteps
  };
}());
