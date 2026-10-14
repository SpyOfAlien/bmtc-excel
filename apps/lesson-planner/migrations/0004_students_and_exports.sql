CREATE TABLE students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE student_teachers (
  student_id TEXT NOT NULL REFERENCES students(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(student_id, user_id)
);
CREATE INDEX student_teachers_user ON student_teachers(user_id, student_id);
INSERT OR IGNORE INTO students(id, name, age, created_at, updated_at)
SELECT json_extract(child.value, '$.id'), trim(json_extract(child.value, '$.name')),
  COALESCE(json_extract(child.value, '$.age'), ''), plans.created_at, plans.updated_at
FROM plans, json_each(plans.payload, '$.children') AS child
WHERE trim(COALESCE(json_extract(child.value, '$.name'), '')) != '';
INSERT OR IGNORE INTO student_teachers(student_id, user_id, created_at)
SELECT json_extract(child.value, '$.id'), plans.user_id, plans.created_at
FROM plans, json_each(plans.payload, '$.children') AS child
WHERE trim(COALESCE(json_extract(child.value, '$.name'), '')) != '';
CREATE TABLE plan_exports (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  exported_at TEXT NOT NULL
);
CREATE INDEX plan_exports_plan ON plan_exports(plan_id);
