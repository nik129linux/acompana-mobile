(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var app = {
    phone: document.querySelector('.phone'),
    screen: $('screen'),
    bottomNav: $('bottomNav'),
    roleSwitch: document.querySelector('.role-switch'),
    roleTabs: Array.prototype.slice.call(document.querySelectorAll('.role-tab')),
    splashLayer: $('splashLayer'),
    registrationLayer: $('registrationLayer'),
    aiLayer: $('aiLayer'),
    celebrationLayer: $('celebrationLayer')
  };

  var PATIENTS = [
    {
      id: 'cr',
      initials: 'CR',
      name: 'Carlos Rodríguez',
      room: 'Hab. 304-A',
      pronoun: 'él',
      status: 'critical',
      statusLabel: 'Revisar',
      clinical: 'PA 90/55 · taquicardia 112 · alerta protocolo hipotensión',
      patientText: 'El equipo está pendiente de sus signos',
      familyText: 'Bajo observación, el equipo está con él'
    },
    {
      id: 'mg',
      initials: 'MG',
      name: 'María González',
      room: 'Hab. 304-B',
      pronoun: 'ella',
      status: 'pending',
      statusLabel: 'Medicación 11:00',
      clinical: 'Enoxaparina 40mg SC, vía abdominal, 11:00',
      patientText: 'Ya casi le toca el medicamento de la mañana',
      familyText: 'Tratamiento de la mañana en curso'
    },
    {
      id: 'jp',
      initials: 'JP',
      name: 'Jorge Pérez',
      room: 'Hab. 305-A',
      pronoun: 'él',
      status: 'ready',
      statusLabel: '1 toque',
      clinical: 'Cambio postural decúbito lateral izq. — previsto 11:20',
      patientText: 'Le van a ayudar a cambiar de posición',
      familyText: '—'
    }
  ];
  var FAMILY_PATIENT_ID = 'mg';

  var TASKS = [
    {
      id: 'medication',
      patientId: 'mg',
      time: '11:00',
      title: 'Medicación de la mañana',
      note: 'María González · Hab. 304-B',
      icon: 'pill'
    },
    {
      id: 'position',
      patientId: 'jp',
      time: '11:20',
      title: 'Cambio de posición',
      note: 'Jorge Pérez · Hab. 305-A',
      icon: 'move'
    },
    {
      id: 'round',
      patientId: 'cr',
      time: '13:00',
      title: 'Ronda de control',
      note: 'Carlos Rodríguez · Hab. 304-A',
      icon: 'ruler'
    }
  ];

  var TIMELINE_PACIENTE = [
    { time: '08:00', text: 'Le ayudaron a cambiar de posición', pending: false },
    { time: '09:30', text: 'Ya le pusieron el medicamento de la mañana', pending: false },
    { time: '1:00 p. m.', text: 'La enfermera vuelve a hacer la ronda', pending: true }
  ];

  function familyTimeline(patient) {
    return [
      { time: 'Hoy', text: 'Tratamiento de la mañana cumplido', pending: false },
      { time: 'Hoy', text: 'El equipo está con ' + patient.pronoun + ', sin novedad que reportar', pending: false },
      { time: '15:00', text: 'Horario de visita disponible', pending: true }
    ];
  }

  var NAV_BY_ROLE = {
    enfermero: [
      { key: 'turno', label: 'Turno', icon: 'list' },
      { key: 'registrar', label: 'Registrar', icon: 'plus' },
      { key: 'pendientes', label: 'Pendientes', icon: 'clock' }
    ],
    paciente: [
      { key: 'estado', label: 'Mi estado', icon: 'heart' },
      { key: 'preguntas', label: 'Preguntas', icon: 'help' }
    ],
    familia: [
      { key: 'pasa', label: 'Qué pasa', icon: 'message' },
      { key: 'contacto', label: 'Contacto', icon: 'phone' }
    ]
  };

  var ROLE_INDEX = { enfermero: 0, paciente: 1, familia: 2 };
  var HOME_NAV = {
    enfermero: 'turno',
    paciente: 'estado',
    familia: 'pasa'
  };

  var state = {
    role: 'enfermero',
    detailPatient: null,
    activeNav: {
      enfermero: HOME_NAV.enfermero,
      paciente: HOME_NAV.paciente,
      familia: HOME_NAV.familia
    },
    confirmed: {},
    sheetOpen: false,
    sheetReturnNav: 'turno',
    faqOpen: {},
    listening: false,
    completionTimer: null,
    feedbackTimer: null,
    eventPatient: null,
    eventUndo: null,
    eventUndoTimer: null
  };

  // placeholder: confirm in field
  var SHIFT_PHONE = '+573001234567';

  // Plain-language translations for patient/family timelines
  var EVENT_KIND_PHRASES = {
    medication: 'Le aplicaron el medicamento',
    position: 'Le ayudaron a cambiar de posición',
    round: 'La enfermera pasó a revisar'
  };

  // Local mirror of server-side rules classification
  function classifyEventRulesLocal(text) {
    var lower = String(text || '').toLowerCase();
    var medKws = ['enoxaparina', 'heparina', 'paracetamol', 'ibuprofeno', 'insulina', 'morfina', 'tramadol', 'omeprazol', 'medicamento', 'medicina', 'pastilla', 'aplic', 'mg', 'ml'];
    var posKws = ['posición', 'posicion', 'postural', 'decúbito', 'decubito', 'lateral', 'cambio de posicion', 'cambio de posición'];
    var roundKws = ['ronda', 'control', 'signos', 'vitales', 'revis', 'monitoreo'];
    for (var i = 0; i < medKws.length; i++) {
      if (lower.includes(medKws[i])) return { kind: 'medication', text: text, source: 'rules' };
    }
    for (var j = 0; j < posKws.length; j++) {
      if (lower.includes(posKws[j])) return { kind: 'position', text: text, source: 'rules' };
    }
    for (var k = 0; k < roundKws.length; k++) {
      if (lower.includes(roundKws[k])) return { kind: 'round', text: text, source: 'rules' };
    }
    return { kind: 'other', text: text, source: 'rules' };
  }

  function loadEvents() {
    try {
      var raw = window.localStorage.getItem('acompana-events');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveEvents(events) {
    try {
      window.localStorage.setItem('acompana-events', JSON.stringify(events));
    } catch (e) {
      // ignore storage failures
    }
  }

  function nowHHMM() {
    var now = new Date();
    return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  }

  function clearUndo() {
    if (state.eventUndoTimer) {
      window.clearTimeout(state.eventUndoTimer);
      state.eventUndoTimer = null;
    }
    state.eventUndo = null;
  }

  function showEventFeedback(message) {
    var feedback = app.registrationLayer.querySelector('[data-tray-feedback]');
    if (!feedback) return;
    feedback.textContent = '';
    var line = document.createElement('div');
    line.className = 'tray-feedback-line';
    var span = document.createElement('span');
    span.textContent = message;
    line.appendChild(span);
    var undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'undo-event-btn is-visible';
    undo.setAttribute('data-undo-event', '');
    undo.textContent = 'Deshacer';
    line.appendChild(undo);
    feedback.appendChild(line);
    feedback.classList.add('is-visible');
  }

  function hideEventFeedback() {
    var feedback = app.registrationLayer.querySelector('[data-tray-feedback]');
    if (!feedback) return;
    feedback.textContent = '';
    feedback.classList.remove('is-visible');
  }

  var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };
  var videoObserver = null;

  var ICONS = {
    arrow: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"></path></svg>',
    chevron: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>',
    check: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>',
    list: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h10M8 12h10M8 18h10"></path><path d="M4 6h.01M4 12h.01M4 18h.01"></path></svg>',
    plus: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
    clock: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path></svg>',
    heart: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 8.8c0 5.2-8 9.7-8 9.7S4 14 4 8.8A4.4 4.4 0 0 1 12 6a4.4 4.4 0 0 1 8 2.8Z"></path></svg>',
    help: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M9.7 9a2.4 2.4 0 1 1 3.7 2c-.9.6-1.4 1.1-1.4 2.2M12 16.5h.01"></path></svg>',
    message: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3l4 3 4-3h3a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"></path><path d="M7 9h10M7 12h6"></path></svg>',
    phone: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h3l1.4 4-2 1.5a14 14 0 0 0 5.1 5.1l1.5-2 4 1.4v3a2 2 0 0 1-2.2 2A16.8 16.8 0 0 1 5 6.2 2 2 0 0 1 7 4Z"></path></svg>',
    pill: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 4.5a4 4 0 0 1 5.7 0l5.3 5.3a4 4 0 0 1-5.7 5.7L8.5 10a4 4 0 0 1 0-5.5Z" transform="rotate(45 12 12)"></path><path d="m9 9 6 6"></path></svg>',
    move: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M9 8l-4 4 4 4M15 8l4 4-4 4"></path></svg>',
    ruler: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 17 12-12 2 2L7 19l-2-2Z"></path><path d="m12 8 2 2M9 11l2 2M15 5l2 2"></path></svg>',
    mic: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="4" width="8" height="11" rx="4"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"></path></svg>',
    clipboard: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8M9 4h6a1 1 0 0 1 1 1v15H8V5a1 1 0 0 1 1-1Z"></path><path d="M10 10h4M10 14h4"></path></svg>',
    eye: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z"></path><circle cx="12" cy="12" r="2"></circle></svg>',
    shield: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 19 7v5c0 4.2-2.8 7-7 8-4.2-1-7-3.8-7-8V7l7-3Z"></path><path d="m9 12 2 2 4-4"></path></svg>',
    calendar: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="6" width="14" height="13" rx="2"></rect><path d="M8 4v4M16 4v4M5 10h14"></path></svg>',
    sun: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>'
  };

  function icon(name) {
    return ICONS[name] || ICONS.check;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function isConfirmed(taskId) {
    return Boolean(state.confirmed[taskId]);
  }

  function remainingTasks() {
    return TASKS.filter(function (task) { return !isConfirmed(task.id); });
  }

  function taskForPatient(patientId) {
    return TASKS.find(function (task) { return task.patientId === patientId && !isConfirmed(task.id); });
  }

  function patientById(patientId) {
    return PATIENTS.find(function (patient) { return patient.id === patientId; });
  }

  function videoSlot(slot, label) {
    return '<div class="video-slot" data-video-slot="' + escapeHtml(slot) + '" role="img" aria-label="' + escapeHtml(label || 'Ilustración animada') + '">' +
      '<video class="loop" autoplay muted loop playsinline preload="metadata" poster="media/' + escapeHtml(slot) + '.jpg" aria-hidden="true">' +
      '<source src="media/' + escapeHtml(slot) + '.webm" type="video/webm">' +
      '<source src="media/' + escapeHtml(slot) + '.mp4" type="video/mp4">' +
      '</video><div class="video-fallback"><img src="media/frames/doctora-white.png" alt=""></div></div>';
  }

  function patientBadge(patient) {
    if (patient.status === 'critical') {
      return '<span class="badge badge-critical">' + escapeHtml(patient.statusLabel) + '</span>';
    }
    if (taskForPatient(patient.id)) {
      return '<span class="badge badge-pending">' + escapeHtml(patient.statusLabel) + '</span>';
    }
    return '<span class="badge badge-ready">Listo</span>';
  }

  function patientCard(patient) {
    var task = taskForPatient(patient.id);
    var side = patient.status === 'critical'
      ? patientBadge(patient)
      : task
        ? '<button type="button" class="quick-confirm tap-confirm" data-confirm="' + escapeHtml(task.id) + '" aria-label="Confirmar ' + escapeHtml(task.title) + ' en un toque">1 toque</button>'
        : patientBadge(patient);
    return '<article class="patient-card" data-patient-card="' + escapeHtml(patient.id) + '">' +
      '<button type="button" class="patient-card-main" data-patient="' + escapeHtml(patient.id) + '" aria-label="Abrir detalle de ' + escapeHtml(patient.name) + '">' +
      '<span class="patient-avatar">' + escapeHtml(patient.initials) + '</span>' +
      '<span class="patient-info"><span class="patient-name">' + escapeHtml(patient.name) + '</span><span class="patient-meta">' + escapeHtml(patient.room) + '</span></span>' +
      '<span class="arrow-icon">' + icon('arrow') + '</span>' +
      '</button><div class="patient-side">' + side + '</div></article>';
  }

  function renderNurseHome() {
    var pending = remainingTasks().length;
    var cards = PATIENTS.map(patientCard).join('');
    return '<div class="home-intro"><p class="eyebrow">Hospital Central · Piso 3</p><h1 class="view-title">Mi turno</h1><p class="view-copy">Buenos días, Elena. Todo lo importante, a la vista.</p></div>' +
      '<div class="shift-stats" aria-label="Resumen del turno"><div class="shift-stat"><strong>3</strong><span>Pacientes</span></div><div class="shift-stat"><strong>' + pending + '</strong><span>Pendientes</span></div><div class="shift-stat"><strong>1:00</strong><span>Próxima ronda</span></div></div>' +
      '<div class="section-heading"><h2 class="section-label">Pacientes asignados</h2><span class="badge badge-critical">1 crítico</span></div>' +
      '<div class="patient-list">' + cards + '</div>' +
      '<div class="ai-card"><strong>Nota de entrega (SBAR)</strong><span>Prepara un borrador del turno para entregar. Puedes editarlo antes de copiarlo.</span><span class="source-badge" data-handover-home-badge>Plantilla</span><div class="ai-actions"><button type="button" class="secondary-button" data-handover-open>Preparar nota</button></div></div>';
  }

  function taskCard(task) {
    return '<article class="task-card" data-task-card="' + escapeHtml(task.id) + '">' +
      '<span class="task-icon">' + icon(task.icon) + '</span>' +
      '<span class="task-copy"><span class="task-time">' + escapeHtml(task.time) + '</span><span class="task-title">' + escapeHtml(task.title) + '</span><span class="task-note">' + escapeHtml(task.note) + '</span></span>' +
      '<button type="button" class="task-action tap-confirm" data-confirm="' + escapeHtml(task.id) + '" aria-label="Confirmar ' + escapeHtml(task.title) + '"><svg class="confirm-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="m7 16 6 6L25 9"></path></svg><span class="confirm-label">Listo</span></button>' +
      '</article>';
  }

  function renderEmptyPending() {
    var pieces = '';
    var stagger = getStaggerMs();
    for (var index = 1; index <= 12; index += 1) {
      pieces += '<span class="confetti-piece" style="--confetti-delay:' + (index * stagger) + 'ms"></span>';
    }
    return '<div class="empty-state" data-empty-state>' +
      '<div class="confetti-layer" aria-hidden="true">' + pieces + '</div>' +
      videoSlot('empty', 'Doctora flotando tranquila') +
      '<span class="completion-mark">' + icon('check') + '</span>' +
      '<h2>Todo confirmado</h2><p>El turno está al día. Puedes respirar un momento.</p>' +
      '<button type="button" class="accent-link empty-state-link" data-go-home>Volver al turno ' + icon('chevron') + '</button>' +
      '</div>';
  }

  function renderPending() {
    var pending = remainingTasks();
    if (!pending.length) return renderEmptyPending();
    return '<div class="view-header"><div class="view-header-copy"><p class="view-subtitle">Turno de Elena</p><h1 class="view-title small-title">Pendientes</h1></div></div>' +
      '<div class="pending-summary"><div class="pending-summary-copy"><strong>Lo que falta</strong><span>Confirma cada evento con un toque.</span></div><span class="pending-count" data-pending-count>' + pending.length + '</span></div>' +
      '<div class="section-heading"><h2 class="section-label">En este momento</h2><span class="section-meta">Orden por hora</span></div>' +
      '<div class="task-list">' + pending.map(taskCard).join('') + '</div>' +
      '<div class="ai-card"><strong>Preguntas de la familia</strong><span>Si una familia dejó una duda desde su vista, aparece aquí.</span><div class="ai-actions"><button type="button" class="secondary-button" data-questions-load>Revisar preguntas</button></div><div data-nurse-questions></div></div>';
  }

  function detailRow(label, value, expanded) {
    return '<div class="detail-list-row"><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(value) + '</span><span class="detail-chevron' + (expanded ? ' is-expanded' : '') + '">' + icon('chevron') + '</span></div>';
  }

  function renderNurseDetail(patient) {
    var patientTasks = TASKS.filter(function (task) { return task.patientId === patient.id; });
    var loggedEvents = loadEvents().filter(function (e) { return e.patientId === patient.id; });
    var loggedHtml = loggedEvents.length
      ? '<div class="detail-section"><h2 class="detail-section-title">Eventos registrados</h2><div class="detail-list">' +
        loggedEvents.map(function (e) {
          var kindLabel = e.kind === 'medication' ? 'Medicación' : e.kind === 'position' ? 'Cambio de posición' : e.kind === 'round' ? 'Ronda' : 'Otro';
          return detailRow(e.time + ' · ' + kindLabel, e.text, false);
        }).join('') + '</div></div>'
      : '';
    return '<div class="detail-view"><div class="view-header"><button type="button" class="icon-button back-button back-btn" data-back="enfermero" aria-label="Volver al turno"><span class="arrow-icon">' + icon('arrow') + '</span></button><div class="view-header-copy"><p class="view-subtitle">Detalle del turno</p><h1 class="view-title small-title">Ficha del paciente</h1></div></div>' +
      '<div class="detail-hero"><span class="patient-avatar">' + escapeHtml(patient.initials) + '</span><div class="detail-hero-copy"><h2 class="detail-name">' + escapeHtml(patient.name) + '</h2><span class="detail-room">' + escapeHtml(patient.room) + '</span><span class="badge ' + (patient.status === 'critical' ? 'badge-critical' : 'badge-neutral') + ' detail-status">' + escapeHtml(patient.status === 'critical' ? patient.statusLabel : 'En seguimiento') + '</span></div></div>' +
      '<div class="detail-section"><h2 class="detail-section-title">Registro clínico</h2><div class="clinical-panel"><button type="button" class="clinical-value" data-reveal aria-label="Mostrar el valor clínico" aria-expanded="false">' + escapeHtml(patient.clinical) + '</button><button type="button" class="reveal-button" data-reveal aria-expanded="false">Mostrar dato clínico ' + icon('eye') + '</button><p class="view-copy muted-copy">Oculto por defecto porque esta pantalla también se ve desde la cama.</p></div></div>' +
      '<div class="privacy-note">' + icon('shield') + '<span>El dato sensible queda detrás de un toque deliberado. Si decides comunicarlo, hazlo con calma.</span></div>' +
      '<div class="detail-section"><h2 class="detail-section-title">Eventos del turno</h2><div class="detail-list">' + patientTasks.map(function (task) { return detailRow(task.time + ' · ' + task.title, isConfirmed(task.id) ? 'Confirmado' : 'Pendiente', false); }).join('') + '</div></div>' +
      loggedHtml +
      '<p class="view-copy muted-copy">La familia recibe solo un resumen del turno, sin valores clínicos.</p></div>';
  }

  function onboardingCard(slot, title, copy) {
    return '<article class="onboarding-card"><div class="onboarding-card-copy"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(copy) + '</span></div>' + videoSlot(slot, title) + '</article>';
  }

  function timeline(items) {
    return '<div class="timeline">' + items.map(function (item) {
      return '<div class="timeline-item' + (item.pending ? ' is-pending' : '') + '"><span class="timeline-time">' + escapeHtml(item.time) + '</span><p class="timeline-text">' + escapeHtml(item.text) + '</p></div>';
    }).join('') + '</div>';
  }

  function renderPatient() {
    return '<div class="patient-intro"><p class="eyebrow">Hab. 304-B</p><h1 class="view-title">Mi estado</h1><p class="view-copy">Aquí ve lo que va pasando, en palabras sencillas.</p></div>' +
      '<div class="next-card"><span class="next-card-icon">' + icon('clock') + '</span><span class="next-card-copy"><strong>Lo que sigue</strong><span>La enfermera vuelve a hacer la ronda <span class="time-nowrap">a la 1:00 p. m.</span></span></span></div>' +
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

  function renderFamily() {
    var patient = patientById(FAMILY_PATIENT_ID);
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
      '<div class="contact-actions"><a href="tel:' + escapeHtml(SHIFT_PHONE) + '" class="primary-button">Llamar al turno</a><button type="button" class="secondary-button" data-schedule-open>Ver horarios</button></div>' +
      '<div class="schedule-sheet-backdrop" data-schedule-close></div><div class="schedule-sheet" data-schedule-sheet><div class="sheet-header"><h2 class="sheet-title">Horarios del turno</h2><button type="button" class="schedule-close" data-schedule-close aria-label="Cerrar horarios">×</button></div><div class="schedule-row"><span class="schedule-label">Visita hoy</span><span class="schedule-value">3:00 p. m. a 5:00 p. m.</span></div><div class="schedule-row"><span class="schedule-label">Próxima ronda</span><span class="schedule-value">La 1:00 p. m.</span></div></div>';
  }

  function viewDefinition() {
    if (state.role === 'enfermero') {
      if (state.detailPatient) {
        return { key: 'nurse-detail', className: 'is-detail', inner: renderNurseDetail(state.detailPatient) };
      }
      if (state.activeNav[state.role] === 'pendientes') {
        return { key: 'nurse-pending', className: 'is-home', inner: renderPending() };
      }
      return { key: 'nurse-home', className: 'is-home', inner: renderNurseHome() };
    }
    if (state.role === 'paciente') {
      return state.activeNav[state.role] === 'preguntas'
        ? { key: 'patient-questions', className: 'is-home', inner: renderQuestions() }
        : { key: 'patient-home', className: 'is-home', inner: renderPatient() };
    }
    return state.activeNav[state.role] === 'contacto'
      ? { key: 'family-contact', className: 'is-home', inner: renderContact() }
      : { key: 'family-home', className: 'is-home', inner: renderFamily() };
  }

  function createView(definition, direction) {
    var view = document.createElement('section');
    view.className = 'view ' + definition.className + (direction === 'back' ? ' from-left' : ' from-right');
    view.dataset.viewKey = definition.key;
    view.setAttribute('role', 'region');
    view.innerHTML = definition.inner;
    return view;
  }

  function bindVideos(container) {
    var videos = container.querySelectorAll('.loop');
    videos.forEach(function (video) {
      if (video.dataset.bound === 'true') return;
      video.dataset.bound = 'true';
      var fallback = video.parentElement.querySelector('.video-fallback');
      var showFallback = function () {
        video.classList.add('is-hidden');
        if (fallback) fallback.classList.add('is-visible');
      };
      video.addEventListener('error', showFallback);
      video.querySelectorAll('source').forEach(function (source) { source.addEventListener('error', showFallback); });
      video.addEventListener('loadeddata', function () {
        video.classList.remove('is-hidden');
        if (fallback) fallback.classList.remove('is-visible');
      });
      if (reducedMotion.matches) {
        video.pause();
        video.autoplay = false;
        return;
      }
      if (videoObserver) {
        videoObserver.observe(video);
      } else {
        var playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(function () {});
      }
    });
  }

  function ensureVideoObserver() {
    if (videoObserver || !('IntersectionObserver' in window)) return;
    videoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = entry.target;
        if (reducedMotion.matches) {
          video.pause();
          return;
        }
        if (entry.isIntersecting) {
          var playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(function () {});
        } else {
          video.pause();
        }
      });
    }, { threshold: 0.12 });
  }

  function routeKey() {
    var definition = viewDefinition();
    return definition.key;
  }

  function renderRoute(direction, force) {
    if (state.role === 'enfermero' && state.activeNav[state.role] === 'registrar' && !state.sheetOpen) {
      openRegistrationSheet();
      return;
    }
    var definition = viewDefinition();
    var current = app.screen.querySelector('.view.is-active');
    if (current && current.dataset.viewKey === definition.key && !force) {
      renderBottomNav();
      return;
    }
    var next = createView(definition, direction);
    if (!current) {
      app.screen.appendChild(next);
      requestAnimationFrame(function () {
        next.classList.remove('from-left', 'from-right');
        next.classList.add('is-active');
        bindVideos(next);
      });
    } else {
      app.screen.appendChild(next);
      requestAnimationFrame(function () {
        current.classList.remove('is-active');
        current.classList.add('is-leaving', direction === 'back' ? 'to-right' : 'to-left');
        next.classList.remove('from-left', 'from-right');
        next.classList.add('is-active');
        bindVideos(next);
        window.setTimeout(function () {
          if (current.parentNode) current.remove();
        }, 320);
      });
    }
    renderBottomNav();
  }

  function renderBottomNav() {
    var items = NAV_BY_ROLE[state.role];
    app.bottomNav.innerHTML = items.map(function (item) {
      var active = item.key === state.activeNav[state.role];
      return '<button type="button" class="nav-item' + (active ? ' is-active' : '') + '" data-nav="' + escapeHtml(item.key) + '" aria-pressed="' + String(active) + '"><span class="nav-icon">' + icon(item.icon) + '</span><span>' + escapeHtml(item.label) + '</span></button>';
    }).join('');
  }

  function updateRole(role) {
    var nextIndex = ROLE_INDEX[role];
    var currentIndex = ROLE_INDEX[state.role];
    state.role = role;
    state.detailPatient = null;
    state.activeNav[role] = HOME_NAV[role];
    app.phone.dataset.role = role;
    app.phone.style.setProperty('--role-index', nextIndex);
    app.roleTabs.forEach(function (tab, index) {
      var active = index === nextIndex;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    if (state.sheetOpen) closeRegistrationSheet(false);
    closeAiSheet();
    app.screen.innerHTML = '';
    renderBottomNav();
    renderRoute(nextIndex >= currentIndex ? 'forward' : 'back', true);
  }

  function openPatientDetail(patientId, sourceCard) {
    var patient = patientById(patientId);
    if (!patient) return;
    var home = app.screen.querySelector('.view[data-view-key="nurse-home"]');
    if (!home) {
      state.activeNav.enfermero = 'turno';
      renderRoute('forward', true);
      window.setTimeout(function () { openPatientDetail(patientId, null); }, 340);
      return;
    }
    state.detailPatient = patient;
    state.activeNav.enfermero = 'turno';
    home.classList.add('is-behind');
    home.classList.remove('is-active');
    var definition = viewDefinition();
    var detail = createView(definition, 'forward');
    app.screen.appendChild(detail);
    requestAnimationFrame(function () {
      detail.classList.remove('from-right');
      detail.classList.add('is-active');
      bindVideos(detail);
      if (sourceCard) animateSharedElement(sourceCard, detail);
    });
    renderBottomNav();
  }

  function getStaggerMs() {
    var raw = getComputedStyle(document.documentElement).getPropertyValue('--stagger').trim();
    var value = parseFloat(raw);
    return isFinite(value) ? value : 40;
  }
  function getDurationEnterMs() {
    var raw = getComputedStyle(document.documentElement).getPropertyValue('--duration-enter').trim();
    var value = parseFloat(raw);
    return isFinite(value) ? value : 360;
  }
  function animateSharedElement(sourceCard, destination) {
    if (reducedMotion.matches) return;
    if (!sourceCard || !destination.animate) return;
    var target = destination.querySelector('.detail-hero');
    if (!target) return;
    var first = sourceCard.getBoundingClientRect();
    var last = target.getBoundingClientRect();
    var x = first.left - last.left;
    var y = first.top - last.top;
    var scale = first.width / Math.max(last.width, 1);
    target.animate([
      { transform: 'translate3d(' + x + 'px, ' + y + 'px, 0) scale(' + scale + ', ' + scale + ')', opacity: 0.72 },
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 }
    ], { duration: getDurationEnterMs(), easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' });
  }

  function closePatientDetail() {
    var detail = app.screen.querySelector('.view[data-view-key="nurse-detail"]');
    var home = app.screen.querySelector('.view[data-view-key="nurse-home"]');
    state.detailPatient = null;
    if (!detail) {
      renderBottomNav();
      renderRoute('back', true);
      return;
    }
    detail.classList.remove('is-active');
    detail.classList.add('is-leaving', 'to-left');
    if (home) {
      home.classList.remove('is-behind');
      home.classList.add('is-active');
    }
    window.setTimeout(function () { if (detail.parentNode) detail.remove(); }, 320);
    renderBottomNav();
  }

  function openRegistrationSheet() {
    if (state.sheetOpen) return;
    state.sheetOpen = true;
    state.sheetReturnNav = state.activeNav.enfermero === 'registrar' ? 'turno' : state.activeNav.enfermero;
    state.activeNav.enfermero = 'registrar';
    state.eventPatient = state.detailPatient ? state.detailPatient.id : PATIENTS[0].id;
    clearUndo();
    var patientButtons = PATIENTS.map(function (p) {
      var active = p.id === state.eventPatient;
      return '<button type="button" class="event-patient-btn" data-event-patient="' + escapeHtml(p.id) + '" aria-pressed="' + String(active) + '"><span class="patient-dot">' + escapeHtml(p.initials) + '</span>' + escapeHtml(p.name.split(' ')[0]) + '</button>';
    }).join('');
    app.registrationLayer.innerHTML = '<div class="sheet-backdrop" data-sheet-close></div><section class="registration-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-handle" data-sheet-handle aria-label="Arrastrar para cerrar"></div><div class="sheet-header"><div class="sheet-title-wrap"><p class="view-subtitle">Registro rápido</p><h2 id="sheet-title" class="sheet-title">¿Qué acabas de hacer?</h2></div><button type="button" class="icon-button" data-sheet-close aria-label="Cerrar registro">×</button></div><div class="event-patient-picker" role="radiogroup" aria-label="Paciente">' + patientButtons + '</div><div class="quick-events"><button type="button" class="event-chip" data-quick-event="Medicación"><span class="event-icon">' + icon('pill') + '</span><span><strong>Medicación</strong><small>1 toque</small></span></button><button type="button" class="event-chip" data-quick-event="Cambio de posición"><span class="event-icon">' + icon('move') + '</span><span><strong>Cambio de posición</strong><small>1 toque</small></span></button><button type="button" class="event-chip" data-quick-event="Ronda"><span class="event-icon">' + icon('ruler') + '</span><span><strong>Ronda</strong><small>1 toque</small></span></button><button type="button" class="event-chip" data-quick-event="Otro evento"><span class="event-icon">' + icon('clipboard') + '</span><span><strong>Otro evento</strong><small>Abrir detalle</small></span></button></div><div class="other-event-field" data-other-field><textarea class="other-text-input" data-other-text rows="2" maxlength="140" aria-label="Describe el evento" placeholder="Describe el evento"></textarea><div class="other-event-actions"><button type="button" class="primary-button" data-other-save>Guardar</button></div></div><button type="button" class="dictate-button" data-dictate><span class="mic-bubble">' + icon('mic') + '</span><span class="dictate-copy"><strong>Dictar evento</strong><small>Mantén presionado para hablar</small></span><span class="dictate-pulse" aria-hidden="true"></span></button><div class="event-proposal" data-event-proposal><p class="event-proposal-label">Revisa antes de guardar</p><span class="event-proposal-kind" data-proposal-kind></span><p class="event-proposal-text" data-proposal-text></p><div class="event-proposal-actions"><button type="button" class="secondary-button" data-proposal-cancel>Cancelar</button><button type="button" class="primary-button" data-proposal-save>Guardar</button></div></div><p class="tray-feedback" data-tray-feedback aria-live="polite"></p></section>';
    app.registrationLayer.classList.add('is-open');
    app.registrationLayer.setAttribute('aria-hidden', 'false');
    renderBottomNav();
    bindSheetDrag();
    requestAnimationFrame(function () {
      var first = app.registrationLayer.querySelector('.event-chip');
      if (first) first.focus();
    });
  }

  function closeRegistrationSheet(restoreNav) {
    if (!state.sheetOpen) return;
    state.sheetOpen = false;
    if (restoreNav !== false) state.activeNav.enfermero = state.sheetReturnNav || 'turno';
    app.registrationLayer.classList.remove('is-open');
    app.registrationLayer.setAttribute('aria-hidden', 'true');
    renderBottomNav();
    window.setTimeout(function () {
      if (!state.sheetOpen) app.registrationLayer.innerHTML = '';
    }, 420);
  }

  function bindSheetDrag() {
    var handle = app.registrationLayer.querySelector('[data-sheet-handle]');
    var sheet = app.registrationLayer.querySelector('.registration-sheet');
    if (!handle || !sheet) return;
    var startY = 0;
    var currentY = 0;
    handle.addEventListener('pointerdown', function (event) {
      startY = event.clientY;
      currentY = 0;
      handle.setPointerCapture(event.pointerId);
      sheet.style.setProperty('--drag-y', '0px');
    });
    handle.addEventListener('pointermove', function (event) {
      currentY = Math.max(0, event.clientY - startY);
      sheet.style.setProperty('--drag-y', currentY + 'px');
    });
    handle.addEventListener('pointerup', function () {
      if (currentY > 80) closeRegistrationSheet();
      else {
        sheet.style.setProperty('--drag-y', '0px');
        currentY = 0;
      }
    });
  }

  function confirmTask(taskId, trigger) {
    if (isConfirmed(taskId)) return;
    var card = trigger.closest('.task-card, .patient-card');
    state.confirmed[taskId] = true;
    if (card) card.classList.add('is-confirming');
    navigator.vibrate?.(10);
    window.setTimeout(function () {
      if (card) card.classList.add('is-collapsing');
      window.setTimeout(function () {
        if (!remainingTasks().length) {
          state.activeNav.enfermero = 'pendientes';
          state.detailPatient = null;
          closeRegistrationSheet(false);
          renderRoute('forward', true);
          showCompletion();
        } else {
          renderRoute('forward', true);
          window.setTimeout(animatePendingCount, 40);
        }
      }, 260);
    }, 220);
  }

  function animatePendingCount() {
    var count = app.screen.querySelector('[data-pending-count]');
    if (!count) return;
    count.classList.remove('is-updating');
    void count.offsetWidth;
    count.classList.add('is-updating');
    window.setTimeout(function () { count.classList.remove('is-updating'); }, 420);
  }

  function showCompletion() {
    if (state.completionTimer) window.clearTimeout(state.completionTimer);
    var pieces = '';
    var stagger = getStaggerMs();
    for (var index = 1; index <= 12; index += 1) pieces += '<span class="confetti-piece" style="--confetti-delay:' + (index * stagger) + 'ms"></span>';
    app.celebrationLayer.innerHTML = '<div class="celebration-card"><div class="celebration-mascot"><img class="celebration-doctor-image" src="media/frames/doctora-white.png" alt="Doctora celebrando"></div><span class="completion-mark">' + icon('check') + '</span><h2>Turno al día</h2><p>Todo confirmado. El equipo puede seguir con tranquilidad.</p><button type="button" class="primary-button" data-close-celebration>Seguir con el turno</button><div class="confetti-layer" aria-hidden="true">' + pieces + '</div></div>';
    app.celebrationLayer.classList.add('is-visible');
    app.celebrationLayer.setAttribute('aria-hidden', 'false');
    var closeButton = app.celebrationLayer.querySelector('[data-close-celebration]');
    if (closeButton) closeButton.focus();
    state.completionTimer = window.setTimeout(hideCompletion, 3200);
  }

  function hideCompletion() {
    app.celebrationLayer.classList.remove('is-visible');
    app.celebrationLayer.setAttribute('aria-hidden', 'true');
    window.setTimeout(function () {
      if (!app.celebrationLayer.classList.contains('is-visible')) app.celebrationLayer.innerHTML = '';
    }, 340);
  }

  function showTrayFeedback(message) {
    var feedback = app.registrationLayer.querySelector('[data-tray-feedback]');
    if (!feedback) return;
    feedback.textContent = message + ' listo para registrar.';
    feedback.classList.add('is-visible');
    if (state.feedbackTimer) window.clearTimeout(state.feedbackTimer);
    state.feedbackTimer = window.setTimeout(function () { feedback.classList.remove('is-visible'); }, 1800);
  }

  function toggleListening(button) {
    state.listening = !state.listening;
    var copy = button.querySelector('.dictate-copy');
    if (state.listening) {
      copy.querySelector('strong').textContent = 'Escuchando';
      copy.querySelector('small').textContent = 'Suelta para dejar el registro';
      button.classList.add('is-listening');
    } else {
      copy.querySelector('strong').textContent = 'Dictar evento';
      copy.querySelector('small').textContent = 'Mantén presionado para hablar';
      button.classList.remove('is-listening');
      showTrayFeedback('Registro por voz');
    }
  }

  function handleScreenClick(event) {
    var handoverOpen = event.target.closest('[data-handover-open]');
    if (handoverOpen) {
      openHandoverSheet();
      return;
    }

    var askSend = event.target.closest('[data-ask-send]');
    if (askSend) {
      sendAsk();
      return;
    }

    var consentYes = event.target.closest('[data-consent-yes]');
    if (consentYes) {
      acceptConsent(consentYes.getAttribute('data-consent-yes'));
      return;
    }

    var consentNo = event.target.closest('[data-consent-no]');
    if (consentNo) {
      declineConsent(consentNo.getAttribute('data-consent-no'));
      return;
    }

    var questionsLoad = event.target.closest('[data-questions-load]');
    if (questionsLoad) {
      var slot = app.screen.querySelector('[data-nurse-questions]');
      if (slot) loadNurseQuestions(slot);
      return;
    }

    var questionDone = event.target.closest('[data-question-done]');
    if (questionDone) {
      var id = Number(questionDone.getAttribute('data-question-done'));
      aiRequest('/api/questions/resolve', { id: id }).then(function () {
        var card = questionDone.closest('[data-question-card]');
        if (card) card.remove();
      }, function () {
        // offline: leave the item visible
      });
      return;
    }

    var confirm = event.target.closest('[data-confirm]');
    if (confirm) {
      event.preventDefault();
      event.stopPropagation();
      confirmTask(confirm.getAttribute('data-confirm'), confirm);
      return;
    }

    var patient = event.target.closest('[data-patient]');
    if (patient) {
      openPatientDetail(patient.getAttribute('data-patient'), patient.closest('.patient-card'));
      return;
    }

    var back = event.target.closest('[data-back]');
    if (back) {
      closePatientDetail();
      return;
    }

    var reveal = event.target.closest('[data-reveal]');
    if (reveal) {
      var value = app.screen.querySelector('.clinical-value');
      var revealButton = app.screen.querySelector('.reveal-button');
      var willReveal = value ? !value.classList.contains('is-revealed') : revealButton ? !revealButton.classList.contains('is-revealed') : false;
      if (value) {
        value.classList.toggle('is-revealed', willReveal);
        value.setAttribute('aria-expanded', String(willReveal));
      }
      if (revealButton) {
        revealButton.classList.toggle('is-revealed', willReveal);
        revealButton.setAttribute('aria-expanded', String(willReveal));
        revealButton.innerHTML = (willReveal ? 'Ocultar dato clínico ' : 'Mostrar dato clínico ') + icon('eye');
      }
      return;
    }

    var faq = event.target.closest('[data-faq]');
    if (faq) {
      var id = faq.getAttribute('data-faq');
      var item = faq.closest('[data-faq-item]');
      state.faqOpen[id] = !state.faqOpen[id];
      item.classList.toggle('is-open', state.faqOpen[id]);
      faq.setAttribute('aria-expanded', String(state.faqOpen[id]));
      return;
    }

    var scheduleOpen = event.target.closest('[data-schedule-open]');
    if (scheduleOpen) {
      var backdrop = app.screen.querySelector('[data-schedule-sheet]');
      var sheet = app.screen.querySelector('[data-schedule-sheet]');
      var bd = app.screen.querySelector('.schedule-sheet-backdrop');
      if (sheet) { sheet.classList.add('is-visible'); bd.classList.add('is-visible'); }
      return;
    }
    var scheduleClose = event.target.closest('[data-schedule-close]');
    if (scheduleClose) {
      var sheet = app.screen.querySelector('[data-schedule-sheet]');
      var bd = app.screen.querySelector('.schedule-sheet-backdrop');
      if (sheet) { sheet.classList.remove('is-visible'); bd.classList.remove('is-visible'); }
      return;
    }

    var goHome = event.target.closest('[data-go-home]');
    if (goHome) {
      state.activeNav.enfermero = 'turno';
      closeRegistrationSheet(false);
      renderRoute('back', true);
    }
  }

  function handleNavClick(event) {
    var button = event.target.closest('[data-nav]');
    if (!button) return;
    var key = button.getAttribute('data-nav');
    if (state.role === 'enfermero' && key === 'registrar') {
      openRegistrationSheet();
      return;
    }
    var oldKey = state.activeNav[state.role];
    if (oldKey === key && !state.detailPatient) return;
    state.activeNav[state.role] = key;
    state.detailPatient = null;
    if (state.role === 'enfermero') closeRegistrationSheet(false);
    var oldIndex = NAV_BY_ROLE[state.role].findIndex(function (item) { return item.key === oldKey; });
    var newIndex = NAV_BY_ROLE[state.role].findIndex(function (item) { return item.key === key; });
    renderRoute(newIndex >= oldIndex ? 'forward' : 'back');
  }

  function handleRoleClick(event) {
    var tab = event.target.closest('.role-tab');
    if (!tab || tab.classList.contains('is-active')) return;
    updateRole(tab.getAttribute('data-role'));
  }

  function handleRegistrationClick(event) {
    var close = event.target.closest('[data-sheet-close]');
    if (close) {
      closeRegistrationSheet();
      return;
    }
    var patientBtn = event.target.closest('[data-event-patient]');
    if (patientBtn) {
      state.eventPatient = patientBtn.getAttribute('data-event-patient');
      var allBtns = app.registrationLayer.querySelectorAll('[data-event-patient]');
      allBtns.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-event-patient') === state.eventPatient));
      });
      return;
    }
    var undo = event.target.closest('[data-undo-event]');
    if (undo) {
      if (state.eventUndo) {
        var evs = loadEvents();
        evs = evs.filter(function (e) { return e.id !== state.eventUndo; });
        saveEvents(evs);
        state.eventUndo = null;
        if (state.eventUndoTimer) { window.clearTimeout(state.eventUndoTimer); state.eventUndoTimer = null; }
        hideEventFeedback();
      }
      return;
    }
    var otherSave = event.target.closest('[data-other-save]');
    if (otherSave) {
      var otherField = app.registrationLayer.querySelector('[data-other-text]');
      var text = otherField ? otherField.value.trim() : '';
      if (text) {
        saveLoggedEvent(state.eventPatient, 'other', text, 'manual');
        otherField.value = '';
        var otherF = app.registrationLayer.querySelector('[data-other-field]');
        if (otherF) otherF.classList.remove('is-visible');
      }
      return;
    }
    var proposalSave = event.target.closest('[data-proposal-save]');
    if (proposalSave) {
      var proposal = app.registrationLayer.querySelector('[data-event-proposal]');
      if (proposal && proposal.dataset.pendingKind) {
        saveLoggedEvent(state.eventPatient, proposal.dataset.pendingKind, proposal.dataset.pendingText, 'voice');
        proposal.classList.remove('is-visible');
        delete proposal.dataset.pendingKind;
        delete proposal.dataset.pendingText;
      }
      return;
    }
    var proposalCancel = event.target.closest('[data-proposal-cancel]');
    if (proposalCancel) {
      var proposalEl = app.registrationLayer.querySelector('[data-event-proposal]');
      if (proposalEl) {
        proposalEl.classList.remove('is-visible');
        delete proposalEl.dataset.pendingKind;
        delete proposalEl.dataset.pendingText;
      }
      return;
    }
    var quick = event.target.closest('[data-quick-event]');
    if (quick) {
      var label = quick.getAttribute('data-quick-event');
      if (label === 'Otro evento') {
        var otherF = app.registrationLayer.querySelector('[data-other-field]');
        if (otherF) otherF.classList.toggle('is-visible');
        return;
      }
      var kindMap = { 'Medicación': 'medication', 'Cambio de posición': 'position', 'Ronda': 'round' };
      var kind = kindMap[label] || 'other';
      saveLoggedEvent(state.eventPatient, kind, label, 'quick');
      return;
    }
    var dictate = event.target.closest('[data-dictate]');
    if (dictate) {
      startDictation();
    }
  }

  function saveLoggedEvent(patientId, kind, text, source) {
    var evs = loadEvents();
    var id = 'evt-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    var entry = { id: id, patientId: patientId, kind: kind, text: text, time: nowHHMM(), source: source };
    evs.push(entry);
    saveEvents(evs);
    state.eventUndo = id;
    if (state.eventUndoTimer) window.clearTimeout(state.eventUndoTimer);
    var label = kind === 'medication' ? 'Medicación' : kind === 'position' ? 'Cambio de posición' : kind === 'round' ? 'Ronda' : 'Otro evento';
    showEventFeedback(label + ' registrado · ' + entry.time);
    state.eventUndoTimer = window.setTimeout(function () {
      state.eventUndo = null;
      hideEventFeedback();
    }, 5000);
  }

  function startDictation() {
    // Prefer webkitSpeechRecognition (test mock sets this) over the native
    // SpeechRecognition which may not fire events in headless Chromium.
    var SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SpeechRecognition) {
      var otherF = app.registrationLayer.querySelector('[data-other-field]');
      if (otherF) otherF.classList.add('is-visible');
      return;
    }
    var recog = new SpeechRecognition();
    recog.lang = 'es-CO';
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    var button = app.registrationLayer.querySelector('[data-dictate]');
    if (button) button.classList.add('is-listening');
    var proposal = app.registrationLayer.querySelector('[data-event-proposal]');
    recog.onresult = function (event) {
      var transcript = event.results[0][0].transcript;
      if (aiConsent === 'yes') {
        aiRequest('/api/event', { text: transcript }).then(function (result) {
          if (proposal) {
            proposal.dataset.pendingKind = result.kind;
            proposal.dataset.pendingText = result.text || transcript;
            proposal.querySelector('[data-proposal-kind]').textContent = result.kind;
            proposal.querySelector('[data-proposal-text]').textContent = result.text || transcript;
            proposal.classList.add('is-visible');
          }
        }, function () {
          var r = classifyEventRulesLocal(transcript);
          if (proposal) {
            proposal.dataset.pendingKind = r.kind;
            proposal.dataset.pendingText = r.text;
            proposal.querySelector('[data-proposal-kind]').textContent = r.kind;
            proposal.querySelector('[data-proposal-text]').textContent = r.text;
            proposal.classList.add('is-visible');
          }
        });
      } else {
        var r = classifyEventRulesLocal(transcript);
        if (proposal) {
          proposal.dataset.pendingKind = r.kind;
          proposal.dataset.pendingText = r.text;
          proposal.querySelector('[data-proposal-kind]').textContent = r.kind;
          proposal.querySelector('[data-proposal-text]').textContent = r.text;
          proposal.classList.add('is-visible');
        }
      }
    };
    recog.onend = function () {
      if (button) button.classList.remove('is-listening');
    };
    recog.onerror = function () {
      if (button) button.classList.remove('is-listening');
      var otherF = app.registrationLayer.querySelector('[data-other-field]');
      if (otherF) otherF.classList.add('is-visible');
    };
    recog.start();
  }

  function initSplash() {
    var mascot = app.splashLayer.querySelector('.splash-mascot');
    mascot.innerHTML = videoSlot('splash', 'Doctora saludando');
    bindVideos(app.splashLayer);
    var maxTimer = null;
    var cycleTimer = null;
    var finish = function () {
      if (app.splashLayer.classList.contains('is-leaving')) return;
      if (maxTimer !== null) window.clearTimeout(maxTimer);
      if (cycleTimer !== null) window.clearTimeout(cycleTimer);
      app.splashLayer.querySelectorAll('.loop').forEach(function (video) { video.pause(); });
      app.splashLayer.classList.add('is-leaving');
      window.setTimeout(function () { app.splashLayer.setAttribute('aria-hidden', 'true'); }, 320);
      renderRoute('forward', true);
    };
    var skipButton = app.splashLayer.querySelector('[data-splash-skip]');
    if (skipButton) skipButton.addEventListener('click', finish);
    app.splashLayer.addEventListener('click', function () {
      finish();
    });
    if (reducedMotion.matches) {
      window.setTimeout(finish, 1200);
      return;
    }
    maxTimer = window.setTimeout(finish, 5000);
    var splashVideo = mascot.querySelector('video');
    var lastTime = 0;
    var completeCycle = function () { finish(); };
    var armCycleTimer = function () {
      if (app.splashLayer.classList.contains('is-leaving') || cycleTimer !== null || !splashVideo || !Number.isFinite(splashVideo.duration)) return;
      if (maxTimer !== null) {
        window.clearTimeout(maxTimer);
        maxTimer = null;
      }
      cycleTimer = window.setTimeout(finish, Math.min(splashVideo.duration * 1000, 5000));
    };
    if (splashVideo) {
      splashVideo.addEventListener('ended', completeCycle);
      splashVideo.addEventListener('timeupdate', function () {
        var currentTime = splashVideo.currentTime;
        if (lastTime > 0.05 && currentTime < lastTime) {
          completeCycle();
          return;
        }
        lastTime = currentTime;
      });
      splashVideo.addEventListener('loadedmetadata', armCycleTimer);
      if (splashVideo.readyState >= 1) armCycleTimer();
    }
  }

  // ---- Local AI bridge: handover (SBAR) + family Q&A ----
  // server/server.js owns the rules, grounding and guardrails. The helpers
  // below mirror them so the prototype still works from file:// with no
  // server. Every fetch runs ONLY on an explicit tap, with a 3s timeout,
  // and falls back silently to the on-device template. A badge always
  // shows which source produced the text: "Plantilla" or "IA local".
  var AI_BASE =
    (location.protocol === 'http:' || location.protocol === 'https:')
      ? location.origin
      : 'http://127.0.0.1:8787';
  var AI_TIMEOUT_MS = 3000;
  var HANDOVER_MAX = 200;
  var ASK_MAX = 220;
  var SAFE_ANSWER_OFFLINE = 'No puedo responder eso con lo que se ve del turno. Anótelo para preguntarlo a la enfermera.';
  var REFUSAL_RE = /diagn[oó]st|pron[oó]st|c[áa]ncer|tumor|grave|morir|muerte|curar|se va a|cu[áa]nto (tiempo|falta|vive)|dosis|cu[áa]ntos?\s*(mg|ml|gramos)|qu[ée] medicamento|qu[ée] pastilla|qu[ée] droga|debo darle|le (doy|damos|puedo dar)|recomienda|aconseja|deber[íi]a tomar|resultados? (de |del )?(examen|sangre|laboratorio)|alta m[ée]dica|cu[áa]ndo sale|anestesia|cirug[íi]a|presi[óo]n arterial|fiebre|az[úu]car/i;

  var aiConsent = null;
  var aiAskPending = null;
  try {
    aiConsent = window.localStorage.getItem('acompana-ai-consent');
  } catch (consentError) {
    aiConsent = null;
  }

  function saveConsent(value) {
    aiConsent = value;
    try {
      window.localStorage.setItem('acompana-ai-consent', value);
    } catch (saveError) {
      // storage may be unavailable; the in-memory choice still applies
    }
  }

  function aiRequest(path, body) {
    var controller;
    try {
      controller = new AbortController();
    } catch (abortError) {
      return Promise.reject(new Error('no abort'));
    }
    var timer = window.setTimeout(function () {
      try {
        controller.abort();
      } catch (timerError) {
        // ignore
      }
    }, AI_TIMEOUT_MS);
    var options = { signal: controller.signal };
    if (body === undefined) {
      options.method = 'GET';
    } else {
      options.method = 'POST';
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    return fetch(AI_BASE + path, options).then(function (response) {
      window.clearTimeout(timer);
      if (!response.ok) throw new Error('bad status');
      return response.json();
    }, function (error) {
      window.clearTimeout(timer);
      throw error;
    });
  }

  // Day events without names, rooms or titles: only aggregates and
  // clinical tokens ever leave this device toward the model.
  // Logged events are merged in so the SBAR can reference what was registered.
  function dayEvents() {
    var base = [
      { time: '08:00', text: 'Cambio postural de la mañana hecho', done: true },
      { time: '11:05', text: 'Enoxaparina 40mg SC, vía abdominal aplicada', done: isConfirmed('medication') },
      { time: '11:20', text: 'Cambio postural previsto', done: isConfirmed('position') },
      { time: '13:00', text: 'Ronda programada, control de signos', done: isConfirmed('round') },
      { time: '11:00', text: 'PA 90/55, taquicardia 112, alerta protocolo hipotensión', done: false }
    ];
    var logged = loadEvents().map(function (e) {
      var kindText = e.kind === 'medication' ? 'Medicación aplicada: ' + e.text
        : e.kind === 'position' ? 'Cambio de posición: ' + e.text
        : e.kind === 'round' ? 'Ronda realizada: ' + e.text
        : 'Evento: ' + e.text;
      return { time: e.time, text: kindText, done: true };
    });
    return base.concat(logged);
  }

  // Patient timeline merges logged events as plain-language phrases
  function patientDayTimeline() {
    var items = TIMELINE_PACIENTE.slice();
    var logged = loadEvents().filter(function (e) {
      return e.patientId === FAMILY_PATIENT_ID && e.kind !== 'other' && EVENT_KIND_PHRASES[e.kind];
    });
    logged.forEach(function (e) {
      items.push({ time: e.time, text: EVENT_KIND_PHRASES[e.kind], pending: false });
    });
    return items;
  }

  // Family timeline merges logged events as plain-language phrases
  function familyDayTimeline(patient) {
    var items = familyTimeline(patient);
    var logged = loadEvents().filter(function (e) {
      return e.patientId === patient.id && e.kind !== 'other' && EVENT_KIND_PHRASES[e.kind];
    });
    logged.forEach(function (e) {
      items.push({ time: e.time, text: EVENT_KIND_PHRASES[e.kind], pending: false });
    });
    return items;
  }

  function familyFacts() {
    return [
      'Tratamiento de la mañana cumplido.',
      'El equipo está con ella, sin novedad que reportar.',
      'Horario de visita: 15:00.',
      'La enfermera vuelve a la 1:00 p. m.'
    ];
  }

  function clipAi(text, max) {
    var clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return clean.slice(0, max - 1).trimEnd() + '…';
  }

  function handoverRulesLocal(events) {
    var total = events.length;
    var done = events.filter(function (e) { return e.done; }).length;
    var pending = total - done;
    var pendTimes = events.filter(function (e) { return !e.done; }).map(function (e) { return e.time || 'sin hora'; }).join(', ');
    var vitals = events.find(function (e) { return /\bPA\b|taquicardia|hipotensi|alerta|protocolo/i.test(e.text); }) ||
      events.find(function (e) { return /signos|vitales/i.test(e.text); });
    var med = events.find(function (e) { return e.done && /mg\b|ml\b|medicamento|enoxaparina|aplic/i.test(e.text); });
    var postureDone = events.some(function (e) { return e.done && /postural|cambio de posici/i.test(e.text); });
    var round = events.find(function (e) { return /ronda/i.test(e.text); });
    var situation = total === 0
      ? 'Turno sin eventos registrados todavía.'
      : 'Turno: ' + done + ' de ' + total + ' eventos listos.' +
        (pending > 0 ? ' Faltan ' + pending + ': ' + pendTimes + '.' : ' Nada pendiente.');
    var background = med
      ? 'Aplicado: ' + med.text + ' (' + (med.time || 'turno actual') + ').' + (postureDone ? ' Cambio postural hecho.' : '')
      : 'Sin medicación aplicada en el turno.' + (postureDone ? ' Cambio postural hecho.' : '');
    var assessment = vitals
      ? 'En revisión: ' + vitals.text + '.' + (pending > 0 ? ' Quedan ' + pending + ' por confirmar.' : '')
      : 'Sin alertas en lo registrado.' + (pending > 0 ? ' Quedan ' + pending + ' por confirmar.' : '');
    var recommendation = pending > 0
      ? (round
        ? 'Completa lo pendiente y revalora signos en la ronda de las ' + (round.time || 'próxima hora') + '.'
        : 'Completa lo pendiente y deja nota en el turno.')
      : 'Turno al día. Deja nota breve para el siguiente turno.';
    return {
      s: clipAi(situation, HANDOVER_MAX),
      b: clipAi(background, HANDOVER_MAX),
      a: clipAi(assessment, HANDOVER_MAX),
      r: clipAi(recommendation, HANDOVER_MAX)
    };
  }

  // Keyword answers mirror the family column of the translation table in
  // ref/content-spec.md. Returns null when no keyword matches.
  function askRulesLocal(question, facts) {
    var q = String(question || '').toLowerCase();
    var pick = function (pattern) {
      return facts.find(function (fact) { return pattern.test(fact); });
    };
    if (/visit|horario|cu[áa]ndo (puedo|puede|vamos|ir|venir|ver|entrar)|verlo|verla|venir|entrar|hora de/.test(q)) {
      return pick(/visita/i) || null;
    }
    if (/ronda|enfermera|vuelve|vuelven|qui[ée]n (la|lo) cuida|cuida/.test(q)) {
      return pick(/ronda|enfermera|vuelve/i) || null;
    }
    if (/noche|durmi|madrugada|c[óo]mo pas|c[óo]mo est|c[óo]mo sigue|c[óo]mo amaneci|descans|tranquil/.test(q)) {
      return pick(/tranquil|sin novedad|normalidad|equipo/i) || null;
    }
    if (/medicamento|medicina|tratamiento|pastilla|inyecci|suero|remedio/.test(q)) {
      return pick(/tratamiento|medicamento|cumplido/i) || null;
    }
    return null;
  }

  function askLocal(question) {
    if (REFUSAL_RE.test(String(question || ''))) return { answer: SAFE_ANSWER_OFFLINE };
    var direct = askRulesLocal(question, familyFacts());
    if (direct) return { answer: clipAi(direct, ASK_MAX) };
    return { answer: SAFE_ANSWER_OFFLINE };
  }

  function setBadge(element, source, model) {
    if (!element) return;
    if (source === 'ollama') {
      element.textContent = 'IA local · ' + model;
      element.classList.add('is-live');
    } else {
      element.textContent = 'Plantilla';
      element.classList.remove('is-live');
    }
  }

  function consentBox(kind, payload) {
    return '<div class="consent-box"><strong>Antes de usar la IA local</strong>' +
      '<span>Esto es lo único que saldría de este equipo. Sin nombres ni datos personales. ¿Lo aceptas?</span>' +
      '<pre>' + escapeHtml(JSON.stringify(payload, null, 1)) + '</pre>' +
      '<div class="consent-row"><button type="button" class="primary-button" data-consent-yes="' + kind + '">Aceptar</button>' +
      '<button type="button" class="secondary-button" data-consent-no="' + kind + '">Ahora no</button></div></div>';
  }

  function openHandoverSheet() {
    app.aiLayer.innerHTML = '<div class="ai-backdrop" data-ai-close></div>' +
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
    app.aiLayer.classList.add('is-open');
    app.aiLayer.setAttribute('aria-hidden', 'false');
  }

  function closeAiSheet() {
    if (!app.aiLayer.classList.contains('is-open')) return;
    app.aiLayer.classList.remove('is-open');
    app.aiLayer.setAttribute('aria-hidden', 'true');
    window.setTimeout(function () {
      if (!app.aiLayer.classList.contains('is-open')) app.aiLayer.innerHTML = '';
    }, 420);
  }

  function fillHandover(draft, source, model) {
    var set = function (key, value) {
      var field = app.aiLayer.querySelector('[data-handover-' + key + ']');
      if (field) field.value = value || '';
    };
    set('s', draft.s);
    set('b', draft.b);
    set('a', draft.a);
    set('r', draft.r);
    setBadge(app.aiLayer.querySelector('[data-handover-badge]'), source, model);
    setBadge(app.screen.querySelector('[data-handover-home-badge]'), source, model);
  }

  function generateHandover() {
    if (aiConsent === 'no') {
      fillHandover(handoverRulesLocal(dayEvents()), 'rules', null);
      return;
    }
    if (aiConsent === 'yes') {
      handoverViaServer();
      return;
    }
    aiRequest('/api/handover', { events: dayEvents(), dryRun: true }).then(function (data) {
      var slot = app.aiLayer.querySelector('[data-consent-slot]');
      if (slot && data && data.payload) slot.innerHTML = consentBox('handover', data.payload);
    }, function () {
      fillHandover(handoverRulesLocal(dayEvents()), 'rules', null);
    });
  }

  function handoverViaServer() {
    aiRequest('/api/handover', { events: dayEvents() }).then(function (data) {
      fillHandover({ s: data.s, b: data.b, a: data.a, r: data.r }, data.source, data.model);
    }, function () {
      fillHandover(handoverRulesLocal(dayEvents()), 'rules', null);
    });
  }

  function copyHandover() {
    var get = function (key) {
      var field = app.aiLayer.querySelector('[data-handover-' + key + ']');
      return field ? field.value.trim() : '';
    };
    var note = 'Situación: ' + get('s') + '\nAntecedentes: ' + get('b') + '\nEvaluación: ' + get('a') + '\nRecomendación: ' + get('r');
    var feedback = app.aiLayer.querySelector('[data-ai-feedback]');
    var done = function () {
      if (feedback) feedback.textContent = 'Nota copiada. Puedes pegarla donde la necesites.';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(note).then(done, function () {
        if (feedback) feedback.textContent = 'No se pudo copiar. Selecciona el texto a mano.';
      });
    } else if (feedback) {
      feedback.textContent = 'No se pudo copiar. Selecciona el texto a mano.';
    }
  }

  function showAsk(box, text, source, model) {
    box.classList.remove('is-empty');
    box.textContent = text;
    setBadge(app.screen.querySelector('[data-ask-badge]'), source, model);
  }

  function askViaServer(question, box) {
    box.classList.remove('is-empty');
    box.textContent = 'Preguntando…';
    aiRequest('/api/ask', { question: question, facts: familyFacts() }).then(function (data) {
      showAsk(box, data.answer, data.source, data.model);
    }, function () {
      showAsk(box, askLocal(question).answer, 'rules', null);
    });
  }

  function sendAsk() {
    var input = app.screen.querySelector('[data-ask-input]');
    var box = app.screen.querySelector('[data-ask-answer]');
    if (!input || !box) return;
    var question = input.value.trim();
    if (!question) {
      showAsk(box, 'Escriba su pregunta primero.', 'rules', null);
      return;
    }
    if (aiConsent === 'no') {
      showAsk(box, askLocal(question).answer, 'rules', null);
      return;
    }
    if (aiConsent === 'yes') {
      askViaServer(question, box);
      return;
    }
    aiRequest('/api/ask', { question: question, facts: familyFacts(), dryRun: true }).then(function (data) {
      aiAskPending = question;
      box.classList.remove('is-empty');
      box.innerHTML = '';
      var wrap = document.createElement('div');
      wrap.innerHTML = consentBox('ask', data && data.payload);
      box.appendChild(wrap);
    }, function () {
      showAsk(box, askLocal(question).answer, 'rules', null);
    });
  }

  function acceptConsent(kind) {
    saveConsent('yes');
    if (kind === 'handover') {
      var slot = app.aiLayer.querySelector('[data-consent-slot]');
      if (slot) slot.innerHTML = '';
      handoverViaServer();
      return;
    }
    var box = app.screen.querySelector('[data-ask-answer]');
    if (box && aiAskPending) askViaServer(aiAskPending, box);
    aiAskPending = null;
  }

  function declineConsent(kind) {
    saveConsent('no');
    if (kind === 'handover') {
      var slot = app.aiLayer.querySelector('[data-consent-slot]');
      if (slot) slot.innerHTML = '';
      fillHandover(handoverRulesLocal(dayEvents()), 'rules', null);
      return;
    }
    var box = app.screen.querySelector('[data-ask-answer]');
    if (box && aiAskPending) showAsk(box, askLocal(aiAskPending).answer, 'rules', null);
    aiAskPending = null;
  }

  function loadNurseQuestions(slot) {
    slot.innerHTML = '<p class="view-copy muted-copy">Buscando preguntas…</p>';
    aiRequest('/api/questions').then(function (data) {
      var items = data && data.items ? data.items : [];
      if (!items.length) {
        slot.innerHTML = '<p class="view-copy muted-copy">Sin preguntas por ahora.</p>';
        return;
      }
      slot.innerHTML = items.map(function (item) {
        return '<article class="nurse-question" data-question-card="' + escapeHtml(item.id) + '">' +
          '<span>' + escapeHtml(item.question) + '</span><time>' + escapeHtml(item.at) + '</time>' +
          '<div class="ai-actions"><button type="button" class="secondary-button" data-question-done="' + escapeHtml(item.id) + '">Marcar lista</button></div></article>';
      }).join('');
    }, function () {
      slot.innerHTML = '<p class="view-copy muted-copy">Sin conexión al servidor. Sigue con la plantilla.</p>';
    });
  }

  function handleAiClick(event) {
    if (event.target.closest('[data-ai-close]')) {
      closeAiSheet();
      return;
    }
    if (event.target.closest('[data-handover-generate]')) {
      generateHandover();
      return;
    }
    if (event.target.closest('[data-handover-copy]')) {
      copyHandover();
      return;
    }
    var yes = event.target.closest('[data-consent-yes]');
    if (yes) {
      acceptConsent(yes.getAttribute('data-consent-yes'));
      return;
    }
    var no = event.target.closest('[data-consent-no]');
    if (no) declineConsent(no.getAttribute('data-consent-no'));
  }

  function initClock() {
    var time = document.querySelector('.status-time');
    if (!time) return;
    function tick() {
      var now = new Date();
      time.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }
    tick();
    window.setInterval(tick, 15000);
  }

  function initReducedMotion() {
    if (!reducedMotion.addEventListener) return;
    reducedMotion.addEventListener('change', function () {
      app.phone.classList.toggle('reduced-motion', reducedMotion.matches);
      document.querySelectorAll('.loop').forEach(function (video) {
        if (reducedMotion.matches) video.pause();
      });
    });
  }

  // Expose dayEvents for SBAR integration (used by tests).
  window.__acompana = { dayEvents: dayEvents };

  function init() {
    if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    }
    ensureVideoObserver();
    app.screen.addEventListener('click', handleScreenClick);
    app.bottomNav.addEventListener('click', handleNavClick);
    app.registrationLayer.addEventListener('click', handleRegistrationClick);
    app.aiLayer.addEventListener('click', handleAiClick);
    app.roleTabs.forEach(function (tab) { tab.addEventListener('click', handleRoleClick); });
    app.celebrationLayer.addEventListener('click', function (event) {
      if (event.target.closest('[data-close-celebration]')) hideCompletion();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && event.target && event.target.matches && event.target.matches('[data-ask-input]')) {
        event.preventDefault();
        sendAsk();
        return;
      }
      if (event.key !== 'Escape') return;
      if (app.aiLayer.classList.contains('is-open')) closeAiSheet();
      else if (state.sheetOpen) closeRegistrationSheet();
      else if (state.detailPatient) closePatientDetail();
      else if (app.celebrationLayer.classList.contains('is-visible')) hideCompletion();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) document.querySelectorAll('.loop').forEach(function (video) { video.pause(); });
    });
    initClock();
    initReducedMotion();
    initSplash();
    renderBottomNav();
    window.setTimeout(animatePendingCount, 400);
  }

  init();
}());
