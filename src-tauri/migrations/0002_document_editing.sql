CREATE TABLE platform_file_versions (
  id TEXT PRIMARY KEY NOT NULL,
  resource_id TEXT NOT NULL REFERENCES platform_resources(id),
  source_revision INTEGER NOT NULL CHECK(source_revision > 0),
  blob_id TEXT NOT NULL REFERENCES platform_blobs(id),
  created_at TEXT NOT NULL,
  UNIQUE(resource_id,source_revision)
);
CREATE TRIGGER platform_file_versions_immutable BEFORE UPDATE ON platform_file_versions
BEGIN SELECT RAISE(ABORT,'file versions are immutable'); END;
CREATE TABLE platform_document_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  resource_id TEXT NOT NULL UNIQUE REFERENCES platform_resources(id),
  base_revision INTEGER NOT NULL CHECK(base_revision > 0),
  source_blob_id TEXT NOT NULL REFERENCES platform_blobs(id),
  filename TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('md','markdown','docx','doc','xlsx','xls','csv','tsv')),
  markdown TEXT,
  edit_sequence INTEGER NOT NULL DEFAULT 0 CHECK(edit_sequence >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
