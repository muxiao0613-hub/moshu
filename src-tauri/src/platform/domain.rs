use crate::contracts::{AppError, AppResult};
use serde_json::Value;

pub const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
pub fn id(value: &str) -> AppResult<()> {
    uuid::Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| AppError::validation("标识格式无效。"))
}
pub fn title(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 200 || value.contains('\0') {
        return Err(AppError::validation("名称须为 1 至 200 个字符。"));
    }
    Ok(value.into())
}
pub fn description(value: &str) -> AppResult<()> {
    if value.len() > 32_768 || value.contains('\0') {
        return Err(AppError::validation("说明超过长度限制或包含无效字符。"));
    }
    Ok(())
}
pub fn revision(value: i64) -> AppResult<()> {
    if value < 1 || value as u64 >= MAX_SAFE_INTEGER {
        return Err(AppError::validation("基准版本无效。"));
    }
    Ok(())
}
pub fn pagination(offset: u32, limit: u32) -> AppResult<()> {
    if !(1..=100).contains(&limit) || offset > 1_000_000 {
        return Err(AppError::validation("分页范围无效。"));
    }
    Ok(())
}
pub fn optional_id(value: &Option<String>) -> AppResult<()> {
    if let Some(value) = value {
        id(value)?;
    }
    Ok(())
}
pub fn tags(values: &[String]) -> AppResult<Vec<String>> {
    if values.len() > 20 {
        return Err(AppError::validation("最多添加 20 个标签。"));
    }
    let mut result = Vec::new();
    for value in values {
        let value = value.trim();
        if value.is_empty() || value.chars().count() > 40 || value.chars().any(char::is_control) {
            return Err(AppError::validation("标签须为 1 至 40 个字符。"));
        }
        if !result
            .iter()
            .any(|existing: &String| existing.to_lowercase() == value.to_lowercase())
        {
            result.push(value.to_owned());
        }
    }
    Ok(result)
}
pub fn keyword(value: &str) -> AppResult<()> {
    if value.chars().count() > 200 || value.contains('\0') {
        return Err(AppError::validation("筛选文字过长或无效。"));
    }
    Ok(())
}
pub fn web_url(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.len() > 2048 || value.chars().any(char::is_control) {
        return Err(AppError::validation("链接无效或过长。"));
    }
    let parsed = url::Url::parse(value)
        .map_err(|_| AppError::validation("请输入完整的 HTTP 或 HTTPS 链接。"))?;
    if !["http", "https"].contains(&parsed.scheme())
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(AppError::validation(
            "只支持不含凭据的 HTTP 或 HTTPS 链接。",
        ));
    }
    Ok(parsed.into())
}

