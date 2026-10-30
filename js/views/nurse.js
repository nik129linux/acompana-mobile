(function () {
  'use strict';

  var V = window.AcompanaViews = window.AcompanaViews || {};
  function ctx() { return V.ctx; }
  function escapeHtml(value) { return ctx().escapeHtml(value); }
  function icon(name) { return ctx().icon(name); }
  function videoSlot(slot, label) { return ctx().videoSlot(slot, label); }
  function getStaggerMs() { return ctx().getStaggerMs(); }
  function isConfirmed(taskId) { return ctx().isConfirmed(taskId); }
  function loadEvents() { return ctx().loadEvents(); }
  function remainingTasks() { return ctx().remainingTasks(); }

  function taskForPatient(patientId) {
    return ctx().TASKS.find(function (task) { return task.patientId === patientId && !isConfirmed(task.id); });
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

  var KIND_ICON = { medication: 'pill', position: 'move', round: 'ruler', other: 'note' };
  var KIND_LABEL = { medication: 'Medicación', position: 'Cambio de posición', round: 'Ronda', other: 'Otro evento' };

  function pendingTab() {
    return ctx().getPendingTab ? ctx().getPendingTab() : 'pending';
  }

  function patientCard(patient) {
    var task = taskForPatient(patient.id);
    var side = task
      ? '<button type="button" class="quick-confirm tap-confirm" data-confirm="' + escapeHtml(task.id) + '" aria-label="Confirmar ' + escapeHtml(task.title) + ' en un toque">' + icon('check') + '<span>Listo</span></button>'
      : patientBadge(patient);
    var meta = '<span>' + icon('bed') + escapeHtml(patient.room) + '</span>' +
      (task ? '<span>' + icon('clock') + escapeHtml(task.time) + ' · ' + escapeHtml(task.title) + '</span>' : '');
    return '<article class="patient-card list-card" data-patient-card="' + escapeHtml(patient.id) + '">' +
      '<button type="button" class="patient-card-main" data-patient="' + escapeHtml(patient.id) + '" aria-label="Abrir detalle de ' + escapeHtml(patient.name) + '">' +
      '<span class="media-square patient-avatar">' + escapeHtml(patient.initials) + '</span>' +
      '<span class="list-copy patient-info"><span class="list-title patient-name">' + escapeHtml(patient.name) + '</span><span class="list-meta patient-meta">' + meta + '</span></span>' +
      '</button><div class="patient-side">' + side + '</div></article>';
  }

  // The critical patient is the one gradient hero on the home screen. No
  // clinical values here: the patient in the bed can see this screen.
  function urgentCard(patient) {
    return '<div class="hero-stack is-critical"><article class="hero-card urgent-card patient-card" data-patient-card="' + escapeHtml(patient.id) + '">' +
      '<div class="hero-row"><span class="hero-media" aria-hidden="true">' + icon('pulse') + '</span>' +
      '<div class="hero-copy"><p class="hero-title urgent-name">' + escapeHtml(patient.name) + '</p><span class="hero-sub urgent-meta"><span class="pulse-dot" aria-hidden="true"></span> ' + escapeHtml(patient.room) + ' · alerta de signos vitales</span></div></div>' +
      '<button type="button" class="glass-pill urgent-action" data-patient="' + escapeHtml(patient.id) + '" aria-label="Revisar ahora a ' + escapeHtml(patient.name) + '">' + icon('alert') + 'Revisar ahora · protocolo abierto</button>' +
      '</article></div>';
  }

  function renderNurseHome() {
    var pending = remainingTasks().length;
    var critical = ctx().PATIENTS.filter(function (p) { return p.status === 'critical'; });
    var stable = ctx().PATIENTS.filter(function (p) { return p.status !== 'critical'; });
    return '<header class="greet-bar" data-greet><span class="avatar" aria-hidden="true"><img src="media/frames/doctora-white.png" alt=""></span>' +
      '<div class="greet-copy"><h1 class="greet-title view-title">Hola, Elena</h1><span class="greet-meta view-copy">' + icon('location') + 'Piso 3 · Hospital Central</span></div></header>' +
      '<div class="chip-row shift-line" aria-label="Resumen del turno">' +
      '<span class="chip"><span class="chip-icon">' + icon('user') + '</span><strong>' + ctx().PATIENTS.length + '</strong>&nbsp;pacientes</span>' +
      '<span class="chip"><span class="chip-icon">' + icon('task') + '</span><strong>' + pending + '</strong>&nbsp;pendientes</span>' +
      '<span class="chip"><span class="chip-icon">' + icon('clock') + '</span>Ronda&nbsp;<strong>1:00 p. m.</strong></span></div>' +
      (critical.length ? '<section class="urgent-section" aria-label="Requiere atención"><div class="section-head"><h2>Requiere atención</h2></div>' + critical.map(urgentCard).join('') + '</section>' : '') +
      '<div class="section-head"><h2 class="section-label">Tus pacientes</h2><span class="section-link">' + stable.length + ' estables</span></div>' +
      '<div class="patient-list">' + stable.map(patientCard).join('') + '</div>' +
      '<div class="section-head"><h2>Entrega de turno</h2></div>' +
      '<div class="ai-card list-card sbar-card"><span class="media-square" aria-hidden="true">' + icon('note') + '</span>' +
      '<span class="list-copy"><strong class="list-title">Nota de entrega (SBAR)</strong><span class="list-meta">Borrador del turno que puedes editar antes de copiar.</span>' +
      '<span class="source-badge" data-handover-home-badge>Plantilla</span></span>' +
      '<div class="ai-actions"><button type="button" class="btn btn-tonal sbar-open" data-handover-open>Preparar</button></div></div>';
  }

  function taskPlace(task) {
    var patient = ctx().patientById(task.patientId);
    return patient ? patient.name + ' · ' + patient.room : task.note;
  }

  function taskCard(task) {
    return '<article class="task-card list-card" data-task-card="' + escapeHtml(task.id) + '">' +
      '<span class="media-square task-media" aria-hidden="true">' + icon(task.icon) + '</span>' +
      '<span class="task-copy list-copy"><span class="list-title task-title">' + escapeHtml(task.title) + '</span>' +
      '<span class="list-meta task-meta"><span class="task-time">' + icon('clock') + escapeHtml(task.time) + '</span><span class="task-patient">' + escapeHtml(taskPlace(task)) + '</span></span></span>' +
      '<button type="button" class="task-action tap-confirm" data-confirm="' + escapeHtml(task.id) + '" aria-label="Confirmar ' + escapeHtml(task.title) + '"><svg class="confirm-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="m7 16 6 6L25 9"></path></svg><span class="confirm-label">Listo</span></button>' +
      '</article>';
  }

  function doneTaskCard(task) {
    return '<article class="task-card list-card is-done" data-done-task="' + escapeHtml(task.id) + '">' +
      '<span class="media-square task-media" aria-hidden="true">' + icon(task.icon) + '</span>' +
      '<span class="task-copy list-copy"><span class="list-title task-title">' + escapeHtml(task.title) + '</span>' +
      '<span class="list-meta task-meta"><span class="task-time">' + icon('clock') + escapeHtml(task.time) + '</span><span class="task-patient">' + escapeHtml(taskPlace(task)) + '</span></span></span>' +
      '<span class="status-pill is-done">' + icon('check') + 'Hecho</span></article>';
  }

  function doneEventCard(entry) {
    var patient = ctx().patientById(entry.patientId);
    return '<article class="task-card list-card is-done" data-done-event="' + escapeHtml(entry.id) + '">' +
      '<span class="media-square task-media" aria-hidden="true">' + icon(KIND_ICON[entry.kind] || 'note') + '</span>' +
      '<span class="task-copy list-copy"><span class="list-title task-title">' + escapeHtml(entry.text || KIND_LABEL[entry.kind] || 'Evento') + '</span>' +
      '<span class="list-meta task-meta"><span class="task-time">' + icon('clock') + escapeHtml(entry.time) + '</span>' + (patient ? '<span class="task-patient">' + escapeHtml(patient.name + ' · ' + patient.room) + '</span>' : '') + '</span></span>' +
      '<span class="status-pill is-done">Registrado</span></article>';
  }

  function doneList() {
    var completed = ctx().TASKS.filter(function (task) { return isConfirmed(task.id); });
    var events = loadEvents();
    if (!completed.length && !events.length) return '<p class="done-empty">Aún no hay nada hecho</p>';
    return '<div class="pending-list done-list">' + completed.map(doneTaskCard).join('') + events.map(doneEventCard).join('') + '</div>';
  }

  function segment(tab, label) {
    var active = pendingTab() === tab;
    return '<button type="button" class="segment' + (active ? ' is-active' : '') + '" role="tab" aria-selected="' + String(active) + '" data-pending-tab="' + tab + '">' + label + '</button>';
  }

  function summaryRow(task) {
    return '<li class="summary-row"><span class="summary-icon" aria-hidden="true">' + icon('check') + '</span>' +
      '<span class="summary-copy"><strong>' + escapeHtml(task.title) + '</strong><span>' + escapeHtml(task.time) + ' · ' + escapeHtml(taskPlace(task)) + '</span></span></li>';
  }

  function renderEmptyPending() {
    var pieces = '';
    var stagger = getStaggerMs();
    for (var index = 1; index <= 12; index += 1) {
      pieces += '<span class="confetti-piece" style="--confetti-delay:' + (index * stagger) + 'ms"></span>';
    }
    var completed = ctx().TASKS.filter(function (task) { return isConfirmed(task.id); });
    return '<div class="empty-state" data-empty-state>' +
      '<div class="confetti-layer" aria-hidden="true">' + pieces + '</div>' +
      '<span class="success-check" data-success-check aria-hidden="true">' + icon('check') + '</span>' +
      '<h2>Todo al día</h2><p>No queda nada pendiente. Puedes respirar un momento.</p>' +
      '<ul class="summary-card summary-rows">' + completed.map(summaryRow).join('') + '</ul>' +
      '<button type="button" class="empty-state-link" data-go-home>Volver al turno ' + icon('chevron') + '</button>' +
      videoSlot('empty', 'Doctora flotando tranquila') +
      '</div>';
  }

  function renderPending() {
    var pending = remainingTasks();
    if (!pending.length) return renderEmptyPending();
    var done = pendingTab() === 'done';
    return '<div class="view-header"><div class="view-header-copy"><h1 class="view-title small-title screen-title">Pendientes</h1></div></div>' +
      '<div class="segmented" role="tablist" aria-label="Pendientes y hechas">' + segment('pending', 'Pendientes') + segment('done', 'Hechas') + '</div>' +
      (done
        ? '<div class="section-head pending-head"><h2>Hechas</h2><span class="status-pill is-done">' + (ctx().TASKS.filter(function (task) { return isConfirmed(task.id); }).length + loadEvents().length) + ' registros</span></div>' + doneList()
        : '<div class="section-head pending-head"><h2>Lo que falta</h2><span class="status-pill" data-pending-count><strong>' + pending.length + '</strong>&nbsp;pendientes</span></div>' +
          '<div class="section-heading"><h2 class="section-label">En este momento</h2><span class="section-meta">Orden por hora</span></div>' +
          '<div class="pending-list">' + pending.map(taskCard).join('') + '</div>' +
          '<div class="ai-card"><strong>Preguntas de la familia</strong><span>Si una familia dejó una duda desde su vista, aparece aquí.</span><div class="ai-actions"><button type="button" class="secondary-button" data-questions-load>Revisar preguntas</button></div><div data-nurse-questions></div></div>');
  }

  function renderNurseDetail(patient) {
    var kindLabels = { medication: 'Medicación', position: 'Cambio de posición', round: 'Ronda', other: 'Otro evento' };
    // One chronological shift list: planned tasks and what the nurse logged.
    var patientTasks = ctx().TASKS.filter(function (task) { return task.patientId === patient.id; });
    var patientEvents = loadEvents().filter(function (entry) { return entry.patientId === patient.id; });
    var pendingCount = patientTasks.filter(function (task) { return !isConfirmed(task.id); }).length;
    var doneCount = patientTasks.filter(function (task) { return isConfirmed(task.id); }).length + patientEvents.length;
    var rows = patientTasks.map(function (task) {
      var done = isConfirmed(task.id);
      return { time: task.time, title: task.title, note: '', status: done ? 'Hecho' : 'Pendiente', done: done };
    }).concat(patientEvents.map(function (entry) {
      return { time: entry.time, title: kindLabels[entry.kind] || 'Evento', note: entry.text, status: 'Registrado', done: true };
    })).sort(function (x, y) { return x.time < y.time ? -1 : x.time > y.time ? 1 : 0; });
    var alert = patient.status === 'critical'
      ? '<div class="detail-alert detail-status" role="status"><span class="urgent-icon" aria-hidden="true">' + icon('alert') + '</span><span>Alerta de signos vitales · protocolo abierto</span></div>'
      : '';
    return '<div class="detail-view"><div class="view-header"><button type="button" class="icon-button back-button back-btn" data-back="enfermero" aria-label="Volver al turno"><span class="arrow-icon">' + icon('arrow') + '</span></button><div class="view-header-copy"><h1 class="view-title small-title detail-name">' + escapeHtml(patient.name) + '</h1></div></div>' +
      '<section class="detail-hero" aria-labelledby="detail-hero-name"><span class="media-square detail-avatar" aria-hidden="true">' + escapeHtml(patient.initials) + '</span>' +
      '<div class="detail-hero-copy"><p id="detail-hero-name" class="detail-hero-name">' + escapeHtml(patient.room) + '</p><span class="detail-room">' + (patient.status === 'critical' ? 'Alerta abierta · revisar signos' : 'En seguimiento · sin alertas') + '</span></div></section>' + alert +
      '<div class="stat-tiles detail-stats"><article class="stat-tile"><span>Pendientes</span><strong>' + pendingCount + '</strong></article><article class="stat-tile is-warm"><span>Hechos hoy</span><strong>' + doneCount + '</strong></article></div>' +
      '<section class="detail-block clinical-block" aria-labelledby="clinical-title"><h2 id="clinical-title" class="detail-section-title">Valor clínico</h2>' +
      '<div class="clinical-panel"><button type="button" class="clinical-value' + (patient.status === 'critical' ? ' is-critical-value' : '') + '" data-reveal aria-label="Mostrar el valor clínico" aria-expanded="false">' +
        patient.clinical.split(/\s*[·,]\s*/).map(function (part) { return '<span class="clinical-line">' + escapeHtml(part) + '</span>'; }).join('') + '</button>' +
      '<button type="button" class="reveal-button" data-reveal aria-expanded="false">Mostrar dato clínico ' + icon('eye') + '</button></div>' +
      '<p class="clinical-why">' + icon('shield') + '<span>Oculto porque esta pantalla también se ve desde la cama. La familia recibe solo un resumen del turno, sin valores clínicos.</span></p></section>' +
      '<section class="detail-block" aria-labelledby="shift-title"><h2 id="shift-title" class="detail-section-title">Turno</h2><ol class="shift-list">' +
      rows.map(function (r) {
        return '<li class="shift-row' + (r.done ? ' is-done' : '') + '"><span class="shift-time">' + escapeHtml(r.time) + '</span>' +
          '<span class="shift-copy"><strong>' + escapeHtml(r.title) + '</strong>' + (r.note ? '<span>' + escapeHtml(r.note) + '</span>' : '') + '</span>' +
          '<span class="shift-status">' + escapeHtml(r.status) + '</span></li>';
      }).join('') + '</ol></section>' +
      '<button type="button" class="btn btn-secondary family-share" data-share-family>' + icon('message') + 'Avisar a la familia</button>' +
      '<div class="detail-cta"><button type="button" class="btn btn-primary" data-open-register>Registrar evento</button></div></div>';
  }

  V.nurse = {
    renderNurseHome: renderNurseHome,
    renderPending: renderPending,
    renderNurseDetail: renderNurseDetail
  };
}());
