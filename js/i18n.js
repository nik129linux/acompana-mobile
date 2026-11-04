(function () {
  'use strict';

  // Spanish and English. Spanish is the source language, so a Spanish sentence
  // is its own key: t('Hola, {name}', { name: 'Elena' }). The English catalog
  // below is the only other copy of the UI text. Runs before every view.
  var KEY = 'acompana-lang';
  var LANGS = ['es', 'en'];
  var SPEECH = { es: 'es-CO', en: 'en-US' };

  var EN = {
    // Shell
    'Acompaña · turno de enfermería': 'Acompaña · nursing shift',
    'Vista de la aplicación Acompaña': 'Acompaña app view',
    'Navegación principal': 'Main navigation',
    'Bienvenida a Acompaña': 'Welcome to Acompaña',
    'El turno, a la vista. Sin perder lo importante.': 'The shift in plain sight. Nothing important lost.',
    'Entrar ahora': 'Enter now',
    'Cambia de rol y toca las tarjetas para explorar el turno.': 'Switch roles and tap the cards to explore the shift.',
    'Registrar': 'Log',
    'Ver como': 'View as',
    'Enfermero': 'Nurse',
    'Paciente': 'Patient',
    'Familia': 'Family',
    'Tema oscuro': 'Dark theme',
    'Tema claro': 'Light theme',
    'Cambiar a tema oscuro': 'Switch to dark theme',
    'Cambiar a tema claro': 'Switch to light theme',
    'Simular un error': 'Simulate an error',
    'Ilustración animada': 'Animated illustration',
    'Doctora saludando': 'Doctor waving',
    'Doctora flotando tranquila': 'Doctor floating calmly',
    'Doctora celebrando': 'Doctor celebrating',
    'Buscando la respuesta': 'Looking for the answer',

    // Navigation
    'Turno': 'Shift',
    'Pendientes': 'To do',
    'Chat': 'Chat',
    'Mi estado': 'My status',
    'Preguntas': 'Questions',
    'Qué pasa': 'Updates',
    'Contacto': 'Contact',

    // Demo data
    'Revisar': 'Review',
    'Medicación 11:00': 'Medication 11:00',
    '1 toque': '1 tap',
    'Presión arterial': 'Blood pressure',
    'Frecuencia cardiaca': 'Heart rate',
    'Protocolo': 'Protocol',
    'Hipotensión': 'Hypotension',
    'activo': 'active',
    'lpm': 'bpm',
    'Medicamento': 'Medication',
    'Enoxaparina': 'Enoxaparin',
    'Dosis': 'Dose',
    'Hora': 'Time',
    'vía abdominal': 'abdominal',
    'Posición': 'Position',
    'Decúbito lateral': 'Side-lying',
    'izquierdo': 'left',
    'Próximo cambio': 'Next change',
    'previsto': 'planned',
    'Medicación de la mañana': 'Morning medication',
    'Cambio de posición': 'Position change',
    'Ronda de control': 'Check-up round',
    'Tratamiento de la mañana en curso': 'Morning treatment in progress',
    'Tratamiento de la mañana cumplido': 'Morning treatment done',
    'Le ayudaron a cambiar de posición': 'They helped you change position',
    'Ya le pusieron el medicamento de la mañana': 'You already had your morning medication',
    'Le van a poner el medicamento de la mañana': 'You will get your morning medication',
    'La enfermera vuelve a hacer la ronda': 'The nurse comes back for the round',
    'Le aplicaron el medicamento': 'You were given your medication',
    'La enfermera pasó a revisar': 'The nurse came by to check on you',
    'Tratamiento cumplido': 'Treatment done',
    'El equipo pasó a revisar': 'The team came by to check',
    'ella': 'her',
    'él': 'him',

    // Nurse home
    'Hola, Elena': 'Hi, Elena',
    'Piso 3 · Hospital Central': 'Floor 3 · Central Hospital',
    'Resumen del turno': 'Shift summary',
    'pacientes': 'patients',
    'pendientes': 'to do',
    'Ronda': 'Round',
    '1:00 p. m.': '1:00 PM',
    'Requiere atención': 'Needs attention',
    'Tus pacientes': 'Your patients',
    '{count} estables': '{count} stable',
    'Entrega de turno': 'Shift handover',
    'Nota de entrega (SBAR)': 'Handover note (SBAR)',
    'Borrador del turno que puedes editar antes de copiar.': 'A shift draft you can edit before copying.',
    'Preparar entrega': 'Prepare handover',
    'alerta de signos vitales': 'vital signs alert',
    'Revisar ahora · protocolo abierto': 'Review now · open protocol',
    'Revisar ahora a {name}': 'Review {name} now',
    'Confirmar {task} en un toque': 'Confirm {task} in one tap',
    'Abrir detalle de {name}': 'Open details for {name}',
    'Listo': 'Done',
    'Plantilla': 'Template',
    'Borrador con IA': 'AI draft',

    // Pending
    'Confirmar {task}': 'Confirm {task}',
    'Hecho': 'Done',
    'Registrado': 'Logged',
    'Evento': 'Event',
    'Otro evento': 'Other event',
    'Medicación': 'Medication',
    'Aún no hay nada hecho': 'Nothing done yet',
    'Todo al día': 'All caught up',
    'No queda nada pendiente. Puedes respirar un momento.': 'Nothing left to do. Take a moment to breathe.',
    'Todo confirmado. El equipo puede seguir con tranquilidad.': 'Everything is confirmed. The team can carry on calmly.',
    'Volver al turno': 'Back to the shift',
    'Pendientes y hechas': 'To do and done',
    'Hechas': 'Done',
    '{count} registros': '{count} records',
    'Lo que falta': 'Still to do',
    'En este momento': 'Right now',
    'Orden por hora': 'By time',
    'Preguntas de la familia': 'Questions from the family',
    'Si una familia dejó una duda desde su vista, aparece aquí.': 'If a family leaves a question from their view, it shows up here.',
    'Revisar preguntas': 'Check questions',
    'Buscando preguntas…': 'Looking for questions…',
    'Sin preguntas por ahora.': 'No questions for now.',
    'Marcar lista': 'Mark as done',
    'Sin conexión al servidor. Sigue con la plantilla.': 'No connection to the server. Keep using the template.',

    // Patient detail
    'Alerta de signos vitales · protocolo abierto': 'Vital signs alert · open protocol',
    'Alerta abierta · revisar signos': 'Open alert · review vitals',
    'En seguimiento · sin alertas': 'Being monitored · no alerts',
    'Hechos hoy': 'Done today',
    'Valor clínico': 'Clinical value',
    'Mostrar el valor clínico': 'Show the clinical value',
    'Mostrar dato clínico': 'Show clinical value',
    'Ocultar dato clínico': 'Hide clinical value',
    'Oculto porque esta pantalla también se ve desde la cama. La familia recibe solo un resumen del turno, sin valores clínicos.': 'Hidden because this screen can be seen from the bed. The family only gets a shift summary, with no clinical values.',
    'Pendiente': 'To do',
    'Avisar a la familia': 'Update the family',
    'Registrar evento': 'Log event',

    // Register sheet
    'Arrastrar para cerrar': 'Drag to close',
    'Registro rápido': 'Quick log',
    '¿Qué acabas de hacer?': 'What did you just do?',
    'Cerrar registro': 'Close log',
    'Abrir detalle': 'Add details',
    'Describe el evento': 'Describe the event',
    'Guardar': 'Save',
    'Dictar evento': 'Dictate event',
    'Toca para dictar': 'Tap to dictate',
    'Revisa antes de guardar': 'Review before saving',
    'Cancelar': 'Cancel',
    'Deshacer': 'Undo',
    'Medicación registrada': 'Medication logged',
    'Cambio de posición registrado': 'Position change logged',
    'Ronda registrada': 'Round logged',
    'Evento registrado': 'Event logged',
    '{name} listo para registrar.': '{name} ready to log.',
    'Escuchando… toca para terminar': 'Listening… tap to finish',
    'Habla con normalidad': 'Speak normally',
    'Este navegador no permite dictar. Escribe el evento.': 'This browser cannot dictate. Type the event.',
    'Brave bloquea el dictado por voz. Abre la app en Chrome o escribe el evento.': 'Brave blocks voice dictation. Open the app in Chrome or type the event.',
    'El micrófono necesita abrir la app por https. Escribe el evento.': 'The microphone needs the app open over https. Type the event.',
    'Permite el micrófono para dictar, o escribe el evento.': 'Allow the microphone to dictate, or type the event.',
    'No te escuché. Toca de nuevo o escribe el evento.': 'I did not hear you. Tap again or type the event.',
    'No encontré un micrófono. Escribe el evento.': 'No microphone found. Type the event.',
    'El servicio de voz no respondió (en Brave está bloqueado). Usa Chrome o escribe el evento.': 'The voice service did not answer (Brave blocks it). Use Chrome or type the event.',
    'No se pudo dictar. Escribe el evento.': 'Could not dictate. Type the event.',
    'No te entendí bien. Toca de nuevo o escribe el evento.': 'I did not catch that. Tap again or type the event.',
    'No se pudo abrir el micrófono. Escribe el evento.': 'Could not open the microphone. Type the event.',

    // Handover sheet
    'Cerrar nota': 'Close note',
    'Revisa cada campo. Puedes editarlo antes de copiarlo.': 'Review each field. You can edit it before copying.',
    'Situación': 'Situation',
    'Antecedentes': 'Background',
    'Evaluación': 'Assessment',
    'Recomendación': 'Recommendation',
    'Generar borrador': 'Generate draft',
    'Preparando el borrador…': 'Preparing the draft…',
    'Copiar': 'Copy',
    'Enviar al equipo': 'Send to the team',
    'Nota enviada': 'Note sent',
    'Nota enviada al equipo.': 'Note sent to the team.',
    'Nota copiada. Puedes pegarla donde la necesites.': 'Note copied. You can paste it wherever you need it.',
    'No se pudo copiar. Selecciona el texto a mano.': 'Could not copy. Select the text by hand.',
    'Sin conexión. La nota no se envió.': 'No connection. The note was not sent.',
    'Escribe la nota antes de enviarla.': 'Write the note before sending it.',
    'Antes de usar la IA': 'Before using AI',
    'Esto es lo único que saldría de este equipo. Sin nombres ni datos personales. ¿Lo aceptas?': 'This is the only thing that would leave this device. No names or personal data. Do you accept?',
    'Aceptar': 'Accept',
    'Ahora no': 'Not now',

    // Error state
    'No se pudo enviar': 'Could not send',
    'Sin conexión con el servidor. Lo escrito sigue guardado aquí.': 'No connection to the server. What you wrote is still saved here.',
    'Reintentar': 'Try again',
    'Cerrar': 'Close',
    'Fue solo una prueba. No se perdió nada.': 'That was only a test. Nothing was lost.',

    // Family message and handover draft
    'Hola, familia de {name}.': 'Hello, family of {name}.',
    'Resumen del turno de hoy ({room}):': "Today's shift summary ({room}):",
    'Horario de visita: hoy de 3:00 a 5:00 p. m.': "Today's visiting hours: 3:00 to 5:00 PM",
    '— Elena, enfermera de turno': '— Elena, nurse on shift',
    'El equipo está pendiente y no hay novedades que reportar': 'The team is on it and there is nothing new to report',
    'Sin conexión. El mensaje no se envió.': 'No connection. The message was not sent.',
    'Mensaje enviado a la familia': 'Message sent to the family',
    'Situación: ': 'Situation: ',
    'Antecedentes: ': 'Background: ',
    'Evaluación: ': 'Assessment: ',
    'Recomendación: ': 'Recommendation: ',
    'Cambio postural de la mañana hecho': 'Morning position change done',
    'Enoxaparina 40mg SC, vía abdominal aplicada': 'Enoxaparin 40mg SC, abdominal, given',
    'Enoxaparina 40mg SC, vía abdominal prevista': 'Enoxaparin 40mg SC, abdominal, planned',
    'Cambio postural previsto': 'Position change planned',
    'Ronda programada, control de signos': 'Round scheduled, vital signs check',
    'PA 90/55, taquicardia 112, alerta protocolo hipotensión': 'BP 90/55, tachycardia 112, hypotension protocol alert',
    'Medicación aplicada: {text}': 'Medication given: {text}',
    'Cambio de posición: {text}': 'Position change: {text}',
    'Ronda realizada: {text}': 'Round done: {text}',
    'Evento: {text}': 'Event: {text}',
    'Turno sin eventos registrados todavía.': 'No events logged this shift yet.',
    'Turno: {done} de {total} eventos listos.': 'Shift: {done} of {total} events done.',
    'Faltan {count}: {times}.': '{count} left: {times}.',
    'Nada pendiente.': 'Nothing left to do.',
    'sin hora': 'no time',
    'turno actual': 'this shift',
    'Aplicado: {text} ({time}).': 'Given: {text} ({time}).',
    'Cambio postural hecho.': 'Position change done.',
    'Sin medicación aplicada en el turno.': 'No medication given this shift.',
    'En revisión: {text}.': 'Under review: {text}.',
    'Sin alertas en lo registrado.': 'No alerts in the log.',
    'Quedan {count} por confirmar.': '{count} left to confirm.',
    'próxima hora': 'next hour',
    'Completa lo pendiente y revalora signos en la ronda de las {time}.': 'Finish what is left and recheck vitals at the {time} round.',
    'Completa lo pendiente y deja nota en el turno.': 'Finish what is left and leave a note on the shift.',
    'Turno al día. Deja nota breve para el siguiente turno.': 'Shift up to date. Leave a short note for the next shift.',

    // Chat
    'Enviando…': 'Sending…',
    'No se envió': 'Not sent',
    'Enviado': 'Sent',
    'Aún no hay mensajes con la familia': 'No messages with the family yet',
    'Los avisos que envíes desde el turno aparecen aquí.': 'Updates you send from the shift show up here.',
    'Aún no hay mensajes': 'No messages yet',
    'Escríbale al equipo cuando lo necesite.': 'Write to the team whenever you need to.',
    'Aún no hay mensajes del equipo': 'No messages from the team yet',
    'Las notas de entrega que envíes aparecen aquí.': 'Handover notes you send show up here.',
    'Sin conexión. Los mensajes se verán cuando vuelva la red.': 'No connection. Messages will show when the network is back.',
    'Escriba un mensaje': 'Write a message',
    'Enviar mensaje': 'Send message',
    'Canales del chat': 'Chat channels',
    'Equipo': 'Team',
    'Volver a Contacto': 'Back to Contact',
    'Familia de María González': 'Family of María González',
    'Mensajes': 'Messages',
    'Escriba al equipo de turno. Le responderán por aquí.': 'Write to the team on shift. They will answer here.',

    // Patient
    'Hola, María': 'Hi, María',
    'Aquí ve lo que va pasando, en palabras sencillas.': 'See what is happening here, in plain words.',
    'Lo que sigue': 'What comes next',
    'a la 1:00 p. m.': 'at 1:00 PM',
    'a las 11:00 a. m.': 'at 11:00 AM',
    '11:00 a. m.': '11:00 AM',
    'Medicamento de la mañana': 'Morning medication',
    'Su día de hoy': 'Your day today',
    'En simple': 'In plain words',
    'Así funciona': 'How it works',
    'Dos ideas sencillas': 'Two simple ideas',
    'Vea el próximo paso del turno.': 'See the next step of the shift.',
    'Cómo pedir ayuda': 'How to ask for help',
    'Use el timbre cuando necesite algo.': 'Use the call button when you need something.',
    'Si hay algo que no tiene claro, puede preguntar con tranquilidad.': 'If something is not clear, feel free to ask.',
    '¿Cuándo vuelve la enfermera?': 'When does the nurse come back?',
    'La próxima ronda está prevista para': 'The next round is planned for',
    'la 1:00 p. m.': '1:00 PM',
    'Si llega un poco más tarde, el equipo le avisará.': 'If it runs a little late, the team will let you know.',
    '¿Cómo pido algo?': 'How do I ask for something?',
    'Use el timbre de la habitación. La enfermera responderá lo más pronto posible.': 'Use the call button in the room. The nurse will answer as soon as possible.',
    '¿Qué información veo aquí?': 'What information do I see here?',
    'Ve un resumen del turno en palabras sencillas. Su equipo decide qué información clínica debe recibir.': 'You see a summary of the shift in plain words. Your care team decides what clinical information you receive.',

    // Family
    'Hola, familia de {name}': 'Hello, family of {name}',
    'Un resumen sencillo para acompañarla con tranquilidad.': 'A simple summary so you can be there for her with peace of mind.',
    'Un resumen sencillo para acompañarlo con tranquilidad.': 'A simple summary so you can be there for him with peace of mind.',
    'El equipo está con {pronoun}': 'The team is with {pronoun}',
    'El tratamiento de la mañana va avanzando con normalidad.': 'The morning treatment is moving along normally.',
    'Horario de visita · Hoy, de {from} a {to}': 'Visiting hours · Today, {from} to {to}',
    '3:00 p. m.': '3:00 PM',
    '5:00 p. m.': '5:00 PM',
    'Hoy': 'Today',
    'Sin datos clínicos': 'No clinical data',
    'El equipo está con {pronoun}, sin novedad que reportar': 'The team is with {pronoun}, nothing new to report',
    'Horario de visita disponible': 'Visiting hours available',
    'Escriba al equipo cuando necesite algo.': 'Write to the team when you need something.',
    '¿Tiene una duda?': 'Do you have a question?',
    'Pregunte con tranquilidad. Le respondemos solo con lo que se ve del turno.': 'Feel free to ask. We answer only from what shows on the shift.',
    '¿Cómo pasó la noche?': 'How was the night?',
    'Escriba su pregunta': 'Write your question',
    'Escriba su pregunta primero.': 'Write your question first.',
    'Preguntar': 'Ask',
    'Si necesita información sobre la visita, el equipo de turno puede orientarla.': 'If you need information about the visit, the team on shift can help you.',
    'Enfermera de turno': 'Nurse on shift',
    'Elena · vuelve a': 'Elena · back at',
    'Llamar': 'Call',
    'al turno de Elena': "Elena's shift",
    'Mensaje': 'Message',
    'Escriba al equipo': 'Write to the team',
    'Visita': 'Visit',
    'Ver horarios': 'See hours',
    'Horarios del turno': 'Shift hours',
    'Cerrar horarios': 'Close hours',
    'Visita hoy': 'Visit today',
    '3:00 p. m. a 5:00 p. m.': '3:00 PM to 5:00 PM',
    'Próxima ronda': 'Next round',
    'La 1:00 p. m.': '1:00 PM',
    'Respuesta de IA: ': 'AI answer: ',
    'Respuesta automática: ': 'Automatic answer: ',
    'Buscando en el turno…': 'Looking through the shift…',
    'No puedo responder eso con lo que se ve del turno. Anótelo para preguntarlo a la enfermera.': 'I cannot answer that from what shows on the shift. Write it down to ask the nurse.',
    'Tratamiento de la mañana cumplido.': 'Morning treatment done.',
    'Tratamiento de la mañana en curso.': 'Morning treatment in progress.',
    'El equipo está con {pronoun}, sin novedad que reportar.': 'The team is with {pronoun}, nothing new to report.',
    'La enfermera vuelve a la 1:00 p. m.': 'The nurse comes back at 1:00 PM.'
  };

  function saved() {
    try { return window.localStorage.getItem(KEY); } catch (error) { return null; }
  }

  function initial() {
    var fromLink = new URLSearchParams(window.location.search).get('lang');
    if (LANGS.indexOf(fromLink) !== -1) return fromLink;
    var stored = saved();
    return LANGS.indexOf(stored) !== -1 ? stored : 'es';
  }

  var current = initial();

  function fill(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match;
    });
  }

  function t(source, vars) {
    var text = current === 'en' && Object.prototype.hasOwnProperty.call(EN, source) ? EN[source] : source;
    return fill(text, vars);
  }

  // "Hab. 304-B" is demo data; only its label changes with the language.
  function room(label) {
    return current === 'en' ? String(label).replace(/^Hab\.\s*/, 'Room ') : String(label);
  }

  function paintStatic() {
    var root = document.documentElement;
    root.lang = current;
    document.title = t('Acompaña · turno de enfermería');
    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-label]').forEach(function (node) {
      node.setAttribute('aria-label', t(node.getAttribute('data-i18n-label')));
    });
  }

  function setLang(lang) {
    if (LANGS.indexOf(lang) === -1) return;
    current = lang;
    try { window.localStorage.setItem(KEY, lang); } catch (error) { /* private mode: session only */ }
    paintStatic();
  }

  document.documentElement.lang = current;
  document.addEventListener('DOMContentLoaded', paintStatic);

  window.AcompanaI18n = {
    t: t,
    room: room,
    setLang: setLang,
    lang: function () { return current; },
    speechLang: function () { return SPEECH[current]; },
    otherLang: function () { return current === 'en' ? 'es' : 'en'; }
  };
}());
