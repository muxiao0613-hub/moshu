//! Read-only publications for the platform library. No duplicated manuscript or export snapshot.
use crate::contracts::*;
use rusqlite::{Connection, OptionalExtension, params};
const ENTRIES: &str = "WITH entries AS (
 SELECT 'mogao-studio-projects' kind,p.id,json_extract(p.data,'$.title') title,coalesce(json_extract(p.data,'$.synopsis'),'') description,
 coalesce(sum(json_extract(ch.data,'$.wordCount')),0) word_count,count(ch.id) section_count,p.revision,
 max(coalesce(json_extract(p.data,'$.updatedAt'),''),coalesce(max(json_extract(ch.data,'$.updatedAt')),'')) updated_at
 FROM mogao_studio_entities p LEFT JOIN mogao_studio_entities ch ON ch.project_id=p.id AND ch.kind='chapters' AND ch.deleted_at IS NULL
 WHERE p.kind='projects' AND p.deleted_at IS NULL GROUP BY p.id
 UNION ALL
 SELECT 'mogao-studio-short-stories',id,json_extract(data,'$.title'),coalesce(json_extract(data,'$.premise'),''),coalesce(json_extract(data,'$.wordCount'),0),1,revision,coalesce(json_extract(data,'$.updatedAt'),'')
 FROM mogao_studio_entities WHERE kind='short-stories' AND deleted_at IS NULL
 UNION ALL
 SELECT 'mogao-work',w.id,w.name,w.synopsis,coalesce(sum(ch.word_count),0),count(ch.id),w.revision,max(w.updated_at,coalesce(max(ch.updated_at),''))
 FROM mogao_works w LEFT JOIN mogao_chapters ch ON ch.work_id=w.id AND ch.deleted_at IS NULL
 WHERE w.deleted_at IS NULL GROUP BY w.id
)";
fn entry_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryEntry> {
    Ok(LibraryEntry {
        module_id: "mogao".into(),
        module_name: "墨稿".into(),
        kind: r.get(0)?,
        id: r.get(1)?,
        title: r.get(2)?,
        description: r.get(3)?,
        word_count: r.get::<_, i64>(4)?.max(0) as u64,
        section_count: r.get(5)?,
        revision: r.get(6)?,
        updated_at: r.get(7)?,
        disabled: false,
    })
}
fn missing() -> AppError {
    AppError::new(
        ErrorCode::NotFound,
        "作品或章节已不存在，可能已移入回收站。",
        false,
    )
}
pub fn list(c: &Connection, q: &LibraryQuery) -> AppResult<Vec<LibraryEntry>> {
    let mut s=c.prepare(&format!("{ENTRIES} SELECT * FROM entries WHERE instr(lower(title||char(10)||description),lower(?1))>0 ORDER BY updated_at DESC,kind,id LIMIT ?2"))?;
    Ok(
        s.query_map(params![q.keyword.trim(), q.offset + q.limit + 1], entry_row)?
            .collect::<rusqlite::Result<_>>()?,
    )
}
pub fn read(c: &Connection, q: &ReadLibrary) -> AppResult<LibraryReading> {
    if ![
        "mogao-studio-projects",
        "mogao-studio-short-stories",
        "mogao-work",
    ]
    .contains(&q.kind.as_str())
    {
        return Err(AppError::validation("作品资料类型无效。"));
    }
    let entry = c
        .query_row(
            &format!("{ENTRIES} SELECT * FROM entries WHERE kind=?1 AND id=?2"),
            params![q.kind, q.id],
            entry_row,
        )
        .optional()?
        .ok_or_else(missing)?;
    let sections = if q.kind == "mogao-studio-short-stories" {
        vec![LibrarySection {
            id: entry.id.clone(),
            title: entry.title.clone(),
            revision: entry.revision,
            word_count: entry.word_count,
        }]
    } else {
        let sql = if q.kind == "mogao-work" {
            "SELECT ch.id,ch.title,ch.revision,ch.word_count FROM mogao_chapters ch LEFT JOIN mogao_volumes v ON ch.volume_id=v.id WHERE ch.work_id=?1 AND ch.deleted_at IS NULL AND v.deleted_at IS NULL ORDER BY CASE WHEN ch.volume_id IS NULL THEN -1 ELSE v.position END,ch.position,ch.id"
        } else {
            "SELECT id,json_extract(data,'$.title'),revision,coalesce(json_extract(data,'$.wordCount'),0) FROM mogao_studio_entities WHERE project_id=?1 AND kind='chapters' AND deleted_at IS NULL ORDER BY coalesce(json_extract(data,'$.order'),0),json_extract(data,'$.createdAt'),id"
        };
        let mut stmt = c.prepare(sql)?;
        stmt.query_map([&q.id], |r| {
            Ok(LibrarySection {
                id: r.get(0)?,
                title: r.get(1)?,
                revision: r.get(2)?,
                word_count: r.get::<_, i64>(3)?.max(0) as u64,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
    };
    let chosen = match &q.section_id {
        Some(id) => Some(sections.iter().find(|s| &s.id == id).ok_or_else(missing)?),
        None => sections.first(),
    };
    let (selected_id, title, revision, text) = if let Some(ch) = chosen {
        let text = if q.kind == "mogao-work" {
            c.query_row("SELECT plain_text FROM mogao_chapters WHERE work_id=?1 AND id=?2 AND deleted_at IS NULL",params![q.id,ch.id],|r|r.get::<_,String>(0)).optional()?.ok_or_else(missing)?
        } else {
            let html=c.query_row("SELECT coalesce(json_extract(data,'$.content'),'') FROM mogao_studio_entities WHERE id=?1 AND deleted_at IS NULL",[&ch.id],|r|r.get::<_,String>(0)).optional()?.ok_or_else(missing)?;
            reading_text(&html)
        };
        (Some(ch.id.clone()), ch.title.clone(), ch.revision, text)
    } else {
        (None, entry.title.clone(), entry.revision, String::new())
    };
    let edit_target = SearchHit {
        module_id: Some("mogao".into()),
        work_id: Some(entry.id.clone()),
        disabled: false,
        kind: match (q.kind.as_str(), selected_id.is_some()) {
            ("mogao-studio-projects", true) => "mogao-studio-chapters".into(),
            ("mogao-work", true) => "mogao-chapter".into(),
            _ => q.kind.clone(),
        },
        id: selected_id.clone().unwrap_or_else(|| entry.id.clone()),
        title: title.clone(),
        snippet: String::new(),
        revision,
        updated_at: entry.updated_at.clone(),
        source: "资料库".into(),
    };
    Ok(LibraryReading {
        edit_target,
        entry,
        sections,
        selected_id,
        title,
        text,
        revision,
    })
}
// This reading projection never changes the saved HTML or provenance hashes.
fn reading_text(html: &str) -> String {
    let mut out = String::new();
    let mut rest = html;
    let mut skip = false;
    while let Some(start) = rest.find('<') {
        if !skip {
            out.push_str(&rest[..start]);
        }
        let Some(end) = rest[start..].find('>') else {
            rest = "";
            break;
        };
        let tag = rest[start + 1..start + end].trim().to_ascii_lowercase();
        let name = tag
            .trim_start_matches('/')
            .split_whitespace()
            .next()
            .unwrap_or("")
            .trim_end_matches('/');
        if ["script", "style"].contains(&name) {
            skip = !tag.starts_with('/');
        } else if !skip {
            if name == "br" {
                out.push('\n');
            } else if tag.starts_with('/')
                && [
                    "p",
                    "div",
                    "h1",
                    "h2",
                    "h3",
                    "h4",
                    "h5",
                    "h6",
                    "li",
                    "blockquote",
                ]
                .contains(&name)
            {
                out.push_str("\n\n");
            }
        }
        rest = &rest[start + end + 1..];
    }
    if !skip {
        out.push_str(rest);
    }
    let out = out
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&");
    out.trim().to_owned()
}
