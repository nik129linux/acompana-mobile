(function () {
  'use strict';

  var V = window.AcompanaViews = window.AcompanaViews || {};
  var t = window.AcompanaI18n.t;
  var room = window.AcompanaI18n.room;
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
    var treated = ctx().isConfirmed('medication');
    return [
      { at: '00:00', time: t('Hoy'), text: t(treated ? 'Tratamiento de la mañana cumplido' : 'Tratamiento de la mañana en curso'), pending: !treated },
      { at: '00:01', time: t('Hoy'), text: t('El equipo está con {pronoun}, sin novedad que reportar', { pronoun: t(patient.pronoun) }), pending: false },
      { at: '15:00', time: '15:00', text: t('Horario de visita disponible'), pending: true, icon: 'calendar' }
    ];
  }

  function renderFamily() {
    var patient = patientById(ctx().FAMILY_PATIENT_ID);
    var objectPronoun = patient.pronoun === 'ella' ? 'la' : 'lo';
    return greeting(t('Hola, familia de {name}', { name: patient.name.split(' ')[0] }), room(patient.room)) +
      '<p class="view-copy">' + escapeHtml(t('Un resumen sencillo para acompañar' + objectPronoun + ' con tranquilidad.')) + '</p>' +
      '<div class="hero-stack"><article class="hero-card family-hero">' +
      '<div class="hero-row"><span class="hero-media" aria-hidden="true">' + icon('family') + '</span>' +
      '<div class="hero-copy"><p class="hero-title">' + escapeHtml(t('El equipo está con {pronoun}', { pronoun: t(patient.pronoun) })) + '</p><span class="hero-sub">' + escapeHtml(t('El tratamiento de la mañana va avanzando con normalidad.')) + '</span></div></div>' +
      '<div class="glass-pill"><span class="visit-icon">' + icon('calendar') + '</span><span class="pill-copy">' + t('Horario de visita · Hoy, de {from} a {to}', { from: '<span class="time-nowrap">' + escapeHtml(t('3:00 p. m.')) + '</span>', to: '<span class="time-nowrap">' + escapeHtml(t('5:00 p. m.')) + '</span>' }) + '</span></div>' +
      '</article></div>' +
      '<div class="section-head"><h2 class="section-label">' + escapeHtml(t('Hoy')) + '</h2><span class="section-link">' + escapeHtml(t('Sin datos clínicos')) + '</span></div>' + timeline(familyDayTimeline(patient)) +
      V.sheets.askCard() +
      '<div class="section-head"><h2 class="section-label">' + escapeHtml(t('Así funciona')) + '</h2><span class="section-link">' + escapeHtml(t('Dos ideas sencillas')) + '</span></div>' +
      '<div class="onboarding-list">' + onboardingCard('onboarding-1', t('Lo que sigue'), t('Vea el próximo paso del turno.')) + onboardingCard('onboarding-2', t('Cómo pedir ayuda'), t('Escriba al equipo cuando necesite algo.')) + '</div>';
  }

  function renderContact() {
    return '<div class="view-header"><div class="view-header-copy"><p class="view-subtitle">' + escapeHtml(t('Familia de María González')) + '</p><h1 class="view-title small-title">' + escapeHtml(t('Contacto')) + '</h1></div></div>' +
      '<p class="view-copy">' + escapeHtml(t('Si necesita información sobre la visita, el equipo de turno puede orientarla.')) + '</p>' +
      '<article class="list-card"><span class="avatar" aria-hidden="true"><img src="media/frames/doctora-white.png" alt=""></span>' +
      '<span class="list-copy"><strong class="list-title">' + escapeHtml(t('Enfermera de turno')) + '</strong><span class="list-meta"><span>' + escapeHtml(t('Elena · vuelve a')) + ' <span class="time-nowrap">' + escapeHtml(t('la 1:00 p. m.')) + '</span></span></span></span></article>' +
      '<div class="contact-actions contact-options">' +
      '<a class="contact-option primary-button" href="tel:' + escapeHtml(ctx().SHIFT_PHONE) + '"><span class="contact-icon is-call" aria-hidden="true">' + icon('call') + '</span><strong class="contact-option-label">' + escapeHtml(t('Llamar')) + '</strong> <span class="contact-option-line">' + escapeHtml(t('al turno de Elena')) + '</span></a>' +
      '<button type="button" class="contact-option" data-chat-open><span class="contact-icon is-message" aria-hidden="true">' + icon('message') + '</span><strong class="contact-option-label">' + escapeHtml(t('Mensaje')) + '</strong> <span class="contact-option-line">' + escapeHtml(t('Escriba al equipo')) + '</span></button>' +
      '<button type="button" class="contact-option secondary-button" data-schedule-open><span class="contact-icon is-visit" aria-hidden="true">' + icon('calendar') + '</span><strong class="contact-option-label">' + escapeHtml(t('Visita')) + '</strong> <span class="contact-option-line">' + escapeHtml(t('Ver horarios')) + '</span></button>' +
      '</div>' +
      V.sheets.scheduleSheet();
  }

  function familyDayTimeline(patient) {
    var items = familyTimeline(patient);
    var logged = loadEvents().filter(function (e) {
      return e.patientId === patient.id && ctx().EVENT_KIND_PHRASES_FAMILIA[e.kind];
    });
    logged.forEach(function (e) {
      items.push({ at: e.time, time: e.time, text: t(ctx().EVENT_KIND_PHRASES_FAMILIA[e.kind]), pending: false, eventId: e.id, kind: e.kind });
    });
    return ctx().byTime(items);
  }

  V.family = {
    renderFamily: renderFamily,
    renderContact: renderContact
  };
}());
