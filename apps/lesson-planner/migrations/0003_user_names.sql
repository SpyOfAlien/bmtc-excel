CREATE TABLE users_with_names (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
WITH RECURSIVE names(id, remaining, last_name, created_at, updated_at) AS (
  SELECT id, trim(display_name), '', created_at, updated_at FROM users
  UNION ALL
  SELECT id, trim(substr(remaining, instr(remaining, ' ') + 1)),
    trim(last_name || ' ' || substr(remaining, 1, instr(remaining, ' ') - 1)), created_at, updated_at
  FROM names WHERE instr(remaining, ' ') > 0
)
INSERT INTO users_with_names (id, first_name, last_name, created_at, updated_at)
SELECT id,
  CASE WHEN id = 'ed7577cc-23e2-4d71-8563-a8be606662e3' THEN 'Hoà' ELSE remaining END,
  CASE WHEN id = 'ed7577cc-23e2-4d71-8563-a8be606662e3' THEN '' ELSE last_name END,
  created_at, updated_at
FROM names WHERE instr(remaining, ' ') = 0;
DROP TABLE users;
ALTER TABLE users_with_names RENAME TO users;
