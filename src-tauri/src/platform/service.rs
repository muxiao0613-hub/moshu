use crate::{
    contracts::*,
    infrastructure::database::Database,
    platform::{domain, repository},
};

// Typed in-process publishing input for trusted built-in modules; no disk path or arbitrary writer IPC.
pub struct GeneratedArtifact {
    pub filename: String,
    pub bytes: Vec<u8>,
    pub source: String,
    pub description: String,
    pub folder_id: Option<String>,
    pub project_id: Option<String>,
}

#[derive(Clone)]
pub struct PlatformService {
    pub(super) database: Database,
    pub modules: std::sync::Arc<std::sync::Mutex<super::modules::Registry>>,
    pub access: std::sync::Arc<tokio::sync::RwLock<()>>,
    pub(super) maintenance: std::sync::Arc<super::backup_service::Maintenance>,
    pub(super) attachments: crate::infrastructure::attachments::AttachmentStore,
    pub(super) import_lock: std::sync::Arc<tokio::sync::Mutex<()>>,
    pub(super) draft_lock: std::sync::Arc<tokio::sync::Mutex<()>>,
    pub(super) document_lock: std::sync::Arc<tokio::sync::Mutex<()>>,
}
impl PlatformService {
    pub fn data_root(&self) -> &std::path::Path {
        self.database.root()
    }
    pub fn new(database: Database) -> Self {
        Self {
            modules: std::sync::Arc::new(std::sync::Mutex::new(super::modules::Registry::new())),
            access: std::sync::Arc::new(tokio::sync::RwLock::new(())),
            maintenance: std::sync::Arc::new(super::backup_service::Maintenance::default()),
            attachments: crate::infrastructure::attachments::AttachmentStore::new(
                database.root().to_owned(),
            ),
            database,
            import_lock: std::sync::Arc::new(tokio::sync::Mutex::new(())),
            draft_lock: std::sync::Arc::new(tokio::sync::Mutex::new(())),
            document_lock: std::sync::Arc::new(tokio::sync::Mutex::new(())),
        }
    }
    pub async fn status(&self, input: Request) -> AppResult<WorkspaceStatus> {
        domain::id(&input.request_id)?;
        self.database
            .call(|conn| repository::workspace_status(conn))
            .await
    }
    pub async fn list_projects(&self, input: ListRequest) -> AppResult<Vec<Project>> {
        domain::id(&input.request_id)?;
        domain::pagination(input.offset, input.limit)?;
        self.database
            .call(move |conn| repository::list_projects(conn, input))
            .await
    }
    pub async fn create_project(&self, mut input: CreateProject) -> AppResult<Project> {
        domain::id(&input.request_id)?;
        input.name = domain::title(&input.name)?;
        domain::description(&input.description)?;
        self.database
            .call(move |conn| repository::create_project(conn, input))
            .await
    }
    pub async fn update_project(&self, mut input: UpdateProject) -> AppResult<Project> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::revision(input.base_revision)?;
        input.name = domain::title(&input.name)?;
        domain::description(&input.description)?;
        self.database
            .call(move |conn| repository::update_project(conn, input))
            .await
    }
    pub async fn set_project_deleted(&self, input: SetProjectDeleted) -> AppResult<Project> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::revision(input.base_revision)?;
        self.database
            .call(move |conn| repository::set_project_deleted(conn, input))
            .await
    }
    pub async fn list_notes(&self, input: ListRequest) -> AppResult<Vec<NoteSummary>> {
        domain::id(&input.request_id)?;
        domain::pagination(input.offset, input.limit)?;
        self.database
            .call(move |conn| repository::list_notes(conn, input))
            .await
    }
    pub async fn create_note(&self, mut input: CreateNote) -> AppResult<Note> {
        domain::id(&input.request_id)?;
        input.title = domain::title(&input.title)?;
        if let Some(id) = &input.project_id {
            domain::id(id)?;
        }
        self.database
            .call(move |conn| repository::create_note(conn, input))
            .await
    }
    pub async fn get_note(&self, input: IdRequest) -> AppResult<Note> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        self.database
            .call(move |conn| repository::get_note(conn, &input.id))
            .await
    }
    pub async fn save_note(&self, mut input: SaveNote) -> AppResult<SaveReceipt> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::revision(input.base_revision)?;
        input.title = domain::title(&input.title)?;
        if input.client_edit_sequence > domain::MAX_SAFE_INTEGER {
            return Err(AppError::validation("编辑序号无效。"));
        }
        let plain_text = domain::document(&input.body, input.schema_version)?;
        self.database
            .call(move |conn| repository::save_note(conn, input, plain_text))
            .await
    }
}
