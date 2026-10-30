(function () {
  'use strict';

  var V = window.AcompanaViews = window.AcompanaViews || {};
  function ctx() { return V.ctx; }
  function escapeHtml(value) { return ctx().escapeHtml(value); }
  function icon(name) { return ctx().icon(name); }
  function videoSlot(slot, label) { return ctx().videoSlot(slot, label); }
  function timeline(items) { return ctx().timeline(items); }
  function loadEvents() { return ctx().loadEvents(); }

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

  function renderPatient() {
    return greeting('Hola, María', 'Hab. 304-B') +
      '<p class="view-copy">Aquí ve lo que va pasando, en palabras sencillas.</p>' +
      '<div class="hero-stack"><article class="hero-card next-card">' +
      '<div class="hero-row"><div class="hero-copy"><p class="hero-title">Lo que sigue</p><span class="hero-sub">La enfermera vuelve a hacer la ronda <span class="time-nowrap">a la 1:00 p. m.</span></span></div>' +
      '<span class="mascot-disc"><span class="next-mascot" data-mascot aria-hidden="true"><span class="video-slot next-mascot-slot">' +
      '<video class="loop" autoplay muted loop playsinline preload="metadata" poster="media/onboarding-1.jpg" aria-hidden="true">' +
      '<source src="media/onboarding-1.webm" type="video/webm"><source src="media/onboarding-1.mp4" type="video/mp4">' +
      '</video><span class="video-fallback"><img src="media/frames/doctora-white.png" alt=""></span></span></span></span></div>' +
      '<div class="glass-pill">' + icon('clock') + 'Ronda de control · <span class="time-nowrap">1:00 p. m.</span></div>' +
      '</article></div>' +
      '<div class="section-head"><h2 class="section-label">Qué pasó hoy</h2><span class="section-link">En simple</span></div>' + timeline(patientDayTimeline()) +
      '<div class="section-head"><h2 class="section-label">Así funciona</h2><span class="section-link">Dos ideas sencillas</span></div>' +
      '<div class="onboarding-list">' + onboardingCard('onboarding-1', 'Lo que sigue', 'Vea el próximo paso del turno.') + onboardingCard('onboarding-2', 'Cómo pedir ayuda', 'Use el timbre cuando necesite algo.') + '</div>';
  }

  function faqItem(id, iconName, question, answerHtml) {
    return '<article class="faq-item question-card" data-faq-item="' + escapeHtml(id) + '"><button type="button" class="faq-question" data-faq="' + escapeHtml(id) + '" aria-expanded="false"><span class="question-well" aria-hidden="true">' + icon(iconName) + '</span><span class="question-text">' + escapeHtml(question) + '</span><span class="detail-chevron">' + icon('chevron') + '</span></button><div class="faq-answer"><div>' + answerHtml + '</div></div></article>';
  }

  function renderQuestions() {
    return '<div class="view-header"><div class="view-header-copy"><p class="view-subtitle">Hab. 304-B</p><h1 class="view-title small-title">Preguntas</h1></div></div>' +
      '<p class="view-copy">Si hay algo que no tiene claro, puede preguntar con tranquilidad.</p>' +
      '<div class="faq-list">' + faqItem('round', 'clock', '¿Cuándo vuelve la enfermera?', 'La próxima ronda está prevista para <span class="time-nowrap">la 1:00 p. m.</span> Si llega un poco más tarde, el equipo le avisará.') + faqItem('help', 'bell', '¿Cómo pido algo?', 'Use el timbre de la habitación. La enfermera responderá lo más pronto posible.') + faqItem('privacy', 'shield', '¿Qué información veo aquí?', 'Ve un resumen del turno en palabras sencillas. Su equipo decide qué información clínica debe recibir.') + '</div>';
  }

  function patientDayTimeline() {
    var items = ctx().TIMELINE_PACIENTE.slice();
    var logged = loadEvents().filter(function (e) {
      return e.patientId === ctx().FAMILY_PATIENT_ID && e.kind !== 'other' && ctx().EVENT_KIND_PHRASES[e.kind];
    });
    logged.forEach(function (e) {
      items.push({ time: e.time, text: ctx().EVENT_KIND_PHRASES[e.kind], pending: false, eventId: e.id, kind: e.kind });
    });
    return items;
  }

  V.patient = {
    renderPatient: renderPatient,
    renderQuestions: renderQuestions
  };
}());
