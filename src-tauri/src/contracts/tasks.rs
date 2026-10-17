use super::*;
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatus {
    NotStarted,
    InProgress,
    Completed,
}
impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NotStarted => "notStarted",
            Self::InProgress => "inProgress",
            Self::Completed => "completed",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TaskPriority {
    Low,
    Medium,
    High,
}
impl TaskPriority {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskView {
    All,
    Today,
    Overdue,
    Completed,
}
impl TaskView {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Today => "today",
            Self::Overdue => "overdue",
            Self::Completed => "completed",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub due_date: Option<String>,
    pub project_id: Option<String>,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub overdue: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateTask {
    pub request_id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub due_date: Option<String>,
    pub project_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveTask {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub due_date: Option<String>,
    pub project_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetTaskDeleted {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub deleted: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskQuery {
    pub request_id: String,
    pub offset: u32,
    pub limit: u32,
    pub view: TaskView,
    pub status: Option<TaskStatus>,
    pub due_date: Option<String>,
    pub project_id: Option<String>,
    pub keyword: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskPage {
    pub items: Vec<Task>,
    pub today: String,
    pub has_more: bool,
}
