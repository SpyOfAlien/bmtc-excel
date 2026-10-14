CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_key TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, code_key)
);
CREATE INDEX IF NOT EXISTS lessons_user ON lessons(user_id);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS plans_user_updated ON plans(user_id, updated_at DESC);
