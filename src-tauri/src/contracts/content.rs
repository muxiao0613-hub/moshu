use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectQuery {
    pub request_id: String,
    pub offset: u32,
    pub limit: u32,
    pub keyword: String,
    pub status: Option<ProjectStatus>,
    pub favorite_only: bool,
    pub tag: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveProjectDetails {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub name: String,
    pub description: String,
    pub status: ProjectStatus,
    pub favorite: bool,
    pub tags: Vec<String>,
    // Keep the existing cover unless changeCover is explicitly requested.
    pub change_cover: bool,
    pub cover_resource_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ResourceKind {
    File,
    Link,
    Note,
}
impl ResourceKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::File => "file",
            Self::Link => "link",
            Self::Note => "note",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Resource {
    pub id: String,
    pub kind: ResourceKind,
    pub name: String,
    pub description: String,
    pub source: String,
    pub folder_id: Option<String>,
    pub original_name: Option<String>,
    pub url: Option<String>,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub project_ids: Vec<String>,
    pub size: Option<u64>,
    pub mime_type: Option<String>,
    pub sha256: Option<String>,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceQuery {
    pub request_id: String,
    pub offset: u32,
    pub limit: u32,
    pub keyword: String,
    pub kind: Option<ResourceKind>,
    pub folder_id: Option<String>,
    pub root_only: bool,
    pub project_id: Option<String>,
    pub favorite_only: bool,
    pub tag: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateLink {
    pub request_id: String,
    pub name: String,
    pub url: String,
    pub description: String,
    pub source: String,
    pub folder_id: Option<String>,
    pub project_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportFile {
    pub request_id: String,
    pub folder_id: Option<String>,
    pub project_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveResource {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub name: String,
    pub description: String,
    pub source: String,
    pub folder_id: Option<String>,
    pub url: Option<String>,
    pub favorite: bool,
    pub tags: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetResourceDeleted {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub deleted: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetResourceProject {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub project_id: String,
    pub linked: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Folder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub revision: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateFolder {
    pub request_id: String,
    pub parent_id: Option<String>,
    pub name: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveFolder {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub parent_id: Option<String>,
    pub name: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FolderDeleteMode {
    MoveToRoot,
    TrashContents,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteFolder {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub mode: FolderDeleteMode,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FilePreview {
    pub kind: String,
    pub text: Option<String>,
    pub data_url: Option<String>,
    pub message: Option<String>,
}
// Private metadata is never sent to the webview. Paths always come from the repository.
#[derive(Debug, Clone)]
pub struct Blob {
    pub id: String,
    pub sha256: String,
    pub internal_path: String,
    pub size: u64,
    pub mime_type: String,
}
