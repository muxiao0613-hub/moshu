use super::*;
const GROUPS: [(&str, &str); 6] = [
    ("chapters", "chapters"),
    ("characters", "characters"),
    ("worldSettings", "world-settings"),
    ("outlines", "outlines"),
    ("threads", "plot-threads"),
    ("timeline", "timeline-events"),
];
pub(super) fn export(c: &Connection, pid: &str) -> AppResult<Value> {
    let mut result = json!({"version":5,"exportedAt":now(),"project":read(c,"projects",None,pid)?,"scope":"本地作品、历史及素材；完整空间备份另含恢复稿与偏好"});
    let mut versions = Vec::<Value>::new();
    for (key, kind) in GROUPS {
        result[key] = json!(rows(c, kind, Some(pid))?);
    }
    for chapter in result["chapters"].as_array().unwrap() {
        let mut s =
            c.prepare("SELECT data FROM mogao_studio_versions WHERE entity_id=?1 ORDER BY rowid")?;
        for row in s.query_map([chapter["id"].as_str()], |r| r.get::<_, String>(0))? {
            versions.push(
                serde_json::from_str(&row?)
                    .map_err(|_| AppError::validation("历史版本数据损坏。"))?,
            );
        }
    }
    result["versions"] = json!(versions);
    let adopted = result["worldSettings"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|v| v["tags"].as_array().into_iter().flatten())
        .filter_map(Value::as_str)
        .filter_map(|s| s.strip_prefix("素材:"))
        .collect::<std::collections::BTreeSet<_>>();
    result["materials"] = json!(
        rows(c, "materials", None)?
            .into_iter()
            .filter(|v| adopted.contains(v["id"].as_str().unwrap_or("")))
            .collect::<Vec<_>>()
    );
    Ok(result)
}
fn remap(value: &mut Value, ids: &std::collections::BTreeMap<String, String>, field: &str) {
    match value {
        Value::String(s) if field == "tags" && s.starts_with("素材:") => {
            if let Some(new) = ids.get(&s["素材:".len()..]) {
                *s = format!("素材:{new}");
            }
        }
        Value::String(s)
            if [
                "id",
                "projectId",
                "chapterId",
                "sourceChapterId",
                "parentId",
                "volumeId",
                "characterId",
                "referenceChapterId",
                "sourceChapterIds",
                "characters",
                "relatedCharacters",
                "relatedChapters",
                "characterIds",
            ]
            .contains(&field) =>
        {
            if let Some(new) = ids.get(s) {
                *s = new.clone();
            }
        }
        Value::Array(values) => {
            for v in values {
                remap(v, ids, field);
            }
        }
        Value::Object(map) => {
            for (key, v) in map {
                remap(v, ids, key);
            }
        }
        _ => {}
    }
}
pub(super) fn import(c: &Connection, input: &Value) -> AppResult<Value> {
    if ![1, 2, 3, 4, 5].contains(&input["version"].as_i64().unwrap_or(0))
        || !input["project"].is_object()
    {
        return Err(AppError::validation("不是受支持的 .mgao 作品备份。"));
    }
    let mut data = input.clone();
    let mut ids = std::collections::BTreeMap::new();
    let mut add = |v: &Value| -> AppResult<()> {
        let id = v["id"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| AppError::validation("备份条目 ID 缺失。"))?;
        if ids.insert(id.to_owned(), uid()).is_some() {
            return Err(AppError::validation("备份包含重复 ID。"));
        }
        Ok(())
    };
    add(&data["project"])?;
    for key in [
        "chapters",
        "characters",
        "worldSettings",
        "outlines",
        "threads",
        "timeline",
        "materials",
        "versions",
    ] {
        if let Some(list) = data.get(key) {
            let list = list
                .as_array()
                .ok_or_else(|| AppError::validation("备份条目格式无效。"))?;
            if list.len() > 20000 {
                return Err(AppError::validation("备份条目过多。"));
            }
            for v in list {
                add(v)?;
            }
        }
    }
    let old_pid = data["project"]["id"].as_str().unwrap().to_owned();
    for (key, _) in GROUPS {
        if let Some(list) = data[key].as_array() {
            for v in list {
                if v["projectId"] != old_pid {
                    return Err(AppError::validation("备份混入其他作品的数据。"));
                }
            }
        }
    }
    remap(&mut data, &ids, "");
    let pid = data["project"]["id"].as_str().unwrap().to_owned();
    data["project"]["createdAt"] = json!(now());
    data["project"]["isPublic"] = json!(false);
    if let Some(o) = data["project"].as_object_mut() {
        o.remove("userId");
        o.remove("user");
    }
    // Changed identities invalidate contextual review basis. Quotes/body hashes remain preserved.
    if let Some(issues) = data["project"]["revisionIssues"].as_array_mut() {
        for v in issues {
            v["state"] = json!("stale");
        }
    }
    validate_record("projects", &data["project"])?;
    store(c, "projects", None, data["project"].clone())?;
    for (key, kind) in GROUPS {
        if let Some(list) = data[key].as_array() {
            for row in list {
                let mut row = row.clone();
                if kind == "chapters" {
                    for key in ["continuity", "beatCard", "qualityReport"] {
                        if row[key].is_object()
                            && row[key]["sourceHash"] != hash(row["content"].as_str().unwrap_or(""))
                        {
                            row[key]["status"] = json!("stale");
                        }
                    }
                }
                if kind == "chapters"
                    && row["qualityReport"].is_object()
                    && !row["qualityReport"]["basisHash"].is_null()
                {
                    row["qualityReport"]["status"] = json!("stale");
                }
                validate_record(kind, &row)?;
                store(c, kind, Some(&pid), row)?;
            }
        }
    }
    if let Some(list) = data["versions"].as_array() {
        for row in list {
            let chapter = read(
                c,
                "chapters",
                Some(&pid),
                row["chapterId"]
                    .as_str()
                    .ok_or_else(|| AppError::validation("历史来源章缺失。"))?,
            )?;
            version(
                c,
                &chapter,
                row["content"]
                    .as_str()
                    .ok_or_else(|| AppError::validation("历史正文缺失。"))?,
                row["note"].as_str().unwrap_or("导入历史"),
            )?;
        }
    }
    if let Some(list) = data["materials"].as_array() {
        for row in list {
            validate_record("materials", row)?;
            store(c, "materials", None, row.clone())?;
        }
    }
    // Revalidate source-bound records against imported saved chapters, never certify broken evidence.
    for mut character in rows(c, "characters", Some(&pid))? {
        if let Some(memories) = character["lifeMemories"].as_array_mut() {
            for memory in memories {
                let chapter = read(
                    c,
                    "chapters",
                    Some(&pid),
                    memory["chapterId"].as_str().unwrap_or(""),
                );
                if chapter.as_ref().map_or(true, |ch| {
                    memory["sourceHash"] != hash(ch["content"].as_str().unwrap_or(""))
                        || memory["claims"].as_array().is_none_or(|claims| {
                            claims.iter().any(|v| {
                                v["quote"].as_str().is_none_or(|s| {
                                    s.is_empty()
                                        || !super::sources::plain(
                                            ch["content"].as_str().unwrap_or(""),
                                        )
                                        .contains(s)
                                })
                            })
                        })
                }) {
                    memory["status"] = json!("stale");
                }
            }
        }
        store(c, "characters", Some(&pid), character)?;
    }
    let mut project = read(c, "projects", None, &pid)?;
    if let Some(facts) = project["factLedger"].as_array_mut() {
        for fact in facts {
            let chapter = read(
                c,
                "chapters",
                Some(&pid),
                fact["sourceChapterId"].as_str().unwrap_or(""),
            );
            if chapter.as_ref().map_or(true, |ch| {
                fact["sourceHash"] != hash(ch["content"].as_str().unwrap_or(""))
                    || fact["quote"].as_str().is_none_or(|q| {
                        q.trim().is_empty()
                            || !super::sources::plain(ch["content"].as_str().unwrap_or(""))
                                .contains(q)
                    })
            }) {
                fact["status"] = json!("stale");
            }
        }
    }
    project = store(c, "projects", None, project)?;
    project["restoredIds"] = json!(ids);
    Ok(project)
}
pub(super) fn import_materials(c: &Connection, data: &Value) -> AppResult<Value> {
    let list = data
        .as_array()
        .or_else(|| data["materials"].as_array())
        .ok_or_else(|| AppError::validation("素材包须为列表。"))?;
    if list.len() > 2000 {
        return Err(AppError::validation("单次最多导入 2000 条素材。"));
    }
    for v in list {
        let mut v = v.clone();
        v["id"] = json!(uid());
        v["createdAt"] = json!(now());
        validate_record("materials", &v)?;
        store(c, "materials", None, v)?;
    }
    Ok(json!({"count":list.len()}))
}
