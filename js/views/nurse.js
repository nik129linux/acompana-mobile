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

  function patientCard(patient) {
    var task = taskForPatient(patient.id);
    var side = task
      ? '<button type="button" class="quick-confirm tap-confirm" data-confirm="' + escapeHtml(task.id) + '" aria-label="Confirmar ' + escapeHtml(task.title) + ' en un toque">Listo</button>'
      : patientBadge(patient);
    var next = task ? escapeHtml(task.time) + ' · ' + escapeHtml(task.title) : escapeHtml(patient.room);
    return '<article class="patient-card" data-patient-card="' + escapeHtml(patient.id) + '">' +
      '<button type="button" class="patient-card-main" data-patient="' + escapeHtml(patient.id) + '" aria-label="Abrir detalle de ' + escapeHtml(patient.name) + '">' +
      '<span class="patient-avatar">' + escapeHtml(patient.initials) + '</span>' +
      '<span class="patient-info"><span class="patient-name">' + escapeHtml(patient.name) + '</span><span class="patient-meta">' + escapeHtml(patient.room) + (task ? ' · ' + next : '') + '</span></span>' +
      '</button><div class="patient-side">' + side + '</div></article>';
  }

  // The critical patient is the one peak on the home screen. No clinical
  // values here: the patient in the bed can see this screen.
  function urgentCard(patient) {
    return '<article class="urgent-card patient-card" data-patient-card="' + escapeHtml(patient.id) + '">' +
      '<div class="urgent-head"><span class="urgent-icon" aria-hidden="true">' + icon('alert') + '</span><span class="urgent-kicker">Alerta de signos vitales</span></div>' +
      '<p class="urgent-name">' + escapeHtml(patient.name) + '</p>' +
      '<p class="urgent-meta">' + escapeHtml(patient.room) + ' · protocolo abierto, sin confirmar</p>' +
      '<button type="button" class="urgent-action" data-patient="' + escapeHtml(patient.id) + '" aria-label="Revisar ahora a ' + escapeHtml(patient.name) + '">Revisar ahora' + icon('arrow') + '</button>' +
      '</article>';
  }

  function renderNurseHome() {
    var pending = remainingTasks().length;
    var critical = ctx().PATIENTS.filter(function (p) { return p.status === 'critical'; });
    var stable = ctx().PATIENTS.filter(function (p) { return p.status !== 'critical'; });
    return '<div class="home-intro"><h1 class="view-title">Mi turno</h1><p class="view-copy">Buenos días, Elena · Piso 3, Hospital Central</p>' +
      '<p class="shift-line" aria-label="Resumen del turno"><span><strong>' + ctx().PATIENTS.length + '</strong> pacientes</span><span><strong>' + pending + '</strong> pendientes</span><span>ronda <strong>1:00 p. m.</strong></span></p></div>' +
      (critical.length ? '<section class="urgent-section" aria-label="Requiere atención">' + critical.map(urgentCard).join('') + '</section>' : '') +
      '<div class="section-heading"><h2 class="section-label">Tus pacientes</h2><span class="section-meta">' + stable.length + ' estables</span></div>' +
      '<div class="patient-list">' + stable.map(patientCard).join('') + '</div>' +
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

  function renderNurseDetail(patient) {
    var kindLabels = { medication: 'Medicación', position: 'Cambio de posición', round: 'Ronda', other: 'Otro evento' };
    // One chronological shift list: planned tasks and what the nurse logged.
    var rows = ctx().TASKS.filter(function (task) { return task.patientId === patient.id; }).map(function (task) {
      var done = isConfirmed(task.id);
      return { time: task.time, title: task.title, note: '', status: done ? 'Hecho' : 'Pendiente', done: done };
    }).concat(loadEvents().filter(function (e) { return e.patientId === patient.id; }).map(function (e) {
      return { time: e.time, title: kindLabels[e.kind] || 'Evento', note: e.text, status: 'Registrado', done: true };
    })).sort(function (x, y) { return x.time < y.time ? -1 : x.time > y.time ? 1 : 0; });
    var alert = patient.status === 'critical'
      ? '<div class="detail-alert detail-status" role="status"><span class="urgent-icon" aria-hidden="true">' + icon('alert') + '</span><span>Alerta de signos vitales · protocolo abierto</span></div>'
      : '';
    return '<div class="detail-view"><div class="view-header"><button type="button" class="icon-button back-button back-btn" data-back="enfermero" aria-label="Volver al turno"><span class="arrow-icon">' + icon('arrow') + '</span></button><div class="view-header-copy"><h1 class="view-title small-title detail-name">' + escapeHtml(patient.name) + '</h1></div></div>' +
      '<p class="detail-room">' + escapeHtml(patient.room) + '</p>' + alert +
      '<section class="detail-block clinical-block" aria-labelledby="clinical-title"><h2 id="clinical-title" class="detail-section-title">Valor clínico</h2>' +
      '<div class="clinical-panel"><button type="button" class="clinical-value" data-reveal aria-label="Mostrar el valor clínico" aria-expanded="false">' + escapeHtml(patient.clinical) + '</button>' +
      '<button type="button" class="reveal-button" data-reveal aria-expanded="false">Mostrar dato clínico ' + icon('eye') + '</button></div>' +
      '<p class="clinical-why">' + icon('shield') + '<span>Oculto porque esta pantalla también se ve desde la cama. La familia recibe solo un resumen del turno, sin valores clínicos.</span></p></section>' +
      '<section class="detail-block" aria-labelledby="shift-title"><h2 id="shift-title" class="detail-section-title">Turno</h2><ol class="shift-list">' +
      rows.map(function (r) {
        return '<li class="shift-row' + (r.done ? ' is-done' : '') + '"><span class="shift-time">' + escapeHtml(r.time) + '</span>' +
          '<span class="shift-copy"><strong>' + escapeHtml(r.title) + '</strong>' + (r.note ? '<span>' + escapeHtml(r.note) + '</span>' : '') + '</span>' +
          '<span class="shift-status">' + escapeHtml(r.status) + '</span></li>';
      }).join('') + '</ol></section></div>';
  }

  V.nurse = {
    renderNurseHome: renderNurseHome,
    renderPending: renderPending,
    renderNurseDetail: renderNurseDetail
  };
}());
