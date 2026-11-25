<?php
// Admin API. Every request needs the header X-Admin-Key: <admin_password from config.php>
//   GET  ?action=results            ranked results
//   GET  ?action=detail&id=N        one student's answers and per-question time
//   GET  ?action=csv                results as CSV
//   GET  ?action=csv_detail         every answer of every student as CSV
//   GET  ?action=questions          all questions with correct answers
//   POST ?action=import             {mode:'append'|'replace', questions:[...]}
//   POST ?action=delete_participant {id}  lets a student take the exam again
//   POST ?action=save_question      add or edit one question
//   POST ?action=delete_question    {id}
//   POST ?action=upload_image       multipart files[] -> saved in /uploads
//   GET  ?action=list_images
require __DIR__ . '/lib.php';
cors();
require_admin();
$pdo = db();
$action = $_GET['action'] ?? '';
$LETTERS = ['A','B','C','D','E','F','G','H','I','J'];

/** Checks one question; returns an error text or the row for the database. */
function validate_question(array $q, int $n) {
    global $LETTERS;
    $section = strtoupper(trim((string)($q['section'] ?? '')));
    $type = strtolower(trim((string)($q['type'] ?? 'single'))) ?: 'single';
    $text = trim((string)($q['text'] ?? ''));
    $opts = array_values(array_filter(is_array($q['options'] ?? null) ? $q['options'] : [], function ($o) {
        return is_array($o) ? (trim((string)($o['text'] ?? '')) !== '' || trim((string)($o['image'] ?? '')) !== '') : trim((string)$o) !== '';
    }));
    $ans = $q['answer'] ?? null;
    if (!in_array($section, ['IQ', 'GK'], true)) return "Q$n: section must be IQ or GK";
    if (!in_array($type, ['single', 'match'], true)) return "Q$n: type must be single or match";
    if ($text === '') return "Q$n: the question text is empty";
    if (count($opts) < 2 || count($opts) > 6) return "Q$n: needs 2 to 6 options";
    $idx = is_int($ans) ? $ans : array_search(strtoupper(trim((string)$ans)), $LETTERS, true);
    if ($idx === false || $idx < 0 || $idx >= count($opts)) return "Q$n: the correct answer must be a letter from A to " . $LETTERS[count($opts) - 1];
    // Table: either {"headers":[], "rows":[[]]} or the older List I / List II lists.
    $t = $q['table'] ?? null;
    if (is_array($t) && isset($t['rows'])) {
        $table = question_table(json_encode(['headers' => $t['headers'] ?? [], 'rows' => $t['rows']], JSON_UNESCAPED_UNICODE), null);
    } else {
        $L = array_values(array_filter(array_map('trim', (array)($q['match_left'] ?? [])), 'strlen'));
        $R = array_values(array_filter(array_map('trim', (array)($q['match_right'] ?? [])), 'strlen'));
        $table = ($L || $R) ? question_table(json_encode($L, JSON_UNESCAPED_UNICODE), json_encode($R, JSON_UNESCAPED_UNICODE)) : null;
    }
    if ($type === 'match' && !$table) return "Q$n: match questions need a table (List I and List II)";
    $ml = $table ? json_encode($table, JSON_UNESCAPED_UNICODE) : null;
    $mr = null;
    return [$section, $type, $text, trim((string)($q['image'] ?? '')) ?: null, $ml, $mr,
        json_encode(decode_options(json_encode($opts)), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (int)$idx, $n];
}

function fmt_secs(?int $s): string { if ($s === null) return ''; return sprintf('%d:%02d', intdiv($s, 60), $s % 60); }

function ranked_results(): array {
    close_expired_attempts();
    $rows = db()->query('SELECT p.id, p.name, p.phone, p.email, p.address, p.created_at,
            a.started_at, a.deadline_at, a.submitted_at, a.submit_reason, a.score, a.iq_score, a.gk_score, a.answered, a.total_seconds, a.tab_switches, a.copy_attempts, a.screenshot_attempts,
            a.question_ids, (SELECT COUNT(*) FROM responses r WHERE r.attempt_id = a.id AND r.forfeited IS NOT NULL) AS removed
            FROM participants p LEFT JOIN attempts a ON a.participant_id = p.id')->fetchAll();
    usort($rows, function ($x, $y) {
        $dx = $x['submitted_at'] !== null; $dy = $y['submitted_at'] !== null;
        if ($dx !== $dy) return $dx ? -1 : 1;
        // Highest score first; equal scores: earlier submission ranks higher.
        return [(int)$y['score'], (string)$x['submitted_at'], (int)$x['total_seconds']] <=> [(int)$x['score'], (string)$y['submitted_at'], (int)$y['total_seconds']];
    });
    $rank = 0; $out = [];
    foreach ($rows as $r) {
        $done = $r['submitted_at'] !== null;
        $out[] = [
            'rank' => $done ? ++$rank : null,
            'id' => (int)$r['id'], 'name' => $r['name'], 'phone' => $r['phone'], 'email' => $r['email'], 'address' => $r['address'],
            'status' => $done ? 'submitted' : 'in_progress',
            'submit_reason' => $r['submit_reason'],
            'score' => $done ? (int)$r['score'] : null,
            'iq_score' => $done ? (int)$r['iq_score'] : null,
            'gk_score' => $done ? (int)$r['gk_score'] : null,
            'answered' => $done ? (int)$r['answered'] : null,
            'total_questions' => count(json_decode($r['question_ids'] ?? '[]', true) ?: []),
            'started_at' => npt($r['started_at']),
            'submitted_at' => npt($r['submitted_at']),
            'total_seconds' => $done ? (int)$r['total_seconds'] : null,
            'total_time' => $done ? fmt_secs((int)$r['total_seconds']) : '',
            'tab_switches' => (int)$r['tab_switches'],
            'copy_attempts' => (int)$r['copy_attempts'],
            'screenshot_attempts' => (int)$r['screenshot_attempts'],
            'removed' => (int)$r['removed'],
        ];
    }
    return $out;
}

function send_csv(string $filename, array $header, array $rows): void {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    $f = fopen('php://output', 'w');
    fwrite($f, "\xEF\xBB\xBF"); // so Excel shows Nepali/Unicode text correctly
    fputcsv($f, $header);
    foreach ($rows as $r) fputcsv($f, $r);
    exit;
}

function attempt_answers(int $pid): array {
    global $LETTERS;
    $st = db()->prepare('SELECT a.id, a.question_ids FROM attempts a WHERE a.participant_id = ?');
    $st->execute([$pid]);
    $a = $st->fetch();
    if (!$a) return [];
    $ids = json_decode($a['question_ids'], true) ?: [];
    $q = db()->prepare('SELECT q.id, q.section, q.question_text, q.correct_index, r.selected_index, r.time_spent, r.visits, r.forfeited
                        FROM questions q LEFT JOIN responses r ON r.question_id = q.id AND r.attempt_id = ? WHERE q.id = ?');
    $out = []; $n = 0;
    foreach ($ids as $qid) {
        $q->execute([(int)$a['id'], (int)$qid]);
        $r = $q->fetch();
        if (!$r) continue;
        $sel = $r['selected_index'] === null ? null : (int)$r['selected_index'];
        $out[] = [
            'no' => ++$n, 'question_id' => (int)$r['id'], 'section' => $r['section'],
            'question' => mb_substr($r['question_text'], 0, 120),
            'selected' => $sel === null ? '' : $LETTERS[$sel],
            'correct' => $LETTERS[(int)$r['correct_index']],
            'is_correct' => $sel !== null && $sel === (int)$r['correct_index'],
            'time_seconds' => (int)($r['time_spent'] ?? 0),
            'visits' => (int)($r['visits'] ?? 0),
            'removed' => forfeit_label($r['forfeited'] ?? null),
        ];
    }
    return $out;
}

switch ($action) {
    case 'results':
        respond(['ok' => true, 'results' => ranked_results()]);

    case 'detail':
        $id = (int)($_GET['id'] ?? 0);
        respond(['ok' => true, 'answers' => attempt_answers($id)]);

    case 'csv':
        $rows = array_map(fn($r) => [$r['rank'], $r['name'], $r['phone'], $r['email'], $r['address'], $r['status'], $r['score'], $r['iq_score'], $r['gk_score'],
            $r['answered'], $r['total_questions'], $r['started_at'], $r['submitted_at'], $r['total_time'], $r['total_seconds'], $r['submit_reason'], $r['tab_switches'], $r['copy_attempts'], $r['screenshot_attempts'], $r['removed']], ranked_results());
        send_csv('exam-results.csv', ['Rank','Name','Phone','Email','Address','Status','Score','IQ score','GK score','Answered','Questions',
            'Start time (NPT)','Finish time (NPT)','Total time (m:ss)','Total seconds','How submitted','Left the page','Copy attempts','Screenshot key presses','Questions removed'], $rows);

    case 'csv_detail':
        $rows = [];
        foreach (ranked_results() as $r) {
            foreach (attempt_answers($r['id']) as $x) {
                $rows[] = [$r['rank'], $r['name'], $r['phone'], $x['no'], $x['section'], $x['question'], $x['selected'], $x['correct'], $x['is_correct'] ? 'Yes' : 'No', $x['time_seconds'], $x['visits'], $x['removed']];
            }
        }
        send_csv('exam-answers-detail.csv', ['Rank','Name','Phone','Q no.','Section','Question','Chosen','Correct answer','Right?','Seconds on question','Times opened','Removed because'], $rows);

    case 'questions':
        $rows = $pdo->query("SELECT * FROM questions ORDER BY CASE section WHEN '" . section_order()[0] . "' THEN 0 ELSE 1 END, sort_order, id")->fetchAll();
        respond(['ok' => true, 'questions' => array_map(fn($q) => [
            'id' => (int)$q['id'], 'section' => $q['section'], 'type' => $q['qtype'], 'text' => $q['question_text'],
            'image' => $q['image_url'] ?: '', 'image_url' => img_url($q['image_url']), 'sort_order' => (int)$q['sort_order'],
            'table' => question_table($q['match_left'], $q['match_right']),
            'options' => decode_options($q['options']), 'option_urls' => array_map(fn($o) => img_url($o['image']), decode_options($q['options'])),
            'answer' => $LETTERS[(int)$q['correct_index']], 'active' => (bool)$q['active'],
        ], $rows)]);

    case 'import':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST', 405);
        $in = input();
        $list = $in['questions'] ?? null;
        if (!is_array($list) || !$list) fail('No questions found. Paste a JSON list of questions.');
        $clean = []; $errors = [];
        foreach ($list as $i => $q) {
            $r = validate_question($q, $i + 1);
            if (is_string($r)) $errors[] = $r; else $clean[] = $r;
        }
        if ($errors) fail('Nothing was imported. Fix these and try again: ' . implode('; ', $errors), 400, ['errors' => $errors]);
        $mode = ($in['mode'] ?? 'append') === 'replace' ? 'replace' : 'append';
        $pdo->beginTransaction();
        if ($mode === 'replace') {
            $cnt = (int)$pdo->query('SELECT COUNT(*) FROM attempts')->fetchColumn();
            if ($cnt > 0) { $pdo->rollBack(); fail('Students have already started the exam, so questions cannot be replaced. Use "Add" instead, or delete the test students on the Results tab first.', 409); }
            $pdo->exec('DELETE FROM questions');
        }
        $base = (int)$pdo->query('SELECT COALESCE(MAX(sort_order),0) FROM questions')->fetchColumn();
        $st = $pdo->prepare('INSERT INTO questions (section, qtype, question_text, image_url, match_left, match_right, options, correct_index, sort_order) VALUES (?,?,?,?,?,?,?,?,?)');
        foreach ($clean as $c) { $c[8] += $base; $st->execute($c); }
        $pdo->commit();
        $counts = $pdo->query("SELECT section, COUNT(*) c FROM questions WHERE active = 1 GROUP BY section")->fetchAll(PDO::FETCH_KEY_PAIR);
        respond(['ok' => true, 'imported' => count($clean), 'mode' => $mode, 'counts' => $counts]);

    case 'delete_participant':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST', 405);
        $id = (int)(input()['id'] ?? 0);
        $st = $pdo->prepare('SELECT id FROM attempts WHERE participant_id = ?');
        $st->execute([$id]);
        if ($aid = $st->fetchColumn()) {
            $pdo->prepare('DELETE FROM responses WHERE attempt_id = ?')->execute([$aid]);
            $pdo->prepare('DELETE FROM attempts WHERE id = ?')->execute([$aid]);
        }
        $pdo->prepare('DELETE FROM participants WHERE id = ?')->execute([$id]);
        respond(['ok' => true]);

    case 'save_question':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST', 405);
        $in = input();
        $r = validate_question($in, 1);
        if (is_string($r)) fail(substr($r, 4));
        $id = (int)($in['id'] ?? 0);
        $active = array_key_exists('active', $in) ? ((bool)$in['active'] ? 1 : 0) : 1;
        if ($id > 0) {
            $pdo->prepare('UPDATE questions SET section=?, qtype=?, question_text=?, image_url=?, match_left=?, match_right=?, options=?, correct_index=?, active=? WHERE id=?')
                ->execute([$r[0], $r[1], $r[2], $r[3], $r[4], $r[5], $r[6], $r[7], $active, $id]);
        } else {
            $next = (int)$pdo->query('SELECT COALESCE(MAX(sort_order),0) FROM questions')->fetchColumn() + 1;
            $pdo->prepare('INSERT INTO questions (section, qtype, question_text, image_url, match_left, match_right, options, correct_index, sort_order, active) VALUES (?,?,?,?,?,?,?,?,?,?)')
                ->execute([$r[0], $r[1], $r[2], $r[3], $r[4], $r[5], $r[6], $r[7], $next, $active]);
            $id = (int)$pdo->lastInsertId();
        }
        respond(['ok' => true, 'id' => $id]);

    case 'delete_question':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST', 405);
        $id = (int)(input()['id'] ?? 0);
        $used = $pdo->prepare('SELECT COUNT(*) FROM responses WHERE question_id = ?');
        $used->execute([$id]);
        if ((int)$used->fetchColumn() > 0) {
            $pdo->prepare('UPDATE questions SET active = 0 WHERE id = ?')->execute([$id]);
            respond(['ok' => true, 'hidden' => true, 'message' => 'Students have already answered this question, so it was hidden from new students instead of deleted.']);
        }
        $pdo->prepare('DELETE FROM questions WHERE id = ?')->execute([$id]);
        respond(['ok' => true]);

    case 'upload_image':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST', 405);
        $dir = dirname(__DIR__) . '/uploads';
        if (!is_dir($dir) && !@mkdir($dir, 0755, true)) fail('Could not create the uploads folder on the server.', 500);
        if (!file_exists("$dir/index.html")) @file_put_contents("$dir/index.html", '');
        $files = $_FILES['files'] ?? null;
        if (!$files || !is_array($files['name'])) fail('No pictures received.');
        $max = (float)cfg('max_upload_mb') * 1024 * 1024;
        $saved = []; $errors = [];
        foreach ($files['name'] as $k => $orig) {
            $ext = strtolower(pathinfo((string)$orig, PATHINFO_EXTENSION));
            $base = preg_replace('/[^a-z0-9_-]+/i', '-', pathinfo((string)$orig, PATHINFO_FILENAME));
            $base = trim(strtolower($base), '-') ?: 'picture';
            if ($files['error'][$k] !== UPLOAD_ERR_OK) { $errors[] = "$orig: upload failed (too big?)"; continue; }
            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)) { $errors[] = "$orig: only JPG, PNG, GIF or WEBP pictures"; continue; }
            if ($files['size'][$k] > $max) { $errors[] = "$orig: bigger than " . cfg('max_upload_mb') . ' MB'; continue; }
            if (@getimagesize($files['tmp_name'][$k]) === false) { $errors[] = "$orig: not a valid picture"; continue; }
            $name = "$base.$ext";
            if (!move_uploaded_file($files['tmp_name'][$k], "$dir/$name")) { $errors[] = "$orig: could not be saved"; continue; }
            $saved[] = $name;
        }
        respond(['ok' => !$saved ? false : true, 'saved' => $saved, 'errors' => $errors, 'error' => $saved ? null : implode('; ', $errors)]);

    case 'delete_image':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST', 405);
        $name = basename((string)(input()['name'] ?? ''));
        $path = dirname(__DIR__) . '/uploads/' . $name;
        if (!preg_match('/\\.(jpe?g|png|gif|webp|svg)$/i', $name) || !is_file($path)) fail('Picture not found.', 404);
        @unlink($path);
        respond(['ok' => true]);

    case 'list_images':
        $dir = dirname(__DIR__) . '/uploads';
        $out = [];
        foreach (is_dir($dir) ? scandir($dir) : [] as $f) {
            if (preg_match('/\.(jpe?g|png|gif|webp|svg)$/i', $f)) $out[] = ['name' => $f, 'url' => 'uploads/' . $f];
        }
        respond(['ok' => true, 'images' => $out]);

    default:
        fail('Unknown action', 404);
}
