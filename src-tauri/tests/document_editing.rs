use moshub_lib::{
    contracts::*,
    infrastructure::{
        database::{Database, initialize},
        document_editing::{copy_path, hash},
    },
    platform::service::PlatformService,
};
use std::{
    io::{Cursor, Write},
    path::Path,
};
use tempfile::TempDir;
fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn req(value: &str) -> IdRequest {
    IdRequest {
        request_id: id(),
        id: value.into(),
    }
}
async fn create(s: &PlatformService, format: &str) -> Resource {
    s.create_document(CreateDocument {
        request_id: id(),
        name: "编辑测试".into(),
        format: format.into(),
        folder_id: None,
        project_id: None,
    })
    .await
    .unwrap()
}
async fn begin(s: &PlatformService, r: &Resource) -> DocumentSession {
    s.begin_document_edit(BeginDocumentEdit {
        request_id: id(),
        id: r.id.clone(),
        base_revision: r.revision,
    })
    .await
    .unwrap()
}
async fn draft(
    s: &PlatformService,
    c: &DocumentSession,
    sequence: u64,
    text: &str,
) -> DocumentSession {
    s.write_markdown_draft(WriteMarkdownDraft {
        request_id: id(),
        id: c.id.clone(),
        edit_sequence: sequence,
        text: text.into(),
    })
    .await
    .unwrap()
}
fn commit(c: &DocumentSession) -> CommitDocumentEdit {
    CommitDocumentEdit {
        request_id: id(),
        id: c.id.clone(),
        base_revision: c.base_revision,
        edit_sequence: c.edit_sequence,
    }
}
async fn bytes(s: &PlatformService, r: &Resource) -> Vec<u8> {
    let temp = TempDir::new().unwrap();
    let file = temp.path().join("export");
    s.export_file(req(&r.id), file.clone()).await.unwrap();
    std::fs::read(file).unwrap()
}
fn package(parts: &[(&str, &[u8])]) -> Vec<u8> {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, data) in parts {
        zip.start_file(*name, zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap().into_inner()
}

#[tokio::test]
async fn markdown_drafts_and_file_versions_survive_reopen_without_changing_shared_original() {
    let root = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    let s = PlatformService::new(Database::open(root.path()).unwrap());
    let filename = input.path().join("原稿.md");
    std::fs::write(&filename, "# 原件\n").unwrap();
    let import = || ImportFile {
        request_id: id(),
        folder_id: None,
        project_id: None,
    };
    let r = s.import_file(import(), &filename).await.unwrap();
    let shared = s.import_file(import(), &filename).await.unwrap();
    let c = begin(&s, &r).await;
    let c = draft(
        &s,
        &c,
        1,
        "# 编辑中文\n\n|名称|数量|\n|---|---|\n|春风|4|\n",
    )
    .await;
    assert!(c.changed);
    assert_eq!(bytes(&s, &r).await, "# 原件\n".as_bytes());
    drop(s);
    let s = PlatformService::new(Database::open(root.path()).unwrap());
    let restored = s.get_document_session(req(&c.id)).await.unwrap();
    assert_eq!(restored.markdown, c.markdown);
    let saved = s.commit_document_edit(commit(&restored)).await.unwrap();
    assert_eq!(saved.resource.revision, 2);
    assert_eq!(saved.receipt.client_edit_sequence, 1);
    assert_eq!(
        bytes(&s, &saved.resource).await,
        c.markdown.unwrap().as_bytes()
    );
    assert_eq!(bytes(&s, &shared).await, "# 原件\n".as_bytes());
    assert_eq!(std::fs::read(filename).unwrap(), "# 原件\n".as_bytes());
    let versions = s
        .list_file_versions(VersionQuery {
            request_id: id(),
            id: r.id.clone(),
            offset: 0,
            limit: 20,
        })
        .await
        .unwrap();
    assert_eq!(versions.len(), 2);
    assert_eq!(versions[1].source_revision, 1);
    assert!(
        s.restore_file_version(RestoreVersion {
            request_id: id(),
            id: r.id.clone(),
            version_id: versions[1].id.clone(),
            base_revision: 2
        })
        .await
        .is_err()
    );
    s.end_document_edit(EndDocumentEdit {
        request_id: id(),
        id: c.id,
        edit_sequence: 1,
    })
    .await
    .unwrap();
    let reverted = s
        .restore_file_version(RestoreVersion {
            request_id: id(),
            id: r.id,
            version_id: versions[1].id.clone(),
            base_revision: 2,
        })
        .await
        .unwrap();
    assert_eq!(reverted.revision, 3);
    assert_eq!(bytes(&s, &reverted).await, "# 原件\n".as_bytes());
    let export = input.path().join("历史.md");
    s.export_file_version(
        VersionRequest {
            request_id: id(),
            id: reverted.id.clone(),
            version_id: versions[0].id.clone(),
        },
        export.clone(),
    )
    .await
    .unwrap();
    assert_eq!(hash(&std::fs::read(export).unwrap()), versions[0].sha256);
    drop(s);
    let s = PlatformService::new(Database::open(root.path()).unwrap());
    assert_eq!(bytes(&s, &reverted).await, "# 原件\n".as_bytes());
}
#[tokio::test]
async fn stale_sequences_conflicts_and_failed_snapshots_keep_drafts_and_roll_back_blobs() {
    let root = TempDir::new().unwrap();
    let db = Database::open(root.path()).unwrap();
    let s = PlatformService::new(db.clone());
    let r = create(&s, "md").await;
    let c = begin(&s, &r).await;
    let c = draft(&s, &c, 2, "不能丢失的草稿").await;
    for (sequence, text) in [(1, "旧稿"), (2, "不同稿")] {
        assert!(
            s.write_markdown_draft(WriteMarkdownDraft {
                request_id: id(),
                id: c.id.clone(),
                edit_sequence: sequence,
                text: text.into()
            })
            .await
            .is_err()
        );
    }
    assert!(
        s.commit_document_edit(CommitDocumentEdit {
            edit_sequence: 1,
            ..commit(&c)
        })
        .await
        .is_err()
    );
    db.call(|conn|{conn.execute_batch("CREATE TRIGGER ignore_file_save BEFORE UPDATE ON platform_resources BEGIN SELECT RAISE(IGNORE); END;")?;Ok(())}).await.unwrap();
    assert!(s.commit_document_edit(commit(&c)).await.is_err());
    assert_eq!(bytes(&s, &r).await, b"");
    assert_eq!(
        std::fs::read_dir(root.path().join("attachments"))
            .unwrap()
            .count(),
        1
    );
    db.call(|conn|{conn.execute_batch("DROP TRIGGER ignore_file_save; CREATE TRIGGER ignore_new_snapshot BEFORE INSERT ON platform_file_versions WHEN NEW.source_revision>1 BEGIN SELECT RAISE(IGNORE); END;")?;Ok(())}).await.unwrap();
    assert!(s.commit_document_edit(commit(&c)).await.is_err());
    assert_eq!(bytes(&s, &r).await, b"");
    db.call(|conn| {
        conn.execute_batch("DROP TRIGGER ignore_new_snapshot;")?;
        Ok(())
    })
    .await
    .unwrap();
    s.save_resource(SaveResource {
        request_id: id(),
        id: r.id.clone(),
        base_revision: 1,
        name: "新名称".into(),
        description: String::new(),
        source: "采集出处".into(),
        folder_id: None,
        url: None,
        favorite: false,
        tags: vec![],
    })
    .await
    .unwrap();
    assert_eq!(
        s.commit_document_edit(commit(&c)).await.unwrap_err().code,
        ErrorCode::Conflict
    );
    assert_eq!(
        s.get_document_session(req(&c.id))
            .await
            .unwrap()
            .markdown
            .as_deref(),
        Some("不能丢失的草稿")
    );
    let copy = s.copy_document_edit(req(&c.id)).await.unwrap();
    assert_eq!(bytes(&s, &copy).await, "不能丢失的草稿".as_bytes());
    assert_eq!(copy.source, "采集出处");
    let other = create(&s, "md").await;
    let versions = s
        .list_file_versions(VersionQuery {
            request_id: id(),
            id: r.id.clone(),
            offset: 0,
            limit: 20,
        })
        .await
        .unwrap();
    assert!(
        s.export_file_version(
            VersionRequest {
                request_id: id(),
                id: other.id,
                version_id: versions[0].id.clone()
            },
            root.path().join("bad")
        )
        .await
        .is_err()
    );
}
#[tokio::test]
async fn office_copies_round_trip_every_byte_including_images_charts_merges_and_formula_cache() {
    let root = TempDir::new().unwrap();
    let s = PlatformService::new(Database::open(root.path()).unwrap());
    for format in ["docx", "xlsx", "csv", "tsv"] {
        let r = create(&s, format).await;
        let c = begin(&s, &r).await;
        let original = bytes(&s, &r).await;
        let changed=match format {
            "docx"=>package(&[("word/document.xml",br#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>changed</w:t></w:r></w:p></w:body></w:document>"#),("word/media/image1.png",b"image bytes"),("word/styles.xml",b"preserve complex styles"),("word/header1.xml",b"preserve header")]),
            "xlsx"=>package(&[("xl/workbook.xml",b"<workbook/>") ,("xl/worksheets/sheet1.xml",br#"<worksheet><sheetData><row r="1"><c r="A1"><v>4</v></c><c r="B1"><f>SUM(A1,2)</f><v>6</v></c></row></sheetData><mergeCells><mergeCell ref="A3:B3"/></mergeCells></worksheet>"#),("xl/charts/chart1.xml",b"chart bytes"),("xl/styles.xml",b"all formatting")]),
            "csv"=>"名称,数量\n中文,7\n".as_bytes().to_vec(),
            _=>"名称\t数量\n中文\t7\n".as_bytes().to_vec(),
        };
        let path = copy_path(&root.path().canonicalize().unwrap(), &c).unwrap();
        std::fs::write(&path, &changed).unwrap();
        assert_eq!(bytes(&s, &r).await, original);
        drop(s.clone());
        assert!(s.get_document_session(req(&c.id)).await.unwrap().changed);
        let lock = path
            .parent()
            .unwrap()
            .join(format!(".~lock.{}#", c.filename));
        std::fs::write(&lock, b"Office open").unwrap();
        assert!(s.commit_document_edit(commit(&c)).await.is_err());
        std::fs::remove_file(lock).unwrap();
        let saved = s.commit_document_edit(commit(&c)).await.unwrap();
        assert_eq!(bytes(&s, &saved.resource).await, changed);
        assert_eq!(saved.resource.revision, 2);
        let again = s
            .commit_document_edit(commit(&saved.session))
            .await
            .unwrap();
        assert_eq!(again.resource.revision, 2);
        assert!(
            s.end_document_edit(EndDocumentEdit {
                request_id: id(),
                id: c.id.clone(),
                edit_sequence: 1
            })
            .await
            .is_err()
        );
        s.end_document_edit(EndDocumentEdit {
            request_id: id(),
            id: c.id,
            edit_sequence: 0,
        })
        .await
        .unwrap();
        assert!(!path.exists());
    }
}
#[tokio::test]
async fn office_sessions_survive_restart_and_reject_missing_symlinked_or_wrong_format_results() {
    let root = TempDir::new().unwrap();
    let s = PlatformService::new(Database::open(root.path()).unwrap());
    let r = create(&s, "docx").await;
    let c = begin(&s, &r).await;
    let path = copy_path(&root.path().canonicalize().unwrap(), &c).unwrap();
    let original = std::fs::read(&path).unwrap();
    drop(s);
    let s = PlatformService::new(Database::open(root.path()).unwrap());
    assert_eq!(s.get_document_session(req(&c.id)).await.unwrap().id, c.id);
    let reused = begin(&s, &r).await;
    assert_eq!(reused.id, c.id);
    std::fs::write(&path, b"broken write").unwrap();
    assert!(s.commit_document_edit(commit(&c)).await.is_err());
    assert_eq!(bytes(&s, &r).await, original);
    std::fs::remove_file(&path).unwrap();
    assert!(s.get_document_session(req(&c.id)).await.is_err());
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(root.path().join("workspace.sqlite"), &path).unwrap();
        assert!(s.commit_document_edit(commit(&c)).await.is_err());
        assert!(
            s.end_document_edit(EndDocumentEdit {
                request_id: id(),
                id: c.id,
                edit_sequence: 0
            })
            .await
            .is_err()
        );
    }
}
#[test]
fn migration_from_version_one_preserves_identity_content_and_checks_both_versions() {
    use sha2::{Digest, Sha256};
    let root = TempDir::new().unwrap();
    let path = root.path().join("old.sqlite");
    let mut conn = rusqlite::Connection::open(&path).unwrap();
    let sql = include_str!("../migrations/0001_platform.sql");
    conn.execute_batch(sql).unwrap();
    let checksum = Sha256::digest(sql.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    conn.execute(
        "INSERT INTO platform_meta VALUES('original-workspace',1)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO platform_migrations VALUES(1,?1,'old-date')",
        [checksum],
    )
    .unwrap();
    conn.execute("INSERT INTO platform_projects(id,name,status,created_at,updated_at) VALUES('old-project','原项目','active','old','old')",[]).unwrap();
    conn.pragma_update(None, "user_version", 1).unwrap();
    initialize(&mut conn).unwrap();
    assert_eq!(
        conn.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
            .unwrap(),
        4
    );
    assert_eq!(
        conn.query_row("SELECT workspace_id FROM platform_meta", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "original-workspace"
    );
    assert_eq!(
        conn.query_row("SELECT name FROM platform_projects", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "原项目"
    );
    initialize(&mut conn).unwrap();
    conn.execute(
        "UPDATE platform_migrations SET checksum='tampered' WHERE version=2",
        [],
    )
    .unwrap();
    assert_eq!(
        initialize(&mut conn).unwrap_err().code,
        ErrorCode::MigrationFailed
    );
    let bad = Path::new("relative");
    assert!(Database::open(bad).is_err());
}
