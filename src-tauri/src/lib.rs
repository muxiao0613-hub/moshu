#[cfg(feature = "desktop")]
mod commands;
pub mod contracts;
pub mod infrastructure;
pub mod modules;
pub mod platform;

#[cfg(feature = "desktop")]
pub fn run() -> tauri::Result<()> {
    use tauri::{Emitter, Manager};
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some((width,height))=match std::env::var("MOSHUB_DEV_WINDOW_SIZE").as_deref(){Ok("1024x720")=>Some((1024.0,720.0)),Ok("1440x900")=>Some((1440.0,900.0)),_=>None}
                && let Some(window)=app.get_webview_window("main") {window.set_size(tauri::LogicalSize::new(width,height))?;}

            let data_path = app.path().app_data_dir();
            // Isolate desktop smoke tests; release builds always use the system application directory.
            #[cfg(debug_assertions)]
            let data_path = match std::env::var_os("MOSHUB_DEV_WORKSPACE") {
                Some(path) => Ok(std::path::PathBuf::from(path)),
                None => data_path,
            };
            let service = data_path
                .map_err(|_| {
                    contracts::AppError::new(
                        contracts::ErrorCode::IoError,
                        "无法解析系统数据目录。",
                        false,
                    )
                })
                .and_then(|path| infrastructure::database::Database::open(&path))
                .map(|database| (platform::service::PlatformService::new(database.clone()), database));
            let (service,mogao)=match service {
                Ok((platform,database)) => {
                    let mogao=tauri::async_runtime::block_on(modules::mogao::MogaoService::install(database,platform.clone()));
                    (Ok(platform),mogao)
                },
                Err(error)=>(Err(error.clone()),Err(error)),
            };
            app.manage(commands::mogao::MogaoState(mogao));
            app.manage(commands::pet::PetDragState::default());
            // Startup failures reach the UI as structured errors; the original database is kept.
            let pet_service=service.as_ref().ok().cloned();
            app.manage(commands::AppState(service));
            if let Some(platform)=pet_service {let handle=app.handle().clone();tauri::async_runtime::spawn(async move {let _=commands::pet::restore(handle,platform).await;});}
            Ok(())
        })
        .on_window_event(|window,event| {
            #[cfg(debug_assertions)]
            if window.label()=="desktop-pet" && std::env::var("MOSHUB_DEV_PET_TRACE").as_deref()==Ok("1") && let tauri::WindowEvent::Moved(position)=event {eprintln!("pet-window-position {},{}",position.x,position.y);}
            if window.label()=="main" && matches!(event,tauri::WindowEvent::Destroyed) && let Some(pet)=window.app_handle().get_webview_window("desktop-pet"){let _=pet.destroy();}
            if window.label()=="desktop-pet" && let tauri::WindowEvent::CloseRequested{api,..}=event {api.prevent_close();let app=window.app_handle().clone();tauri::async_runtime::spawn(async move {let state=app.state::<commands::AppState>();let _=commands::pet::pet_action(app.clone(),state,contracts::PetAction{request_id:uuid::Uuid::new_v4().to_string(),action:contracts::PetActionKind::Hide}).await;});}
            if window.label()=="main" && let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop{paths,..})=event {
                let state=window.state::<commands::AppState>();
                if let Ok(service)=&state.0 {let service=service.clone();let paths=paths.clone();let app=window.app_handle().clone();tauri::async_runtime::spawn(async move {
                    let Ok(_access)=service.access.try_read() else {let _=app.emit("file-drop-result",serde_json::json!({"count":0,"error":"维护正在进行，请稍后重新拖入。"}));return;};
                    if paths.len()>20 {let _=app.emit("file-drop-result",serde_json::json!({"count":0,"error":"每次最多拖入 20 份文件。"}));return;}
                    let mut count=0;let mut errors=0;
                    for path in paths {let q=contracts::ImportFile{request_id:uuid::Uuid::new_v4().to_string(),folder_id:None,project_id:None};match service.import_file(q,&path).await{Ok(_)=>count+=1,Err(_)=>errors+=1};}
                    let _=app.emit("file-drop-result",serde_json::json!({"count":count,"error":if errors>0{Some(format!("{errors} 份文件未导入，请检查大小、类型和权限；已成功的资料保留。"))}else{None}}));
                });}
            }
        })
        .invoke_handler(|invoke| {
            if !commands::pet::command_allowed(invoke.message.webview_ref().label(),invoke.message.command()) {invoke.resolver.reject(contracts::AppError::validation("此窗口不支持该操作。"));return true;}
            let handler: fn(tauri::ipc::Invoke) -> bool = tauri::generate_handler![
            commands::pet::get_desktop_pet,
            commands::pet::save_desktop_pet,
            commands::pet::pet_action,
            commands::pet::pet_drag,
            commands::mogao::mogao_studio_request,
            commands::mogao::mogao_studio_ai_settings,
            commands::mogao::mogao_studio_ai,
            commands::mogao::mogao_studio_ai_cancel,
            commands::mogao::mogao_studio_export,
            commands::mogao::mogao_works,
            commands::mogao::mogao_location,
            commands::mogao::mogao_save_location,
            commands::mogao::mogao_save_work,
            commands::mogao::mogao_delete_work,
            commands::mogao::mogao_tree,
            commands::mogao::mogao_create_node,
            commands::mogao::mogao_move_node,
            commands::mogao::mogao_delete_chapter,
            commands::mogao::mogao_delete_volume,
            commands::mogao::mogao_copy_draft,
            commands::mogao::mogao_chapter,
            commands::mogao::mogao_save_chapter,
            commands::mogao::mogao_versions,
            commands::mogao::mogao_restore,
            commands::mogao::mogao_draft,
            commands::mogao::mogao_write_draft,
            commands::mogao::mogao_clear_draft,
            commands::mogao::mogao_settings,
            commands::mogao::mogao_save_setting,
            commands::mogao::mogao_delete_setting,
            commands::mogao::mogao_import,
            commands::mogao::mogao_preview_txt,
            commands::mogao::mogao_export,
            commands::list_module_library,
            commands::read_module_library,
            commands::workspace_status,
            commands::list_modules,
            commands::module_access,
            commands::set_module,
            commands::startup_workspace,
            commands::get_preferences,
            commands::save_preferences,
            commands::reset_preferences,
            commands::save_location,
            commands::search_workspace,
            commands::rebuild_search,
            commands::dashboard,
            commands::list_trash,
            commands::delete_impact,
            commands::restore_trash,
            commands::purge_trash,
            commands::storage_info,
            commands::list_backups,
            commands::start_backup,
            commands::automatic_backup,
            commands::start_restore,
            commands::list_jobs,
            commands::cancel_job,
            commands::inspect_restore,
            commands::export_backup,
            commands::open_data_directory,
            commands::export_diagnostics,
            commands::begin_document_edit,
            commands::get_document_session,
            commands::list_document_sessions,
            commands::write_markdown_draft,
            commands::commit_document_edit,
            commands::copy_document_edit,
            commands::end_document_edit,
            commands::list_file_versions,
            commands::export_file_version,
            commands::restore_file_version,
            commands::list_office_editors,
            commands::open_document_editor,
            commands::preview_markdown,
            commands::create_document,
            commands::list_projects,
            commands::create_project,
            commands::update_project,
            commands::set_project_deleted,
            commands::list_notes,
            commands::create_note,
            commands::get_note,
            commands::save_note,
            commands::query_projects,
            commands::get_project,
            commands::save_project_details,
            commands::list_resources,
            commands::get_resource,
            commands::create_link,
            commands::save_resource,
            commands::set_resource_project,
            commands::set_resource_deleted,
            commands::list_folders,
            commands::create_folder,
            commands::save_folder,
            commands::delete_folder,
            commands::preview_file,
            commands::read_document,
            commands::preview_project_cover,
            commands::import_file,
            commands::export_file,
            commands::open_resource,
            commands::list_note_versions,
            commands::get_note_version,
            commands::restore_note_version,
            commands::write_note_draft,
            commands::list_note_drafts,
            commands::get_note_draft,
            commands::discard_note_draft,
            commands::export_note,
            commands::copy_note_draft,
            commands::query_tasks,
            commands::get_task,
            commands::create_task,
            commands::save_task,
            commands::set_task_deleted
        ];
            handler(invoke)
        })
        .run(tauri::generate_context!())
}
