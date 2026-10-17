use moshub_lib::{
    contracts::*,
    infrastructure::database::Database,
    platform::service::{GeneratedArtifact, PlatformService},
};
use std::{
    io::{Cursor, Write},
    path::Path,
};
use tempfile::TempDir;
fn request() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn query(r: &Resource) -> ReadDocument {
    ReadDocument {
        request_id: request(),
        id: r.id.clone(),
        base_revision: r.revision,
        offset: 0,
        limit: 50,
        sheet_index: 0,
        column_offset: 0,
        column_limit: 10,
    }
}
fn package(parts: &[(&str, &str)]) -> Vec<u8> {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    if let Some((part, _)) = parts
        .iter()
        .find(|(part, _)| matches!(*part, "xl/workbook.xml" | "word/document.xml"))
    {
        zip.start_file("_rels/.rels", zip::write::SimpleFileOptions::default())
            .unwrap();
        write!(zip,r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="{part}"/></Relationships>"#).unwrap();
    }
    for (name, content) in parts {
        zip.start_file(
            *name,
            zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated),
        )
        .unwrap();
        zip.write_all(content.as_bytes()).unwrap();
    }
    zip.finish().unwrap().into_inner()
}
fn docx() -> Vec<u8> {
    package(&[
        (
            "[Content_Types].xml",
            r#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#,
        ),
        (
            "word/document.xml",
            r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>中文文档 &amp; 表格</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">保留 空白</w:t><w:br/><w:t>第二行</w:t></w:r><w:del><w:r><w:t>删除旧字</w:t></w:r></w:del></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>名称</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>数量</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>春风</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>3</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>结束 &#x1F331;</w:t></w:r></w:p></w:body></w:document>"#,
        ),
    ])
}
fn xlsx() -> Vec<u8> {
    package(&[
        (
            "[Content_Types].xml",
            r#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>"#,
        ),
        (
            "xl/workbook.xml",
            r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="采集结果" sheetId="1" r:id="rId1"/><sheet name="说明" sheetId="2" r:id="rId2"/></sheets></workbook>"#,
        ),
        (
            "xl/_rels/workbook.xml.rels",
            r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>"#,
        ),
        (
            "xl/styles.xml",
            r#"<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>"#,
        ),
        (
            "xl/worksheets/sheet1.xml",
            r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:L52"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>名称</t></is></c><c r="B1" t="inlineStr"><is><t>数值</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>中文采集数据</t></is></c><c r="B2"><v>3.5</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" t="e"><v>#DIV/0!</v></c><c r="E2" s="1"><v>43831</v></c><c r="F2"><f>SUM(B2,2)</f><v>5.5</v></c><c r="G2"><f>1+2</f></c><c r="L2" t="inlineStr"><is><t>第十二列</t></is></c></row><row r="52"><c r="A52" t="inlineStr"><is><t>第五十二行</t></is></c></row></sheetData></worksheet>"#,
        ),
        (
            "xl/worksheets/sheet2.xml",
            r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>第二张工作表</t></is></c></row></sheetData></worksheet>"#,
        ),
    ])
}
async fn import(s: &PlatformService, dir: &Path, name: &str, bytes: &[u8]) -> Resource {
    let path = dir.join(name);
    std::fs::write(&path, bytes).unwrap();
    s.import_file(
        ImportFile {
            request_id: request(),
            folder_id: None,
            project_id: None,
        },
        &path,
    )
    .await
    .unwrap()
}
#[tokio::test]
async fn markdown_and_word_read_real_managed_files_without_changing_originals() {
    let dir = TempDir::new().unwrap();
    let files = TempDir::new().unwrap();
    let s = PlatformService::new(Database::open(dir.path()).unwrap());
    let md=import(&s,files.path(),"阅读.MD","# 中文标题\n\n**强调**\n\n|名称|数量|\n|---|---|\n|春风|3|\n\n<script>alert(1)</script>\n\n![外图](https://example.com/image.png) [危险](javascript:alert(1))".as_bytes()).await;
    let view = s.read_document(query(&md)).await.unwrap();
    let html = view.html.unwrap();
    assert!(html.contains("<h1>中文标题</h1>"));
    assert!(html.contains("<strong>强调</strong>"));
    assert!(html.contains("<table>"));
    assert!(!html.contains("<script>"));
    assert!(!html.contains("<img"));
    assert!(!html.contains("href="));
    let bytes = docx();
    let word = import(&s, files.path(), "中文文档.docx", &bytes).await;
    let view = s.read_document(query(&word)).await.unwrap();
    assert_eq!(view.block_count, 4);
    match &view.blocks[0] {
        DocumentBlock::Paragraph { text, level } => {
            assert_eq!(text, "中文文档 & 表格");
            assert_eq!(*level, 1);
        }
        _ => panic!("wrong block"),
    }
    match &view.blocks[1] {
        DocumentBlock::Paragraph { text, .. } => assert_eq!(text, "保留 空白\n第二行"),
        _ => panic!("wrong block"),
    }
    match &view.blocks[2] {
        DocumentBlock::Table { rows } => {
            assert_eq!(rows, &vec![vec!["名称", "数量"], vec!["春风", "3"]])
        }
        _ => panic!("wrong block"),
    }
    let mut q = query(&word);
    q.offset = 3;
    q.limit = 1;
    assert_eq!(s.read_document(q).await.unwrap().blocks.len(), 1);
    let out = files.path().join("副本.docx");
    s.export_file(
        IdRequest {
            request_id: request(),
            id: word.id.clone(),
        },
        out.clone(),
    )
    .await
    .unwrap();
    assert_eq!(std::fs::read(out).unwrap(), bytes);
    drop(s);
    let s = PlatformService::new(Database::open(dir.path()).unwrap());
    assert_eq!(
        s.read_document(query(&word)).await.unwrap().source_revision,
        1
    );
}
#[tokio::test]
async fn excel_streaming_keeps_sheet_coordinates_types_dates_cached_and_uncached_formulas() {
    use calamine::Reader;
    let mut fixture = calamine::Xlsx::new(Cursor::new(xlsx())).unwrap();
    let mut cells = fixture.worksheet_cells_reader("采集结果").unwrap();
    while cells.next_cell_with_formula().unwrap().is_some() {}
    let dir = TempDir::new().unwrap();
    let files = TempDir::new().unwrap();
    let s = PlatformService::new(Database::open(dir.path()).unwrap());
    let r = import(&s, files.path(), "采集结果.xlsx", &xlsx()).await;
    let view = s.read_document(query(&r)).await.unwrap();
    assert_eq!(view.sheets, vec!["采集结果", "说明"]);
    let t = view.table.unwrap();
    assert_eq!((t.row_count, t.column_count), (52, 12));
    assert_eq!(t.rows[1][0].text, "中文采集数据");
    assert_eq!(t.rows[1][1].text, "3.5");
    assert_eq!(t.rows[1][2].value_type, "boolean");
    assert_eq!(t.rows[1][3].value_type, "error");
    assert!(t.rows[1][4].text.starts_with("2020-01-01"));
    assert_eq!(t.rows[1][5].text, "5.5");
    assert_eq!(t.rows[1][5].formula.as_deref(), Some("SUM(B2,2)"));
    assert_eq!(t.rows[1][6].formula.as_deref(), Some("1+2"));
    assert_eq!(t.rows[1][6].text, "");
    let mut q = query(&r);
    q.column_offset = 10;
    let t = s.read_document(q).await.unwrap().table.unwrap();
    assert_eq!(t.rows[1][1].text, "第十二列");
    let mut q = query(&r);
    q.offset = 50;
    assert_eq!(
        s.read_document(q).await.unwrap().table.unwrap().rows[1][0].text,
        "第五十二行"
    );
    let mut q = query(&r);
    q.sheet_index = 1;
    assert_eq!(
        s.read_document(q).await.unwrap().table.unwrap().rows[0][0].text,
        "第二张工作表"
    );
}
#[tokio::test]
async fn csv_and_generated_artifacts_keep_source_owner_bytes_and_literal_formula_data() {
    let dir = TempDir::new().unwrap();
    let db = Database::open(dir.path()).unwrap();
    let s = PlatformService::new(db.clone());
    let project = s
        .create_project(CreateProject {
            request_id: request(),
            name: "数据项目".into(),
            description: String::new(),
        })
        .await
        .unwrap();
    let bytes="\u{feff}名称,网址,数量\r\n\"中文,名称\",https://example.com/,2\r\n\"跨\n行\",,=HYPERLINK(测试)\r\n".as_bytes().to_vec();
    let r = s
        .publish_generated_artifact(GeneratedArtifact {
            filename: "模块生成.csv".into(),
            bytes: bytes.clone(),
            source: "采集模块 · https://example.com/ · 2026-10-11".into(),
            description: "生成结果".into(),
            folder_id: None,
            project_id: Some(project.id.clone()),
        })
        .await
        .unwrap();
    assert_eq!(r.project_ids, vec![project.id]);
    assert!(r.source.contains("https://example.com/"));
    let t = s.read_document(query(&r)).await.unwrap().table.unwrap();
    assert_eq!(t.rows[1][0].text, "中文,名称");
    assert_eq!(t.rows[2][0].text, "跨\n行");
    assert_eq!(t.rows[2][2].text, "=HYPERLINK(测试)");
    assert_eq!(t.rows[2][2].formula, None);
    let exported = TempDir::new().unwrap();
    let output = exported.path().join("原格式.csv");
    s.export_file(
        IdRequest {
            request_id: request(),
            id: r.id.clone(),
        },
        output.clone(),
    )
    .await
    .unwrap();
    assert_eq!(std::fs::read(output).unwrap(), bytes);
    let before = r.sha256.clone();
    drop(s);
    drop(db);
    let s = PlatformService::new(Database::open(dir.path()).unwrap());
    assert_eq!(
        s.get_resource(IdRequest {
            request_id: request(),
            id: r.id.clone()
        })
        .await
        .unwrap()
        .sha256,
        before
    );
    assert_eq!(
        s.read_document(query(&r))
            .await
            .unwrap()
            .table
            .unwrap()
            .row_count,
        3
    );
    let bad = s
        .publish_generated_artifact(GeneratedArtifact {
            filename: "失败.csv".into(),
            bytes: b"unique,failed".to_vec(),
            source: "测试".into(),
            description: String::new(),
            folder_id: None,
            project_id: Some(request()),
        })
        .await
        .unwrap_err();
    assert_eq!(bad.code, ErrorCode::NotFound);
    assert_eq!(
        std::fs::read_dir(dir.path().join("attachments"))
            .unwrap()
            .count(),
        1
    );
    let tsv = s
        .publish_generated_artifact(GeneratedArtifact {
            filename: "结果.tsv".into(),
            bytes: "名称\t内容\n中文\t\"带\t制表及\n换行\"\n"
                .as_bytes()
                .to_vec(),
            source: "生成模块".into(),
            description: String::new(),
            folder_id: None,
            project_id: None,
        })
        .await
        .unwrap();
    let table = s.read_document(query(&tsv)).await.unwrap().table.unwrap();
    assert_eq!(table.row_count, 2);
    assert_eq!(table.column_count, 2);
    assert_eq!(table.rows[1][0].text, "中文");
    assert_eq!(table.rows[1][1].text, "带\t制表及\n换行");
}
#[tokio::test]
async fn invalid_packages_limits_old_revisions_and_deleted_resources_fail_without_losing_files() {
    let dir = TempDir::new().unwrap();
    let files = TempDir::new().unwrap();
    let s = PlatformService::new(Database::open(dir.path()).unwrap());
    for (name, bytes) in [
        ("损坏.docx", b"not a zip".to_vec()),
        ("损坏.xlsx", b"not a zip".to_vec()),
        ("旧.doc", vec![0, 1]),
        (
            "实体.docx",
            package(&[(
                "word/document.xml",
                "<!DOCTYPE document [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><document><body><p><t>&x;</t></p></body></document>",
            )]),
        ),
        (
            "越界.docx",
            package(&[
                ("../escape", "data"),
                ("word/document.xml", "<document><body/></document>"),
            ]),
        ),
        ("非文档.docx", package(&[("word/document.xml", "<wrong/>")])),
        ("非编码.csv", vec![0xff, 0xfe]),
    ] {
        let r = import(&s, files.path(), name, &bytes).await;
        assert!(s.read_document(query(&r)).await.is_err());
        let out = files.path().join(format!("保存-{name}"));
        s.export_file(
            IdRequest {
                request_id: request(),
                id: r.id,
            },
            out.clone(),
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(out).unwrap(), bytes);
    }
    let huge = "x".repeat(16 * 1024 * 1024 + 1);
    let r = import(
        &s,
        files.path(),
        "压缩超限.docx",
        &package(&[("word/document.xml", &huge)]),
    )
    .await;
    assert_eq!(
        s.read_document(query(&r)).await.unwrap_err().code,
        ErrorCode::Validation
    );
    let r = import(&s, files.path(), "版本.md", b"saved original").await;
    let q = query(&r);
    let newer = s
        .save_resource(SaveResource {
            request_id: request(),
            id: r.id.clone(),
            base_revision: 1,
            name: r.name.clone(),
            description: "changed".into(),
            source: String::new(),
            folder_id: None,
            url: None,
            favorite: false,
            tags: vec![],
        })
        .await
        .unwrap();
    assert_eq!(
        s.read_document(q).await.unwrap_err().code,
        ErrorCode::Conflict
    );
    s.set_resource_deleted(SetResourceDeleted {
        request_id: request(),
        id: r.id.clone(),
        base_revision: newer.revision,
        deleted: true,
    })
    .await
    .unwrap();
    assert_eq!(
        s.read_document(query(&newer)).await.unwrap_err().code,
        ErrorCode::NotFound
    );
}
#[test]
fn native_fixture_helper() {
    if let Ok(path) = std::env::var("MOSHUB_DOCUMENT_FIXTURES") {
        let path = Path::new(&path);
        std::fs::create_dir_all(path).unwrap();
        std::fs::write(path.join("中文文档.docx"), docx()).unwrap();
        std::fs::write(path.join("采集结果.xlsx"), xlsx()).unwrap();
        std::fs::write(
            path.join("阅读.md"),
            "# 阅读测试\n\n**中文排版**\n\n|名称|数量|\n|---|---|\n|春风|3|\n",
        )
        .unwrap();
    }
}
