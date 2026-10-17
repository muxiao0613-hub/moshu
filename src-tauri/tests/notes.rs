use moshub_lib::{
    contracts::*, infrastructure::database::Database, platform::service::PlatformService,
};
use serde_json::{Value, json};
use tempfile::TempDir;
fn uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn id(id: &str) -> IdRequest {
    IdRequest {
        request_id: uuid(),
        id: id.into(),
    }
}
fn page() -> ListRequest {
    ListRequest {
        request_id: uuid(),
        offset: 0,
        limit: 100,
    }
}
fn body(text: &str) -> Value {
    json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]})
}
fn setup() -> (TempDir, Database, PlatformService) {
    let root = TempDir::new().unwrap();
    let db = Database::open(root.path()).unwrap();
    let svc = PlatformService::new(db.clone());
    (root, db, svc)
}
async fn create(s: &PlatformService) -> Note {
    s.create_note(CreateNote {
        request_id: uuid(),
        title: "版本笔记".into(),
        project_id: None,
    })
    .await
    .unwrap()
}
fn save(n: &Note, text: &str, manual: bool) -> SaveNote {
    SaveNote {
        request_id: uuid(),
        id: n.id.clone(),
        title: n.title.clone(),
        body: body(text),
        schema_version: 1,
        base_revision: n.revision,
        client_edit_sequence: 3,
        create_version: manual,
    }
}
fn draft(n: &Note, seq: u64, text: &str) -> NoteDraft {
    NoteDraft {
        session_id: uuid(),
        note_id: n.id.clone(),
        base_revision: n.revision,
        client_edit_sequence: seq,
        title: n.title.clone(),
        body: body(text),
        schema_version: 1,
    }
}
async fn versions(s: &PlatformService, n: &Note) -> Vec<NoteVersionSummary> {
    s.list_note_versions(VersionQuery {
        request_id: uuid(),
        id: n.id.clone(),
        offset: 0,
        limit: 100,
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn manual_versions_restore_preserve_both_sides_and_survive_reopen() {
    let (root, db, s) = setup();
    let n = create(&s).await;
    s.save_note(save(&n, "手动稿", true)).await.unwrap();
    let n = s.get_note(id(&n.id)).await.unwrap();
    let history = versions(&s, &n).await;
    assert_eq!(
        history
            .iter()
            .map(|v| v.source_revision)
            .collect::<Vec<_>>(),
        vec![2, 1]
    );
    s.save_note(save(&n, "后续自动稿", false)).await.unwrap();
    let current = s.get_note(id(&n.id)).await.unwrap();
    assert_eq!(versions(&s, &n).await.len(), 2);
    let restored = s
        .restore_note_version(RestoreVersion {
            request_id: uuid(),
            id: n.id.clone(),
            version_id: history[0].id.clone(),
            base_revision: current.revision,
        })
        .await
        .unwrap();
    assert_eq!(restored.plain_text, "手动稿");
    assert_eq!(restored.revision, 4);
    let history = versions(&s, &n).await;
    assert_eq!(history.len(), 4);
    let previous = history.iter().find(|v| v.source_revision == 3).unwrap();
    assert_eq!(
        s.get_note_version(VersionRequest {
            request_id: uuid(),
            id: n.id.clone(),
            version_id: previous.id.clone()
        })
        .await
        .unwrap()
        .plain_text,
        "后续自动稿"
    );
    assert_eq!(
        s.restore_note_version(RestoreVersion {
            request_id: uuid(),
            id: n.id.clone(),
            version_id: history[0].id.clone(),
            base_revision: 3
        })
        .await
        .unwrap_err()
        .code,
        ErrorCode::Conflict
    );
    let other = create(&s).await;
    assert_eq!(
        s.get_note_version(VersionRequest {
            request_id: uuid(),
            id: other.id,
            version_id: history[0].id.clone()
        })
        .await
        .unwrap_err()
        .code,
        ErrorCode::NotFound
    );
    let immutable = db
        .call(|c| {
            c.execute("UPDATE platform_note_versions SET title='changed'", [])?;
            Ok(())
        })
        .await;
    assert!(immutable.is_err());
    drop(s);
    drop(db);
    let s = PlatformService::new(Database::open(root.path()).unwrap());
    assert_eq!(s.get_note(id(&n.id)).await.unwrap().plain_text, "手动稿");
    assert_eq!(versions(&s, &n).await.len(), 4);
}
#[tokio::test]
async fn ignored_resource_or_snapshot_write_rolls_back_entire_save() {
    let (_root, db, s) = setup();
    let n = create(&s).await;
    db.call(|c|{c.execute_batch("CREATE TRIGGER ignore_resource BEFORE UPDATE ON platform_resources BEGIN SELECT RAISE(IGNORE); END;")?;Ok(())}).await.unwrap();
    assert_eq!(
        s.save_note(save(&n, "未提交", true))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(s.get_note(id(&n.id)).await.unwrap().revision, 1);
    assert!(versions(&s, &n).await.is_empty());
    db.call(|c|{c.execute_batch("DROP TRIGGER ignore_resource; CREATE TRIGGER ignore_version BEFORE INSERT ON platform_note_versions WHEN NEW.source_revision=2 BEGIN SELECT RAISE(IGNORE); END;")?;Ok(())}).await.unwrap();
    assert_eq!(
        s.save_note(save(&n, "也未提交", true))
            .await
            .unwrap_err()
            .code,
        ErrorCode::DbError
    );
    assert_eq!(s.get_note(id(&n.id)).await.unwrap().plain_text, "");
    assert!(versions(&s, &n).await.is_empty());
}
#[tokio::test]
async fn draft_sequence_checks_checksum_workspace_and_conditional_cleanup() {
    let (root, db, s) = setup();
    let n = create(&s).await;
    let mut d = draft(&n, 2, "最新恢复稿");
    s.write_note_draft(WriteDraft {
        request_id: uuid(),
        draft: d.clone(),
    })
    .await
    .unwrap();
    let mut older = d.clone();
    older.client_edit_sequence = 1;
    older.body = body("过时输入");
    s.write_note_draft(WriteDraft {
        request_id: uuid(),
        draft: older,
    })
    .await
    .unwrap();
    s.discard_note_draft(DiscardDraft {
        request_id: uuid(),
        id: d.session_id.clone(),
        through_sequence: Some(1),
    })
    .await
    .unwrap();
    assert_eq!(
        s.get_note_draft(id(&d.session_id)).await.unwrap().body,
        body("最新恢复稿")
    );
    assert_eq!(s.get_note(id(&n.id)).await.unwrap().revision, 1);
    let file = root
        .path()
        .join("drafts")
        .join(format!("{}.json", d.session_id));
    let bytes = std::fs::read(&file).unwrap();
    let mut corrupt: Value = serde_json::from_slice(&bytes).unwrap();
    corrupt["checksum"] = json!("wrong");
    std::fs::write(&file, serde_json::to_vec(&corrupt).unwrap()).unwrap();
    assert_eq!(
        s.list_note_drafts(page()).await.unwrap()[0]
            .issue
            .as_deref(),
        Some("草稿校验失败，文件已保留。")
    );
    assert_eq!(
        s.get_note_draft(id(&d.session_id)).await.unwrap_err().code,
        ErrorCode::IoError
    );
    assert!(file.exists());
    assert!(
        s.write_note_draft(WriteDraft {
            request_id: uuid(),
            draft: d.clone()
        })
        .await
        .is_err()
    );
    std::fs::write(&file, &bytes).unwrap();
    let (other_root, _other_db, other) = setup();
    std::fs::write(
        other_root
            .path()
            .join("drafts")
            .join(format!("{}.json", d.session_id)),
        &bytes,
    )
    .unwrap();
    assert!(other.get_note_draft(id(&d.session_id)).await.is_err());
    drop(s);
    drop(db);
    let s = PlatformService::new(Database::open(root.path()).unwrap());
    assert_eq!(
        s.get_note_draft(id(&d.session_id))
            .await
            .unwrap()
            .client_edit_sequence,
        2
    );
    d.client_edit_sequence = 3;
    d.body = body("再编辑");
    s.write_note_draft(WriteDraft {
        request_id: uuid(),
        draft: d.clone(),
    })
    .await
    .unwrap();
    s.discard_note_draft(DiscardDraft {
        request_id: uuid(),
        id: d.session_id.clone(),
        through_sequence: Some(2),
    })
    .await
    .unwrap();
    assert!(file.exists());
    s.discard_note_draft(DiscardDraft {
        request_id: uuid(),
        id: d.session_id,
        through_sequence: Some(3),
    })
    .await
    .unwrap();
    assert!(!file.exists());
}
#[tokio::test]
async fn recovery_copy_is_atomic_and_does_not_overwrite_newer_or_deleted_note() {
    let (_root, db, s) = setup();
    let n = create(&s).await;
    let d = draft(&n, 8, "崩溃前的输入");
    s.write_note_draft(WriteDraft {
        request_id: uuid(),
        draft: d.clone(),
    })
    .await
    .unwrap();
    s.save_note(save(&n, "数据库新稿", false)).await.unwrap();
    let current = s.get_note(id(&n.id)).await.unwrap();
    assert_eq!(
        s.save_note(save(&n, "旧稿覆盖", true))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let copied = s.copy_note_draft(id(&d.session_id)).await.unwrap();
    assert_ne!(copied.id, n.id);
    assert_eq!(copied.plain_text, "崩溃前的输入");
    assert_eq!(
        s.get_note(id(&n.id)).await.unwrap().plain_text,
        "数据库新稿"
    );
    let resource = s.get_resource(id(&n.id)).await.unwrap();
    s.set_resource_deleted(SetResourceDeleted {
        request_id: uuid(),
        id: n.id.clone(),
        base_revision: resource.revision,
        deleted: true,
    })
    .await
    .unwrap();
    assert!(s.get_note(id(&n.id)).await.is_err());
    assert_eq!(
        s.copy_note_draft(id(&d.session_id))
            .await
            .unwrap()
            .plain_text,
        "崩溃前的输入"
    );
    let count = s.list_notes(page()).await.unwrap().len();
    db.call(|c|{c.execute_batch("CREATE TRIGGER failed_copy BEFORE INSERT ON platform_notes BEGIN SELECT RAISE(IGNORE); END;")?;Ok(())}).await.unwrap();
    assert!(s.copy_note_draft(id(&d.session_id)).await.is_err());
    assert_eq!(s.list_notes(page()).await.unwrap().len(), count);
    let orphans:u32=db.call(|c|Ok(c.query_row("SELECT count(*) FROM platform_resources r LEFT JOIN platform_notes n ON r.id=n.resource_id WHERE r.kind='note' AND n.resource_id IS NULL",[],|r|r.get(0))?)).await.unwrap();
    assert_eq!(orphans, 0);
    assert_eq!(current.revision, 2);
}
#[tokio::test]
async fn export_real_utf8_files_preserves_format_escapes_html_and_checks_revision() {
    let (root, _db, s) = setup();
    let n = create(&s).await;
    let mut input = save(&n, "", false);
    input.body = json!({"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"中文标题"}]},{"type":"paragraph","content":[{"type":"text","text":"<script>*中文*","marks":[{"type":"bold"}]},{"type":"text","text":"链接","marks":[{"type":"link","attrs":{"href":"https://example.com/?a=1&b=2"}}]}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"列表项"}]}]}]},{"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"引用"}]}]}]});
    s.save_note(input).await.unwrap();
    let current = s.get_note(id(&n.id)).await.unwrap();
    let out = TempDir::new().unwrap();
    let export = ExportNote {
        request_id: uuid(),
        id: n.id.clone(),
        base_revision: 2,
        format: NoteExportFormat::Markdown,
    };
    let path = out.path().join("中文笔记.md");
    s.export_note_to(export.clone(), path.clone())
        .await
        .unwrap();
    let actual = std::fs::read_to_string(path).unwrap();
    assert_eq!(
        actual,
        "# 版本笔记\n\n## 中文标题\n\n**&lt;script&gt;\\*中文\\***[链接](<https://example.com/?a=1&b=2>)\n\n- 列表项\n\n> 引用\n"
    );
    let txt = out.path().join("正文.txt");
    s.export_note_to(
        ExportNote {
            format: NoteExportFormat::Txt,
            ..export.clone()
        },
        txt.clone(),
    )
    .await
    .unwrap();
    assert_eq!(
        std::fs::read_to_string(&txt).unwrap(),
        format!("{}\n\n{}\n", current.title, current.plain_text)
    );
    assert_eq!(
        s.export_note_to(export.clone(), root.path().join("drafts/unsafe.md"))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );
    s.save_note(save(&current, "新正文", false)).await.unwrap();
    let before = std::fs::read(&txt).unwrap();
    assert_eq!(
        s.export_note_to(export, txt.clone())
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(std::fs::read(txt).unwrap(), before);
}
#[cfg(unix)]
#[tokio::test]
async fn draft_symlink_and_directory_escape_are_rejected() {
    let (root, _db, s) = setup();
    let n = create(&s).await;
    let d = draft(&n, 1, "原稿");
    let out = TempDir::new().unwrap();
    let target = out.path().join("original.json");
    std::fs::write(&target, b"keep").unwrap();
    std::os::unix::fs::symlink(
        &target,
        root.path()
            .join("drafts")
            .join(format!("{}.json", d.session_id)),
    )
    .unwrap();
    assert!(
        s.write_note_draft(WriteDraft {
            request_id: uuid(),
            draft: d.clone()
        })
        .await
        .is_err()
    );
    assert!(
        s.discard_note_draft(DiscardDraft {
            request_id: uuid(),
            id: d.session_id,
            through_sequence: None
        })
        .await
        .is_err()
    );
    assert_eq!(std::fs::read(target).unwrap(), b"keep");
    assert_eq!(
        s.get_note_draft(id("../../workspace.sqlite"))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );
}
#[test]
fn draft_crash_helper() {
    let Some(path) = std::env::var_os("MOSHUB_TEST_CRASH_ROOT") else {
        return;
    };
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async {
        let s = PlatformService::new(Database::open(std::path::Path::new(&path)).unwrap());
        let n = create(&s).await;
        let d = draft(&n, 7, "强制退出前的中文恢复稿");
        s.write_note_draft(WriteDraft {
            request_id: uuid(),
            draft: d.clone(),
        })
        .await
        .unwrap();
        std::fs::write(
            std::path::Path::new(&path).join("ready.tmp"),
            serde_json::to_vec(&d).unwrap(),
        )
        .unwrap();
        // Publish readiness only after the JSON marker is complete; the parent may kill immediately.
        std::fs::rename(
            std::path::Path::new(&path).join("ready.tmp"),
            std::path::Path::new(&path).join("ready"),
        )
        .unwrap();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    });
}
#[tokio::test]
async fn abruptly_killed_writer_leaves_checksum_valid_recoverable_draft_and_original_database() {
    let root = TempDir::new().unwrap();
    let mut child = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "draft_crash_helper", "--nocapture"])
        .env("MOSHUB_TEST_CRASH_ROOT", root.path())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let ready = root.path().join("ready");
    for _ in 0..500 {
        if ready.exists() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    child.kill().unwrap();
    child.wait().unwrap();
    assert!(ready.exists(), "child did not finish checkpoint");
    let d: NoteDraft = serde_json::from_slice(&std::fs::read(ready).unwrap()).unwrap();
    let s = PlatformService::new(Database::open(root.path()).unwrap());
    assert_eq!(
        s.get_note_draft(id(&d.session_id)).await.unwrap().body,
        body("强制退出前的中文恢复稿")
    );
    assert_eq!(s.get_note(id(&d.note_id)).await.unwrap().revision, 1);
    assert_eq!(s.list_note_drafts(page()).await.unwrap().len(), 1);
}

#[tokio::test]
async fn notes_and_versions_paginate_beyond_first_hundred_without_duplicates() {
    let (_root, _db, s) = setup();
    let mut ids = std::collections::HashSet::new();
    for _ in 0..105 {
        ids.insert(create(&s).await.id);
    }
    let mut found = std::collections::HashSet::new();
    for offset in (0..120).step_by(20) {
        for n in s
            .list_notes(ListRequest {
                request_id: uuid(),
                offset,
                limit: 20,
            })
            .await
            .unwrap()
        {
            assert!(found.insert(n.id));
        }
    }
    assert_eq!(ids, found);
    let mut n = create(&s).await;
    for i in 0..53 {
        s.save_note(save(&n, &format!("手动稿 {i}"), true))
            .await
            .unwrap();
        n = s.get_note(id(&n.id)).await.unwrap();
    }
    let mut found = std::collections::HashSet::new();
    for offset in (0..120).step_by(20) {
        for v in s
            .list_note_versions(VersionQuery {
                request_id: uuid(),
                id: n.id.clone(),
                offset,
                limit: 20,
            })
            .await
            .unwrap()
        {
            assert!(found.insert(v.id));
        }
    }
    assert_eq!(found.len(), 106);
}
