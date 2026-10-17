CREATE TABLE platform_meta (
  workspace_id TEXT PRIMARY KEY NOT NULL,
  schema_version INTEGER NOT NULL CHECK(schema_version > 0)
);
CREATE TABLE platform_migrations (
  version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL
);
CREATE TABLE platform_projects (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('active','archived')),
  cover_blob_id TEXT REFERENCES platform_blobs(id), favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX platform_projects_updated ON platform_projects(deleted_at,updated_at DESC,id);
CREATE TABLE platform_folders (
  id TEXT PRIMARY KEY NOT NULL, parent_id TEXT REFERENCES platform_folders(id), name TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK(parent_id IS NULL OR parent_id <> id)
);
CREATE TABLE platform_blobs (
  id TEXT PRIMARY KEY NOT NULL, sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256)=64),
  internal_path TEXT NOT NULL UNIQUE, size INTEGER NOT NULL CHECK(size >= 0), mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE platform_resources (
  id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('file','link','note')),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200), description TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
  folder_id TEXT REFERENCES platform_folders(id), blob_id TEXT REFERENCES platform_blobs(id), original_name TEXT, url TEXT,
  favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK((kind='file' AND blob_id IS NOT NULL AND url IS NULL) OR
        (kind='link' AND blob_id IS NULL AND url IS NOT NULL) OR
        (kind='note' AND blob_id IS NULL AND url IS NULL))
);
CREATE INDEX platform_resources_updated ON platform_resources(deleted_at,updated_at DESC,id);
CREATE TABLE platform_notes (
  resource_id TEXT PRIMARY KEY NOT NULL REFERENCES platform_resources(id),
  body_json TEXT NOT NULL CHECK(json_valid(body_json)), plain_text TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK(schema_version > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE platform_note_versions (
  id TEXT PRIMARY KEY NOT NULL, resource_id TEXT NOT NULL REFERENCES platform_notes(resource_id),
  source_revision INTEGER NOT NULL CHECK(source_revision > 0), title TEXT NOT NULL,
  body_json TEXT NOT NULL CHECK(json_valid(body_json)), plain_text TEXT NOT NULL, schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX platform_versions_note ON platform_note_versions(resource_id,created_at DESC);
CREATE TRIGGER platform_versions_immutable BEFORE UPDATE ON platform_note_versions
BEGIN SELECT RAISE(ABORT,'immutable version'); END;
CREATE TABLE platform_tasks (
  id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('notStarted','inProgress','completed')),
  priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')), due_date TEXT,
  project_id TEXT REFERENCES platform_projects(id),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX platform_tasks_due ON platform_tasks(deleted_at,status,due_date);
CREATE TABLE platform_tags (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- Concrete foreign keys avoid unvalidated polymorphic entity IDs.
CREATE TABLE platform_entity_tags (
  tag_id TEXT NOT NULL REFERENCES platform_tags(id),
  project_id TEXT REFERENCES platform_projects(id), resource_id TEXT REFERENCES platform_resources(id), task_id TEXT REFERENCES platform_tasks(id),
  CHECK((project_id IS NOT NULL)+(resource_id IS NOT NULL)+(task_id IS NOT NULL)=1)
);
CREATE UNIQUE INDEX platform_project_tag ON platform_entity_tags(tag_id,project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX platform_resource_tag ON platform_entity_tags(tag_id,resource_id) WHERE resource_id IS NOT NULL;
CREATE UNIQUE INDEX platform_task_tag ON platform_entity_tags(tag_id,task_id) WHERE task_id IS NOT NULL;
CREATE TABLE platform_project_resources (
  project_id TEXT NOT NULL REFERENCES platform_projects(id), resource_id TEXT NOT NULL REFERENCES platform_resources(id),
  created_at TEXT NOT NULL, PRIMARY KEY(project_id,resource_id)
);
CREATE TABLE platform_preferences (
  key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL CHECK(json_valid(value_json)), schema_version INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE platform_module_states (
  module_id TEXT PRIMARY KEY NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), data_schema_version INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE platform_jobs (
  id TEXT PRIMARY KEY NOT NULL, module_id TEXT NOT NULL, entity_id TEXT, operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed','cancelled','interrupted','partial')),
  progress REAL NOT NULL CHECK(progress BETWEEN 0 AND 1), request_id TEXT NOT NULL, error_code TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE platform_search_projection (
  module_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  title TEXT NOT NULL, plain_text TEXT NOT NULL, route TEXT NOT NULL, source_revision INTEGER NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(module_id,entity_type,entity_id)
);
CREATE TABLE ai_connections (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, endpoint TEXT NOT NULL, model TEXT NOT NULL, secret_ref TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
