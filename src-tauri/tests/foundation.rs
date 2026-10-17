use moshub_lib::{
    contracts::*,
    infrastructure::{backup, database::Database},
    platform::{
        modules::{ModuleInfo, ModuleLifecycle, Registry},
        service::PlatformService,
    },
};
use std::{
    io::{Read, Write},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
#[tokio::test]
async fn previous_v2_upgrade_creates_a_backup_and_migration_failure_preserves_the_original() {
    use sha2::{Digest, Sha256};
    for fail in [false, true] {
        let root = tempfile::tempdir().unwrap();
        moshub_lib::infrastructure::paths::WorkspacePaths::initialize(root.path()).unwrap();
        let c = rusqlite::Connection::open(root.path().join("workspace.sqlite")).unwrap();
        for (index, sql) in [
            include_str!("../migrations/0001_platform.sql"),
            include_str!("../migrations/0002_document_editing.sql"),
        ]
        .iter()
        .enumerate()
        {
            c.execute_batch(sql).unwrap();
            let hash = Sha256::digest(sql.as_bytes())
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>();
            c.execute(
                "INSERT INTO platform_migrations VALUES(?1,?2,'2026-10-12T00:00:00Z')",
                rusqlite::params![(index + 1) as u32, hash],
            )
            .unwrap();
        }
        let workspace = id();
        let note = id();
        c.execute("INSERT INTO platform_meta VALUES(?1,2)", [&workspace])
            .unwrap();
        c.pragma_update(None, "user_version", 2).unwrap();
        c.execute("INSERT INTO platform_resources(id,kind,name,created_at,updated_at) VALUES(?1,'note','上一版本笔记','date','date')",[&note]).unwrap();
        c.execute("INSERT INTO platform_notes(resource_id,body_json,plain_text,schema_version,created_at,updated_at) VALUES(?1,?2,'升级前确认的内容',1,'date','date')",rusqlite::params![note,serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"升级前确认的内容"}]}]}).to_string()]).unwrap();
        if fail {
            c.execute_batch("CREATE TABLE platform_recent_visits(blocked INTEGER)")
                .unwrap();
        }
        drop(c);
        let result = Database::open(root.path());
        if fail {
            assert!(matches!(result,Err(ref e) if e.code==ErrorCode::MigrationFailed));
            let original =
                rusqlite::Connection::open(root.path().join("workspace.sqlite")).unwrap();
            assert_eq!(
                original
                    .pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
                    .unwrap(),
                2
            );
            assert_eq!(
                original
                    .query_row(
                        "SELECT plain_text FROM platform_notes WHERE resource_id=?1",
                        [&note],
                        |r| r.get::<_, String>(0)
                    )
                    .unwrap(),
                "升级前确认的内容"
            );
            assert!(
                !original
                    .prepare("SELECT 1 FROM sqlite_master WHERE name='platform_search_dirty'")
                    .unwrap()
                    .exists([])
                    .unwrap()
            );
        } else {
            let s = PlatformService::new(result.unwrap());
            assert_eq!(s.status(request()).await.unwrap().workspace_id, workspace);
            assert_eq!(
                s.get_note(ref_id(&note)).await.unwrap().plain_text,
                "升级前确认的内容"
            );
            assert_eq!(s.status(request()).await.unwrap().schema_version, 4);
        }
        let backups = std::fs::read_dir(root.path().join("backups"))
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect::<Vec<_>>();
        assert_eq!(backups.len(), 1);
        let mut zip = zip::ZipArchive::new(std::fs::File::open(&backups[0]).unwrap()).unwrap();
        let manifest: backup::Manifest =
            serde_json::from_reader(zip.by_name("manifest.json").unwrap()).unwrap();
        assert_eq!(manifest.schema_version, 2);
        assert_eq!(manifest.workspace_id, workspace);
        let mut bytes = Vec::new();
        zip.by_name("workspace.sqlite")
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        let exported = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(exported.path(), bytes).unwrap();
        let archived = rusqlite::Connection::open(exported.path()).unwrap();
        assert_eq!(
            archived
                .pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            archived
                .query_row(
                    "SELECT plain_text FROM platform_notes WHERE resource_id=?1",
                    [&note],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "升级前确认的内容"
        );
    }
}
#[tokio::test]
async fn backup_stream_cancels_inside_a_large_file_and_round_trips_the_complete_bytes() {
    let (root, db, _service) = setup().await;
    let bytes = (0..8 * 1024 * 1024)
        .map(|n| (n % 251) as u8)
        .collect::<Vec<_>>();
    let source = root.path().join("editing/large-fixture.bin");
    std::fs::write(&source, &bytes).unwrap();
    let cancelled = root.path().join("backups/stream-cancelled.moshub.zip");
    let path = cancelled.clone();
    let workspace = root.path().to_owned();
    let result = db
        .call(move |c| {
            let stop = AtomicBool::new(false);
            backup::snapshot(c, &workspace, &path, &stop, &|p| {
                if p > 0.31 && p < 0.6 {
                    stop.store(true, Ordering::Relaxed);
                }
            })
        })
        .await;
    assert_eq!(result.unwrap_err().code, ErrorCode::Cancelled);
    assert!(!cancelled.exists());
    assert_eq!(std::fs::read(&source).unwrap(), bytes);
    let archive = root.path().join("backups/stream-complete.moshub.zip");
    let path = archive.clone();
    let workspace = root.path().to_owned();
    let manifest = db
        .call(move |c| backup::snapshot(c, &workspace, &path, &AtomicBool::new(false), &|_| {}))
        .await
        .unwrap();
    assert_eq!(
        manifest
            .files
            .iter()
            .find(|entry| entry.path == "editing/large-fixture.bin")
            .unwrap()
            .size,
        bytes.len() as u64
    );
    let prepared =
        backup::inspect(root.path(), &archive, &AtomicBool::new(false), &|_| {}).unwrap();
    assert_eq!(
        std::fs::read(prepared.directory.path().join("editing/large-fixture.bin")).unwrap(),
        bytes
    );
}
fn request() -> Request {
    Request { request_id: id() }
}
fn ref_id(value: &str) -> IdRequest {
    IdRequest {
        request_id: id(),
        id: value.into(),
    }
}
fn query(keyword: &str) -> SearchQuery {
    SearchQuery {
        request_id: id(),
        keyword: keyword.into(),
        kind: None,
        project_id: None,
        tag: None,
        offset: 0,
        limit: 20,
    }
}
async fn setup() -> (tempfile::TempDir, Database, PlatformService) {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(dir.path()).unwrap();
    let service = PlatformService::new(db.clone());
    (dir, db, service)
}
#[tokio::test]
async fn chinese_search_filters_rebuild_deleted_content_and_archive_are_real() {
    let (_dir, db, s) = setup().await;
    let project = s
        .create_project(CreateProject {
            request_id: id(),
            name: "学习计划".into(),
            description: "阅读中文".into(),
        })
        .await
        .unwrap();
    let note = s
        .create_note(CreateNote {
            request_id: id(),
            title: "读书笔记".into(),
            project_id: Some(project.id.clone()),
        })
        .await
        .unwrap();
    s.save_note(SaveNote{request_id:id(),id:note.id.clone(),title:note.title,body:serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"春风吹过书页 ABC 123"}]}]}),schema_version:1,base_revision:1,client_edit_sequence:1,create_version:true}).await.unwrap();
    assert_eq!(
        s.search(query("风吹过")).await.unwrap().items[0].id,
        note.id
    );
    assert_eq!(
        s.search(query("ＡＢＣ")).await.unwrap().items[0].id,
        note.id
    );
    assert!(s.search(query("%_")).await.unwrap().items.is_empty());
    let mut filtered = query("春风");
    filtered.project_id = Some(project.id.clone());
    filtered.kind = Some("note".into());
    assert_eq!(s.search(filtered).await.unwrap().items.len(), 1);
    db.call(|c| {
        c.execute_batch("DROP TABLE platform_search_projection")?;
        Ok(())
    })
    .await
    .unwrap();
    s.rebuild_search(request()).await.unwrap();
    assert_eq!(s.search(query("春风")).await.unwrap().items.len(), 1);
    let p = s
        .update_project(UpdateProject {
            request_id: id(),
            id: project.id.clone(),
            name: project.name,
            description: project.description,
            status: ProjectStatus::Archived,
            base_revision: 1,
        })
        .await
        .unwrap();
    assert_eq!(s.search(query("学习计划")).await.unwrap().items[0].id, p.id);
    let resource = s.get_resource(ref_id(&note.id)).await.unwrap();
    s.set_resource_deleted(SetResourceDeleted {
        request_id: id(),
        id: note.id.clone(),
        base_revision: resource.revision,
        deleted: true,
    })
    .await
    .unwrap();
    assert!(s.search(query("春风")).await.unwrap().items.is_empty());
}
#[tokio::test]
async fn preferences_revision_conflict_invalid_shortcut_reset_and_location_survive_reopen() {
    let (dir, db, s) = setup().await;
    let note = s
        .create_note(CreateNote {
            request_id: id(),
            title: "恢复页面".into(),
            project_id: None,
        })
        .await
        .unwrap();
    let mut p = s.get_preferences(request()).await.unwrap();
    p.theme = "dark".into();
    p.font_size = 24;
    p.nickname = "小墨".into();
    let saved = s
        .save_preferences(SavePreferences {
            request_id: id(),
            base_revision: 1,
            preferences: p.clone(),
        })
        .await
        .unwrap();
    assert_eq!(saved.revision, 2);
    assert!(
        s.save_preferences(SavePreferences {
            request_id: id(),
            base_revision: 1,
            preferences: p.clone()
        })
        .await
        .is_err()
    );
    p.shortcuts.insert("search".into(), "S".into());
    assert!(
        s.save_preferences(SavePreferences {
            request_id: id(),
            base_revision: 2,
            preferences: p
        })
        .await
        .is_err()
    );
    s.save_location(SaveLocation {
        request_id: id(),
        location: PageLocation {
            page: "notes".into(),
            entity_id: Some(note.id.clone()),
        },
    })
    .await
    .unwrap();
    drop(s);
    drop(db);
    let db = Database::open(dir.path()).unwrap();
    let s = PlatformService::new(db);
    let startup = s.startup(request()).await.unwrap();
    assert_eq!(startup.preferences.theme, "dark");
    assert_eq!(startup.preferences.font_size, 24);
    assert_eq!(startup.location.entity_id, Some(note.id.clone()));
    let r = s.get_resource(ref_id(&note.id)).await.unwrap();
    s.set_resource_deleted(SetResourceDeleted {
        request_id: id(),
        id: note.id,
        base_revision: r.revision,
        deleted: true,
    })
    .await
    .unwrap();
    let startup = s.startup(request()).await.unwrap();
    assert_eq!(startup.location.page, "home");
    assert!(startup.notice.is_some());
    let reset = s.reset_preferences(request()).await.unwrap();
    assert!(reset.revision > 2);
    assert_eq!(reset.theme, "system");
    assert_eq!(s.status(request()).await.unwrap().note_count, 0);
}
#[tokio::test]
async fn trash_restore_and_purge_keep_shared_cover_and_history_references() {
    let (dir, db, s) = setup().await;
    let a = s
        .publish_generated_artifact(moshub_lib::platform::service::GeneratedArtifact {
            filename: "共享.md".into(),
            bytes: b"same bytes".to_vec(),
            source: "test".into(),
            description: String::new(),
            folder_id: None,
            project_id: None,
        })
        .await
        .unwrap();
    let b = s
        .publish_generated_artifact(moshub_lib::platform::service::GeneratedArtifact {
            filename: "另一份.md".into(),
            bytes: b"same bytes".to_vec(),
            source: "test".into(),
            description: String::new(),
            folder_id: None,
            project_id: None,
        })
        .await
        .unwrap();
    let deleted = s
        .set_resource_deleted(SetResourceDeleted {
            request_id: id(),
            id: a.id.clone(),
            base_revision: a.revision,
            deleted: true,
        })
        .await
        .unwrap();
    let m = TrashMutation {
        request_id: id(),
        kind: "file".into(),
        id: a.id.clone(),
        base_revision: deleted.revision,
    };
    let impact = s.delete_impact(m.clone()).await.unwrap();
    assert_eq!(impact.shared_blobs, 1);
    s.restore_trash(m).await.unwrap();
    assert_eq!(
        s.get_resource(ref_id(&a.id)).await.unwrap().sha256,
        b.sha256
    );
    let current = s.get_resource(ref_id(&a.id)).await.unwrap();
    let deleted = s
        .set_resource_deleted(SetResourceDeleted {
            request_id: id(),
            id: a.id,
            base_revision: current.revision,
            deleted: true,
        })
        .await
        .unwrap();
    s.purge_trash(TrashMutation {
        request_id: id(),
        kind: "file".into(),
        id: deleted.id,
        base_revision: deleted.revision,
    })
    .await
    .unwrap();
    assert!(s.preview_file(ref_id(&b.id)).await.is_ok());
    assert_eq!(
        std::fs::read_dir(dir.path().join("attachments"))
            .unwrap()
            .count(),
        1
    );
    let blob_count = db
        .call(|c| {
            Ok(c.query_row("SELECT count(*) FROM platform_blobs", [], |r| {
                r.get::<_, u32>(0)
            })?)
        })
        .await
        .unwrap();
    assert_eq!(blob_count, 1);
}
#[tokio::test]
async fn backup_new_install_restores_versions_drafts_settings_and_excludes_secrets() {
    let (dir, db, s) = setup().await;
    let file = s
        .create_document(CreateDocument {
            request_id: id(),
            name: "正文".into(),
            format: "md".into(),
            folder_id: None,
            project_id: None,
        })
        .await
        .unwrap();
    let session = s
        .begin_document_edit(BeginDocumentEdit {
            request_id: id(),
            id: file.id.clone(),
            base_revision: 1,
        })
        .await
        .unwrap();
    s.write_markdown_draft(WriteMarkdownDraft {
        request_id: id(),
        id: session.id.clone(),
        edit_sequence: 1,
        text: "已保存正文".into(),
    })
    .await
    .unwrap();
    s.commit_document_edit(CommitDocumentEdit {
        request_id: id(),
        id: session.id.clone(),
        base_revision: 1,
        edit_sequence: 1,
    })
    .await
    .unwrap();
    s.write_markdown_draft(WriteMarkdownDraft {
        request_id: id(),
        id: session.id.clone(),
        edit_sequence: 2,
        text: "尚未提交的中文".into(),
    })
    .await
    .unwrap();
    let project = s
        .create_project(CreateProject {
            request_id: id(),
            name: "完整恢复".into(),
            description: "关联必须保持".into(),
        })
        .await
        .unwrap();
    s.set_resource_project(SetResourceProject {
        request_id: id(),
        id: file.id.clone(),
        base_revision: 2,
        project_id: project.id.clone(),
        linked: true,
    })
    .await
    .unwrap();
    let note = s
        .create_note(CreateNote {
            request_id: id(),
            title: "中文阅读笔记".into(),
            project_id: Some(project.id.clone()),
        })
        .await
        .unwrap();
    s.save_note(SaveNote{request_id:id(),id:note.id.clone(),title:note.title.clone(),body:serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"完整恢复正文与关联"}]}]}),schema_version:1,base_revision:1,client_edit_sequence:1,create_version:true}).await.unwrap();
    let task = s
        .create_task(CreateTask {
            request_id: id(),
            title: "阅读任务".into(),
            description: "恢复任务归属".into(),
            status: TaskStatus::InProgress,
            priority: TaskPriority::High,
            due_date: Some("2026-10-12".into()),
            project_id: Some(project.id.clone()),
        })
        .await
        .unwrap();
    let settings = Preferences {
        theme: "dark".into(),
        nickname: "恢复设置".into(),
        font_size: 20,
        ..Preferences::default()
    };
    s.save_preferences(SavePreferences {
        request_id: id(),
        base_revision: 1,
        preferences: settings,
    })
    .await
    .unwrap();
    let mut offices = vec![];
    for format in ["docx", "xlsx"] {
        let r = s
            .create_document(CreateDocument {
                request_id: id(),
                name: format.into(),
                format: format.into(),
                folder_id: None,
                project_id: Some(project.id.clone()),
            })
            .await
            .unwrap();
        let c = s
            .begin_document_edit(BeginDocumentEdit {
                request_id: id(),
                id: r.id.clone(),
                base_revision: r.revision,
            })
            .await
            .unwrap();
        let path = moshub_lib::infrastructure::document_editing::copy_path(db.root(), &c).unwrap();
        offices.push((c.id.clone(), std::fs::read(path).unwrap()));
    }
    db.call(|c|{c.execute("INSERT INTO ai_connections(id,name,endpoint,model,secret_ref,created_at,updated_at) VALUES('test','连接','https://example.com','model','secret-do-not-export','date','date')",[])?;Ok(())}).await.unwrap();
    let path = dir.path().join("backups/manual.moshub.zip");
    let root = dir.path().to_owned();
    let export = path.clone();
    db.call(move |c| {
        backup::snapshot(c, &root, &export, &AtomicBool::new(false), &|_| {})?;
        Ok(())
    })
    .await
    .unwrap();
    let mut zip = zip::ZipArchive::new(std::fs::File::open(&path).unwrap()).unwrap();
    let mut manifest = String::new();
    zip.by_name("manifest.json")
        .unwrap()
        .read_to_string(&mut manifest)
        .unwrap();
    assert!(!manifest.contains("secret-do-not-export"));
    drop(zip);
    let new_dir = tempfile::tempdir().unwrap();
    let new_db = Database::open(new_dir.path()).unwrap();
    let prepared =
        backup::inspect(new_dir.path(), &path, &AtomicBool::new(false), &|_| {}).unwrap();
    assert_eq!(prepared.projects, 1);
    assert_eq!(prepared.resources, 4);
    assert_eq!(prepared.tasks, 1);
    let root = new_dir.path().to_owned();
    new_db
        .call(move |c| backup::replace(c, &root, prepared))
        .await
        .unwrap();
    let fresh = PlatformService::new(new_db.clone());
    assert_eq!(
        fresh.status(request()).await.unwrap().workspace_id,
        s.status(request()).await.unwrap().workspace_id
    );
    assert_eq!(
        fresh.get_note(ref_id(&note.id)).await.unwrap().plain_text,
        "完整恢复正文与关联"
    );
    let restored_task = fresh.get_task(ref_id(&task.id)).await.unwrap();
    assert_eq!(restored_task.project_id, Some(project.id.clone()));
    assert_eq!(restored_task.due_date, Some("2026-10-12".into()));
    assert_eq!(restored_task.status, TaskStatus::InProgress);
    let settings = fresh.get_preferences(request()).await.unwrap();
    assert_eq!(settings.theme, "dark");
    assert_eq!(settings.nickname, "恢复设置");
    assert_eq!(settings.font_size, 20);
    for (id, bytes) in offices {
        let c = fresh.get_document_session(ref_id(&id)).await.unwrap();
        let path =
            moshub_lib::infrastructure::document_editing::copy_path(fresh.data_root(), &c).unwrap();
        assert_eq!(std::fs::read(path).unwrap(), bytes);
    }
    let restored = fresh
        .get_document_session(ref_id(&session.id))
        .await
        .unwrap();
    assert_eq!(restored.markdown.as_deref(), Some("尚未提交的中文"));
    assert_eq!(
        fresh
            .get_resource(ref_id(&file.id))
            .await
            .unwrap()
            .project_ids,
        vec![project.id]
    );
    assert!(
        !fresh
            .list_file_versions(VersionQuery {
                request_id: id(),
                id: file.id,
                offset: 0,
                limit: 20
            })
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        new_db
            .call(|c| Ok(c.query_row(
                "SELECT count(*) FROM ai_connections WHERE secret_ref IS NOT NULL",
                [],
                |r| r.get::<_, u32>(0)
            )?))
            .await
            .unwrap(),
        0
    );
}
#[tokio::test]
async fn bad_backup_and_failed_switch_preserve_original_and_cancel_publishes_nothing() {
    let (dir, db, s) = setup().await;
    let p = s
        .create_project(CreateProject {
            request_id: id(),
            name: "原空间".into(),
            description: String::new(),
        })
        .await
        .unwrap();
    let path = dir.path().join("backups/good.moshub.zip");
    let root = dir.path().to_owned();
    let output = path.clone();
    db.call(move |c| {
        backup::snapshot(c, &root, &output, &AtomicBool::new(false), &|_| {})?;
        Ok(())
    })
    .await
    .unwrap();
    let malicious = dir.path().join("backups/bad.zip");
    let mut w = zip::ZipWriter::new(std::fs::File::create(&malicious).unwrap());
    w.start_file("../escape", zip::write::SimpleFileOptions::default())
        .unwrap();
    w.write_all(b"unsafe").unwrap();
    w.finish().unwrap();
    assert!(backup::inspect(dir.path(), &malicious, &AtomicBool::new(false), &|_| {}).is_err());
    let prepared = backup::inspect(dir.path(), &path, &AtomicBool::new(false), &|_| {}).unwrap();
    std::fs::remove_dir_all(prepared.directory.path().join("editing")).unwrap();
    let root = dir.path().to_owned();
    assert!(
        db.call(move |c| backup::replace(c, &root, prepared))
            .await
            .is_err()
    );
    assert_eq!(s.get_project(ref_id(&p.id)).await.unwrap().name, "原空间");
    assert!(!dir.path().join("restore-journal.json").exists());
    let root = dir.path().to_owned();
    let canceled = dir.path().join("backups/cancelled.moshub.zip");
    let output = canceled.clone();
    assert!(
        db.call(move |c| backup::snapshot(c, &root, &output, &AtomicBool::new(true), &|_| {}))
            .await
            .is_err()
    );
    assert!(!canceled.exists());
}
struct Lifecycle {
    fail: AtomicBool,
    dirty: AtomicBool,
}
impl ModuleLifecycle for Lifecycle {
    fn initialize(&self) -> AppResult<()> {
        if self.fail.load(Ordering::Relaxed) {
            Err(AppError::validation("测试初始化失败"))
        } else {
            Ok(())
        }
    }
    fn flush_and_stop(&self) -> AppResult<()> {
        if self.dirty.load(Ordering::Relaxed) {
            Err(AppError::validation("测试保存失败"))
        } else {
            Ok(())
        }
    }
}
#[test]
fn development_module_validates_manifest_failure_isolation_and_stop_preserves_ready() {
    let mut registry = Registry::new();
    let lifecycle = Arc::new(Lifecycle {
        fail: AtomicBool::new(true),
        dirty: AtomicBool::new(false),
    });
    let info = ModuleInfo {
        id: "test-module".into(),
        name: "仅测试模块".into(),
        description: String::new(),
        version: "1.0".into(),
        api_version: 1,
        data_schema_version: 1,
        requested_services: vec!["projects.read".into()],
        state: String::new(),
        enabled: false,
        error_code: None,
        data_bytes: 0,
    };
    registry.register(info.clone(), lifecycle.clone()).unwrap();
    assert!(registry.register(info, lifecycle.clone()).is_err());
    assert!(registry.set_enabled("test-module", true).is_err());
    assert!(registry.require_ready("test-module").is_err());
    lifecycle.fail.store(false, Ordering::Relaxed);
    registry.set_enabled("test-module", true).unwrap();
    lifecycle.dirty.store(true, Ordering::Relaxed);
    assert!(registry.set_enabled("test-module", false).is_err());
    registry.require_ready("test-module").unwrap();
    lifecycle.dirty.store(false, Ordering::Relaxed);
    registry.set_enabled("test-module", false).unwrap();
    assert!(registry.require_ready("test-module").is_err());
}
fn rewrite_backup(
    source: &std::path::Path,
    target: &std::path::Path,
    alter: impl Fn(&mut serde_json::Value),
) {
    let mut z = zip::ZipArchive::new(std::fs::File::open(source).unwrap()).unwrap();
    let mut files = vec![];
    for i in 0..z.len() {
        let mut f = z.by_index(i).unwrap();
        let name = f.name().to_string();
        let mut bytes = vec![];
        f.read_to_end(&mut bytes).unwrap();
        files.push((name, bytes));
    }
    let mut w = zip::ZipWriter::new(std::fs::File::create(target).unwrap());
    for (name, mut data) in files {
        if name == "manifest.json" {
            let mut value: serde_json::Value = serde_json::from_slice(&data).unwrap();
            alter(&mut value);
            data = serde_json::to_vec(&value).unwrap();
        }
        w.start_file(name, zip::write::SimpleFileOptions::default())
            .unwrap();
        w.write_all(&data).unwrap();
    }
    w.finish().unwrap();
}
#[tokio::test]
async fn future_hash_missing_and_traversal_manifests_are_rejected_before_changing_space() {
    let (dir, db, s) = setup().await;
    let file = s
        .create_document(CreateDocument {
            request_id: id(),
            name: "保留原件".into(),
            format: "md".into(),
            folder_id: None,
            project_id: None,
        })
        .await
        .unwrap();
    let good = dir.path().join("backups/good.moshub.zip");
    let root = dir.path().to_owned();
    let path = good.clone();
    db.call(move |c| backup::snapshot(c, &root, &path, &AtomicBool::new(false), &|_| {}))
        .await
        .unwrap();
    for case in ["future", "schema", "hash", "size", "missing", "traversal"] {
        let bad = dir.path().join(format!("backups/{case}.zip"));
        rewrite_backup(&good, &bad, |m| match case {
            "future" => m["backupFormatVersion"] = 99.into(),
            "schema" => m["schemaVersion"] = 99.into(),
            "hash" => m["files"][0]["sha256"] = "0".repeat(64).into(),
            "size" => m["files"][0]["size"] = (11u64 * 1024 * 1024 * 1024).into(),
            "missing" => {
                m["files"].as_array_mut().unwrap().pop();
            }
            "traversal" => m["files"][0]["path"] = "../outside".into(),
            _ => unreachable!(),
        });
        assert_eq!(
            backup::inspect(dir.path(), &bad, &AtomicBool::new(false), &|_| {})
                .err()
                .unwrap()
                .code,
            ErrorCode::BackupInvalid
        );
        assert_eq!(s.get_resource(ref_id(&file.id)).await.unwrap().revision, 1);
    }
    assert!(!dir.path().parent().unwrap().join("outside").exists());
}
async fn wait_job(s: &PlatformService, value: &Job) -> Job {
    let start = std::time::Instant::now();
    loop {
        tokio::task::yield_now().await;
        let jobs = s.list_jobs(request()).await.unwrap();
        if let Some(found) = jobs.into_iter().find(|j| j.id == value.id)
            && !["pending", "running"].contains(&found.status.as_str())
        {
            return found;
        }
        assert!(
            start.elapsed() < std::time::Duration::from_secs(5),
            "job never finished"
        );
    }
}
#[tokio::test]
async fn automatic_backup_daily_dedup_retention_and_failed_job_keep_previous_success() {
    let (dir, _db, s) = setup().await;
    let first = s.start_backup(request()).await.unwrap();
    assert_eq!(wait_job(&s, &first).await.status, "succeeded");
    let source = s.backup_path(&first.id).unwrap();
    for day in 1..=8 {
        std::fs::copy(
            &source,
            dir.path()
                .join("backups")
                .join(format!("auto-2020-01-{day:02}-{}.moshub.zip", id())),
        )
        .unwrap();
    }
    let automatic = s.automatic_backup(request()).await.unwrap().unwrap();
    assert_eq!(wait_job(&s, &automatic).await.status, "succeeded");
    assert!(s.automatic_backup(request()).await.unwrap().is_none());
    assert_eq!(
        s.list_backups(request())
            .await
            .unwrap()
            .into_iter()
            .filter(|b| b.automatic)
            .count(),
        7
    );
    let file = s
        .create_document(CreateDocument {
            request_id: id(),
            name: "损坏文件".into(),
            format: "md".into(),
            folder_id: None,
            project_id: None,
        })
        .await
        .unwrap();
    let mut blobs = std::fs::read_dir(dir.path().join("attachments")).unwrap();
    let path = blobs.next().unwrap().unwrap().path();
    std::fs::write(path, b"tampered").unwrap();
    let failing = s.start_backup(request()).await.unwrap();
    let result = wait_job(&s, &failing).await;
    assert_eq!(result.status, "failed");
    assert_eq!(result.error_code, Some(ErrorCode::BackupInvalid));
    assert!(source.exists());
    assert_eq!(s.get_resource(ref_id(&file.id)).await.unwrap().revision, 1);
    assert_eq!(s.list_backups(request()).await.unwrap().len(), 8);
}
struct PersistentLifecycle;
impl ModuleLifecycle for PersistentLifecycle {
    fn migrate(&self, c: &rusqlite::Transaction) -> AppResult<()> {
        c.execute_batch("CREATE TABLE IF NOT EXISTS development_module_records(id TEXT PRIMARY KEY,value TEXT); INSERT OR IGNORE INTO development_module_records VALUES('one','模块自己的数据');")?;
        Ok(())
    }
    fn initialize(&self) -> AppResult<()> {
        Ok(())
    }
    fn flush_and_stop(&self) -> AppResult<()> {
        Ok(())
    }
}
fn module_info() -> ModuleInfo {
    ModuleInfo {
        id: "development-check".into(),
        name: "开发验证模块".into(),
        description: String::new(),
        version: "1.0".into(),
        api_version: 1,
        data_schema_version: 1,
        requested_services: vec!["projects.read".into()],
        state: String::new(),
        enabled: false,
        error_code: None,
        data_bytes: 0,
    }
}
#[tokio::test]
async fn module_migration_state_query_and_restart_preserve_platform_and_module_data() {
    let (dir, db, s) = setup().await;
    s.register_module(module_info(), Arc::new(PersistentLifecycle))
        .await
        .unwrap();
    s.set_module(SetModule {
        request_id: id(),
        id: "development-check".into(),
        enabled: true,
    })
    .await
    .unwrap();
    s.modules
        .lock()
        .unwrap()
        .require_ready("development-check")
        .unwrap();
    let p = s
        .create_project(CreateProject {
            request_id: id(),
            name: "模块不影响平台".into(),
            description: String::new(),
        })
        .await
        .unwrap();
    s.set_module(SetModule {
        request_id: id(),
        id: "development-check".into(),
        enabled: false,
    })
    .await
    .unwrap();
    assert!(
        s.modules
            .lock()
            .unwrap()
            .require_ready("development-check")
            .is_err()
    );
    assert_eq!(
        s.get_project(ref_id(&p.id)).await.unwrap().name,
        "模块不影响平台"
    );
    s.set_module(SetModule {
        request_id: id(),
        id: "development-check".into(),
        enabled: true,
    })
    .await
    .unwrap();
    s.save_location(SaveLocation {
        request_id: id(),
        location: PageLocation {
            page: "module".into(),
            entity_id: Some("development-check".into()),
        },
    })
    .await
    .unwrap();
    assert_eq!(s.startup(request()).await.unwrap().location.page, "module");
    drop(s);
    drop(db);
    let db = Database::open(dir.path()).unwrap();
    let s = PlatformService::new(db.clone());
    s.register_module(module_info(), Arc::new(PersistentLifecycle))
        .await
        .unwrap();
    assert_eq!(s.list_modules(request()).await.unwrap()[0].state, "ready");
    assert_eq!(
        db.call(|c| Ok(c.query_row(
            "SELECT value FROM development_module_records WHERE id='one'",
            [],
            |r| r.get::<_, String>(0)
        )?))
        .await
        .unwrap(),
        "模块自己的数据"
    );
    assert!(s.get_project(ref_id(&p.id)).await.is_ok());
    assert_eq!(s.startup(request()).await.unwrap().location.page, "module");
    s.set_module(SetModule {
        request_id: id(),
        id: "development-check".into(),
        enabled: false,
    })
    .await
    .unwrap();
    assert_eq!(s.startup(request()).await.unwrap().location.page, "home");
}
#[tokio::test]
async fn startup_rolls_back_uncommitted_restore_journal_before_opening_database() {
    let (dir, db, s) = setup().await;
    let p = s
        .create_project(CreateProject {
            request_id: id(),
            name: "切换前原项目".into(),
            description: String::new(),
        })
        .await
        .unwrap();
    drop(s);
    drop(db);
    let root = dir.path();
    let name = format!("restore-old-{}", id());
    let old = root.join(&name);
    std::fs::create_dir(&old).unwrap();
    std::fs::write(
        root.join("restore-journal.json"),
        serde_json::to_vec(&serde_json::json!({"old":name,"committed":false})).unwrap(),
    )
    .unwrap();
    std::fs::rename(root.join("workspace.sqlite"), old.join("workspace.sqlite")).unwrap();
    std::fs::rename(root.join("attachments"), old.join("attachments")).unwrap();
    std::fs::write(root.join("workspace.sqlite"), b"incomplete replacement").unwrap();
    let db = Database::open(root).unwrap();
    let s = PlatformService::new(db);
    assert_eq!(
        s.get_project(ref_id(&p.id)).await.unwrap().name,
        "切换前原项目"
    );
    assert!(!root.join("restore-journal.json").exists());
    assert!(!old.exists());
}
#[tokio::test]
async fn file_io_cancellation_preserves_destination_and_backup_export_cannot_overwrite_space() {
    let (dir, db, s) = setup().await;
    let source = dir.path().join("source.txt");
    std::fs::write(&source, vec![b'a'; 200_000]).unwrap();
    let store = moshub_lib::infrastructure::attachments::AttachmentStore::new(db.root().to_owned());
    let imported = store.import_observed(&source, &|progress| {
        if progress > 0.1 {
            Err(AppError::new(ErrorCode::Cancelled, "测试取消", false))
        } else {
            Ok(())
        }
    });
    assert_eq!(imported.err().unwrap().code, ErrorCode::Cancelled);
    assert_eq!(
        std::fs::read_dir(dir.path().join("attachments"))
            .unwrap()
            .count(),
        0
    );
    let external = tempfile::tempdir().unwrap();
    let destination = external.path().join("existing.txt");
    std::fs::write(&destination, b"original").unwrap();
    assert!(
        store
            .export_bytes_observed(&vec![b'b'; 200_000], &destination, &|p| if p > 0.1 {
                Err(AppError::new(ErrorCode::Cancelled, "测试取消", false))
            } else {
                Ok(())
            })
            .is_err()
    );
    assert_eq!(std::fs::read(&destination).unwrap(), b"original");
    let job = s.start_backup(request()).await.unwrap();
    assert_eq!(wait_job(&s, &job).await.status, "succeeded");
    assert!(
        s.export_backup_file(ref_id(&job.id), dir.path().join("workspace.sqlite"))
            .await
            .is_err()
    );
    assert_eq!(
        db.call(|c| Ok(c.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0))?))
            .await
            .unwrap(),
        "ok"
    );
    s.export_backup_file(ref_id(&job.id), external.path().join("backup.moshub.zip"))
        .await
        .unwrap();
    assert_eq!(
        std::fs::read(s.backup_path(&job.id).unwrap()).unwrap(),
        std::fs::read(external.path().join("backup.moshub.zip")).unwrap()
    );
}
