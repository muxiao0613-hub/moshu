use moshub_lib::{
    contracts::*,
    infrastructure::database::{Database, initialize},
    platform::{domain, service::PlatformService},
};
use rusqlite::{Connection, params};
use serde_json::json;
use tempfile::TempDir;

fn request() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn list() -> ListRequest {
    ListRequest {
        request_id: request(),
        offset: 0,
        limit: 100,
    }
}
fn note_request() -> CreateNote {
    CreateNote {
        request_id: request(),
        title: "中文笔记".into(),
        project_id: None,
    }
}
fn save(note: &Note, text: &str) -> SaveNote {
    SaveNote {
        request_id: request(),
        id: note.id.clone(),
        title: note.title.clone(),
        body: json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]}),
        schema_version: 1,
        base_revision: note.revision,
        client_edit_sequence: 7,
        create_version: true,
    }
}
fn workspace() -> (TempDir, Database, PlatformService) {
    let directory = TempDir::new().unwrap();
    let database = Database::open(directory.path()).unwrap();
    let service = PlatformService::new(database.clone());
    (directory, database, service)
}

#[tokio::test]
async fn acknowledged_chinese_document_and_workspace_id_survive_reopen() {
    let (directory, database, service) = workspace();
    let before = service
        .status(Request {
            request_id: request(),
        })
        .await
        .unwrap();
    let note = service.create_note(note_request()).await.unwrap();
    let receipt = service
        .save_note(save(&note, "中文输入：春风又绿江南岸 🌱"))
        .await
        .unwrap();
    assert_eq!(receipt.saved_revision, 2);
    assert_eq!(receipt.client_edit_sequence, 7);
    drop(service);
    drop(database);
    let reopened = PlatformService::new(Database::open(directory.path()).unwrap());
    let actual = reopened
        .get_note(IdRequest {
            request_id: request(),
            id: note.id,
        })
        .await
        .unwrap();
    assert_eq!(actual.revision, 2);
    assert_eq!(actual.plain_text, "中文输入：春风又绿江南岸 🌱");
    assert_eq!(
        actual.body["content"][0]["content"][0]["text"],
        actual.plain_text
    );
    assert_eq!(
        reopened
            .status(Request {
                request_id: request()
            })
            .await
            .unwrap()
            .workspace_id,
        before.workspace_id
    );
}

#[tokio::test]
async fn concurrent_writers_with_same_base_revision_have_only_one_winner() {
    let (_directory, database, service) = workspace();
    let note = service.create_note(note_request()).await.unwrap();
    let (left, right) = tokio::join!(
        service.save_note(save(&note, "第一份")),
        service.save_note(save(&note, "第二份"))
    );
    assert_ne!(left.is_ok(), right.is_ok());
    let error = left.err().or(right.err()).unwrap();
    assert_eq!(error.code, ErrorCode::Conflict);
    let actual = service
        .get_note(IdRequest {
            request_id: request(),
            id: note.id.clone(),
        })
        .await
        .unwrap();
    assert_eq!(actual.revision, 2);
    assert!(["第一份", "第二份"].contains(&actual.plain_text.as_str()));
    let versions: u32 = database
        .call(move |conn| {
            Ok(conn.query_row(
                "SELECT count(*) FROM platform_note_versions WHERE resource_id=?1",
                [note.id],
                |r| r.get(0),
            )?)
        })
        .await
        .unwrap();
    assert_eq!(versions, 2);
}

#[tokio::test]
async fn failed_resource_write_rolls_back_body_revision_and_snapshot() {
    let (_directory, database, service) = workspace();
    let note = service.create_note(note_request()).await.unwrap();
    database.call(|conn| {
        conn.execute_batch("CREATE TRIGGER test_fail BEFORE UPDATE ON platform_resources BEGIN SELECT RAISE(ABORT,'injected storage failure'); END;")?;
        Ok(())
    }).await.unwrap();
    assert_eq!(
        service
            .save_note(save(&note, "不可提交"))
            .await
            .unwrap_err()
            .code,
        ErrorCode::DbError
    );
    let actual = service
        .get_note(IdRequest {
            request_id: request(),
            id: note.id,
        })
        .await
        .unwrap();
    assert_eq!(actual.revision, 1);
    assert_eq!(actual.plain_text, "");
    let versions: u32 = database
        .call(|conn| {
            Ok(
                conn.query_row("SELECT count(*) FROM platform_note_versions", [], |r| {
                    r.get(0)
                })?,
            )
        })
        .await
        .unwrap();
    assert_eq!(versions, 0);
}

