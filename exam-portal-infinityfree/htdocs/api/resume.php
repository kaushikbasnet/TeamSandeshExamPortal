<?php
// POST {token} -> continue an exam after a page reload (same browser).
require __DIR__ . '/lib.php';
cors();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST', 405);
$a = attempt_by_token((string)(input()['token'] ?? ''));
if (!$a) fail('Exam session not found.', 404, ['code' => 'no_session']);
if ($a['submitted_at'] === null && is_expired($a)) finalize_attempt($a, 'timeout');
$a = attempt_by_token($a['token']);
if ($a['submitted_at'] !== null) respond(done_payload($a));
respond(exam_payload($a));
