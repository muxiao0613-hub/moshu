use super::{repository, task_repository};
use crate::contracts::*;
use rusqlite::{Connection, OptionalExtension, params};
fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}
pub fn normalize(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            '\u{3000}' => ' ',
            '\u{ff01}'..='\u{ff5e}' => char::from_u32(c as u32 - 0xfee0).unwrap_or(c),
            _ => c,
        })
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
pub fn preferences(conn: &Connection) -> AppResult<Preferences> {
    let found: Option<(String, i64)> = conn
        .query_row(
            "SELECT value_json,revision FROM platform_preferences WHERE key='personal'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    match found {
        Some((json, revision)) => {
            let mut p: Preferences = serde_json::from_str(&json).map_err(|_| {
                AppError::new(ErrorCode::DbError, "偏好格式损坏，请恢复默认设置。", false)
            })?;
            p.revision = revision;
            Ok(p)
        }
        None => Ok(Preferences::default()),
    }
}
pub fn save_preferences(conn: &mut Connection, input: SavePreferences) -> AppResult<Preferences> {
    let tx = conn.transaction()?;
    let current = preferences(&tx)?;
    if current.revision != input.base_revision {
        return Err(AppError::conflict(current.revision));
    }
    let mut next = input.preferences;
    next.revision = current.revision + 1;
    let json = serde_json::to_string(&next).map_err(|_| AppError::validation("设置格式无效。"))?;
    let stamp = now();
    let count=tx.execute("INSERT INTO platform_preferences(key,value_json,schema_version,revision,created_at,updated_at) VALUES('personal',?1,1,?2,?3,?3) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision,updated_at=excluded.updated_at WHERE revision=?4",params![json,next.revision,stamp,input.base_revision])?;
    if count != 1 {
        return Err(AppError::conflict(current.revision));
    }
    tx.commit()?;
    Ok(next)
}
pub fn save_location(conn: &mut Connection, location: &PageLocation) -> AppResult<()> {
    if let Some(id) = &location.entity_id {
        match location.page.as_str() {
            "notes" => {
                repository::get_note(conn, id)?;
            }
            "projects" => {
                repository::get_project(conn, id)?;
            }
            "resources" | "document" => {
                super::content_repository::get_resource(conn, id)?;
            }
            "module" => {}
            "tasks" => {
                task_repository::get(conn, id, &chrono::Local::now().date_naive().to_string())?;
            }
            _ => return Err(AppError::validation("页面不接受内容编号。")),
        };
        conn.execute("INSERT INTO platform_recent_visits VALUES(?1,?2,?3) ON CONFLICT(entity_type,entity_id) DO UPDATE SET visited_at=excluded.visited_at",params![location.page,id,now()])?;
    }
    conn.execute("INSERT INTO platform_preferences(key,value_json,schema_version,revision,created_at,updated_at) VALUES('location',?1,1,1,?2,?2) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=revision+1,updated_at=excluded.updated_at",params![serde_json::to_string(location).map_err(|_|AppError::validation("页面格式无效。"))?,now()])?;
    Ok(())
}
pub fn startup(conn: &mut Connection) -> AppResult<Startup> {
    let json: Option<String> = conn
        .query_row(
            "SELECT value_json FROM platform_preferences WHERE key='location'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    let location = json
        .and_then(|s| serde_json::from_str::<PageLocation>(&s).ok())
        .unwrap_or(PageLocation {
            page: "home".into(),
            entity_id: None,
        });
    let invalid = if ![
        "home",
        "projects",
        "resources",
        "notes",
        "tasks",
        "pet",
        "document",
        "module",
        "search",
        "modules",
        "trash",
        "settings",
        "help",
    ]
    .contains(&location.page.as_str())
    {
        true
    } else if let Some(id) = &location.entity_id {
        match location.page.as_str() {
            "module" => !conn
                .query_row(
                    "SELECT enabled FROM platform_module_states WHERE module_id=?1",
                    [id],
                    |r| r.get::<_, bool>(0),
                )
                .optional()?
                .unwrap_or(false),
            "notes" => repository::get_note(conn, id).is_err(),
            "projects" => repository::get_project(conn, id).is_err(),
            "resources" | "document" => super::content_repository::get_resource(conn, id).is_err(),
            "tasks" => {
                task_repository::get(conn, id, &chrono::Local::now().date_naive().to_string())
                    .is_err()
            }
            _ => true,
        }
    } else {
        false
    };
    Ok(Startup {
        preferences: preferences(conn)?,
        location: if invalid {
            PageLocation {
                page: "home".into(),
                entity_id: None,
            }
        } else {
            location
        },
        notice: invalid.then(|| "上次内容已删除或入口不可用，已返回首页。".into()),
    })
}
pub fn rebuild_search(conn: &mut Connection) -> AppResult<()> {
    let tx = conn.transaction()?;
    tx.execute_batch("CREATE TABLE IF NOT EXISTS platform_search_projection(module_id TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,title TEXT NOT NULL,plain_text TEXT NOT NULL,route TEXT NOT NULL,source_revision INTEGER NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(module_id,entity_type,entity_id));")?;
    tx.execute(
        "DELETE FROM platform_search_projection WHERE module_id='platform'",
        [],
    )?;
    let rows = {
        let mut stmt=tx.prepare("SELECT 'project',id,name,description,revision,updated_at FROM platform_projects WHERE deleted_at IS NULL UNION ALL SELECT r.kind,r.id,r.name,r.description||' '||r.source||' '||coalesce(r.url,'')||' '||coalesce(n.plain_text,''),r.revision,r.updated_at FROM platform_resources r LEFT JOIN platform_notes n ON n.resource_id=r.id WHERE r.deleted_at IS NULL UNION ALL SELECT 'task',id,title,description,revision,updated_at FROM platform_tasks WHERE deleted_at IS NULL")?;
        stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, String>(5)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
    };
    for (kind, id, title, text, revision, updated) in rows {
        tx.execute(
            "INSERT INTO platform_search_projection VALUES('platform',?1,?2,?3,?4,?5,?6,?7)",
            params![
                kind,
                id,
                normalize(&title),
                normalize(&text),
                kind,
                revision,
                updated
            ],
        )?;
    }
    tx.execute("DELETE FROM platform_search_dirty", [])?;
    tx.commit()?;
    Ok(())
}
pub fn search(conn: &mut Connection, input: SearchQuery) -> AppResult<SearchPage> {
    if conn
        .prepare("SELECT 1 FROM platform_search_dirty")?
        .exists([])?
    {
        rebuild_search(conn)?;
    }
    let keyword = normalize(&input.keyword);
    let mut statement=conn.prepare("SELECT s.entity_type,s.entity_id,coalesce(p.name,r.name,t.title),s.plain_text,s.source_revision,s.updated_at,CASE WHEN instr(s.title,?1)>0 THEN '名称' WHEN s.entity_type='note' THEN '正文或说明' WHEN s.entity_type='link' THEN 'URL 或说明' ELSE '说明' END FROM platform_search_projection s LEFT JOIN platform_projects p ON s.entity_type='project' AND p.id=s.entity_id LEFT JOIN platform_resources r ON s.entity_type IN ('note','file','link') AND r.id=s.entity_id LEFT JOIN platform_tasks t ON s.entity_type='task' AND t.id=s.entity_id WHERE s.module_id='platform' AND (instr(s.title,?1)>0 OR instr(s.plain_text,?1)>0) AND (?2 IS NULL OR s.entity_type=?2) AND ((p.id IS NOT NULL AND p.deleted_at IS NULL) OR (r.id IS NOT NULL AND r.deleted_at IS NULL) OR (t.id IS NOT NULL AND t.deleted_at IS NULL)) AND (?3 IS NULL OR p.id=?3 OR t.project_id=?3 OR EXISTS(SELECT 1 FROM platform_project_resources pr WHERE pr.resource_id=r.id AND pr.project_id=?3)) AND (?4 IS NULL OR EXISTS(SELECT 1 FROM platform_entity_tags et JOIN platform_tags tag ON tag.id=et.tag_id WHERE tag.name=?4 AND (et.project_id=p.id OR et.resource_id=r.id OR et.task_id=t.id))) ORDER BY s.updated_at DESC,s.entity_id LIMIT ?5 OFFSET ?6")?;
    let mut items = statement
        .query_map(
            params![
                keyword,
                input.kind,
                input.project_id,
                input.tag,
                input.limit + 1,
                input.offset
            ],
            |r| {
                Ok(SearchHit {
                    module_id: None,
                    work_id: None,
                    disabled: false,
                    kind: r.get(0)?,
                    id: r.get(1)?,
                    title: r.get(2)?,
                    snippet: r.get(3)?,
                    revision: r.get(4)?,
                    updated_at: r.get(5)?,
                    source: r.get(6)?,
                })
            },
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let has_more = items.len() > input.limit as usize;
    items.truncate(input.limit as usize);
    for item in &mut items {
        let chars = item.snippet.chars().collect::<Vec<_>>();
        let start = item
            .snippet
            .find(&keyword)
            .map(|b| item.snippet[..b].chars().count().saturating_sub(24))
            .unwrap_or(0);
        item.snippet = chars.iter().skip(start).take(160).collect();
    }
    Ok(SearchPage {
        items,
        has_more,
        indexed_at: now(),
    })
}
pub fn trash(conn: &Connection, q: TrashQuery) -> AppResult<Vec<TrashItem>> {
    let mut s=conn.prepare("SELECT * FROM (SELECT 'project' AS kind,id,name,deleted_at,revision FROM platform_projects WHERE deleted_at IS NOT NULL UNION ALL SELECT kind,id,name,deleted_at,revision FROM platform_resources WHERE deleted_at IS NOT NULL UNION ALL SELECT 'task',id,title,deleted_at,revision FROM platform_tasks WHERE deleted_at IS NOT NULL) WHERE (?1 IS NULL OR kind=?1) ORDER BY deleted_at DESC,id LIMIT ?2 OFFSET ?3")?;
    Ok(s.query_map(params![q.kind, q.limit, q.offset], |r| {
        Ok(TrashItem {
            kind: r.get(0)?,
            id: r.get(1)?,
            name: r.get(2)?,
            deleted_at: r.get(3)?,
            revision: r.get(4)?,
        })
    })?
    .collect::<rusqlite::Result<Vec<_>>>()?)
}
fn trash_item(conn: &Connection, m: &TrashMutation) -> AppResult<TrashItem> {
    let table = match m.kind.as_str() {
        "project" => "platform_projects",
        "task" => "platform_tasks",
        "file" | "link" | "note" => "platform_resources",
        _ => return Err(AppError::validation("回收站类型无效。")),
    };
    let title = if m.kind == "task" { "title" } else { "name" };
    let sql = format!(
        "SELECT {title},deleted_at,revision FROM {table} WHERE id=?1 AND deleted_at IS NOT NULL"
    );
    let found = conn
        .query_row(&sql, [&m.id], |r| {
            Ok(TrashItem {
                kind: m.kind.clone(),
                id: m.id.clone(),
                name: r.get(0)?,
                deleted_at: r.get(1)?,
                revision: r.get(2)?,
            })
        })
        .optional()?
        .ok_or_else(|| AppError::new(ErrorCode::NotFound, "回收站内容不存在。", false))?;
    if found.revision != m.base_revision {
        return Err(AppError::conflict(found.revision));
    }
    if table == "platform_resources" {
        let kind: String = conn.query_row(
            "SELECT kind FROM platform_resources WHERE id=?1",
            [&m.id],
            |r| r.get(0),
        )?;
        if kind != m.kind {
            return Err(AppError::validation("资料类型不一致。"));
        }
    }
    Ok(found)
}
pub fn impact(conn: &Connection, m: &TrashMutation) -> AppResult<DeleteImpact> {
    let item = trash_item(conn, m)?;
    let count = |sql: &str| -> AppResult<u32> { Ok(conn.query_row(sql, [&m.id], |r| r.get(0))?) };
    Ok(DeleteImpact {
        module_links: count(
            "SELECT count(*) FROM platform_module_links WHERE project_id=?1 OR resource_id=?1",
        )?,
        item,
        resource_links: count(if m.kind == "project" {
            "SELECT count(*) FROM platform_project_resources WHERE project_id=?1"
        } else {
            "SELECT count(*) FROM platform_project_resources WHERE resource_id=?1"
        })?,
        tasks: count("SELECT count(*) FROM platform_tasks WHERE project_id=?1")?,
        versions: count(
            "SELECT (SELECT count(*) FROM platform_note_versions WHERE resource_id=?1)+(SELECT count(*) FROM platform_file_versions WHERE resource_id=?1)",
        )?,
        sessions: count("SELECT count(*) FROM platform_document_sessions WHERE resource_id=?1")?,
        shared_blobs: count(
            "SELECT count(*) FROM platform_resources WHERE id<>?1 AND blob_id=(SELECT blob_id FROM platform_resources WHERE id=?1)",
        )?,
    })
}
pub fn purge(conn: &mut Connection, m: TrashMutation) -> AppResult<Vec<String>> {
    let tx = conn.transaction()?;
    trash_item(&tx, &m)?;
    let linked: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM platform_module_links WHERE resource_id=?1)",
        [&m.id],
        |r| r.get(0),
    )?;
    if linked {
        return Err(AppError::validation(
            "资料仍被业务模块引用，请先解除引用再永久删除。",
        ));
    }
    if m.kind == "project" {
        tx.execute(
            "DELETE FROM platform_project_resources WHERE project_id=?1",
            [&m.id],
        )?;
        tx.execute(
            "DELETE FROM platform_entity_tags WHERE project_id=?1",
            [&m.id],
        )?;
        tx.execute("UPDATE platform_tasks SET project_id=NULL,revision=revision+1,updated_at=?2 WHERE project_id=?1",params![m.id,now()])?;
        if tx.execute(
            "DELETE FROM platform_projects WHERE id=?1 AND revision=?2 AND deleted_at IS NOT NULL",
            params![m.id, m.base_revision],
        )? != 1
        {
            return Err(AppError::conflict(m.base_revision));
        }
    } else if m.kind == "task" {
        tx.execute("DELETE FROM platform_entity_tags WHERE task_id=?1", [&m.id])?;
        if tx.execute(
            "DELETE FROM platform_tasks WHERE id=?1 AND revision=?2 AND deleted_at IS NOT NULL",
            params![m.id, m.base_revision],
        )? != 1
        {
            return Err(AppError::conflict(m.base_revision));
        }
    } else {
        if tx
            .prepare("SELECT 1 FROM platform_document_sessions WHERE resource_id=?1")?
            .exists([&m.id])?
        {
            return Err(AppError::validation(
                "请先结束该资料的编辑会话，再永久删除。",
            ));
        }
        tx.execute(
            "DELETE FROM platform_project_resources WHERE resource_id=?1",
            [&m.id],
        )?;
        tx.execute(
            "DELETE FROM platform_entity_tags WHERE resource_id=?1",
            [&m.id],
        )?;
        tx.execute(
            "DELETE FROM platform_note_versions WHERE resource_id=?1",
            [&m.id],
        )?;
        tx.execute(
            "DELETE FROM platform_file_versions WHERE resource_id=?1",
            [&m.id],
        )?;
        tx.execute("DELETE FROM platform_notes WHERE resource_id=?1", [&m.id])?;
        if tx.execute(
            "DELETE FROM platform_resources WHERE id=?1 AND revision=?2 AND deleted_at IS NOT NULL",
            params![m.id, m.base_revision],
        )? != 1
        {
            return Err(AppError::conflict(m.base_revision));
        }
    }
    // References include covers, history and recoverable sessions, including soft-deleted owners.
    let unused = {
        let mut s=tx.prepare("SELECT internal_path FROM platform_blobs b WHERE NOT EXISTS(SELECT 1 FROM platform_resources WHERE blob_id=b.id) AND NOT EXISTS(SELECT 1 FROM platform_projects WHERE cover_blob_id=b.id) AND NOT EXISTS(SELECT 1 FROM platform_file_versions WHERE blob_id=b.id) AND NOT EXISTS(SELECT 1 FROM platform_document_sessions WHERE source_blob_id=b.id)")?;
        s.query_map([], |r| r.get(0))?
            .collect::<rusqlite::Result<Vec<String>>>()?
    };
    tx.execute("DELETE FROM platform_blobs WHERE NOT EXISTS(SELECT 1 FROM platform_resources WHERE blob_id=platform_blobs.id) AND NOT EXISTS(SELECT 1 FROM platform_projects WHERE cover_blob_id=platform_blobs.id) AND NOT EXISTS(SELECT 1 FROM platform_file_versions WHERE blob_id=platform_blobs.id) AND NOT EXISTS(SELECT 1 FROM platform_document_sessions WHERE source_blob_id=platform_blobs.id)",[])?;
    tx.execute(
        "DELETE FROM platform_recent_visits WHERE entity_id=?1",
        [&m.id],
    )?;
    tx.commit()?;
    Ok(unused)
}
