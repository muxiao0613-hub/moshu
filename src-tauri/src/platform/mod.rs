mod content_repository;
mod content_service;
mod document_service;
pub mod domain;
mod library_service;
mod note_export;
mod note_repository;
mod note_service;
pub mod repository;
pub mod service;

mod task_repository;
mod task_service;

mod backup_service;
mod document_edit_service;
mod document_repository;
mod foundation_repository;
mod foundation_service;
pub mod modules;

pub fn render_markdown(body: &serde_json::Value) -> String {
    note_export::render(body)
}
pub fn markdown_title(title: &str) -> String {
    note_export::escape(title)
}

pub mod module_links;

mod pet_service;
