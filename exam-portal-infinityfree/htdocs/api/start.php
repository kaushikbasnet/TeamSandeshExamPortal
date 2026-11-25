<?php
// POST {name, phone, email, address} -> registers the student and starts the 45-minute clock.
require __DIR__ . '/lib.php';
cors();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST', 405);
exam_window_check();

$in = input();
$name = trim((string)($in['name'] ?? ''));
$phone = preg_replace('/[^0-9+]/', '', (string)($in['phone'] ?? ''));
$email = strtolower(trim((string)($in['email'] ?? '')));
$address = trim((string)($in['address'] ?? ''));

if (mb_strlen($name) < 2 || mb_strlen($name) > 150) fail('Please enter your full name.');
if (!preg_match('/^\+?[0-9]{7,15}$/', $phone)) fail('Please enter a valid phone number.');
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) fail('Please enter a valid email address.');
if (mb_strlen($address) < 3 || mb_strlen($address) > 500) fail('Please enter your current address.');

$pdo = db();
// One attempt per phone and per email.
$st = $pdo->prepare('SELECT id FROM participants WHERE phone = ? OR email = ?');
$st->execute([$phone, $email]);
if ($st->fetch()) fail('This phone number or email has already been used to take the exam. Each student can take it only once.', 409, ['code' => 'duplicate']);

// Pick questions section by section (order set by section_order in config.php).
$order = cfg('shuffle_questions') ? (is_sqlite() ? 'RANDOM()' : 'RAND()') : 'sort_order, id';
$ids = [];
foreach (section_order() as $sec) {
    $q = $pdo->prepare("SELECT id FROM questions WHERE active = 1 AND section = ? ORDER BY $order");
    $q->execute([$sec]);
    foreach ($q->fetchAll() as $r) $ids[] = (int)$r['id'];
}
if (!$ids) fail('No questions have been added yet. Please contact the organiser.', 503);

$now = time();
$L = (int)cfg('seconds_per_question');
$duration = $L > 0 ? count($ids) * $L : (int)cfg('duration_minutes') * 60;
$end = $now + $duration;
[, $closeTs] = exam_window();
if ($closeTs && $closeTs < $end) $end = $closeTs; // everyone finishes when the exam window closes
$token = bin2hex(random_bytes(32));
try {
    $pdo->beginTransaction();
    $pdo->prepare('INSERT INTO participants (name, phone, email, address, created_at, ip, user_agent) VALUES (?,?,?,?,?,?,?)')
        ->execute([$name, $phone, $email, $address, gmdate('Y-m-d H:i:s', $now), $_SERVER['REMOTE_ADDR'] ?? null, substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255)]);
    $pid = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO attempts (participant_id, token, question_ids, started_at, deadline_at) VALUES (?,?,?,?,?)')
        ->execute([$pid, $token, json_encode($ids), gmdate('Y-m-d H:i:s', $now), gmdate('Y-m-d H:i:s', $end)]);
    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('This phone number or email has already been used to take the exam.', 409, ['code' => 'duplicate']);
}

$a = attempt_by_token($token);
respond(array_merge(exam_payload($a), ['token' => $token]));
