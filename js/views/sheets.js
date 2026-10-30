(function () {
  'use strict';

  var V = window.AcompanaViews = window.AcompanaViews || {};
  function ctx() { return V.ctx; }
  function escapeHtml(value) { return ctx().escapeHtml(value); }
  function icon(name) { return ctx().icon(name); }

  function staggerSoon(selector, items) {
    window.setTimeout(function () {
      try {
        var M = window.AcompanaMotion;
        if (!M || !M.stagger) return;
        var root = document.querySelector(selector);
        if (root) M.stagger(root, items, { step: 60, delay: 80 });
      } catch (e) {}
    }, 90);
  }

  function patientPickerButtons(selectedId) {
    var patientButtons = ctx().PATIENTS.map(function (p) {
      var active = p.id === selectedId;
      return '<button type="button" class="chip event-patient-btn' + (active ? ' is-selected' : '') + '" data-event-patient="' + escapeHtml(p.id) + '" aria-pressed="' + String(active) + '"><span class="chip-icon patient-dot" aria-hidden="true">' + escapeHtml(p.initials) + '</span><span>' + escapeHtml(p.name.split(' ')[0]) + '</span></button>';
    }).join('');
    return patientButtons;
  }

  function registrationSheet(selectedId) {
    staggerSoon('.registration-sheet', '.chip, .event-chip');
    return '<div class="sheet-backdrop" data-sheet-close></div><section class="registration-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-handle" data-sheet-handle aria-label="Arrastrar para cerrar"></div><div class="sheet-header"><div class="sheet-title-wrap"><p class="view-subtitle">Registro rápido</p><h2 id="sheet-title" class="sheet-title">¿Qué acabas de hacer?</h2></div><button type="button" class="icon-button" data-sheet-close aria-label="Cerrar registro">' + icon('close') + '</button></div><div class="event-patient-picker chip-row" role="radiogroup" aria-label="Paciente">' + patientPickerButtons(selectedId) + '</div><div class="quick-events"><button type="button" class="event-chip list-card" data-quick-event="Medicación"><span class="chip-icon" aria-hidden="true">' + icon('pill') + '</span><span class="list-copy"><strong class="list-title">Medicación</strong><small class="list-meta">1 toque</small></span></button><button type="button" class="event-chip list-card" data-quick-event="Cambio de posición"><span class="chip-icon" aria-hidden="true">' + icon('bed') + '</span><span class="list-copy"><strong class="list-title">Cambio de posición</strong><small class="list-meta">1 toque</small></span></button><button type="button" class="event-chip list-card" data-quick-event="Ronda"><span class="chip-icon" aria-hidden="true">' + icon('stethoscope') + '</span><span class="list-copy"><strong class="list-title">Ronda</strong><small class="list-meta">1 toque</small></span></button><button type="button" class="event-chip list-card" data-quick-event="Otro evento"><span class="chip-icon" aria-hidden="true">' + icon('note') + '</span><span class="list-copy"><strong class="list-title">Otro evento</strong><small class="list-meta">Abrir detalle</small></span></button></div><div class="other-event-field field" data-other-field><label class="field-name" for="otherText">Describe el evento</label><div class="field-box"><textarea id="otherText" class="other-text-input field-input" data-other-text rows="2" maxlength="140" aria-label="Describe el evento" placeholder="Describe el evento"></textarea></div><div class="other-event-actions"><button type="button" class="primary-button btn btn-primary" data-other-save>Guardar</button></div></div><button type="button" class="dictate-button btn btn-tonal" data-dictate><span class="mic-bubble chip-icon" aria-hidden="true">' + icon('mic') + '</span><span class="dictate-copy"><strong>Dictar evento</strong><small>Toca para dictar</small></span></button><div class="event-proposal list-card" data-event-proposal><p class="event-proposal-label">Revisa antes de guardar</p><span class="event-proposal-kind status-pill" data-proposal-kind></span><p class="event-proposal-text" data-proposal-text></p><div class="event-proposal-actions"><button type="button" class="secondary-button btn btn-secondary" data-proposal-cancel>Cancelar</button><button type="button" class="primary-button btn btn-primary" data-proposal-save>Guardar</button></div></div></section>';
  }

  function handoverSheet() {
    staggerSoon('.ai-sheet', '.field');
    return '<div class="ai-backdrop" data-ai-close></div>' +
      '<section class="ai-sheet" role="dialog" aria-modal="true" aria-labelledby="ai-sheet-title">' +
      '<div class="sheet-handle" aria-hidden="true"></div>' +
      '<div class="sheet-header"><div class="sheet-title-wrap"><p class="view-subtitle">Entrega de turno</p>' +
      '<h2 id="ai-sheet-title" class="sheet-title">Nota de entrega (SBAR)</h2></div>' +
      '<button type="button" class="icon-button" data-ai-close aria-label="Cerrar nota">' + icon('close') + '</button></div>' +
      '<p class="sheet-copy">Revisa cada campo. Puedes editarlo antes de copiarlo.</p>' +
      '<div data-consent-slot></div>' +
      '<label class="handover-field field">Situación<span class="field-box"><textarea data-handover-s rows="2" maxlength="200"></textarea></span></label>' +
      '<label class="handover-field field">Antecedentes<span class="field-box"><textarea data-handover-b rows="2" maxlength="200"></textarea></span></label>' +
      '<label class="handover-field field">Evaluación<span class="field-box"><textarea data-handover-a rows="2" maxlength="200"></textarea></span></label>' +
      '<label class="handover-field field">Recomendación<span class="field-box"><textarea data-handover-r rows="2" maxlength="200"></textarea></span></label>' +
      '<div class="ai-actions"><span class="source-badge" data-handover-badge>Plantilla</span>' +
      '<button type="button" class="secondary-button btn btn-secondary" data-handover-generate>Generar borrador</button>' +
      '<button type="button" class="btn btn-tonal" data-handover-copy>' + icon('copy') + 'Copiar</button>' +
      '<button type="button" class="primary-button btn btn-primary" data-handover-share>' + icon('message') + 'Compartir</button></div>' +
      '<p class="tray-feedback ai-feedback" data-ai-feedback aria-live="polite"></p></section>';
  }

  function scheduleSheet() {
    staggerSoon('[data-schedule-sheet]', '.schedule-row');
    return '<div class="schedule-sheet-backdrop" data-schedule-close></div><div class="schedule-sheet" data-schedule-sheet><div class="sheet-handle" aria-hidden="true"></div><div class="sheet-header"><div class="sheet-title-wrap"><p class="view-subtitle">Familia</p><h2 class="sheet-title">Horarios del turno</h2></div><button type="button" class="schedule-close icon-button" data-schedule-close aria-label="Cerrar horarios">' + icon('close') + '</button></div><div class="schedule-list"><div class="schedule-row list-card"><span class="media-square" aria-hidden="true">' + icon('calendar') + '</span><span class="list-copy"><strong class="schedule-label list-title">Visita hoy</strong><span class="schedule-value list-meta">3:00 p. m. a 5:00 p. m.</span></span></div><div class="schedule-row list-card"><span class="media-square" aria-hidden="true">' + icon('clock') + '</span><span class="list-copy"><strong class="schedule-label list-title">Próxima ronda</strong><span class="schedule-value list-meta">La 1:00 p. m.</span></span></div></div></div>';
  }

  function consentBox(kind, payload) {
    return '<div class="consent-box list-card"><strong class="list-title">Antes de usar la IA</strong>' +
      '<span class="list-meta">Esto es lo único que saldría de este equipo. Sin nombres ni datos personales. ¿Lo aceptas?</span>' +
      '<pre>' + escapeHtml(JSON.stringify(payload, null, 1)) + '</pre>' +
      '<div class="consent-row"><button type="button" class="primary-button btn btn-primary" data-consent-yes="' + kind + '">Aceptar</button>' +
      '<button type="button" class="secondary-button btn btn-secondary" data-consent-no="' + kind + '">Ahora no</button></div></div>';
  }

  // Pop the proposal card when it opens (success path); helpers no-op under reduced motion.
  try {
    document.addEventListener('transitionend', function () {}, true);
    var popObserver = window.MutationObserver ? new MutationObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.target && entry.target.hasAttribute && entry.target.hasAttribute('data-event-proposal') && entry.target.classList.contains('is-visible')) {
          try { if (window.AcompanaMotion && window.AcompanaMotion.pop) window.AcompanaMotion.pop(entry.target, { from: 0.96 }); } catch (e) {}
        }
      });
    }) : null;
    if (popObserver) popObserver.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class'] });
  } catch (e) {}

  V.sheets = {
    registrationSheet: registrationSheet,
    handoverSheet: handoverSheet,
    scheduleSheet: scheduleSheet,
    consentBox: consentBox
  };
}());
