use super::{
    domain,
    repository::{self, not_found, now},
};
use crate::contracts::*;
use rusqlite::{Connection, OptionalExtension, params};

pub fn snapshot(conn: &Connection, note: &Note, time: &str) -> AppResult<()> {
    let changed = conn.execute("INSERT INTO platform_note_versions(id,resource_id,source_revision,title,body_json,plain_text,schema_version,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
        params![uuid::Uuid::new_v4().to_string(),note.id,note.revision,note.title,note.body.to_string(),note.plain_text,note.schema_version,time])?;
    if changed != 1 {
        return Err(AppError::new(
            ErrorCode::DbError,
            "版本未建立，内容未提交。",
            true,
        ));
    }
    Ok(())
}
pub fn list(conn: &Connection, input: VersionQuery) -> AppResult<Vec<NoteVersionSummary>> {
    repository::get_note(conn, &input.id)?;
    let mut statement = conn.prepare("SELECT id,resource_id,title,source_revision,created_at FROM platform_note_versions WHERE resource_id=?1 ORDER BY created_at DESC,source_revision DESC,id LIMIT ?2 OFFSET ?3")?;
    let rows = statement.query_map(params![input.id, input.limit, input.offset], |r| {
        Ok(NoteVersionSummary {
            id: r.get(0)?,
            note_id: r.get(1)?,
            title: r.get(2)?,
            source_revision: r.get(3)?,
            created_at: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}
pub fn get(conn: &Connection, input: VersionRequest) -> AppResult<NoteVersion> {
    repository::get_note(conn, &input.id)?;
    let data = conn.query_row("SELECT id,resource_id,title,source_revision,created_at,body_json,plain_text,schema_version FROM platform_note_versions WHERE id=?1 AND resource_id=?2", params![input.version_id,input.id], |r| Ok((NoteVersionSummary{id:r.get(0)?,note_id:r.get(1)?,title:r.get(2)?,source_revision:r.get(3)?,created_at:r.get(4)?},r.get::<_,String>(5)?,r.get::<_,String>(6)?,r.get::<_,u32>(7)?))).optional()?.ok_or_else(not_found)?;
    let body = serde_json::from_str(&data.1).map_err(|_| {
        AppError::new(
            ErrorCode::DbError,
            "历史版本损坏，请保留数据并检查备份。",
            false,
        )
    })?;
    domain::document(&body, data.3)?;
    Ok(NoteVersion {
        summary: data.0,
        body,
        plain_text: data.2,
        schema_version: data.3,
    })
}
pub fn restore(conn: &mut Connection, input: RestoreVersion) -> AppResult<Note> {
    let version = get(
        conn,
        VersionRequest {
            request_id: input.request_id.clone(),
            id: input.id.clone(),
            version_id: input.version_id,
        },
    )?;
    let plain_text = domain::document(&version.body, version.schema_version)?;
    repository::save_note(
        conn,
        SaveNote {
            request_id: input.request_id,
            id: input.id.clone(),
            title: version.summary.title,
            body: version.body,
            schema_version: version.schema_version,
            base_revision: input.base_revision,
            client_edit_sequence: 0,
            create_version: true,
        },
        plain_text,
    )?;
    repository::get_note(conn, &input.id)
}
// Export reads and renders a version before opening a potentially long-lived native dialog.
// Its exact revision is checked again before any destination is written.
pub fn export_bytes(conn: &Connection, input: ExportNote) -> AppResult<Vec<u8>> {
    let note = repository::get_note(conn, &input.id)?;
    if note.revision != input.base_revision {
        return Err(AppError::conflict(note.revision));
    }
    domain::document(&note.body, note.schema_version)?;
    let text = match input.format {
        NoteExportFormat::Txt => format!("{}\n\n{}\n", note.title, note.plain_text),
        NoteExportFormat::Markdown => format!(
            "# {}\n\n{}\n",
            super::note_export::escape(&note.title),
            super::note_export::render(&note.body)
        ),
    };
    Ok(text.into_bytes())
}

pub fn copy_draft(conn: &mut Connection, draft: NoteDraft) -> AppResult<Note> {
    let title = domain::title(if draft.title.trim().is_empty() {
        "恢复的笔记"
    } else {
        &draft.title
    })?;
    let text = domain::document(&draft.body, draft.schema_version)?;
    let tx = conn.transaction()?;
    let id = uuid::Uuid::new_v4().to_string();
    let time = now();
    let resources = tx.execute("INSERT INTO platform_resources(id,kind,name,created_at,updated_at) VALUES(?1,'note',?2,?3,?3)",params![id,title,time])?;
    let notes = tx.execute("INSERT INTO platform_notes(resource_id,body_json,plain_text,schema_version,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)",params![id,draft.body.to_string(),text,draft.schema_version,time])?;
    if resources != 1 || notes != 1 {
        return Err(AppError::new(
            ErrorCode::DbError,
            "恢复副本未建立，草稿已保留。",
            true,
        ));
    }
    let note = repository::get_note(&tx, &id)?;
    snapshot(&tx, &note, &time)?;
    tx.commit()?;
    Ok(note)
}
