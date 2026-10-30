(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var app = {
    phone: document.querySelector('.phone'),
    screen: $('screen'),
    bottomNav: $('bottomNav'),
    fab: document.querySelector('[data-fab-register]'),
    snackbar: $('snackbar'),
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
      vitals: [
        { label: 'Presión arterial', value: '90/55', unit: 'mmHg', alert: true },
        { label: 'Frecuencia cardiaca', value: '112', unit: 'lpm', alert: true },
        { label: 'Protocolo', value: 'Hipotensión', unit: 'activo', alert: true, wide: true }
      ],
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
      vitals: [
        { label: 'Medicamento', value: 'Enoxaparina', unit: '', wide: true },
        { label: 'Dosis', value: '40', unit: 'mg SC' },
        { label: 'Hora', value: '11:00', unit: 'vía abdominal' }
      ],
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
      vitals: [
        { label: 'Posición', value: 'Decúbito lateral', unit: 'izquierdo', wide: true },
        { label: 'Próximo cambio', value: '11:20', unit: 'previsto' }
      ],
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


  var NAV_BY_ROLE = {
    enfermero: [
      { key: 'turno', label: 'Turno', icon: 'list' },
      { key: 'pendientes', label: 'Pendientes', icon: 'clock' },
      { key: 'chat', label: 'Chat', icon: 'message' }
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
    pendingTab: 'pending',
    sheetOpen: false,
    sheetReturnNav: 'turno',
    faqOpen: {},
    listening: false,
    completionTimer: null,
    feedbackTimer: null,
    eventPatient: null,
    eventUndo: null,
    eventUndoTimer: null,
    chatChannel: 'familia',
    familyChatOpen: false
  };

  // Shared shift (server) + local chat mirror. The server owns ordering;
  // events merge into acompana-events by id, chat stays in memory.
  var syncState = { seq: 0, timer: null };
  var chatMessages = [];
  var pushQueue = [];
  var pushing = false;

  // placeholder: confirm in field
  var SHIFT_PHONE = ''; // TODO: insert the shift phone (empty opens the dialer blank, never a stranger)

  // Plain-language translations for patient/family timelines. Both maps
  // mirror the server's RULE_PHRASES (server/server.js): family never gets
  // intimate care (position) and free-text events reach nobody.
  var EVENT_KIND_PHRASES = {
    medication: 'Le aplicaron el medicamento',
    position: 'Le ayudaron a cambiar de posición',
    round: 'La enfermera pasó a revisar'
  };
  var EVENT_KIND_PHRASES_FAMILIA = {
    medication: 'Tratamiento cumplido',
    position: null,
    round: 'El equipo pasó a revisar'
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

  function undoEvent() {
    if (!state.eventUndo) return;
    var removedId = state.eventUndo;
    var events = loadEvents().filter(function (entry) { return entry.id !== removedId; });
    saveEvents(events);
    pushDelete(removedId);
    state.eventUndo = null;
    if (state.eventUndoTimer) {
      window.clearTimeout(state.eventUndoTimer);
      state.eventUndoTimer = null;
    }
    hideEventFeedback();
  }

  function showEventFeedback(message) {
    var feedback = app.snackbar;
    if (!feedback) return;
    feedback.textContent = '';
    var line = document.createElement('div');
    line.className = 'tray-feedback-line';
    var badge = document.createElement('span');
    badge.className = 'snack-check';
    badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = icon('check');
    line.appendChild(badge);
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
    var timer = document.createElement('span');
    timer.className = 'snack-timer';
    timer.setAttribute('aria-hidden', 'true');
    feedback.appendChild(timer);
    feedback.classList.add('is-visible');
    if (window.AcompanaMotion) window.AcompanaMotion.pop(badge, { from: 0.4, duration: 480 });
  }

  function markLogged(card) {
    if (!card) return;
    card.classList.add('is-logged');
    var mark = document.createElement('span');
    mark.className = 'logged-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = icon('check');
    card.appendChild(mark);
    if (window.AcompanaMotion) {
      window.AcompanaMotion.press(card);
      window.AcompanaMotion.pop(mark, { from: 0.3, duration: 520 });
    }
    window.setTimeout(function () {
      card.classList.remove('is-logged');
      if (mark.parentNode) mark.remove();
    }, 1400);
  }

  function hideEventFeedback() {
    var feedback = app.snackbar;
    if (!feedback) return;
    feedback.textContent = '';
    feedback.classList.remove('is-visible');
  }

  var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };
  var videoObserver = null;

  var ICONS = {
    alert: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6"></path></svg>',
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
    more: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="12" cy="19" r="1.4"></circle></svg>',
    moon: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"></path></svg>',
    sun: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>'
  };

  // Hugeicons stroke-rounded (js/icons.js); the old inline set is the fallback.
  function icon(name) {
    var huge = window.ACOMPANA_ICONS || {};
    return huge[name] || ICONS[name] || huge.check || ICONS.check;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function roleMenuItem(role, label) {
    var checked = state.role === role;
    return '<button type="button" class="demo-menu-item" role="menuitemradio" data-view-as="' + role + '" aria-checked="' + String(checked) + '">' +
      '<span class="demo-menu-check" aria-hidden="true">' + icon('check') + '</span><span>' + label + '</span></button>';
  }

  function demoMenuHtml() {
    return '<button type="button" class="top-app-bar-action" data-demo-menu aria-haspopup="menu" aria-expanded="false" aria-label="Ver como">' + icon('more') + '</button>' +
      '<div class="demo-menu" role="menu" aria-label="Ver como">' +
      '<p class="demo-menu-label">Ver como</p>' +
      roleMenuItem('enfermero', 'Enfermero') +
      roleMenuItem('paciente', 'Paciente') +
      roleMenuItem('familia', 'Familia') +
      '<div class="demo-menu-divider" aria-hidden="true"></div>' +
      '<button type="button" class="demo-menu-item demo-menu-theme" role="menuitem" data-menu-theme aria-pressed="false">' +
      '<span class="demo-menu-check demo-menu-theme-icon" aria-hidden="true">' + icon('moon') + '</span><span data-theme-label>Tema oscuro</span></button>' +
      '</div>';
  }

  function themeToggleHtml() {
    return '<button type="button" class="top-app-bar-action theme-toggle" data-theme-toggle aria-label="Cambiar a tema oscuro" aria-pressed="false">' +
      '<span class="theme-icon theme-icon-moon" aria-hidden="true">' + icon('moon') + '</span>' +
      '<span class="theme-icon theme-icon-sun" aria-hidden="true">' + icon('sun') + '</span></button>';
  }

  // Every view gets a Material top app bar. The existing h1 (and back
  // button) are lifted into it so there is exactly one h1 per view.
  function buildTopBar(view) {
    // Home screens use the Medixin greeting as their app bar.
    var greet = view.querySelector('[data-greet]');
    if (greet) {
      greet.classList.add('top-app-bar');
      var greetActions = document.createElement('div');
      greetActions.className = 'top-app-bar-actions';
      greetActions.innerHTML = themeToggleHtml() + demoMenuHtml();
      greet.appendChild(greetActions);
      return;
    }
    var h1 = view.querySelector('h1');
    var back = view.querySelector('[data-back]');
    var bar = document.createElement('header');
    bar.className = 'top-app-bar';
    if (back) bar.appendChild(back);
    var title = document.createElement('div');
    title.className = 'top-app-bar-title';
    if (h1) {
      var headerCopy = h1.closest('.view-header-copy');
      if (headerCopy) {
        var header = headerCopy.closest('.view-header');
        title.appendChild(headerCopy);
        if (header && !header.querySelector('h1, [data-back]') && !header.textContent.trim()) header.remove();
      } else {
        title.appendChild(h1);
      }
    }
    bar.appendChild(title);
    var actions = document.createElement('div');
    actions.className = 'top-app-bar-actions';
    actions.innerHTML = themeToggleHtml() + demoMenuHtml();
    bar.appendChild(actions);
    view.insertBefore(bar, view.firstChild);
  }

  function removeBarActions(view) {
    var actions = view.querySelector('.top-app-bar-actions');
    if (actions) actions.remove();
  }

  function ensureBarActions(view) {
    var bar = view.querySelector('.top-app-bar');
    if (!bar || bar.querySelector('.top-app-bar-actions')) return;
    var actions = document.createElement('div');
    actions.className = 'top-app-bar-actions';
    actions.innerHTML = themeToggleHtml() + demoMenuHtml();
    bar.appendChild(actions);
  }

  // ---- Android navigation: layers + system Back ----
  var layerOrder = [];
  var layerOpen = {};
  var layerPushed = {};
  var suppressPop = 0;

  function pushLayer(id) {
    if (layerOpen[id]) return;
    layerOpen[id] = true;
    layerOrder.push(id);
    var pushed = false;
    try {
      history.pushState({ acompanaLayer: id }, '');
      pushed = true;
    } catch (error) {
      // file:// and sandboxed contexts: keep the layer working without history
    }
    layerPushed[id] = pushed;
  }

  function dropLayer(id, fromPop) {
    if (!layerOpen[id]) return;
    delete layerOpen[id];
    var index = layerOrder.indexOf(id);
    if (index !== -1) layerOrder.splice(index, 1);
    var pushed = layerPushed[id];
    delete layerPushed[id];
    if (!fromPop && pushed) {
      suppressPop += 1;
      try {
        history.back();
      } catch (error) {
        suppressPop -= 1;
      }
    }
  }

  function topLayer() {
    return layerOrder.length ? layerOrder[layerOrder.length - 1] : null;
  }

  function isConfirmed(taskId) {
    return Boolean(state.confirmed[taskId]);
  }

  function remainingTasks() {
    return TASKS.filter(function (task) { return !isConfirmed(task.id); });
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




  function timeline(items) {
    return '<div class="timeline">' + items.map(function (item) {
      var attrs = item.eventId
        ? ' data-translate-id="' + escapeHtml(item.eventId) + '"' +
          ' data-translate-kind="' + escapeHtml(item.kind) + '"'
        : '';
      // 32px status badge: white icon on a filled circle (done = check on the
      // patient green; pending = clock on the primary gradient; visit/AI lines
      // may swap in the calendar icon).
      var badgeIcon = item.icon || (item.pending ? 'clock' : 'check');
      var badge = '<span class="timeline-badge' + (item.pending ? ' is-pending' : '') + '" aria-hidden="true">' + icon(badgeIcon) + '</span>';
      return '<div class="timeline-item' + (item.pending ? ' is-pending' : '') + '"' + attrs + '>' + badge + '<span class="timeline-time">' + escapeHtml(item.time) + '</span><p class="timeline-text">' + escapeHtml(item.text) + '</p></div>';
    }).join('') + '</div>';
  }



  function viewDefinition() {
    if (state.role === 'enfermero') {
      if (state.detailPatient) {
        return { key: 'nurse-detail', className: 'is-detail', inner: views.nurse.renderNurseDetail(state.detailPatient) };
      }
      if (state.activeNav[state.role] === 'chat') {
        return { key: 'nurse-chat', className: 'is-home', inner: views.chat.renderNurseChat() };
      }
      if (state.activeNav[state.role] === 'pendientes') {
        return { key: 'nurse-pending', className: 'is-home', inner: views.nurse.renderPending() };
      }
      return { key: 'nurse-home', className: 'is-home', inner: views.nurse.renderNurseHome() };
    }
    if (state.role === 'paciente') {
      return state.activeNav[state.role] === 'preguntas'
        ? { key: 'patient-questions', className: 'is-home', inner: views.patient.renderQuestions() }
        : { key: 'patient-home', className: 'is-home', inner: views.patient.renderPatient() };
    }
    if (state.activeNav[state.role] === 'contacto') {
      return state.familyChatOpen
        ? { key: 'family-chat', className: 'is-home', inner: views.chat.renderFamilyChat() }
        : { key: 'family-contact', className: 'is-home', inner: views.family.renderContact() };
    }
    return { key: 'family-home', className: 'is-home', inner: views.family.renderFamily() };
  }

  function createView(definition, direction) {
    var view = document.createElement('section');
    view.className = 'view ' + definition.className + (direction === 'back' ? ' from-left' : ' from-right');
    view.dataset.viewKey = definition.key;
    view.setAttribute('role', 'region');
    view.innerHTML = definition.inner;
    buildTopBar(view);
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

  function popSuccessCheck(container) {
    var check = container ? container.querySelector('.success-check') : null;
    if (check && window.AcompanaMotion) window.AcompanaMotion.pop(check);
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
        popSuccessCheck(next);
      });
    } else {
      app.screen.appendChild(next);
      requestAnimationFrame(function () {
        current.classList.remove('is-active');
        current.classList.add('is-leaving', direction === 'back' ? 'to-right' : 'to-left');
        next.classList.remove('from-left', 'from-right');
        next.classList.add('is-active');
        bindVideos(next);
        popSuccessCheck(next);
        window.setTimeout(function () {
          if (current.parentNode) current.remove();
        }, 320);
      });
    }
    renderBottomNav();
    // Reader timelines: once the fresh view is in the DOM, fill its logged
    // lines with cached or fresh server translations (only with consent).
    applyTimelineTranslations(next, state.role);
    staggerContactOptions(next);
  }

  // New reader lists enter with the shared motion helper (js/motion.js).
  function staggerContactOptions(view) {
    if (!view || !view.querySelector) return;
    var list = view.querySelector('.contact-options');
    var motion = window.AcompanaMotion;
    if (!list || !motion || !motion.stagger) return;
    motion.stagger(list, '.contact-option', { step: getStaggerMs(), delay: 80 });
  }

  function renderBottomNav() {
    var items = NAV_BY_ROLE[state.role];
    app.bottomNav.innerHTML = items.map(function (item) {
      var active = item.key === state.activeNav[state.role];
      return '<button type="button" class="nav-item' + (active ? ' is-active' : '') + '" data-nav="' + escapeHtml(item.key) + '" aria-label="' + escapeHtml(item.label) + '" aria-pressed="' + String(active) + '"><span class="nav-icon">' + icon(item.icon) + '</span><span>' + escapeHtml(item.label) + '</span></button>';
    }).join('');
    updateFab();
  }

  function updateFab() {
    if (!app.fab) return;
    app.fab.hidden = state.role !== 'enfermero' || !!state.detailPatient;
    var chatNav = app.bottomNav.querySelector('[data-nav="chat"]');
    if (chatNav) chatNav.hidden = !!state.detailPatient;
  }

  function openDemoMenu(button) {
    document.querySelectorAll('.demo-menu.is-open').forEach(function (menu) {
      menu.classList.remove('is-open');
    });
    var menu = button.parentElement.querySelector('.demo-menu');
    if (!menu) return;
    menu.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
    pushLayer('menu');
  }

  function closeDemoMenu(fromPop) {
    var menu = document.querySelector('.demo-menu.is-open');
    if (menu) {
      menu.classList.remove('is-open');
      var button = menu.parentElement.querySelector('[data-demo-menu]');
      if (button) button.setAttribute('aria-expanded', 'false');
    }
    dropLayer('menu', fromPop);
  }

  function updateRole(role) {
    // Nurse feedback (and its undo) must never follow into another reader's view.
    hideEventFeedback();
    var nextIndex = ROLE_INDEX[role];
    var currentIndex = ROLE_INDEX[state.role];
    state.role = role;
    if (state.detailPatient) dropLayer('detail');
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
    pushLayer('detail');
    home.classList.add('is-behind');
    home.classList.remove('is-active');
    removeBarActions(home);
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

  function closePatientDetail(fromPop) {
    var detail = app.screen.querySelector('.view[data-view-key="nurse-detail"]');
    var home = app.screen.querySelector('.view[data-view-key="nurse-home"]');
    state.detailPatient = null;
    dropLayer('detail', fromPop);
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
      ensureBarActions(home);
    }
    window.setTimeout(function () { if (detail.parentNode) detail.remove(); }, 320);
    renderBottomNav();
  }

  // Without a patient in context, start from whoever's next task is due.
  function nextDuePatientId() {
    var due = remainingTasks().slice().sort(function (x, y) { return x.time < y.time ? -1 : x.time > y.time ? 1 : 0; })[0];
    return due ? due.patientId : PATIENTS[0].id;
  }

  // Replace the visible view with a fresh render so changes show at once.
  function refreshActiveView() {
    var current = app.screen.querySelector('.view.is-active');
    if (!current) return;
    var next = createView(viewDefinition(), 'forward');
    next.classList.remove('from-right');
    next.classList.add('is-active');
    current.replaceWith(next);
    bindVideos(next);
    updateFab();
  }

  function openRegistrationSheet() {
    if (state.sheetOpen) return;
    state.sheetOpen = true;
    pushLayer('register');
    state.sheetReturnNav = state.activeNav.enfermero === 'registrar' ? 'turno' : state.activeNav.enfermero;
    state.activeNav.enfermero = 'registrar';
    state.eventPatient = state.detailPatient ? state.detailPatient.id : (state.lastEventPatient || nextDuePatientId());
    clearUndo();
    app.registrationLayer.innerHTML = views.sheets.registrationSheet(state.eventPatient);
    app.registrationLayer.classList.add('is-open');
    app.registrationLayer.setAttribute('aria-hidden', 'false');
    renderBottomNav();
    bindSheetDrag();
    requestAnimationFrame(function () {
      var title = app.registrationLayer.querySelector('.sheet-title');
      if (title) {
        title.setAttribute('tabindex', '-1');
        title.focus({ preventScroll: true });
      }
      var motion = window.AcompanaMotion;
      if (motion) motion.stagger(app.registrationLayer.querySelector('.registration-sheet'), '.event-patient-picker, .quick-events > *, .dictate-button', { step: 45, delay: 120 });
    });
  }

  function closeRegistrationSheet(restoreNav, fromPop) {
    if (!state.sheetOpen) return;
    state.sheetOpen = false;
    dropLayer('register', fromPop);
    if (restoreNav !== false) state.activeNav.enfermero = state.sheetReturnNav || 'turno';
    app.registrationLayer.classList.remove('is-open');
    app.registrationLayer.setAttribute('aria-hidden', 'true');
    renderBottomNav();
    if (state.eventsDirty) {
      state.eventsDirty = false;
      refreshActiveView();
    }
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
    var doneTasks = TASKS.filter(function (task) { return isConfirmed(task.id); });
    var rows = doneTasks.map(function (task) {
      var patient = patientById(task.patientId);
      return '<li class="summary-row"><span class="summary-icon" aria-hidden="true">' + icon('check') + '</span>' +
        '<span class="summary-copy"><strong>' + escapeHtml(task.title) + '</strong><span>' + escapeHtml(task.time) + ' · ' + escapeHtml(patient ? patient.name : task.note) + '</span></span></li>';
    }).join('');
    app.celebrationLayer.innerHTML = '<div class="celebration-card"><span class="success-check" data-success-check aria-hidden="true">' + icon('check') + '</span><h2>Todo al día</h2><p>Todo confirmado. El equipo puede seguir con tranquilidad.</p><ul class="summary-card summary-rows">' + rows + '</ul><div class="celebration-mascot"><img class="celebration-doctor-image" src="media/frames/doctora-white.png" alt="Doctora celebrando"></div><button type="button" class="btn btn-primary" data-close-celebration>Volver al turno</button><div class="confetti-layer" aria-hidden="true">' + pieces + '</div></div>';
    app.celebrationLayer.classList.add('is-visible');
    app.celebrationLayer.setAttribute('aria-hidden', 'false');
    popSuccessCheck(app.celebrationLayer);
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

  function handleScreenClick(event) {
    var demoMenu = event.target.closest('[data-demo-menu]');
    if (demoMenu) {
      var openMenu = demoMenu.parentElement.querySelector('.demo-menu');
      if (openMenu && openMenu.classList.contains('is-open')) closeDemoMenu();
      else openDemoMenu(demoMenu);
      return;
    }

    var viewAs = event.target.closest('[data-view-as]');
    if (viewAs) {
      var role = viewAs.getAttribute('data-view-as');
      closeDemoMenu();
      updateRole(role);
      // Each reader gets a different feed: read it again from the start.
      syncState.seq = 0;
      pollSync();
      return;
    }

    var menuTheme = event.target.closest('.demo-menu [data-menu-theme]');
    if (menuTheme) {
      if (window.acompanaTheme) window.acompanaTheme.toggle(event);
      closeDemoMenu();
      return;
    }

    var pendingTab = event.target.closest('[data-pending-tab]');
    if (pendingTab) {
      var tab = pendingTab.getAttribute('data-pending-tab');
      if (state.pendingTab !== tab) {
        state.pendingTab = tab;
        renderRoute('forward', true);
      }
      return;
    }

    var familyShare = event.target.closest('[data-share-family]');
    if (familyShare) {
      if (state.detailPatient) shareWithFamily(state.detailPatient);
      return;
    }

    var openRegister = event.target.closest('[data-open-register]');
    if (openRegister) {
      if (state.detailPatient) state.eventPatient = state.detailPatient.id;
      openRegistrationSheet();
      return;
    }

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

    // "Mensaje" on Contacto opens the existing family ask box on the home view.
    var askOpen = event.target.closest('[data-ask-open]');
    if (askOpen) {
      openFamilyAsk();
      return;
    }

    var chatOpen = event.target.closest('[data-chat-open]');
    if (chatOpen) {
      state.familyChatOpen = true;
      state.activeNav.familia = 'contacto';
      renderRoute('forward', true);
      return;
    }

    var chatBack = event.target.closest('[data-chat-back]');
    if (chatBack) {
      state.familyChatOpen = false;
      renderRoute('back', true);
      return;
    }

    var chatChannel = event.target.closest('[data-chat-channel]');
    if (chatChannel) {
      state.chatChannel = chatChannel.getAttribute('data-chat-channel');
      // Same view key: swap in place so the old thread never lingers beside
      // the new one (duplicate messages during the transition).
      if (state.role === 'enfermero' && state.activeNav.enfermero === 'chat' && !state.detailPatient) {
        refreshActiveView();
      } else {
        renderRoute('forward', true);
      }
      return;
    }

    var chatSend = event.target.closest('[data-chat-send]');
    if (chatSend) {
      sendChat(chatSend.getAttribute('data-chat-channel-send'));
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
    if (state.role === 'familia') state.familyChatOpen = false;
    state.detailPatient = null;
    if (state.role === 'enfermero' && key === 'pendientes') state.pendingTab = 'pending';
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
      state.lastEventPatient = state.eventPatient;
      var allBtns = app.registrationLayer.querySelectorAll('[data-event-patient]');
      allBtns.forEach(function (b) {
        var on = b.getAttribute('data-event-patient') === state.eventPatient;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('is-selected', on);
      });
      if (window.AcompanaMotion) {
        window.AcompanaMotion.press(patientBtn);
        window.AcompanaMotion.pop(patientBtn.querySelector('.chip-icon') || patientBtn, { from: 0.6, duration: 460 });
      }
      return;
    }
    var undo = event.target.closest('[data-undo-event]');
    if (undo) {
      undoEvent();
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
      markLogged(quick);
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
    state.eventsDirty = true;
    evs.push(entry);
    saveEvents(evs);
    pushEvent(entry);
    state.eventUndo = id;
    if (state.eventUndoTimer) window.clearTimeout(state.eventUndoTimer);
    // Spanish agreement: "Medicación/Ronda registrada", "Cambio/Otro evento registrado".
    var label = kind === 'medication' ? 'Medicación registrada' : kind === 'position' ? 'Cambio de posición registrado' : kind === 'round' ? 'Ronda registrada' : 'Evento registrado';
    showEventFeedback(label + ' · ' + entry.time);
    state.eventUndoTimer = window.setTimeout(function () {
      state.eventUndo = null;
      hideEventFeedback();
    }, 5000);
  }

  var KIND_LABELS = { medication: 'Medicación', position: 'Cambio de posición', round: 'Ronda', other: 'Otro evento' };
  var activeRecognizer = null;

  function showProposal(kind, text) {
    var proposal = app.registrationLayer.querySelector('[data-event-proposal]');
    if (!proposal) return;
    proposal.dataset.pendingKind = kind;
    proposal.dataset.pendingText = text;
    proposal.querySelector('[data-proposal-kind]').textContent = KIND_LABELS[kind] || 'Evento';
    proposal.querySelector('[data-proposal-text]').textContent = text;
    proposal.classList.add('is-visible');
    if (window.AcompanaMotion) window.AcompanaMotion.pop(proposal, { from: 0.92, duration: 420 });
  }

  function setDictateState(listening, live) {
    var button = app.registrationLayer.querySelector('[data-dictate]');
    if (!button) return;
    button.classList.toggle('is-listening', listening);
    button.setAttribute('aria-pressed', String(listening));
    var strong = button.querySelector('.dictate-copy strong');
    var small = button.querySelector('.dictate-copy small');
    if (strong) strong.textContent = listening ? 'Escuchando… toca para terminar' : 'Dictar evento';
    if (small) {
      small.textContent = listening ? (live || 'Habla con normalidad') : 'Toca para dictar';
      small.classList.toggle('dictate-live', listening);
    }
  }

  // Explain why dictation could not run and fall back to typing.
  function dictationFallback(message) {
    setDictateState(false);
    var field = app.registrationLayer.querySelector('[data-other-field]');
    if (field) field.classList.add('is-visible');
    var note = app.registrationLayer.querySelector('[data-dictate-note]');
    if (!note && field) {
      note = document.createElement('p');
      note.className = 'dictate-note';
      note.setAttribute('data-dictate-note', '');
      note.setAttribute('role', 'status');
      field.insertBefore(note, field.firstChild);
    }
    if (note) note.textContent = message;
  }

  function startDictation() {
    // A second tap while listening stops and keeps what was heard.
    if (activeRecognizer) {
      activeRecognizer.stop();
      return;
    }
    // Prefer webkitSpeechRecognition (Chrome, and the test mock).
    var SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SpeechRecognition) {
      dictationFallback('Este navegador no permite dictar. Escribe el evento.');
      return;
    }
    if (navigator.brave) {
      dictationFallback('Brave bloquea el dictado por voz. Abre la app en Chrome o escribe el evento.');
      return;
    }
    if (window.isSecureContext === false) {
      dictationFallback('El micrófono necesita abrir la app por https. Escribe el evento.');
      return;
    }
    var recog = new SpeechRecognition();
    var finalText = '';
    var gotResult = false;
    recog.lang = 'es-CO';
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    activeRecognizer = recog;
    setDictateState(true);
    recog.onresult = function (event) {
      var interim = '';
      for (var i = event.resultIndex || 0; i < event.results.length; i += 1) {
        var result = event.results[i];
        var chunk = result[0].transcript;
        if (result.isFinal !== false) finalText += chunk;
        else interim += chunk;
      }
      gotResult = true;
      setDictateState(true, (finalText + ' ' + interim).trim());
    };
    recog.onerror = function (event) {
      activeRecognizer = null;
      var code = event && event.error;
      var messages = {
        'not-allowed': 'Permite el micrófono para dictar, o escribe el evento.',
        'service-not-allowed': 'El micrófono necesita abrir la app por https. Escribe el evento.',
        'no-speech': 'No te escuché. Toca de nuevo o escribe el evento.',
        'audio-capture': 'No encontré un micrófono. Escribe el evento.',
        'network': 'El servicio de voz no respondió (en Brave está bloqueado). Usa Chrome o escribe el evento.'
      };
      if (code === 'aborted') { setDictateState(false); return; }
      dictationFallback(messages[code] || 'No se pudo dictar. Escribe el evento.');
    };
    recog.onend = function () {
      activeRecognizer = null;
      setDictateState(false);
      var transcript = finalText.trim();
      if (!transcript) {
        if (!gotResult) return;
        dictationFallback('No te entendí bien. Toca de nuevo o escribe el evento.');
        return;
      }
      if (aiConsent === 'yes') {
        aiRequest('/api/event', { text: transcript }).then(function (result) {
          showProposal(result.kind, result.text || transcript);
        }, function () {
          var r = classifyEventRulesLocal(transcript);
          showProposal(r.kind, r.text);
        });
      } else {
        var r = classifyEventRulesLocal(transcript);
        showProposal(r.kind, r.text);
      }
    };
    try {
      recog.start();
    } catch (startError) {
      activeRecognizer = null;
      dictationFallback('No se pudo abrir el micrófono. Escribe el evento.');
    }
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
  // server. Model calls run ONLY on an explicit tap, with a 12s timeout,
  // and falls back silently to the on-device template. A badge always
  // shows which source produced the text: "Plantilla" or "IA".
  var AI_BASE =
    (location.protocol === 'http:' || location.protocol === 'https:')
      ? location.origin
      : 'http://127.0.0.1:8787';
  var AI_TIMEOUT_MS = 12000; // cloud gemma; the server gives up at 10s
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

  // ---- Per-reader event translations on the patient/family timelines ----
  // Every logged line keeps its local plain phrase until the server answers.
  // The client asks /api/translate only with {event:{kind,text}, reader} (no
  // names) and only when the reader said yes to AI. Results are cached per
  // event id + reader in memory and localStorage so re-renders don't refetch.
  var TRANSLATE_CACHE_KEY = 'acompana-translate-cache';
  var translateMemoryCache = null; // parsed localStorage mirror
  var translateInFlight = {}; // cacheKey -> true while a request runs

  function translateCacheKey(eventId, reader) {
    return reader + ':' + eventId;
  }

  function loadTranslateCache() {
    if (translateMemoryCache) return translateMemoryCache;
    try {
      translateMemoryCache = JSON.parse(window.localStorage.getItem(TRANSLATE_CACHE_KEY) || '{}') || {};
    } catch (cacheError) {
      translateMemoryCache = {};
    }
    return translateMemoryCache;
  }

  function saveTranslateCache(value, cacheKey, entry) {
    if (value && cacheKey) value[cacheKey] = entry;
    try {
      window.localStorage.setItem(TRANSLATE_CACHE_KEY, JSON.stringify(value));
    } catch (saveError) {
      // storage may be unavailable: the in-memory cache still applies
    }
  }

  // Fonts one timeline line with a server answer: hidden when text is null,
  // literate with the existing source-badge when the model wrote the words.
  function paintTranslatedLine(element, entry) {
    if (!element || !element.parentNode) return;
    if (!entry || entry.text == null || entry.text === '') {
      element.parentNode.removeChild(element);
      return;
    }
    var line = element.querySelector('.timeline-text');
    if (line) line.textContent = entry.text;
    var badge = element.querySelector('.source-badge');
    if (entry.source && entry.source !== 'rules') {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'source-badge timeline-source';
        line.appendChild(badge);
      }
      badge.textContent = 'IA';
      badge.classList.add('is-live');
    }
  }

  function applyOneTranslatedLine(element, cache) {
    var eventId = element.getAttribute('data-translate-id');
    var reader = element.getAttribute('data-translate-reader');
    var kind = element.getAttribute('data-translate-kind');
    // The raw nurse text never sits in the patient/family DOM: look it up.
    var source = loadEvents().filter(function (e) { return e.id === eventId; })[0];
    var text = source ? source.text : '';
    if (!eventId || !kind || !text) return;
    var cacheKey = translateCacheKey(eventId, reader);
    var cached = Object.prototype.hasOwnProperty.call(cache, cacheKey) ? cache[cacheKey] : null;
    if (cached && typeof cached === 'object') {
      paintTranslatedLine(element, cached);
      return;
    }
    if (translateInFlight[cacheKey]) return;
    translateInFlight[cacheKey] = true;
    aiRequest('/api/translate', {
      event: { kind: kind, text: text },
      reader: reader
    }).then(function (data) {
      delete translateInFlight[cacheKey];
      if (!data || typeof data !== 'object') return;
      var entry = { text: data.text, source: data.source, model: data.model };
      saveTranslateCache(cache, cacheKey, entry);
      paintTranslatedLine(element, entry);
    }, function () {
      delete translateInFlight[cacheKey];
      // failure, offline or timeout: keep the local phrase silently
    });
  }

  // Called for every fresh render of the patient and family timelines.
  function applyTimelineTranslations(view, role) {
    if (role !== 'paciente' && role !== 'familia') return;
    if (aiConsent !== 'yes') return; // no consent: local phrase, no calls
    if (!view || !view.querySelector) return;
    var lines = view.querySelectorAll('[data-translate-id]');
    if (!lines.length) return;
    var cache = loadTranslateCache();
    Array.prototype.forEach.call(lines, function (element) {
      element.setAttribute('data-translate-reader', role);
      applyOneTranslatedLine(element, cache);
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


  // Plain phrases for the patient's family: confirmed tasks plus logged
  // events, exactly the source familyMessage uses. No clinical values.
  function familyEventPhrases(patient) {
    var lines = [];
    TASKS.forEach(function (task) {
      if (task.patientId !== patient.id || !isConfirmed(task.id)) return;
      var phrase = EVENT_KIND_PHRASES_FAMILIA[TASK_KIND[task.id]];
      if (phrase && lines.indexOf(phrase) === -1) lines.push(phrase);
    });
    loadEvents().forEach(function (e) {
      if (e.patientId !== patient.id) return;
      var phrase = EVENT_KIND_PHRASES_FAMILIA[e.kind];
      if (phrase && lines.indexOf(phrase) === -1) lines.push(phrase);
    });
    return lines;
  }

  function familyFacts() {
    var patient = patientById(FAMILY_PATIENT_ID);
    var phrases = patient ? familyEventPhrases(patient) : [];
    // Same lines the family reads on Qué pasa, then what was logged today.
    var facts = [
      'Tratamiento de la mañana cumplido.',
      'El equipo está con ' + (patient ? patient.pronoun : 'ella') + ', sin novedad que reportar.'
    ];
    phrases.forEach(function (phrase) {
      var fact = phrase + '.';
      if (facts.indexOf(fact) === -1) facts.push(fact);
    });
    facts.push('Horario de visita: hoy de 3:00 a 5:00 p. m.');
    facts.push('La enfermera vuelve a la 1:00 p. m.');
    return facts;
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
      element.textContent = 'IA · ' + model;
      element.classList.add('is-live');
    } else {
      element.textContent = 'Plantilla';
      element.classList.remove('is-live');
    }
  }


  function openHandoverSheet() {
    app.aiLayer.innerHTML = views.sheets.handoverSheet();
    app.aiLayer.classList.add('is-open');
    app.aiLayer.setAttribute('aria-hidden', 'false');
    pushLayer('ai');
  }

  function closeAiSheet(fromPop) {
    if (!app.aiLayer.classList.contains('is-open')) {
      dropLayer('ai', fromPop);
      return;
    }
    app.aiLayer.classList.remove('is-open');
    app.aiLayer.setAttribute('aria-hidden', 'true');
    dropLayer('ai', fromPop);
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
      if (slot && data && data.payload) slot.innerHTML = views.sheets.consentBox('handover', data.payload);
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

  // "Avisar a la familia": a WhatsApp-ready message built only from the family
  // phrases (never clinical values), plus a link that opens the family view.
  var TASK_KIND = { medication: 'medication', position: 'position', round: 'round' };

  function familyMessage(patient) {
    var lines = familyEventPhrases(patient);
    if (!lines.length) lines.push('El equipo está pendiente y no hay novedades que reportar');
    var text = 'Hola, familia de ' + patient.name + '.\n' +
      'Resumen del turno de hoy (' + patient.room + '):\n' +
      lines.map(function (line) { return '• ' + line; }).join('\n') + '\n' +
      'Horario de visita: hoy de 3:00 a 5:00 p. m.\n' +
      '— Elena, enfermera de turno';
    return { text: text };
  }

  // "Avisar a la familia" now lands in the family chat inside the app.
  function shareWithFamily(patient) {
    var text = familyMessage(patient).text;
    if (!canSync()) {
      showSnack('Sin conexión. El mensaje no se envió.');
      return;
    }
    postChat('familia', text, 'Elena', patient.id).then(function (message) {
      rememberChatMessage(message);
      showSnack('Mensaje enviado a la familia', true);
      refreshChatThread();
    }, function () {
      showSnack('Sin conexión. El mensaje no se envió.');
    });
  }

  // ---- Shared shift: push local events, poll /api/sync, in-app chat ----
  function canSync() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  var snackTimer = null;
  function showSnack(message, success) {
    var bar = app.snackbar;
    if (!bar) return;
    bar.textContent = '';
    var line = document.createElement('div');
    line.className = 'tray-feedback-line';
    if (success) {
      var badge = document.createElement('span');
      badge.className = 'snack-check';
      badge.setAttribute('aria-hidden', 'true');
      badge.innerHTML = icon('check');
      line.appendChild(badge);
    }
    var copy = document.createElement('span');
    copy.textContent = message;
    line.appendChild(copy);
    bar.appendChild(line);
    bar.classList.add('is-visible');
    if (snackTimer) window.clearTimeout(snackTimer);
    snackTimer = window.setTimeout(function () {
      if (bar.textContent === message) hideEventFeedback();
    }, 2600);
  }

  function postChat(channel, text, author, patientId) {
    return aiRequest('/api/chat', {
      channel: channel,
      patientId: patientId || '',
      author: author,
      text: text
    }).then(function (data) {
      return data && data.message ? data.message : null;
    });
  }

  // A poll can bring a message back before its own POST resolves.
  function rememberChatMessage(message) {
    if (!message || !message.id) return false;
    var known = chatMessages.some(function (item) { return item.id === message.id; });
    if (!known) chatMessages.push(message);
    return !known;
  }

  // Only the thread is replaced, so the composer keeps its focus and keyboard.
  function refreshChatThread() {
    var thread = app.screen.querySelector('[data-chat-thread]');
    if (!thread) return false;
    thread.innerHTML = views.chat.threadBody(thread.getAttribute('data-chat-thread'));
    thread.scrollTop = thread.scrollHeight;
    return true;
  }

  function sendChat(channel) {
    var input = app.screen.querySelector('[data-chat-input]');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    if (!canSync()) {
      showSnack('Sin conexión. El mensaje no se envió.');
      return;
    }
    var isFamily = state.role === 'familia';
    var patientId = isFamily ? FAMILY_PATIENT_ID :
      (state.detailPatient ? state.detailPatient.id : FAMILY_PATIENT_ID);
    var author = isFamily ? 'Familia' : 'Elena';
    // The bubble appears at once and its status line tracks the send.
    var pending = {
      id: 'local-' + Date.now(),
      channel: channel || 'familia',
      author: author,
      text: text,
      time: new Date().toISOString(),
      status: 'sending'
    };
    chatMessages.push(pending);
    input.value = '';
    refreshChatThread();
    postChat(pending.channel, text, author, patientId).then(function (message) {
      chatMessages.splice(chatMessages.indexOf(pending), 1);
      rememberChatMessage(message);
      refreshChatThread();
    }, function () {
      pending.status = 'failed';
      refreshChatThread();
      if (!input.value) input.value = text;
      showSnack('Sin conexión. El mensaje no se envió.');
    });
  }

  // Centered over the sheet whatever its scroll; it clears itself.
  var handoverSentTimer = null;
  function showHandoverSent() {
    var old = app.aiLayer.querySelector('[data-handover-sent]');
    if (old) old.remove();
    var card = document.createElement('div');
    card.className = 'handover-sent';
    card.setAttribute('data-handover-sent', '');
    card.setAttribute('aria-hidden', 'true');
    card.innerHTML = '<span class="success-check" data-success-check>' + icon('check') + '</span><strong>Nota enviada</strong>';
    app.aiLayer.appendChild(card);
    popSuccessCheck(app.aiLayer);
    if (handoverSentTimer) window.clearTimeout(handoverSentTimer);
    handoverSentTimer = window.setTimeout(function () { card.remove(); }, 1600);
  }

  function sendHandoverToTeam() {
    var feedback = app.aiLayer.querySelector('[data-ai-feedback]');
    if (!canSync()) {
      if (feedback) feedback.textContent = 'Sin conexión. La nota no se envió.';
      return;
    }
    var fields = app.aiLayer.querySelectorAll('.handover-field textarea');
    var hasText = Array.prototype.some.call(fields, function (field) { return field.value.trim(); });
    if (!hasText) {
      if (feedback) feedback.textContent = 'Escribe la nota antes de enviarla.';
      return;
    }
    var patientId = state.detailPatient ? state.detailPatient.id : FAMILY_PATIENT_ID;
    var note = handoverNote();
    postChat('equipo', note, 'Elena', patientId).then(function (message) {
      rememberChatMessage(message);
      fields.forEach(function (field) { field.value = ''; });
      if (feedback) feedback.textContent = 'Nota enviada al equipo.';
      showHandoverSent();
    }, function () {
      if (feedback) feedback.textContent = 'Sin conexión. La nota no se envió.';
    });
  }

  function pushEvent(entry) {
    pushQueue.push({ type: 'event', event: entry });
    flushPushes();
  }

  function pushDelete(id) {
    pushQueue.push({ type: 'delete', id: id });
    flushPushes();
  }

  function flushPushes() {
    if (!canSync() || pushing || !pushQueue.length) return;
    pushing = true;
    var item = pushQueue[0];
    var next = function () {
      pushing = false;
      pushQueue.shift();
      if (pushQueue.length) flushPushes();
    };
    var fail = function () {
      // Keep it queued: the next poll retries.
      pushing = false;
    };
    if (item.type === 'event') aiRequest('/api/events', item.event).then(next, fail);
    else aiRequest('/api/events/delete', { id: item.id }).then(next, fail);
  }

  function readerForSync() {
    return state.role === 'enfermero' ? 'enfermero' : state.role;
  }

  // Merge by id: the family feed carries empty text, which never overwrites a
  // text this device already has. Returns true when something changed.
  function mergeShared(data) {
    if (!data || typeof data !== 'object') return false;
    var changed = false;
    var events = loadEvents();
    var byId = {};
    events.forEach(function (entry) { byId[entry.id] = entry; });
    (data.events || []).forEach(function (incoming) {
      if (!incoming || !incoming.id) return;
      var existing = byId[incoming.id];
      if (existing) {
        if (incoming.kind && incoming.kind !== existing.kind) {
          existing.kind = incoming.kind;
          changed = true;
        }
        if (incoming.text && incoming.text !== existing.text) {
          existing.text = incoming.text;
          changed = true;
        }
        if (incoming.time && !existing.time) {
          existing.time = incoming.time;
          changed = true;
        }
        return;
      }
      var entry = {
        id: incoming.id,
        patientId: incoming.patientId || '',
        kind: incoming.kind || 'other',
        text: incoming.text || '',
        time: incoming.time || ''
      };
      events.push(entry);
      byId[entry.id] = entry;
      changed = true;
    });
    (data.deleted || []).forEach(function (id) {
      var before = events.length;
      events = events.filter(function (entry) { return entry.id !== id; });
      if (events.length !== before) changed = true;
    });
    if (changed) saveEvents(events);
    (data.messages || []).forEach(function (message) {
      if (rememberChatMessage(message)) changed = true;
    });
    return changed;
  }

  function inputFocused() {
    var active = document.activeElement;
    return Boolean(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'));
  }

  function pollSync() {
    if (!canSync() || document.hidden) return;
    flushPushes();
    aiRequest('/api/sync?reader=' + encodeURIComponent(readerForSync()) + '&since=' + syncState.seq)
      .then(function (data) {
        // The store is in memory: a lower seq means the server restarted.
        if (data && typeof data.seq === 'number' && data.seq < syncState.seq) {
          // Its message ids restart too, so the old thread can't be kept.
          syncState.seq = 0;
          chatMessages = [];
          refreshChatThread();
          return;
        }
        var changed = mergeShared(data);
        if (data && typeof data.seq === 'number') syncState.seq = data.seq;
        if (!changed) return;
        if (!refreshChatThread() && !inputFocused()) refreshActiveView();
      }, function () {
        // Silent: file:// and offline keep working from local data.
      });
  }

  function startSync() {
    if (!canSync()) return;
    pollSync();
    if (syncState.timer) window.clearInterval(syncState.timer);
    syncState.timer = window.setInterval(pollSync, 4000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) pollSync();
    });
  }

  function handoverNote() {
    var get = function (key) {
      var field = app.aiLayer.querySelector('[data-handover-' + key + ']');
      return field ? field.value.trim() : '';
    };
    return 'Situación: ' + get('s') + '\nAntecedentes: ' + get('b') + '\nEvaluación: ' + get('a') + '\nRecomendación: ' + get('r');
  }

  function copyHandover() {
    var note = handoverNote();
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

  // The AI mark is Bloub, not a label: dots while it looks, the cloud once it answers.
  function aiMark(slot, label) {
    return '<span class="ai-mark" aria-hidden="true">' + videoSlot(slot, label) + '</span>';
  }

  function showAsk(box, text, source, model) {
    box.classList.remove('is-empty', 'is-thinking');
    var fromAi = source === 'ollama';
    box.innerHTML = (fromAi ? aiMark('ai-answer', 'Respuesta de IA') + '<span class="sr-only">Respuesta de IA: </span>' : '') +
      '<span class="ask-text">' + escapeHtml(text) + '</span>';
    box.classList.toggle('has-mark', fromAi);
    if (fromAi) bindVideos(box);
    var badge = app.screen.querySelector('[data-ask-badge]');
    if (badge) badge.hidden = fromAi;
    if (!fromAi) setBadge(badge, source, model);
  }

  function askViaServer(question, box) {
    box.classList.remove('is-empty');
    box.classList.add('is-thinking', 'has-mark');
    box.innerHTML = aiMark('ai-thinking', 'Buscando la respuesta') + '<span class="ask-text">Buscando en el turno…</span>';
    bindVideos(box);
    var badge = app.screen.querySelector('[data-ask-badge]');
    if (badge) badge.hidden = true;
    aiRequest('/api/ask', { question: question, facts: familyFacts() }).then(function (data) {
      showAsk(box, data.answer, data.source, data.model);
    }, function () {
      showAsk(box, askLocal(question).answer, 'rules', null);
    });
  }

  // Contacto > "Mensaje": open the family home and take the reader to the ask box.
  function openFamilyAsk() {
    state.detailPatient = null;
    state.activeNav.familia = HOME_NAV.familia;
    renderRoute('forward', true);
    window.setTimeout(function () {
      var input = app.screen.querySelector('[data-ask-input]');
      if (!input) return;
      if (input.scrollIntoView) input.scrollIntoView({ block: 'center' });
      if (input.focus) input.focus({ preventScroll: true });
    }, 360);
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
      wrap.innerHTML = views.sheets.consentBox('ask', data && data.payload);
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
    if (event.target.closest('[data-handover-chat]')) {
      sendHandoverToTeam();
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
  window.__acompana = { dayEvents: dayEvents, familyMessage: familyMessage };

  // ---- Split view renderers: shared helpers reachable from js/views/*.js ----
  var views = window.AcompanaViews;
  views.ctx = {
    escapeHtml: escapeHtml,
    icon: icon,
    videoSlot: videoSlot,
    getStaggerMs: getStaggerMs,
    timeline: timeline,
    loadEvents: loadEvents,
    isConfirmed: isConfirmed,
    remainingTasks: remainingTasks,
    getPendingTab: function () { return state.pendingTab; },
    patientById: patientById,
    PATIENTS: PATIENTS,
    TASKS: TASKS,
    TIMELINE_PACIENTE: TIMELINE_PACIENTE,
    FAMILY_PATIENT_ID: FAMILY_PATIENT_ID,
    SHIFT_PHONE: SHIFT_PHONE,
    EVENT_KIND_PHRASES: EVENT_KIND_PHRASES,
    EVENT_KIND_PHRASES_FAMILIA: EVENT_KIND_PHRASES_FAMILIA,
    getChatMessages: function (channel) {
      return chatMessages.filter(function (message) { return message.channel === channel; });
    },
    getChatChannel: function () { return state.chatChannel; },
    getRole: function () { return state.role; },
    chatOffline: function () { return !canSync(); }
  };
  views.ctx.sheets = views.sheets;

  function init() {
    if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    }
    ensureVideoObserver();
    app.screen.addEventListener('click', handleScreenClick);
    app.bottomNav.addEventListener('click', handleNavClick);
    if (app.fab) app.fab.addEventListener('click', function () { openRegistrationSheet(); });
    if (app.snackbar) app.snackbar.addEventListener('click', function (event) {
      if (event.target.closest('[data-undo-event]')) undoEvent();
    });
    app.registrationLayer.addEventListener('click', handleRegistrationClick);
    app.aiLayer.addEventListener('click', handleAiClick);
    app.roleTabs.forEach(function (tab) { tab.addEventListener('click', handleRoleClick); });
    document.addEventListener('click', function (event) {
      if (!event.target.closest('.demo-menu') && !event.target.closest('[data-demo-menu]')) closeDemoMenu();
    });
    window.addEventListener('popstate', function () {
      if (suppressPop > 0) {
        suppressPop -= 1;
        return;
      }
      var layer = topLayer();
      if (!layer) return;
      layerOrder.pop();
      delete layerOpen[layer];
      delete layerPushed[layer];
      if (layer === 'detail') closePatientDetail(true);
      else if (layer === 'register') closeRegistrationSheet(undefined, true);
      else if (layer === 'ai') closeAiSheet(true);
      else if (layer === 'menu') closeDemoMenu(true);
    });
    app.celebrationLayer.addEventListener('click', function (event) {
      if (event.target.closest('[data-close-celebration]')) hideCompletion();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && event.target && event.target.matches && event.target.matches('[data-ask-input]')) {
        event.preventDefault();
        sendAsk();
        return;
      }
      if (event.key === 'Enter' && event.target && event.target.matches && event.target.matches('[data-chat-input]')) {
        event.preventDefault();
        var chatButton = app.screen.querySelector('[data-chat-send]');
        if (chatButton) sendChat(chatButton.getAttribute('data-chat-channel-send'));
        return;
      }
      if (event.key !== 'Escape') return;
      if (document.querySelector('.demo-menu.is-open')) closeDemoMenu();
      else if (app.aiLayer.classList.contains('is-open')) closeAiSheet();
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
    startSync();
    // Links shared with the family open straight in their view.
    var ver = new URLSearchParams(location.search).get('ver');
    if (ver && ROLE_INDEX[ver] !== undefined && ver !== state.role) updateRole(ver);
    window.setTimeout(animatePendingCount, 400);
  }

  init();
}());