#[tokio::test]
async fn project_crud_conflicts_soft_delete_and_restore_preserve_note_association() {
    let (_directory, database, service) = workspace();
    let project = service
        .create_project(CreateProject {
            request_id: request(),
            name: "  学习'; DROP TABLE platform_notes; --  ".into(),
            description: "资料".into(),
        })
        .await
        .unwrap();
    assert_eq!(project.name, "学习'; DROP TABLE platform_notes; --");
    let note = service
        .create_note(CreateNote {
            project_id: Some(project.id.clone()),
            ..note_request()
        })
        .await
        .unwrap();
    let archived = service
        .update_project(UpdateProject {
            request_id: request(),
            id: project.id.clone(),
            base_revision: 1,
            name: project.name.clone(),
            description: "新说明".into(),
            status: ProjectStatus::Archived,
        })
        .await
        .unwrap();
    assert_eq!(archived.revision, 2);
    let old = service
        .set_project_deleted(SetProjectDeleted {
            request_id: request(),
            id: project.id.clone(),
            base_revision: 1,
            deleted: true,
        })
        .await
        .unwrap_err();
    assert_eq!(old.code, ErrorCode::Conflict);
    let deleted = service
        .set_project_deleted(SetProjectDeleted {
            request_id: request(),
            id: project.id.clone(),
            base_revision: 2,
            deleted: true,
        })
        .await
        .unwrap();
    assert!(service.list_projects(list()).await.unwrap().is_empty());
    assert_eq!(
        service
            .get_note(IdRequest {
                request_id: request(),
                id: note.id.clone()
            })
            .await
            .unwrap()
            .id,
        note.id
    );
    let restored = service
        .set_project_deleted(SetProjectDeleted {
            request_id: request(),
            id: project.id.clone(),
            base_revision: deleted.revision,
            deleted: false,
        })
        .await
        .unwrap();
    assert_eq!(restored.status, ProjectStatus::Archived);
    let links:u32=database.call(move |conn| Ok(conn.query_row("SELECT count(*) FROM platform_project_resources WHERE project_id=?1 AND resource_id=?2",params![project.id,note.id],|r|r.get(0))?)).await.unwrap();
    assert_eq!(links, 1);
}

#[tokio::test]
async fn nonexistent_project_does_not_create_partial_note() {
    let (_directory, _database, service) = workspace();
    let error = service
        .create_note(CreateNote {
            project_id: Some(request()),
            ..note_request()
        })
        .await
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::NotFound);
    assert!(service.list_notes(list()).await.unwrap().is_empty());
}

#[tokio::test]
async fn empty_titles_invalid_json_and_future_schema_do_not_mutate_content() {
    let (_directory, _database, service) = workspace();
    let note = service.create_note(note_request()).await.unwrap();
    let mut input = save(&note, "不应保存");
    input.title = "   ".into();
    assert_eq!(
        service.save_note(input).await.unwrap_err().code,
        ErrorCode::Validation
    );
    let mut input = save(&note, "不应保存");
    input.schema_version = 99;
    assert_eq!(
        service.save_note(input).await.unwrap_err().code,
        ErrorCode::Validation
    );
    let mut input = save(&note, "不应保存");
    input.body = json!({"type":"doc","content":[{"type":"script"}]});
    assert_eq!(
        service.save_note(input).await.unwrap_err().code,
        ErrorCode::Validation
    );
    assert_eq!(
        service
            .get_note(IdRequest {
                request_id: request(),
                id: note.id
            })
            .await
            .unwrap()
            .revision,
        1
    );
}

#[test]
fn system_workspace_lock_rejects_second_writer_and_releases_on_drop() {
    let directory = TempDir::new().unwrap();
    let database = Database::open(directory.path()).unwrap();
    assert_eq!(
        Database::open(directory.path()).err().unwrap().code,
        ErrorCode::WorkspaceLocked
    );
    drop(database);
    assert!(Database::open(directory.path()).is_ok());
}

