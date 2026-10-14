CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO users(id, display_name, created_at, updated_at)
VALUES ('ed7577cc-23e2-4d71-8563-a8be606662e3', 'Cô Hoà', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT OR IGNORE INTO users(id, display_name, created_at, updated_at)
SELECT DISTINCT user_id, 'Người dùng', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM lessons;
INSERT OR IGNORE INTO users(id, display_name, created_at, updated_at)
SELECT DISTINCT user_id, 'Người dùng', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM plans;
