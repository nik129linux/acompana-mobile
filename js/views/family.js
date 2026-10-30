(function () {
  'use strict';

  var V = window.AcompanaViews = window.AcompanaViews || {};
  function ctx() { return V.ctx; }
  function escapeHtml(value) { return ctx().escapeHtml(value); }
  function icon(name) { return ctx().icon(name); }
  function videoSlot(slot, label) { return ctx().videoSlot(slot, label); }
  function timeline(items) { return ctx().timeline(items); }
  function loadEvents() { return ctx().loadEvents(); }
  function patientById(patientId) { return ctx().patientById(patientId); }

  // The Medixin greeting bar is the app bar of every reader home (like Mi turno).
  function greeting(title, meta) {
    return '<header class="greet-bar" data-greet><span class="avatar" aria-hidden="true"><img src="media/frames/doctora-white.png" alt=""></span>' +
      '<div class="greet-copy"><h1 class="greet-title view-title">' + escapeHtml(title) + '</h1><span class="greet-meta view-copy">' + icon('location') + escapeHtml(meta) + '</span></div></header>';
  }

  // Onboarding videos as soft list cards with the mascot on its white disc.
  function onboardingCard(slot, title, copy) {
    return '<article class="list-card onboarding-card"><div class="media-square mascot-square onboarding-media">' + videoSlot(slot, title) + '</div>' +
      '<div class="list-copy onboarding-card-copy"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(copy) + '</span></div></article>';
  }

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
    return greeting('Hola, familia de ' + patient.name.split(' ')[0], patient.name + ' · ' + patient.room) +
      '<p class="view-copy">Un resumen sencillo para acompañar' + objectPronoun + ' con tranquilidad.</p>' +
      '<div class="hero-stack"><article class="hero-card family-hero">' +
      '<div class="hero-row"><span class="hero-media" aria-hidden="true">' + icon('family') + '</span>' +
      '<div class="hero-copy"><p class="hero-title">El equipo está con ' + escapeHtml(patient.pronoun) + '</p><span class="hero-sub">El tratamiento de la mañana va avanzando con normalidad.</span></div></div>' +
      '<div class="glass-pill"><span class="visit-icon">' + icon('calendar') + '</span>Horario de visita · Hoy, de <span class="time-nowrap">3:00 p. m.</span> a <span class="time-nowrap">5:00 p. m.</span></div>' +
      '</article></div>' +
      '<div class="section-head"><h2 class="section-label">Hoy</h2><span class="section-link">Sin datos clínicos</span></div>' + timeline(familyDayTimeline(patient)) +
      '<div class="section-head"><h2 class="section-label">Así funciona</h2><span class="section-link">Dos ideas sencillas</span></div>' +
      '<div class="onboarding-list">' + onboardingCard('onboarding-1', 'Lo que sigue', 'Vea el próximo paso del turno.') + onboardingCard('onboarding-2', 'Cómo pedir ayuda', 'Escriba al equipo cuando necesite algo.') + '</div>' +
      '<div class="ai-card"><strong>¿Tiene una duda?</strong><span>Pregunte con tranquilidad. Le respondemos solo con lo que se ve del turno.</span><div class="ask-row"><input type="text" class="ask-input" data-ask-input maxlength="300" placeholder="¿Cómo pasó la noche?" aria-label="Escriba su pregunta"><button type="button" class="primary-button" data-ask-send>Preguntar</button></div><div class="ask-answer is-empty" data-ask-answer aria-live="polite"></div><span class="source-badge" data-ask-badge>Plantilla</span></div>';
  }

  function renderContact() {
    return '<div class="view-header"><div class="view-header-copy"><p class="view-subtitle">Familia de María González</p><h1 class="view-title small-title">Contacto</h1></div></div>' +
      '<p class="view-copy">Si necesita información sobre la visita, el equipo de turno puede orientarla.</p>' +
      '<article class="list-card"><span class="avatar" aria-hidden="true"><img src="media/frames/doctora-white.png" alt=""></span>' +
      '<span class="list-copy"><strong class="list-title">Enfermera de turno</strong><span class="list-meta">Elena · vuelve a <span class="time-nowrap">la 1:00 p. m.</span></span></span></article>' +
      '<div class="contact-actions contact-options">' +
      '<a class="contact-option primary-button" href="tel:' + escapeHtml(ctx().SHIFT_PHONE) + '"><span class="contact-option-icon" aria-hidden="true">' + icon('phone') + '</span><strong class="contact-option-label">Llamar</strong> <span class="contact-option-line">al turno de Elena</span></a>' +
      '<button type="button" class="contact-option" data-ask-open><span class="contact-option-icon" aria-hidden="true">' + icon('message') + '</span><strong class="contact-option-label">Mensaje</strong> <span class="contact-option-line">Escriba al equipo</span></button>' +
      '<button type="button" class="contact-option secondary-button" data-schedule-open><span class="contact-option-icon" aria-hidden="true">' + icon('calendar') + '</span><strong class="contact-option-label">Visita</strong> <span class="contact-option-line">Ver horarios</span></button>' +
      '</div>' +
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
