use crate::contracts::*;
use rusqlite::{Connection, OptionalExtension, Row, params};

pub(super) fn not_found() -> AppError {
    AppError::new(ErrorCode::NotFound, "内容不存在或已移入回收站。", false)
}
pub(super) fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
pub(super) fn project_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    let status: String = row.get(3)?;
    let status = match status.as_str() {
        "active" => ProjectStatus::Active,
        "archived" => ProjectStatus::Archived,
        _ => return Err(rusqlite::Error::InvalidQuery),
    };
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        status,
        revision: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        deleted_at: row.get(7)?,
        favorite: row.get(8)?,
        cover_blob_id: row.get(9)?,
        tags: Vec::new(),
    })
}
pub fn get_project(conn: &Connection, id: &str) -> AppResult<Project> {
    let mut project = conn.query_row("SELECT id,name,description,status,revision,created_at,updated_at,deleted_at,favorite,cover_blob_id FROM platform_projects WHERE id=?1", [id], project_row)
        .optional()?.ok_or_else(not_found)?;
    project.tags = super::content_repository::entity_tags(conn, "project_id", id)?;
    Ok(project)
}
pub fn list_projects(conn: &Connection, input: ListRequest) -> AppResult<Vec<Project>> {
    let mut statement = conn.prepare("SELECT id,name,description,status,revision,created_at,updated_at,deleted_at,favorite,cover_blob_id FROM platform_projects WHERE deleted_at IS NULL ORDER BY updated_at DESC,id LIMIT ?1 OFFSET ?2")?;
    let rows = statement.query_map(params![input.limit, input.offset], project_row)?;
    let mut projects = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    for project in &mut projects {
        project.tags = super::content_repository::entity_tags(conn, "project_id", &project.id)?;
    }
    Ok(projects)
}
pub fn create_project(conn: &mut Connection, input: CreateProject) -> AppResult<Project> {
    let id = uuid::Uuid::new_v4().to_string();
    let time = now();
    conn.execute("INSERT INTO platform_projects(id,name,description,status,created_at,updated_at) VALUES(?1,?2,?3,'active',?4,?4)", params![id,input.name,input.description,time])?;
    get_project(conn, &id)
}
pub fn update_project(conn: &mut Connection, input: UpdateProject) -> AppResult<Project> {
    let tx = conn.transaction()?;
    let existing = get_project(&tx, &input.id)?;
    if existing.deleted_at.is_some() {
        return Err(not_found());
    }
    if existing.revision != input.base_revision {
        return Err(AppError::conflict(existing.revision));
    }
    let changed = tx.execute("UPDATE platform_projects SET name=?1,description=?2,status=?3,revision=revision+1,updated_at=?4 WHERE id=?5 AND revision=?6 AND deleted_at IS NULL",
        params![input.name,input.description,input.status.as_str(),now(),input.id,input.base_revision])?;
    if changed != 1 {
        return Err(AppError::conflict(existing.revision));
    }
    let project = get_project(&tx, &input.id)?;
    tx.commit()?;
    Ok(project)
}
pub fn set_project_deleted(conn: &mut Connection, input: SetProjectDeleted) -> AppResult<Project> {
    let tx = conn.transaction()?;
    let existing = get_project(&tx, &input.id)?;
    if existing.revision != input.base_revision {
        return Err(AppError::conflict(existing.revision));
    }
    if input.deleted != existing.deleted_at.is_some() {
        let time = now();
        let deleted_at = input.deleted.then_some(time.clone());
        let changed = tx.execute("UPDATE platform_projects SET deleted_at=?1,updated_at=?2,revision=revision+1 WHERE id=?3 AND revision=?4", params![deleted_at,time,input.id,input.base_revision])?;
        if changed != 1 {
            return Err(AppError::conflict(existing.revision));
        }
    }
    let project = get_project(&tx, &input.id)?;
    tx.commit()?;
    Ok(project)
}
pub fn create_note(conn: &mut Connection, input: CreateNote) -> AppResult<Note> {
    let tx = conn.transaction()?;
    if let Some(project_id) = &input.project_id {
        let project = get_project(&tx, project_id)?;
        if project.deleted_at.is_some() {
            return Err(not_found());
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    let time = now();
    let body = serde_json::json!({"type":"doc","content":[{"type":"paragraph"}]});
    tx.execute("INSERT INTO platform_resources(id,kind,name,created_at,updated_at) VALUES(?1,'note',?2,?3,?3)", params![id,input.title,time])?;
    tx.execute("INSERT INTO platform_notes(resource_id,body_json,plain_text,schema_version,created_at,updated_at) VALUES(?1,?2,'',1,?3,?3)", params![id,body.to_string(),time])?;
    if let Some(project_id) = input.project_id {
        tx.execute("INSERT INTO platform_project_resources(project_id,resource_id,created_at) VALUES(?1,?2,?3)", params![project_id,id,time])?;
    }
    let note = get_note(&tx, &id)?;
    tx.commit()?;
    Ok(note)
}
pub fn get_note(conn: &Connection, id: &str) -> AppResult<Note> {
    let data = conn.query_row("SELECT n.resource_id,r.name,n.body_json,n.plain_text,n.schema_version,n.revision,n.created_at,n.updated_at FROM platform_notes n JOIN platform_resources r ON r.id=n.resource_id WHERE n.resource_id=?1 AND r.kind='note' AND r.deleted_at IS NULL", [id], |row| {
        Ok((Note { id:row.get(0)?, title:row.get(1)?, body:serde_json::Value::Null, plain_text:row.get(3)?, schema_version:row.get(4)?, revision:row.get(5)?, created_at:row.get(6)?, updated_at:row.get(7)? }, row.get::<_,String>(2)?))
    }).optional()?.ok_or_else(not_found)?;
    let (mut note, body) = data;
    note.body = serde_json::from_str(&body).map_err(|_| {
        AppError::new(
            ErrorCode::DbError,
            "已存正文格式损坏，请保留数据并检查备份。",
            false,
        )
    })?;
    Ok(note)
}
pub fn list_notes(conn: &Connection, input: ListRequest) -> AppResult<Vec<NoteSummary>> {
    let mut statement = conn.prepare("SELECT n.resource_id,r.name,n.revision,n.updated_at FROM platform_notes n JOIN platform_resources r ON r.id=n.resource_id WHERE r.kind='note' AND r.deleted_at IS NULL ORDER BY n.updated_at DESC,n.resource_id LIMIT ?1 OFFSET ?2")?;
    let rows = statement.query_map(params![input.limit, input.offset], |row| {
        Ok(NoteSummary {
            id: row.get(0)?,
            title: row.get(1)?,
            revision: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}
pub fn save_note(
    conn: &mut Connection,
    input: SaveNote,
    plain_text: String,
) -> AppResult<SaveReceipt> {
    let tx = conn.transaction()?;
    let existing = get_note(&tx, &input.id)?;
    if existing.revision != input.base_revision {
        return Err(AppError::conflict(existing.revision));
    }
    let time = now();
    if input.create_version {
        super::note_repository::snapshot(&tx, &existing, &time)?;
    }
    let changed = tx.execute("UPDATE platform_notes SET body_json=?1,plain_text=?2,schema_version=?3,revision=revision+1,updated_at=?4 WHERE resource_id=?5 AND revision=?6",
        params![input.body.to_string(),plain_text,input.schema_version,time,input.id,input.base_revision])?;
    if changed != 1 {
        return Err(AppError::conflict(existing.revision));
    }
    let resource_revision: i64 = tx.query_row(
        "SELECT revision FROM platform_resources WHERE id=?1",
        [&input.id],
        |r| r.get(0),
    )?;
    let changed = tx.execute(
        "UPDATE platform_resources SET name=?1,revision=revision+1,updated_at=?2 WHERE id=?3 AND revision=?4 AND deleted_at IS NULL",
        params![input.title, time, input.id, resource_revision],
    )?;
    if changed != 1 {
        return Err(AppError::conflict(existing.revision));
    }
    if input.create_version {
        super::note_repository::snapshot(&tx, &get_note(&tx, &input.id)?, &time)?;
    }
    tx.commit()?;
    Ok(SaveReceipt {
        entity_id: input.id,
        saved_revision: existing.revision + 1,
        client_edit_sequence: input.client_edit_sequence,
        saved_at: time,
    })
}
pub fn workspace_status(conn: &Connection) -> AppResult<WorkspaceStatus> {
    let (workspace_id, schema_version) = conn.query_row(
        "SELECT workspace_id,schema_version FROM platform_meta",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let project_count = conn.query_row(
        "SELECT count(*) FROM platform_projects WHERE deleted_at IS NULL",
        [],
        |r| r.get(0),
    )?;
    let note_count = conn.query_row("SELECT count(*) FROM platform_notes n JOIN platform_resources r ON r.id=n.resource_id WHERE r.deleted_at IS NULL", [], |r| r.get(0))?;
    Ok(WorkspaceStatus {
        workspace_id,
        schema_version,
        app_version: env!("CARGO_PKG_VERSION").into(),
        project_count,
        note_count,
    })
}
