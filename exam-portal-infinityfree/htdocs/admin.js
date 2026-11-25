(function () {
  'use strict';
  var API = ((window.EXAM_CONFIG || {}).API_BASE || '').replace(/\/+$/, '');
  var $ = function (id) { return document.getElementById(id); };
  var LET = 'ABCDEFGHIJ';
  var KEY = 'exam_admin_key';
  var key = '';
  try { key = sessionStorage.getItem(KEY) || ''; } catch (e) {}

  function call(action, method, body, isForm) {
    var h = { 'X-Admin-Key': key };
    if (body && !isForm) h['Content-Type'] = 'application/json';
    return fetch(API + '/admin.php?action=' + action, {
      method: method || 'GET', cache: 'no-store', headers: h,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined
    });
  }
  function json(action, method, body, isForm) {
    return call(action, method, body, isForm).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'Server error (' + r.status + ')' }; }).then(function (d) {
        if (r.status === 401) { signOut(); throw new Error(d.error || 'Wrong password'); }
        return d;
      });
    });
  }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text !== undefined && text !== null) e.textContent = text; if (cls) e.className = cls; return e; }
  function fmt(s) { if (s === null || s === undefined) return ''; return Math.floor(s / 60) + 'm ' + (s % 60) + 's'; }
  function msg(box, cls, text) { box.className = 'msg ' + cls; box.textContent = text; box.classList.remove('hidden'); }
  function imgUrl(v) { v = (v || '').trim(); if (!v) return ''; return /^(https?:)?\/\//i.test(v) || v.indexOf('/') !== -1 ? v : 'uploads/' + v; }

  // ---------- login ----------
  $('login-form').onsubmit = function (e) {
    e.preventDefault();
    key = $('pw').value;
    json('results').then(function (d) {
      if (!d.ok) throw new Error(d.error);
      try { sessionStorage.setItem(KEY, key); } catch (e2) {}
      enter(d);
    }).catch(function (err) { msg($('login-msg'), 'err', err.message); });
  };
  function signOut() { key = ''; try { sessionStorage.removeItem(KEY); } catch (e) {} $('app').classList.add('hidden'); $('login').classList.remove('hidden'); }
  $('logout').onclick = signOut;
  function enter(d) { $('login').classList.add('hidden'); $('app').classList.remove('hidden'); drawResults(d.results); loadImages(); }

  // ---------- tabs ----------
  function openTab(name) {
    document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-tab') === name); });
    document.querySelectorAll('[data-panel]').forEach(function (p) { p.classList.toggle('hidden', p.getAttribute('data-panel') !== name); });
    if (name === 'questions') loadQuestions();
    if (name === 'results') loadResults();
    if (name === 'pictures') loadImages();
  }
  document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { openTab(t.getAttribute('data-tab')); }; });

  // ---------- results ----------
  function loadResults() { json('results').then(function (d) { if (d.ok) drawResults(d.results); else $('summary').textContent = d.error; }); }
  $('refresh').onclick = loadResults;

  function drawResults(rows) {
    var tb = document.querySelector('#results tbody'); tb.innerHTML = '';
    var done = rows.filter(function (r) { return r.status === 'submitted'; }).length;
    $('summary').textContent = rows.length + ' registered, ' + done + ' submitted, ' + (rows.length - done) + ' still taking the exam';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      var how = r.status !== 'submitted' ? 'In progress' : r.submit_reason === 'manual' ? 'Student' : r.submit_reason === 'time_up' ? 'Time up (auto)' : 'Closed (left page)';
      [r.rank || '–', r.name, r.phone, r.email, r.address, r.score === null ? '' : r.score + ' / ' + r.total_questions, r.iq_score, r.gk_score,
        r.answered, r.started_at, r.submitted_at, r.total_time, how, r.tab_switches, r.copy_attempts, r.screenshot_attempts, r.removed].forEach(function (v, i) {
        var td = el('td', v === null || v === undefined ? '' : String(v)); if (i === 4) td.className = 'wrap';
        if (i >= 13 && v > 0) td.className = 'wrong';
        tr.appendChild(td);
      });
      var act = document.createElement('td');
      var v = el('button', 'Answers', 'btn small'); v.onclick = function () { openDetail(r); };
      var del = el('button', 'Delete', 'btn small danger'); del.style.marginLeft = '6px';
      del.onclick = function () {
        if (!confirm('Delete ' + r.name + ' and all their answers? They will be able to take the exam again. This cannot be undone.')) return;
        json('delete_participant', 'POST', { id: r.id }).then(loadResults);
      };
      act.appendChild(v); act.appendChild(del); tr.appendChild(act);
      tb.appendChild(tr);
    });
  }

  function openDetail(r) {
    $('detail-title').textContent = r.name + ' – ' + (r.score === null ? 'in progress' : r.score + ' correct, ' + r.total_time);
    var tb = $('detail-body'); tb.innerHTML = '<tr><td colspan="8">Loading…</td></tr>';
    $('detail').classList.remove('hidden');
    json('detail&id=' + r.id).then(function (d) {
      tb.innerHTML = '';
      (d.answers || []).forEach(function (a) {
        var tr = document.createElement('tr');
        [a.no, a.section, a.question, a.selected || '–', a.correct, a.removed ? 'Removed: ' + a.removed : a.selected ? (a.is_correct ? 'Right' : 'Wrong') : 'Skipped', fmt(a.time_seconds), a.visits].forEach(function (v, i) {
          var td = el('td', String(v)); if (i === 2) td.className = 'wrap'; if (i === 5) td.className = a.is_correct ? 'right' : (a.selected || a.removed) ? 'wrong' : ''; tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
    });
  }
  $('detail-close').onclick = function () { $('detail').classList.add('hidden'); };

  function download(action, name) {
    call(action).then(function (r) { if (!r.ok) throw new Error('Download failed'); return r.blob(); }).then(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (e) { $('summary').textContent = e.message; });
  }
  $('csv').onclick = function () { download('csv', 'exam-results.csv'); };
  $('csv-detail').onclick = function () { download('csv_detail', 'exam-answers-detail.csv'); };

  // ---------- question list ----------
  var QUESTIONS = [];
  function loadQuestions() {
    json('questions').then(function (d) {
      QUESTIONS = d.questions || [];
      drawQuestions();
    });
  }
  function drawQuestions() {
    var list = $('qlist'); list.innerHTML = '';
    var iq = 0, gk = 0, off = 0, shown = 0;
    var term = $('q-search').value.trim().toLowerCase(), f = $('q-filter').value;
    QUESTIONS.forEach(function (q, i) {
      if (!q.active) off++; else if (q.section === 'IQ') iq++; else gk++;
      if (f === 'IQ' || f === 'GK') { if (q.section !== f) return; }
      if (f === 'match' && q.type !== 'match') return;
      if (f === 'hidden' && q.active) return;
      if (term) {
        var hay = [q.text, q.image].concat(q.options.map(function (o) { return o.text + ' ' + o.image; })).concat(q.table ? q.table.rows.map(function (r) { return r.join(' '); }) : []).join(' ').toLowerCase();
        if (hay.indexOf(term) === -1) return;
      }
      shown++;
      list.appendChild(questionCard(q, i + 1, function () { openEditor(q); }));
    });
    if (!QUESTIONS.length) list.appendChild(el('p', 'No questions yet. Use "Upload questions" or "+ Add a question".', 'sub'));
    else if (!shown) list.appendChild(el('p', 'No questions match.', 'sub'));
    $('qsummary').textContent = iq + ' IQ + ' + gk + ' GK = ' + (iq + gk) + ' questions shown to students' + (off ? ' (' + off + ' hidden)' : '') + '. Correct answers are in green. Press Edit to fix a question or its pictures.';
  }
  $('q-search').oninput = drawQuestions;
  $('q-filter').onchange = drawQuestions;

  function questionCard(q, n, onEdit, error) {
    var c = el('div', null, 'qcard-a' + (q.active === false ? ' inactive' : '') + (error ? ' preview-bad' : onEdit ? '' : ' preview-ok'));
    if (onEdit) { var acts = el('div', null, 'qactions'); var e = el('button', 'Edit', 'btn small'); e.onclick = onEdit; acts.appendChild(e); c.appendChild(acts); }
    c.appendChild(el('div', n + '. ' + (q.section === 'IQ' ? 'IQ' : q.section === 'GK' ? 'GK' : 'Section missing') + (q.type === 'match' ? ' · match the following' : '') + (q.active === false ? ' · hidden' : ''), 'sub'));
    if (error) c.appendChild(el('div', error, 'msg err'));
    c.appendChild(el('p', q.text || '(no question text)', 'qtext'));
    var qi = q.image_url || imgUrl(q.image);
    if (qi) { var im = document.createElement('img'); im.src = qi; im.className = 'qimg'; im.alt = q.image; c.appendChild(im); }
    if (q.table && q.table.rows && q.table.rows.length) {
      var t = el('table', null, 'match'), cols = Math.max.apply(null, q.table.rows.map(function (r) { return r.length; }).concat([(q.table.headers || []).length]));
      if ((q.table.headers || []).some(function (h) { return h; })) {
        var hr = document.createElement('tr'); for (var hc = 0; hc < cols; hc++) hr.appendChild(el('th', q.table.headers[hc] || ''));
        var th = document.createElement('thead'); th.appendChild(hr); t.appendChild(th);
      }
      var tb = document.createElement('tbody');
      q.table.rows.forEach(function (r) { var tr = document.createElement('tr'); for (var cc = 0; cc < cols; cc++) tr.appendChild(el('td', r[cc] || '')); tb.appendChild(tr); });
      t.appendChild(tb); var tw = el('div', null, 'match-wrap'); tw.appendChild(t); c.appendChild(tw);
    }
    (q.options || []).forEach(function (o, k) {
      var p = el('div', LET[k] + '. ' + (o.text || ''));
      if (o.image) { var oi = document.createElement('img'); oi.src = imgUrl(o.image); oi.alt = o.image; oi.style.maxHeight = '60px'; oi.style.verticalAlign = 'middle'; oi.style.marginLeft = '6px'; p.appendChild(oi); }
      if (LET[k] === String(q.answer).toUpperCase()) p.className = 'ans';
      c.appendChild(p);
    });
    return c;
  }

  // ---------- editor ----------
  var editing = null;
  function picOptions(select, value) {
    select.innerHTML = '';
    var none = el('option', '— no picture —'); none.value = ''; select.appendChild(none);
    var names = IMAGES.map(function (i) { return i.name; });
    if (value && names.indexOf(value) === -1) names.unshift(value);
    names.forEach(function (n) { var o = el('option', n); o.value = n; select.appendChild(o); });
    select.value = value || '';
  }
  /** Picture chooser: list of uploaded pictures + preview + upload button. */
  function picField(value) {
    var box = el('div', null, 'picfield');
    var sel = document.createElement('select'); sel.className = 'pic-select';
    var th = document.createElement('img'); th.className = 'thumb'; th.alt = '';
    var up = el('label', 'Upload', 'btn small'); var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true; up.appendChild(inp);
    function sync() { var v = sel.value; th.src = v ? imgUrl(v) : ''; th.style.visibility = v ? 'visible' : 'hidden'; }
    picOptions(sel, value); sync();
    sel.onchange = sync;
    inp.onchange = function () {
      if (!inp.files.length) return;
      up.firstChild.textContent = '…';
      uploadFiles(inp.files).then(function (saved) {
        document.querySelectorAll('#editor .pic-select').forEach(function (s2) { if (s2 !== sel) picOptions(s2, s2.value); });
        picOptions(sel, saved[0] || sel.value); sync(); up.firstChild.textContent = 'Upload'; inp.value = '';
      });
    };
    box.appendChild(sel); box.appendChild(th); box.appendChild(up);
    box.getValue = function () { return sel.value; };
    return box;
  }
  function optionRow(k, o) {
    var row = el('div', null, 'optrow');
    row.appendChild(el('span', LET[k], 'letter'));
    var t = document.createElement('input'); t.className = 'otext-in'; t.placeholder = 'Option ' + LET[k] + (k < 2 ? ' text' : ' (optional)'); t.value = o ? o.text || '' : '';
    var pf = picField(o ? o.image : ''); pf.classList.add('oimg');
    row.appendChild(t); row.appendChild(pf);
    return row;
  }
  function markCorrect() {
    var v = LET.indexOf($('ed-answer').value);
    document.querySelectorAll('#ed-options .optrow').forEach(function (r, k) { r.classList.toggle('correct', k === v); });
  }
  $('ed-answer').onchange = markCorrect;
  function fillAnswer(selected) {
    var a = $('ed-answer'); a.innerHTML = '';
    for (var k = 0; k < 6; k++) { var o = el('option', LET[k]); o.value = LET[k]; a.appendChild(o); }
    a.value = selected || 'A';
  }
  function openEditor(q) {
    editing = q || null;
    $('ed-title').textContent = q ? 'Edit question' : 'Add a question';
    $('ed-section').value = q ? q.section : 'IQ';
    $('ed-type').value = q ? q.type : 'single';
    $('ed-text').value = q ? q.text : '';
    var f = $('ed-image-field'); f.innerHTML = ''; var qpf = picField(q ? q.image : ''); qpf.id = 'ed-image'; f.appendChild(qpf);
    $('ed-thead').value = q && q.table ? (q.table.headers || []).join(' | ') : '';
    $('ed-trows').value = q && q.table ? q.table.rows.map(function (r) { return r.join(' | '); }).join('\n') : '';
    var box = $('ed-options'); box.innerHTML = '';
    for (var k = 0; k < 6; k++) box.appendChild(optionRow(k, q && q.options[k]));
    fillAnswer(q ? q.answer : 'A'); markCorrect();
    $('ed-active').checked = q ? q.active !== false : true;
    $('ed-delete').classList.toggle('hidden', !q);
    $('ed-msg').classList.add('hidden');
    $('editor').classList.remove('hidden');
    $('ed-text').focus();
  }
  $('q-add').onclick = function () { openEditor(null); };
  $('ed-close').onclick = function () { $('editor').classList.add('hidden'); };
  $('ed-save').onclick = function () {
    var opts = [];
    document.querySelectorAll('#ed-options .optrow').forEach(function (r) {
      opts.push({ text: r.querySelector('.otext-in').value.trim(), image: r.querySelector('.oimg').getValue() });
    });
    while (opts.length && !opts[opts.length - 1].text && !opts[opts.length - 1].image) opts.pop();
    if (opts.some(function (o) { return !o.text && !o.image; })) { msg($('ed-msg'), 'err', 'An option in the middle is empty. Fill it or move the options up.'); return; }
    var body = {
      id: editing ? editing.id : 0, section: $('ed-section').value, type: $('ed-type').value, text: $('ed-text').value.trim(),
      image: $('ed-image').getValue(), options: opts, answer: $('ed-answer').value, active: $('ed-active').checked,
      table: tableFrom($('ed-thead').value, $('ed-trows').value)
    };
    json('save_question', 'POST', body).then(function (d) {
      if (!d.ok) { msg($('ed-msg'), 'err', d.error); return; }
      $('editor').classList.add('hidden'); loadQuestions();
    });
  };
  $('ed-delete').onclick = function () {
    if (!editing || !confirm('Delete this question?')) return;
    json('delete_question', 'POST', { id: editing.id }).then(function (d) {
      if (d.message) alert(d.message);
      $('editor').classList.add('hidden'); loadQuestions();
    });
  };
  function splitCols(line) { return line.split('|').map(function (c) { return c.trim(); }); }
  function tableFrom(head, body) {
    var rows = lines(body).map(splitCols);
    if (!rows.length) return null;
    var h = (head || '').trim() ? splitCols(head) : [];
    return { headers: h, rows: rows };
  }
  /** Turns List I / List II lists into a table. */
  function withTable(q) {
    if (!q.table && ((q.match_left || []).length || (q.match_right || []).length)) {
      var n = Math.max(q.match_left.length, q.match_right.length), rows = [];
      for (var i = 0; i < n; i++) rows.push([q.match_left[i] || '', q.match_right[i] || '']);
      q.table = { headers: ['List I', 'List II'], rows: rows };
    }
    if (q.table && !q.table.rows.length) q.table = null;
    delete q.match_left; delete q.match_right;
    return q;
  }
  function lines(t) { return t.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean); }

  // ---------- pictures ----------
  var IMAGES = [];
  function loadImages() {
    return json('list_images').then(function (d) {
      IMAGES = d.images || [];
      var box = $('thumbs'); box.innerHTML = '';
      IMAGES.forEach(function (i) {
        var f = document.createElement('figure'); var im = document.createElement('img'); im.src = i.url + '?v=' + Date.now(); im.alt = i.name;
        f.appendChild(im); f.appendChild(el('figcaption', i.name));
        var del = el('button', 'Delete', 'btn small danger'); del.style.marginTop = '6px';
        del.onclick = function () {
          if (!confirm('Delete the picture ' + i.name + '? Questions using it will show no picture.')) return;
          json('delete_image', 'POST', { name: i.name }).then(loadImages);
        };
        f.appendChild(del); box.appendChild(f);
      });
      if (!IMAGES.length) box.appendChild(el('p', 'No pictures uploaded yet.', 'sub'));
    });
  }
  function uploadFiles(files) {
    var fd = new FormData();
    Array.prototype.forEach.call(files, function (f) { fd.append('files[]', f); });
    return json('upload_image', 'POST', fd, true).then(function (d) {
      var txt = (d.saved && d.saved.length ? 'Uploaded: ' + d.saved.join(', ') + '. ' : '') + (d.errors && d.errors.length ? 'Problems: ' + d.errors.join('; ') : '');
      msg($('pmsg'), d.errors && d.errors.length ? 'err' : 'ok', txt || d.error || 'Done');
      return loadImages().then(function () { return d.saved || []; });
    });
  }
  function dropzone(zone, input, handler) {
    input.onchange = function () { if (input.files.length) handler(input.files); input.value = ''; };
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('over'); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('over'); if (e.dataTransfer.files.length) handler(e.dataTransfer.files); });
  }
  dropzone($('pdrop'), $('pfile'), uploadFiles);
  // ---------- upload questions: shared preview ----------
  var PENDING = [];
  function preview(questions, source) {
    PENDING = questions;
    var box = $('preview'); box.innerHTML = '';
    var bad = 0, iq = 0, gk = 0;
    questions.forEach(function (q, i) {
      var err = checkQuestion(q);
      if (err) bad++; else if (q.section === 'IQ') iq++; else gk++;
      box.appendChild(questionCard(q, i + 1, null, err));
    });
    $('preview-card').classList.remove('hidden');
    $('preview-title').textContent = 'Preview: ' + questions.length + ' questions from ' + source;
    if (!questions.length) msg($('preview-msg'), 'err', 'No questions were found. Check the format and try again.');
    else if (bad) msg($('preview-msg'), 'err', bad + ' question(s) have problems (marked in red). Fix them in your file or text and check again. Nothing has been saved yet.');
    else msg($('preview-msg'), 'ok', 'All good: ' + iq + ' IQ and ' + gk + ' GK questions. Check that the green answers are right, then press "Save these questions".');
    $('do-import').disabled = !!bad || !questions.length;
    $('preview-card').scrollIntoView({ behavior: 'smooth' });
  }
  function checkQuestion(q) {
    if (q.section !== 'IQ' && q.section !== 'GK') return 'Section must be IQ or GK.';
    if (!q.text) return 'The question text is empty.';
    if (q.options.length < 2) return 'Needs at least 2 options.';
    if (q.options.length > 6) return 'At most 6 options.';
    var idx = LET.indexOf(String(q.answer || '').toUpperCase());
    if (!q.answer || idx < 0 || idx >= q.options.length) return 'Correct answer is missing or not one of the options (' + LET.slice(0, q.options.length).split('').join(', ') + ').';
    if (q.type === 'match' && !(q.table && q.table.rows.length)) return 'Match question needs a table (List I and List II).';
    return '';
  }
  $('do-import').onclick = function () {
    var mode = $('mode').value;
    if (mode === 'replace' && !confirm('Delete all current questions and replace them with these ' + PENDING.length + '?')) return;
    var b = this; b.disabled = true;
    json('import', 'POST', { mode: mode, questions: PENDING }).then(function (d) {
      if (!d.ok) { b.disabled = false; msg($('preview-msg'), 'err', d.error); return; }
      msg($('preview-msg'), 'ok', 'Saved ' + d.imported + ' questions. Students now get ' + (d.counts.IQ || 0) + ' IQ and ' + (d.counts.GK || 0) + ' GK questions.');
      $('preview').innerHTML = ''; PENDING = [];
    }).catch(function (e) { b.disabled = false; msg($('preview-msg'), 'err', e.message); });
  };

  // ---------- Excel / CSV ----------
  var IMG_RE = /^[^\s]+\.(png|jpe?g|gif|webp|svg)$/i;
  function cellOption(v) { v = String(v == null ? '' : v).trim(); return IMG_RE.test(v) ? { text: '', image: v } : { text: v, image: '' }; }
  function normSection(v) {
    v = String(v || '').trim().toUpperCase();
    if (v.indexOf('IQ') === 0 || v.indexOf('INTELL') === 0 || v.indexOf('REASON') === 0 || v.indexOf('MENTAL') === 0) return 'IQ';
    if (v.indexOf('GK') === 0 || v.indexOf('GENERAL') === 0) return 'GK';
    return v;
  }
  function normAnswer(v, opts) {
    v = String(v == null ? '' : v).trim();
    var m = v.match(/^(?:option\s*)?\(?([a-f])\)?\.?$/i); if (m) return m[1].toUpperCase();
    if (/^[1-6]$/.test(v)) return LET[+v - 1];
    for (var k = 0; k < opts.length; k++) if (opts[k].text && opts[k].text.toLowerCase() === v.toLowerCase()) return LET[k];
    return v.toUpperCase();
  }
  function splitList(v) { return String(v == null ? '' : v).split(/\r?\n|\|/).map(function (s) { return s.trim(); }).filter(Boolean); }

  function rowsToQuestions(rows) {
    var h = -1, map = {};
    for (var r = 0; r < Math.min(rows.length, 10); r++) {
      var m = { opts: [] };
      (rows[r] || []).forEach(function (c, i) {
        var n = String(c || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        var o = n.match(/^option([a-f1-6])$/);
        if (n === 'section' || n === 'category' || n === 'subject') m.section = i;
        else if (n === 'type' || n === 'questiontype') m.type = i;
        else if (n === 'question' || n === 'questiontext') m.text = i;
        else if (n === 'picture' || n === 'image' || n === 'questionpicture' || n === 'questionimage') m.image = i;
        else if (n === 'listi' || n === 'list1' || n === 'lista') m.left = i;
        else if (n === 'listii' || n === 'list2' || n === 'listb') m.right = i;
        else if (/^(correct)?answer$|^correctoption$|^correct$/.test(n)) m.answer = i;
        else if (n === 'table') m.table = i;
        else if (o) m.opts[isNaN(o[1]) ? LET.indexOf(o[1].toUpperCase()) : (+o[1] - 1)] = i;
      });
      if (m.text !== undefined) { h = r; map = m; break; }
    }
    if (h < 0) throw new Error('Could not find a "Question" column. Please use the template.');
    var out = [];
    for (var i = h + 1; i < rows.length; i++) {
      var row = rows[i] || [];
      var cell = function (c) { return c === undefined ? '' : String(row[c] == null ? '' : row[c]).trim(); };
      var text = cell(map.text);
      var opts = [];
      map.opts.forEach(function (c, k) { if (c !== undefined) opts[k] = cellOption(row[c]); });
      opts = opts.filter(function (o) { return o && (o.text || o.image); });
      if (!text && !opts.length) continue; // blank row
      var left = map.left !== undefined ? splitList(row[map.left]) : [];
      var right = map.right !== undefined ? splitList(row[map.right]) : [];
      out.push({
        section: normSection(cell(map.section)), type: /match/i.test(cell(map.type)) || left.length ? 'match' : 'single', text: text,
        image: cell(map.image), match_left: left, match_right: right, options: opts,
        table: map.table !== undefined && cell(map.table) ? (function (v) { var ls = lines(v); return tableFrom(ls[0], ls.slice(1).join('\n')); })(cell(map.table)) : null,
        answer: normAnswer(cell(map.answer), opts)
      });
      if (/match/i.test(cell(map.type))) out[out.length - 1].type = 'match';
    }
    return out.map(withTable);
  }
  function readFile(file) {
    $('preview-card').classList.remove('hidden');
    if (typeof XLSX === 'undefined') { msg($('preview-msg'), 'err', 'The Excel reader did not load. Check your internet and reload the page.'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(fr.result), { type: 'array' });
        var name = wb.SheetNames.indexOf('Questions') !== -1 ? 'Questions' : wb.SheetNames[0];
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
        preview(rowsToQuestions(rows), file.name);
      } catch (e) { $('preview').innerHTML = ''; $('do-import').disabled = true; msg($('preview-msg'), 'err', 'Could not read this file: ' + e.message); }
    };
    fr.readAsArrayBuffer(file);
  }
  dropzone($('drop'), $('qfile'), function (files) { readFile(files[0]); });

  // ---------- typed / pasted text ----------
  function parseText(src) {
    var out = [], section = '', q = null, mode = 'text', m;
    function push() { if (q) out.push(q); q = null; }
    src.replace(/\r/g, '').split('\n').forEach(function (raw) {
      var line = raw.replace(/ /g, ' ').trim();
      if (!line) return;
      // section header: [IQ], IQ:, Section: GK, [General Knowledge]
      if ((m = line.match(/^\[?\s*(?:section\s*[:\-]?\s*)?(IQ|GK|general knowledge|intelligence)\s*\]?\s*:?$/i))) { push(); section = normSection(m[1]); mode = 'text'; return; }
      var inList = q && (mode === 'left' || mode === 'right' || (mode === 'table' && line.indexOf('|') !== -1));
      // new question: 1. / 1) / Q1. / Question 1:
      if (!inList && (m = line.match(/^(?:Q(?:uestion)?\s*)?(\d+)\s*[.)\]:]\s*(.*)$/i))) {
        push(); q = { section: section, type: 'single', text: m[2], image: '', match_left: [], match_right: [], options: [], answer: '' }; mode = 'text'; return;
      }
      if (!q) return;
      if ((m = line.match(/^(?:correct\s*)?(?:answer|ans)\s*[:.\-]\s*(.+)$/i))) { q.answer = normAnswer(m[1], q.options); mode = 'done'; return; }
      if ((m = line.match(/^(?:picture|image|img)\s*[:\-]\s*(.+)$/i))) { if (mode === 'opts' && q.options.length) q.options[q.options.length - 1].image = m[1].trim(); else q.image = m[1].trim(); return; }
      if (/^table\s*:?$/i.test(line)) { mode = 'table'; q.table = { headers: [], rows: [] }; return; }
      if (mode === 'table' && line.indexOf('|') !== -1) { if (!q.table.headers.length && !q.table.rows.length) q.table.headers = splitCols(line); else q.table.rows.push(splitCols(line)); return; }
      if (/^(list|column)\s*(i|1)\s*:?$/i.test(line)) { q.type = 'match'; mode = 'left'; return; }
      if (/^(list|column)\s*(ii|2)\s*:?$/i.test(line)) { q.type = 'match'; mode = 'right'; return; }
      if (mode === 'left') { q.match_left.push(line); return; }
      var opt = line.match(/^\(?([a-fA-F])\s*[.)\]:]\s*(.*)$/);
      if (mode === 'right' && !opt) { q.match_right.push(line); return; }
      if (opt) {
        var o = opt[2].trim();
        q.options.push(IMG_RE.test(o) ? { text: '', image: o } : { text: o, image: '' }); mode = 'opts'; return;
      }
      if (mode === 'text') { q.text += (q.text ? '\n' : '') + line; return; }
      if (mode === 'opts' && q.options.length) q.options[q.options.length - 1].text += ' ' + line;
    });
    push();
    return out.map(withTable);
  }
  var TEXT_EXAMPLE = [
    '[IQ]',
    '1. What number comes next in the series?',
    '2, 6, 12, 20, 30, ?',
    'A. 36', 'B. 40', 'C. 42', 'D. 48',
    'Answer: C', '',
    '2. Which figure has four equal sides?',
    'A. shape-triangle.svg', 'B. shape-square.svg', 'C. shape-circle.svg',
    'Answer: B', '',
    '[GK]',
    '3. What is the capital city of Nepal?',
    'A. Pokhara', 'B. Kathmandu', 'C. Biratnagar', 'D. Lalitpur',
    'Answer: B', '',
    '4. Match each planet with its description.',
    'List I:', 'A. Mercury', 'B. Jupiter', 'C. Mars', 'D. Saturn',
    'List II:', '1. The Red Planet', '2. The largest planet', '3. Famous for its rings', '4. Closest to the Sun',
    'A. A-1, B-2, C-3, D-4', 'B. A-4, B-3, C-1, D-2', 'C. A-4, B-2, C-1, D-3', 'D. A-2, B-4, C-1, D-3',
    'Answer: C'
  ].join('\n');
  $('text-example').onclick = function () { $('qtext').value = TEXT_EXAMPLE; };
  $('text-check').onclick = function () { preview(parseText($('qtext').value), 'the text box'); };

  // ---------- boot ----------
  if (key) json('results').then(function (d) { if (d.ok) enter(d); }).catch(function () {});
})();
