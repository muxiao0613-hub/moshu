//! Typed, transaction-scoped links for trusted compiled modules. No arbitrary SQL or paths cross IPC.
use super::{domain, repository};
use crate::contracts::*;
use rusqlite::{Connection, params};
pub enum Target {
    Project(String),
    Resource(String),
    Image(String),
}
pub fn replace(
    c: &rusqlite::Transaction,
    module: &str,
    kind: &str,
    id: &str,
    role: &str,
    targets: Vec<Target>,
) -> AppResult<()> {
    domain::id(id)?;
    for key in [module, kind, role] {
        if key.is_empty()
            || key.len() > 80
            || !key
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err(AppError::validation("模块引用字段无效。"));
        }
    }
    if targets.len() > 100 {
        return Err(AppError::validation("最多关联 100 份资料。"));
    }
    c.execute("DELETE FROM platform_module_links WHERE module_id=?1 AND entity_kind=?2 AND entity_id=?3 AND role=?4",params![module,kind,id,role])?;
    for target in targets {
        let (project, resource) = match target {
            Target::Project(id) => {
                domain::id(&id)?;
                repository::get_project(c, &id)?;
                (Some(id), None)
            }
            Target::Resource(id) => {
                domain::id(&id)?;
                super::content_repository::get_resource(c, &id)?;
                (None, Some(id))
            }
            Target::Image(id) => {
                domain::id(&id)?;
                let r = super::content_repository::get_resource(c, &id)?;
                if !r.mime_type.as_ref().is_some_and(|m| {
                    ["image/png", "image/jpeg", "image/gif", "image/webp"].contains(&m.as_str())
                }) {
                    return Err(AppError::validation(
                        "封面须为资料库中的 PNG、JPEG、GIF 或 WebP 图片。",
                    ));
                }
                (None, Some(id))
            }
        };
        c.execute("INSERT OR IGNORE INTO platform_module_links(module_id,entity_kind,entity_id,role,target_id,project_id,resource_id) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![module,kind,id,role,project.as_ref().or(resource.as_ref()),project,resource])?;
    }
    Ok(())
}
pub fn targets(
    c: &Connection,
    module: &str,
    kind: &str,
    id: &str,
    role: &str,
) -> AppResult<Vec<String>> {
    let mut s=c.prepare("SELECT target_id FROM platform_module_links WHERE module_id=?1 AND entity_kind=?2 AND entity_id=?3 AND role=?4 ORDER BY target_id")?;
    Ok(s.query_map(params![module, kind, id, role], |r| r.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}
pub fn remove_entity(
    c: &rusqlite::Transaction,
    module: &str,
    kind: &str,
    id: &str,
) -> AppResult<()> {
    c.execute(
        "DELETE FROM platform_module_links WHERE module_id=?1 AND entity_kind=?2 AND entity_id=?3",
        params![module, kind, id],
    )?;
    Ok(())
}

pub fn entities_for_project(
    c: &Connection,
    module: &str,
    kind: &str,
    project: &str,
) -> AppResult<Vec<String>> {
    let mut s=c.prepare("SELECT entity_id FROM platform_module_links WHERE module_id=?1 AND entity_kind=?2 AND project_id=?3")?;
    Ok(s.query_map(params![module, kind, project], |r| r.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}
