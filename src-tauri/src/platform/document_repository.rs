use super::content_repository as content;
use crate::contracts::*;
use rusqlite::{Connection, OptionalExtension, params};

pub struct SessionRecord {
    pub session: DocumentSession,
    pub source_blob: Blob,
}
fn not_found() -> AppError {
    AppError::new(ErrorCode::NotFound, "编辑会话或文件版本不存在。", false)
}
pub fn session(conn: &Connection, id: &str) -> AppResult<SessionRecord> {
    let (session, blob_id) = conn.query_row("SELECT id,resource_id,base_revision,filename,format,markdown,edit_sequence,updated_at,source_blob_id FROM platform_document_sessions WHERE id=?1", [id], |r| Ok((DocumentSession {
        id:r.get(0)?,resource_id:r.get(1)?,base_revision:r.get(2)?,filename:r.get(3)?,format:r.get(4)?,markdown:r.get(5)?,edit_sequence:r.get::<_, i64>(6)? as u64,updated_at:r.get(7)?,changed:false,
    }, r.get::<_,String>(8)?))).optional()?.ok_or_else(not_found)?;
    Ok(SessionRecord {
        session,
        source_blob: content::get_blob(conn, &blob_id)?,
    })
}
pub fn active_session(conn: &Connection, resource_id: &str) -> AppResult<Option<SessionRecord>> {
    let id: Option<String> = conn
        .query_row(
            "SELECT id FROM platform_document_sessions WHERE resource_id=?1",
            [resource_id],
            |r| r.get(0),
        )
        .optional()?;
    id.map(|id| session(conn, &id)).transpose()
}
pub fn create_session(
    conn: &mut Connection,
    session: &DocumentSession,
    blob: &Blob,
) -> AppResult<()> {
    let tx = conn.transaction()?;
    let old = content::get_resource(&tx, &session.resource_id)?;
    if old.revision != session.base_revision {
        return Err(AppError::conflict(old.revision));
    }
    if content::resource_blob(&tx, &old.id)?.id != blob.id {
        return Err(AppError::conflict(old.revision));
    }
    let count=tx.execute("INSERT INTO platform_document_sessions(id,resource_id,base_revision,source_blob_id,filename,format,markdown,edit_sequence,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,0,?8,?8)",params![session.id,session.resource_id,session.base_revision,blob.id,session.filename,session.format,session.markdown,session.updated_at])?;
    if count != 1 {
        return Err(AppError::new(
            ErrorCode::DbError,
            "编辑会话未创建，操作已回滚。",
            true,
        ));
    }
    snapshot(&tx, &old)?;
    tx.commit()?;
    Ok(())
}
pub fn write_markdown(
    conn: &mut Connection,
    input: WriteMarkdownDraft,
) -> AppResult<DocumentSession> {
    let tx = conn.transaction()?;
    let current = session(&tx, &input.id)?.session;
    if current.markdown.is_none() {
        return Err(AppError::validation("此会话不是 Markdown 编辑。"));
    }
    if input.edit_sequence < current.edit_sequence
        || (input.edit_sequence == current.edit_sequence
            && current.markdown.as_deref() != Some(&input.text))
    {
        return Err(AppError::validation(
            "草稿序号已过期，请保留本地输入并重新打开恢复会话。",
        ));
    }
    if input.edit_sequence > current.edit_sequence {
        let count = tx.execute("UPDATE platform_document_sessions SET markdown=?1,edit_sequence=?2,updated_at=?3 WHERE id=?4 AND edit_sequence=?5",params![input.text,input.edit_sequence as i64,chrono::Utc::now().to_rfc3339(),input.id,current.edit_sequence as i64])?;
        if count != 1 {
            return Err(AppError::validation("草稿未写入。"));
        }
    }
    let saved = session(&tx, &input.id)?.session;
    tx.commit()?;
    Ok(saved)
}
pub fn list_sessions(conn: &Connection, input: ListRequest) -> AppResult<Vec<DocumentSession>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM platform_document_sessions ORDER BY updated_at DESC,id LIMIT ?1 OFFSET ?2",
    )?;
    let ids = stmt
        .query_map(params![input.limit, input.offset], |r| {
            r.get::<_, String>(0)
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    ids.into_iter()
        .map(|id| {
            let mut item = session(conn, &id)?.session;
            item.markdown = None; // The recovery list does not duplicate document bodies.
            Ok(item)
        })
        .collect()
}
pub fn snapshot(conn: &Connection, resource: &Resource) -> AppResult<()> {
    let blob = content::resource_blob(conn, &resource.id)?;
    let count=conn.execute("INSERT INTO platform_file_versions(id,resource_id,source_revision,blob_id,created_at) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(resource_id,source_revision) DO NOTHING",params![uuid::Uuid::new_v4().to_string(),resource.id,resource.revision,blob.id,chrono::Utc::now().to_rfc3339()])?;
    if count == 0 {
        let existing: Option<String>=conn.query_row("SELECT blob_id FROM platform_file_versions WHERE resource_id=?1 AND source_revision=?2",params![resource.id,resource.revision],|r|r.get(0)).optional()?;
        if existing.as_deref() != Some(&blob.id) {
            return Err(AppError::new(
                ErrorCode::DbError,
                "文件快照未建立，提交已回滚。",
                true,
            ));
        }
    }
    Ok(())
}
fn put_blob(conn: &Connection, blob: &Blob) -> AppResult<String> {
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM platform_blobs WHERE sha256=?1",
            [&blob.sha256],
            |r| r.get(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    conn.execute("INSERT INTO platform_blobs(id,sha256,internal_path,size,mime_type,created_at) VALUES(?1,?2,?3,?4,?5,?6)",params![blob.id,blob.sha256,blob.internal_path,blob.size as i64,blob.mime_type,chrono::Utc::now().to_rfc3339()])?;
    Ok(blob.id.clone())
}
fn replace(conn: &Connection, resource: &Resource, blob_id: &str) -> AppResult<Resource> {
    snapshot(conn, resource)?;
    let count = conn.execute("UPDATE platform_resources SET blob_id=?1,revision=revision+1,updated_at=?2 WHERE id=?3 AND revision=?4 AND deleted_at IS NULL",params![blob_id,chrono::Utc::now().to_rfc3339(),resource.id,resource.revision])?;
    if count != 1 {
        return Err(AppError::conflict(resource.revision));
    }
    let result = content::get_resource(conn, &resource.id)?;
    snapshot(conn, &result)?;
    Ok(result)
}
pub fn commit(
    conn: &mut Connection,
    input: CommitDocumentEdit,
    blob: Blob,
) -> AppResult<DocumentSave> {
    let tx = conn.transaction()?;
    let record = session(&tx, &input.id)?;
    if record.session.base_revision != input.base_revision
        || record.session.edit_sequence != input.edit_sequence
    {
        return Err(AppError::validation(
            "编辑会话已更新，请先同步恢复草稿再提交。",
        ));
    }
    let current = content::get_resource(&tx, &record.session.resource_id)?;
    if current.revision != input.base_revision {
        return Err(AppError::conflict(current.revision));
    }
    let blob_id = put_blob(&tx, &blob)?;
    let result = if blob.sha256 == record.source_blob.sha256 {
        current
    } else {
        replace(&tx, &current, &blob_id)?
    };
    let time = chrono::Utc::now().to_rfc3339();
    let count = tx.execute("UPDATE platform_document_sessions SET base_revision=?1,source_blob_id=?2,updated_at=?3 WHERE id=?4 AND base_revision=?5 AND edit_sequence=?6",params![result.revision,blob_id,time,input.id,input.base_revision,input.edit_sequence as i64])?;
    if count != 1 {
        return Err(AppError::conflict(result.revision));
    }
    let saved = DocumentSave {
        receipt: SaveReceipt {
            entity_id: result.id.clone(),
            saved_revision: result.revision,
            client_edit_sequence: input.edit_sequence,
            saved_at: time,
        },
        resource: result,
        session: session(&tx, &input.id)?.session,
    };
    tx.commit()?;
    Ok(saved)
}
pub fn end(conn: &mut Connection, input: EndDocumentEdit) -> AppResult<()> {
    let current = session(conn, &input.id)?.session;
    if current.edit_sequence != input.edit_sequence {
        return Err(AppError::validation("会话仍有后续输入，不能结束。"));
    }
    if conn.execute(
        "DELETE FROM platform_document_sessions WHERE id=?1 AND edit_sequence=?2",
        params![input.id, input.edit_sequence as i64],
    )? != 1
    {
        return Err(not_found());
    }
    Ok(())
}
pub fn versions(conn: &Connection, input: VersionQuery) -> AppResult<Vec<FileVersion>> {
    content::resource_blob(conn, &input.id)?;
    let mut stmt = conn.prepare("SELECT v.id,v.resource_id,v.source_revision,b.sha256,b.size,v.created_at FROM platform_file_versions v JOIN platform_blobs b ON b.id=v.blob_id WHERE v.resource_id=?1 ORDER BY v.source_revision DESC LIMIT ?2 OFFSET ?3")?;
    Ok(stmt
        .query_map(params![input.id, input.limit, input.offset], |r| {
            Ok(FileVersion {
                id: r.get(0)?,
                resource_id: r.get(1)?,
                source_revision: r.get(2)?,
                sha256: r.get(3)?,
                size: u64::from(r.get::<_, u32>(4)?),
                created_at: r.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}
pub fn version_blob(conn: &Connection, input: &VersionRequest) -> AppResult<Blob> {
    content::resource_blob(conn, &input.id)?;
    let id: String = conn
        .query_row(
            "SELECT blob_id FROM platform_file_versions WHERE id=?1 AND resource_id=?2",
            params![input.version_id, input.id],
            |r| r.get(0),
        )
        .optional()?
        .ok_or_else(not_found)?;
    content::get_blob(conn, &id)
}
pub fn restore(conn: &mut Connection, input: RestoreVersion) -> AppResult<Resource> {
    let tx = conn.transaction()?;
    if active_session(&tx, &input.id)?.is_some() {
        return Err(AppError::validation(
            "请先结束此资料的编辑会话，再恢复文件版本。",
        ));
    }
    let current = content::get_resource(&tx, &input.id)?;
    if current.revision != input.base_revision {
        return Err(AppError::conflict(current.revision));
    }
    let blob = version_blob(
        &tx,
        &VersionRequest {
            request_id: input.request_id,
            id: input.id,
            version_id: input.version_id,
        },
    )?;
    let result = replace(&tx, &current, &blob.id)?;
    tx.commit()?;
    Ok(result)
}

pub fn copy_source(conn: &Connection, id: &str) -> AppResult<String> {
    Ok(conn.query_row(
        "SELECT source FROM platform_resources WHERE id=?1",
        [id],
        |r| r.get(0),
    )?)
}
