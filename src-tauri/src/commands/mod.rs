use crate::{contracts::*, platform::service::PlatformService};
use tauri::State;
pub mod mogao;
pub mod pet;

pub struct AppState(pub AppResult<PlatformService>);
impl AppState {
    fn service(&self) -> AppResult<&PlatformService> {
        self.0.as_ref().map_err(Clone::clone)
    }
}
macro_rules! command {
    ($name:ident, $method:ident, $input:ty, $output:ty) => {
        #[tauri::command]
        pub async fn $name(
            state: State<'_, AppState>,
            input: serde_json::Value,
        ) -> AppResult<$output> {
            let input: $input = serde_json::from_value(input)
                .map_err(|_| AppError::validation("命令字段缺失或格式无效。"))?;
            let request_id = input.request_id.clone();
            crate::platform::domain::id(&request_id)?;
            let result = match state.service() {
                Ok(service) => {
                    let _access = service.access.try_read().map_err(|_| {
                        AppError::new(ErrorCode::DbBusy, "备份或恢复正在进行，请稍后重试。", true)
                    })?;
                    service.$method(input).await
                }
                Err(error) => Err(error),
            };
            result.map_err(|error| error.for_request(&request_id))
        }
    };
}
command!(
    list_module_library,
    list_module_library,
    LibraryQuery,
    LibraryPage
);
command!(
    read_module_library,
    read_module_library,
    ReadLibrary,
    LibraryReading
);
command!(workspace_status, status, Request, WorkspaceStatus);
command!(list_projects, list_projects, ListRequest, Vec<Project>);
command!(create_project, create_project, CreateProject, Project);
command!(update_project, update_project, UpdateProject, Project);
command!(
    set_project_deleted,
    set_project_deleted,
    SetProjectDeleted,
    Project
);
command!(list_notes, list_notes, ListRequest, Vec<NoteSummary>);
command!(create_note, create_note, CreateNote, Note);
command!(get_note, get_note, IdRequest, Note);
command!(save_note, save_note, SaveNote, SaveReceipt);
command!(query_projects, query_projects, ProjectQuery, Vec<Project>);
command!(get_project, get_project, IdRequest, Project);
command!(
    save_project_details,
    save_project_details,
    SaveProjectDetails,
    Project
);
command!(list_resources, list_resources, ResourceQuery, Vec<Resource>);
command!(get_resource, get_resource, IdRequest, Resource);
command!(create_link, create_link, CreateLink, Resource);
command!(save_resource, save_resource, SaveResource, Resource);
command!(
    set_resource_project,
    set_resource_project,
    SetResourceProject,
    Resource
);
command!(
    set_resource_deleted,
    set_resource_deleted,
    SetResourceDeleted,
    Resource
);
command!(list_folders, list_folders, ListRequest, Vec<Folder>);
command!(create_folder, create_folder, CreateFolder, Folder);
command!(save_folder, save_folder, SaveFolder, Folder);
command!(delete_folder, delete_folder, DeleteFolder, ());
command!(preview_file, preview_file, IdRequest, FilePreview);
command!(read_document, read_document, ReadDocument, DocumentView);
command!(
    preview_project_cover,
    preview_project_cover,
    IdRequest,
    FilePreview
);
command!(open_resource, open_resource, IdRequest, ());

#[tauri::command]
pub async fn import_file(
    state: State<'_, AppState>,
    input: serde_json::Value,
) -> AppResult<Resource> {
    let input: ImportFile =
        serde_json::from_value(input).map_err(|_| AppError::validation("导入字段无效。"))?;
    let id = input.request_id.clone();
    let service = state.service()?;
    let _access = service
        .access
        .try_read()
        .map_err(|_| AppError::new(ErrorCode::DbBusy, "维护正在进行，请稍后重试。", true))?;
    service.validate_import(&input)?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("导入资料 · 每份上限 100 MB")
        .pick_file()
        .await
        .ok_or_else(|| {
            AppError::new(ErrorCode::Cancelled, "已取消文件导入。", false).for_request(&id)
        })?;
    service
        .import_file(input, file.path())
        .await
        .map_err(|e| e.for_request(&id))
}
#[tauri::command]
pub async fn export_file(state: State<'_, AppState>, input: serde_json::Value) -> AppResult<()> {
    let input: IdRequest =
        serde_json::from_value(input).map_err(|_| AppError::validation("导出字段无效。"))?;
    let id = input.request_id.clone();
    let service = state.service()?;
    let _access = service
        .access
        .try_read()
        .map_err(|_| AppError::new(ErrorCode::DbBusy, "维护正在进行，请稍后重试。", true))?;
    let resource = service.get_resource(input.clone()).await?;
    if resource.kind != ResourceKind::File {
        return Err(AppError::validation("该资料不是文件。").for_request(&id));
    }
    let file = rfd::AsyncFileDialog::new()
        .set_title("导出文件副本")
        .set_file_name(resource.original_name.unwrap_or(resource.name))
        .save_file()
        .await
        .ok_or_else(|| {
            AppError::new(ErrorCode::Cancelled, "已取消文件导出。", false).for_request(&id)
        })?;
    service
        .export_file(input, file.path().to_owned())
        .await
        .map_err(|e| e.for_request(&id))
}