// Only editor nodes in our schema are persisted. Plain text is derived here, never trusted from UI.
pub fn document(body: &Value, schema_version: u32) -> AppResult<String> {
    if schema_version != 1
        || serde_json::to_vec(body)
            .map_err(|_| AppError::validation("正文格式无效。"))?
            .len()
            > 2_097_152
    {
        return Err(AppError::validation("正文格式版本不受支持或超过 2 MB。"));
    }
    if body.get("type").and_then(Value::as_str) != Some("doc") {
        return Err(AppError::validation("正文必须为编辑器文档。"));
    }
    let mut text = String::new();
    let mut count = 0;
    walk(body, 0, &mut count, &mut text)?;
    Ok(text.trim_end_matches('\n').into())
}
fn walk(node: &Value, depth: u32, count: &mut u32, text: &mut String) -> AppResult<()> {
    *count += 1;
    if depth > 32 || *count > 100_000 {
        return Err(AppError::validation("正文结构过深或过大。"));
    }
    let object = node
        .as_object()
        .ok_or_else(|| AppError::validation("正文节点无效。"))?;
    if object
        .keys()
        .any(|key| !["type", "content", "text", "marks", "attrs"].contains(&key.as_str()))
    {
        return Err(AppError::validation("正文包含不支持的字段。"));
    }
    let kind = node
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::validation("正文节点类型缺失。"))?;
    if ![
        "doc",
        "paragraph",
        "text",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "blockquote",
        "hardBreak",
        "horizontalRule",
    ]
    .contains(&kind)
        || (kind == "doc" && depth != 0)
    {
        return Err(AppError::validation("正文包含不支持的节点。"));
    }
    if let Some(attrs) = node.get("attrs") {
        let attrs = attrs
            .as_object()
            .ok_or_else(|| AppError::validation("正文属性无效。"))?;
        for (key, value) in attrs {
            let valid = match (kind, key.as_str()) {
                ("heading", "level") => value.as_u64().is_some_and(|v| (1..=6).contains(&v)),
                ("orderedList", "start") => value.as_u64().is_some_and(|v| v > 0 && v <= 1_000_000),
                ("orderedList", "type") => {
                    value.is_null()
                        || value
                            .as_str()
                            .is_some_and(|v| ["1", "a", "A", "i", "I"].contains(&v))
                }
                _ => false,
            };
            if !valid {
                return Err(AppError::validation("正文属性不受支持。"));
            }
        }
    }
    if let Some(marks) = node.get("marks") {
        let marks = marks
            .as_array()
            .ok_or_else(|| AppError::validation("正文格式无效。"))?;
        if kind != "text" || marks.len() > 6 {
            return Err(AppError::validation("正文格式位置无效。"));
        }
        for mark in marks {
            let obj = mark
                .as_object()
                .ok_or_else(|| AppError::validation("正文格式无效。"))?;
            let mark_type = mark.get("type").and_then(Value::as_str).unwrap_or("");
            if !["bold", "italic", "strike", "underline", "link"].contains(&mark_type)
                || obj.keys().any(|k| k != "type" && k != "attrs")
            {
                return Err(AppError::validation("正文格式不受支持。"));
            }
            if mark_type == "link" {
                let attrs = mark
                    .get("attrs")
                    .and_then(Value::as_object)
                    .ok_or_else(|| AppError::validation("链接格式无效。"))?;
                let href = attrs.get("href").and_then(Value::as_str).unwrap_or("");
                web_url(href)?;
                if !(href.starts_with("https://") || href.starts_with("http://"))
                    || href.len() > 2048
                    || href.chars().any(char::is_control)
                    || attrs
                        .keys()
                        .any(|k| !["href", "target", "rel", "class", "title"].contains(&k.as_str()))
                    || attrs
                        .iter()
                        .any(|(k, v)| k != "href" && !v.is_null() && !v.is_string())
                {
                    return Err(AppError::validation("正文链接仅支持 HTTP 或 HTTPS。"));
                }
            } else if obj
                .get("attrs")
                .is_some_and(|v| !v.as_object().is_some_and(|a| a.is_empty()))
            {
                return Err(AppError::validation("正文格式属性无效。"));
            }
        }
    }
    if kind == "text" {
        if node.get("content").is_some() {
            return Err(AppError::validation("文本节点不能包含子节点。"));
        }
        let value = node
            .get("text")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::validation("文本节点内容缺失。"))?;
        if value.is_empty() || value.contains('\0') {
            return Err(AppError::validation("正文包含无效字符。"));
        }
        text.push_str(value);
    } else {
        if node.get("text").is_some() {
            return Err(AppError::validation("非文本节点包含文本字段。"));
        }
        let children = node
            .get("content")
            .map(|value| {
                value
                    .as_array()
                    .ok_or_else(|| AppError::validation("正文子节点无效。"))
            })
            .transpose()?;
        if ["hardBreak", "horizontalRule"].contains(&kind) && children.is_some() {
            return Err(AppError::validation("叶节点不能包含子节点。"));
        }
        if ["doc", "bulletList", "orderedList", "listItem", "blockquote"].contains(&kind)
            && children.is_none_or(|values| values.is_empty())
        {
            return Err(AppError::validation("正文容器不能为空。"));
        }
        if let Some(children) = children {
            for (index, child) in children.iter().enumerate() {
                let child_type = child.get("type").and_then(Value::as_str).unwrap_or("");
                let allowed = match kind {
                    "paragraph" | "heading" => ["text", "hardBreak"].contains(&child_type),
                    "bulletList" | "orderedList" => child_type == "listItem",
                    "listItem" if index == 0 => child_type == "paragraph",
                    "doc" | "listItem" | "blockquote" => [
                        "paragraph",
                        "heading",
                        "bulletList",
                        "orderedList",
                        "blockquote",
                        "horizontalRule",
                    ]
                    .contains(&child_type),
                    _ => false,
                };
                if !allowed {
                    return Err(AppError::validation("正文子节点位置无效。"));
                }
                walk(child, depth + 1, count, text)?;
            }
        }
        if ["paragraph", "heading", "hardBreak"].contains(&kind) {
            text.push('\n');
        }
    }
    Ok(())
}

