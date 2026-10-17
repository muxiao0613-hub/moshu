//! Saved-body guards, derived provenance and author confirmation transactions.
use super::*;

pub(super) fn plain(html: &str) -> String {
    let mut text = String::new();
    let mut tag = false;
    for ch in html.chars() {
        match ch {
            '<' => tag = true,
            '>' => {
                tag = false;
            }
            _ if !tag => text.push(ch),
            _ => {}
        }
    }
    text.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}
pub(super) fn word_count(html: &str) -> usize {
    let mut count = 0;
    let mut word = false;
    for ch in plain(html).chars() {
        if ('\u{4e00}'..='\u{9fa5}').contains(&ch) {
            count += 1;
            word = false;
        } else if ch.is_ascii_alphanumeric() || ch == '_' {
            if !word {
                count += 1;
            }
            word = true;
        } else {
            word = false;
        }
    }
    count
}
pub(super) fn merge_content(old: &Value, next: &mut Value, patch: &Value) -> AppResult<()> {
    if let Some(local) = patch.get("content") {
        let local = local
            .as_str()
            .ok_or_else(|| AppError::validation("正文格式无效。"))?;
        let remote = old["content"].as_str().unwrap_or("");
        if let Some(expected) = patch["expectedSourceHash"].as_str()
            && expected != hash(remote)
        {
            return Err(conflict(old));
        }
        if local != remote {
            if patch["expectedSourceHash"].is_null() && patch["baseContent"].as_str().is_none() {
                return Err(conflict(old));
            }
            // Revision protects metadata as well. Never silently resolve overlapping bodies.
            if let Some(base) = patch["baseContent"].as_str()
                && base != remote
            {
                return Err(conflict(old));
            }
        }
        next["content"] = json!(local);
    }
    Ok(())
}
pub(super) fn reconcile(old: Option<&Value>, next: &mut Value, patch: &Value) -> AppResult<()> {
    let current_hash = hash(next["content"].as_str().unwrap_or(""));
    let changed = old.is_some_and(|v| v["content"] != next["content"]);
    for key in ["continuity", "qualityReport", "beatCard"] {
        if let Some(incoming) = patch.get(key) {
            if incoming.is_null() {
                continue;
            }
            if incoming["sourceHash"] == current_hash {
                next[key]["status"] = json!("current");
            } else if old.is_some_and(|v| v[key] == *incoming) {
                next[key]["status"] = json!("stale");
            } else {
                return Err(AppError::new(
                    ErrorCode::Conflict,
                    "正文已变更，请重新生成摘要、场景或评审。",
                    false,
                ));
            }
        } else if changed && next[key].is_object() {
            next[key]["status"] = json!("stale");
        }
        if key == "beatCard"
            && next[key]["status"] == "stale"
            && let Some(scenes) = next[key]["scenes"].as_array_mut()
        {
            for scene in scenes {
                if let Some(o) = scene.as_object_mut() {
                    o.remove("text");
                }
            }
        }
    }
    Ok(())
}
pub(super) fn invalidate(c: &Connection, pid: &str, chapter: &Value) -> AppResult<()> {
    for mut ch in rows(c, "characters", Some(pid))? {
        let mut dirty = false;
        if let Some(memories) = ch["lifeMemories"].as_array_mut() {
            for memory in memories {
                if memory["chapterId"] == chapter["id"] {
                    dirty = true;
                    memory["chapterOrder"] = chapter["order"].clone();
                    memory["chapterTitle"] = chapter["title"].clone();
                    if chapter["content"].is_null()
                        || memory["sourceHash"] != hash(chapter["content"].as_str().unwrap_or(""))
                        || (memory["sourceStatus"] == "final" && chapter["status"] != "final")
                    {
                        memory["status"] = json!("stale");
                    }
                    memory["sourceStatus"] = chapter["status"].clone();
                }
            }
        }
        if dirty {
            store(c, "characters", Some(pid), ch)?;
        }
    }
    let mut project = read(c, "projects", None, pid)?;
    let mut dirty = false;
    if let Some(facts) = project["factLedger"].as_array_mut() {
        for fact in facts {
            if fact["sourceChapterId"] == chapter["id"] {
                fact["status"] = json!("stale");
                dirty = true;
            }
        }
    }
    if dirty {
        store(c, "projects", None, project)?;
    }
    Ok(())
}
fn arr(value: &Value, key: &str) -> Vec<Value> {
    value[key].as_array().cloned().unwrap_or_default()
}
fn quote(chapter: &Value, value: &Value) -> AppResult<()> {
    let text = plain(chapter["content"].as_str().unwrap_or(""));
    let q = value["quote"]
        .as_str()
        .ok_or_else(|| AppError::validation("必须提供逐字引用。"))?
        .trim();
    if q.is_empty() || q.chars().count() > 400 || !text.contains(q) {
        return Err(AppError::validation("引用不在当前已保存正文中。"));
    }
    Ok(())
}
pub(super) fn memory(c: &Connection, pid: &str, id: &str, data: &Value) -> AppResult<Value> {
    let action = data["action"].as_str().unwrap_or("");
    let incoming = &data["memory"];
    if ![
        "stage",
        "sync",
        "confirm",
        "remove",
        "confirmProfile",
        "dismissProfile",
    ]
    .contains(&action)
    {
        return Err(AppError::validation("人物经历操作无效。"));
    }
    let mut character = read(c, "characters", Some(pid), id)?;
    let chapter_id = incoming["chapterId"]
        .as_str()
        .ok_or_else(|| AppError::validation("来源章缺失。"))?;
    let mut memories = arr(&character, "lifeMemories");
    let previous = memories
        .iter()
        .find(|v| v["chapterId"] == chapter_id)
        .cloned();
    if action == "remove" {
        if previous
            .as_ref()
            .is_some_and(|v| v["generatedAt"] != incoming["generatedAt"])
        {
            return Err(conflict(&character));
        }
        memories.retain(|v| v["chapterId"] != chapter_id);
    } else {
        let chapter = read(c, "chapters", Some(pid), chapter_id)?;
        if incoming["sourceHash"] != hash(chapter["content"].as_str().unwrap_or(""))
            || plain(chapter["content"].as_str().unwrap_or(""))
                .trim()
                .is_empty()
        {
            return Err(AppError::new(
                ErrorCode::Conflict,
                "正文已变更，请重新提取经历。",
                false,
            ));
        }
        if ["stage", "sync"].contains(&action)
            && previous.as_ref().is_some_and(|v| {
                v["sourceHash"] == incoming["sourceHash"] && v["status"] != "stale"
            })
        {
            return Ok(character);
        }
        if ["confirm", "confirmProfile", "dismissProfile"].contains(&action)
            && previous.as_ref().is_none_or(|v| {
                v["generatedAt"] != incoming["generatedAt"]
                    || v["confirmedAt"] != incoming["confirmedAt"]
                    || v["status"] == "stale"
            })
        {
            return Err(conflict(&character));
        }
        let mut changes = arr(incoming, "profileChanges");
        if changes.len() > 12 {
            return Err(AppError::validation("人物变更最多 12 条。"));
        }
        for change in &changes {
            quote(&chapter, change)?;
            if ![
                "appearance",
                "personality",
                "goals",
                "background",
                "abilities",
                "notes",
            ]
            .contains(&change["field"].as_str().unwrap_or(""))
                || change["text"]
                    .as_str()
                    .is_none_or(|s| s.trim().is_empty() || s.chars().count() > 400)
            {
                return Err(AppError::validation("人设变更字段无效。"));
            }
        }
        if ["confirmProfile", "dismissProfile"].contains(&action) {
            super::profile::ensure(&mut character);
            let mut baseline =
                super::profile::at(&character, chapter["order"].as_i64().unwrap_or(0));
            let mut old = previous.ok_or_else(|| conflict(&character))?;
            let mut all = arr(&old, "profileChanges");
            for change in &mut changes {
                if !all.iter().any(|v| {
                    v["field"] == change["field"]
                        && v["text"] == change["text"]
                        && v["quote"] == change["quote"]
                        && v["status"].as_str().unwrap_or("pending") == "pending"
                }) {
                    return Err(conflict(&character));
                }
                change["status"] = json!(if action == "confirmProfile" {
                    "confirmed"
                } else {
                    "rejected"
                });
                change["confirmedAt"] = json!(now());
                if action == "confirmProfile" {
                    let field = change["field"].as_str().unwrap();
                    let text = change["text"].as_str().unwrap();
                    let oldtext = baseline[field].as_str().unwrap_or("");
                    if !oldtext.contains(text) {
                        baseline[field] = json!(format!("{}\n{}", oldtext.trim(), text).trim());
                    }
                }
                for v in &mut all {
                    if v["field"] == change["field"]
                        && v["text"] == change["text"]
                        && v["quote"] == change["quote"]
                    {
                        *v = change.clone();
                    }
                }
            }
            old["profileChanges"] = json!(all);
            memories.retain(|v| v["chapterId"] != chapter_id);
            memories.push(old);
            if action == "confirmProfile" {
                let mut evidence = arr(&character, "profileEvidence");
                evidence.push(json!({"id":uid(),"kind":"chapter","sourceChapterIds":[chapter_id],"sourceLabel":chapter["title"],"sourceExcerpt":changes.iter().filter_map(|v|v["quote"].as_str()).collect::<Vec<_>>().join("\n"),"fields":changes.iter().map(|v|(v["field"].as_str().unwrap().to_owned(),v["text"].clone())).collect::<serde_json::Map<_,_>>(),"confirmedAt":now()}));
                character["profileEvidence"] = json!(evidence);
                baseline["profileEvidence"] = character["profileEvidence"].clone();
                super::profile::append(
                    &mut character,
                    chapter["order"].as_i64().unwrap_or(0),
                    "正文确认",
                    Some(chapter_id),
                    Some(baseline.clone()),
                );
                for field in [
                    "appearance",
                    "personality",
                    "goals",
                    "background",
                    "abilities",
                    "notes",
                ] {
                    if !baseline[field].is_null() {
                        character[field] = baseline[field].clone();
                    }
                }
            }
        } else {
            let claims = arr(incoming, "claims");
            if claims.len() > 12 {
                return Err(AppError::validation("人物经历最多 12 条。"));
            }
            for claim in &claims {
                quote(&chapter, claim)?;
                if !["experience", "knowledge", "state", "relationship"]
                    .contains(&claim["kind"].as_str().unwrap_or(""))
                    || claim["text"]
                        .as_str()
                        .is_none_or(|s| s.trim().is_empty() || s.chars().count() > 200)
                {
                    return Err(AppError::validation("经历条目无效。"));
                }
            }
            let confirmed = ["confirm", "sync"].contains(&action) || claims.is_empty();
            let next = json!({"chapterId":chapter_id,"chapterTitle":chapter["title"],"chapterOrder":chapter["order"],"sourceHash":incoming["sourceHash"],"status":if confirmed {"confirmed"} else {"pending"},"claims":claims,"sourceStatus":chapter["status"],"confirmation":if action=="sync" {"generated"} else {"author"},"profileChanges":if action=="confirm" {previous.as_ref().map(|v|arr(v,"profileChanges")).unwrap_or_default()} else {changes},"generatedAt":if action=="confirm" {previous.as_ref().map(|v|v["generatedAt"].clone()).unwrap_or(Value::Null)} else {json!(now())},"confirmedAt":if confirmed {json!(now())} else {Value::Null}});
            memories.retain(|v| v["chapterId"] != chapter_id);
            memories.push(next);
        }
    }
    character["lifeMemories"] = json!(memories);
    store(c, "characters", Some(pid), character)
}
pub(super) fn command(
    c: &Connection,
    pid: &str,
    kind: &str,
    q: &StudioRequest,
) -> AppResult<Value> {
    let mut project = read(c, "projects", None, pid)?;
    if kind == "issues" {
        return super::issues::issues(c, pid, q, project);
    }
    if q.method != "POST" {
        return Err(AppError::validation("创作操作无效。"));
    }
    if kind == "facts" {
        let action = q.data["action"].as_str().unwrap_or("");
        let incoming = arr(&q.data, "facts");
        let mut facts = arr(&project, "factLedger");
        if incoming.len() > 60 || !["stage", "confirm", "remove"].contains(&action) {
            return Err(AppError::validation("事实操作无效。"));
        }
        if action == "remove" {
            facts.retain(|v| v["id"] != q.data["id"]);
        }
        for mut fact in incoming {
            let ch = read(
                c,
                "chapters",
                Some(pid),
                fact["sourceChapterId"]
                    .as_str()
                    .ok_or_else(|| AppError::validation("事实来源缺失。"))?,
            )?;
            quote(&ch, &fact)?;
            if fact["sourceHash"] != hash(ch["content"].as_str().unwrap_or(""))
                || fact["id"].as_str().is_none_or(str::is_empty)
                || fact["fact"]
                    .as_str()
                    .is_none_or(|s| s.trim().is_empty() || s.chars().count() > 300)
                || fact["subject"]
                    .as_str()
                    .is_none_or(|s| s.trim().is_empty() || s.chars().count() > 100)
            {
                return Err(AppError::validation("事实依据已过期或字段无效。"));
            }
            let old = facts.iter().find(|v| v["id"] == fact["id"]);
            if action == "confirm"
                && old.is_none_or(|v| {
                    v["status"] != "pending"
                        || v["sourceHash"] != fact["sourceHash"]
                        || v["sourceChapterId"] != fact["sourceChapterId"]
                        || v["quote"] != fact["quote"]
                })
            {
                return Err(conflict(&project));
            }
            if action == "stage"
                && facts.iter().any(|v| {
                    v["sourceChapterId"] == fact["sourceChapterId"]
                        && v["sourceHash"] == fact["sourceHash"]
                        && v["fact"] == fact["fact"]
                })
            {
                continue;
            }
            fact["projectId"] = json!(pid);
            fact["sourceChapterOrder"] = ch["order"].clone();
            fact["status"] = json!(if action == "confirm" {
                "confirmed"
            } else {
                "pending"
            });
            facts.retain(|v| v["id"] != fact["id"]);
            facts.push(fact);
        }
        project["factLedger"] = json!(facts);
    } else {
        let mut topics = arr(&project, "topicCandidates");
        let selected = topics
            .iter()
            .find(|v| v["id"] == q.data["topicId"])
            .cloned()
            .ok_or_else(|| AppError::validation("题材候选不存在。"))?;
        project["synopsis"] = json!(
            [
                selected["oneLineHook"].as_str().unwrap_or(""),
                selected["longTermArc"].as_str().unwrap_or("")
            ]
            .join("\n")
            .trim()
        );
        for topic in &mut topics {
            topic["selected"] = json!(topic["id"] == q.data["topicId"]);
        }
        project["topicCandidates"] = json!(topics);
        let title = format!("题材起步：{}", selected["title"].as_str().unwrap_or(""));
        if !rows(c, "outlines", Some(pid))?
            .iter()
            .any(|v| v["title"] == title && v["type"] == "arc")
        {
            let parent = store(
                c,
                "outlines",
                Some(pid),
                json!({"id":uid(),"projectId":pid,"title":title,"type":"arc","parentId":null,"order":rows(c,"outlines",Some(pid))?.len()+1,"summary":selected["longTermArc"],"keyEvents":[],"characters":[],"createdAt":now()}),
            )?;
            for (index, step) in arr(&selected, "firstThreeChapters")
                .into_iter()
                .take(3)
                .enumerate()
            {
                store(
                    c,
                    "outlines",
                    Some(pid),
                    json!({"id":uid(),"projectId":pid,"title":format!("起步第{}章",index+1),"type":"chapter","parentId":parent["id"],"order":index+1,"summary":step,"keyEvents":[],"characters":[],"createdAt":now()}),
                )?;
            }
        }
    }
    store(c, "projects", None, project)
}
