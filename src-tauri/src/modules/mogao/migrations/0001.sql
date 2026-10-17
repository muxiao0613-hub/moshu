CREATE TABLE mogao_schema(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL);
CREATE TABLE mogao_works(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, synopsis TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '', genre TEXT NOT NULL DEFAULT '',
 favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1,
 settings_revision INTEGER NOT NULL DEFAULT 1, tree_revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE mogao_volumes(id TEXT PRIMARY KEY,work_id TEXT NOT NULL REFERENCES mogao_works(id) ON DELETE CASCADE,
 title TEXT NOT NULL,position INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,deleted_at TEXT);
CREATE TABLE mogao_chapters(id TEXT PRIMARY KEY,work_id TEXT NOT NULL REFERENCES mogao_works(id) ON DELETE CASCADE,
 volume_id TEXT REFERENCES mogao_volumes(id),title TEXT NOT NULL,position INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','revising','final')),
 body_json TEXT NOT NULL,plain_text TEXT NOT NULL DEFAULT '',schema_version INTEGER NOT NULL DEFAULT 1,word_count INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
CREATE INDEX mogao_chapter_order ON mogao_chapters(work_id,volume_id,position,id);
CREATE TABLE mogao_versions(id TEXT PRIMARY KEY,chapter_id TEXT NOT NULL REFERENCES mogao_chapters(id) ON DELETE CASCADE,
 source_revision INTEGER NOT NULL,title TEXT NOT NULL,body_json TEXT NOT NULL,plain_text TEXT NOT NULL,schema_version INTEGER NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(chapter_id,source_revision));
CREATE TABLE mogao_drafts(chapter_id TEXT PRIMARY KEY REFERENCES mogao_chapters(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL UNIQUE,base_revision INTEGER NOT NULL,edit_sequence INTEGER NOT NULL,title TEXT NOT NULL,body_json TEXT NOT NULL,schema_version INTEGER NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE mogao_settings(id TEXT PRIMARY KEY,work_id TEXT NOT NULL REFERENCES mogao_works(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN('character','world','outline')),title TEXT NOT NULL,fields_json TEXT NOT NULL,
 parent_id TEXT REFERENCES mogao_settings(id),chapter_id TEXT REFERENCES mogao_chapters(id),position INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,deleted_at TEXT);
CREATE INDEX mogao_setting_order ON mogao_settings(work_id,kind,parent_id,position,id);
