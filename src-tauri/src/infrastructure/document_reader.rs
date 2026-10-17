use crate::contracts::*;
use calamine::{DataRef, Reader, Xlsx};
use pulldown_cmark::{Event as MdEvent, Options, Parser, Tag, TagEnd};
use quick_xml::{Reader as XmlReader, events::Event};
use std::{
    collections::{BTreeMap, HashSet},
    io::{Cursor, Read},
    path::Path,
};

pub const MAX_INPUT: u64 = 20 * 1024 * 1024;
const MAX_XML: u64 = 16 * 1024 * 1024;
const MAX_EXPANDED: u64 = 64 * 1024 * 1024;
const MAX_CELLS: usize = 200_000;
fn invalid() -> AppError {
    AppError::validation("文档损坏、加密或结构不受支持；原文件已保留，可用系统应用打开。")
}
fn limit() -> AppError {
    AppError::validation("文档超出读取容量限制；原文件已保留，可用系统应用打开。")
}
fn utf8(bytes: &[u8]) -> AppResult<&str> {
    std::str::from_utf8(bytes)
        .map(|s| s.trim_start_matches('\u{feff}'))
        .map_err(|_| invalid())
}
fn text_limit(s: &str) -> AppResult<()> {
    if s.len() > 32 * 1024 {
        Err(limit())
    } else {
        Ok(())
    }
}

