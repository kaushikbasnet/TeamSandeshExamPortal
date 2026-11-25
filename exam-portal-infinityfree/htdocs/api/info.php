<?php
// GET -> exam settings for the instructions page (no questions, no answers).
require __DIR__ . '/lib.php';
cors();
$c = db()->query("SELECT section, COUNT(*) c FROM questions WHERE active = 1 GROUP BY section")->fetchAll(PDO::FETCH_KEY_PAIR);
$n = array_sum(array_map('intval', $c));
$L = (int)cfg('seconds_per_question');
respond(['ok' => true, 'order' => section_order(), 'questions' => $n, 'iq' => (int)($c['IQ'] ?? 0), 'gk' => (int)($c['GK'] ?? 0),
    'seconds_per_question' => $L, 'total_seconds' => $L > 0 ? $n * $L : (int)cfg('duration_minutes') * 60,
    'opens_ts' => exam_window()[0], 'closes_ts' => exam_window()[1], 'server_ts' => time(),
    'opens_label' => exam_window()[0] ? npt_clock(exam_window()[0]) : '', 'closes_label' => exam_window()[1] ? npt_clock(exam_window()[1]) : '']);
