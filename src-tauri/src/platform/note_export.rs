use serde_json::Value;
pub fn escape(text: &str) -> String {
    let mut out = String::new();
    for c in text.chars() {
        match c {
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '&' => out.push_str("&amp;"),
            '\\' | '*' | '_' | '[' | ']' | '#' | '~' | '`' | '!' | '|' | '-' | '+' | '.' | ')' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out
}
pub fn render(node: &Value) -> String {
    let kind = node["type"].as_str().unwrap_or("");
    let children: Vec<String> = node["content"]
        .as_array()
        .map(|a| a.iter().map(render).collect())
        .unwrap_or_default();
    match kind {
        "text" => {
            let mut text = escape(node["text"].as_str().unwrap_or(""));
            if let Some(marks) = node["marks"].as_array() {
                for mark in marks {
                    text = match mark["type"].as_str().unwrap_or("") {
                        "bold" => format!("**{text}**"),
                        "italic" => format!("*{text}*"),
                        "strike" => format!("~~{text}~~"),
                        "link" => {
                            let url = mark["attrs"]["href"]
                                .as_str()
                                .unwrap_or("")
                                .replace('<', "%3C")
                                .replace('>', "%3E")
                                .replace(' ', "%20");
                            format!("[{text}](<{url}>)")
                        }
                        _ => text,
                    };
                }
            }
            text
        }
        "doc" | "listItem" => children.join("\n\n"),
        "paragraph" => children.concat(),
        "heading" => format!(
            "{} {}",
            "#".repeat(node["attrs"]["level"].as_u64().unwrap_or(2).clamp(1, 6) as usize),
            children.concat()
        ),
        "hardBreak" => "  \n".into(),
        "horizontalRule" => "---".into(),
        "blockquote" => children
            .join("\n\n")
            .lines()
            .map(|s| format!("> {s}"))
            .collect::<Vec<_>>()
            .join("\n"),
        "bulletList" | "orderedList" => {
            let start = node["attrs"]["start"].as_u64().unwrap_or(1);
            children
                .iter()
                .enumerate()
                .map(|(i, s)| {
                    let prefix = if kind == "bulletList" {
                        "- ".into()
                    } else {
                        format!("{}. ", start.saturating_add(i as u64))
                    };
                    let indent = " ".repeat(prefix.len());
                    let mut lines = s.split('\n');
                    format!(
                        "{}{}{}",
                        prefix,
                        lines.next().unwrap_or(""),
                        lines
                            .map(|line| format!("\n{indent}{line}"))
                            .collect::<String>()
                    )
                })
                .collect::<Vec<_>>()
                .join("\n")
        }
        _ => children.concat(),
    }
}
