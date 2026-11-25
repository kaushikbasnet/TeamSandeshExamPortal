<?php
// ===== EDIT THESE VALUES ON YOUR cPANEL SERVER =====
// This file is never sent to students. Keep it only on cPanel, not on GitHub.

return [
    // MySQL details. InfinityFree: Control Panel > MySQL Databases (host looks like sql123.infinityfree.com)
    'db_host' => 'sqlXXX.infinityfree.com',
    'db_name' => 'if0_XXXXXXXX_exam',
    'db_user' => 'if0_XXXXXXXX',
    'db_pass' => 'CHANGE_ME',

    // Password for the admin results page. Use a long one.
    'admin_password' => 'CHANGE_ME_TO_A_LONG_PASSWORD',

    // Websites allowed to call this API (your GitHub Pages address, no trailing slash).
    // Example: 'https://yourname.github.io'
    'allowed_origins' => [
        'https://kaushikbasnet.github.io',
    ],

    // Exam rules
    'duration_minutes'      => 45,
    'grace_seconds'         => 60,    // extra seconds to accept the final auto-submit over slow internet
    'shuffle_questions'     => false, // true = each student gets questions in a different order within each section
    'section_order'         => 'GK,IQ', // which section comes first, like the Loksewa paper (GK 1-30, IQ 31-50)
    'show_score_to_student' => false, // true = student sees their score right after submitting

    // Time limit for EACH question in seconds. 0 = off (one overall timer of duration_minutes, students move freely).
    // When on: every question has its own countdown, moves on automatically, and students cannot go back.
    // The total exam time then becomes (number of questions x these seconds).
    'seconds_per_question' => 0,

    // Anti-cheating: blocks copy, right-click, printing and common shortcuts. If the student leaves the page,
    // copies, prints or presses a screenshot key, the question on screen is removed (counts as skipped).
    // Also shows the student's name and phone faintly over the question.
    'protect_content' => true,

    // Largest picture size the admin can upload, in MB.
    'max_upload_mb' => 2,

    // Optional exam window in Nepal time (Asia/Kathmandu). Leave '' to keep the exam always open.
    // Example: '2026-12-05 10:00'
    // Fixed exam time (Nepal time). The exam opens at exam_start and closes for everyone at exam_end.
    // exam_date: 'YYYY-MM-DD' to allow only that day, or '' for every day. Set exam_start and exam_end to '' to turn it off.
    'exam_date'  => '',
    'exam_start' => '14:00',
    'exam_end'   => '14:45',
    'opens_at'  => '',
    'closes_at' => '',

    // Only for local testing. Leave as '' on cPanel.
    'dsn_override' => '',
];
