use super::{
    content_repository as content, document_repository as repo, domain,
    service::{GeneratedArtifact, PlatformService},
};
use crate::{
    contracts::*,
    infrastructure::{document_editing as files, document_reader},
};
use std::io::Write;

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|_| AppError::new(ErrorCode::IoError, "文档操作未完成，编辑会话已保留。", true))?
}
fn request(input: &IdRequest) -> AppResult<()> {
    domain::id(&input.request_id)?;
    domain::id(&input.id)
}
impl PlatformService {
    pub async fn begin_document_edit(
        &self,
        input: BeginDocumentEdit,
    ) -> AppResult<DocumentSession> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::revision(input.base_revision)?;
        let _guard = self.document_lock.lock().await;
        let id = input.id.clone();
        if let Some(record) = self
            .database
            .call(move |conn| repo::active_session(conn, &id))
            .await?
        {
            return self.session_view(record).await;
        }
        let (resource, blob) = self
            .database
            .call(move |conn| {
                let resource = content::get_resource(conn, &input.id)?;
                if resource.revision != input.base_revision {
                    return Err(AppError::conflict(resource.revision));
                }
                Ok((resource, content::resource_blob(conn, &input.id)?))
            })
            .await?;
        let format = files::format(resource.original_name.as_deref().unwrap_or(""))?;
        let mut filename = resource
            .original_name
            .clone()
            .unwrap_or_else(|| format!("文档.{format}"));
        if filename.len() > 240
            || filename.contains(['/', '\\'])
            || filename.chars().any(char::is_control)
        {
            filename = format!("编辑副本.{format}");
        }
        let store = self.attachments.clone();
        let source = blob.clone();
        let bytes = blocking(move || store.read(&source)).await?;
        let session = DocumentSession {
            id: uuid::Uuid::new_v4().to_string(),
            resource_id: resource.id,
            base_revision: resource.revision,
            filename,
            format: format.clone(),
            markdown: if matches!(format.as_str(), "md" | "markdown") {
                Some(files::markdown(&bytes)?)
            } else {
                None
            },
            edit_sequence: 0,
            updated_at: chrono::Utc::now().to_rfc3339(),
            changed: false,
        };
        if session.markdown.is_none() {
            let root = self.database.root().to_owned();
            let copy = session.clone();
            blocking(move || files::create_copy(&root, &copy, &bytes)).await?;
        }
        let copy = session.clone();
        let source = blob.clone();
        if let Err(error) = self
            .database
            .call(move |conn| repo::create_session(conn, &copy, &source))
            .await
        {
            if session.markdown.is_none() {
                let root = self.database.root().to_owned();
                let copy = session.clone();
                blocking(move || files::remove_copy(&root, &copy)).await?;
            }
            return Err(error);
        }
        Ok(session)
    }
    async fn session_view(&self, record: repo::SessionRecord) -> AppResult<DocumentSession> {
        let mut session = record.session;
        let bytes = if let Some(text) = &session.markdown {
            text.as_bytes().to_vec()
        } else {
            let root = self.database.root().to_owned();
            let copy = session.clone();
            blocking(move || files::read_copy(&root, &copy)).await?
        };
        session.changed = files::hash(&bytes) != record.source_blob.sha256;
        Ok(session)
    }
    pub async fn get_document_session(&self, input: IdRequest) -> AppResult<DocumentSession> {
        request(&input)?;
        let _guard = self.document_lock.lock().await;
        let record = self
            .database
            .call(move |conn| repo::session(conn, &input.id))
            .await?;
        self.session_view(record).await
    }
    pub async fn list_document_sessions(
        &self,
        input: ListRequest,
    ) -> AppResult<Vec<DocumentSession>> {
        domain::id(&input.request_id)?;
        domain::pagination(input.offset, input.limit)?;
        self.database
            .call(move |conn| repo::list_sessions(conn, input))
            .await
    }
    pub async fn write_markdown_draft(
        &self,
        input: WriteMarkdownDraft,
    ) -> AppResult<DocumentSession> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::sequence(input.edit_sequence)?;
        files::markdown(input.text.as_bytes())?;
        let _guard = self.document_lock.lock().await;
        let id = input.id.clone();
        self.database
            .call(move |conn| repo::write_markdown(conn, input))
            .await?;
        let record = self
            .database
            .call(move |conn| repo::session(conn, &id))
            .await?;
        self.session_view(record).await
    }
    pub async fn commit_document_edit(&self, input: CommitDocumentEdit) -> AppResult<DocumentSave> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::revision(input.base_revision)?;
        domain::sequence(input.edit_sequence)?;
        let _guard = self.document_lock.lock().await;
        let id = input.id.clone();
        let record = self
            .database
            .call(move |conn| repo::session(conn, &id))
            .await?;
        if record.session.base_revision != input.base_revision
            || record.session.edit_sequence != input.edit_sequence
        {
            return Err(AppError::validation(
                "会话序号不一致，请先保存当前恢复草稿。",
            ));
        }
        let root = self.database.root().to_owned();
        let copy = record.session.clone();
        let bytes = blocking(move || {
            let bytes = if let Some(text) = &copy.markdown {
                text.as_bytes().to_vec()
            } else {
                files::office_closed(&root, &copy)?;
                files::read_copy(&root, &copy)?
            };
            validate_result(&bytes, &copy.format)?;
            Ok(bytes)
        })
        .await?;
        // Every blob writer uses the same import lock; a failed transaction can safely remove its own new blob.
        let _import = self.import_lock.lock().await;
        let store = self.attachments.clone();
        let snapshot = bytes.clone();
        let imported = blocking(move || {
            let mut temp = tempfile::NamedTempFile::new()
                .map_err(|_| AppError::new(ErrorCode::IoError, "文档暂存失败。", true))?;
            temp.write_all(&snapshot)
                .map_err(|_| AppError::new(ErrorCode::IoError, "文档暂存失败。", true))?;
            store.import(temp.path())
        })
        .await?;
        let blob = imported.blob.clone();
        let created = imported.created;
        if record.session.markdown.is_none() {
            let root = self.database.root().to_owned();
            let copy = record.session.clone();
            let expected = files::hash(&bytes);
            let stable = blocking(move || {
                files::office_closed(&root, &copy)?;
                if files::hash(&files::read_copy(&root, &copy)?) != expected {
                    return Err(AppError::new(
                        ErrorCode::IoError,
                        "副本仍有新写入，请关闭 Office 后重试。",
                        true,
                    ));
                }
                Ok(())
            })
            .await;
            if let Err(error) = stable {
                if created {
                    let store = self.attachments.clone();
                    blocking(move || store.remove_uncommitted(&blob)).await?;
                }
                return Err(error);
            }
        }
        let result = self
            .database
            .call(move |conn| repo::commit(conn, input, imported.blob))
            .await;
        if result.is_err() && created {
            let store = self.attachments.clone();
            blocking(move || store.remove_uncommitted(&blob)).await?;
        }
        result
    }
    pub async fn copy_document_edit(&self, input: IdRequest) -> AppResult<Resource> {
        request(&input)?;
        let _guard = self.document_lock.lock().await;
        let record = self
            .database
            .call(move |conn| repo::session(conn, &input.id))
            .await?;
        let session = record.session;
        let root = self.database.root().to_owned();
        let copy = session.clone();
        let bytes = blocking(move || {
            let bytes = if let Some(text) = &copy.markdown {
                text.as_bytes().to_vec()
            } else {
                files::office_closed(&root, &copy)?;
                files::read_copy(&root, &copy)?
            };
            validate_result(&bytes, &copy.format)?;
            Ok(bytes)
        })
        .await?;
        if bytes.len() as u64 > document_reader::MAX_INPUT {
            return Err(AppError::validation(
                "另存副本上限为 20 MiB，可保留会话后用 Office 另存到外部目录。",
            ));
        }
        let original_id = session.resource_id.clone();
        let original_source = self
            .database
            .call(move |conn| repo::copy_source(conn, &original_id))
            .await?;
        let title = std::path::Path::new(&session.filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("文档");
        self.publish_generated_artifact(GeneratedArtifact {
            filename: format!(
                "{}-副本.{}",
                title.chars().take(160).collect::<String>(),
                session.format
            ),
            bytes,
            source: original_source,
            description: "保留原资料的独立编辑副本".into(),
            folder_id: None,
            project_id: None,
        })
        .await
    }
    pub async fn end_document_edit(&self, input: EndDocumentEdit) -> AppResult<()> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::sequence(input.edit_sequence)?;
        let _guard = self.document_lock.lock().await;
        let id = input.id.clone();
        let record = self
            .database
            .call(move |conn| repo::session(conn, &id))
            .await?;
        if record.session.markdown.is_none() {
            let root = self.database.root().to_owned();
            let copy = record.session.clone();
            blocking(move || files::office_closed(&root, &copy)).await?;
        }
        self.database
            .call(move |conn| repo::end(conn, input))
            .await?;
        if record.session.markdown.is_none() {
            let root = self.database.root().to_owned();
            blocking(move || files::remove_copy(&root, &record.session)).await?;
        }
        Ok(())
    }
    pub async fn list_file_versions(&self, input: VersionQuery) -> AppResult<Vec<FileVersion>> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::pagination(input.offset, input.limit)?;
        self.database
            .call(move |conn| repo::versions(conn, input))
            .await
    }
    pub async fn export_file_version(
        &self,
        input: VersionRequest,
        destination: std::path::PathBuf,
    ) -> AppResult<()> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::id(&input.version_id)?;
        let blob = self
            .database
            .call(move |conn| repo::version_blob(conn, &input))
            .await?;
        let store = self.attachments.clone();
        blocking(move || store.export(&blob, &destination)).await
    }
    pub async fn restore_file_version(&self, input: RestoreVersion) -> AppResult<Resource> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::id(&input.version_id)?;
        domain::revision(input.base_revision)?;
        let _guard = self.document_lock.lock().await;
        let q = VersionRequest {
            request_id: input.request_id.clone(),
            id: input.id.clone(),
            version_id: input.version_id.clone(),
        };
        let blob = self
            .database
            .call(move |conn| repo::version_blob(conn, &q))
            .await?;
        let store = self.attachments.clone();
        blocking(move || store.read(&blob)).await?;
        self.database
            .call(move |conn| repo::restore(conn, input))
            .await
    }
    pub async fn list_office_editors(&self, input: Request) -> AppResult<Vec<OfficeEditor>> {
        domain::id(&input.request_id)?;
        Ok(files::editors())
    }
    #[cfg(feature = "desktop")]
    pub async fn open_document_editor(&self, input: OpenDocumentEditor) -> AppResult<()> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        let _guard = self.document_lock.lock().await;
        let record = self
            .database
            .call(move |conn| repo::session(conn, &input.id))
            .await?;
        let root = self.database.root().to_owned();
        blocking(move || files::open_editor(&root, &record.session, &input.editor_id)).await
    }
    pub async fn preview_markdown(&self, input: PreviewMarkdown) -> AppResult<String> {
        domain::id(&input.request_id)?;
        files::markdown(input.text.as_bytes())?;
        blocking(move || {
            let html = document_reader::markdown_html(&input.text);
            if html.len() > 4 * 1024 * 1024 {
                return Err(AppError::validation(
                    "Markdown 预览超出 4 MiB 上限，源文与草稿保留。",
                ));
            }
            Ok(html)
        })
        .await
    }
    pub async fn create_document(&self, input: CreateDocument) -> AppResult<Resource> {
        domain::id(&input.request_id)?;
        let title = domain::title(&input.name)?;
        if title.contains(['/', '\\']) || title.chars().any(char::is_control) {
            return Err(AppError::validation("文档名称不能包含路径或控制字符。"));
        }
        let bytes = empty_document(&input.format)?;
        self.publish_generated_artifact(GeneratedArtifact {
            filename: format!("{title}.{}", input.format),
            bytes,
            source: "墨枢创建".into(),
            description: String::new(),
            folder_id: input.folder_id,
            project_id: input.project_id,
        })
        .await
    }
}
fn validate_result(bytes: &[u8], format: &str) -> AppResult<()> {
    match format {
        "md" | "markdown" => {
            files::markdown(bytes)?;
        }
        "docx" | "xlsx" => {
            use std::io::{Cursor, Read};
            let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| {
                AppError::validation("Office 副本尚未保存为有效文件，请检查编辑器中的保存结果。")
            })?;
            let name = if format == "docx" {
                "word/document.xml"
            } else {
                "xl/workbook.xml"
            };
            let part = archive.by_name(name).map_err(|_| {
                AppError::validation("文件格式与原扩展名不一致，请使用原格式保存。")
            })?;
            let mut data = Vec::new();
            part.take(16 * 1024 * 1024 + 1)
                .read_to_end(&mut data)
                .map_err(|_| AppError::validation("Office 副本不完整。"))?;
            if data.is_empty() || data.len() > 16 * 1024 * 1024 {
                return Err(AppError::validation(
                    "Office 主文档缺失或超过 16 MiB 上限。",
                ));
            }
        }
        "doc" | "xls" => {
            if !bytes.starts_with(&[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) {
                return Err(AppError::validation(
                    "旧版 Office 文件格式不一致，请使用原格式保存。",
                ));
            }
        }
        "csv" | "tsv" => {
            std::str::from_utf8(bytes)
                .map_err(|_| AppError::validation("请在表格编辑器中保存为 UTF-8 CSV/TSV。"))?;
        }
        _ => return Err(AppError::validation("不支持此编辑格式。")),
    }
    Ok(())
}
fn empty_document(format: &str) -> AppResult<Vec<u8>> {
    if matches!(format, "md" | "csv" | "tsv") {
        return Ok(Vec::new());
    }
    let (part, content_type, body) = match format {
        "docx" => (
            "word/document.xml",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
            r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/><w:sectPr/></w:body></w:document>"#,
        ),
        "xlsx" => (
            "xl/workbook.xml",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
            r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="工作表1" sheetId="1" r:id="rId1"/></sheets></workbook>"#,
        ),
        _ => {
            return Err(AppError::validation(
                "新建支持 Markdown、DOCX、XLSX、CSV 和 TSV。",
            ));
        }
    };
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let error = || AppError::new(ErrorCode::IoError, "无法创建文档。", true);
    let mut parts = vec![
        (
            "[Content_Types].xml",
            format!(
                r#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/{part}" ContentType="{content_type}"/>{}</Types>"#,
                if format == "xlsx" {
                    r#"<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#
                } else {
                    ""
                }
            ),
        ),
        (
            "_rels/.rels",
            format!(
                r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="{part}"/></Relationships>"#
            ),
        ),
        (part, body.into()),
    ];
    if format == "xlsx" {
        parts.push(("xl/_rels/workbook.xml.rels",r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>"#.into()));
        parts.push(("xl/worksheets/sheet1.xml",r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>"#.into()));
    }
    for (name, data) in parts {
        zip.start_file(
            name,
            zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated),
        )
        .map_err(|_| error())?;
        zip.write_all(data.as_bytes()).map_err(|_| error())?;
    }
    Ok(zip.finish().map_err(|_| error())?.into_inner())
}
