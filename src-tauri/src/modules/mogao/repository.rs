use super::contracts::*;
use crate::platform::module_links::{self, Target};
use crate::{
    contracts::{AppError, AppResult, ErrorCode, Note, SaveReceipt},
    platform::domain,
};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
fn missing() -> AppError {
    AppError::new(
        ErrorCode::NotFound,
        "作品或条目不存在，或已移到回收区。",
        false,
    )
}
fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}
fn uid() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn decode<T: serde::de::DeserializeOwned>(s: String) -> AppResult<T> {
    serde_json::from_str(&s)
        .map_err(|_| AppError::new(ErrorCode::DbError, "墨稿内容格式损坏，请保留备份。", false))
}
fn check(actual: i64, base: i64) -> AppResult<()> {
    domain::revision(base)?;
    if actual != base {
        return Err(AppError::conflict(actual));
    }
    Ok(())
}
pub fn work(c: &Connection, id: &str, deleted: bool) -> AppResult<Work> {
    domain::id(id)?;
    let mut result=c.query_row("SELECT id,name,synopsis,goal,genre,favorite,archived,revision,settings_revision,tree_revision,created_at,updated_at,deleted_at FROM mogao_works WHERE id=?1 AND (?2 OR deleted_at IS NULL)",params![id,deleted],|r|Ok(Work{id:r.get(0)?,fields:WorkFields{name:r.get(1)?,synopsis:r.get(2)?,goal:r.get(3)?,genre:r.get(4)?,favorite:r.get(5)?,archived:r.get(6)?,project_id:None,cover_resource_id:None},revision:r.get(7)?,settings_revision:r.get(8)?,tree_revision:r.get(9)?,created_at:r.get(10)?,updated_at:r.get(11)?,deleted_at:r.get(12)?})).optional()?.ok_or_else(missing)?;
    result.fields.project_id = module_links::targets(c, "mogao", "work", id, "project")?
        .into_iter()
        .next();
    result.fields.cover_resource_id = module_links::targets(c, "mogao", "work", id, "cover")?
        .into_iter()
        .next();
    Ok(result)
}
pub fn works(c: &Connection, q: WorkQuery) -> AppResult<Vec<Work>> {
    domain::keyword(&q.keyword)?;
    domain::pagination(q.offset, q.limit)?;
    let mut s=c.prepare("SELECT id FROM mogao_works WHERE (deleted_at IS NOT NULL)=?1 AND instr(lower(name||' '||synopsis),lower(?2))>0 ORDER BY favorite DESC,updated_at DESC,id LIMIT ?3 OFFSET ?4")?;
    let ids = s
        .query_map(
            params![q.deleted, q.keyword.trim(), q.limit, q.offset],
            |r| r.get::<_, String>(0),
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    ids.iter().map(|id| work(c, id, true)).collect()
}
pub fn save_work(c: &mut Connection, mut q: SaveWork) -> AppResult<Work> {
    q.fields.name = domain::title(&q.fields.name)?;
    for s in [&q.fields.synopsis, &q.fields.goal, &q.fields.genre] {
        domain::description(s)?;
    }
    let tx = c.transaction()?;
    let time = now();
    let id = if let Some(id) = q.id {
        domain::id(&id)?;
        let old = work(&tx, &id, false)?;
        check(
            old.revision,
            q.base_revision
                .ok_or_else(|| AppError::validation("缺少作品版本。"))?,
        )?;
        tx.execute("UPDATE mogao_works SET name=?2,synopsis=?3,goal=?4,genre=?5,favorite=?6,archived=?7,revision=revision+1,updated_at=?8 WHERE id=?1",params![id,q.fields.name,q.fields.synopsis,q.fields.goal,q.fields.genre,q.fields.favorite,q.fields.archived,time])?;
        id
    } else {
        if q.base_revision.is_some() {
            return Err(AppError::validation("新作品不能指定旧版本。"));
        }
        let id = uid();
        tx.execute("INSERT INTO mogao_works(id,name,synopsis,goal,genre,favorite,archived,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8)",params![id,q.fields.name,q.fields.synopsis,q.fields.goal,q.fields.genre,q.fields.favorite,q.fields.archived,time])?;
        id
    };
    module_links::replace(
        &tx,
        "mogao",
        "work",
        &id,
        "project",
        q.fields
            .project_id
            .into_iter()
            .map(Target::Project)
            .collect(),
    )?;
    module_links::replace(
        &tx,
        "mogao",
        "work",
        &id,
        "cover",
        q.fields
            .cover_resource_id
            .into_iter()
            .map(Target::Image)
            .collect(),
    )?;
    let result = work(&tx, &id, false)?;
    tx.commit()?;
    Ok(result)
}
pub fn delete_work(c: &mut Connection, q: Mutation) -> AppResult<Work> {
    if q.id != q.work_id {
        return Err(AppError::validation("作品归属无效。"));
    }
    let tx = c.transaction()?;
    let old = work(&tx, &q.id, true)?;
    check(old.revision, q.base_revision)?;
    tx.execute(
        "UPDATE mogao_works SET deleted_at=?2,revision=revision+1,updated_at=?3 WHERE id=?1",
        params![q.id, if q.deleted { Some(now()) } else { None }, now()],
    )?;
    let result = work(&tx, &q.id, true)?;
    tx.commit()?;
    Ok(result)
}
fn volume(c: &Connection, work_id: &str, id: &str) -> AppResult<Volume> {
    domain::id(id)?;
    c.query_row("SELECT id,title,position,revision,deleted_at FROM mogao_volumes WHERE id=?1 AND work_id=?2 AND deleted_at IS NULL",params![id,work_id],|r|Ok(Volume{id:r.get(0)?,title:r.get(1)?,position:r.get(2)?,revision:r.get(3)?,deleted_at:r.get(4)?})).optional()?.ok_or_else(missing)
}
fn volume_check(c: &Connection, work_id: &str, id: &Option<String>) -> AppResult<()> {
    if let Some(id) = id {
        volume(c, work_id, id)?;
    }
    Ok(())
}
pub fn tree(c: &Connection, q: Scope) -> AppResult<Tree> {
    let w = work(c, &q.work_id, false)?;
    let mut s=c.prepare("SELECT id,title,position,revision,deleted_at FROM mogao_volumes WHERE work_id=?1 ORDER BY position,id")?;
    let volumes = s
        .query_map([&q.work_id], |r| {
            Ok(Volume {
                id: r.get(0)?,
                title: r.get(1)?,
                position: r.get(2)?,
                revision: r.get(3)?,
                deleted_at: r.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut s=c.prepare("SELECT c.id,c.work_id,c.volume_id,c.title,c.position,c.status,c.revision,c.word_count,c.deleted_at FROM mogao_chapters c LEFT JOIN mogao_volumes v ON v.id=c.volume_id WHERE c.work_id=?1 ORDER BY CASE WHEN c.volume_id IS NULL THEN -1 ELSE v.position END,c.position,c.id")?;
    let chapters = s
        .query_map([&q.work_id], |r| {
            Ok(ChapterSummary {
                id: r.get(0)?,
                work_id: r.get(1)?,
                volume_id: r.get(2)?,
                title: r.get(3)?,
                position: r.get(4)?,
                status: r.get(5)?,
                revision: r.get(6)?,
                word_count: r.get::<_, i64>(7)? as u64,
                deleted_at: r.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(Tree {
        work: w,
        volumes,
        chapters,
    })
}
fn bump_tree(c: &Connection, id: &str) -> AppResult<()> {
    c.execute(
        "UPDATE mogao_works SET tree_revision=tree_revision+1,updated_at=?2 WHERE id=?1",
        params![id, now()],
    )?;
    Ok(())
}
fn body(text: &str) -> Value {
    let mut paragraphs = text
        .lines()
        .map(|line| {
            if line.is_empty() {
                json!({"type":"paragraph"})
            } else {
                json!({"type":"paragraph","content":[{"type":"text","text":line}]})
            }
        })
        .collect::<Vec<_>>();
    if paragraphs.is_empty() {
        paragraphs.push(json!({"type":"paragraph"}));
    }
    json!({"type":"doc","content":paragraphs})
}
fn insert_chapter(
    c: &Connection,
    work_id: &str,
    volume_id: &Option<String>,
    title: &str,
    text: &str,
    position: i64,
) -> AppResult<String> {
    let id = uid();
    let doc = body(text);
    let plain = domain::document(&doc, 1)?;
    let count = plain.chars().filter(|c| !c.is_whitespace()).count();
    c.execute("INSERT INTO mogao_chapters(id,work_id,volume_id,title,position,body_json,plain_text,word_count,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",params![id,work_id,volume_id,title,position,doc.to_string(),plain,count as i64,now()])?;
    Ok(id)
}
pub fn create_node(c: &mut Connection, q: CreateNode) -> AppResult<Tree> {
    let title = domain::title(&q.title)?;
    let tx = c.transaction()?;
    let w = work(&tx, &q.work_id, false)?;
    check(w.tree_revision, q.tree_revision)?;
    match q.kind.as_str() {
        "volume" => {
            let pos: i64 = tx.query_row(
                "SELECT coalesce(max(position),-1)+1 FROM mogao_volumes WHERE work_id=?1",
                [&q.work_id],
                |r| r.get(0),
            )?;
            tx.execute(
                "INSERT INTO mogao_volumes(id,work_id,title,position) VALUES(?1,?2,?3,?4)",
                params![uid(), q.work_id, title, pos],
            )?;
        }
        "chapter" => {
            volume_check(&tx, &q.work_id, &q.volume_id)?;
            let pos:i64=tx.query_row("SELECT coalesce(max(position),-1)+1 FROM mogao_chapters WHERE work_id=?1 AND volume_id IS ?2",params![q.work_id,q.volume_id],|r|r.get(0))?;
            insert_chapter(&tx, &q.work_id, &q.volume_id, &title, "", pos)?;
        }
        _ => return Err(AppError::validation("未知的目录类型。")),
    }
    bump_tree(&tx, &q.work_id)?;
    let result = tree(
        &tx,
        Scope {
            request_id: q.request_id,
            work_id: q.work_id,
        },
    )?;
    tx.commit()?;
    Ok(result)
}
pub fn chapter(c: &Connection, q: &Entity, deleted: bool) -> AppResult<Chapter> {
    work(c, &q.work_id, false)?;
    domain::id(&q.id)?;
    let data=c.query_row("SELECT title,body_json,plain_text,schema_version,revision,created_at,updated_at,volume_id,status,position,word_count FROM mogao_chapters WHERE id=?1 AND work_id=?2 AND (?3 OR deleted_at IS NULL)",params![q.id,q.work_id,deleted],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,u32>(3)?,r.get::<_,i64>(4)?,r.get::<_,String>(5)?,r.get::<_,String>(6)?,r.get::<_,Option<String>>(7)?,r.get::<_,String>(8)?,r.get::<_,i64>(9)?,r.get::<_,i64>(10)? as u64))).optional()?.ok_or_else(missing)?;
    let body = decode(data.1)?;
    domain::document(&body, data.3)?;
    Ok(Chapter {
        note: Note {
            id: q.id.clone(),
            title: data.0,
            body,
            plain_text: data.2,
            schema_version: data.3,
            revision: data.4,
            created_at: data.5,
            updated_at: data.6,
        },
        work_id: q.work_id.clone(),
        volume_id: data.7,
        status: data.8,
        position: data.9,
        word_count: data.10,
    })
}
fn snapshot(c: &Connection, n: &Note) -> AppResult<()> {
    c.execute("INSERT OR IGNORE INTO mogao_versions(id,chapter_id,source_revision,title,body_json,plain_text,schema_version,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![uid(),n.id,n.revision,n.title,n.body.to_string(),n.plain_text,n.schema_version,now()])?;
    Ok(())
}
pub fn save_chapter(c: &mut Connection, q: SaveChapter) -> AppResult<SaveReceipt> {
    let mut s = q.save;
    s.title = domain::title(&s.title)?;
    domain::revision(s.base_revision)?;
    if s.client_edit_sequence > domain::MAX_SAFE_INTEGER {
        return Err(AppError::validation("编辑序号无效。"));
    }
    let plain = domain::document(&s.body, s.schema_version)?;
    let count = plain.chars().filter(|c| !c.is_whitespace()).count() as i64;
    let tx = c.transaction()?;
    let old = chapter(
        &tx,
        &Entity {
            request_id: q.request_id,
            work_id: q.work_id.clone(),
            id: s.id.clone(),
        },
        false,
    )?;
    check(old.note.revision, s.base_revision)?;
    if s.create_version {
        snapshot(&tx, &old.note)?;
    }
    let time = now();
    tx.execute("UPDATE mogao_chapters SET title=?2,body_json=?3,plain_text=?4,schema_version=?5,word_count=?6,revision=revision+1,updated_at=?7 WHERE id=?1",params![s.id,s.title,s.body.to_string(),plain,s.schema_version,count,time])?;
    if s.create_version {
        let n = chapter(
            &tx,
            &Entity {
                request_id: String::new(),
                work_id: q.work_id.clone(),
                id: s.id.clone(),
            },
            false,
        )?;
        snapshot(&tx, &n.note)?;
    }
    tx.execute(
        "UPDATE mogao_works SET updated_at=?2 WHERE id=?1",
        params![q.work_id, time],
    )?;
    tx.commit()?;
    Ok(SaveReceipt {
        entity_id: s.id,
        saved_revision: s.base_revision + 1,
        client_edit_sequence: s.client_edit_sequence,
        saved_at: time,
    })
}
pub fn move_node(c: &mut Connection, q: MoveNode) -> AppResult<Tree> {
    domain::id(&q.id)?;
    let title = domain::title(&q.title)?;
    let tx = c.transaction()?;
    let w = work(&tx, &q.work_id, false)?;
    check(w.tree_revision, q.tree_revision)?;
    let ids: Vec<String> = match q.kind.as_str() {
        "volume" => {
            let old = volume(&tx, &q.work_id, &q.id)?;
            check(old.revision, q.base_revision)?;
            tx.execute(
                "UPDATE mogao_volumes SET title=?2,revision=revision+1 WHERE id=?1",
                params![q.id, title],
            )?;
            let mut s=tx.prepare("SELECT id FROM mogao_volumes WHERE work_id=?1 AND deleted_at IS NULL AND id<>?2 ORDER BY position,id")?;
            s.query_map(params![q.work_id, q.id], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?
        }
        "chapter" => {
            let old = chapter(
                &tx,
                &Entity {
                    request_id: q.request_id.clone(),
                    work_id: q.work_id.clone(),
                    id: q.id.clone(),
                },
                false,
            )?;
            check(old.note.revision, q.base_revision)?;
            volume_check(&tx, &q.work_id, &q.volume_id)?;
            if !["draft", "revising", "final"].contains(&q.status.as_str()) {
                return Err(AppError::validation("章节状态无效。"));
            }
            tx.execute("UPDATE mogao_chapters SET title=?2,volume_id=?3,status=?4,revision=revision+1,updated_at=?5 WHERE id=?1",params![q.id,title,q.volume_id,q.status,now()])?;
            let mut s=tx.prepare("SELECT id FROM mogao_chapters WHERE work_id=?1 AND volume_id IS ?2 AND deleted_at IS NULL AND id<>?3 ORDER BY position,id")?;
            s.query_map(params![q.work_id, q.volume_id, q.id], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?
        }
        _ => return Err(AppError::validation("未知的目录类型。")),
    };
    let mut ids = ids;
    let pos = (q.position as usize).min(ids.len());
    ids.insert(pos, q.id);
    for (i, id) in ids.iter().enumerate() {
        let sql = if q.kind == "volume" {
            "UPDATE mogao_volumes SET position=?2 WHERE id=?1"
        } else {
            "UPDATE mogao_chapters SET position=?2 WHERE id=?1"
        };
        tx.execute(sql, params![id, i as i64])?;
    }
    bump_tree(&tx, &q.work_id)?;
    let result = tree(
        &tx,
        Scope {
            request_id: q.request_id,
            work_id: q.work_id,
        },
    )?;
    tx.commit()?;
    Ok(result)
}
pub fn delete_chapter(c: &mut Connection, q: Mutation) -> AppResult<Tree> {
    let tx = c.transaction()?;
    let n = chapter(
        &tx,
        &Entity {
            request_id: q.request_id.clone(),
            work_id: q.work_id.clone(),
            id: q.id.clone(),
        },
        true,
    )?;
    check(n.note.revision, q.base_revision)?;
    snapshot(&tx, &n.note)?;
    tx.execute(
        "UPDATE mogao_chapters SET deleted_at=?2,revision=revision+1,updated_at=?3 WHERE id=?1",
        params![q.id, if q.deleted { Some(now()) } else { None }, now()],
    )?;
    bump_tree(&tx, &q.work_id)?;
    let result = tree(
        &tx,
        Scope {
            request_id: q.request_id,
            work_id: q.work_id,
        },
    )?;
    tx.commit()?;
    Ok(result)
}
pub fn versions(c: &Connection, q: Entity) -> AppResult<Vec<Version>> {
    versions_limit(c, q, 100)
}
fn versions_limit(c: &Connection, q: Entity, limit: i64) -> AppResult<Vec<Version>> {
    chapter(c, &q, true)?;
    let mut s=c.prepare("SELECT id,chapter_id,source_revision,title,body_json,plain_text,schema_version,created_at FROM mogao_versions WHERE chapter_id=?1 ORDER BY source_revision DESC LIMIT ?2")?;
    let rows = s
        .query_map(params![q.id, limit], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, u32>(6)?,
                r.get::<_, String>(7)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter()
        .map(|r| {
            Ok(Version {
                id: r.0,
                chapter_id: r.1,
                source_revision: r.2,
                title: r.3,
                body: decode(r.4)?,
                plain_text: r.5,
                schema_version: r.6,
                created_at: r.7,
            })
        })
        .collect()
}
pub fn restore(c: &mut Connection, q: RestoreChapter) -> AppResult<Chapter> {
    domain::id(&q.version_id)?;
    let found = versions(
        c,
        Entity {
            request_id: q.request_id.clone(),
            work_id: q.work_id.clone(),
            id: q.id.clone(),
        },
    )?
    .into_iter()
    .find(|v| v.id == q.version_id)
    .ok_or_else(missing)?;
    save_chapter(
        c,
        SaveChapter {
            request_id: q.request_id.clone(),
            work_id: q.work_id.clone(),
            save: crate::contracts::SaveNote {
                request_id: q.request_id.clone(),
                id: q.id.clone(),
                base_revision: q.base_revision,
                title: found.title,
                body: found.body,
                schema_version: found.schema_version,
                client_edit_sequence: 0,
                create_version: true,
            },
        },
    )?;
    chapter(
        c,
        &Entity {
            request_id: q.request_id,
            work_id: q.work_id,
            id: q.id,
        },
        false,
    )
}
pub fn draft(c: &Connection, q: &Entity) -> AppResult<Option<Draft>> {
    chapter(c, q, true)?;
    let data=c.query_row("SELECT session_id,base_revision,edit_sequence,title,body_json,schema_version,updated_at FROM mogao_drafts WHERE chapter_id=?1",[&q.id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?,r.get::<_,i64>(2)? as u64,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,u32>(5)?,r.get::<_,String>(6)?))).optional()?;
    data.map(|d| {
        Ok(Draft {
            draft: crate::contracts::NoteDraft {
                session_id: d.0,
                note_id: q.id.clone(),
                base_revision: d.1,
                client_edit_sequence: d.2,
                title: d.3,
                body: decode(d.4)?,
                schema_version: d.5,
            },
            updated_at: d.6,
        })
    })
    .transpose()
}
pub fn write_draft(c: &mut Connection, q: WriteChapterDraft) -> AppResult<()> {
    let d = q.draft;
    domain::id(&d.session_id)?;
    domain::revision(d.base_revision)?;
    domain::document(&d.body, d.schema_version)?;
    if d.title.chars().count() > 200
        || d.title.contains('\0')
        || d.client_edit_sequence > domain::MAX_SAFE_INTEGER
    {
        return Err(AppError::validation("恢复稿字段无效。"));
    }
    let tx = c.transaction()?;
    let e = Entity {
        request_id: q.request_id,
        work_id: q.work_id,
        id: d.note_id.clone(),
    };
    chapter(&tx, &e, true)?;
    if let Some(old) = draft(&tx, &e)? {
        if old.draft.session_id != d.session_id {
            return Err(AppError::new(
                ErrorCode::Conflict,
                "此章节存在恢复稿，请先处理恢复稿。",
                false,
            ));
        }
        if old.draft.client_edit_sequence > d.client_edit_sequence {
            return Ok(());
        }
    }
    tx.execute("INSERT INTO mogao_drafts(chapter_id,session_id,base_revision,edit_sequence,title,body_json,schema_version,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(chapter_id) DO UPDATE SET base_revision=excluded.base_revision,edit_sequence=excluded.edit_sequence,title=excluded.title,body_json=excluded.body_json,schema_version=excluded.schema_version,updated_at=excluded.updated_at",params![d.note_id,d.session_id,d.base_revision,d.client_edit_sequence as i64,d.title,d.body.to_string(),d.schema_version,now()])?;
    tx.commit()?;
    Ok(())
}
pub fn clear_draft(c: &mut Connection, q: ClearChapterDraft) -> AppResult<()> {
    domain::id(&q.session_id)?;
    if q.through_sequence > domain::MAX_SAFE_INTEGER {
        return Err(AppError::validation("编辑序号无效。"));
    }
    let tx = c.transaction()?;
    chapter(
        &tx,
        &Entity {
            request_id: q.request_id,
            work_id: q.work_id,
            id: q.id.clone(),
        },
        true,
    )?;
    tx.execute(
        "DELETE FROM mogao_drafts WHERE chapter_id=?1 AND session_id=?2 AND edit_sequence<=?3",
        params![q.id, q.session_id, q.through_sequence as i64],
    )?;
    tx.commit()?;
    Ok(())
}
pub fn settings(c: &Connection, q: &Scope) -> AppResult<Vec<Setting>> {
    work(c, &q.work_id, false)?;
    let mut s=c.prepare("SELECT id,kind,title,fields_json,parent_id,chapter_id,position,revision,updated_at,deleted_at FROM mogao_settings WHERE work_id=?1 ORDER BY kind,position,id")?;
    let rows = s
        .query_map([&q.work_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, i64>(7)?,
                r.get::<_, String>(8)?,
                r.get::<_, Option<String>>(9)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter()
        .map(|r| {
            Ok(Setting {
                id: r.0,
                work_id: q.work_id.clone(),
                kind: r.1,
                title: r.2,
                fields: decode(r.3)?,
                parent_id: r.4,
                chapter_id: r.5,
                position: r.6,
                revision: r.7,
                updated_at: r.8,
                deleted_at: r.9,
            })
        })
        .collect()
}
pub fn save_setting(c: &mut Connection, q: SaveSetting) -> AppResult<Setting> {
    let title = domain::title(&q.title)?;
    if !["character", "world", "outline"].contains(&q.kind.as_str()) {
        return Err(AppError::validation("设定类型无效。"));
    }
    for value in [
        &q.fields.aliases,
        &q.fields.description,
        &q.fields.goal,
        &q.fields.relationships,
        &q.fields.fixed,
        &q.fields.category,
        &q.fields.body,
    ] {
        domain::description(value)?;
    }
    if q.fields.related_characters.len() > 100 {
        return Err(AppError::validation("人物关联过多。"));
    }
    let tx = c.transaction()?;
    let entries = settings(
        &tx,
        &Scope {
            request_id: q.request_id.clone(),
            work_id: q.work_id.clone(),
        },
    )?;
    let id = q.id.clone().unwrap_or_else(uid);
    if q.kind != "outline" && (q.parent_id.is_some() || q.chapter_id.is_some()) {
        return Err(AppError::validation("只有大纲可以关联父节点和章节。"));
    }
    if let Some(parent) = &q.parent_id {
        domain::id(parent)?;
        let mut cursor = Some(parent.clone());
        let mut seen = std::collections::HashSet::new();
        seen.insert(id.clone());
        while let Some(p) = cursor {
            if !seen.insert(p.clone()) {
                return Err(AppError::validation("大纲不能形成循环。"));
            }
            let entry = entries
                .iter()
                .find(|s| s.id == p && s.kind == "outline" && s.deleted_at.is_none())
                .ok_or_else(missing)?;
            cursor = entry.parent_id.clone();
        }
    }
    if let Some(ch) = &q.chapter_id {
        chapter(
            &tx,
            &Entity {
                request_id: q.request_id.clone(),
                work_id: q.work_id.clone(),
                id: ch.clone(),
            },
            false,
        )?;
    }
    for related in &q.fields.related_characters {
        domain::id(related)?;
        if related == &id
            || !entries
                .iter()
                .any(|s| &s.id == related && s.kind == "character" && s.deleted_at.is_none())
        {
            return Err(AppError::validation("关联人物必须是本作品的其他人物。"));
        }
    }
    module_links::replace(
        &tx,
        "mogao",
        "setting",
        &id,
        "reference",
        q.fields
            .resource_ids
            .iter()
            .cloned()
            .map(Target::Resource)
            .collect(),
    )?;
    let fields =
        serde_json::to_string(&q.fields).map_err(|_| AppError::validation("设定格式无效。"))?;
    if q.id.is_some() {
        domain::id(&id)?;
        let old = entries
            .iter()
            .find(|s| s.id == id && s.deleted_at.is_none())
            .ok_or_else(missing)?;
        if old.kind != q.kind {
            return Err(AppError::validation("不能变更设定类型。"));
        }
        check(
            old.revision,
            q.base_revision
                .ok_or_else(|| AppError::validation("缺少设定版本。"))?,
        )?;
        tx.execute("UPDATE mogao_settings SET title=?2,fields_json=?3,parent_id=?4,chapter_id=?5,position=?6,revision=revision+1,updated_at=?7 WHERE id=?1",params![id,title,fields,q.parent_id,q.chapter_id,q.position,now()])?;
    } else {
        if q.base_revision.is_some() {
            return Err(AppError::validation("新设定不能指定旧版本。"));
        }
        tx.execute("INSERT INTO mogao_settings(id,work_id,kind,title,fields_json,parent_id,chapter_id,position,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![id,q.work_id,q.kind,title,fields,q.parent_id,q.chapter_id,q.position,now()])?;
    }
    tx.execute(
        "UPDATE mogao_works SET settings_revision=settings_revision+1,updated_at=?2 WHERE id=?1",
        params![q.work_id, now()],
    )?;
    let next = settings(
        &tx,
        &Scope {
            request_id: q.request_id,
            work_id: q.work_id,
        },
    )?
    .into_iter()
    .find(|s| s.id == id)
    .ok_or_else(missing)?;
    tx.commit()?;
    Ok(next)
}
pub fn delete_setting(c: &mut Connection, q: Mutation) -> AppResult<()> {
    let tx = c.transaction()?;
    let entries = settings(
        &tx,
        &Scope {
            request_id: q.request_id,
            work_id: q.work_id.clone(),
        },
    )?;
    let old = entries.iter().find(|s| s.id == q.id).ok_or_else(missing)?;
    check(old.revision, q.base_revision)?;
    if q.deleted
        && entries
            .iter()
            .any(|s| s.parent_id.as_deref() == Some(&q.id) && s.deleted_at.is_none())
    {
        return Err(AppError::validation("请先移动或删除此大纲的子节点。"));
    }
    if !q.deleted
        && old
            .parent_id
            .as_ref()
            .is_some_and(|p| !entries.iter().any(|s| &s.id == p && s.deleted_at.is_none()))
    {
        return Err(AppError::validation("请先恢复父大纲。"));
    }
    tx.execute(
        "UPDATE mogao_settings SET deleted_at=?2,revision=revision+1,updated_at=?3 WHERE id=?1",
        params![q.id, if q.deleted { Some(now()) } else { None }, now()],
    )?;
    tx.execute(
        "UPDATE mogao_works SET settings_revision=settings_revision+1,updated_at=?2 WHERE id=?1",
        params![q.work_id, now()],
    )?;
    tx.commit()?;
    Ok(())
}
pub fn import(c: &mut Connection, q: ImportWork) -> AppResult<Work> {
    let name = domain::title(&q.name)?;
    if q.chapters.is_empty()
        || q.chapters.len() > 10000
        || q.chapters
            .iter()
            .map(|s| s.text.len() + s.title.len())
            .sum::<usize>()
            > 20 * 1024 * 1024
    {
        return Err(AppError::validation(
            "导入须包含 1 至 10000 章，正文总计不超过 20 MB。",
        ));
    }
    let tx = c.transaction()?;
    let id = uid();
    let time = now();
    tx.execute(
        "INSERT INTO mogao_works(id,name,created_at,updated_at) VALUES(?1,?2,?3,?3)",
        params![id, name, time],
    )?;
    for (pos, ch) in q.chapters.iter().enumerate() {
        let title = domain::title(&ch.title)?;
        insert_chapter(&tx, &id, &None, &title, &ch.text, pos as i64)?;
    }
    let w = work(&tx, &id, false)?;
    tx.commit()?;
    Ok(w)
}
pub fn export(c: &Connection, q: ExportWork) -> AppResult<Vec<u8>> {
    let t = tree(
        c,
        Scope {
            request_id: q.request_id.clone(),
            work_id: q.work_id.clone(),
        },
    )?;
    if !["txt", "markdown", "json"].contains(&q.format.as_str()) {
        return Err(AppError::validation("导出格式无效。"));
    }
    let mut selected = std::collections::HashSet::new();
    for id in &q.chapter_ids {
        domain::id(id)?;
        if !selected.insert(id.clone())
            || !t
                .chapters
                .iter()
                .any(|ch| &ch.id == id && ch.deleted_at.is_none())
        {
            return Err(AppError::validation(
                "导出章节必须属于当前作品，且不能重复。",
            ));
        }
    }
    let chapters = t
        .chapters
        .iter()
        .filter(|ch| ch.deleted_at.is_none() && (selected.is_empty() || selected.contains(&ch.id)))
        .map(|ch| {
            chapter(
                c,
                &Entity {
                    request_id: q.request_id.clone(),
                    work_id: q.work_id.clone(),
                    id: ch.id.clone(),
                },
                false,
            )
        })
        .collect::<AppResult<Vec<_>>>()?;
    if q.format == "json" {
        let mut archive = Vec::new();
        for summary in &t.chapters {
            let entity = Entity {
                request_id: q.request_id.clone(),
                work_id: q.work_id.clone(),
                id: summary.id.clone(),
            };
            archive.push(json!({"summary":summary,"content":chapter(c,&entity,true)?,"versions":versions_limit(c,entity.clone(),-1)?,"draft":draft(c,&entity)?}));
        }
        let settings = settings(
            c,
            &Scope {
                request_id: q.request_id.clone(),
                work_id: q.work_id.clone(),
            },
        )?;
        return serde_json::to_vec_pretty(&json!({"format":"moshub-mogao-backup","version":1,"work":t.work,"volumes":t.volumes,"chapters":archive,"settings":settings,"notice":"关联资料使用当前工作空间 ID；附件字节与全空间恢复请使用平台完整备份"})).map_err(|_|AppError::validation("结构化备份生成失败。"));
    }
    let markdown = q.format == "markdown";
    let mut text = if markdown {
        format!(
            "# {}\n\n",
            crate::platform::markdown_title(&t.work.fields.name)
        )
    } else {
        format!("{}\n\n", t.work.fields.name)
    };
    let mut current = None;
    for ch in chapters {
        if ch.volume_id != current {
            current = ch.volume_id.clone();
            if let Some(v) = t.volumes.iter().find(|v| Some(&v.id) == current.as_ref()) {
                text.push_str(&if markdown {
                    format!("## {}\n\n", crate::platform::markdown_title(&v.title))
                } else {
                    format!("{}\n\n", v.title)
                });
            }
        }
        text.push_str(&if markdown {
            format!(
                "### {}\n\n{}\n\n",
                crate::platform::markdown_title(&ch.note.title),
                crate::platform::render_markdown(&ch.note.body)
            )
        } else {
            format!("{}\n\n{}\n\n", ch.note.title, ch.note.plain_text)
        });
    }
    Ok(text.into_bytes())
}
pub fn preview_txt(bytes: &[u8]) -> AppResult<Vec<ImportChapter>> {
    if bytes.len() > 20 * 1024 * 1024 {
        return Err(AppError::validation("TXT 文件超过 20 MB。"));
    }
    let text = std::str::from_utf8(bytes)
        .map_err(|_| AppError::validation("仅支持 UTF-8 TXT，请转换编码后重试。"))?
        .trim_start_matches('\u{feff}');
    if text.contains('\0') || text.trim().is_empty() {
        return Err(AppError::validation("TXT 为空或包含无效字符。"));
    }
    let mut chapters = vec![];
    let mut title = "正文".to_owned();
    let mut content = String::new();
    let mut had_heading = false;
    for line in text.lines() {
        let l = line.trim();
        let heading = l.chars().count() <= 100
            && (numbered_heading(l) || ["序章", "序言", "楔子", "尾声", "后记"].contains(&l));
        if heading {
            if had_heading || !content.trim().is_empty() {
                chapters.push(ImportChapter {
                    title: title.clone(),
                    text: content.trim_end().into(),
                });
            }
            had_heading = true;
            title = l.into();
            content.clear();
        } else {
            content.push_str(line);
            content.push('\n');
        }
    }
    if had_heading || !content.trim().is_empty() {
        chapters.push(ImportChapter {
            title,
            text: content.trim_end().into(),
        });
    }
    if chapters.is_empty() {
        return Err(AppError::validation("未识别到可导入的正文。"));
    }
    if chapters.len() > 10000 {
        return Err(AppError::validation("章节数量超过 10000，请拆分后导入。"));
    }
    Ok(chapters)
}

pub fn validate(c: &Connection) -> AppResult<()> {
    for table in [
        "mogao_works",
        "mogao_volumes",
        "mogao_chapters",
        "mogao_versions",
        "mogao_drafts",
        "mogao_settings",
    ] {
        let exists: bool = c.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
            [table],
            |r| r.get(0),
        )?;
        if !exists {
            return Err(AppError::new(
                ErrorCode::BackupInvalid,
                "墨稿数据表缺失，原工作空间保留。",
                false,
            ));
        }
    }
    let cross:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM mogao_chapters ch JOIN mogao_volumes v ON v.id=ch.volume_id WHERE ch.work_id<>v.work_id)",[],|r|r.get(0))?;
    if cross {
        return Err(AppError::new(
            ErrorCode::BackupInvalid,
            "墨稿章节归属无效。",
            false,
        ));
    }
    let mut s =
        c.prepare("SELECT body_json,schema_version,plain_text,word_count FROM mogao_chapters")?;
    let mut rows = s.query([])?;
    while let Some(r) = rows.next()? {
        let body: Value = decode(r.get(0)?)?;
        let text = domain::document(&body, r.get(1)?)?;
        if text != r.get::<_, String>(2)?
            || text.chars().filter(|c| !c.is_whitespace()).count() as i64 != r.get::<_, i64>(3)?
        {
            return Err(AppError::new(
                ErrorCode::BackupInvalid,
                "墨稿正文与文字投影不一致。",
                false,
            ));
        }
    }
    for table in ["mogao_versions", "mogao_drafts"] {
        let mut statement = c.prepare(&format!("SELECT body_json,schema_version FROM {table}"))?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            let body: Value = decode(row.get(0)?)?;
            domain::document(&body, row.get(1)?)?;
        }
    }
    let mut s = c.prepare("SELECT fields_json FROM mogao_settings")?;
    let mut rows = s.query([])?;
    while let Some(r) = rows.next()? {
        let _: SettingFields = decode(r.get(0)?)?;
    }
    Ok(())
}

pub fn delete_volume(c: &mut Connection, q: Mutation) -> AppResult<Tree> {
    let tx = c.transaction()?;
    work(&tx, &q.work_id, false)?;
    domain::id(&q.id)?;
    let rev: i64 = tx
        .query_row(
            "SELECT revision FROM mogao_volumes WHERE id=?1 AND work_id=?2",
            params![q.id, q.work_id],
            |r| r.get(0),
        )
        .optional()?
        .ok_or_else(missing)?;
    check(rev, q.base_revision)?;
    let used: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM mogao_chapters WHERE volume_id=?1)",
        [&q.id],
        |r| r.get(0),
    )?;
    if q.deleted && used {
        return Err(AppError::validation(
            "请先移走卷内章节，包括回收区中的章节。",
        ));
    }
    tx.execute(
        "UPDATE mogao_volumes SET deleted_at=?2,revision=revision+1 WHERE id=?1",
        params![q.id, if q.deleted { Some(now()) } else { None }],
    )?;
    bump_tree(&tx, &q.work_id)?;
    let next = tree(
        &tx,
        Scope {
            request_id: q.request_id,
            work_id: q.work_id,
        },
    )?;
    tx.commit()?;
    Ok(next)
}
pub fn copy_draft(c: &mut Connection, q: Entity) -> AppResult<Chapter> {
    let tx = c.transaction()?;
    let saved = draft(&tx, &q)?.ok_or_else(missing)?;
    let d = saved.draft;
    let title = domain::title(if d.title.trim().is_empty() {
        "恢复稿副本"
    } else {
        &d.title
    })?;
    let text = domain::document(&d.body, d.schema_version)?;
    let pos:i64=tx.query_row("SELECT coalesce(max(position),-1)+1 FROM mogao_chapters WHERE work_id=?1 AND volume_id IS NULL",[&q.work_id],|r|r.get(0))?;
    let id = insert_chapter(&tx, &q.work_id, &None, &title, "", pos)?;
    tx.execute(
        "UPDATE mogao_chapters SET body_json=?2,plain_text=?3,word_count=?4 WHERE id=?1",
        params![
            id,
            d.body.to_string(),
            text,
            text.chars().filter(|c| !c.is_whitespace()).count() as i64
        ],
    )?;
    let next = chapter(
        &tx,
        &Entity {
            request_id: q.request_id,
            work_id: q.work_id.clone(),
            id,
        },
        false,
    )?;
    snapshot(&tx, &next.note)?;
    tx.execute(
        "DELETE FROM mogao_drafts WHERE chapter_id=?1 AND session_id=?2 AND edit_sequence=?3",
        params![q.id, d.session_id, d.client_edit_sequence as i64],
    )?;
    bump_tree(&tx, &q.work_id)?;
    tx.commit()?;
    Ok(next)
}

fn numbered_heading(line: &str) -> bool {
    let Some(rest) = line.strip_prefix('第') else {
        return false;
    };
    let Some((index, _)) = rest.char_indices().find(|(_, c)| *c == '章' || *c == '回') else {
        return false;
    };
    let number = rest[..index].trim();
    !number.is_empty()
        && number.chars().count() <= 20
        && number
            .chars()
            .all(|c| "0123456789零〇一二三四五六七八九十百千万两".contains(c))
}

pub fn search(
    c: &Connection,
    q: &crate::contracts::SearchQuery,
    enabled: bool,
) -> AppResult<Vec<crate::contracts::SearchHit>> {
    if q.tag.is_some() {
        return Ok(vec![]);
    }
    let projects = q
        .project_id
        .as_ref()
        .map(|id| {
            module_links::entities_for_project(c, "mogao", "work", id).and_then(|ids| {
                serde_json::to_string(&ids).map_err(|_| AppError::validation("项目关联无效。"))
            })
        })
        .transpose()?;
    let mut s=c.prepare("SELECT kind,id,work_id,title,text,revision,updated_at FROM (SELECT 'mogao-work' kind,id,id work_id,name title,CASE WHEN ?1 THEN synopsis ELSE '' END text,revision,updated_at FROM mogao_works WHERE deleted_at IS NULL UNION ALL SELECT 'mogao-chapter',ch.id,ch.work_id,ch.title,ch.plain_text,ch.revision,ch.updated_at FROM mogao_chapters ch JOIN mogao_works w ON w.id=ch.work_id WHERE ?1 AND ch.deleted_at IS NULL AND w.deleted_at IS NULL UNION ALL SELECT 'mogao-'||s.kind,s.id,s.work_id,s.title,coalesce(json_extract(s.fields_json,'$.aliases'),'')||' '||coalesce(json_extract(s.fields_json,'$.description'),'')||' '||coalesce(json_extract(s.fields_json,'$.goal'),'')||' '||coalesce(json_extract(s.fields_json,'$.relationships'),'')||' '||coalesce(json_extract(s.fields_json,'$.fixed'),'')||' '||coalesce(json_extract(s.fields_json,'$.category'),'')||' '||coalesce(json_extract(s.fields_json,'$.body'),''),s.revision,s.updated_at FROM mogao_settings s JOIN mogao_works w ON w.id=s.work_id WHERE ?1 AND s.deleted_at IS NULL AND w.deleted_at IS NULL) WHERE (?2 IS NULL OR kind=?2) AND (instr(lower(title),lower(?3))>0 OR instr(lower(text),lower(?3))>0) AND (?4 IS NULL OR work_id IN (SELECT value FROM json_each(?4))) ORDER BY updated_at DESC,id LIMIT ?5")?;
    Ok(s.query_map(
        params![
            enabled,
            q.kind,
            q.keyword.trim(),
            projects,
            q.offset + q.limit + 1
        ],
        |r| {
            let content: String = r.get(4)?;
            Ok(crate::contracts::SearchHit {
                kind: r.get(0)?,
                id: r.get(1)?,
                module_id: Some("mogao".into()),
                work_id: Some(r.get(2)?),
                disabled: !enabled,
                title: r.get(3)?,
                snippet: if enabled {
                    content.chars().take(160).collect()
                } else {
                    String::new()
                },
                revision: r.get(5)?,
                updated_at: r.get(6)?,
                source: if !enabled {
                    "模块已停用 · 仅作品名称"
                } else {
                    "墨稿正文或设定（大纲为计划）"
                }
                .into(),
            })
        },
    )?
    .collect::<rusqlite::Result<Vec<_>>>()?)
}
pub fn trash(
    c: &Connection,
    q: &crate::contracts::TrashQuery,
) -> AppResult<Vec<crate::contracts::TrashItem>> {
    let mut s=c.prepare("SELECT kind,id,title,deleted_at,revision FROM (SELECT 'mogao-work' kind,id,name title,deleted_at,revision FROM mogao_works WHERE deleted_at IS NOT NULL UNION ALL SELECT 'mogao-chapter',ch.id,ch.title,ch.deleted_at,ch.revision FROM mogao_chapters ch JOIN mogao_works w ON w.id=ch.work_id WHERE ch.deleted_at IS NOT NULL AND w.deleted_at IS NULL UNION ALL SELECT 'mogao-'||s.kind,s.id,s.title,s.deleted_at,s.revision FROM mogao_settings s JOIN mogao_works w ON w.id=s.work_id WHERE s.deleted_at IS NOT NULL AND w.deleted_at IS NULL) WHERE (?1 IS NULL OR kind=?1) ORDER BY deleted_at DESC,id LIMIT ?2")?;
    Ok(s.query_map(params![q.kind, q.offset + q.limit + 1], |r| {
        Ok(crate::contracts::TrashItem {
            kind: r.get(0)?,
            id: r.get(1)?,
            name: r.get(2)?,
            deleted_at: r.get(3)?,
            revision: r.get(4)?,
        })
    })?
    .collect::<rusqlite::Result<Vec<_>>>()?)
}
fn trash_target(
    c: &Connection,
    q: &crate::contracts::TrashMutation,
) -> AppResult<(crate::contracts::TrashItem, String)> {
    let table = match q.kind.as_str() {
        "mogao-work" => "mogao_works",
        "mogao-chapter" => "mogao_chapters",
        "mogao-character" | "mogao-world" | "mogao-outline" => "mogao_settings",
        _ => return Err(AppError::validation("墨稿回收类型无效。")),
    };
    let (title, wid) = if table == "mogao_works" {
        ("name", "id")
    } else {
        ("title", "work_id")
    };
    let mut sql = format!(
        "SELECT {title},deleted_at,revision,{wid} FROM {table} WHERE id=?1 AND deleted_at IS NOT NULL"
    );
    if table == "mogao_settings" {
        sql.push_str(" AND 'mogao-'||kind=?2");
    }
    let mut s = c.prepare(&sql)?;
    let read = |r: &rusqlite::Row<'_>| {
        Ok((
            crate::contracts::TrashItem {
                kind: q.kind.clone(),
                id: q.id.clone(),
                name: r.get(0)?,
                deleted_at: r.get(1)?,
                revision: r.get(2)?,
            },
            r.get::<_, String>(3)?,
        ))
    };
    let result = if table == "mogao_settings" {
        s.query_row(params![q.id, q.kind], read).optional()?
    } else {
        s.query_row([&q.id], read).optional()?
    }
    .ok_or_else(missing)?;
    check(result.0.revision, q.base_revision)?;
    Ok(result)
}
pub fn impact(
    c: &Connection,
    q: &crate::contracts::TrashMutation,
) -> AppResult<crate::contracts::DeleteImpact> {
    let (item, wid) = trash_target(c, q)?;
    let count: i64 = if q.kind == "mogao-work" {
        c.query_row("SELECT count(*) FROM mogao_versions v JOIN mogao_chapters ch ON ch.id=v.chapter_id WHERE ch.work_id=?1",[&wid],|r|r.get(0))?
    } else {
        c.query_row(
            "SELECT count(*) FROM mogao_versions WHERE chapter_id=?1",
            [&q.id],
            |r| r.get(0),
        )?
    };
    let linked = if q.kind == "mogao-work" {
        let w = work(c, &wid, true)?;
        usize::from(w.fields.project_id.is_some())
            + usize::from(w.fields.cover_resource_id.is_some())
    } else {
        module_links::targets(c, "mogao", "setting", &q.id, "reference")?.len()
    };
    Ok(crate::contracts::DeleteImpact {
        module_links: 0,
        item,
        resource_links: linked as u32,
        tasks: 0,
        versions: count as u32,
        sessions: 0,
        shared_blobs: 0,
    })
}
pub fn trash_restore(c: &mut Connection, q: crate::contracts::TrashMutation) -> AppResult<()> {
    let (_, work_id) = trash_target(c, &q)?;
    let mutation = Mutation {
        request_id: q.request_id,
        work_id,
        id: q.id,
        base_revision: q.base_revision,
        deleted: false,
    };
    match q.kind.as_str() {
        "mogao-work" => {
            delete_work(c, mutation)?;
        }
        "mogao-chapter" => {
            delete_chapter(c, mutation)?;
        }
        _ => {
            delete_setting(c, mutation)?;
        }
    }
    Ok(())
}
pub fn purge(c: &mut Connection, q: crate::contracts::TrashMutation) -> AppResult<()> {
    let tx = c.transaction()?;
    let (_, wid) = trash_target(&tx, &q)?;
    match q.kind.as_str() {
        "mogao-work" => {
            let mut s = tx.prepare("SELECT id FROM mogao_settings WHERE work_id=?1")?;
            let ids = s
                .query_map([&wid], |r| r.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            drop(s);
            for id in ids {
                module_links::remove_entity(&tx, "mogao", "setting", &id)?;
            }
            module_links::remove_entity(&tx, "mogao", "work", &wid)?;
            tx.execute("DELETE FROM mogao_works WHERE id=?1", [&wid])?;
        }
        "mogao-chapter" => {
            tx.execute("UPDATE mogao_settings SET chapter_id=NULL,revision=revision+1,updated_at=?2 WHERE chapter_id=?1",params![q.id,now()])?;
            tx.execute("DELETE FROM mogao_chapters WHERE id=?1", [&q.id])?;
            bump_tree(&tx, &wid)?;
            tx.execute(
                "UPDATE mogao_works SET settings_revision=settings_revision+1 WHERE id=?1",
                [&wid],
            )?;
        }
        _ => {
            tx.execute(
                "UPDATE mogao_settings SET parent_id=NULL,revision=revision+1 WHERE parent_id=?1",
                [&q.id],
            )?;
            let entries = settings(
                &tx,
                &Scope {
                    request_id: q.request_id,
                    work_id: wid.clone(),
                },
            )?;
            for mut s in entries {
                if s.fields.related_characters.contains(&q.id) {
                    s.fields.related_characters.retain(|id| id != &q.id);
                    tx.execute(
                        "UPDATE mogao_settings SET fields_json=?2,revision=revision+1 WHERE id=?1",
                        params![
                            s.id,
                            serde_json::to_string(&s.fields)
                                .map_err(|_| AppError::validation("人物关系无效。"))?
                        ],
                    )?;
                }
            }
            module_links::remove_entity(&tx, "mogao", "setting", &q.id)?;
            tx.execute("DELETE FROM mogao_settings WHERE id=?1", [&q.id])?;
            tx.execute("UPDATE mogao_works SET settings_revision=settings_revision+1,updated_at=?2 WHERE id=?1",params![wid,now()])?;
        }
    }
    tx.commit()?;
    Ok(())
}

pub fn location(c: &mut Connection) -> AppResult<Location> {
    let (work_id,chapter_id)=c.query_row("SELECT l.work_id,l.chapter_id FROM mogao_location l LEFT JOIN mogao_works w ON w.id=l.work_id WHERE l.singleton=1 AND (w.deleted_at IS NULL)",[],|r|Ok((r.get::<_,Option<String>>(0)?,r.get::<_,Option<String>>(1)?))).optional()?.unwrap_or((None,None));
    let chapter_id = chapter_id.filter(|id| {
        c.query_row(
            "SELECT deleted_at IS NULL FROM mogao_chapters WHERE id=?1",
            [id],
            |r| r.get::<_, bool>(0),
        )
        .unwrap_or(false)
    });
    Ok(Location {
        work_id,
        chapter_id,
    })
}
pub fn save_location(c: &mut Connection, q: super::contracts::SaveLocation) -> AppResult<()> {
    if let Some(work_id) = &q.location.work_id {
        work(c, work_id, false)?;
        if let Some(id) = &q.location.chapter_id {
            chapter(
                c,
                &Entity {
                    request_id: q.request_id,
                    work_id: work_id.clone(),
                    id: id.clone(),
                },
                false,
            )?;
        }
    } else if q.location.chapter_id.is_some() {
        return Err(AppError::validation("章节位置必须属于作品。"));
    }
    c.execute(
        "UPDATE mogao_location SET work_id=?1,chapter_id=?2 WHERE singleton=1",
        params![q.location.work_id, q.location.chapter_id],
    )?;
    Ok(())
}
