use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadDocument {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub offset: u32,
    pub limit: u32,
    pub sheet_index: u32,
    pub column_offset: u32,
    pub column_limit: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum DocumentBlock {
    Paragraph { text: String, level: u8 },
    Table { rows: Vec<Vec<String>> },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentCell {
    pub text: String,
    pub value_type: String,
    pub formula: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TablePage {
    pub row_count: u32,
    pub column_count: u32,
    pub row_offset: u32,
    pub column_offset: u32,
    pub rows: Vec<Vec<DocumentCell>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentView {
    pub resource_id: String,
    pub source_revision: i64,
    pub format: String,
    pub html: Option<String>,
    pub blocks: Vec<DocumentBlock>,
    pub block_count: u32,
    pub sheets: Vec<String>,
    pub table: Option<TablePage>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BeginDocumentEdit {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentSession {
    pub id: String,
    pub resource_id: String,
    pub base_revision: i64,
    pub filename: String,
    pub format: String,
    pub markdown: Option<String>,
    pub edit_sequence: u64,
    pub updated_at: String,
    pub changed: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WriteMarkdownDraft {
    pub request_id: String,
    pub id: String,
    pub edit_sequence: u64,
    pub text: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommitDocumentEdit {
    pub request_id: String,
    pub id: String,
    pub base_revision: i64,
    pub edit_sequence: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentSave {
    pub resource: Resource,
    pub session: DocumentSession,
    pub receipt: SaveReceipt,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EndDocumentEdit {
    pub request_id: String,
    pub id: String,
    pub edit_sequence: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileVersion {
    pub id: String,
    pub resource_id: String,
    pub source_revision: i64,
    pub sha256: String,
    pub size: u64,
    pub created_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfficeEditor {
    pub id: String,
    pub name: String,
    pub formats: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenDocumentEditor {
    pub request_id: String,
    pub id: String,
    pub editor_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewMarkdown {
    pub request_id: String,
    pub text: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateDocument {
    pub request_id: String,
    pub name: String,
    pub format: String,
    pub folder_id: Option<String>,
    pub project_id: Option<String>,
}
