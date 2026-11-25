<?php
// POST {token, responses:[{qid, selected, time, visits}], tab_switches} -> autosave during the exam.
require __DIR__ . '/lib.php';
cors();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST', 405);
$in = input();
$a = attempt_by_token((string)($in['token'] ?? ''));
if (!$a) fail('Exam session not found.', 404, ['code' => 'no_session']);
if ($a['submitted_at'] !== null) respond(done_payload($a));
if (is_expired($a)) { finalize_attempt($a, 'timeout'); respond(done_payload($a)); }
$n = save_responses($a, is_array($in['responses'] ?? null) ? $in['responses'] : []);
update_flags($a, $in);
respond(['ok' => true, 'saved' => $n, 'remaining_seconds' => max(0, ts($a['deadline_at']) - time())]);