// Validate every entry's actual expanded bytes before any Office parser reads it.
// Nothing is extracted to disk; relationships, embedded executables and network links are never followed.
fn package(bytes: &[u8], part: &str) -> AppResult<Vec<u8>> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if zip.len() > 4096 {
        return Err(limit());
    }
    let mut names = HashSet::new();
    let mut total = 0;
    let mut selected = None;
    for index in 0..zip.len() {
        let file = zip.by_index(index).map_err(|_| invalid())?;
        let name = file.name().to_owned();
        if file.enclosed_name().is_none() || !names.insert(name.clone()) || file.is_symlink() {
            return Err(invalid());
        }
        if file.size() > MAX_XML {
            return Err(limit());
        }
        let mut content = Vec::new();
        file.take(MAX_XML + 1)
            .read_to_end(&mut content)
            .map_err(|_| invalid())?;
        if content.len() as u64 > MAX_XML {
            return Err(limit());
        }
        total += content.len() as u64;
        if total > MAX_EXPANDED {
            return Err(limit());
        }
        if name == part {
            selected = Some(content);
        }
    }
    selected.ok_or_else(invalid)
}
pub fn read(bytes: &[u8], resource: &Resource, q: &ReadDocument) -> AppResult<DocumentView> {
    if bytes.len() as u64 > MAX_INPUT {
        return Err(limit());
    }
    let extension = Path::new(resource.original_name.as_deref().unwrap_or(""))
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut view = DocumentView {
        resource_id: resource.id.clone(),
        source_revision: resource.revision,
        format: extension.clone(),
        html: None,
        blocks: Vec::new(),
        block_count: 0,
        sheets: Vec::new(),
        table: None,
        warnings: Vec::new(),
    };
    match extension.as_str() {
        "md" | "markdown" => {
            if bytes.len() > 2 * 1024 * 1024 {
                return Err(limit());
            }
            view.html = Some(markdown_html(utf8(bytes)?));
            view.warnings.push(
                "只读 Markdown 排版；原始 HTML 显示为文字，链接和外部图片不自动打开或下载。".into(),
            );
        }
        "docx" => {
            let blocks = word(&package(bytes, "word/document.xml")?)?;
            view.block_count = blocks.len() as u32;
            view.blocks = blocks
                .into_iter()
                .skip(q.offset as usize)
                .take(q.limit as usize)
                .collect();
            view.warnings.push("只读正文与表格；不还原分页、字体、图片、合并单元格、页眉页脚、批注及完整修订排版。原文件保持完整。".into());
        }
        "xlsx" => {
            package(bytes, "xl/workbook.xml")?;
            let mut workbook = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
            view.sheets = workbook.sheet_names();
            if view.sheets.len() > 100 {
                return Err(limit());
            }
            let name = view
                .sheets
                .get(q.sheet_index as usize)
                .ok_or_else(invalid)?;
            let mut reader = workbook
                .worksheet_cells_reader(name)
                .map_err(|_| invalid())?;
            let mut cells = BTreeMap::new();
            let mut row_count = 0;
            let mut column_count = 0;
            let mut count = 0;
            while let Some(cell) = reader.next_cell_with_formula().map_err(|_| invalid())? {
                count += 1;
                if count > MAX_CELLS || cell.pos.0 >= 1_048_576 || cell.pos.1 >= 16_384 {
                    return Err(limit());
                }
                row_count = row_count.max(cell.pos.0 + 1);
                column_count = column_count.max(cell.pos.1 + 1);
                let value = excel_cell(cell.value, cell.formula)?;
                if cell.pos.0 >= q.offset
                    && cell.pos.0 < q.offset + q.limit
                    && cell.pos.1 >= q.column_offset
                    && cell.pos.1 < q.column_offset + q.column_limit
                {
                    cells.insert(cell.pos, value);
                }
            }
            view.table = Some(table_page(q, row_count, column_count, cells));
            view.warnings.push("只读单元格与公式文本；公式只展示文件内的缓存结果，不执行或重算。未缓存结果可能为空；不还原图表、合并与全部数字格式。".into());
        }
        "csv" | "tsv" => {
            let mut reader = csv::ReaderBuilder::new()
                .has_headers(false)
                .flexible(true)
                .delimiter(if extension == "tsv" { b'\t' } else { b',' })
                .from_reader(utf8(bytes)?.as_bytes());
            let mut cells = BTreeMap::new();
            let mut row_count = 0;
            let mut column_count = 0;
            let mut count = 0;
            for record in reader.records() {
                let record = record.map_err(|_| invalid())?;
                count += record.len();
                if count > MAX_CELLS || record.len() > 16_384 {
                    return Err(limit());
                }
                column_count = column_count.max(record.len() as u32);
                for (column, text) in record.iter().enumerate() {
                    text_limit(text)?;
                    if row_count >= q.offset
                        && row_count < q.offset + q.limit
                        && column as u32 >= q.column_offset
                        && (column as u32) < q.column_offset + q.column_limit
                    {
                        cells.insert(
                            (row_count, column as u32),
                            DocumentCell {
                                text: text.into(),
                                value_type: "text".into(),
                                formula: None,
                            },
                        );
                    }
                }
                row_count += 1;
                if row_count > 1_000_000 {
                    return Err(limit());
                }
            }
            view.table = Some(table_page(q, row_count, column_count, cells));
            view.sheets.push("数据".into());
            view.warnings.push(
                "UTF-8 只读表格；保留首行、空单元格及文字，不将等号开头的采集数据当作公式执行。"
                    .into(),
            );
        }
        _ => {
            return Err(AppError::validation(
                "支持 MD、DOCX、XLSX、CSV 和 TSV；旧 DOC/XLS 请先用 Office 转换或系统打开。",
            ));
        }
    }
    if serde_json::to_vec(&view).map_err(|_| invalid())?.len() > 4 * 1024 * 1024 {
        return Err(limit());
    }
    Ok(view)
}
fn empty_cell() -> DocumentCell {
    DocumentCell {
        text: String::new(),
        value_type: "empty".into(),
        formula: None,
    }
}
fn table_page(
    q: &ReadDocument,
    row_count: u32,
    column_count: u32,
    mut cells: BTreeMap<(u32, u32), DocumentCell>,
) -> TablePage {
    let rows = (q.offset..row_count.min(q.offset + q.limit))
        .map(|row| {
            (q.column_offset..column_count.min(q.column_offset + q.column_limit))
                .map(|column| cells.remove(&(row, column)).unwrap_or_else(empty_cell))
                .collect()
        })
        .collect();
    TablePage {
        row_count,
        column_count,
        row_offset: q.offset,
        column_offset: q.column_offset,
        rows,
    }
}
fn excel_cell(value: DataRef<'_>, formula: Option<String>) -> AppResult<DocumentCell> {
    let (text, kind) = match value {
        DataRef::String(s) => (s, "text"),
        DataRef::SharedString(s) => (s.into(), "text"),
        DataRef::Int(n) => (n.to_string(), "number"),
        DataRef::Float(n) => (n.to_string(), "number"),
        DataRef::Bool(v) => (v.to_string(), "boolean"),
        DataRef::Error(e) => (e.to_string(), "error"),
        DataRef::DateTime(d) => (
            d.as_datetime()
                .map(|v| v.to_string())
                .unwrap_or_else(|| d.to_string()),
            "date",
        ),
        DataRef::DateTimeIso(s) | DataRef::DurationIso(s) => (s, "date"),
        DataRef::Empty => (String::new(), "empty"),
    };
    text_limit(&text)?;
    if let Some(f) = &formula {
        text_limit(f)?;
    }
    Ok(DocumentCell {
        text,
        value_type: kind.into(),
        formula,
    })
}
fn word(bytes: &[u8]) -> AppResult<Vec<DocumentBlock>> {
    let mut reader = XmlReader::from_str(utf8(bytes)?);
    let mut blocks = Vec::new();
    let mut text = String::new();
    let mut level = 0;
    let mut in_text = false;
    let mut in_table = false;
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut cell = String::new();
    let mut depth = 0;
    let mut deleted = 0;
    let mut table_cells = 0;
    let mut root = false;
    let mut body = false;
    loop {
        match reader.read_event().map_err(|_| invalid())? {
            Event::Start(e) => {
                depth += 1;
                if depth > 64 {
                    return Err(limit());
                }
                if depth == 1 {
                    if e.local_name().as_ref() != b"document" || root {
                        return Err(invalid());
                    }
                    root = true;
                }
                match e.local_name().as_ref() {
                    b"body" => body = true,
                    b"del" => deleted += 1,
                    b"tbl" => {
                        if in_table {
                            return Err(invalid());
                        }
                        in_table = true;
                        rows.clear();
                        table_cells = 0;
                    }
                    b"tr" => row.clear(),
                    b"tc" => cell.clear(),
                    b"p" => {
                        text.clear();
                        level = 0;
                    }
                    b"t" => in_text = true,
                    _ => {}
                }
            }
            Event::Empty(e) => match e.local_name().as_ref() {
                b"body" => body = true,
                b"tab" => text.push('\t'),
                b"br" | b"cr" => text.push('\n'),
                b"pStyle" => {
                    for a in e.attributes() {
                        let a = a.map_err(|_| invalid())?;
                        if a.key.local_name().as_ref() == b"val" {
                            let style = a
                                .decoded_and_normalized_value(
                                    quick_xml::XmlVersion::Implicit1_0,
                                    reader.decoder(),
                                )
                                .map_err(|_| invalid())?;
                            level = style
                                .to_ascii_lowercase()
                                .strip_prefix("heading")
                                .and_then(|n| n.parse::<u8>().ok())
                                .filter(|n| (1..=6).contains(n))
                                .unwrap_or(0);
                        }
                    }
                }
                _ => {}
            },
            Event::Text(e) if in_text && deleted == 0 => {
                text.push_str(&e.xml10_content().map_err(|_| invalid())?);
                text_limit(&text)?;
            }
            Event::GeneralRef(e) if in_text && deleted == 0 => {
                if let Some(c) = e.resolve_char_ref().map_err(|_| invalid())? {
                    text.push(c);
                } else {
                    let name = e.decode().map_err(|_| invalid())?;
                    text.push_str(
                        quick_xml::escape::resolve_predefined_entity(&name).ok_or_else(invalid)?,
                    );
                }
            }
            Event::End(e) => {
                depth -= 1;
                match e.local_name().as_ref() {
                    b"del" => deleted -= 1,
                    b"t" => in_text = false,
                    b"p" => {
                        if in_table {
                            if !cell.is_empty() {
                                cell.push('\n');
                            }
                            cell.push_str(&text);
                            text_limit(&cell)?;
                        } else {
                            blocks.push(DocumentBlock::Paragraph {
                                text: text.clone(),
                                level,
                            });
                        }
                    }
                    b"tc" => {
                        table_cells += 1;
                        if table_cells > 5000 {
                            return Err(limit());
                        }
                        row.push(cell.clone());
                    }
                    b"tr" => rows.push(row.clone()),
                    b"tbl" => {
                        in_table = false;
                        blocks.push(DocumentBlock::Table {
                            rows: std::mem::take(&mut rows),
                        });
                    }
                    _ => {}
                }
            }
            Event::DocType(_) => return Err(invalid()),
            Event::Eof => break,
            _ => {}
        }
        if blocks.len() > 20_000 {
            return Err(limit());
        }
    }
    if depth != 0 || !root || !body {
        return Err(invalid());
    }
    Ok(blocks)
}

pub fn markdown_html(text: &str) -> String {
    let events = Parser::new_ext(
        text,
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS,
    )
    .map(|event| match event {
        MdEvent::Html(s) | MdEvent::InlineHtml(s) => MdEvent::Text(s),
        MdEvent::Start(Tag::Link { .. } | Tag::Image { .. }) => MdEvent::Start(Tag::Emphasis),
        MdEvent::End(TagEnd::Link | TagEnd::Image) => MdEvent::End(TagEnd::Emphasis),
        other => other,
    });
    let mut html = String::new();
    pulldown_cmark::html::push_html(&mut html, events);
    html
}
