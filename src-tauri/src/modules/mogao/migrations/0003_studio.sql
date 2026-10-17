-- Ported Mogao UI storage. Original manual-work tables remain intact.
CREATE TABLE mogao_studio_entities (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('projects','chapters','characters','world-settings','outlines','plot-threads','timeline-events','materials','short-stories')),
 project_id TEXT REFERENCES mogao_studio_entities(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision > 0),
 data TEXT NOT NULL CHECK(json_valid(data)),
 deleted_at TEXT,
 CHECK((kind IN ('projects','materials','short-stories') AND project_id IS NULL) OR (kind NOT IN ('projects','materials','short-stories') AND project_id IS NOT NULL))
);
CREATE INDEX mogao_studio_scope ON mogao_studio_entities(project_id,kind,deleted_at);
CREATE TABLE mogao_studio_versions (
 id TEXT PRIMARY KEY,
 entity_id TEXT NOT NULL REFERENCES mogao_studio_entities(id) ON DELETE CASCADE,
 source_revision INTEGER NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE TABLE mogao_studio_state (
 key TEXT PRIMARY KEY CHECK(length(key) BETWEEN 1 AND 250),
 value TEXT NOT NULL CHECK(length(CAST(value AS BLOB)) <= 4194304)
);
CREATE TABLE mogao_studio_receipts (
 request_id TEXT PRIMARY KEY,
 request_hash TEXT NOT NULL,
 response TEXT NOT NULL CHECK(json_valid(response))
);
