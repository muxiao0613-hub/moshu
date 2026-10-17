//! Local application API for the vendored Mogao workspace. No server or account dependency.
pub mod ai;
mod backup;
mod issues;
pub mod platform;
mod profile;
mod sources;
use crate::contracts::*;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StudioRequest {
    pub request_id: String,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub data: Value,
    #[serde(default)]
    pub params: Value,
    pub base_revision: Option<i64>,
}
pub(super) fn hash(s: &str) -> String {
    Sha256::digest(s.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
pub(super) fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}
pub(super) fn uid() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn missing() -> AppError {
    AppError::new(ErrorCode::NotFound, "创作内容不存在或已移入回收区。", false)
}
pub(super) fn conflict(remote: &Value) -> AppError {
    let mut e = AppError::conflict(remote["revision"].as_i64().unwrap_or(0));
    e.details = Some(json!({"remote":remote}));
    e
}
pub(super) fn read(c: &Connection, kind: &str, scope: Option<&str>, id: &str) -> AppResult<Value> {
    let s: Option<String> = c.query_row("SELECT data FROM mogao_studio_entities WHERE id=?1 AND kind=?2 AND project_id IS ?3 AND deleted_at IS NULL",params![id,kind,scope],|r|r.get(0)).optional()?;
    s.map(|s| {
        serde_json::from_str(&s).map_err(|_| AppError::validation("创作数据损坏，请恢复备份。"))
    })
    .transpose()?
    .ok_or_else(missing)
}
pub(super) fn rows(c: &Connection, kind: &str, scope: Option<&str>) -> AppResult<Vec<Value>> {
    let mut s=c.prepare("SELECT data FROM mogao_studio_entities WHERE kind=?1 AND project_id IS ?2 AND deleted_at IS NULL ORDER BY coalesce(json_extract(data,'$.order'),0),json_extract(data,'$.createdAt'),id")?;
    s.query_map(params![kind, scope], |r| r.get::<_, String>(0))?
        .map(|r| serde_json::from_str(&r?).map_err(|_| AppError::validation("创作数据损坏。")))
        .collect()
}
pub(super) fn store(
    c: &Connection,
    kind: &str,
    scope: Option<&str>,
    mut value: Value,
) -> AppResult<Value> {
    let id = value["id"]
        .as_str()
        .ok_or_else(|| AppError::validation("内容 ID 缺失。"))?
        .to_owned();
    let old: Option<i64> = c
        .query_row(
            "SELECT revision FROM mogao_studio_entities WHERE id=?1",
            [&id],
            |r| r.get(0),
        )
        .optional()?;
    value["revision"] = json!(old.unwrap_or(0) + 1);
    value["updatedAt"] = json!(now());
    c.execute("INSERT INTO mogao_studio_entities(id,kind,project_id,revision,data) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data",params![id,kind,scope,value["revision"].as_i64(),value.to_string()])?;
    Ok(value)
}
pub(super) fn version(
    c: &Connection,
    entity: &Value,
    content: &str,
    note: &str,
) -> AppResult<Value> {
    let v = json!({"id":uid(),"chapterId":entity["id"],"content":content,"note":note,"createdAt":now()});
    c.execute(
        "INSERT INTO mogao_studio_versions VALUES(?1,?2,?3,?4)",
        params![
            v["id"].as_str(),
            entity["id"].as_str(),
            entity["revision"].as_i64().unwrap_or(1),
            v.to_string()
        ],
    )?;
    Ok(v)
}
fn defaults(kind: &str) -> Value {
    match kind {
        "projects" => {
            json!({"title":"无标题作品","genre":"","synopsis":"","targetWordCount":600000,"styleSamples":[],"topicCandidates":[],"factLedger":[],"revisionIssues":[]})
        }
        "chapters" => {
            json!({"title":"未命名章节","order":0,"content":"","wordCount":0,"status":"draft","summary":""})
        }
        "characters" => {
            json!({"name":"未命名人物","aliases":[],"role":"supporting","appearance":"","personality":"","background":"","abilities":"","relationships":[],"arc":"","firstAppearance":"","notes":"","lifeMemories":[],"voiceSamples":[]})
        }
        "world-settings" => json!({"title":"未命名设定","category":"","content":"","tags":[]}),
        "outlines" => {
            json!({"title":"未命名大纲","type":"chapter","parentId":null,"order":0,"summary":"","keyEvents":[],"characters":[]})
        }
        "plot-threads" => {
            json!({"title":"未命名伏笔","description":"","status":"planted","plantedAt":"","relatedChapters":[],"relatedCharacters":[],"importance":"minor","notes":""})
        }
        "timeline-events" => {
            json!({"title":"未命名事件","description":"","date":"","order":0,"characters":[],"line":"","type":"event"})
        }
        "materials" => {
            json!({"title":"未命名素材","rawContent":"","expandedContent":"","category":"其他","tags":[]})
        }
        _ => {
            json!({"title":"无标题故事","platform":"小红书故事","genre":"情感","targetWords":3000,"premise":"","content":"","plotPoints":[],"styleConstraint":"","status":"draft","wordCount":0,"versions":[]})
        }
    }
}
fn fields(kind: &str) -> &'static str {
    match kind {
        "projects" => {
            "title genre synopsis targetPlatform novelLengthPreset targetWordCount targetReader qualityGoal recommendedVolumes recommendedChaptersPerVolume recommendedChapterWordCount recommendedCharacterCount styleFingerprint styleSamples storyBible topicCandidates"
        }
        "chapters" => {
            "title order volumeId content status summary continuity pacingTag conflictType beatCard qualityReport"
        }
        "characters" => {
            "name aliases role age gender appearance personality background abilities goals relationships arc firstAppearance notes stateHistory voiceSamples profileEffectiveOrder profileEvidence"
        }
        "world-settings" => "category title content tags",
        "outlines" => "title type parentId order summary keyEvents characters chapterId",
        "plot-threads" => {
            "title description status plantedAt resolvedAt relatedChapters relatedCharacters importance notes"
        }
        "timeline-events" => "title description date realDate order characters chapterId line type",
        "materials" => "title rawContent expandedContent category tags",
        _ => {
            "title platform genre targetWords premise content plotPoints styleConstraint status qualityReport versions"
        }
    }
}
fn save(
    c: &Connection,
    kind: &str,
    scope: Option<&str>,
    id: Option<&str>,
    q: &StudioRequest,
) -> AppResult<Value> {
    let patch = q
        .data
        .as_object()
        .ok_or_else(|| AppError::validation("保存内容必须为对象。"))?;
    let supplied = patch.get("id").and_then(Value::as_str);
    if id.is_some() && supplied.is_some() && id != supplied {
        return Err(AppError::validation("内容 ID 与请求不一致。"));
    }
    if let Some(p) = patch.get("projectId").and_then(Value::as_str)
        && scope != Some(p)
    {
        return Err(AppError::validation("内容不属于此作品。"));
    }
    let id = id.or(supplied);
    let existing = id.map(|i| read(c, kind, scope, i)).transpose();
    let old = match existing {
        Ok(v) => v,
        Err(e) if id.is_some() && q.method == "POST" && e.code == ErrorCode::NotFound => {
            let occupied: bool = c.query_row(
                "SELECT EXISTS(SELECT 1 FROM mogao_studio_entities WHERE id=?1)",
                [id],
                |r| r.get(0),
            )?;
            if occupied {
                return Err(AppError::validation("内容 ID 已被占用。"));
            }
            None
        }
        Err(e) => return Err(e),
    };
    if let Some(old) = &old
        && q.base_revision != old["revision"].as_i64()
    {
        return Err(conflict(old));
    }
    let mut next = old.clone().unwrap_or_else(|| defaults(kind));
    if kind == "characters" && old.is_some() {
        profile::ensure(&mut next);
    }
    if let Some(old) = &old
        && ["chapters", "short-stories"].contains(&kind)
    {
        sources::merge_content(old, &mut next, &q.data)?;
    }
    for field in fields(kind).split_whitespace() {
        if field == "content" && old.is_some() && ["chapters", "short-stories"].contains(&kind) {
            continue;
        }
        if let Some(v) = patch.get(field) {
            next[field] = v.clone();
        }
    }
    if ["chapters", "short-stories"].contains(&kind) {
        sources::reconcile(old.as_ref(), &mut next, &q.data)?;
        next["wordCount"] = json!(sources::word_count(next["content"].as_str().unwrap_or("")));
        if let Some(old) = &old
            && next["content"] != old["content"]
        {
            version(
                c,
                old,
                old["content"].as_str().unwrap_or(""),
                "正文修改前自动快照",
            )?;
        }
    }
    if kind == "characters" {
        let order = next["profileEffectiveOrder"].as_i64().unwrap_or(0);
        if !(0..=1000000).contains(&order) {
            return Err(AppError::validation("档案生效章序须为非负整数。"));
        }
        if old.is_none() {
            profile::ensure(&mut next);
        } else {
            profile::append(&mut next, order, "作者编辑", None, None);
        }
        next.as_object_mut()
            .unwrap()
            .remove("profileEffectiveOrder");
    }
    next["id"] = json!(id.map(str::to_owned).unwrap_or_else(uid));
    if let Some(scope) = scope {
        next["projectId"] = json!(scope);
    }
    if old.is_none() {
        next["createdAt"] = json!(now());
    }
    next["isPublic"] = json!(false);
    validate_record(kind, &next)?;
    let next = store(c, kind, scope, next)?;
    if kind == "chapters"
        && old.as_ref().is_some_and(|v| {
            v["content"] != next["content"]
                || v["order"] != next["order"]
                || v["status"] != next["status"]
                || v["title"] != next["title"]
        })
    {
        sources::invalidate(c, scope.unwrap_or(""), &next)?;
    }
    Ok(next)
}
pub(super) fn validate_record(kind: &str, v: &Value) -> AppResult<()> {
    let title = if kind == "characters" {
        "name"
    } else {
        "title"
    };
    if v[title]
        .as_str()
        .is_none_or(|s| s.trim().is_empty() || s.chars().count() > 200)
    {
        return Err(AppError::validation("名称须为 1–200 字。"));
    }
    if v.to_string().len() > 4 * 1024 * 1024 {
        return Err(AppError::validation("单份创作内容超过 4 MiB。"));
    }
    if let Some(content) = v.get("content")
        && !content.is_string()
    {
        return Err(AppError::validation("正文必须为文本。"));
    }
    Ok(())
}
pub fn request(c: &mut Connection, q: StudioRequest) -> AppResult<Value> {
    crate::platform::domain::id(&q.request_id)?;
    if q.path.len() > 512
        || !q.path.starts_with('/')
        || q.path.contains(['?', '#', '%'])
        || q.data.to_string().len() > 32 * 1024 * 1024
        || !["GET", "POST", "PATCH", "DELETE"].contains(&q.method.as_str())
    {
        return Err(AppError::validation("墨稿请求格式无效。"));
    }
    let tx = c.transaction()?;
    let fingerprint =
        hash(&serde_json::to_string(&q).map_err(|_| AppError::validation("请求无效。"))?);
    if q.method != "GET" {
        let receipt: Option<(String, String)> = tx
            .query_row(
                "SELECT request_hash,response FROM mogao_studio_receipts WHERE request_id=?1",
                [&q.request_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if let Some((h, response)) = receipt {
            if h != fingerprint {
                return Err(AppError::validation("重复请求内容不一致。"));
            }
            return serde_json::from_str(&response)
                .map_err(|_| AppError::validation("保存回执损坏。"));
        }
    }
    let result = route(&tx, &q)?;
    if q.method != "GET" {
        tx.execute(
            "INSERT INTO mogao_studio_receipts VALUES(?1,?2,?3)",
            params![q.request_id, fingerprint, result.to_string()],
        )?;
    }
    tx.commit()?;
    Ok(result)
}
fn route(c: &Connection, q: &StudioRequest) -> AppResult<Value> {
    let parts: Vec<&str> = q.path.trim_start_matches('/').split('/').collect();
    if parts == ["ai-runs"] && q.method == "GET" {
        let mut s=c.prepare("SELECT id,model,output,status,created_at,finished_at FROM mogao_studio_ai_runs ORDER BY created_at DESC LIMIT 30")?;
        let rows=s.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"model":r.get::<_,String>(1)?,"output":r.get::<_,String>(2)?,"status":r.get::<_,String>(3)?,"createdAt":r.get::<_,String>(4)?,"finishedAt":r.get::<_,Option<String>>(5)?})))?.collect::<Result<Vec<_>,_>>()?;
        return Ok(json!(rows));
    }
    if parts == ["local-state"] {
        return local_state(c, q);
    }
    if parts == ["users", "me"] && q.method == "GET" {
        return Ok(json!({"id":"local","nickname":"本地作者"}));
    }
    if parts == ["projects", "import"] && q.method == "POST" {
        return backup::import(c, &q.data);
    }
    if parts == ["materials", "import"] && q.method == "POST" {
        return backup::import_materials(c, &q.data);
    }
    let (kind, scope, rest) = if parts.first() == Some(&"projects") && parts.len() >= 3 {
        let pid = parts[1];
        read(c, "projects", None, pid)?;
        (parts[2], Some(pid), &parts[3..])
    } else {
        (parts[0], None, &parts[1..])
    };
    if let Some(pid) = scope {
        match kind {
            "backup" if q.method == "GET" && rest.is_empty() => return backup::export(c, pid),
            "facts" | "issues" | "topic" if rest.is_empty() => {
                return sources::command(c, pid, kind, q);
            }
            "characters" if rest == ["context"] && q.method == "GET" => {
                let ids = q.params["ids"]
                    .as_str()
                    .unwrap_or("")
                    .split(',')
                    .filter(|s| !s.is_empty())
                    .collect::<std::collections::BTreeSet<_>>();
                if ids.is_empty() || ids.len() > 3 {
                    return Err(AppError::validation("请选择 1–3 位人物。"));
                }
                let all = rows(c, kind, scope)?;
                let cast = all
                    .iter()
                    .filter(|v| ids.contains(v["id"].as_str().unwrap_or("")))
                    .cloned()
                    .collect::<Vec<_>>();
                if cast.len() != ids.len() {
                    return Err(missing());
                }
                return Ok(
                    json!({"characters":all.iter().map(|v|json!({"id":v["id"],"name":v["name"]})).collect::<Vec<_>>(),"cast":cast}),
                );
            }
            "characters" if rest.len() == 2 && rest[1] == "memories" && q.method == "POST" => {
                return sources::memory(c, pid, rest[0], &q.data);
            }
            "chapters" if rest.len() >= 2 && rest[1] == "versions" => {
                let chapter = read(c, kind, scope, rest[0])?;
                if rest.len() == 2 && q.method == "POST" {
                    return version(
                        c,
                        &chapter,
                        q.data["content"]
                            .as_str()
                            .ok_or_else(|| AppError::validation("版本正文缺失。"))?,
                        q.data["note"].as_str().unwrap_or("手动保存"),
                    );
                }
                if q.method == "GET" && rest.len() <= 3 {
                    let mut s=c.prepare("SELECT data FROM mogao_studio_versions WHERE entity_id=?1 ORDER BY rowid DESC")?;
                    let list: Vec<Value> = s
                        .query_map([rest[0]], |r| r.get::<_, String>(0))?
                        .map(|r| {
                            serde_json::from_str(&r?)
                                .map_err(|_| AppError::validation("版本数据损坏。"))
                        })
                        .collect::<AppResult<_>>()?;
                    if rest.len() == 3 {
                        return list
                            .into_iter()
                            .find(|v| v["id"] == rest[2])
                            .ok_or_else(missing);
                    }
                    return Ok(json!(
                        list.into_iter()
                            .map(|mut v| {
                                v.as_object_mut().unwrap().remove("content");
                                v
                            })
                            .collect::<Vec<_>>()
                    ));
                }
            }
            _ => {}
        }
    }
    if ![
        "projects",
        "materials",
        "short-stories",
        "chapters",
        "characters",
        "world-settings",
        "outlines",
        "plot-threads",
        "timeline-events",
    ]
    .contains(&kind)
        || (["projects", "materials", "short-stories"].contains(&kind) != scope.is_none())
        || rest.len() > 1
    {
        return Err(AppError::validation("此服务器接口不属于本地创作功能。"));
    }
    match (q.method.as_str(), rest.first()) {
        ("GET", None) => {
            let mut list = rows(c, kind, scope)?;
            if kind == "chapters" {
                for value in &mut list {
                    value.as_object_mut().unwrap().remove("content");
                }
            }
            Ok(json!(list))
        }
        ("GET", Some(id)) => read(c, kind, scope, id),
        ("POST", None) => save(c, kind, scope, None, q),
        ("PATCH", Some(id)) => save(c, kind, scope, Some(id), q),
        ("DELETE", Some(id)) => {
            let old = read(c, kind, scope, id)?;
            if q.base_revision != old["revision"].as_i64() {
                return Err(conflict(&old));
            }
            if kind == "chapters" {
                sources::invalidate(c, scope.unwrap_or(""), &json!({"id":id,"content":null}))?;
            }
            c.execute(
                "UPDATE mogao_studio_entities SET deleted_at=?2,revision=revision+1,data=json_set(data,'$.revision',revision+1,'$.deletedAt',?2) WHERE id=?1",
                params![id, now()],
            )?;
            Ok(Value::Null)
        }
        _ => Err(AppError::validation("不支持的创作操作。")),
    }
}
fn local_state(c: &Connection, q: &StudioRequest) -> AppResult<Value> {
    if q.method == "GET" {
        let mut s = c.prepare("SELECT key,value FROM mogao_studio_state ORDER BY key")?;
        let map = s
            .query_map([], |r| {
                Ok((r.get::<_, String>(0)?, json!(r.get::<_, String>(1)?)))
            })?
            .collect::<Result<serde_json::Map<String, Value>, _>>()?;
        return Ok(Value::Object(map));
    }
    let key = q.data["key"]
        .as_str()
        .ok_or_else(|| AppError::validation("设置名称缺失。"))?;
    if q.method != "POST"
        || !key.starts_with("mogao_")
        || key.len() > 250
        || ["api_key", "access_token", "refresh_token"]
            .iter()
            .any(|s| key.contains(s))
    {
        return Err(AppError::validation("该值不得存入墨稿偏好。"));
    }
    if q.data["value"].is_null() {
        c.execute("DELETE FROM mogao_studio_state WHERE key=?1", [key])?;
    } else {
        let value = q.data["value"]
            .as_str()
            .ok_or_else(|| AppError::validation("设置值无效。"))?;
        if value.len() > 4 * 1024 * 1024 {
            return Err(AppError::validation("恢复稿或偏好超过 4 MiB。"));
        }
        c.execute("INSERT INTO mogao_studio_state VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value])?;
    }
    Ok(Value::Null)
}
pub fn validate(c: &Connection) -> AppResult<()> {
    let mut s = c.prepare("SELECT kind,data FROM mogao_studio_entities")?;
    for row in s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
        let (kind, data) = row?;
        let v: Value = serde_json::from_str(&data)
            .map_err(|_| AppError::validation("迁入创作数据格式无效。"))?;
        validate_record(&kind, &v)?;
    }
    let invalid:i64=c.query_row("SELECT count(*) FROM mogao_studio_entities child JOIN mogao_studio_entities parent ON child.project_id=parent.id WHERE parent.kind!='projects'",[],|r|r.get(0))?;
    if invalid > 0 {
        return Err(AppError::validation("迁入创作数据归属无效。"));
    }
    Ok(())
}
