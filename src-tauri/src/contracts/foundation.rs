use super::*;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub revision: i64,
    pub theme: String,
    pub font_size: u32,
    pub nickname: String,
    pub avatar_resource_id: Option<String>,
    pub navigation: Vec<String>,
    pub pinned: Vec<String>,
    pub home_sections: Vec<String>,
    pub shortcuts: std::collections::BTreeMap<String, String>,
    pub onboarding_complete: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            revision: 1,
            theme: "system".into(),
            font_size: 15,
            nickname: "我的空间".into(),
            avatar_resource_id: None,
            navigation: [
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
            ]
            .map(String::from)
            .to_vec(),
            pinned: vec![],
            home_sections: ["projects", "notes", "tasks", "modules"]
                .map(String::from)
                .to_vec(),
            shortcuts: std::collections::BTreeMap::from([
                ("search".into(), "K".into()),
                ("newNote".into(), "N".into()),
                ("save".into(), "S".into()),
            ]),
            onboarding_complete: false,
        }
    }
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavePreferences {
    pub request_id: String,
    pub base_revision: i64,
    pub preferences: Preferences,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PageLocation {
    pub page: String,
    pub entity_id: Option<String>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveLocation {
    pub request_id: String,
    pub location: PageLocation,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Startup {
    pub preferences: Preferences,
    pub location: PageLocation,
    pub notice: Option<String>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchQuery {
    pub request_id: String,
    pub keyword: String,
    pub kind: Option<String>,
    pub project_id: Option<String>,
    pub tag: Option<String>,
    pub offset: u32,
    pub limit: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchHit {
    pub module_id: Option<String>,
    pub work_id: Option<String>,
    pub disabled: bool,
    pub kind: String,
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub source: String,
    pub revision: i64,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchPage {
    pub items: Vec<SearchHit>,
    pub has_more: bool,
    pub indexed_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Dashboard {
    pub projects: Vec<Project>,
    pub notes: Vec<NoteSummary>,
    pub today_tasks: Vec<Task>,
    pub overdue_tasks: Vec<Task>,
    pub today: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrashItem {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub deleted_at: String,
    pub revision: i64,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrashQuery {
    pub request_id: String,
    pub offset: u32,
    pub limit: u32,
    pub kind: Option<String>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrashMutation {
    pub request_id: String,
    pub kind: String,
    pub id: String,
    pub base_revision: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteImpact {
    pub module_links: u32,
    pub item: TrashItem,
    pub resource_links: u32,
    pub tasks: u32,
    pub versions: u32,
    pub sessions: u32,
    pub shared_blobs: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StorageInfo {
    pub location: String,
    pub database_bytes: u64,
    pub attachment_bytes: u64,
    pub editing_bytes: u64,
    pub backup_bytes: u64,
    pub schema_version: u32,
    pub app_version: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Job {
    pub id: String,
    pub operation: String,
    pub status: String,
    pub progress: f64,
    pub error_code: Option<ErrorCode>,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupRecord {
    pub id: String,
    pub created_at: String,
    pub size: u64,
    pub automatic: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestorePreview {
    pub id: String,
    pub created_at: String,
    pub workspace_id: String,
    pub schema_version: u32,
    pub projects: u32,
    pub resources: u32,
    pub tasks: u32,
    pub file_count: usize,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetModule {
    pub request_id: String,
    pub id: String,
    pub enabled: bool,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModuleRequest {
    pub request_id: String,
    pub id: String,
}