pub fn calendar_date(value: &str) -> AppResult<()> {
    if value.len() != 10
        || value.starts_with("0000-")
        || chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .ok()
            .is_none_or(|date| date.format("%Y-%m-%d").to_string() != value)
    {
        return Err(AppError::validation(
            "截止日期须为有效的 YYYY-MM-DD 本地日历日期。",
        ));
    }
    Ok(())
}

pub fn sequence(value: u64) -> AppResult<()> {
    if value > MAX_SAFE_INTEGER {
        Err(AppError::validation("编辑序号无效。"))
    } else {
        Ok(())
    }
}

pub fn personal_preferences(p: &crate::contracts::Preferences) -> AppResult<()> {
    if !["light", "dark", "system"].contains(&p.theme.as_str())
        || !(14..=24).contains(&p.font_size)
        || p.nickname.trim().is_empty()
        || p.nickname.chars().count() > 40
    {
        return Err(AppError::validation("主题、字号或昵称无效。"));
    }
    optional_id(&p.avatar_resource_id)?;
    let defaults = crate::contracts::Preferences::default();
    let mut nav = p.navigation.clone();
    nav.sort();
    let mut expected = defaults.navigation;
    expected.sort();
    if nav != expected {
        return Err(AppError::validation("导航必须包含所有基础入口且不可重复。"));
    }
    let check = |values: &[String], allowed: &[&str]| -> AppResult<()> {
        let unique = values.iter().collect::<std::collections::BTreeSet<_>>();
        if unique.len() != values.len() || values.iter().any(|s| !allowed.contains(&s.as_str())) {
            return Err(AppError::validation("入口或首页区域无效。"));
        }
        Ok(())
    };
    check(&p.home_sections, &["projects", "notes", "tasks", "modules"])?;
    check(
        &p.pinned,
        &[
            "home",
            "projects",
            "resources",
            "notes",
            "tasks",
            "search",
            "modules",
            "trash",
            "settings",
            "help",
        ],
    )?;
    if p.shortcuts.len() != 3 {
        return Err(AppError::validation("快捷键动作不完整。"));
    }
    let mut seen = std::collections::BTreeSet::new();
    for action in ["search", "newNote", "save"] {
        let key = p
            .shortcuts
            .get(action)
            .ok_or_else(|| AppError::validation("快捷键动作缺失。"))?;
        if key.len() != 1
            || !key.chars().all(|c| c.is_ascii_uppercase())
            || ["A", "C", "V", "X", "Z", "Y", "Q", "W", "H", "M", "O", "P"].contains(&key.as_str())
            || !seen.insert(key)
        {
            return Err(AppError::validation(
                "快捷键重复或与编辑器/系统常用动作冲突。",
            ));
        }
    }
    Ok(())
}
