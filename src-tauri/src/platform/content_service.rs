use super::{content_repository as repo, domain, service::PlatformService};
use crate::contracts::*;
use std::path::{Path, PathBuf};

fn mutation(request: &str, id: &str, revision: i64) -> AppResult<()> {
    domain::id(request)?;
    domain::id(id)?;
    domain::revision(revision)
}
fn query(
    request: &str,
    offset: u32,
    limit: u32,
    keyword: &str,
    tag: &Option<String>,
) -> AppResult<()> {
    domain::id(request)?;
    domain::pagination(offset, limit)?;
    domain::keyword(keyword)?;
    if let Some(tag) = tag {
        domain::tags(std::slice::from_ref(tag))?;
    }
    Ok(())
}
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|_| AppError::new(ErrorCode::IoError, "文件工作任务未完成，请重试。", true))?
}
impl PlatformService {
    pub async fn query_projects(&self, input: ProjectQuery) -> AppResult<Vec<Project>> {
        query(
            &input.request_id,
            input.offset,
            input.limit,
            &input.keyword,
            &input.tag,
        )?;
        self.database
            .call(move |conn| repo::query_projects(conn, input))
            .await
    }
    pub async fn get_project(&self, input: IdRequest) -> AppResult<Project> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        self.database
            .call(move |conn| super::repository::get_project(conn, &input.id))
            .await
    }
    pub async fn save_project_details(&self, mut input: SaveProjectDetails) -> AppResult<Project> {
        mutation(&input.request_id, &input.id, input.base_revision)?;
        input.name = domain::title(&input.name)?;
        domain::description(&input.description)?;
        input.tags = domain::tags(&input.tags)?;
        domain::optional_id(&input.cover_resource_id)?;
        self.database
            .call(move |conn| repo::save_project_details(conn, input))
            .await
    }
    pub async fn list_resources(&self, input: ResourceQuery) -> AppResult<Vec<Resource>> {
        query(
            &input.request_id,
            input.offset,
            input.limit,
            &input.keyword,
            &input.tag,
        )?;
        domain::optional_id(&input.folder_id)?;
        domain::optional_id(&input.project_id)?;
        if input.root_only && input.folder_id.is_some() {
            return Err(AppError::validation("根目录与文件夹筛选不能同时指定。"));
        }
        self.database
            .call(move |conn| repo::list_resources(conn, input))
            .await
    }
    pub async fn get_resource(&self, input: IdRequest) -> AppResult<Resource> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        self.database
            .call(move |conn| repo::get_resource(conn, &input.id))
            .await
    }
    pub async fn create_link(&self, mut input: CreateLink) -> AppResult<Resource> {
        domain::id(&input.request_id)?;
        input.name = domain::title(&input.name)?;
        input.url = domain::web_url(&input.url)?;
        domain::description(&input.description)?;
        domain::description(&input.source)?;
        domain::optional_id(&input.folder_id)?;
        domain::optional_id(&input.project_id)?;
        self.database
            .call(move |conn| repo::create_link(conn, input))
            .await
    }
    pub fn validate_import(&self, input: &ImportFile) -> AppResult<()> {
        domain::id(&input.request_id)?;
        domain::optional_id(&input.folder_id)?;
        domain::optional_id(&input.project_id)
    }
    // Paths are supplied by the native picker or a trusted Rust caller, never by the webview DTO.
    pub async fn import_file(&self, input: ImportFile, source: &Path) -> AppResult<Resource> {
        self.validate_import(&input)?;
        let job = self.new_job("import", input.request_id.clone()).await?;
        let runtime = job.clone();
        let result = async {
            let _guard = self.import_lock.lock().await;
            let store = self.attachments.clone();
            let source = source.to_owned();
            let progress = runtime.clone();
            let imported = blocking(move || {
                store.import_observed(&source, &|p| super::backup_service::observe(&progress, p))
            })
            .await?;
            let blob = imported.blob.clone();
            let cancelled = runtime.clone();
            let result = self
                .database
                .call(move |conn| {
                    super::backup_service::observe(&cancelled, 0.99)?;
                    repo::import_file(
                        conn,
                        input,
                        imported.blob,
                        imported.original_name,
                        imported.name,
                    )
                })
                .await;
            if result.is_err() && imported.created {
                let store = self.attachments.clone();
                blocking(move || store.remove_uncommitted(&blob)).await?;
            }
            result
        }
        .await;
        self.finish_job(job, result.as_ref().map(|_| ()).map_err(Clone::clone))
            .await;
        result
    }

    pub async fn save_resource(&self, mut input: SaveResource) -> AppResult<Resource> {
        mutation(&input.request_id, &input.id, input.base_revision)?;
        input.name = domain::title(&input.name)?;
        domain::description(&input.description)?;
        domain::description(&input.source)?;
        domain::optional_id(&input.folder_id)?;
        input.tags = domain::tags(&input.tags)?;
        if let Some(url) = &input.url {
            input.url = Some(domain::web_url(url)?);
        }
        self.database
            .call(move |conn| repo::save_resource(conn, input))
            .await
    }
    pub async fn set_resource_project(&self, input: SetResourceProject) -> AppResult<Resource> {
        mutation(&input.request_id, &input.id, input.base_revision)?;
        domain::id(&input.project_id)?;
        self.database
            .call(move |conn| repo::set_resource_project(conn, input))
            .await
    }
    pub async fn set_resource_deleted(&self, input: SetResourceDeleted) -> AppResult<Resource> {
        mutation(&input.request_id, &input.id, input.base_revision)?;
        self.database
            .call(move |conn| repo::set_resource_deleted(conn, input))
            .await
    }
    pub async fn list_folders(&self, input: ListRequest) -> AppResult<Vec<Folder>> {
        domain::id(&input.request_id)?;
        domain::pagination(input.offset, input.limit)?;
        self.database
            .call(move |conn| repo::list_folders(conn, input))
            .await
    }
    pub async fn create_folder(&self, mut input: CreateFolder) -> AppResult<Folder> {
        domain::id(&input.request_id)?;
        domain::optional_id(&input.parent_id)?;
        input.name = domain::title(&input.name)?;
        self.database
            .call(move |conn| repo::create_folder(conn, input))
            .await
    }
    pub async fn save_folder(&self, mut input: SaveFolder) -> AppResult<Folder> {
        mutation(&input.request_id, &input.id, input.base_revision)?;
        domain::optional_id(&input.parent_id)?;
        input.name = domain::title(&input.name)?;
        self.database
            .call(move |conn| repo::save_folder(conn, input))
            .await
    }
    pub async fn delete_folder(&self, input: DeleteFolder) -> AppResult<()> {
        mutation(&input.request_id, &input.id, input.base_revision)?;
        self.database
            .call(move |conn| repo::delete_folder(conn, input))
            .await
    }
    async fn resource_blob(&self, input: IdRequest) -> AppResult<Blob> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        self.database
            .call(move |conn| repo::resource_blob(conn, &input.id))
            .await
    }
    pub async fn preview_file(&self, input: IdRequest) -> AppResult<FilePreview> {
        let blob = self.resource_blob(input).await?;
        let store = self.attachments.clone();
        blocking(move || store.preview(&blob)).await
    }
    pub async fn preview_project_cover(&self, input: IdRequest) -> AppResult<FilePreview> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        let blob = self
            .database
            .call(move |conn| repo::project_cover(conn, &input.id))
            .await?;
        let store = self.attachments.clone();
        blocking(move || store.preview(&blob)).await
    }
    pub async fn export_file(&self, input: IdRequest, destination: PathBuf) -> AppResult<()> {
        let job = self.new_job("export", input.request_id.clone()).await?;
        let runtime = job.clone();
        let result = async {
            let blob = self.resource_blob(input).await?;
            let store = self.attachments.clone();
            blocking(move || {
                super::backup_service::observe(&runtime, 0.0)?;
                let bytes = store.read(&blob)?;
                store.export_bytes_observed(&bytes, &destination, &|p| {
                    super::backup_service::observe(&runtime, p)
                })
            })
            .await
        }
        .await;
        self.finish_job(job, result.clone()).await;
        result
    }

    #[cfg(feature = "desktop")]
    pub async fn open_resource(&self, input: IdRequest) -> AppResult<()> {
        let resource = self.get_resource(input.clone()).await?;
        match resource.kind {
            ResourceKind::File => {
                let blob = self.resource_blob(input).await?;
                let store = self.attachments.clone();
                let original = resource.original_name.unwrap_or(resource.name);
                blocking(move || store.open(&blob, &original)).await
            }
            ResourceKind::Link => {
                let url = domain::web_url(resource.url.as_deref().unwrap_or(""))?;
                blocking(move || {
                    opener::open_browser(url).map_err(|_| {
                        AppError::new(ErrorCode::IoError, "无法启动系统浏览器。", true)
                    })
                })
                .await
            }
            ResourceKind::Note => Err(AppError::validation("请在笔记编辑器中打开。")),
        }
    }
}
