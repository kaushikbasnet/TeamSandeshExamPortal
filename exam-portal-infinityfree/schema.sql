-- Exam Portal database schema (MySQL / MariaDB on cPanel)
-- Import this in phpMyAdmin: select your database > Import > choose this file > Go.

CREATE TABLE IF NOT EXISTS questions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  section       VARCHAR(10)  NOT NULL,              -- 'IQ' or 'GK'
  qtype         VARCHAR(10)  NOT NULL DEFAULT 'single', -- 'single' or 'match'
  question_text TEXT         NOT NULL,
  image_url     VARCHAR(500) NULL,                  -- optional picture for the question
  match_left    TEXT         NULL,                  -- JSON array, only for 'match' questions
  match_right   TEXT         NULL,                  -- JSON array, only for 'match' questions
  options       TEXT         NOT NULL,              -- JSON array of {"text": "...", "image": "..."}
  correct_index TINYINT      NOT NULL,              -- 0 = first option, 1 = second, ...
  sort_order    INT          NOT NULL DEFAULT 0,
  active        TINYINT      NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS participants (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  phone       VARCHAR(20)  NOT NULL,
  email       VARCHAR(190) NOT NULL,
  address     VARCHAR(500) NOT NULL,
  created_at  DATETIME     NOT NULL,                -- stored in UTC
  ip          VARCHAR(45)  NULL,
  user_agent  VARCHAR(255) NULL,
  UNIQUE KEY uq_phone (phone),
  UNIQUE KEY uq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attempts (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  participant_id INT          NOT NULL,
  token          CHAR(64)     NOT NULL,
  question_ids   TEXT         NOT NULL,             -- JSON array: order shown to this student
  started_at     DATETIME     NOT NULL,             -- UTC
  deadline_at    DATETIME     NOT NULL,             -- UTC
  submitted_at   DATETIME     NULL,                 -- UTC
  submit_reason  VARCHAR(20)  NULL,                 -- 'manual', 'time_up', 'timeout'
  score          INT          NULL,
  iq_score       INT          NULL,
  gk_score       INT          NULL,
  answered       INT          NULL,
  total_seconds  INT          NULL,
  tab_switches   INT          NOT NULL DEFAULT 0,
  UNIQUE KEY uq_participant (participant_id),
  UNIQUE KEY uq_token (token),
  CONSTRAINT fk_attempt_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS responses (
  attempt_id     INT      NOT NULL,
  question_id    INT      NOT NULL,
  selected_index TINYINT  NULL,                     -- NULL = not answered
  time_spent     INT      NOT NULL DEFAULT 0,       -- seconds spent on this question (all visits)
  visits         INT      NOT NULL DEFAULT 0,
  updated_at     DATETIME NOT NULL,
  PRIMARY KEY (attempt_id, question_id),
  CONSTRAINT fk_resp_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