command!(
    list_note_versions,
    list_note_versions,
    VersionQuery,
    Vec<NoteVersionSummary>
);
command!(
    get_note_version,
    get_note_version,
    VersionRequest,
    NoteVersion
);
command!(
    restore_note_version,
    restore_note_version,
    RestoreVersion,
    Note
);
command!(write_note_draft, write_note_draft, WriteDraft, ());
command!(
    list_note_drafts,
    list_note_drafts,
    ListRequest,
    Vec<DraftEntry>
);
command!(get_note_draft, get_note_draft, IdRequest, NoteDraft);
command!(discard_note_draft, discard_note_draft, DiscardDraft, ());
#[tauri::command]
pub async fn export_note(state: State<'_, AppState>, input: serde_json::Value) -> AppResult<()> {
    let input: ExportNote =
        serde_json::from_value(input).map_err(|_| AppError::validation("笔记导出字段无效。"))?;
    let id = input.request_id.clone();
    let service = state.service()?;
    let _access = service
        .access
        .try_read()
        .map_err(|_| AppError::new(ErrorCode::DbBusy, "维护正在进行，请稍后重试。", true))?;
    service
        .note_export_bytes(input.clone())
        .await
        .map_err(|e| e.for_request(&id))?;
    let extension = match input.format {
        NoteExportFormat::Txt => "txt",
        NoteExportFormat::Markdown => "md",
    };
    let file = rfd::AsyncFileDialog::new()
        .set_title("导出笔记副本")
        .set_file_name(format!("笔记.{extension}"))
        .add_filter("笔记", &[extension])
        .save_file()
        .await
        .ok_or_else(|| {
            AppError::new(ErrorCode::Cancelled, "已取消笔记导出。", false).for_request(&id)
        })?;
    service
        .export_note_to(input, file.path().to_owned())
        .await
        .map_err(|e| e.for_request(&id))
}

command!(copy_note_draft, copy_note_draft, IdRequest, Note);

command!(query_tasks, query_tasks, TaskQuery, TaskPage);
command!(get_task, get_task, IdRequest, Task);
command!(create_task, create_task, CreateTask, Task);
command!(save_task, save_task, SaveTask, Task);
command!(set_task_deleted, set_task_deleted, SetTaskDeleted, Task);

command!(
    begin_document_edit,
    begin_document_edit,
    BeginDocumentEdit,
    DocumentSession
);
command!(
    get_document_session,
    get_document_session,
    IdRequest,
    DocumentSession
);
command!(
    list_document_sessions,
    list_document_sessions,
    ListRequest,
    Vec<DocumentSession>
);
command!(
    write_markdown_draft,
    write_markdown_draft,
    WriteMarkdownDraft,
    DocumentSession
);
command!(
    commit_document_edit,
    commit_document_edit,
    CommitDocumentEdit,
    DocumentSave
);
command!(copy_document_edit, copy_document_edit, IdRequest, Resource);
command!(end_document_edit, end_document_edit, EndDocumentEdit, ());
command!(
    list_file_versions,
    list_file_versions,
    VersionQuery,
    Vec<FileVersion>
);
command!(
    restore_file_version,
    restore_file_version,
    RestoreVersion,
    Resource
);
command!(
    list_office_editors,
    list_office_editors,
    Request,
    Vec<OfficeEditor>
);
command!(
    open_document_editor,
    open_document_editor,
    OpenDocumentEditor,
    ()
);
command!(preview_markdown, preview_markdown, PreviewMarkdown, String);
command!(create_document, create_document, CreateDocument, Resource);

