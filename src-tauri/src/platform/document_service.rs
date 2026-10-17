use super::{
    content_repository as repo, domain,
    service::{GeneratedArtifact, PlatformService},
};
use crate::{contracts::*, infrastructure::document_reader};

impl PlatformService {
    pub async fn publish_generated_artifact(
        &self,
        artifact: GeneratedArtifact,
    ) -> AppResult<Resource> {
        use std::io::Write;
        let name = domain::title(&artifact.filename)?;
        if name != artifact.filename
            || name.contains(['/', '\\'])
            || matches!(name.as_str(), "." | "..")
            || name.chars().any(char::is_control)
        {
            return Err(AppError::validation("生成资料的文件名无效。"));
        }
        domain::description(&artifact.source)?;
        domain::description(&artifact.description)?;
        let input = ImportFile {
            request_id: uuid::Uuid::new_v4().to_string(),
            folder_id: artifact.folder_id,
            project_id: artifact.project_id,
        };
        self.validate_import(&input)?;
        if artifact.bytes.len() as u64 > document_reader::MAX_INPUT {
            return Err(AppError::validation("生成资料上限为 20 MiB。"));
        }
        let _guard = self.import_lock.lock().await;
        let store = self.attachments.clone();
        let filename = artifact.filename;
        let imported = tokio::task::spawn_blocking(move || {
            let mut temp = tempfile::NamedTempFile::new()
                .map_err(|_| AppError::new(ErrorCode::IoError, "生成资料暂存失败。", true))?;
            temp.write_all(&artifact.bytes)
                .map_err(|_| AppError::new(ErrorCode::IoError, "生成资料暂存失败。", true))?;
            let mut imported = store.import(temp.path())?;
            imported.original_name = filename.clone();
            imported.name = filename;
            Ok::<_, AppError>(imported)
        })
        .await
        .map_err(|_| AppError::new(ErrorCode::IoError, "生成资料未完成。", true))??;
        let blob = imported.blob.clone();
        let created = imported.created;
        let result = self
            .database
            .call(move |conn| {
                repo::import_annotated_file(
                    conn,
                    input,
                    imported.blob,
                    imported.original_name,
                    imported.name,
                    artifact.source,
                    artifact.description,
                )
            })
            .await;
        if result.is_err() && created {
            let store = self.attachments.clone();
            tokio::task::spawn_blocking(move || store.remove_uncommitted(&blob))
                .await
                .map_err(|_| AppError::new(ErrorCode::IoError, "暂存清理未完成。", true))??;
        }
        result
    }
    pub async fn read_document(&self, input: ReadDocument) -> AppResult<DocumentView> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::revision(input.base_revision)?;
        domain::pagination(input.offset, input.limit)?;
        if input.sheet_index > 99
            || input.column_offset > 16_383
            || !(1..=50).contains(&input.column_limit)
        {
            return Err(AppError::validation("工作表或列分页参数无效。"));
        }
        let _guard = self.document_lock.lock().await;
        let query = input.clone();
        let (resource, blob) = self
            .database
            .call(move |conn| {
                let resource = repo::get_resource(conn, &query.id)?;
                if resource.revision != query.base_revision {
                    return Err(AppError::conflict(resource.revision));
                }
                Ok((resource, repo::resource_blob(conn, &query.id)?))
            })
            .await?;
        if blob.size > document_reader::MAX_INPUT {
            return Err(AppError::validation(
                "文档读取上限为 20 MiB，可系统打开或导出原文件。",
            ));
        }
        let store = self.attachments.clone();
        let query = input.clone();
        let view = tokio::task::spawn_blocking(move || {
            document_reader::read(&store.read(&blob)?, &resource, &query)
        })
        .await
        .map_err(|_| AppError::new(ErrorCode::IoError, "文档读取未完成，原文件已保留。", true))??;
        self.database
            .call(move |conn| {
                let latest = repo::get_resource(conn, &input.id)?;
                if latest.revision != input.base_revision {
                    return Err(AppError::conflict(latest.revision));
                }
                Ok(())
            })
            .await?;
        Ok(view)
    }
}
