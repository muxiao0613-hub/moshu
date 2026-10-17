use crate::contracts::{Note, NoteDraft, SaveNote};
use serde::{Deserialize, Serialize};

macro_rules! dto {($name:ident { $($field:ident: $ty:ty),* $(,)? }) => {
 #[derive(Debug,Clone,Serialize,Deserialize)]
 #[serde(rename_all="camelCase",deny_unknown_fields)]
 pub struct $name {$(pub $field:$ty),*}
};}
dto!(WorkFields {
    name: String,
    synopsis: String,
    goal: String,
    genre: String,
    favorite: bool,
    archived: bool,
    project_id: Option<String>,cover_resource_id:Option<String>
});
dto!(Work {id:String,fields:WorkFields,revision:i64,settings_revision:i64,tree_revision:i64,created_at:String,updated_at:String,deleted_at:Option<String>});
dto!(WorkQuery {
    request_id: String,
    keyword: String,
    deleted: bool,
    offset: u32,
    limit: u32
});
dto!(SaveWork {request_id:String,id:Option<String>,base_revision:Option<i64>,fields:WorkFields});
dto!(Scope {
    request_id: String,
    work_id: String
});
dto!(Entity {
    request_id: String,
    work_id: String,
    id: String
});
dto!(Mutation {
    request_id: String,
    work_id: String,
    id: String,
    base_revision: i64,
    deleted: bool
});
dto!(Volume {id:String,title:String,position:i64,revision:i64,deleted_at:Option<String>});
dto!(ChapterSummary {id:String,work_id:String,volume_id:Option<String>,title:String,position:i64,status:String,revision:i64,word_count:u64,deleted_at:Option<String>});
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    #[serde(flatten)]
    pub note: Note,
    pub work_id: String,
    pub volume_id: Option<String>,
    pub status: String,
    pub position: i64,
    pub word_count: u64,
}
dto!(Tree {work:Work,volumes:Vec<Volume>,chapters:Vec<ChapterSummary>});
dto!(CreateNode {request_id:String,work_id:String,kind:String,title:String,volume_id:Option<String>,tree_revision:i64});
dto!(MoveNode {request_id:String,work_id:String,id:String,kind:String,title:String,volume_id:Option<String>,position:u32,status:String,tree_revision:i64,base_revision:i64});
dto!(SaveChapter {
    request_id: String,
    work_id: String,
    save: SaveNote
});
dto!(Version {
    id: String,
    chapter_id: String,
    source_revision: i64,
    title: String,
    body: serde_json::Value,
    plain_text: String,
    schema_version: u32,
    created_at: String
});
dto!(RestoreChapter {
    request_id: String,
    work_id: String,
    id: String,
    version_id: String,
    base_revision: i64
});
dto!(Draft {
    draft: NoteDraft,
    updated_at: String
});
dto!(WriteChapterDraft {
    request_id: String,
    work_id: String,
    draft: NoteDraft
});
dto!(ClearChapterDraft {
    request_id: String,
    work_id: String,
    id: String,
    session_id: String,
    through_sequence: u64
});
dto!(SettingFields {aliases:String,description:String,goal:String,relationships:String,fixed:String,category:String,body:String,related_characters:Vec<String>,resource_ids:Vec<String>});
dto!(Setting {id:String,work_id:String,kind:String,title:String,fields:SettingFields,parent_id:Option<String>,chapter_id:Option<String>,position:i64,revision:i64,updated_at:String,deleted_at:Option<String>});
dto!(SaveSetting {request_id:String,work_id:String,id:Option<String>,base_revision:Option<i64>,kind:String,title:String,fields:SettingFields,parent_id:Option<String>,chapter_id:Option<String>,position:u32});
dto!(ImportChapter {
    title: String,
    text: String
});
dto!(ImportWork {request_id:String,name:String,chapters:Vec<ImportChapter>});
dto!(ExportWork {request_id:String,work_id:String,chapter_ids:Vec<String>,format:String});

dto!(Location {work_id:Option<String>,chapter_id:Option<String>});
dto!(SaveLocation {
    request_id: String,
    location: Location
});
