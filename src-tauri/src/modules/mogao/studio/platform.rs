//! Participation in platform search, recycle bin and backup validation.
use super::*;
pub const KINDS: [&str; 9] = [
    "mogao-studio-projects",
    "mogao-studio-chapters",
    "mogao-studio-characters",
    "mogao-studio-world-settings",
    "mogao-studio-outlines",
    "mogao-studio-plot-threads",
    "mogao-studio-timeline-events",
    "mogao-studio-materials",
    "mogao-studio-short-stories",
];
pub fn search(c: &Connection, q: &SearchQuery, enabled: bool) -> AppResult<Vec<SearchHit>> {
    if q.tag.is_some() || q.project_id.is_some() {
        return Ok(vec![]);
    }
    let mut s=c.prepare("SELECT e.kind,e.id,e.project_id,e.data,e.revision FROM mogao_studio_entities e LEFT JOIN mogao_studio_entities p ON e.project_id=p.id WHERE e.deleted_at IS NULL AND p.deleted_at IS NULL AND (?1 OR e.kind IN ('projects','short-stories')) AND (?2 IS NULL OR 'mogao-studio-'||e.kind=?2)")?;
    let mut result = Vec::new();
    for row in s.query_map(params![enabled, q.kind], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, Option<String>>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, i64>(4)?,
        ))
    })? {
        let (kind, id, pid, data, revision) = row?;
        let v: Value =
            serde_json::from_str(&data).map_err(|_| AppError::validation("创作数据损坏。"))?;
        let title = v[if kind == "characters" {
            "name"
        } else {
            "title"
        }]
        .as_str()
        .unwrap_or("")
        .to_owned();
        let text = if enabled {
            super::sources::plain(
                &[
                    "content",
                    "synopsis",
                    "summary",
                    "description",
                    "personality",
                    "background",
                    "notes",
                    "rawContent",
                    "expandedContent",
                ]
                .iter()
                .filter_map(|k| v[k].as_str())
                .collect::<Vec<_>>()
                .join("\n"),
            )
        } else {
            String::new()
        };
        let needle = q.keyword.trim().to_lowercase();
        if !title.to_lowercase().contains(&needle) && !text.to_lowercase().contains(&needle) {
            continue;
        }
        result.push(SearchHit {
            kind: format!("mogao-studio-{kind}"),
            id: id.clone(),
            module_id: Some("mogao".into()),
            work_id: pid.or(Some(id)),
            disabled: !enabled,
            title,
            snippet: text.chars().take(160).collect(),
            revision,
            updated_at: v["updatedAt"].as_str().unwrap_or("").into(),
            source: if enabled {
                "墨稿写作台"
            } else {
                "模块已停用 · 仅作品名称"
            }
            .into(),
        });
    }
    result.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then(a.id.cmp(&b.id)));
    result.truncate((q.offset + q.limit + 1) as usize);
    Ok(result)
}
pub fn trash(c: &Connection, q: &TrashQuery) -> AppResult<Vec<TrashItem>> {
    let mut s=c.prepare("SELECT 'mogao-studio-'||e.kind,e.id,coalesce(json_extract(e.data,'$.title'),json_extract(e.data,'$.name')),e.deleted_at,e.revision FROM mogao_studio_entities e LEFT JOIN mogao_studio_entities p ON e.project_id=p.id WHERE e.deleted_at IS NOT NULL AND p.deleted_at IS NULL AND (?1 IS NULL OR 'mogao-studio-'||e.kind=?1) ORDER BY e.deleted_at DESC,e.id LIMIT ?2")?;
    Ok(s.query_map(params![q.kind, q.offset + q.limit + 1], |r| {
        Ok(TrashItem {
            kind: r.get(0)?,
            id: r.get(1)?,
            name: r.get(2)?,
            deleted_at: r.get(3)?,
            revision: r.get(4)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?)
}
fn target(c: &Connection, q: &TrashMutation) -> AppResult<TrashItem> {
    let kind = q
        .kind
        .strip_prefix("mogao-studio-")
        .ok_or_else(|| AppError::validation("回收类型无效。"))?;
    let item=c.query_row("SELECT coalesce(json_extract(data,'$.title'),json_extract(data,'$.name')),deleted_at,revision FROM mogao_studio_entities WHERE id=?1 AND kind=?2 AND deleted_at IS NOT NULL",params![q.id,kind],|r|Ok(TrashItem {kind:q.kind.clone(),id:q.id.clone(),name:r.get(0)?,deleted_at:r.get(1)?,revision:r.get(2)?})).optional()?.ok_or_else(missing)?;
    if item.revision != q.base_revision {
        return Err(AppError::conflict(item.revision));
    }
    Ok(item)
}
pub fn impact(c: &Connection, q: &TrashMutation) -> AppResult<DeleteImpact> {
    let item = target(c, q)?;
    let versions=c.query_row("SELECT count(*) FROM mogao_studio_versions v JOIN mogao_studio_entities e ON e.id=v.entity_id WHERE e.id=?1 OR e.project_id=?1",[&q.id],|r|r.get(0))?;
    Ok(DeleteImpact {
        item,
        versions,
        resource_links: 0,
        tasks: 0,
        sessions: 0,
        shared_blobs: 0,
        module_links: 0,
    })
}
pub fn mutate(c: &mut Connection, q: TrashMutation, purge: bool) -> AppResult<()> {
    let tx = c.transaction()?;
    target(&tx, &q)?;
    if purge {
        tx.execute("DELETE FROM mogao_studio_entities WHERE id=?1", [q.id])?;
    } else {
        let parent: Option<String> = tx.query_row(
            "SELECT project_id FROM mogao_studio_entities WHERE id=?1",
            [&q.id],
            |r| r.get(0),
        )?;
        if let Some(parent) = parent {
            read(&tx, "projects", None, &parent)?;
        }
        tx.execute("UPDATE mogao_studio_entities SET deleted_at=NULL,revision=revision+1,data=json_set(data,'$.revision',revision+1,'$.updatedAt',?2,'$.deletedAt',NULL) WHERE id=?1",params![q.id,now()])?;
    }
    tx.commit()?;
    Ok(())
}
