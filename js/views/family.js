(function () {
  'use strict';

  var V = window.AcompanaViews = window.AcompanaViews || {};
  function ctx() { return V.ctx; }
  function escapeHtml(value) { return ctx().escapeHtml(value); }
  function icon(name) { return ctx().icon(name); }
  function timeline(items) { return ctx().timeline(items); }
  function loadEvents() { return ctx().loadEvents(); }
  function patientById(patientId) { return ctx().patientById(patientId); }

  function familyTimeline(patient) {
    return [
      { time: 'Hoy', text: 'Tratamiento de la mañana cumplido', pending: false },
      { time: 'Hoy', text: 'El equipo está con ' + patient.pronoun + ', sin novedad que reportar', pending: false },
      { time: '15:00', text: 'Horario de visita disponible', pending: true }
    ];
  }

  function renderFamily() {
    var patient = patientById(ctx().FAMILY_PATIENT_ID);
    var objectPronoun = patient.pronoun === 'ella' ? 'la' : 'lo';
    return '<div class="patient-intro"><p class="eyebrow">' + escapeHtml(patient.name) + ' · ' + escapeHtml(patient.room) + '</p><h1 class="view-title">Qué pasa</h1><p class="view-copy">Un resumen sencillo para acompañar' + objectPronoun + ' con tranquilidad.</p></div>' +
      '<div class="family-summary"><strong>El equipo está con ' + escapeHtml(patient.pronoun) + '</strong><span>El tratamiento de la mañana va avanzando con normalidad.</span></div>' +
      '<div class="section-heading"><h2 class="section-label">Hoy</h2><span class="section-meta">Sin datos clínicos</span></div>' + timeline(familyDayTimeline(patient)) +
      '<div class="visit-card"><span class="visit-icon">' + icon('calendar') + '</span><span class="visit-copy"><strong>Horario de visita</strong><span>Hoy, de <span class="time-nowrap">3:00 p. m.</span> a <span class="time-nowrap">5:00 p. m.</span></span></span></div>' +
      '<div class="ai-card"><strong>¿Tiene una duda?</strong><span>Pregunte con tranquilidad. Le respondemos solo con lo que se ve del turno.</span><div class="ask-row"><input type="text" class="ask-input" data-ask-input maxlength="300" placeholder="¿Cómo pasó la noche?" aria-label="Escriba su pregunta"><button type="button" class="primary-button" data-ask-send>Preguntar</button></div><div class="ask-answer is-empty" data-ask-answer aria-live="polite"></div><span class="source-badge" data-ask-badge>Plantilla</span></div>';
  }

  function renderContact() {
    return '<div class="view-header"><div class="view-header-copy"><p class="view-subtitle">Familia de María González</p><h1 class="view-title small-title">Contacto</h1></div></div>' +
      '<p class="view-copy">Si necesita información sobre la visita, el equipo de turno puede orientarla.</p>' +
      '<div class="contact-card"><span class="contact-icon">' + icon('phone') + '</span><span class="contact-copy"><strong>Enfermera de turno</strong><span>Elena · vuelve a <span class="time-nowrap">la 1:00 p. m.</span></span></span></div>' +
      '<div class="visit-card"><span class="visit-icon">' + icon('calendar') + '</span><span class="visit-copy"><strong>Horario de visita</strong><span>Hoy, de <span class="time-nowrap">3:00 p. m.</span> a <span class="time-nowrap">5:00 p. m.</span></span></span></div>' +
      '<div class="contact-actions"><a href="tel:' + escapeHtml(ctx().SHIFT_PHONE) + '" class="primary-button">Llamar al turno</a><button type="button" class="secondary-button" data-schedule-open>Ver horarios</button></div>' +
      V.sheets.scheduleSheet();
  }

  function familyDayTimeline(patient) {
    var items = familyTimeline(patient);
    var logged = loadEvents().filter(function (e) {
      return e.patientId === patient.id && ctx().EVENT_KIND_PHRASES_FAMILIA[e.kind];
    });
    logged.forEach(function (e) {
      items.push({ time: e.time, text: ctx().EVENT_KIND_PHRASES_FAMILIA[e.kind], pending: false, eventId: e.id, kind: e.kind });
    });
    return items;
  }

  V.family = {
    renderFamily: renderFamily,
    renderContact: renderContact
  };
}());