#[tauri::command]
pub async fn export_file_version(
    state: State<'_, AppState>,
    input: serde_json::Value,
) -> AppResult<()> {
    let input: VersionRequest =
        serde_json::from_value(input).map_err(|_| AppError::validation("版本导出字段无效。"))?;
    crate::platform::domain::id(&input.request_id)?;
    crate::platform::domain::id(&input.id)?;
    crate::platform::domain::id(&input.version_id)?;
    let request_id = input.request_id.clone();
    let service = state.service()?;
    let _access = service
        .access
        .try_read()
        .map_err(|_| AppError::new(ErrorCode::DbBusy, "维护正在进行，请稍后重试。", true))?;
    let resource = service
        .get_resource(IdRequest {
            request_id: input.request_id.clone(),
            id: input.id.clone(),
        })
        .await?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("导出历史文件版本")
        .set_file_name(resource.original_name.unwrap_or(resource.name))
        .save_file()
        .await
        .ok_or_else(|| {
            AppError::new(ErrorCode::Cancelled, "已取消版本导出。", false).for_request(&request_id)
        })?;
    service
        .export_file_version(input, file.path().to_owned())
        .await
        .map_err(|error| error.for_request(&request_id))
}
command!(startup_workspace, startup, Request, Startup);
command!(get_preferences, get_preferences, Request, Preferences);
command!(
    save_preferences,
    save_preferences,
    SavePreferences,
    Preferences
);
command!(reset_preferences, reset_preferences, Request, Preferences);
command!(save_location, save_location, SaveLocation, ());
command!(search_workspace, search, SearchQuery, SearchPage);
command!(rebuild_search, rebuild_search, Request, ());
command!(dashboard, dashboard, Request, Dashboard);
command!(list_trash, trash, TrashQuery, Vec<TrashItem>);
command!(delete_impact, delete_impact, TrashMutation, DeleteImpact);
command!(restore_trash, restore_trash, TrashMutation, ());
command!(purge_trash, purge_trash, TrashMutation, ());
command!(storage_info, storage_info, Request, StorageInfo);
command!(list_backups, list_backups, Request, Vec<BackupRecord>);
macro_rules! maintenance_command {
    ($name:ident,$method:ident,$input:ty,$output:ty) => {
        #[tauri::command]
        pub async fn $name(
            state: State<'_, AppState>,
            input: serde_json::Value,
        ) -> AppResult<$output> {
            let q: $input = serde_json::from_value(input)
                .map_err(|_| AppError::validation("维护命令无效。"))?;
            let request = q.request_id.clone();
            state
                .service()?
                .$method(q)
                .await
                .map_err(|e| e.for_request(&request))
        }
    };
}
maintenance_command!(start_backup, start_backup, Request, Job);
maintenance_command!(automatic_backup, automatic_backup, Request, Option<Job>);
maintenance_command!(start_restore, start_restore, IdRequest, Job);
maintenance_command!(list_jobs, list_jobs, Request, Vec<Job>);
maintenance_command!(cancel_job, cancel_job, IdRequest, ());
#[tauri::command]
pub async fn inspect_restore(
    state: State<'_, AppState>,
    input: serde_json::Value,
) -> AppResult<RestorePreview> {
    let q: Request =
        serde_json::from_value(input).map_err(|_| AppError::validation("恢复请求无效。"))?;
    let service = state.service()?;
    let _access = service
        .access
        .try_read()
        .map_err(|_| AppError::new(ErrorCode::DbBusy, "维护正在进行，请稍后重试。", true))?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("选择完整备份")
        .add_filter("墨枢备份", &["zip"])
        .pick_file()
        .await
        .ok_or_else(|| AppError::new(ErrorCode::Cancelled, "已取消选择备份。", false))?;
    service.inspect_restore(q, file.path()).await
}
#[tauri::command]
pub async fn export_backup(state: State<'_, AppState>, input: serde_json::Value) -> AppResult<()> {
    let q: IdRequest =
        serde_json::from_value(input).map_err(|_| AppError::validation("备份请求无效。"))?;
    crate::platform::domain::id(&q.request_id)?;
    let service = state.service()?;
    let _access = service
        .access
        .try_read()
        .map_err(|_| AppError::new(ErrorCode::DbBusy, "维护正在进行。", true))?;
    service.backup_path(&q.id)?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("导出完整备份")
        .set_file_name("墨枢备份.moshub.zip")
        .save_file()
        .await
        .ok_or_else(|| AppError::new(ErrorCode::Cancelled, "已取消备份导出。", false))?;
    service.export_backup_file(q, file.path().to_owned()).await
}
#[tauri::command]
pub async fn open_data_directory(
    state: State<'_, AppState>,
    input: serde_json::Value,
) -> AppResult<()> {
    let q: Request =
        serde_json::from_value(input).map_err(|_| AppError::validation("请求无效。"))?;
    crate::platform::domain::id(&q.request_id)?;
    opener::open(state.service()?.data_root())
        .map_err(|_| AppError::new(ErrorCode::IoError, "无法打开数据目录。", true))
}
#[tauri::command]
pub async fn export_diagnostics(
    state: State<'_, AppState>,
    input: serde_json::Value,
) -> AppResult<()> {
    let q: Request =
        serde_json::from_value(input).map_err(|_| AppError::validation("请求无效。"))?;
    let service = state.service()?;
    let status = service.status(q.clone()).await?;
    let jobs = service.list_jobs(q).await?;
    let text=serde_json::to_vec_pretty(&serde_json::json!({"appVersion":status.app_version,"schemaVersion":status.schema_version,"os":std::env::consts::OS,"errors":jobs.iter().filter_map(|j|j.error_code.as_ref()).collect::<Vec<_>>()})).map_err(|_|AppError::validation("诊断格式无效。"))?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("导出脱敏诊断")
        .set_file_name("moshub-diagnostics.json")
        .save_file()
        .await
        .ok_or_else(|| AppError::new(ErrorCode::Cancelled, "已取消诊断导出。", false))?;
    std::fs::write(file.path(), text)
        .map_err(|_| AppError::new(ErrorCode::IoError, "诊断导出失败。", true))
}
command!(
    list_modules,
    list_modules,
    Request,
    Vec<crate::platform::modules::ModuleInfo>
);
command!(
    set_module,
    set_module,
    SetModule,
    crate::platform::modules::ModuleInfo
);
command!(
    module_access,
    module_access,
    ModuleRequest,
    crate::platform::modules::ModuleInfo
);
