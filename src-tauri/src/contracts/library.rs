use super::*;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryQuery {
    pub request_id: String,
    pub keyword: String,
    pub offset: u32,
    pub limit: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryEntry {
    pub module_id: String,
    pub module_name: String,
    pub kind: String,
    pub id: String,
    pub title: String,
    pub description: String,
    pub word_count: u64,
    pub section_count: u32,
    pub revision: i64,
    pub updated_at: String,
    pub disabled: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryPage {
    pub items: Vec<LibraryEntry>,
    pub has_more: bool,
    pub warnings: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadLibrary {
    pub request_id: String,
    pub module_id: String,
    pub kind: String,
    pub id: String,
    pub section_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibrarySection {
    pub id: String,
    pub title: String,
    pub revision: i64,
    pub word_count: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryReading {
    pub edit_target: SearchHit,
    pub entry: LibraryEntry,
    pub sections: Vec<LibrarySection>,
    pub selected_id: Option<String>,
    pub title: String,
    pub text: String,
    pub revision: i64,
}
