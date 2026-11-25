<?php
// Shared helpers for the exam API. No need to edit this file.

declare(strict_types=1);

// Defaults for settings that an older config.php may not have yet.
$CFG = array_merge([
    'duration_minutes' => 45, 'grace_seconds' => 60, 'shuffle_questions' => false, 'show_score_to_student' => false,
    'seconds_per_question' => 0, 'protect_content' => true, 'max_upload_mb' => 2,
    'opens_at' => '', 'closes_at' => '', 'exam_date' => '', 'exam_start' => '14:00', 'exam_end' => '14:45', 'section_order' => 'GK,IQ', 'dsn_override' => '', 'allowed_origins' => [],
], require __DIR__ . '/config.php');
date_default_timezone_set('UTC');

function cfg(string $key) { global $CFG; return $CFG[$key] ?? null; }

// ---------- CORS + JSON ----------
function cors(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = cfg('allowed_origins') ?: [];
    if ($origin !== '' && in_array(rtrim($origin, '/'), array_map(fn($o) => rtrim($o, '/'), $allowed), true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-Admin-Key');
        header('Access-Control-Max-Age: 86400');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
}

function respond(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $code = 400, array $extra = []): void {
    respond(array_merge(['ok' => false, 'error' => $message], $extra), $code);
}

function input(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '[]', true);
    return is_array($data) ? $data : [];
}

// ---------- Database ----------
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    try {
        $dsn = cfg('dsn_override') ?: 'mysql:host=' . cfg('db_host') . ';dbname=' . cfg('db_name') . ';charset=utf8mb4';
        $pdo = new PDO($dsn, cfg('db_user'), cfg('db_pass'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $e) {
        fail('Database connection failed. Check config.php.', 500);
    }
    ensure_schema($pdo);
    return $pdo;
}

/** Adds columns introduced after the first version, so nobody has to run SQL by hand. */
function ensure_schema(PDO $pdo): void {
    try { $pdo->query('SELECT a.copy_attempts, a.screenshot_attempts, r.forfeited FROM attempts a, responses r LIMIT 0'); return; } catch (Throwable $e) {}
    foreach (['copy_attempts', 'screenshot_attempts'] as $col) {
        try { $pdo->exec("ALTER TABLE attempts ADD COLUMN $col INT NOT NULL DEFAULT 0"); } catch (Throwable $e) {}
    }
    try { $pdo->exec('ALTER TABLE responses ADD COLUMN forfeited VARCHAR(20) NULL'); } catch (Throwable $e) {}
}

/** Why a question was removed from a student (shown to the admin). */
function forfeit_label(?string $r): string {
    $map = ['left_page' => 'Left the page', 'copy' => 'Tried to copy', 'right_click' => 'Right-click', 'screenshot' => 'Screenshot key',
            'print' => 'Tried to print', 'devtools' => 'Developer tools'];
    return $r ? ($map[$r] ?? 'Rule broken') : '';
}

function is_sqlite(): bool { return db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'; }

// ---------- Time ----------
function now_utc(): string { return gmdate('Y-m-d H:i:s'); }
function ts(string $utc): int { return strtotime($utc . ' UTC'); }
function npt(?string $utc): string {
    if (!$utc) return '';
    $d = new DateTime($utc, new DateTimeZone('UTC'));
    $d->setTimezone(new DateTimeZone('Asia/Kathmandu'));
    return $d->format('Y-m-d H:i:s');
}
function npt_to_ts(string $local): int {
    return (new DateTime($local, new DateTimeZone('Asia/Kathmandu')))->getTimestamp();
}

// ---------- Questions ----------
function decode_options(string $json): array {
    $opts = json_decode($json, true) ?: [];
    return array_map(fn($o) => is_array($o) ? ['text' => (string)($o['text'] ?? ''), 'image' => (string)($o['image'] ?? '')] : ['text' => (string)$o, 'image' => ''], $opts);
}

/**
 * A table shown with a question (match the following, or any table of facts).
 * Stored as JSON {"headers":[...], "rows":[[...],...]} in match_left; older questions stored two plain lists.
 */
function question_table(?string $ml, ?string $mr): ?array {
    $L = $ml ? json_decode($ml, true) : null;
    if (is_array($L) && isset($L['rows']) && is_array($L['rows'])) {
        $rows = array_values(array_filter(array_map(fn($r) => array_map('strval', (array)$r), $L['rows']), fn($r) => implode('', $r) !== ''));
        return $rows ? ['headers' => array_map('strval', (array)($L['headers'] ?? [])), 'rows' => $rows] : null;
    }
    if (is_array($L) && $L) {
        $R = $mr ? (json_decode($mr, true) ?: []) : [];
        $rows = [];
        for ($i = 0; $i < max(count($L), count($R)); $i++) $rows[] = [(string)($L[$i] ?? ''), (string)($R[$i] ?? '')];
        return ['headers' => ['List I', 'List II'], 'rows' => $rows];
    }
    return null;
}

/** A bare file name like "q12.png" means a picture uploaded on the admin page (uploads folder). */
function img_url(?string $v): string {
    $v = trim((string)$v);
    if ($v === '') return '';
    if (preg_match('#^(https?:)?//#i', $v) || str_contains($v, '/')) return $v;
    return 'uploads/' . $v;
}
function resolve_options(array $opts): array {
    return array_map(fn($o) => ['text' => $o['text'], 'image' => img_url($o['image'])], $opts);
}

/** Questions for the student, WITHOUT the correct answer. */
function public_questions(array $ids): array {
    if (!$ids) return [];
    $in = implode(',', array_fill(0, count($ids), '?'));
    $st = db()->prepare("SELECT id, section, qtype, question_text, image_url, match_left, match_right, options FROM questions WHERE id IN ($in)");
    $st->execute($ids);
    $byId = [];
    foreach ($st->fetchAll() as $q) {
        $byId[(int)$q['id']] = [
            'id' => (int)$q['id'],
            'section' => $q['section'],
            'type' => $q['qtype'],
            'text' => $q['question_text'],
            'image' => img_url($q['image_url']),
            'table' => question_table($q['match_left'], $q['match_right']),
            'options' => resolve_options(decode_options($q['options'])),
        ];
    }
    $out = [];
    foreach ($ids as $id) if (isset($byId[$id])) $out[] = $byId[$id];
    return $out;
}

// ---------- Attempts ----------
function attempt_by_token(string $token): ?array {
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    $st = db()->prepare('SELECT a.*, p.name, p.phone FROM attempts a JOIN participants p ON p.id = a.participant_id WHERE a.token = ?');
    $st->execute([$token]);
    return $st->fetch() ?: null;
}

function is_expired(array $a): bool {
    return time() > ts($a['deadline_at']) + (int)cfg('grace_seconds');
}

/** Save a batch of answers: [{qid, selected (int|null), time (seconds), visits}] */
function save_responses(array $a, array $items): int {
    $allowed = array_flip(json_decode($a['question_ids'], true) ?: []); // qid => position
    $cap = (int)cfg('duration_minutes') * 60 + (int)cfg('grace_seconds');
    $L = (int)cfg('seconds_per_question');
    $elapsed = time() - ts($a['started_at']);
    // What is already saved: answers of timed-out questions and removed (forfeited) questions can never change.
    $prev = []; $lost = [];
    $ps = db()->prepare('SELECT question_id, selected_index, forfeited FROM responses WHERE attempt_id = ?');
    $ps->execute([(int)$a['id']]);
    foreach ($ps->fetchAll() as $r) {
        $prev[(int)$r['question_id']] = $r['selected_index'] === null ? null : (int)$r['selected_index'];
        if ($r['forfeited']) $lost[(int)$r['question_id']] = $r['forfeited'];
    }
    $sql = is_sqlite()
        ? 'INSERT INTO responses (attempt_id, question_id, selected_index, time_spent, visits, updated_at, forfeited) VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(attempt_id, question_id) DO UPDATE SET selected_index=excluded.selected_index, time_spent=excluded.time_spent, visits=excluded.visits, updated_at=excluded.updated_at, forfeited=excluded.forfeited'
        : 'INSERT INTO responses (attempt_id, question_id, selected_index, time_spent, visits, updated_at, forfeited) VALUES (?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE selected_index=VALUES(selected_index), time_spent=VALUES(time_spent), visits=VALUES(visits), updated_at=VALUES(updated_at), forfeited=VALUES(forfeited)';
    $st = db()->prepare($sql);
    $n = 0;
    foreach ($items as $it) {
        $qid = (int)($it['qid'] ?? 0);
        if (!isset($allowed[$qid])) continue;
        $sel = $it['selected'] ?? null;
        $sel = ($sel === null || $sel === '') ? null : max(0, min(9, (int)$sel));
        if ($L > 0 && $elapsed > ($allowed[$qid] + 1) * $L + 15) $sel = $prev[$qid] ?? null; // 15s for slow internet
        $why = $lost[$qid] ?? null;
        if (!$why && !empty($it['forfeited'])) $why = substr(preg_replace('/[^a-z_]/', '', (string)$it['forfeited']), 0, 20) ?: 'rule';
        if ($why) $sel = null;
        $time = max(0, min($cap, (int)($it['time'] ?? 0)));
        $visits = max(0, min(10000, (int)($it['visits'] ?? 0)));
        $st->execute([(int)$a['id'], $qid, $sel, $time, $visits, now_utc(), $why]);
        $n++;
    }
    return $n;
}

/** Score and close an attempt. Correct answers never leave the server. */
function finalize_attempt(array $a, string $reason): array {
    $st = db()->prepare('SELECT q.section, r.selected_index, q.correct_index
                         FROM responses r JOIN questions q ON q.id = r.question_id
                         WHERE r.attempt_id = ?');
    $st->execute([(int)$a['id']]);
    $score = $iq = $gk = $answered = 0;
    foreach ($st->fetchAll() as $r) {
        if ($r['selected_index'] === null) continue;
        $answered++;
        if ((int)$r['selected_index'] === (int)$r['correct_index']) {
            $score++;
            if ($r['section'] === 'IQ') $iq++; else $gk++;
        }
    }
    $start = ts($a['started_at']);
    $deadline = ts($a['deadline_at']);
    $end = min(time(), $deadline);
    if ($reason === 'timeout') $end = $deadline;
    $submitted = gmdate('Y-m-d H:i:s', $end);
    $total = max(0, $end - $start);

    $up = db()->prepare('UPDATE attempts SET submitted_at=?, submit_reason=?, score=?, iq_score=?, gk_score=?, answered=?, total_seconds=? WHERE id=? AND submitted_at IS NULL');
    $up->execute([$submitted, $reason, $score, $iq, $gk, $answered, $total, (int)$a['id']]);
    return ['score' => $score, 'iq_score' => $iq, 'gk_score' => $gk, 'answered' => $answered, 'total_seconds' => $total, 'submitted_at' => $submitted];
}

/** Close any attempt whose time has fully run out without a submit (e.g. student closed the browser). */
function close_expired_attempts(): void {
    $rows = db()->query('SELECT * FROM attempts WHERE submitted_at IS NULL')->fetchAll();
    foreach ($rows as $a) if (is_expired($a)) finalize_attempt($a, 'timeout');
}

/** Order of the sections in the exam, e.g. ['GK', 'IQ']. */
function section_order(): array {
    $o = array_values(array_intersect(array_map('trim', explode(',', strtoupper((string)cfg('section_order')))), ['IQ', 'GK']));
    foreach (['GK', 'IQ'] as $s) if (!in_array($s, $o, true)) $o[] = $s;
    return $o;
}

// Fixed exam window in Nepal time. exam_start/exam_end are HH:MM; exam_date (YYYY-MM-DD) is optional,
// empty = the window applies every day. Full opens_at/closes_at date-times, if set, take priority.
function exam_window(): array {
    $tz = new DateTimeZone('Asia/Kathmandu');
    $day = cfg('exam_date') ?: (new DateTime('now', $tz))->format('Y-m-d');
    $o = cfg('opens_at') ?: (cfg('exam_start') ? $day . ' ' . cfg('exam_start') : '');
    $c = cfg('closes_at') ?: (cfg('exam_end') ? $day . ' ' . cfg('exam_end') : '');
    return [$o ? npt_to_ts($o) : null, $c ? npt_to_ts($c) : null];
}
function npt_clock(int $ts): string {
    $d = new DateTime('@' . $ts); $d->setTimezone(new DateTimeZone('Asia/Kathmandu'));
    return $d->format('g:i A');
}
function exam_window_check(): void {
    [$o, $c] = exam_window();
    if ($o && time() < $o) fail('The exam has not started yet. It opens at ' . npt_clock($o) . ' Nepal time.', 403, ['code' => 'not_open']);
    if ($c && time() >= $c) fail('The exam is closed. It ended at ' . npt_clock($c) . ' Nepal time.', 403, ['code' => 'closed']);
}

function done_payload(array $a): array {
    $st = db()->prepare('SELECT * FROM attempts WHERE id = ?');
    $st->execute([(int)$a['id']]);
    $a2 = $st->fetch();
    $out = ['ok' => true, 'status' => 'submitted', 'name' => $a['name'] ?? '',
        'started_at' => npt($a2['started_at']), 'submitted_at' => npt($a2['submitted_at']),
        'total_seconds' => (int)$a2['total_seconds'], 'answered' => (int)$a2['answered']];
    if (cfg('show_score_to_student')) $out['score'] = (int)$a2['score'];
    return $out;
}

function exam_payload(array $a): array {
    $ids = json_decode($a['question_ids'], true) ?: [];
    $st = db()->prepare('SELECT question_id, selected_index, time_spent, visits, forfeited FROM responses WHERE attempt_id = ?');
    $st->execute([(int)$a['id']]);
    $saved = [];
    foreach ($st->fetchAll() as $r) {
        $saved[(int)$r['question_id']] = ['selected' => $r['selected_index'] === null ? null : (int)$r['selected_index'], 'time' => (int)$r['time_spent'], 'visits' => (int)$r['visits'], 'forfeited' => $r['forfeited'] ?: null];
    }
    return [
        'ok' => true,
        'status' => 'in_progress',
        'name' => $a['name'] ?? '',
        'remaining_seconds' => max(0, ts($a['deadline_at']) - time()),
        'duration_seconds' => ts($a['deadline_at']) - ts($a['started_at']),
        'started_at' => npt($a['started_at']),
        'seconds_per_question' => (int)cfg('seconds_per_question'),
        'protect' => (bool)cfg('protect_content'),
        'watermark' => trim(($a['name'] ?? '') . ' ' . ($a['phone'] ?? '')),
        'questions' => public_questions($ids),
        'saved' => (object)$saved,
    ];
}

/** Counters sent by the exam page: leaving the page, copy attempts, screenshot key presses. */
function update_flags(array $a, array $in): void {
    $set = []; $vals = [];
    foreach (['tab_switches' => 'tab_switches', 'copy_attempts' => 'copy_attempts', 'screenshot_attempts' => 'screenshot_attempts'] as $k => $col) {
        if (isset($in[$k])) { $set[] = "$col = ?"; $vals[] = max(0, min(100000, (int)$in[$k])); }
    }
    if (!$set) return;
    $vals[] = (int)$a['id'];
    db()->prepare('UPDATE attempts SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($vals);
}

function require_admin(): void {
    $key = $_SERVER['HTTP_X_ADMIN_KEY'] ?? '';
    $pw = (string)cfg('admin_password');
    if ($pw === '' || str_starts_with($pw, 'CHANGE_ME') || !hash_equals($pw, (string)$key)) {
        usleep(400000);
        fail('Wrong admin password.', 401);
    }
}
