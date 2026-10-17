use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;
mod library;
pub use library::*;
mod content;
pub use content::*;
mod notes;
pub use notes::*;
mod documents;
pub use documents::*;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    Validation,
    NotFound,
    Conflict,
    ModuleDisabled,
    IoError,
    DbError,
    Cancelled,
    AiUnavailable,
    BackupInvalid,
    WorkspaceLocked,
    DbBusy,
    MigrationFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    pub retryable: bool,
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

impl AppError {
    pub fn new(code: ErrorCode, message: &str, retryable: bool) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
            request_id: Uuid::new_v4().to_string(),
            details: None,
        }
    }
    pub fn validation(message: &str) -> Self {
        Self::new(ErrorCode::Validation, message, false)
    }
    pub fn conflict(revision: i64) -> Self {
        let mut error = Self::new(
            ErrorCode::Conflict,
            "内容已更新，请对照当前版本后重试。",
            false,
        );
        error.details = Some(serde_json::json!({"currentRevision": revision}));
        error
    }
    pub fn for_request(mut self, id: &str) -> Self {
        self.request_id = id.into();
        self
    }
}
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for AppError {}
impl From<rusqlite::Error> for AppError {
    fn from(_: rusqlite::Error) -> Self {
        Self::new(
            ErrorCode::DbError,
            "数据库操作失败，内容未确认保存，请重试。",
            true,
        )
    }
}
pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectStatus {
    Active,
    Archived,
}
impl ProjectStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Archived => "archived",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub status: ProjectStatus,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub cover_blob_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateProject {
    pub request_id: String,
    pub name: String,
    pub description: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateProject {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub name: String,
    pub description: String,
    pub status: ProjectStatus,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetProjectDeleted {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub deleted: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListRequest {
    pub request_id: String,
    pub offset: u32,
    pub limit: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdRequest {
    pub request_id: String,
    pub id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub request_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateNote {
    pub request_id: String,
    pub title: String,
    pub project_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body: Value,
    pub plain_text: String,
    pub schema_version: u32,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub revision: i64,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveNote {
    pub request_id: String,
    pub id: String,
    pub title: String,
    pub body: Value,
    pub schema_version: u32,
    pub base_revision: i64,
    pub client_edit_sequence: u64,
    pub create_version: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveReceipt {
    pub entity_id: String,
    pub saved_revision: i64,
    pub client_edit_sequence: u64,
    pub saved_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceStatus {
    pub workspace_id: String,
    pub schema_version: u32,
    pub app_version: String,
    pub project_count: u32,
    pub note_count: u32,
}

mod tasks;
pub use tasks::*;
mod foundation;
pub use foundation::*;

mod pet;
pub use pet::*;
