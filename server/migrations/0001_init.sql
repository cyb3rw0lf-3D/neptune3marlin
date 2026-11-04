-- Service Bay VR teacher dashboard. Secrets (teacher keys, student tokens) are stored only as SHA-256 hashes.
CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  settings TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  active_at INTEGER NOT NULL
);

CREATE TABLE students (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  -- Roster students get a personal join code the teacher hands out.
  roster_code TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  active_at INTEGER NOT NULL
);
CREATE INDEX students_class ON students(class_id);
CREATE UNIQUE INDEX students_class_nickname ON students(class_id, nickname COLLATE NOCASE);

CREATE TABLE tokens (
  hash TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX tokens_student ON tokens(student_id);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson TEXT NOT NULL,
  mode TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  score INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  completed INTEGER NOT NULL,
  critical INTEGER NOT NULL,
  hints INTEGER NOT NULL,
  seconds INTEGER NOT NULL,
  mistakes TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX attempts_student ON attempts(student_id, lesson, mode);

CREATE TABLE shop (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  money REAL NOT NULL,
  rep INTEGER NOT NULL,
  shifts INTEGER NOT NULL,
  jobs INTEGER NOT NULL,
  comebacks INTEGER NOT NULL,
  safety_stops INTEGER NOT NULL,
  upgrades INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE heartbeats (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  lesson TEXT,
  mode TEXT,
  step TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window)
);
