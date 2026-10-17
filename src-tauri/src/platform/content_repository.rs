use super::repository::{get_project, not_found, now, project_row};
use crate::contracts::*;
use rusqlite::{Connection, OptionalExtension, Row, params};

pub(super) fn entity_tags(conn: &Connection, column: &str, id: &str) -> AppResult<Vec<String>> {
    // Column names are internal constants, never command input.
    assert!(["project_id", "resource_id"].contains(&column));
    let mut stmt = conn.prepare(&format!("SELECT t.name FROM platform_tags t JOIN platform_entity_tags e ON e.tag_id=t.id WHERE e.{column}=?1 ORDER BY t.name,t.id"))?;
    Ok(stmt
        .query_map([id], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?)
}
fn set_tags(conn: &Connection, column: &str, id: &str, tags: &[String]) -> AppResult<()> {
    assert!(["project_id", "resource_id"].contains(&column));
    conn.execute(
        &format!("DELETE FROM platform_entity_tags WHERE {column}=?1"),
        [id],
    )?;
    for name in tags {
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM platform_tags WHERE name=?1 COLLATE NOCASE ORDER BY id LIMIT 1",
                [name],
                |r| r.get(0),
            )
            .optional()?;
        let tag_id = match existing {
            Some(id) => id,
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO platform_tags(id,name,created_at,updated_at) VALUES(?1,?2,?3,?3)",
                    params![id, name, now()],
                )?;
                id
            }
        };
        conn.execute(
            &format!("INSERT INTO platform_entity_tags(tag_id,{column}) VALUES(?1,?2)"),
            params![tag_id, id],
        )?;
    }
    Ok(())
}
pub fn query_projects(conn: &Connection, input: ProjectQuery) -> AppResult<Vec<Project>> {
    let mut stmt = conn.prepare("SELECT p.id,p.name,p.description,p.status,p.revision,p.created_at,p.updated_at,p.deleted_at,p.favorite,p.cover_blob_id FROM platform_projects p WHERE p.deleted_at IS NULL AND (?1='' OR instr(lower(p.name||char(10)||p.description),lower(?1))>0) AND (?2 IS NULL OR p.status=?2) AND (?3=0 OR p.favorite=1) AND (?4 IS NULL OR EXISTS(SELECT 1 FROM platform_entity_tags e JOIN platform_tags t ON t.id=e.tag_id WHERE e.project_id=p.id AND t.name=?4 COLLATE NOCASE)) ORDER BY p.updated_at DESC,p.id LIMIT ?5 OFFSET ?6")?;
    let mut result = stmt
        .query_map(
            params![
                input.keyword,
                input.status.map(|s| s.as_str()),
                input.favorite_only,
                input.tag,
                input.limit,
                input.offset
            ],
            project_row,
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for project in &mut result {
        project.tags = entity_tags(conn, "project_id", &project.id)?;
    }
    Ok(result)
}
pub fn save_project_details(
    conn: &mut Connection,
    input: SaveProjectDetails,
) -> AppResult<Project> {
    let tx = conn.transaction()?;
    let old = get_project(&tx, &input.id)?;
    if old.deleted_at.is_some() {
        return Err(not_found());
    }
    if old.revision != input.base_revision {
        return Err(AppError::conflict(old.revision));
    }
    let cover = if input.change_cover {
        match input.cover_resource_id {
            Some(id) => {
                let resource = get_resource(&tx, &id)?;
                if resource.kind != ResourceKind::File
                    || !resource.mime_type.as_deref().is_some_and(|m| {
                        ["image/png", "image/jpeg", "image/gif", "image/webp"].contains(&m)
                    })
                {
                    return Err(AppError::validation(
                        "封面须选择已导入的 PNG、JPEG、GIF 或 WebP 图片。",
                    ));
                }
                tx.query_row(
                    "SELECT blob_id FROM platform_resources WHERE id=?1",
                    [id],
                    |r| r.get(0),
                )?
            }
            None => None,
        }
    } else {
        old.cover_blob_id
    };
    let changed = tx.execute("UPDATE platform_projects SET name=?1,description=?2,status=?3,favorite=?4,cover_blob_id=?5,revision=revision+1,updated_at=?6 WHERE id=?7 AND revision=?8 AND deleted_at IS NULL",params![input.name,input.description,input.status.as_str(),input.favorite,cover,now(),input.id,input.base_revision])?;
    if changed != 1 {
        return Err(AppError::conflict(old.revision));
    }
    set_tags(&tx, "project_id", &input.id, &input.tags)?;
    let result = get_project(&tx, &input.id)?;
    tx.commit()?;
    Ok(result)
}
const RESOURCE_COLUMNS: &str = "r.id,r.kind,r.name,r.description,r.source,r.folder_id,r.original_name,r.url,r.favorite,r.revision,r.created_at,r.updated_at,r.deleted_at,b.size,b.mime_type,b.sha256";
fn resource_row(r: &Row<'_>) -> rusqlite::Result<Resource> {
    let kind: String = r.get(1)?;
    Ok(Resource {
        id: r.get(0)?,
        kind: match kind.as_str() {
            "file" => ResourceKind::File,
            "link" => ResourceKind::Link,
            "note" => ResourceKind::Note,
            _ => return Err(rusqlite::Error::InvalidQuery),
        },
        name: r.get(2)?,
        description: r.get(3)?,
        source: r.get(4)?,
        folder_id: r.get(5)?,
        original_name: r.get(6)?,
        url: r.get(7)?,
        favorite: r.get(8)?,
        revision: r.get(9)?,
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
        deleted_at: r.get(12)?,
        size: r.get::<_, Option<u32>>(13)?.map(u64::from),
        mime_type: r.get(14)?,
        sha256: r.get(15)?,
        tags: Vec::new(),
        project_ids: Vec::new(),
    })
}
fn enrich_resource(conn: &Connection, resource: &mut Resource) -> AppResult<()> {
    resource.tags = entity_tags(conn, "resource_id", &resource.id)?;
    let mut stmt = conn.prepare("SELECT a.project_id FROM platform_project_resources a JOIN platform_projects p ON p.id=a.project_id WHERE a.resource_id=?1 AND p.deleted_at IS NULL ORDER BY a.project_id")?;
    resource.project_ids = stmt
        .query_map([&resource.id], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(())
}
fn resource_including_deleted(conn: &Connection, id: &str) -> AppResult<Resource> {
    let mut resource = conn.query_row(&format!("SELECT {RESOURCE_COLUMNS} FROM platform_resources r LEFT JOIN platform_blobs b ON b.id=r.blob_id WHERE r.id=?1"),[id],resource_row).optional()?.ok_or_else(not_found)?;
    enrich_resource(conn, &mut resource)?;
    Ok(resource)
}
pub fn get_resource(conn: &Connection, id: &str) -> AppResult<Resource> {
    let resource = resource_including_deleted(conn, id)?;
    if resource.deleted_at.is_some() {
        return Err(not_found());
    }
    Ok(resource)
}
pub fn list_resources(conn: &Connection, input: ResourceQuery) -> AppResult<Vec<Resource>> {
    if let Some(id) = &input.project_id {
        active_project(conn, id)?;
    }
    if let Some(id) = &input.folder_id {
        active_folder(conn, &Some(id.clone()))?;
    }
    let mut stmt = conn.prepare(&format!("SELECT {RESOURCE_COLUMNS} FROM platform_resources r LEFT JOIN platform_blobs b ON b.id=r.blob_id WHERE r.deleted_at IS NULL AND (?1='' OR instr(lower(r.name||char(10)||r.description||char(10)||r.source||char(10)||coalesce(r.url,'')),lower(?1))>0) AND (?2 IS NULL OR r.kind=?2) AND (?3 IS NULL OR r.folder_id=?3) AND (?4=0 OR r.folder_id IS NULL) AND (?5 IS NULL OR EXISTS(SELECT 1 FROM platform_project_resources a WHERE a.resource_id=r.id AND a.project_id=?5)) AND (?6=0 OR r.favorite=1) AND (?7 IS NULL OR EXISTS(SELECT 1 FROM platform_entity_tags e JOIN platform_tags t ON t.id=e.tag_id WHERE e.resource_id=r.id AND t.name=?7 COLLATE NOCASE)) ORDER BY r.updated_at DESC,r.id LIMIT ?8 OFFSET ?9"))?;
    let mut resources = stmt
        .query_map(
            params![
                input.keyword,
                input.kind.map(|k| k.as_str()),
                input.folder_id,
                input.root_only,
                input.project_id,
                input.favorite_only,
                input.tag,
                input.limit,
                input.offset
            ],
            resource_row,
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for resource in &mut resources {
        enrich_resource(conn, resource)?;
    }
    Ok(resources)
}
fn active_project(conn: &Connection, id: &str) -> AppResult<()> {
    if get_project(conn, id)?.deleted_at.is_some() {
        return Err(not_found());
    }
    Ok(())
}
fn active_folder(conn: &Connection, id: &Option<String>) -> AppResult<()> {
    if let Some(id) = id {
        get_folder(conn, id)?;
    }
    Ok(())
}
fn initial_association(conn: &Connection, id: &str, project_id: Option<String>) -> AppResult<()> {
    if let Some(project) = project_id {
        active_project(conn, &project)?;
        conn.execute("INSERT INTO platform_project_resources(project_id,resource_id,created_at) VALUES(?1,?2,?3)",params![project,id,now()])?;
    }
    Ok(())
}
pub fn create_link(conn: &mut Connection, input: CreateLink) -> AppResult<Resource> {
    let tx = conn.transaction()?;
    active_folder(&tx, &input.folder_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    tx.execute("INSERT INTO platform_resources(id,kind,name,description,source,folder_id,url,created_at,updated_at) VALUES(?1,'link',?2,?3,?4,?5,?6,?7,?7)",params![id,input.name,input.description,input.source,input.folder_id,input.url,now()])?;
    initial_association(&tx, &id, input.project_id)?;
    let result = get_resource(&tx, &id)?;
    tx.commit()?;
    Ok(result)
}
pub fn import_file(
    conn: &mut Connection,
    input: ImportFile,
    blob: Blob,
    original_name: String,
    name: String,
) -> AppResult<Resource> {
    import_annotated_file(
        conn,
        input,
        blob,
        original_name,
        name,
        String::new(),
        String::new(),
    )
}
pub fn import_annotated_file(
    conn: &mut Connection,
    input: ImportFile,
    blob: Blob,
    original_name: String,
    name: String,
    source: String,
    description: String,
) -> AppResult<Resource> {
    let tx = conn.transaction()?;
    active_folder(&tx, &input.folder_id)?;
    let existing: Option<String> = tx
        .query_row(
            "SELECT id FROM platform_blobs WHERE sha256=?1",
            [&blob.sha256],
            |r| r.get(0),
        )
        .optional()?;
    let blob_id = if let Some(id) = existing {
        id
    } else {
        tx.execute("INSERT INTO platform_blobs(id,sha256,internal_path,size,mime_type,created_at) VALUES(?1,?2,?3,?4,?5,?6)",params![blob.id,blob.sha256,blob.internal_path,i64::try_from(blob.size).map_err(|_|AppError::validation("文件大小无效。"))?,blob.mime_type,now()])?;
        blob.id
    };
    let id = uuid::Uuid::new_v4().to_string();
    let changed=tx.execute("INSERT INTO platform_resources(id,kind,name,folder_id,blob_id,original_name,created_at,updated_at,source,description) VALUES(?1,'file',?2,?3,?4,?5,?6,?6,?7,?8)",params![id,name,input.folder_id,blob_id,original_name,now(),source,description])?;
    if changed != 1 {
        return Err(AppError::new(
            ErrorCode::DbError,
            "资料未写入，操作已回滚。",
            true,
        ));
    }
    initial_association(&tx, &id, input.project_id)?;
    let result = get_resource(&tx, &id)?;
    tx.commit()?;
    Ok(result)
}
pub fn save_resource(conn: &mut Connection, input: SaveResource) -> AppResult<Resource> {
    let tx = conn.transaction()?;
    let old = get_resource(&tx, &input.id)?;
    if old.revision != input.base_revision {
        return Err(AppError::conflict(old.revision));
    }
    active_folder(&tx, &input.folder_id)?;
    if (old.kind == ResourceKind::Link) != input.url.is_some() {
        return Err(AppError::validation("资料链接字段与类型不符。"));
    }
    let time = now();
    // Notes share a title with their resource; bump the note revision so an old editor cannot overwrite a rename.
    if old.kind == ResourceKind::Note && old.name != input.name {
        let revision: i64 = tx.query_row(
            "SELECT revision FROM platform_notes WHERE resource_id=?1",
            [&input.id],
            |r| r.get(0),
        )?;
        let changed = tx.execute(
            "UPDATE platform_notes SET revision=revision+1,updated_at=?1 WHERE resource_id=?2 AND revision=?3",
            params![time, input.id, revision],
        )?;
        if changed != 1 {
            return Err(AppError::conflict(revision));
        }
    }
    let changed = tx.execute("UPDATE platform_resources SET name=?1,description=?2,source=?3,folder_id=?4,url=?5,favorite=?6,revision=revision+1,updated_at=?7 WHERE id=?8 AND revision=?9 AND deleted_at IS NULL",params![input.name,input.description,input.source,input.folder_id,input.url,input.favorite,time,input.id,input.base_revision])?;
    if changed != 1 {
        return Err(AppError::conflict(old.revision));
    }
    set_tags(&tx, "resource_id", &input.id, &input.tags)?;
    let result = get_resource(&tx, &input.id)?;
    tx.commit()?;
    Ok(result)
}
pub fn set_resource_project(
    conn: &mut Connection,
    input: SetResourceProject,
) -> AppResult<Resource> {
    let tx = conn.transaction()?;
    let old = get_resource(&tx, &input.id)?;
    if old.revision != input.base_revision {
        return Err(AppError::conflict(old.revision));
    }
    active_project(&tx, &input.project_id)?;
    let changed = if input.linked {
        tx.execute("INSERT OR IGNORE INTO platform_project_resources(project_id,resource_id,created_at) VALUES(?1,?2,?3)",params![input.project_id,input.id,now()])?
    } else {
        tx.execute(
            "DELETE FROM platform_project_resources WHERE project_id=?1 AND resource_id=?2",
            params![input.project_id, input.id],
        )?
    };
    if changed == 1 {
        let updated = tx.execute(
            "UPDATE platform_resources SET revision=revision+1,updated_at=?1 WHERE id=?2 AND revision=?3 AND deleted_at IS NULL",
            params![now(), input.id, input.base_revision],
        )?;
        if updated != 1 {
            return Err(AppError::conflict(old.revision));
        }
    }
    let result = get_resource(&tx, &input.id)?;
    tx.commit()?;
    Ok(result)
}
pub fn set_resource_deleted(
    conn: &mut Connection,
    input: SetResourceDeleted,
) -> AppResult<Resource> {
    let tx = conn.transaction()?;
    let old = resource_including_deleted(&tx, &input.id)?;
    if old.revision != input.base_revision {
        return Err(AppError::conflict(old.revision));
    }
    if old.deleted_at.is_some() != input.deleted {
        let time = now();
        // A restored resource in a trashed folder returns to the root, without reviving the folder.
        let folder = match old.folder_id {
            Some(id) => match get_folder(&tx, &id) {
                Ok(_) => Some(id),
                Err(error) if error.code == ErrorCode::NotFound => None,
                Err(error) => return Err(error),
            },
            None => None,
        };
        let changed = tx.execute("UPDATE platform_resources SET deleted_at=?1,folder_id=?2,updated_at=?3,revision=revision+1 WHERE id=?4 AND revision=?5",params![input.deleted.then_some(time.clone()),folder,time,input.id,input.base_revision])?;
        if changed != 1 {
            return Err(AppError::conflict(old.revision));
        }
    }
    let result = resource_including_deleted(&tx, &input.id)?;
    tx.commit()?;
    Ok(result)
}
pub fn get_blob(conn: &Connection, id: &str) -> AppResult<Blob> {
    conn.query_row(
        "SELECT id,sha256,internal_path,size,mime_type FROM platform_blobs WHERE id=?1",
        [id],
        |r| {
            Ok(Blob {
                id: r.get(0)?,
                sha256: r.get(1)?,
                internal_path: r.get(2)?,
                size: u64::from(r.get::<_, u32>(3)?),
                mime_type: r.get(4)?,
            })
        },
    )
    .optional()?
    .ok_or_else(not_found)
}
pub fn resource_blob(conn: &Connection, id: &str) -> AppResult<Blob> {
    let resource = get_resource(conn, id)?;
    if resource.kind != ResourceKind::File {
        return Err(AppError::validation("该资料不是文件。"));
    }
    let blob_id: String = conn.query_row(
        "SELECT blob_id FROM platform_resources WHERE id=?1",
        [id],
        |r| r.get(0),
    )?;
    get_blob(conn, &blob_id)
}
pub fn project_cover(conn: &Connection, id: &str) -> AppResult<Blob> {
    let project = get_project(conn, id)?;
    if project.deleted_at.is_some() {
        return Err(not_found());
    }
    get_blob(conn, &project.cover_blob_id.ok_or_else(not_found)?)
}
fn folder_row(r: &Row<'_>) -> rusqlite::Result<Folder> {
    Ok(Folder {
        id: r.get(0)?,
        parent_id: r.get(1)?,
        name: r.get(2)?,
        revision: r.get(3)?,
    })
}
fn get_folder(conn: &Connection, id: &str) -> AppResult<Folder> {
    conn.query_row("SELECT id,parent_id,name,revision FROM platform_folders WHERE id=?1 AND deleted_at IS NULL",[id],folder_row).optional()?.ok_or_else(not_found)
}
pub fn list_folders(conn: &Connection, input: ListRequest) -> AppResult<Vec<Folder>> {
    let mut stmt = conn.prepare("SELECT id,parent_id,name,revision FROM platform_folders WHERE deleted_at IS NULL ORDER BY name,id LIMIT ?1 OFFSET ?2")?;
    Ok(stmt
        .query_map(params![input.limit, input.offset], folder_row)?
        .collect::<rusqlite::Result<_>>()?)
}
pub fn create_folder(conn: &mut Connection, input: CreateFolder) -> AppResult<Folder> {
    let tx = conn.transaction()?;
    active_folder(&tx, &input.parent_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    tx.execute("INSERT INTO platform_folders(id,parent_id,name,created_at,updated_at) VALUES(?1,?2,?3,?4,?4)",params![id,input.parent_id,input.name,now()])?;
    let result = get_folder(&tx, &id)?;
    tx.commit()?;
    Ok(result)
}
pub fn save_folder(conn: &mut Connection, input: SaveFolder) -> AppResult<Folder> {
    let tx = conn.transaction()?;
    let old = get_folder(&tx, &input.id)?;
    if old.revision != input.base_revision {
        return Err(AppError::conflict(old.revision));
    }
    active_folder(&tx, &input.parent_id)?;
    if let Some(parent) = &input.parent_id {
        let cyclic: bool = tx.query_row("WITH RECURSIVE descendants(id) AS (SELECT id FROM platform_folders WHERE id=?1 UNION SELECT f.id FROM platform_folders f JOIN descendants d ON f.parent_id=d.id) SELECT EXISTS(SELECT 1 FROM descendants WHERE id=?2)",params![input.id,parent],|r|r.get(0))?;
        if cyclic {
            return Err(AppError::validation("文件夹不能移动到自身或子文件夹。"));
        }
    }
    let changed = tx.execute("UPDATE platform_folders SET parent_id=?1,name=?2,revision=revision+1,updated_at=?3 WHERE id=?4 AND revision=?5 AND deleted_at IS NULL",params![input.parent_id,input.name,now(),input.id,input.base_revision])?;
    if changed != 1 {
        return Err(AppError::conflict(old.revision));
    }
    let result = get_folder(&tx, &input.id)?;
    tx.commit()?;
    Ok(result)
}
pub fn delete_folder(conn: &mut Connection, input: DeleteFolder) -> AppResult<()> {
    let tx = conn.transaction()?;
    let old = get_folder(&tx, &input.id)?;
    if old.revision != input.base_revision {
        return Err(AppError::conflict(old.revision));
    }
    let descendants = "WITH RECURSIVE descendants(id) AS (SELECT id FROM platform_folders WHERE id=?1 UNION SELECT f.id FROM platform_folders f JOIN descendants d ON f.parent_id=d.id)";
    let time = now();
    let (resource_filter, assignment) = match input.mode {
        FolderDeleteMode::MoveToRoot => (
            "folder_id IN (SELECT id FROM descendants)",
            "folder_id=NULL",
        ),
        FolderDeleteMode::TrashContents => (
            "folder_id IN (SELECT id FROM descendants) AND deleted_at IS NULL",
            "deleted_at=?2",
        ),
    };
    let expected: u32 = tx.query_row(
        &format!("{descendants} SELECT count(*) FROM platform_resources WHERE {resource_filter}"),
        [&input.id],
        |r| r.get(0),
    )?;
    let changed = tx.execute(&format!("{descendants} UPDATE platform_resources SET {assignment},revision=revision+1,updated_at=?2 WHERE {resource_filter}"),params![input.id,time])?;
    if changed != expected as usize {
        return Err(AppError::conflict(old.revision));
    }
    let folder_filter = "id IN (SELECT id FROM descendants) AND deleted_at IS NULL";
    let expected: u32 = tx.query_row(
        &format!("{descendants} SELECT count(*) FROM platform_folders WHERE {folder_filter}"),
        [&input.id],
        |r| r.get(0),
    )?;
    let changed = tx.execute(&format!("{descendants} UPDATE platform_folders SET deleted_at=?2,revision=revision+1,updated_at=?2 WHERE {folder_filter}"),params![input.id,time])?;
    if changed != expected as usize {
        return Err(AppError::conflict(old.revision));
    }
    tx.commit()?;
    Ok(())
}
