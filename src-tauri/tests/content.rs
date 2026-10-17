use moshub_lib::{
    contracts::*,
    infrastructure::{
        attachments::{AttachmentStore, MAX_FILE_SIZE},
        database::Database,
    },
    platform::service::PlatformService,
};
use rusqlite::params;
use tempfile::TempDir;
fn request() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn id(value: &str) -> IdRequest {
    IdRequest {
        request_id: request(),
        id: value.into(),
    }
}
fn list() -> ListRequest {
    ListRequest {
        request_id: request(),
        offset: 0,
        limit: 100,
    }
}
fn query() -> ResourceQuery {
    ResourceQuery {
        request_id: request(),
        offset: 0,
        limit: 100,
        keyword: String::new(),
        kind: None,
        folder_id: None,
        root_only: false,
        project_id: None,
        favorite_only: false,
        tag: None,
    }
}
fn import() -> ImportFile {
    ImportFile {
        request_id: request(),
        folder_id: None,
        project_id: None,
    }
}
fn workspace() -> (TempDir, Database, PlatformService) {
    let directory = TempDir::new().unwrap();
    let database = Database::open(directory.path()).unwrap();
    let service = PlatformService::new(database.clone());
    (directory, database, service)
}
async fn project(service: &PlatformService, name: &str) -> Project {
    service
        .create_project(CreateProject {
            request_id: request(),
            name: name.into(),
            description: String::new(),
        })
        .await
        .unwrap()
}
fn link() -> CreateLink {
    CreateLink {
        request_id: request(),
        name: "中文链接".into(),
        url: "https://example.com/中文?q=%25".into(),
        description: "学习说明".into(),
        source: "官方文档".into(),
        folder_id: None,
        project_id: None,
    }
}
fn metadata(resource: &Resource) -> SaveResource {
    SaveResource {
        request_id: request(),
        id: resource.id.clone(),
        base_revision: resource.revision,
        name: resource.name.clone(),
        description: resource.description.clone(),
        source: resource.source.clone(),
        folder_id: resource.folder_id.clone(),
        url: resource.url.clone(),
        favorite: resource.favorite,
        tags: resource.tags.clone(),
    }
}
#[tokio::test]
async fn shared_resource_unlink_project_delete_and_restore_survive_reopen() {
    let (directory, database, service) = workspace();
    let left = project(&service, "项目一").await;
    let right = project(&service, "项目二").await;
    let resource = service
        .create_link(CreateLink {
            project_id: Some(left.id.clone()),
            ..link()
        })
        .await
        .unwrap();
    let shared = service
        .set_resource_project(SetResourceProject {
            request_id: request(),
            id: resource.id.clone(),
            base_revision: resource.revision,
            project_id: right.id.clone(),
            linked: true,
        })
        .await
        .unwrap();
    assert_eq!(shared.project_ids.len(), 2);
    let unchanged = service
        .set_resource_project(SetResourceProject {
            request_id: request(),
            id: resource.id.clone(),
            base_revision: shared.revision,
            project_id: right.id.clone(),
            linked: true,
        })
        .await
        .unwrap();
    assert_eq!(unchanged.revision, shared.revision);
    let detached = service
        .set_resource_project(SetResourceProject {
            request_id: request(),
            id: resource.id.clone(),
            base_revision: shared.revision,
            project_id: left.id.clone(),
            linked: false,
        })
        .await
        .unwrap();
    assert_eq!(detached.project_ids, vec![right.id.clone()]);
    let deleted = service
        .set_project_deleted(SetProjectDeleted {
            request_id: request(),
            id: right.id.clone(),
            base_revision: right.revision,
            deleted: true,
        })
        .await
        .unwrap();
    assert!(
        service
            .get_resource(id(&resource.id))
            .await
            .unwrap()
            .project_ids
            .is_empty()
    );
    assert_eq!(
        service
            .list_resources(ResourceQuery {
                project_id: Some(right.id.clone()),
                ..query()
            })
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
    service
        .set_project_deleted(SetProjectDeleted {
            request_id: request(),
            id: right.id.clone(),
            base_revision: deleted.revision,
            deleted: false,
        })
        .await
        .unwrap();
    drop(service);
    drop(database);
    let reopened = PlatformService::new(Database::open(directory.path()).unwrap());
    assert_eq!(
        reopened
            .list_resources(ResourceQuery {
                project_id: Some(right.id),
                ..query()
            })
            .await
            .unwrap()[0]
            .id,
        resource.id
    );
    assert!(
        reopened
            .list_resources(ResourceQuery {
                project_id: Some(left.id),
                ..query()
            })
            .await
            .unwrap()
            .is_empty()
    );
}
#[tokio::test]
async fn imports_copy_bytes_deduplicate_blobs_preserve_independent_records_and_export() {
    let (directory, database, service) = workspace();
    let source = TempDir::new().unwrap();
    let path = source.path().join("中文文件.txt");
    std::fs::write(&path, "托管原文 🌱").unwrap();
    let one = service.import_file(import(), &path).await.unwrap();
    let two = service.import_file(import(), &path).await.unwrap();
    assert_ne!(one.id, two.id);
    assert_eq!(one.sha256, two.sha256);
    assert_eq!(one.mime_type.as_deref(), Some("text/plain"));
    std::fs::write(&path, "原文件已经修改").unwrap();
    assert_eq!(
        service
            .preview_file(id(&one.id))
            .await
            .unwrap()
            .text
            .as_deref(),
        Some("托管原文 🌱")
    );
    let deleted = service
        .set_resource_deleted(SetResourceDeleted {
            request_id: request(),
            id: one.id.clone(),
            base_revision: one.revision,
            deleted: true,
        })
        .await
        .unwrap();
    assert_eq!(
        service.get_resource(id(&one.id)).await.unwrap_err().code,
        ErrorCode::NotFound
    );
    assert_eq!(
        service
            .preview_file(id(&two.id))
            .await
            .unwrap()
            .text
            .as_deref(),
        Some("托管原文 🌱")
    );
    let count: i64 = database
        .call(|conn| Ok(conn.query_row("SELECT count(*) FROM platform_blobs", [], |r| r.get(0))?))
        .await
        .unwrap();
    assert_eq!(count, 1);
    let target = source.path().join("导出.txt");
    service
        .export_file(id(&two.id), target.clone())
        .await
        .unwrap();
    assert_eq!(std::fs::read_to_string(target).unwrap(), "托管原文 🌱");
    assert_eq!(
        service
            .export_file(id(&two.id), directory.path().join("workspace.sqlite"))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );
    service
        .set_resource_deleted(SetResourceDeleted {
            request_id: request(),
            id: one.id.clone(),
            base_revision: deleted.revision,
            deleted: false,
        })
        .await
        .unwrap();
    drop(service);
    drop(database);
    let reopened = PlatformService::new(Database::open(directory.path()).unwrap());
    assert_eq!(reopened.list_resources(query()).await.unwrap().len(), 2);
    assert_eq!(
        reopened
            .preview_file(id(&one.id))
            .await
            .unwrap()
            .text
            .as_deref(),
        Some("托管原文 🌱")
    );
}
#[tokio::test]
async fn failed_copy_or_database_commit_does_not_leave_record_blob_or_temp_file() {
    let (directory, database, service) = workspace();
    let source = TempDir::new().unwrap();
    let path = source.path().join("数据.txt");
    std::fs::write(&path, "失败验证").unwrap();
    assert_eq!(
        service
            .import_file(import(), &source.path().join("缺失.txt"))
            .await
            .unwrap_err()
            .code,
        ErrorCode::IoError
    );
    // File promotion succeeds, but foreign-key ownership validation fails in the short transaction.
    assert_eq!(
        service
            .import_file(
                ImportFile {
                    project_id: Some(request()),
                    ..import()
                },
                &path
            )
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
    database.call(|conn| { conn.execute_batch("CREATE TRIGGER test_import_fail BEFORE INSERT ON platform_resources BEGIN SELECT RAISE(ABORT,'failure'); END;")?;Ok(()) }).await.unwrap();
    assert_eq!(
        service.import_file(import(), &path).await.unwrap_err().code,
        ErrorCode::DbError
    );
    assert!(service.list_resources(query()).await.unwrap().is_empty());
    assert_eq!(
        std::fs::read_dir(directory.path().join("attachments"))
            .unwrap()
            .count(),
        0
    );
    let count: i64 = database
        .call(|conn| Ok(conn.query_row("SELECT count(*) FROM platform_blobs", [], |r| r.get(0))?))
        .await
        .unwrap();
    assert_eq!(count, 0);
}
#[tokio::test]
async fn concurrent_duplicate_import_with_one_failed_owner_keeps_successful_bytes() {
    let (_directory, _database, service) = workspace();
    let source = TempDir::new().unwrap();
    let path = source.path().join("并发.txt");
    std::fs::write(&path, "共享字节").unwrap();
    let (failed, success) = tokio::join!(
        service.import_file(
            ImportFile {
                project_id: Some(request()),
                ..import()
            },
            &path
        ),
        service.import_file(import(), &path)
    );
    assert!(failed.is_err());
    let resource = success.unwrap();
    assert_eq!(
        service
            .preview_file(id(&resource.id))
            .await
            .unwrap()
            .text
            .as_deref(),
        Some("共享字节")
    );
}
#[tokio::test]
async fn size_limit_integrity_and_orphan_cleanup_are_real_file_checks() {
    let (directory, database, service) = workspace();
    let source = TempDir::new().unwrap();
    let large = source.path().join("large.bin");
    std::fs::File::create(&large)
        .unwrap()
        .set_len(MAX_FILE_SIZE + 1)
        .unwrap();
    assert_eq!(
        service
            .import_file(import(), &large)
            .await
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );
    assert!(service.list_resources(query()).await.unwrap().is_empty());
    let path = source.path().join("正文.txt");
    std::fs::write(&path, "保留记录").unwrap();
    let resource = service.import_file(import(), &path).await.unwrap();
    let managed: String = database
        .call(move |conn| {
            Ok(conn.query_row(
                "SELECT internal_path FROM platform_blobs WHERE sha256=?1",
                [resource.sha256],
                |r| r.get(0),
            )?)
        })
        .await
        .unwrap();
    let record = service.list_resources(query()).await.unwrap().remove(0);
    std::fs::write(directory.path().join("attachments").join(managed), "已篡改").unwrap();
    assert_eq!(
        service.preview_file(id(&record.id)).await.unwrap_err().code,
        ErrorCode::IoError
    );
    assert_eq!(
        service.get_resource(id(&record.id)).await.unwrap().id,
        record.id
    );
    let orphan = format!("{}.bin", "a".repeat(64));
    std::fs::write(directory.path().join("attachments").join(&orphan), "orphan").unwrap();
    std::fs::write(
        directory.path().join("attachments/.import-crash"),
        "partial",
    )
    .unwrap();
    drop(service);
    drop(database);
    let reopened = Database::open(directory.path()).unwrap();
    assert!(!directory.path().join("attachments").join(orphan).exists());
    assert!(!directory.path().join("attachments/.import-crash").exists());
    assert_eq!(
        PlatformService::new(reopened)
            .list_resources(query())
            .await
            .unwrap()
            .len(),
        1
    );
}
#[cfg(unix)]
#[tokio::test]
async fn attachment_symlinks_and_tampered_private_paths_cannot_be_read() {
    use std::os::unix::fs::symlink;
    let (directory, database, service) = workspace();
    let source = TempDir::new().unwrap();
    let path = source.path().join("真实.txt");
    std::fs::write(&path, "真实").unwrap();
    let alias = source.path().join("链接.txt");
    symlink(&path, &alias).unwrap();
    assert_eq!(
        service
            .import_file(import(), &alias)
            .await
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );
    let resource = service.import_file(import(), &path).await.unwrap();
    database
        .call(|conn| {
            conn.execute(
                "UPDATE platform_blobs SET internal_path='../workspace.sqlite'",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    assert_eq!(
        service
            .preview_file(id(&resource.id))
            .await
            .unwrap_err()
            .code,
        ErrorCode::IoError
    );
    let store = AttachmentStore::new(directory.path().to_owned());
    assert_eq!(
        store
            .read(&Blob {
                id: request(),
                sha256: "0".repeat(64),
                internal_path: "../workspace.sqlite".into(),
                size: 0,
                mime_type: "text/plain".into()
            })
            .unwrap_err()
            .code,
        ErrorCode::IoError
    );
}
#[tokio::test]
async fn metadata_tags_favorites_literal_filters_and_stale_versions_are_checked() {
    let (_directory, _database, service) = workspace();
    let p = project(&service, "中文项目_%").await;
    let saved = service
        .save_project_details(SaveProjectDetails {
            request_id: request(),
            id: p.id.clone(),
            base_revision: p.revision,
            name: " 中文项目_% ".into(),
            description: "词组匹配".into(),
            status: ProjectStatus::Archived,
            favorite: true,
            tags: vec![" 学习 ".into(), "学习".into(), "Rust".into()],
            change_cover: false,
            cover_resource_id: None,
        })
        .await
        .unwrap();
    assert_eq!(saved.tags.len(), 2);
    let matches = service
        .query_projects(ProjectQuery {
            request_id: request(),
            offset: 0,
            limit: 20,
            keyword: "_%".into(),
            status: Some(ProjectStatus::Archived),
            favorite_only: true,
            tag: Some("学习".into()),
        })
        .await
        .unwrap();
    assert_eq!(matches[0].id, p.id);
    let resource = service.create_link(link()).await.unwrap();
    let mut input = metadata(&resource);
    input.favorite = true;
    input.tags = vec!["资料".into()];
    let saved = service.save_resource(input.clone()).await.unwrap();
    assert_eq!(saved.revision, 2);
    assert_eq!(
        service.save_resource(input).await.unwrap_err().code,
        ErrorCode::Conflict
    );
    assert_eq!(
        service
            .list_resources(ResourceQuery {
                keyword: "官方".into(),
                favorite_only: true,
                tag: Some("资料".into()),
                ..query()
            })
            .await
            .unwrap()[0]
            .id,
        resource.id
    );
    for url in [
        "javascript:alert(1)",
        "file:///tmp/a",
        "https://user:secret@example.com",
        "https://",
        "https://example.com\n",
    ] {
        let result = service
            .create_link(CreateLink {
                url: url.into(),
                ..link()
            })
            .await;
        // Leading/trailing whitespace is trimmed, but embedded control characters are rejected.
        if url.ends_with('\n') {
            assert!(result.is_ok());
        } else {
            assert_eq!(result.unwrap_err().code, ErrorCode::Validation);
        }
    }
    assert_eq!(
        service
            .set_resource_project(SetResourceProject {
                request_id: request(),
                id: resource.id,
                base_revision: saved.revision,
                project_id: request(),
                linked: true
            })
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
}
#[tokio::test]
async fn resource_rename_advances_note_revision_and_prevents_old_editor_overwrite() {
    let (_directory, _database, service) = workspace();
    let note = service
        .create_note(CreateNote {
            request_id: request(),
            title: "旧标题".into(),
            project_id: None,
        })
        .await
        .unwrap();
    let resource = service.get_resource(id(&note.id)).await.unwrap();
    let mut input = metadata(&resource);
    input.name = "新标题".into();
    service.save_resource(input).await.unwrap();
    let error = service
        .save_note(SaveNote {
            request_id: request(),
            id: note.id.clone(),
            title: note.title,
            body: note.body,
            schema_version: 1,
            base_revision: note.revision,
            client_edit_sequence: 1,
            create_version: false,
        })
        .await
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::Conflict);
    let actual = service.get_note(id(&note.id)).await.unwrap();
    assert_eq!(actual.title, "新标题");
    assert_eq!(actual.revision, 2);
}
#[tokio::test]
async fn folder_cycles_moves_and_both_delete_modes_are_atomic() {
    let (_directory, database, service) = workspace();
    let parent = service
        .create_folder(CreateFolder {
            request_id: request(),
            name: "父".into(),
            parent_id: None,
        })
        .await
        .unwrap();
    let child = service
        .create_folder(CreateFolder {
            request_id: request(),
            name: "子".into(),
            parent_id: Some(parent.id.clone()),
        })
        .await
        .unwrap();
    assert_eq!(
        service
            .save_folder(SaveFolder {
                request_id: request(),
                id: parent.id.clone(),
                base_revision: 1,
                name: "父".into(),
                parent_id: Some(child.id.clone())
            })
            .await
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );
    let resource = service
        .create_link(CreateLink {
            folder_id: Some(child.id.clone()),
            ..link()
        })
        .await
        .unwrap();
    database.call(|conn| {conn.execute_batch("CREATE TRIGGER test_folder_fail BEFORE UPDATE ON platform_folders BEGIN SELECT RAISE(ABORT,'failure'); END;")?;Ok(())}).await.unwrap();
    assert_eq!(
        service
            .delete_folder(DeleteFolder {
                request_id: request(),
                id: parent.id.clone(),
                base_revision: 1,
                mode: FolderDeleteMode::MoveToRoot
            })
            .await
            .unwrap_err()
            .code,
        ErrorCode::DbError
    );
    assert_eq!(
        service
            .get_resource(id(&resource.id))
            .await
            .unwrap()
            .folder_id,
        Some(child.id.clone())
    );
    database
        .call(|conn| {
            conn.execute("DROP TRIGGER test_folder_fail", [])?;
            conn.execute_batch("CREATE TRIGGER test_folder_ignore BEFORE UPDATE ON platform_folders BEGIN SELECT RAISE(IGNORE); END;")?;
            Ok(())
        })
        .await
        .unwrap();
    assert_eq!(
        service
            .delete_folder(DeleteFolder {
                request_id: request(),
                id: parent.id.clone(),
                base_revision: 1,
                mode: FolderDeleteMode::MoveToRoot,
            })
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(
        service
            .get_resource(id(&resource.id))
            .await
            .unwrap()
            .folder_id,
        Some(child.id.clone())
    );
    database
        .call(|conn| {
            conn.execute("DROP TRIGGER test_folder_ignore", [])?;
            Ok(())
        })
        .await
        .unwrap();
    service
        .delete_folder(DeleteFolder {
            request_id: request(),
            id: parent.id,
            base_revision: 1,
            mode: FolderDeleteMode::MoveToRoot,
        })
        .await
        .unwrap();
    assert!(service.list_folders(list()).await.unwrap().is_empty());
    let root = service.get_resource(id(&resource.id)).await.unwrap();
    assert_eq!(root.folder_id, None);
    let folder = service
        .create_folder(CreateFolder {
            request_id: request(),
            name: "删除内容".into(),
            parent_id: None,
        })
        .await
        .unwrap();
    let mut input = metadata(&root);
    input.folder_id = Some(folder.id.clone());
    let moved = service.save_resource(input).await.unwrap();
    service
        .delete_folder(DeleteFolder {
            request_id: request(),
            id: folder.id,
            base_revision: 1,
            mode: FolderDeleteMode::TrashContents,
        })
        .await
        .unwrap();
    assert!(service.list_resources(query()).await.unwrap().is_empty());
    let restored = service
        .set_resource_deleted(SetResourceDeleted {
            request_id: request(),
            id: moved.id,
            base_revision: moved.revision + 1,
            deleted: false,
        })
        .await
        .unwrap();
    assert!(restored.folder_id.is_none());
}
#[tokio::test]
async fn project_cover_reuses_blob_and_rejects_non_image_without_partial_metadata() {
    let (_directory, database, service) = workspace();
    let source = TempDir::new().unwrap();
    let path = source.path().join("图片.png");
    // A real PNG fixture from the committed application icon.
    std::fs::write(&path, include_bytes!("../icons/32x32.png")).unwrap();
    let image = service.import_file(import(), &path).await.unwrap();
    let project = project(&service, "封面项目").await;
    let input = SaveProjectDetails {
        request_id: request(),
        id: project.id.clone(),
        base_revision: 1,
        name: project.name.clone(),
        description: String::new(),
        status: ProjectStatus::Active,
        favorite: false,
        tags: Vec::new(),
        change_cover: true,
        cover_resource_id: Some(image.id),
    };
    let saved = service.save_project_details(input.clone()).await.unwrap();
    assert!(saved.cover_blob_id.is_some());
    assert!(
        service
            .preview_project_cover(id(&project.id))
            .await
            .unwrap()
            .data_url
            .unwrap()
            .starts_with("data:image/png;base64,")
    );
    let link = service.create_link(link()).await.unwrap();
    assert_eq!(
        service
            .save_project_details(SaveProjectDetails {
                base_revision: saved.revision,
                name: "不应改变".into(),
                cover_resource_id: Some(link.id),
                ..input
            })
            .await
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );
    assert_eq!(
        service.get_project(id(&project.id)).await.unwrap().name,
        project.name
    );
    let count: i64 = database
        .call(move |conn| {
            Ok(conn.query_row(
                "SELECT count(*) FROM platform_blobs WHERE id=?1",
                params![saved.cover_blob_id],
                |r| r.get(0),
            )?)
        })
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[tokio::test]
async fn pagination_beyond_first_hundred_keeps_stable_ids_and_filters() {
    let (_directory, _database, service) = workspace();
    for index in 0..105 {
        service
            .create_link(CreateLink {
                name: format!("分页资料 {index:03}"),
                ..link()
            })
            .await
            .unwrap();
    }
    let first = service
        .list_resources(ResourceQuery {
            limit: 100,
            ..query()
        })
        .await
        .unwrap();
    let tail = service
        .list_resources(ResourceQuery {
            offset: 100,
            limit: 100,
            ..query()
        })
        .await
        .unwrap();
    assert_eq!(first.len(), 100);
    assert_eq!(tail.len(), 5);
    assert!(
        !tail
            .iter()
            .any(|resource| first.iter().any(|head| head.id == resource.id))
    );
    assert_eq!(
        service
            .list_resources(ResourceQuery {
                keyword: "分页资料 104".into(),
                ..query()
            })
            .await
            .unwrap()
            .len(),
        1
    );
    assert!(
        service
            .list_resources(ResourceQuery {
                keyword: "_%".into(),
                ..query()
            })
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn zero_affected_row_is_conflict_and_rolls_back_note_rename_and_association() {
    let (_directory, database, service) = workspace();
    let note = service
        .create_note(CreateNote {
            request_id: request(),
            title: "原始标题".into(),
            project_id: None,
        })
        .await
        .unwrap();
    let resource = service.get_resource(id(&note.id)).await.unwrap();
    let project = project(&service, "归属").await;
    database.call(|conn| { conn.execute_batch("CREATE TRIGGER test_ignore_update BEFORE UPDATE ON platform_resources BEGIN SELECT RAISE(IGNORE); END;")?;Ok(()) }).await.unwrap();
    let mut input = metadata(&resource);
    input.name = "不可确认标题".into();
    input.tags = vec!["未提交".into()];
    assert_eq!(
        service.save_resource(input).await.unwrap_err().code,
        ErrorCode::Conflict
    );
    assert_eq!(service.get_note(id(&note.id)).await.unwrap().revision, 1);
    assert_eq!(
        service.get_note(id(&note.id)).await.unwrap().title,
        "原始标题"
    );
    assert!(
        service
            .get_resource(id(&note.id))
            .await
            .unwrap()
            .tags
            .is_empty()
    );
    assert_eq!(
        service
            .set_resource_project(SetResourceProject {
                request_id: request(),
                id: note.id.clone(),
                base_revision: 1,
                project_id: project.id,
                linked: true
            })
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert!(
        service
            .get_resource(id(&note.id))
            .await
            .unwrap()
            .project_ids
            .is_empty()
    );
}

#[test]
fn opaque_file_view_copy_preserves_original_extension_and_external_edits_are_isolated() {
    let directory = TempDir::new().unwrap();
    let database = Database::open(directory.path()).unwrap();
    let source = TempDir::new().unwrap();
    let path = source.path().join("二进制资料.docx");
    let bytes = b"PK\x03\x04\x00\x01\x02\xff";
    std::fs::write(&path, bytes).unwrap();
    let store = AttachmentStore::new(database.root().to_owned());
    let imported = store.import(&path).unwrap();
    let view = store
        .viewing_copy(&imported.blob, &imported.original_name)
        .unwrap();
    assert_eq!(view.extension().unwrap(), "docx");
    assert_eq!(std::fs::read(&view).unwrap(), bytes);
    std::fs::write(&view, b"external edit").unwrap();
    assert_eq!(store.read(&imported.blob).unwrap(), bytes);
    std::fs::remove_file(view).unwrap();
    let safe = store.viewing_copy(&imported.blob, "untrusted.a/b").unwrap();
    assert_eq!(std::fs::read(&safe).unwrap(), bytes);
    std::fs::remove_file(safe).unwrap();
}
