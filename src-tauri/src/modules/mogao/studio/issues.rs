use super::*;
fn pick(v: &Value, fields: &str) -> Value {
    let arrays = "aliases relationships voiceSamples lifeMemories profileVersions styleSamples factLedger tags relatedChapters relatedCharacters";
    Value::Object(
        fields
            .split_whitespace()
            .map(|k| {
                let default = if arrays.split_whitespace().any(|f| f == k) {
                    json!([])
                } else if ["storyBible", "styleFingerprint"].contains(&k) {
                    Value::Null
                } else if k == "role" {
                    json!("minor")
                } else {
                    json!("")
                };
                (
                    k.to_owned(),
                    v.get(k)
                        .filter(|v| !v.is_null())
                        .cloned()
                        .unwrap_or(default),
                )
            })
            .collect(),
    )
}
fn basis(c: &Connection, pid: &str, project: &Value) -> AppResult<String> {
    let group = |kind: &str, fields: &str| -> AppResult<Value> {
        let mut values = rows(c, kind, Some(pid))?;
        values.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
        Ok(json!(
            values.iter().map(|v| pick(v, fields)).collect::<Vec<_>>()
        ))
    };
    Ok(hash(&json!({"project":pick(project,"id title genre synopsis targetPlatform qualityGoal styleFingerprint styleSamples storyBible factLedger"),
  "characters":group("characters","id name aliases role age gender appearance personality goals background abilities arc notes relationships voiceSamples lifeMemories profileVersions")?,
  "worldSettings":group("world-settings","id category title content tags")?,
  "threads":group("plot-threads","id title description status importance notes relatedChapters relatedCharacters")?}).to_string()))
}
fn chapter_hash(ch: &Value, source: &str) -> String {
    if source == "pacing" {
        hash(
            &json!([
                ch["order"],
                ch["title"],
                ch["pacingTag"],
                ch["conflictType"]
            ])
            .to_string(),
        )
    } else {
        hash(ch["content"].as_str().unwrap_or(""))
    }
}
fn book_hash(chapters: &[Value], source: &str) -> String {
    let mut chapters = chapters.to_vec();
    chapters.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    hash(
        &json!(
            chapters
                .iter()
                .map(|ch| json!([ch["id"], ch["order"], chapter_hash(ch, source)]))
                .collect::<Vec<_>>()
        )
        .to_string(),
    )
}
fn current(issue: &Value, chapters: &[Value], basis: &str) -> bool {
    let source = issue["source"].as_str().unwrap_or("");
    let Some(ch) = chapters.iter().find(|v| v["id"] == issue["chapterId"]) else {
        return false;
    };
    issue["sourceHash"] == chapter_hash(ch, source)
        && (issue["bookHash"].is_null() || issue["bookHash"] == book_hash(chapters, source))
        && (!["consistency", "review"].contains(&source) || issue["basisHash"] == basis)
        && (issue["state"] == "resolved"
            || issue["referenceChapterId"].is_null()
            || chapters.iter().any(|v| {
                v["id"] == issue["referenceChapterId"]
                    && issue["referenceHash"] == hash(v["content"].as_str().unwrap_or(""))
            }))
}
pub(super) fn issues(
    c: &Connection,
    pid: &str,
    q: &StudioRequest,
    mut project: Value,
) -> AppResult<Value> {
    let basis = basis(c, pid, &project)?;
    let chapters = rows(c, "chapters", Some(pid))?;
    let mut existing = project["revisionIssues"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    if q.method == "POST" {
        if q.data["action"] == "state" {
            let issue = existing
                .iter_mut()
                .find(|v| v["id"] == q.data["id"])
                .ok_or_else(|| AppError::validation("问题不存在。"))?;
            if !current(issue, &chapters, &basis)
                || issue["state"] == "resolved"
                || !["open", "handled", "dismissed"]
                    .contains(&q.data["state"].as_str().unwrap_or(""))
            {
                return Err(AppError::new(
                    ErrorCode::Conflict,
                    "问题依据已更新，请重新检查。",
                    false,
                ));
            }
            issue["state"] = q.data["state"].clone();
            issue["decisionAt"] = json!(now());
        } else if q.data["action"] == "replace" {
            let source = q.data["source"].as_str().unwrap_or("");
            let scope = q.data["scope"]
                .as_object()
                .ok_or_else(|| AppError::validation("检查范围缺失。"))?;
            let incoming = q.data["issues"]
                .as_array()
                .ok_or_else(|| AppError::validation("检查结果格式无效。"))?;
            if !["consistency", "pacing", "review", "ai-flavor"].contains(&source)
                || incoming.len() > 2000
            {
                return Err(AppError::validation("检查来源或数量无效。"));
            }
            if (["consistency", "pacing"].contains(&source) && scope.len() != chapters.len())
                || (["consistency", "review"].contains(&source) && q.data["basisHash"] != basis)
            {
                return Err(AppError::new(
                    ErrorCode::Conflict,
                    "检查期间作品或设定已改变，请重新检查。",
                    false,
                ));
            }
            for (id, h) in scope {
                if !chapters
                    .iter()
                    .any(|ch| ch["id"] == *id && *h == chapter_hash(ch, source))
                {
                    return Err(AppError::new(
                        ErrorCode::Conflict,
                        "检查期间正文已更新。",
                        false,
                    ));
                }
            }
            let mut next = Vec::new();
            for value in incoming {
                let ch = chapters
                    .iter()
                    .find(|ch| {
                        ch["id"] == value["chapterId"]
                            && scope.contains_key(ch["id"].as_str().unwrap_or(""))
                    })
                    .ok_or_else(|| AppError::validation("问题来源不在检查范围。"))?;
                let problem = value["problem"]
                    .as_str()
                    .filter(|s| !s.trim().is_empty())
                    .ok_or_else(|| AppError::validation("问题说明缺失。"))?;
                if let Some(quote) = value["quote"].as_str()
                    && !super::sources::plain(ch["content"].as_str().unwrap_or("")).contains(quote)
                {
                    return Err(AppError::validation("问题逐字引用无效。"));
                }
                let key = hash(
                    &json!([
                        source,
                        ch["id"],
                        value["type"],
                        value.get("quote").unwrap_or(&value["location"]),
                        problem
                    ])
                    .to_string(),
                );
                let old = existing.iter().find(|v| v["key"] == key);
                let mut issue = value.clone();
                issue["key"] = json!(key);
                issue["id"] = old.map(|v| v["id"].clone()).unwrap_or_else(|| json!(uid()));
                issue["source"] = json!(source);
                issue["sourceHash"] = json!(chapter_hash(ch, source));
                issue["checkedAt"] = json!(now());
                issue["coverage"] = q.data["coverage"].clone();
                issue["state"] = if old.is_some_and(|v| {
                    current(v, &chapters, &basis)
                        && ["handled", "dismissed"].contains(&v["state"].as_str().unwrap_or(""))
                }) {
                    old.unwrap()["state"].clone()
                } else {
                    json!("open")
                };
                if ["consistency", "review"].contains(&source) {
                    issue["basisHash"] = json!(basis);
                }
                if ["consistency", "pacing"].contains(&source) {
                    issue["bookHash"] = json!(book_hash(&chapters, source));
                }
                if let Some(id) = value["referenceChapterId"].as_str() {
                    let r = chapters
                        .iter()
                        .find(|v| v["id"] == id)
                        .ok_or_else(|| AppError::validation("对照章节不存在。"))?;
                    if value["referenceQuote"].as_str().is_none_or(|s| {
                        s.is_empty()
                            || !super::sources::plain(r["content"].as_str().unwrap_or(""))
                                .contains(s)
                    }) {
                        return Err(AppError::validation("对照引用无效。"));
                    }
                    issue["referenceHash"] = json!(hash(r["content"].as_str().unwrap_or("")));
                }
                next.push(issue);
            }
            existing.retain(|v| !next.iter().any(|n| n["key"] == v["key"]));
            for old in &mut existing {
                if old["source"] == source
                    && scope.contains_key(old["chapterId"].as_str().unwrap_or(""))
                {
                    old["state"] = json!("resolved");
                    old["sourceHash"] = scope[old["chapterId"].as_str().unwrap()].clone();
                    old["basisHash"] = json!(basis);
                    old["bookHash"] = json!(book_hash(&chapters, source));
                }
            }
            existing.extend(next);
        } else {
            return Err(AppError::validation("问题操作无效。"));
        }
        project["revisionIssues"] = json!(existing);
        store(c, "projects", None, project)?;
    } else if q.method != "GET" {
        return Err(AppError::validation("问题操作无效。"));
    }
    for issue in &mut existing {
        if !current(issue, &chapters, &basis) {
            issue["state"] = json!("stale");
        }
    }
    Ok(json!({"basisHash":basis,"issues":existing}))
}
