CREATE TABLE mogao_studio_ai_runs (
 id TEXT PRIMARY KEY,
 request_json TEXT NOT NULL CHECK(json_valid(request_json)),
 model TEXT NOT NULL,
 output TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('running','completed','cancelled','failed','interrupted')),
 created_at TEXT NOT NULL,
 finished_at TEXT,
 error_code TEXT
);
CREATE INDEX mogao_studio_ai_recent ON mogao_studio_ai_runs(created_at DESC);