#[test]
fn future_database_is_rejected_without_replacement() {
    let directory = TempDir::new().unwrap();
    let path = directory.path().join("workspace.sqlite");
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch("CREATE TABLE future_data(content TEXT); INSERT INTO future_data VALUES('保留'); PRAGMA user_version=99;").unwrap();
    drop(conn);
    assert_eq!(
        Database::open(directory.path()).err().unwrap().code,
        ErrorCode::MigrationFailed
    );
    let conn = Connection::open(path).unwrap();
    assert_eq!(
        conn.query_row("SELECT content FROM future_data", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "保留"
    );
    assert_eq!(
        conn.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
            .unwrap(),
        99
    );
}

#[test]
fn corrupted_database_bytes_are_preserved() {
    let directory = TempDir::new().unwrap();
    let path = directory.path().join("workspace.sqlite");
    let bytes = b"invalid database, preserve original";
    std::fs::write(&path, bytes).unwrap();
    assert!(Database::open(directory.path()).is_err());
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}

#[test]
fn migration_checksum_tampering_and_unknown_database_are_rejected() {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize(&mut conn).unwrap();
    conn.execute("UPDATE platform_migrations SET checksum='wrong'", [])
        .unwrap();
    assert_eq!(
        initialize(&mut conn).unwrap_err().code,
        ErrorCode::MigrationFailed
    );
    let mut other = Connection::open_in_memory().unwrap();
    other
        .execute("CREATE TABLE unrelated(value TEXT)", [])
        .unwrap();
    assert_eq!(
        initialize(&mut other).unwrap_err().code,
        ErrorCode::MigrationFailed
    );
    assert!(other.prepare("SELECT * FROM unrelated").is_ok());
}

#[cfg(unix)]
#[test]
fn database_and_attachment_symlinks_are_rejected() {
    use std::os::unix::fs::symlink;
    let directory = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    symlink(outside.path(), directory.path().join("attachments")).unwrap();
    assert_eq!(
        Database::open(directory.path()).err().unwrap().code,
        ErrorCode::IoError
    );
    assert!(!directory.path().join("workspace.sqlite").exists());
}

#[test]
fn document_projection_and_link_whitelist_are_enforced() {
    let valid = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"中文","marks":[{"type":"bold"}]}]},{"type":"paragraph","content":[{"type":"text","text":"第二段"}]}]});
    assert_eq!(domain::document(&valid, 1).unwrap(), "中文\n第二段");
    let current_editor_link = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"带链接的正文","marks":[{"type":"link","attrs":{"href":"https://doc.rust-lang.org/book/","target":"_blank","rel":"noopener noreferrer nofollow","class":null,"title":null}}]}]}]});
    assert_eq!(
        domain::document(&current_editor_link, 1).unwrap(),
        "带链接的正文"
    );
    let unsafe_link = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"链接","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]}]});
    assert_eq!(
        domain::document(&unsafe_link, 1).unwrap_err().code,
        ErrorCode::Validation
    );
    let invalid_tree = json!({"type":"doc","content":[{"type":"text","text":"无段落文本"}]});
    assert_eq!(
        domain::document(&invalid_tree, 1).unwrap_err().code,
        ErrorCode::Validation
    );
}

#[test]
fn rust_dtos_round_trip_shared_frontend_fixture_without_field_drift() {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/contracts.json")).unwrap();
    let session: DocumentSession =
        serde_json::from_value(fixtures["documentSession"].clone()).unwrap();
    assert_eq!(
        serde_json::to_value(session).unwrap(),
        fixtures["documentSession"]
    );
    let task: Task = serde_json::from_value(fixtures["task"].clone()).unwrap();
    let document: DocumentView = serde_json::from_value(fixtures["document"].clone()).unwrap();
    assert_eq!(
        serde_json::to_value(document).unwrap(),
        fixtures["document"]
    );
    assert_eq!(serde_json::to_value(task).unwrap(), fixtures["task"]);
    let project: Project = serde_json::from_value(fixtures["project"].clone()).unwrap();
    assert_eq!(serde_json::to_value(project).unwrap(), fixtures["project"]);
    let receipt: SaveReceipt = serde_json::from_value(fixtures["receipt"].clone()).unwrap();
    assert_eq!(serde_json::to_value(receipt).unwrap(), fixtures["receipt"]);
    let error: AppError = serde_json::from_value(fixtures["error"].clone()).unwrap();
    assert_eq!(serde_json::to_value(error).unwrap(), fixtures["error"]);
    let create: CreateNote = serde_json::from_value(fixtures["createNote"].clone()).unwrap();
    assert_eq!(
        serde_json::to_value(create).unwrap(),
        fixtures["createNote"]
    );
    let mut invalid = fixtures["createNote"].clone();
    invalid["extra"] = json!(true);
    assert!(serde_json::from_value::<CreateNote>(invalid).is_err());
}

#[test]
#[ignore = "Explicit S00 probe creates and deletes only a synthetic OS credential"]
fn real_system_credential_round_trip() {
    moshub_lib::infrastructure::credentials::probe_system_store().unwrap();
}
