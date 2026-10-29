(function () {
  'use strict';

  var V = window.AcompanaViews = window.AcompanaViews || {};
  function ctx() { return V.ctx; }
  function escapeHtml(value) { return ctx().escapeHtml(value); }
  function icon(name) { return ctx().icon(name); }
  function videoSlot(slot, label) { return ctx().videoSlot(slot, label); }
  function timeline(items) { return ctx().timeline(items); }
  function loadEvents() { return ctx().loadEvents(); }

  function onboardingCard(slot, title, copy) {
    return '<article class="onboarding-card"><div class="onboarding-card-copy"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(copy) + '</span></div>' + videoSlot(slot, title) + '</article>';
  }

  function renderPatient() {
    return '<div class="patient-intro"><p class="eyebrow">Hab. 304-B</p><h1 class="view-title">Mi estado</h1><p class="view-copy">Aquí ve lo que va pasando, en palabras sencillas.</p></div>' +
      '<div class="next-card"><span class="next-card-icon">' + icon('clock') + '</span><span class="next-card-copy"><strong>Lo que sigue</strong><span>La enfermera vuelve a hacer la ronda <span class="time-nowrap">a la 1:00 p. m.</span></span></span>' +
      '<span class="next-mascot" data-mascot aria-hidden="true"><span class="video-slot next-mascot-slot">' +
      '<video class="loop" autoplay muted loop playsinline preload="metadata" poster="media/onboarding-1.jpg" aria-hidden="true">' +
      '<source src="media/onboarding-1.webm" type="video/webm"><source src="media/onboarding-1.mp4" type="video/mp4">' +
      '</video><span class="video-fallback"><img src="media/frames/doctora-white.png" alt=""></span></span></span></div>' +
      '<div class="onboarding-block"><div class="onboarding-intro"><h2 class="section-label">Así funciona</h2><p>Dos ideas sencillas</p></div><div class="onboarding-grid">' + onboardingCard('onboarding-1', 'Lo que sigue', 'Vea el próximo paso del turno.') + onboardingCard('onboarding-2', 'Cómo pedir ayuda', 'Use el timbre cuando necesite algo.') + '</div></div>' +
      '<div class="section-heading"><h2 class="section-label">Qué pasó hoy</h2><span class="section-meta">En simple</span></div>' + timeline(patientDayTimeline());
  }

  function faqItem(id, question, answerHtml) {
    return '<article class="faq-item" data-faq-item="' + escapeHtml(id) + '"><button type="button" class="faq-question" data-faq="' + escapeHtml(id) + '" aria-expanded="false"><span>' + escapeHtml(question) + '</span><span class="detail-chevron">' + icon('chevron') + '</span></button><div class="faq-answer"><div>' + answerHtml + '</div></div></article>';
  }

  function renderQuestions() {
    return '<div class="view-header"><div class="view-header-copy"><p class="view-subtitle">Hab. 304-B</p><h1 class="view-title small-title">Preguntas</h1></div></div>' +
      '<p class="view-copy">Si hay algo que no tiene claro, puede preguntar con tranquilidad.</p>' +
      '<div class="faq-list">' + faqItem('round', '¿Cuándo vuelve la enfermera?', 'La próxima ronda está prevista para <span class="time-nowrap">la 1:00 p. m.</span> Si llega un poco más tarde, el equipo le avisará.') + faqItem('help', '¿Cómo pido algo?', 'Use el timbre de la habitación. La enfermera responderá lo más pronto posible.') + faqItem('privacy', '¿Qué información veo aquí?', 'Ve un resumen del turno en palabras sencillas. Su equipo decide qué información clínica debe recibir.') + '</div>';
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
