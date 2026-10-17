use super::{domain, note_repository, repository, service::PlatformService};
use crate::{contracts::*, infrastructure::drafts::DraftStore};
use std::path::PathBuf;
impl PlatformService {
    pub async fn copy_note_draft(&self, input: IdRequest) -> AppResult<Note> {
        let draft = self.get_note_draft(input).await?;
        self.database
            .call(move |conn| note_repository::copy_draft(conn, draft))
            .await
    }
    pub async fn list_note_versions(
        &self,
        input: VersionQuery,
    ) -> AppResult<Vec<NoteVersionSummary>> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::pagination(input.offset, input.limit)?;
        self.database
            .call(move |conn| note_repository::list(conn, input))
            .await
    }
    pub async fn get_note_version(&self, input: VersionRequest) -> AppResult<NoteVersion> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::id(&input.version_id)?;
        self.database
            .call(move |conn| note_repository::get(conn, input))
            .await
    }
    pub async fn restore_note_version(&self, input: RestoreVersion) -> AppResult<Note> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::id(&input.version_id)?;
        domain::revision(input.base_revision)?;
        self.database
            .call(move |conn| note_repository::restore(conn, input))
            .await
    }
    pub async fn note_export_bytes(&self, input: ExportNote) -> AppResult<Vec<u8>> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        domain::revision(input.base_revision)?;
        self.database
            .call(move |conn| note_repository::export_bytes(conn, input))
            .await
    }
    pub async fn export_note_to(&self, input: ExportNote, destination: PathBuf) -> AppResult<()> {
        let bytes = self.note_export_bytes(input).await?;
        let store = self.attachments.clone();
        blocking(move || store.export_bytes(&bytes, &destination)).await
    }
    async fn draft_store(&self) -> AppResult<DraftStore> {
        let workspace = self
            .database
            .call(|conn| repository::workspace_status(conn))
            .await?;
        Ok(DraftStore::new(
            self.database.root().to_owned(),
            workspace.workspace_id,
        ))
    }
    pub async fn write_note_draft(&self, input: WriteDraft) -> AppResult<()> {
        domain::id(&input.request_id)?;
        crate::infrastructure::drafts::validate(&input.draft)?;
        let _guard = self.draft_lock.lock().await;
        let note_id = input.draft.note_id.clone();
        self.database
            .call(move |conn| repository::get_note(conn, &note_id))
            .await?;
        let store = self.draft_store().await?;
        blocking(move || store.write(input.draft)).await
    }
    pub async fn list_note_drafts(&self, input: ListRequest) -> AppResult<Vec<DraftEntry>> {
        domain::id(&input.request_id)?;
        domain::pagination(input.offset, input.limit)?;
        let _guard = self.draft_lock.lock().await;
        let store = self.draft_store().await?;
        blocking(move || store.list(input.offset, input.limit)).await
    }
    pub async fn get_note_draft(&self, input: IdRequest) -> AppResult<NoteDraft> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        let _guard = self.draft_lock.lock().await;
        let store = self.draft_store().await?;
        blocking(move || store.get(&input.id)).await
    }
    pub async fn discard_note_draft(&self, input: DiscardDraft) -> AppResult<()> {
        domain::id(&input.request_id)?;
        domain::id(&input.id)?;
        if input
            .through_sequence
            .is_some_and(|s| s > domain::MAX_SAFE_INTEGER)
        {
            return Err(AppError::validation("草稿确认序号无效。"));
        }
        let _guard = self.draft_lock.lock().await;
        let store = self.draft_store().await?;
        blocking(move || store.discard(&input.id, input.through_sequence)).await
    }
}
async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tokio::task::spawn_blocking(task)
        .await
        .map_err(|_| AppError::new(ErrorCode::IoError, "笔记文件操作未完成，请重试。", true))?
}
