/* Clínica Dental Toñi Torres: horario en vivo, mesa de reservas y mapa a petición. Sin dependencias. */
(function () {
  'use strict';

  /* ---------- Configuración (lo único que se toca para conectar la clínica) ---------- */
  var CONFIG = {
    whatsapp: '34614226860',          // número de WhatsApp de la clínica, con prefijo
    endpoint: '',                     // URL de un formulario (Formspree, Web3Forms...). Vacío = solo WhatsApp
    hours: { 1: [9, 20], 2: [9, 20], 3: [9, 20], 4: [9, 20], 5: [9, 20] }, // día de la semana: [abre, cierra]
    slotMinutes: 30,
    leadMinutes: 120,                 // antelación mínima para pedir una hora del mismo día
    horizonDays: 60,                  // hasta cuántos días vista se puede pedir
    holidays: ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'], // festivos nacionales MM-DD
    closedDates: [],                  // días sueltos cerrados, formato AAAA-MM-DD (vacaciones, festivos locales)
    tz: 'Europe/Madrid'
  };
  var MOTIVOS = ['Revisión o limpieza', 'Niños', 'Ortodoncia', 'Encías', 'Cirugía oral', 'Implantes', 'Estética dental', 'Armonización orofacial', 'Urgencia', 'Otro motivo'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var fmtTime = function (mins) { return Math.floor(mins / 60) + ':' + pad(mins % 60); };
  var key = function (y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); };

  /* Hora de Madrid, vea quien vea la página */
  function madridNow() {
    var parts = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' })
      .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    var dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
    return { y: +parts.year, m: +parts.month - 1, d: +parts.day, h: (+parts.hour) % 24, min: +parts.minute, dow: dow };
  }
  function dowOf(y, m, d) { return new Date(Date.UTC(y, m, d)).getUTCDay(); }
  function isClosedDay(y, m, d) {
    var dow = dowOf(y, m, d);
    if (!CONFIG.hours[dow]) return true;
    if (CONFIG.holidays.indexOf(pad(m + 1) + '-' + pad(d)) > -1) return true;
    return CONFIG.closedDates.indexOf(key(y, m, d)) > -1;
  }
  function daysBetween(a, b) { return Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / 864e5); }

  /* ---------- Menú móvil ---------- */
  var toggle = $('.menu-toggle'), nav = $('#nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }); });
  }

  /* ---------- Abierto ahora y horario ---------- */
  function renderOpenNow() {
    var n = madridNow(), nowMin = n.h * 60 + n.min, h = CONFIG.hours[n.dow], open = false, html = '';
    if (h && !isClosedDay(n.y, n.m, n.d) && nowMin >= h[0] * 60 && nowMin < h[1] * 60) open = true;
    if (open) {
      html = '<span class="tag tag--in">Abierto ahora</span><span>Hasta las ' + h[1] + ':00 de hoy.</span>';
    } else {
      var next = null, i, t;
      for (i = 0; i < 8 && !next; i++) {
        t = new Date(Date.UTC(n.y, n.m, n.d + i));
        var y = t.getUTCFullYear(), m = t.getUTCMonth(), d = t.getUTCDate(), hh = CONFIG.hours[t.getUTCDay()];
        if (!hh || isClosedDay(y, m, d)) continue;
        if (i === 0 && nowMin >= hh[0] * 60) continue;
        next = { i: i, dow: t.getUTCDay(), open: hh[0] };
      }
      var when = !next ? '' : next.i === 0 ? 'Abrimos hoy a las ' + next.open + ':00.' : next.i === 1 ? 'Abrimos mañana a las ' + next.open + ':00.' : 'Abrimos el ' + DIAS[next.dow] + ' a las ' + next.open + ':00.';
      html = '<span class="tag tag--out">Cerrado ahora</span><span>' + when + '</span>';
    }
    $$('[data-open-now]').forEach(function (el) { el.innerHTML = html; el.hidden = false; });
    $$('#timetable li').forEach(function (li) { li.classList.toggle('is-today', +li.getAttribute('data-dow') === n.dow); });
  }
  renderOpenNow();

  /* ---------- Mapa a petición ---------- */
  var mapBtn = $('#load-map');
  if (mapBtn) mapBtn.addEventListener('click', function () {
    var box = $('#map'), f = document.createElement('iframe');
    f.src = 'https://maps.google.com/maps?q=38.2570897,-0.708478&z=17&output=embed';
    f.title = 'Mapa: Clínica Dental Toñi Torres, Carrer Capità Antoni Mena 153, Elche';
    f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade';
    box.innerHTML = ''; box.appendChild(f);
  });

  /* ---------- Mesa de reservas ---------- */
  var form = $('#booking');
  if (!form) return;
  var state = { motivo: '', date: null, time: '', view: null };
  var today = madridNow();
  state.view = { y: today.y, m: today.m };

  // Motivos
  var chipBox = $('#motivos');
  MOTIVOS.forEach(function (m) {
    var l = document.createElement('label'); l.className = 'chip';
    l.innerHTML = '<input type="radio" name="motivo" value="' + m + '"><span>' + m + '</span>';
    chipBox.appendChild(l);
  });
  chipBox.addEventListener('change', function (e) { setMotivo(e.target.value); });
  function setMotivo(v) {
    state.motivo = v;
    $$('#motivos input[name="motivo"]').forEach(function (i) { i.checked = i.value === v; });
    $('#urgent-note').hidden = v !== 'Urgencia';
    sync();
  }
  $$('a[data-motivo]').forEach(function (a) { a.addEventListener('click', function () { setMotivo(a.getAttribute('data-motivo')); }); });

  // Calendario
  var cal = $('#cal');
  function bookable(y, m, d) {
    if (isClosedDay(y, m, d)) return false;
    var diff = daysBetween(today, { y: y, m: m, d: d });
    if (diff < 0 || diff > CONFIG.horizonDays) return false;
    if (diff === 0 && slotsFor(y, m, d).length === 0) return false;
    return true;
  }
  function renderCal() {
    var v = state.view, first = dowOf(v.y, v.m, 1), lead = (first + 6) % 7, count = new Date(Date.UTC(v.y, v.m + 1, 0)).getUTCDate();
    var minView = today.y * 12 + today.m, curView = v.y * 12 + v.m;
    var maxT = new Date(Date.UTC(today.y, today.m, today.d + CONFIG.horizonDays)), maxView = maxT.getUTCFullYear() * 12 + maxT.getUTCMonth();
    var html = '<div class="cal__head"><div class="cal__title">' + MESES[v.m] + ' ' + v.y + '</div><div class="cal__nav">' +
      '<button type="button" class="icon-btn" data-nav="-1" aria-label="Mes anterior"' + (curView <= minView ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button type="button" class="icon-btn" data-nav="1" aria-label="Mes siguiente"' + (curView >= maxView ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button></div></div>' +
      '<div class="cal__week" aria-hidden="true"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="cal__days">';
    var i;
    for (i = 0; i < lead; i++) html += '<span class="day day--blank"></span>';
    for (i = 1; i <= count; i++) {
      var k = key(v.y, v.m, i), ok = bookable(v.y, v.m, i), isToday = v.y === today.y && v.m === today.m && i === today.d;
      html += '<button type="button" class="day' + (isToday ? ' day--today' : '') + '" data-date="' + k + '" aria-pressed="' + (state.date === k) + '"' + (ok ? '' : ' disabled') +
        ' aria-label="' + DIAS[dowOf(v.y, v.m, i)] + ' ' + i + ' de ' + MESES[v.m] + '">' + i + '</button>';
    }
    cal.innerHTML = html + '</div>';
  }
  cal.addEventListener('click', function (e) {
    var nb = e.target.closest('[data-nav]'), db = e.target.closest('[data-date]');
    if (nb) {
      var t = new Date(Date.UTC(state.view.y, state.view.m + (+nb.getAttribute('data-nav')), 1));
      state.view = { y: t.getUTCFullYear(), m: t.getUTCMonth() };
      renderCal();
      var again = $('[data-nav="' + nb.getAttribute('data-nav') + '"]', cal); if (again && !again.disabled) again.focus();
    } else if (db && !db.disabled) {
      state.date = db.getAttribute('data-date'); state.time = '';
      renderCal(); renderSlots(); sync();
      var sel = $('[data-date="' + state.date + '"]', cal); if (sel) sel.focus();
    }
  });

  // Horas
  function slotsFor(y, m, d) {
    var h = CONFIG.hours[dowOf(y, m, d)], out = [], t;
    if (!h) return out;
    var limit = (y === today.y && m === today.m && d === today.d) ? today.h * 60 + today.min + CONFIG.leadMinutes : -1;
    for (t = h[0] * 60; t + CONFIG.slotMinutes <= h[1] * 60; t += CONFIG.slotMinutes) if (t >= limit) out.push(t);
    return out;
  }
  function renderSlots() {
    var box = $('#slots');
    if (!state.date) { box.innerHTML = '<p class="slots__empty">Elige primero un día.</p>'; return; }
    var p = state.date.split('-'), list = slotsFor(+p[0], +p[1] - 1, +p[2]);
    var am = list.filter(function (t) { return t < 14 * 60; }), pm = list.filter(function (t) { return t >= 14 * 60; });
    function group(title, arr) {
      if (!arr.length) return '';
      return '<div><h4>' + title + '</h4><div class="slots__grid">' + arr.map(function (t) {
        var v = fmtTime(t);
        return '<button type="button" class="slot" data-time="' + v + '" aria-pressed="' + (state.time === v) + '">' + v + '</button>';
      }).join('') + '</div></div>';
    }
    box.innerHTML = group('Mañana', am) + group('Tarde', pm) || '<p class="slots__empty">No quedan horas ese día. Prueba con otro.</p>';
  }
  $('#slots').addEventListener('click', function (e) {
    var b = e.target.closest('[data-time]'); if (!b) return;
    state.time = b.getAttribute('data-time');
    $$('.slot').forEach(function (s) { s.setAttribute('aria-pressed', String(s === b)); });
    sync();
  });

  // Resumen
  function dateLabel() {
    if (!state.date) return '';
    var p = state.date.split('-'), d = DIAS[dowOf(+p[0], +p[1] - 1, +p[2])];
    return d.charAt(0).toUpperCase() + d.slice(1) + ' ' + (+p[2]) + ' de ' + MESES[+p[1] - 1];
  }
  function setDD(id, val, empty) { var el = $(id); el.textContent = val || empty; el.classList.toggle('is-empty', !val); }
  function missing() {
    var m = [];
    if (!state.motivo) m.push('el motivo');
    if (!state.date) m.push('el día');
    else if (!state.time) m.push('la hora');
    if (!$('#f-nombre').value.trim()) m.push('tu nombre');
    if (!validPhone($('#f-tel').value)) m.push('un teléfono válido');
    if (!$('#f-consent').checked) m.push('la casilla de privacidad');
    return m;
  }
  function validPhone(v) { return /^(\+34|0034)?[6-9]\d{8}$/.test(v.replace(/[\s.\-()]/g, '')); }
  function sync() {
    setDD('#s-motivo', state.motivo, 'Sin elegir');
    setDD('#s-dia', dateLabel(), 'Sin elegir');
    setDD('#s-hora', state.time ? state.time + ' h' : '', 'Sin elegir');
    setDD('#s-nombre', $('#f-nombre').value.trim(), 'Sin rellenar');
    var m = missing(), btn = $('#send');
    btn.setAttribute('aria-disabled', String(m.length > 0));
    $('#status').textContent = m.length ? 'Falta: ' + m.join(', ') + '.' : 'Todo listo para enviar.';
    $('#sent').hidden = true;
    renderQuick();
  }
  ['#f-nombre', '#f-tel', '#f-consent'].forEach(function (s) { $(s).addEventListener('input', sync); $(s).addEventListener('change', sync); });
  $('#f-nombre').addEventListener('input', function () { clearErr('nombre'); });
  $('#f-tel').addEventListener('input', function () { clearErr('tel'); });

  function clearErr(n) { var e = $('#e-' + n), i = n === 'consent' ? $('#f-consent') : $('#f-' + n); if (e) e.textContent = ''; if (i) i.removeAttribute('aria-invalid'); }
  function setErr(n, msg) { var e = $('#e-' + n), i = n === 'consent' ? $('#f-consent') : $('#f-' + n); e.textContent = msg; i.setAttribute('aria-invalid', 'true'); }

  // Envío
  function buildMessage() {
    var d = new FormData(form), nota = (d.get('nota') || '').trim();
    return 'Hola, quiero pedir cita en Clínica Dental Toñi Torres.\n' +
      'Motivo: ' + state.motivo + '\n' +
      'Día: ' + dateLabel() + '\n' +
      'Hora: ' + state.time + ' h\n' +
      'Nombre: ' + $('#f-nombre').value.trim() + '\n' +
      'Teléfono: ' + $('#f-tel').value.trim() + '\n' +
      'Paciente: ' + d.get('paciente') + (nota ? '\nComentario: ' + nota : '');
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ['nombre', 'tel', 'consent'].forEach(clearErr);
    var m = missing();
    if (m.length) {
      if (!$('#f-nombre').value.trim()) setErr('nombre', 'Escribe tu nombre.');
      if (!validPhone($('#f-tel').value)) setErr('tel', 'Revisa el teléfono: 9 cifras.');
      if (!$('#f-consent').checked) setErr('consent', 'Necesitamos que aceptes para poder gestionar tu cita.');
      $('#status').textContent = 'Falta: ' + m.join(', ') + '.';
      var target = !state.motivo ? $('#motivos input') : !state.date ? $('.day:not(:disabled)', cal) : !state.time ? $('.slot') : $('[aria-invalid="true"]');
      if (target) target.focus();
      return;
    }
    var msg = buildMessage(), sent = $('#sent');
    function done(viaEndpoint) {
      sent.hidden = false;
      sent.textContent = viaEndpoint
        ? 'Solicitud enviada. La clínica te confirmará la cita por teléfono o WhatsApp.'
        : 'Se ha abierto WhatsApp con tu solicitud. Pulsa enviar allí y la clínica te confirmará la cita.';
    }
    if (CONFIG.endpoint) {
      fetch(CONFIG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ mensaje: msg, motivo: state.motivo, dia: dateLabel(), hora: state.time, nombre: $('#f-nombre').value.trim(), telefono: $('#f-tel').value.trim() }) })
        .then(function (r) { if (!r.ok) throw new Error(); done(true); })
        .catch(function () { window.open('https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(msg), '_blank', 'noopener'); done(false); });
    } else {
      window.open('https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
      done(false);
    }
  });

  // Reserva rápida en la portada: comparte estado con la mesa de reservas
  var quick = $('#quick'), QMOTIVOS = ['Revisión o limpieza', 'Ortodoncia', 'Implantes', 'Urgencia'], DIA3 = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  function renderQuick() {
    if (!quick) return;
    var days = [], i = 0, t;
    while (days.length < 4 && i <= CONFIG.horizonDays) {
      t = new Date(Date.UTC(today.y, today.m, today.d + i));
      var y = t.getUTCFullYear(), m = t.getUTCMonth(), d = t.getUTCDate();
      if (bookable(y, m, d)) days.push({ k: key(y, m, d), y: y, m: m, d: d, i: i, w: t.getUTCDay() });
      i++;
    }
    quick.innerHTML = '<h2 id="t-quick">Reserva rápida</h2>' +
      '<div><div class="quick__label">Día</div><div class="quick__days">' + days.map(function (x) {
        var lab = x.i === 0 ? 'Hoy' : x.i === 1 ? 'Mañana' : DIA3[x.w];
        return '<button type="button" class="qday" data-qdate="' + x.k + '" aria-pressed="' + (state.date === x.k) + '" aria-label="' + DIAS[x.w] + ' ' + x.d + ' de ' + MESES[x.m] + '"><span>' + lab + '</span><b>' + x.d + '</b></button>';
      }).join('') + '</div></div>' +
      '<div><div class="quick__label">Motivo</div><div class="chips">' + QMOTIVOS.map(function (v) {
        return '<label class="chip"><input type="radio" name="qmotivo" value="' + v + '"' + (state.motivo === v ? ' checked' : '') + '><span>' + v + '</span></label>';
      }).join('') + '</div></div>' +
      '<a class="btn btn--primary" href="#reserva">Seguir con mi cita</a>';
    quick.hidden = false;
  }
  if (quick) quick.addEventListener('click', function (e) {
    var b = e.target.closest('[data-qdate]'); if (!b) return;
    var k = b.getAttribute('data-qdate'), p = k.split('-');
    state.date = k; state.time = ''; state.view = { y: +p[0], m: +p[1] - 1 };
    renderCal(); renderSlots(); sync();
    var again = $('[data-qdate="' + k + '"]', quick); if (again) again.focus();
  });
  if (quick) quick.addEventListener('change', function (e) {
    if (e.target.name !== 'qmotivo') return;
    setMotivo(e.target.value);
    var again = $('input[name="qmotivo"]:checked', quick); if (again) again.focus();
  });

  renderCal(); renderSlots(); sync();
})();
