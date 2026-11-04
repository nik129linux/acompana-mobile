(function () {
  'use strict';

  var V = window.AcompanaViews = window.AcompanaViews || {};
  var t = window.AcompanaI18n.t;
  var room = window.AcompanaI18n.room;
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
      return '<span class="badge badge-critical">' + escapeHtml(t(patient.statusLabel)) + '</span>';
    }
    if (taskForPatient(patient.id)) {
      return '<span class="badge badge-pending">' + escapeHtml(t(patient.statusLabel)) + '</span>';
    }
    return '<span class="badge badge-ready">' + escapeHtml(t('Listo')) + '</span>';
  }

  var KIND_ICON = { medication: 'pill', position: 'move', round: 'ruler', other: 'note' };
  var KIND_LABEL = { medication: 'Medicación', position: 'Cambio de posición', round: 'Ronda', other: 'Otro evento' };

  function pendingTab() {
    return ctx().getPendingTab ? ctx().getPendingTab() : 'pending';
  }

  function patientCard(patient) {
    var task = taskForPatient(patient.id);
    var side = task
      ? '<button type="button" class="quick-confirm tap-confirm" data-confirm="' + escapeHtml(task.id) + '" aria-label="' + escapeHtml(t('Confirmar {task} en un toque', { task: t(task.title) })) + '">' + icon('check') + '<span>' + escapeHtml(t('Listo')) + '</span></button>'
      : patientBadge(patient);
    var meta = '<span>' + icon('bed') + escapeHtml(room(patient.room)) + '</span>' +
      (task ? '<span>' + icon('clock') + escapeHtml(task.time) + ' · ' + escapeHtml(t(task.title)) + '</span>' : '');
    return '<article class="patient-card list-card" data-patient-card="' + escapeHtml(patient.id) + '">' +
      '<button type="button" class="patient-card-main" data-patient="' + escapeHtml(patient.id) + '" aria-label="' + escapeHtml(t('Abrir detalle de {name}', { name: patient.name })) + '">' +
      '<span class="media-square patient-avatar">' + escapeHtml(patient.initials) + '</span>' +
      '<span class="list-copy patient-info"><span class="list-title patient-name">' + escapeHtml(patient.name) + '</span><span class="list-meta patient-meta">' + meta + '</span></span>' +
      '</button><div class="patient-side">' + side + '</div></article>';
  }

  // The critical patient is the one gradient hero on the home screen. No
  // clinical values here: the patient in the bed can see this screen.
  function urgentCard(patient) {
    return '<div class="hero-stack is-critical"><article class="hero-card urgent-card patient-card" data-patient-card="' + escapeHtml(patient.id) + '">' +
      '<div class="hero-row"><span class="hero-media" aria-hidden="true">' + icon('pulse') + '</span>' +
      '<div class="hero-copy"><p class="hero-title urgent-name">' + escapeHtml(patient.name) + '</p><span class="hero-sub urgent-meta"><span class="pulse-dot" aria-hidden="true"></span> ' + escapeHtml(room(patient.room)) + ' · ' + escapeHtml(t('alerta de signos vitales')) + '</span></div></div>' +
      '<button type="button" class="glass-pill urgent-action" data-patient="' + escapeHtml(patient.id) + '" aria-label="' + escapeHtml(t('Revisar ahora a {name}', { name: patient.name })) + '">' + icon('alert') + escapeHtml(t('Revisar ahora · protocolo abierto')) + '</button>' +
      '</article></div>';
  }

  function renderNurseHome() {
    var pending = remainingTasks().length;
    var critical = ctx().PATIENTS.filter(function (p) { return p.status === 'critical'; });
    var stable = ctx().PATIENTS.filter(function (p) { return p.status !== 'critical'; });
    return '<header class="greet-bar" data-greet><span class="avatar" aria-hidden="true"><img src="media/frames/doctora-white.png" alt=""></span>' +
      '<div class="greet-copy"><h1 class="greet-title view-title">' + escapeHtml(t('Hola, Elena')) + '</h1><span class="greet-meta view-copy">' + icon('location') + escapeHtml(t('Piso 3 · Hospital Central')) + '</span></div></header>' +
      '<div class="chip-row shift-line" aria-label="' + escapeHtml(t('Resumen del turno')) + '">' +
      '<span class="chip"><span class="chip-icon">' + icon('user') + '</span><strong>' + ctx().PATIENTS.length + '</strong>&nbsp;' + escapeHtml(t('pacientes')) + '</span>' +
      '<span class="chip"><span class="chip-icon">' + icon('task') + '</span><strong>' + pending + '</strong>&nbsp;' + escapeHtml(t('pendientes')) + '</span>' +
      '<span class="chip"><span class="chip-icon">' + icon('clock') + '</span>' + escapeHtml(t('Ronda')) + '&nbsp;<strong>' + escapeHtml(t('1:00 p. m.')) + '</strong></span></div>' +
      (critical.length ? '<section class="urgent-section" aria-label="' + escapeHtml(t('Requiere atención')) + '"><div class="section-head"><h2>' + escapeHtml(t('Requiere atención')) + '</h2></div>' + critical.map(urgentCard).join('') + '</section>' : '') +
      '<div class="section-head"><h2 class="section-label">' + escapeHtml(t('Tus pacientes')) + '</h2><span class="section-link">' + escapeHtml(t('{count} estables', { count: stable.length })) + '</span></div>' +
      '<div class="patient-list">' + stable.map(patientCard).join('') + '</div>' +
      '<div class="section-head"><h2>' + escapeHtml(t('Entrega de turno')) + '</h2></div>' +
      '<div class="ai-card list-card sbar-card"><span class="media-square" aria-hidden="true">' + icon('note') + '</span>' +
      '<span class="list-copy"><strong class="list-title">' + escapeHtml(t('Nota de entrega (SBAR)')) + '</strong><span class="list-meta">' + escapeHtml(t('Borrador del turno que puedes editar antes de copiar.')) + '</span>' +
      '<span class="ai-source" data-handover-home-badge aria-label="' + escapeHtml(t('Plantilla')) + '">' + '<span class="ai-mark" aria-hidden="true">' + ctx().videoSlot('ai-static', 'Bloub') + '</span>' + '</span></span>' +
      '<div class="ai-actions"><button type="button" class="btn btn-tonal sbar-open" data-handover-open>' + escapeHtml(t('Preparar entrega')) + '</button></div></div>';
  }

  function taskPlace(task) {
    var patient = ctx().patientById(task.patientId);
    return patient ? patient.name + ' · ' + room(patient.room) : task.note;
  }

  function taskCard(task) {
    return '<article class="task-card list-card" data-task-card="' + escapeHtml(task.id) + '">' +
      '<span class="media-square task-media" aria-hidden="true">' + icon(task.icon) + '</span>' +
      '<span class="task-copy list-copy"><span class="list-title task-title">' + escapeHtml(t(task.title)) + '</span>' +
      '<span class="list-meta task-meta"><span class="task-time">' + icon('clock') + escapeHtml(task.time) + '</span><span class="task-patient">' + escapeHtml(taskPlace(task)) + '</span></span></span>' +
      '<button type="button" class="task-action tap-confirm" data-confirm="' + escapeHtml(task.id) + '" aria-label="' + escapeHtml(t('Confirmar {task}', { task: t(task.title) })) + '"><svg class="confirm-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M6.67 17.68 10.11 21.28C11 22.2 11.45 22.67 12 22.67S13 22.2 13.89 21.28L25.33 9.33"></path></svg><span class="confirm-label">' + escapeHtml(t('Listo')) + '</span></button>' +
      '</article>';
  }

  function doneTaskCard(task) {
    return '<article class="task-card list-card is-done" data-done-task="' + escapeHtml(task.id) + '">' +
      '<span class="media-square task-media" aria-hidden="true">' + icon(task.icon) + '</span>' +
      '<span class="task-copy list-copy"><span class="list-title task-title">' + escapeHtml(t(task.title)) + '</span>' +
      '<span class="list-meta task-meta"><span class="task-time">' + icon('clock') + escapeHtml(task.time) + '</span><span class="task-patient">' + escapeHtml(taskPlace(task)) + '</span></span></span>' +
      '<span class="status-pill is-done">' + icon('check') + escapeHtml(t('Hecho')) + '</span></article>';
  }

  function doneEventCard(entry) {
    var patient = ctx().patientById(entry.patientId);
    return '<article class="task-card list-card is-done" data-done-event="' + escapeHtml(entry.id) + '">' +
      '<span class="media-square task-media" aria-hidden="true">' + icon(KIND_ICON[entry.kind] || 'note') + '</span>' +
      '<span class="task-copy list-copy"><span class="list-title task-title">' + escapeHtml(entry.text ? t(entry.text) : t(KIND_LABEL[entry.kind] || 'Evento')) + '</span>' +
      '<span class="list-meta task-meta"><span class="task-time">' + icon('clock') + escapeHtml(entry.time) + '</span>' + (patient ? '<span class="task-patient">' + escapeHtml(patient.name + ' · ' + room(patient.room)) + '</span>' : '') + '</span></span>' +
      '<span class="status-pill is-done">' + escapeHtml(t('Registrado')) + '</span></article>';
  }

  function doneList() {
    var completed = ctx().TASKS.filter(function (task) { return isConfirmed(task.id); });
    var events = loadEvents();
    if (!completed.length && !events.length) return '<p class="done-empty">' + escapeHtml(t('Aún no hay nada hecho')) + '</p>';
    return '<div class="pending-list done-list">' + completed.map(doneTaskCard).join('') + events.map(doneEventCard).join('') + '</div>';
  }

  function segment(tab, label) {
    var active = pendingTab() === tab;
    return '<button type="button" class="segment' + (active ? ' is-active' : '') + '" role="tab" aria-selected="' + String(active) + '" data-pending-tab="' + tab + '">' + escapeHtml(t(label)) + '</button>';
  }

  function summaryRow(task) {
    return '<li class="summary-row"><span class="summary-icon" aria-hidden="true">' + icon('check') + '</span>' +
      '<span class="summary-copy"><strong>' + escapeHtml(t(task.title)) + '</strong><span>' + escapeHtml(task.time) + ' · ' + escapeHtml(taskPlace(task)) + '</span></span></li>';
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
      '<h2>' + escapeHtml(t('Todo al día')) + '</h2><p>' + escapeHtml(t('No queda nada pendiente. Puedes respirar un momento.')) + '</p>' +
      '<ul class="summary-card summary-rows">' + completed.map(summaryRow).join('') + '</ul>' +
      '<button type="button" class="empty-state-link" data-go-home>' + escapeHtml(t('Volver al turno')) + ' ' + icon('chevron') + '</button>' +
      videoSlot('empty', t('Doctora flotando tranquila')) +
      '</div>';
  }

  function renderPending() {
    var pending = remainingTasks();
    if (!pending.length) return renderEmptyPending();
    var done = pendingTab() === 'done';
    return '<div class="view-header"><div class="view-header-copy"><h1 class="view-title small-title screen-title">' + escapeHtml(t('Pendientes')) + '</h1></div></div>' +
      '<div class="segmented" role="tablist" aria-label="' + escapeHtml(t('Pendientes y hechas')) + '">' + segment('pending', 'Pendientes') + segment('done', 'Hechas') + '</div>' +
      (done
        ? '<div class="section-head pending-head"><h2>' + escapeHtml(t('Hechas')) + '</h2><span class="status-pill is-done">' + escapeHtml(t('{count} registros', { count: ctx().TASKS.filter(function (task) { return isConfirmed(task.id); }).length + loadEvents().length })) + '</span></div>' + doneList()
        : '<div class="section-head pending-head"><h2>' + escapeHtml(t('Lo que falta')) + '</h2><span class="status-pill" data-pending-count><strong>' + pending.length + '</strong>&nbsp;' + escapeHtml(t('pendientes')) + '</span></div>' +
          '<div class="section-heading"><h2 class="section-label">' + escapeHtml(t('En este momento')) + '</h2><span class="section-meta">' + escapeHtml(t('Orden por hora')) + '</span></div>' +
          '<div class="pending-list">' + pending.map(taskCard).join('') + '</div>' +
          '<div class="ai-card"><strong>' + escapeHtml(t('Preguntas de la familia')) + '</strong><span>' + escapeHtml(t('Si una familia dejó una duda desde su vista, aparece aquí.')) + '</span><div class="ai-actions"><button type="button" class="secondary-button" data-questions-load>' + escapeHtml(t('Revisar preguntas')) + '</button></div><div data-nurse-questions></div></div>');
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
      return { time: task.time, title: t(task.title), note: '', status: t(done ? 'Hecho' : 'Pendiente'), done: done };
    }).concat(patientEvents.map(function (entry) {
      return { time: entry.time, title: t(kindLabels[entry.kind] || 'Evento'), note: entry.text ? t(entry.text) : '', status: t('Registrado'), done: true };
    })).sort(function (x, y) { return x.time < y.time ? -1 : x.time > y.time ? 1 : 0; });
    var alert = patient.status === 'critical'
      ? '<div class="detail-alert detail-status" role="status"><span class="urgent-icon" aria-hidden="true">' + icon('alert') + '</span><span>' + escapeHtml(t('Alerta de signos vitales · protocolo abierto')) + '</span></div>'
      : '';
    return '<div class="detail-view"><div class="view-header"><button type="button" class="icon-button back-button back-btn" data-back="enfermero" aria-label="' + escapeHtml(t('Volver al turno')) + '"><span class="arrow-icon">' + icon('arrow') + '</span></button><div class="view-header-copy"><h1 class="view-title small-title detail-name">' + escapeHtml(patient.name) + '</h1></div></div>' +
      '<section class="detail-hero" aria-labelledby="detail-hero-name"><span class="media-square detail-avatar" aria-hidden="true">' + escapeHtml(patient.initials) + '</span>' +
      '<div class="detail-hero-copy"><p id="detail-hero-name" class="detail-hero-name">' + escapeHtml(room(patient.room)) + '</p><span class="detail-room">' + escapeHtml(t(patient.status === 'critical' ? 'Alerta abierta · revisar signos' : 'En seguimiento · sin alertas')) + '</span></div></section>' + alert +
      '<div class="stat-tiles detail-stats"><article class="stat-tile"><span>' + escapeHtml(t('Pendientes')) + '</span><strong>' + pendingCount + '</strong></article><article class="stat-tile is-warm"><span>' + escapeHtml(t('Hechos hoy')) + '</span><strong>' + doneCount + '</strong></article></div>' +
      '<section class="detail-block clinical-block" aria-labelledby="clinical-title"><div class="clinical-head"><h2 id="clinical-title" class="detail-section-title">' + escapeHtml(t('Valor clínico')) + '</h2>' +
      '<button type="button" class="reveal-button" data-reveal aria-expanded="false">' + escapeHtml(t('Mostrar dato clínico')) + ' ' + icon('eye') + '</button></div>' +
      '<div class="clinical-panel"><button type="button" class="clinical-value" data-reveal aria-label="' + escapeHtml(t('Mostrar el valor clínico')) + '" aria-expanded="false">' +
        (patient.vitals || []).map(function (v) {
          return '<span class="vital-tile' + (v.alert ? ' is-alert' : '') + (v.wide ? ' is-wide' : '') + '">' +
            '<span class="vital-label">' + (v.alert ? '<span class="pulse-dot" aria-hidden="true"></span>' : '') + escapeHtml(t(v.label)) + '</span>' +
            '<span class="vital-value">' + escapeHtml(t(v.value)) + (v.unit ? ' <small>' + escapeHtml(t(v.unit)) + '</small>' : '') + '</span></span>';
        }).join('') + '</button></div>' +
      '<p class="clinical-why">' + icon('shield') + '<span>' + escapeHtml(t('Oculto porque esta pantalla también se ve desde la cama. La familia recibe solo un resumen del turno, sin valores clínicos.')) + '</span></p></section>' +
      '<section class="detail-block" aria-labelledby="shift-title"><h2 id="shift-title" class="detail-section-title">' + escapeHtml(t('Turno')) + '</h2><ol class="shift-list">' +
      rows.map(function (r) {
        return '<li class="shift-row' + (r.done ? ' is-done' : '') + '"><span class="shift-time">' + escapeHtml(r.time) + '</span>' +
          '<span class="shift-copy"><strong>' + escapeHtml(r.title) + '</strong>' + (r.note ? '<span>' + escapeHtml(r.note) + '</span>' : '') + '</span>' +
          '<span class="shift-status">' + escapeHtml(r.status) + '</span></li>';
      }).join('') + '</ol></section>' +
      '<button type="button" class="btn btn-secondary family-share" data-share-family>' + icon('message') + escapeHtml(t('Avisar a la familia')) + '</button>' +
      '<div class="detail-cta"><button type="button" class="btn btn-primary" data-open-register>' + escapeHtml(t('Registrar evento')) + '</button></div></div>';
  }

  V.nurse = {
    renderNurseHome: renderNurseHome,
    renderPending: renderPending,
    renderNurseDetail: renderNurseDetail
  };
}());
