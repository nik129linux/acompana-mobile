(function () {
  'use strict';

  var V = window.AcompanaViews = window.AcompanaViews || {};
  function ctx() { return V.ctx; }
  function escapeHtml(value) { return ctx().escapeHtml(value); }
  function icon(name) { return ctx().icon(name); }

  function patientPickerButtons(selectedId) {
    var patientButtons = ctx().PATIENTS.map(function (p) {
      var active = p.id === selectedId;
      return '<button type="button" class="event-patient-btn" data-event-patient="' + escapeHtml(p.id) + '" aria-pressed="' + String(active) + '"><span class="patient-dot">' + escapeHtml(p.initials) + '</span>' + escapeHtml(p.name.split(' ')[0]) + '</button>';
    }).join('');
    return patientButtons;
  }

  function registrationSheet(selectedId) {
    return '<div class="sheet-backdrop" data-sheet-close></div><section class="registration-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-handle" data-sheet-handle aria-label="Arrastrar para cerrar"></div><div class="sheet-header"><div class="sheet-title-wrap"><p class="view-subtitle">Registro rápido</p><h2 id="sheet-title" class="sheet-title">¿Qué acabas de hacer?</h2></div><button type="button" class="icon-button" data-sheet-close aria-label="Cerrar registro">×</button></div><div class="event-patient-picker" role="radiogroup" aria-label="Paciente">' + patientPickerButtons(selectedId) + '</div><div class="quick-events"><button type="button" class="event-chip" data-quick-event="Medicación"><span class="event-icon">' + icon('pill') + '</span><span><strong>Medicación</strong><small>1 toque</small></span></button><button type="button" class="event-chip" data-quick-event="Cambio de posición"><span class="event-icon">' + icon('move') + '</span><span><strong>Cambio de posición</strong><small>1 toque</small></span></button><button type="button" class="event-chip" data-quick-event="Ronda"><span class="event-icon">' + icon('ruler') + '</span><span><strong>Ronda</strong><small>1 toque</small></span></button><button type="button" class="event-chip" data-quick-event="Otro evento"><span class="event-icon">' + icon('clipboard') + '</span><span><strong>Otro evento</strong><small>Abrir detalle</small></span></button></div><div class="other-event-field" data-other-field><textarea class="other-text-input" data-other-text rows="2" maxlength="140" aria-label="Describe el evento" placeholder="Describe el evento"></textarea><div class="other-event-actions"><button type="button" class="primary-button" data-other-save>Guardar</button></div></div><button type="button" class="dictate-button" data-dictate><span class="mic-bubble">' + icon('mic') + '</span><span class="dictate-copy"><strong>Dictar evento</strong><small>Toca para dictar</small></span></button><div class="event-proposal" data-event-proposal><p class="event-proposal-label">Revisa antes de guardar</p><span class="event-proposal-kind" data-proposal-kind></span><p class="event-proposal-text" data-proposal-text></p><div class="event-proposal-actions"><button type="button" class="secondary-button" data-proposal-cancel>Cancelar</button><button type="button" class="primary-button" data-proposal-save>Guardar</button></div></div></section>';
  }

  function handoverSheet() {
    return '<div class="ai-backdrop" data-ai-close></div>' +
      '<section class="ai-sheet" role="dialog" aria-modal="true" aria-labelledby="ai-sheet-title">' +
      '<div class="sheet-handle" aria-hidden="true"></div>' +
      '<div class="sheet-header"><div class="sheet-title-wrap"><p class="view-subtitle">Entrega de turno</p>' +
      '<h2 id="ai-sheet-title" class="sheet-title">Nota de entrega (SBAR)</h2></div>' +
      '<button type="button" class="icon-button" data-ai-close aria-label="Cerrar nota">×</button></div>' +
      '<p class="sheet-copy">Revisa cada campo. Puedes editarlo antes de copiarlo.</p>' +
      '<div data-consent-slot></div>' +
      '<label class="handover-field">Situación<textarea data-handover-s rows="2" maxlength="200"></textarea></label>' +
      '<label class="handover-field">Antecedentes<textarea data-handover-b rows="2" maxlength="200"></textarea></label>' +
      '<label class="handover-field">Evaluación<textarea data-handover-a rows="2" maxlength="200"></textarea></label>' +
      '<label class="handover-field">Recomendación<textarea data-handover-r rows="2" maxlength="200"></textarea></label>' +
      '<div class="ai-actions"><span class="source-badge" data-handover-badge>Plantilla</span>' +
      '<button type="button" class="secondary-button" data-handover-generate>Generar borrador</button>' +
      '<button type="button" class="primary-button" data-handover-copy>Copiar nota</button></div>' +
      '<p class="tray-feedback ai-feedback" data-ai-feedback aria-live="polite"></p></section>';
  }

  function scheduleSheet() {
    return '<div class="schedule-sheet-backdrop" data-schedule-close></div><div class="schedule-sheet" data-schedule-sheet><div class="sheet-header"><h2 class="sheet-title">Horarios del turno</h2><button type="button" class="schedule-close" data-schedule-close aria-label="Cerrar horarios">×</button></div><div class="schedule-row"><span class="schedule-label">Visita hoy</span><span class="schedule-value">3:00 p. m. a 5:00 p. m.</span></div><div class="schedule-row"><span class="schedule-label">Próxima ronda</span><span class="schedule-value">La 1:00 p. m.</span></div></div>';
  }

  function consentBox(kind, payload) {
    return '<div class="consent-box"><strong>Antes de usar la IA</strong>' +
      '<span>Esto es lo único que saldría de este equipo. Sin nombres ni datos personales. ¿Lo aceptas?</span>' +
      '<pre>' + escapeHtml(JSON.stringify(payload, null, 1)) + '</pre>' +
      '<div class="consent-row"><button type="button" class="primary-button" data-consent-yes="' + kind + '">Aceptar</button>' +
      '<button type="button" class="secondary-button" data-consent-no="' + kind + '">Ahora no</button></div></div>';
  }

  V.sheets = {
    registrationSheet: registrationSheet,
    handoverSheet: handoverSheet,
    scheduleSheet: scheduleSheet,
    consentBox: consentBox
  };
}());
