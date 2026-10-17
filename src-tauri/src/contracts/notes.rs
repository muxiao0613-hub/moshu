use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VersionQuery {
    pub request_id: String,
    pub id: String,
    pub offset: u32,
    pub limit: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VersionRequest {
    pub request_id: String,
    pub id: String,
    pub version_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestoreVersion {
    pub request_id: String,
    pub id: String,
    pub version_id: String,
    pub base_revision: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteVersionSummary {
    pub id: String,
    pub note_id: String,
    pub title: String,
    pub source_revision: i64,
    pub created_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteVersion {
    pub summary: NoteVersionSummary,
    pub body: Value,
    pub plain_text: String,
    pub schema_version: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NoteExportFormat {
    Txt,
    Markdown,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportNote {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub format: NoteExportFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteDraft {
    pub session_id: String,
    pub note_id: String,
    pub base_revision: i64,
    pub client_edit_sequence: u64,
    pub title: String,
    pub body: Value,
    pub schema_version: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WriteDraft {
    pub request_id: String,
    pub draft: NoteDraft,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiscardDraft {
    pub request_id: String,
    pub id: String,
    pub through_sequence: Option<u64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftEntry {
    pub session_id: String,
    pub note_id: Option<String>,
    pub title: Option<String>,
    pub issue: Option<String>,
}
