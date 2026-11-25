(function () {
  'use strict';
  var CFG = window.EXAM_CONFIG || {};
  var API = (CFG.API_BASE || '').replace(/\/+$/, '');
  var LETTERS = 'ABCDEFGHIJ';
  var TOKEN_KEY = 'exam_token';
  var REASONS = {
    left_page: 'you left the exam page or switched to another app',
    copy: 'you tried to copy',
    right_click: 'you tried to open the right-click menu',
    screenshot: 'you pressed a screenshot key',
    print: 'you tried to print',
    devtools: 'you tried to open developer tools'
  };

  var $ = function (id) { return document.getElementById(id); };
  var views = ['register', 'rules', 'exam', 'done', 'loading'];
  function show(v) { views.forEach(function (n) { $('view-' + n).classList.toggle('hidden', n !== v); }); window.scrollTo(0, 0); }

  function store(key, val) { try { if (val === undefined) return localStorage.getItem(key); if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) { return null; } }

  function api(path, body) {
    var opts = body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' };
    return fetch(API + '/' + path, opts).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'Server error (' + r.status + ')' }; })
        .then(function (d) { d._status = r.status; return d; });
    });
  }

  function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function fmtLong(sec) { sec = Math.round(sec); var m = Math.floor(sec / 60), s = sec % 60; return m ? m + ' minute' + (m > 1 ? 's' : '') + (s ? ' ' + s + ' seconds' : '') : s + ' seconds'; }

  if (CFG.TITLE) { document.title = CFG.TITLE; document.querySelectorAll('.js-title').forEach(function (el) { el.textContent = CFG.TITLE; }); }

  // ---------------- Exam info (rules + facts on the first page) ----------------
  var INFO = null;
  function loadInfo() {
    if (INFO) return Promise.resolve(INFO);
    return api('info.php').then(function (i) {
      if (!i.ok) throw new Error();
      INFO = i;
      if (i.questions) $('fact-q').textContent = i.questions;
      $('fact-t').textContent = Math.round(i.total_seconds / 60);
      i.offset = i.server_ts ? i.server_ts * 1000 - Date.now() : 0;
      if (i.opens_label && i.closes_label) {
        $('exam-time').textContent = 'Exam time: ' + i.opens_label + ' to ' + i.closes_label + ' (Nepal time)';
        $('exam-time').classList.remove('hidden');
      }
      watchWindow(i);
      return i;
    });
  }

  // Opening / closing time of the exam (server clock, Nepal time)
  var winTimer = null;
  function windowState(i) {
    var now = (Date.now() + (i.offset || 0)) / 1000;
    if (i.opens_ts && now < i.opens_ts) return { s: 'early', left: i.opens_ts - now };
    if (i.closes_ts && now >= i.closes_ts) return { s: 'closed' };
    return { s: 'open', left: i.closes_ts ? i.closes_ts - now : null };
  }
  function hms(sec) { sec = Math.max(0, Math.ceil(sec)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + 'h ' : '') + (h || m ? m + 'm ' : '') + s + 's'; }
  function watchWindow(i) {
    clearInterval(winTimer);
    var tick = function () {
      var w = windowState(i), note = $('win-note'), btns = [document.querySelector('#reg-form button[type=submit]'), $('btn-start')];
      note.className = 'window-note' + (w.s === 'open' ? (w.left && w.left < 15 * 60 ? ' soon' : ' hidden') : ' ' + w.s);
      if (w.s === 'early') note.innerHTML = '<b>The exam has not started yet.</b> It opens at ' + i.opens_label + ' Nepal time, in <b>' + hms(w.left) + '</b>.';
      else if (w.s === 'closed') note.innerHTML = '<b>The exam is closed.</b> It ended at ' + i.closes_label + ' Nepal time. Thank you for your interest.';
      else if (w.left && w.left < 15 * 60) note.innerHTML = '<b>The exam closes at ' + i.closes_label + ' Nepal time.</b> Only ' + hms(w.left) + ' left. Answers are submitted automatically at the closing time.';
      btns[0].disabled = w.s !== 'open';
      if (w.s !== 'open') $('btn-start').disabled = true; else $('btn-start').disabled = !$('agree').checked;
      if (w.s === 'closed') clearInterval(winTimer);
    };
    tick(); winTimer = setInterval(tick, 1000);
  }

  // ---------------- Registration ----------------
  var reg = null;
  $('reg-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var d = { name: f.name.value.trim(), phone: f.phone.value.replace(/[^0-9+]/g, ''), email: f.email.value.trim(), address: f.address.value.trim() };
    var err = '';
    if (d.name.length < 2) err = 'Please enter your full name.';
    else if (!/^\+?[0-9]{7,15}$/.test(d.phone)) err = 'Please enter a valid phone number.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) err = 'Please enter a valid email address.';
    else if (d.address.length < 3) err = 'Please enter your current address.';
    $('reg-msg').textContent = err; $('reg-msg').classList.toggle('hidden', !err);
    if (err) return;
    reg = d; show('rules'); loadRules();
  });

  function loadRules() {
    var ul = $('rules-list');
    loadInfo().then(function (i) {
      var L = i.seconds_per_question, rules = [];
      var names = { IQ: i.iq + ' IQ', GK: i.gk + ' General Knowledge' }, order = i.order || ['GK', 'IQ'];
      rules.push('The exam has <b>' + i.questions + ' multiple-choice questions</b>: ' + names[order[0]] + ' questions first, then ' + names[order[1]] + ' questions. Each has one correct answer.');
      if (L > 0) {
        rules.push('Each question has its own <b>' + L + '-second timer</b> and moves on automatically. You cannot go back.');
      } else {
        rules.push('You have <b>' + fmtLong(i.total_seconds) + '</b>. The timer starts when you press <b>Start exam</b> and cannot be paused. When it runs out, your answers are submitted automatically.');
        rules.push('You can move between questions and change your answers until you submit.');
      }
      rules.push('Match the following: read the table, then choose the option with the correct pairs.');
      rules.push('<b>Stay on this page.</b> If you switch to another app or tab, minimise the browser, copy, right-click, print or press a screenshot key, <b>the question on your screen is removed</b>. It counts as skipped and you cannot open it again.');
      rules.push('If your page reloads, open this page again in the same browser to continue. The timer does not stop.');
      rules.push('Each phone number and email can take the exam only once.');
      if (i.closes_label) rules.push('The exam runs from <b>' + i.opens_label + ' to ' + i.closes_label + ' Nepal time</b>. At ' + i.closes_label + ' every exam is submitted automatically, even if you started late.');
      rules.push('<b>How winners are selected:</b> the highest score wins. If scores are equal, the student who submitted earlier ranks higher.');
      ul.innerHTML = rules.map(function (r) { return '<li' + (r.indexOf('Stay on this page') !== -1 ? ' class="warn"' : '') + '>' + r + '</li>'; }).join('');
    }).catch(function () { ul.innerHTML = '<li class="warn">Stay on the exam page until you finish. Leaving the page, copying or taking screenshots removes the question on your screen.</li>'; });
  }

  $('btn-back').onclick = function () { show('register'); };
  $('agree').onchange = function () { $('btn-start').disabled = !this.checked || (INFO && windowState(INFO).s !== 'open'); };
  $('btn-start').onclick = function () {
    var b = this; b.disabled = true; b.textContent = 'Starting…'; $('start-msg').classList.add('hidden');
    api('start.php', reg).then(function (d) {
      if (!d.ok) throw new Error(d.error || 'Could not start the exam.');
      store(TOKEN_KEY, d.token);
      startExam(d);
    }).catch(function (err) {
      $('start-msg').textContent = err.message === 'Failed to fetch' ? 'Could not reach the server. Check your internet and try again.' : err.message;
      $('start-msg').classList.remove('hidden');
      b.disabled = false; b.textContent = 'Start exam';
    });
  };

  // ---------------- Exam ----------------
  var S = null; // exam state

  function startExam(d) {
    var token = d.token || store(TOKEN_KEY);
    var local = null;
    try { local = JSON.parse(store('exam_state_' + token) || 'null'); } catch (e) { local = null; }
    S = {
      token: token, qs: d.questions, idx: 0,
      perQ: d.seconds_per_question || 0,
      protect: !!d.protect,
      endAt: Date.now() + d.remaining_seconds * 1000,
      ans: {}, time: {}, visits: {}, review: {}, forfeit: {}, tabSwitches: 0, copyAttempts: 0, shotAttempts: 0,
      enteredAt: null, submitting: false, done: false
    };
    d.questions.forEach(function (q) {
      var sv = d.saved && d.saved[q.id];
      S.ans[q.id] = sv ? sv.selected : null; S.time[q.id] = sv ? sv.time : 0; S.visits[q.id] = sv ? sv.visits : 0;
      if (sv && sv.forfeited) S.forfeit[q.id] = sv.forfeited;
    });
    // The copy in this browser is never older than the server copy, so prefer it.
    if (local) {
      Object.keys(local.ans || {}).forEach(function (k) { if (k in S.ans) S.ans[k] = local.ans[k]; });
      Object.keys(local.time || {}).forEach(function (k) { if (k in S.time) S.time[k] = Math.max(S.time[k], local.time[k]); });
      Object.keys(local.visits || {}).forEach(function (k) { if (k in S.visits) S.visits[k] = Math.max(S.visits[k], local.visits[k]); });
      Object.keys(local.forfeit || {}).forEach(function (k) { if (k in S.ans) S.forfeit[k] = local.forfeit[k]; });
      S.review = local.review || {};
      S.tabSwitches = local.tabSwitches || 0; S.copyAttempts = local.copyAttempts || 0; S.shotAttempts = local.shotAttempts || 0;
      if (typeof local.idx === 'number' && local.idx < S.qs.length) S.idx = local.idx;
    }
    Object.keys(S.forfeit).forEach(function (k) { S.ans[k] = null; });
    if (S.perQ) {
      var i = S.idx;
      while (i < S.qs.length - 1 && S.time[S.qs[i].id] >= S.perQ) i++;
      S.idx = i;
      $('btn-prev').classList.add('hidden'); $('btn-review').classList.add('hidden');
      $('qtimer').classList.remove('hidden');
    }
    $('x-name').textContent = d.name || '';
    if (S.protect) enableProtection(d.watermark || d.name || '');
    buildPalette();
    show('exam');
    var start = S.forfeit[S.qs[S.idx].id] ? nextOpen(S.idx) : S.idx;
    go(start === -1 ? S.idx : start, true);
    tick(); S.timer = setInterval(tick, 200);
    S.saver = setInterval(function () { save(); }, 20000);
  }

  function isLost(i) { return !!S.forfeit[S.qs[i].id]; }
  /** Next question that is still open, searching forward then from the start. -1 if none. */
  function nextOpen(from) {
    for (var i = from + 1; i < S.qs.length; i++) if (!isLost(i)) return i;
    for (var j = 0; j < from; j++) if (!isLost(j)) return j;
    return -1;
  }
  function prevOpen(from) { for (var i = from - 1; i >= 0; i--) if (!isLost(i)) return i; return -1; }

  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function closeTiming() {
    if (S.enteredAt === null) return;
    var q = S.qs[S.idx];
    S.time[q.id] += (nowMs() - S.enteredAt) / 1000;
    S.enteredAt = nowMs();
  }
  function liveTime(q) { return S.time[q.id] + (S.enteredAt === null ? 0 : (nowMs() - S.enteredAt) / 1000); }

  function go(i, first) {
    if (!first) closeTiming();
    S.idx = i;
    var q = S.qs[i];
    if (!isLost(i)) S.visits[q.id] = (S.visits[q.id] || 0) + 1;
    S.enteredAt = isLost(i) ? null : nowMs();
    render(); persist();
    if (!first && window.innerWidth < 900) $('qcard').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function render() {
    var q = S.qs[S.idx], lost = isLost(S.idx);
    var sec = $('q-section'); sec.textContent = q.section === 'IQ' ? 'IQ' : 'General Knowledge'; sec.className = 'badge' + (q.section === 'GK' ? ' gk' : '');
    $('q-pos').textContent = 'Question ' + (S.idx + 1) + ' of ' + S.qs.length;
    $('q-body').classList.toggle('hidden', lost);
    $('q-forfeit').classList.toggle('hidden', !lost);
    $('btn-clear').disabled = lost; $('btn-review').disabled = lost;
    if (lost) {
      $('q-forfeit').textContent = 'This question was removed because ' + (REASONS[S.forfeit[q.id]] || 'a rule was broken') + '. It counts as skipped.';
      $('q-text').textContent = ''; $('q-options').innerHTML = ''; $('q-img').removeAttribute('src');
    } else {
      $('q-text').textContent = q.text;
      var img = $('q-img');
      if (q.image) { img.src = q.image; img.classList.remove('hidden'); } else { img.removeAttribute('src'); img.classList.add('hidden'); }

      drawTable($('q-match-wrap'), $('q-match'), q.table);

      var box = $('q-options'); box.innerHTML = '';
      q.options.forEach(function (o, k) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'opt' + (S.ans[q.id] === k ? ' sel' : '');
        b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', S.ans[q.id] === k ? 'true' : 'false');
        var l = document.createElement('span'); l.className = 'letter'; l.textContent = LETTERS[k]; b.appendChild(l);
        var body = document.createElement('span');
        if (o.image) { var im = document.createElement('img'); im.src = o.image; im.alt = 'Option ' + LETTERS[k]; im.draggable = false; body.appendChild(im); }
        if (o.text) { var t = document.createElement('span'); t.className = 'otext'; t.textContent = (o.image ? ' ' : '') + o.text; body.appendChild(t); }
        b.appendChild(body);
        b.onclick = function () { choose(k); };
        box.appendChild(b);
      });
    }

    var hasNext = nextOpenAfter(S.idx) !== -1;
    $('btn-prev').disabled = prevOpen(S.idx) === -1;
    $('btn-next').textContent = hasNext ? 'Next ›' : 'Finish';
    $('btn-review').textContent = S.review[q.id] ? 'Unmark review' : 'Mark for review';
    updatePalette();
  }
  function drawTable(wrap, table, t) {
    table.innerHTML = '';
    if (!t || !t.rows || !t.rows.length) { wrap.classList.add('hidden'); return; }
    var cols = Math.max.apply(null, t.rows.map(function (r) { return r.length; }).concat([(t.headers || []).length]));
    if (t.headers && t.headers.some(function (h) { return h; })) {
      var th = document.createElement('thead'), hr = document.createElement('tr');
      for (var c = 0; c < cols; c++) { var h = document.createElement('th'); h.textContent = t.headers[c] || ''; hr.appendChild(h); }
      th.appendChild(hr); table.appendChild(th);
    }
    var tb = document.createElement('tbody');
    t.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      for (var c = 0; c < cols; c++) { var td = document.createElement('td'); td.textContent = r[c] || ''; tr.appendChild(td); }
      tb.appendChild(tr);
    });
    table.appendChild(tb); wrap.classList.remove('hidden');
  }
  function nextOpenAfter(from) { for (var i = from + 1; i < S.qs.length; i++) if (!isLost(i)) return i; return -1; }

  function choose(k) {
    var q = S.qs[S.idx];
    if (isLost(S.idx)) return;
    S.ans[q.id] = k;
    render(); persist(); saveSoon();
  }

  function buildPalette() {
    var p = $('palette'); p.innerHTML = '';
    var lastSec = null, grid = null;
    S.qs.forEach(function (q, i) {
      if (q.section !== lastSec) {
        lastSec = q.section;
        var h = document.createElement('div'); h.className = 'sec-title'; h.textContent = q.section === 'IQ' ? 'IQ' : 'General Knowledge'; p.appendChild(h);
        grid = document.createElement('div'); grid.className = 'palette'; p.appendChild(grid);
      }
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pal'; b.textContent = i + 1; b.id = 'pal-' + i;
      if (S.perQ) b.disabled = true; else b.onclick = function () { if (!isLost(i)) go(i); };
      grid.appendChild(b);
    });
  }

  function updatePalette() {
    var answered = 0;
    S.qs.forEach(function (q, i) {
      var b = $('pal-' + i), a = S.ans[q.id] !== null && S.ans[q.id] !== undefined, lost = isLost(i);
      if (a && !lost) answered++;
      b.className = 'pal' + (lost ? ' lost' : S.review[q.id] ? ' review' : a ? ' answered' : S.visits[q.id] ? ' seen' : '') + (i === S.idx ? ' current' : '');
      b.disabled = lost || !!S.perQ;
      b.title = lost ? 'Removed' : '';
    });
    $('answered-count').textContent = answered + ' / ' + S.qs.length + ' answered';
    S.answered = answered;
  }

  function nextOrFinish(auto) {
    var n = nextOpenAfter(S.idx);
    if (n !== -1) { go(n); save(); }
    else if (S.perQ) submit(auto ? 'time_up' : 'manual');
    else askSubmit();
  }
  $('btn-prev').onclick = function () { var p = prevOpen(S.idx); if (!S.perQ && p !== -1) go(p); };
  $('btn-next').onclick = function () { nextOrFinish(false); };
  $('btn-clear').onclick = function () { var q = S.qs[S.idx]; if (isLost(S.idx)) return; S.ans[q.id] = null; render(); persist(); saveSoon(); };
  $('btn-review').onclick = function () { var q = S.qs[S.idx]; S.review[q.id] = !S.review[q.id]; render(); persist(); };
  $('btn-submit').onclick = askSubmit;

  function tick() {
    if (!S || S.done) return;
    var left = (S.endAt - Date.now()) / 1000;
    var t = $('timer'); t.textContent = fmt(left);
    t.className = 'timer' + (S.perQ ? '' : left <= 60 ? ' danger' : left <= 300 ? ' warn' : '');
    if (S.submitting) return;
    if (left <= 0) { submit('time_up'); return; }
    if (S.perQ && !isLost(S.idx)) {
      var q = S.qs[S.idx];
      var qLeft = S.perQ - liveTime(q);
      $('qtimer-text').textContent = Math.max(0, Math.ceil(qLeft)) + 's';
      $('qtimer-fill').style.width = Math.max(0, Math.min(100, qLeft / S.perQ * 100)) + '%';
      $('qtimer').classList.toggle('low', qLeft <= 3);
      if (qLeft <= 0) { $('confirm').classList.add('hidden'); nextOrFinish(true); }
    }
  }

  function payload() {
    closeTiming();
    return S.qs.map(function (q) {
      var it = { qid: q.id, selected: S.forfeit[q.id] ? null : S.ans[q.id], time: Math.round(S.time[q.id]), visits: S.visits[q.id] || 0 };
      if (S.forfeit[q.id]) it.forfeited = S.forfeit[q.id];
      return it;
    });
  }
  function flags() { return { tab_switches: S.tabSwitches, copy_attempts: S.copyAttempts, screenshot_attempts: S.shotAttempts }; }

  function persist() {
    if (!S) return;
    store('exam_state_' + S.token, JSON.stringify({ ans: S.ans, time: S.time, visits: S.visits, review: S.review, forfeit: S.forfeit, tabSwitches: S.tabSwitches, copyAttempts: S.copyAttempts, shotAttempts: S.shotAttempts, idx: S.idx }));
  }

  var saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 600); }

  function save() {
    if (!S || S.done || S.submitting) return;
    var st = $('save-state');
    var body = Object.assign({ token: S.token, responses: payload() }, flags());
    persist();
    st.textContent = 'Saving…';
    api('save.php', body).then(function (d) {
      if (d.status === 'submitted') { finish(d); return; }
      if (!d.ok) throw new Error(d.error);
      st.textContent = 'All answers saved';
      if (typeof d.remaining_seconds === 'number') S.endAt = Date.now() + d.remaining_seconds * 1000; // keep in step with the server clock
    }).catch(function () { st.textContent = 'Offline – answers kept on this device'; });
  }

  window.addEventListener('beforeunload', function (e) {
    if (S && !S.done) { persist(); e.preventDefault(); e.returnValue = ''; }
  });

  // ---------------- Protection ----------------
  // A web page cannot fully stop screenshots or a phone camera. This blocks the easy ways to copy,
  // removes the question on screen when a rule is broken, records every attempt, and marks the
  // screen with the student's name so a shared screenshot can be traced back.
  function active() { return S && !S.done && !S.submitting; }

  function violation(reason) {
    if (!active()) return;
    if (reason === 'left_page') S.tabSwitches++;
    else if (reason === 'screenshot') S.shotAttempts++;
    else S.copyAttempts++;
    if (!$('shield').classList.contains('hidden')) { persist(); return; } // one question per incident
    var i = S.idx, q = S.qs[i], removed = false;
    if (!isLost(i)) {
      closeTiming(); S.enteredAt = null;
      S.forfeit[q.id] = reason; S.ans[q.id] = null; S.review[q.id] = false; removed = true;
    }
    persist(); save();
    $('shield-title').textContent = removed ? 'Question ' + (i + 1) + ' removed' : 'Warning';
    $('shield-text').textContent = removed
      ? 'Question ' + (i + 1) + ' was removed because ' + REASONS[reason] + '. It counts as skipped and you cannot open it again. The timer keeps running.'
      : 'This was recorded because ' + REASONS[reason] + '. The timer keeps running.';
    $('shield').classList.remove('hidden');
    render();
  }
  $('shield-back').onclick = function () {
    $('shield').classList.add('hidden');
    if (!S || S.done) return;
    if (isLost(S.idx)) { var n = nextOpen(S.idx); if (n !== -1) go(n); else render(); }
  };

  function enableProtection(mark) {
    document.body.classList.add('protect');
    var wm = $('watermark'); wm.textContent = new Array(80).join(mark + '   '); wm.classList.remove('hidden');
    var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    document.addEventListener('copy', function (e) { if (active()) { e.preventDefault(); violation('copy'); } });
    document.addEventListener('cut', function (e) { if (active()) { e.preventDefault(); violation('copy'); } });
    // On phones a long press opens this menu by accident, so it is only blocked there, not punished.
    document.addEventListener('contextmenu', function (e) { if (active()) { e.preventDefault(); if (finePointer) violation('right_click'); } });
    ['selectstart', 'dragstart'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (active()) e.preventDefault(); }); });
    document.addEventListener('keydown', function (e) {
      if (!active()) return;
      var k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (k === 'printscreen' || (e.metaKey && e.shiftKey && ['3', '4', '5', 's'].indexOf(k) !== -1)) { e.preventDefault(); screenshotKey(); return; }
      if (mod && k === 'p') { e.preventDefault(); violation('print'); return; }
      if (mod && ['c', 'x', 'a', 's', 'u'].indexOf(k) !== -1) { e.preventDefault(); violation('copy'); return; }
      if (k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c'].indexOf(k) !== -1)) { e.preventDefault(); violation('devtools'); }
    });
    document.addEventListener('keyup', function (e) { if (active() && (e.key || '').toLowerCase() === 'printscreen') screenshotKey(); });
    window.addEventListener('beforeprint', function () { violation('print'); });
    window.addEventListener('blur', function () { violation('left_page'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) violation('left_page'); });
  }
  var lastShot = 0;
  function screenshotKey() {
    if (Date.now() - lastShot < 1500) return;
    lastShot = Date.now();
    try { if (navigator.clipboard) navigator.clipboard.writeText('Screenshots are not allowed during the exam.').catch(function () {}); } catch (e) {}
    violation('screenshot');
  }
  // Without protection, still count leaving the page.
  document.addEventListener('visibilitychange', function () {
    if (S && !S.done && document.hidden && !S.protect) { S.tabSwitches++; persist(); save(); }
  });

  // ---------------- Submit ----------------
  function askSubmit() {
    var open = S.qs.filter(function (q, i) { return !isLost(i); }).length;
    var un = open - (S.answered || 0);
    $('confirm-text').textContent = (un > 0
      ? 'You have ' + un + ' unanswered question' + (un > 1 ? 's' : '') + '.'
      : 'You have answered all available questions.') + ' You cannot change your answers after submitting.';
    $('confirm').classList.remove('hidden');
  }
  $('confirm-no').onclick = function () { $('confirm').classList.add('hidden'); };
  $('confirm-yes').onclick = function () { $('confirm').classList.add('hidden'); submit('manual'); };

  var lastReason = 'manual';
  function submit(reason) {
    if (S.done) return;
    lastReason = reason; S.submitting = true;
    clearTimeout(saveTimer);
    $('shield').classList.add('hidden');
    $('sub-title').textContent = reason === 'time_up' ? 'Time is up. Submitting…' : 'Submitting…';
    $('sub-text').textContent = 'Please wait and do not close this page.';
    $('sub-retry-row').classList.add('hidden');
    $('submitting').classList.remove('hidden');
    var body = Object.assign({ token: S.token, responses: payload(), reason: reason }, flags());
    persist();
    api('submit.php', body).then(function (d) {
      if (!d.ok) throw new Error(d.error || 'Submit failed');
      finish(d);
    }).catch(function (err) {
      $('sub-title').textContent = 'Could not submit';
      $('sub-text').textContent = (err.message === 'Failed to fetch' ? 'No internet connection.' : err.message) + ' Your answers are safe on this device. Check your connection and press Try again.';
      $('sub-retry-row').classList.remove('hidden');
    });
  }
  $('sub-retry').onclick = function () { S.submitting = false; submit(lastReason); };

  function finish(d) {
    if (S) {
      S.done = true; clearInterval(S.timer); clearInterval(S.saver);
      store('exam_state_' + S.token, null);
    }
    store(TOKEN_KEY, null); // so the next student on this device starts fresh
    $('submitting').classList.add('hidden'); $('shield').classList.add('hidden');
    document.body.classList.remove('protect');
    showDone(d);
  }

  // "2026-11-25 14:31:05" (Nepal time from the server) -> "2:31:05 PM" / "Wednesday, 25 November 2026"
  function parts(t) { var m = /(\d+)-(\d+)-(\d+)[ T](\d+):(\d+):(\d+)/.exec(t || ''); return m ? m.slice(1).map(Number) : null; }
  function clock(t, sec) { var p = parts(t); if (!p) return t || ''; var h = p[3] % 12 || 12; return h + ':' + (p[4] < 10 ? '0' : '') + p[4] + (sec ? ':' + (p[5] < 10 ? '0' : '') + p[5] : '') + ' ' + (p[3] < 12 ? 'AM' : 'PM'); }
  function longDate(t) { var p = parts(t); if (!p) return ''; var d = new Date(Date.UTC(p[0], p[1] - 1, p[2])); return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getUTCDay()] + ', ' + p[2] + ' ' + ['January','February','March','April','May','June','July','August','September','October','November','December'][p[1] - 1] + ' ' + p[0]; }

  function showDone(d) {
    $('d-name').textContent = d.name || '';
    var stats = [
      ['Started at', clock(d.started_at)], ['Time taken', fmt(d.total_seconds)], ['Questions answered', String(d.answered)]
    ];
    if (typeof d.score === 'number') stats.push(['Score', String(d.score)]);
    $('d-time').textContent = clock(d.submitted_at, true);
    $('d-date').textContent = longDate(d.submitted_at) + ' · Nepal time';
    var box = $('d-stats'); box.innerHTML = '';
    stats.forEach(function (s) { var el = document.createElement('div'); el.className = 'stat'; var b = document.createElement('b'); b.textContent = s[1]; var sm = document.createElement('small'); sm.textContent = s[0]; el.appendChild(b); el.appendChild(sm); box.appendChild(el); });
    show('done');
  }

  // ---------------- Boot ----------------
  var token = store(TOKEN_KEY);
  if (!API || API.indexOf('YOUR-DOMAIN') !== -1) {
    $('loading-text').textContent = 'Setup needed: set API_BASE in config.js.';
  } else if (token) {
    $('loading-text').textContent = 'Loading your exam…';
    api('resume.php', { token: token }).then(function (d) {
      if (d.ok && d.status === 'in_progress') { d.token = token; startExam(d); }
      else if (d.ok && d.status === 'submitted') { finish(d); }
      else { store(TOKEN_KEY, null); show('register'); loadInfo().catch(function () {}); }
    }).catch(function () {
      $('loading-text').textContent = 'Could not reach the server. Check your internet and reload this page.';
    });
  } else {
    show('register'); loadInfo().catch(function () {});
  }
})();
