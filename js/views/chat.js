(function () {
  'use strict';

  var V = window.AcompanaViews = window.AcompanaViews || {};
  var t = window.AcompanaI18n.t;
  function ctx() { return V.ctx; }
  function escapeHtml(value) { return ctx().escapeHtml(value); }
  function icon(name) { return ctx().icon(name); }

  // The server stamps UTC; the reader wants their own clock.
  function clock(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }

  // Every own message says where it stands: sending, sent, or not sent.
  function statusHtml(status) {
    if (status === 'sending') return '<span class="chat-status is-sending" role="status">' + escapeHtml(t('Enviando…')) + '</span>';
    if (status === 'failed') return '<span class="chat-status is-failed" role="alert">' + escapeHtml(t('No se envió')) + '</span>';
    return '<span class="chat-status is-sent">' + icon('check') + escapeHtml(t('Enviado')) + '</span>';
  }

  // Own messages sit on the right; every line is escaped before it is markup.
  function messageHtml(message, ownAuthor) {
    var own = message.author && message.author === ownAuthor;
    return '<article class="chat-message' + (own ? ' is-own' : '') + '" data-chat-id="' + escapeHtml(message.id) + '">' +
      '<span class="chat-author">' + escapeHtml(message.author || '') + '</span>' +
      '<p class="chat-text">' + escapeHtml(message.text || '') + '</p>' +
      '<span class="chat-meta">' + (clock(message.time) ? '<span class="chat-time">' + escapeHtml(clock(message.time)) + '</span>' : '') +
      (own ? statusHtml(message.status) : '') + '</span>' +
      '</article>';
  }

  var EMPTY = {
    familia: {
      enfermero: ['Aún no hay mensajes con la familia', 'Los avisos que envíes desde el turno aparecen aquí.'],
      familia: ['Aún no hay mensajes', 'Escríbale al equipo cuando lo necesite.']
    },
    equipo: {
      enfermero: ['Aún no hay mensajes del equipo', 'Las notas de entrega que envíes aparecen aquí.']
    }
  };

  function threadBody(channel) {
    var role = ctx().getRole();
    var ownAuthor = role === 'familia' ? 'Familia' : 'Elena';
    var messages = ctx().getChatMessages(channel);
    if (messages.length) return messages.map(function (message) { return messageHtml(message, ownAuthor); }).join('');
    var empty = EMPTY[channel][role] || EMPTY.familia.familia;
    return '<div class="chat-empty"><span class="chat-empty-icon" aria-hidden="true">' + icon('message') + '</span>' +
      '<strong>' + escapeHtml(t(empty[0])) + '</strong><span>' + escapeHtml(t(empty[1])) + '</span></div>';
  }

  function threadHtml(channel) {
    var offline = ctx().chatOffline();
    var note = offline
      ? '<p class="chat-offline" role="status">' + escapeHtml(t('Sin conexión. Los mensajes se verán cuando vuelva la red.')) + '</p>'
      : '';
    return '<div class="chat-thread" data-chat-thread="' + escapeHtml(channel) + '">' + threadBody(channel) + '</div>' + note;
  }

  function composer(channel) {
    return '<div class="chat-composer">' +
      '<div class="chat-input-row"><input type="text" class="ask-input chat-input" data-chat-input maxlength="600" placeholder="' + escapeHtml(t('Escriba un mensaje')) + '" aria-label="' + escapeHtml(t('Escriba un mensaje')) + '">' +
      '<button type="button" class="btn btn-primary chat-send" data-chat-send data-chat-channel-send="' + escapeHtml(channel) + '" aria-label="' + escapeHtml(t('Enviar mensaje')) + '">' + icon('arrow') + '</button></div></div>';
  }

  function renderNurseChat() {
    var channel = ctx().getChatChannel() === 'equipo' ? 'equipo' : 'familia';
    var familiaActive = channel === 'familia';
    return '<div class="view-header"><div class="view-header-copy"><h1 class="view-title small-title screen-title">' + escapeHtml(t('Chat')) + '</h1></div></div>' +
      '<div class="segmented chat-tabs" role="tablist" aria-label="' + escapeHtml(t('Canales del chat')) + '">' +
      '<button type="button" class="segment' + (familiaActive ? ' is-active' : '') + '" role="tab" aria-selected="' + String(familiaActive) + '" data-chat-channel="familia">' + escapeHtml(t('Familia')) + '</button>' +
      '<button type="button" class="segment' + (!familiaActive ? ' is-active' : '') + '" role="tab" aria-selected="' + String(!familiaActive) + '" data-chat-channel="equipo">' + escapeHtml(t('Equipo')) + '</button></div>' +
      threadHtml(channel) +
      composer(channel);
  }

  function renderFamilyChat() {
    return '<div class="view-header"><button type="button" class="icon-button back-button" data-chat-back aria-label="' + escapeHtml(t('Volver a Contacto')) + '"><span class="arrow-icon">' + icon('arrow') + '</span></button><div class="view-header-copy"><p class="view-subtitle">' + escapeHtml(t('Familia de María González')) + '</p><h1 class="view-title small-title">' + escapeHtml(t('Mensajes')) + '</h1></div></div>' +
      '<p class="view-copy">' + escapeHtml(t('Escriba al equipo de turno. Le responderán por aquí.')) + '</p>' +
      threadHtml('familia') +
      composer('familia');
  }

  V.chat = {
    renderNurseChat: renderNurseChat,
    renderFamilyChat: renderFamilyChat,
    threadBody: threadBody
  };
}());
