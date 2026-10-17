use crate::{
    contracts::*,
    modules::mogao::{MogaoService, contracts::*},
};
use tauri::State;
pub struct MogaoState(pub AppResult<MogaoService>);
impl MogaoState {
    fn service(&self) -> AppResult<&MogaoService> {
        self.0.as_ref().map_err(Clone::clone)
    }
}
macro_rules! command {
    ($name:ident,$method:ident,$input:ty,$output:ty) => {
        #[tauri::command]
        pub async fn $name(
            state: State<'_, MogaoState>,
            input: serde_json::Value,
        ) -> AppResult<$output> {
            let q: $input = serde_json::from_value(input)
                .map_err(|_| AppError::validation("墨稿命令字段缺失或格式无效。"))?;
            let req = q.request_id.clone();
            state
                .service()?
                .$method(q)
                .await
                .map_err(|e| e.for_request(&req))
        }
    };
}
command!(mogao_location, location, Request, Location);
command!(
    mogao_save_location,
    save_location,
    crate::modules::mogao::contracts::SaveLocation,
    ()
);
command!(mogao_works, works, WorkQuery, Vec<Work>);
command!(mogao_save_work, save_work, SaveWork, Work);
command!(mogao_delete_work, delete_work, Mutation, Work);
command!(mogao_tree, tree, Scope, Tree);
command!(mogao_create_node, create_node, CreateNode, Tree);
command!(mogao_move_node, move_node, MoveNode, Tree);
command!(mogao_delete_volume, delete_volume, Mutation, Tree);
command!(mogao_copy_draft, copy_draft, Entity, Chapter);
command!(mogao_delete_chapter, delete_chapter, Mutation, Tree);
command!(mogao_chapter, chapter, Entity, Chapter);
command!(mogao_save_chapter, save_chapter, SaveChapter, SaveReceipt);
command!(mogao_versions, versions, Entity, Vec<Version>);
command!(mogao_restore, restore, RestoreChapter, Chapter);
command!(mogao_draft, draft, Entity, Option<Draft>);
command!(mogao_write_draft, write_draft, WriteChapterDraft, ());
command!(mogao_clear_draft, clear_draft, ClearChapterDraft, ());
command!(mogao_settings, settings, Scope, Vec<Setting>);
command!(mogao_save_setting, save_setting, SaveSetting, Setting);
command!(mogao_delete_setting, delete_setting, Mutation, ());
command!(mogao_import, import, ImportWork, Work);
#[tauri::command]
pub async fn mogao_preview_txt(
    state: State<'_, MogaoState>,
    input: serde_json::Value,
) -> AppResult<Vec<ImportChapter>> {
    let q: Request =
        serde_json::from_value(input).map_err(|_| AppError::validation("导入请求无效。"))?;
    state
        .service()?
        .platform
        .module_access(ModuleRequest {
            request_id: q.request_id,
            id: "mogao".into(),
        })
        .await?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("导入 UTF-8 小说 · 上限 20 MB")
        .add_filter("TXT", &["txt"])
        .pick_file()
        .await
        .ok_or_else(|| AppError::new(ErrorCode::Cancelled, "已取消选择。", false))?;
    let path = file.path().to_owned();
    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let f = std::fs::File::open(path)
            .map_err(|_| AppError::new(ErrorCode::IoError, "无法读取 TXT。", true))?;
        let mut bytes = Vec::new();
        f.take(20 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| AppError::new(ErrorCode::IoError, "TXT 读取中断。", true))?;
        MogaoService::preview_txt(&bytes)
    })
    .await
    .map_err(|_| AppError::new(ErrorCode::IoError, "预览任务中断。", true))?
}
#[tauri::command]
pub async fn mogao_export(state: State<'_, MogaoState>, input: serde_json::Value) -> AppResult<()> {
    let q: ExportWork =
        serde_json::from_value(input).map_err(|_| AppError::validation("导出请求无效。"))?;
    // Capture a consistent saved revision before the destination dialog; never reread a different chapter afterward.
    let bytes = state.service()?.export(q.clone()).await?;
    let ext = match q.format.as_str() {
        "markdown" => "md",
        "json" => "json",
        _ => "txt",
    };
    let file = rfd::AsyncFileDialog::new()
        .set_title("导出小说副本")
        .set_file_name(format!("作品.{ext}"))
        .save_file()
        .await
        .ok_or_else(|| AppError::new(ErrorCode::Cancelled, "已取消导出。", false))?;
    let path = file.path().to_owned();
    tokio::task::spawn_blocking(move || {
        use std::io::Write;
        let parent = path
            .parent()
            .ok_or_else(|| AppError::validation("导出位置无效。"))?;
        let mut temp = tempfile::NamedTempFile::new_in(parent)
            .map_err(|_| AppError::new(ErrorCode::IoError, "无法创建导出临时文件。", true))?;
        temp.write_all(&bytes)
            .and_then(|_| temp.as_file().sync_all())
            .map_err(|_| AppError::new(ErrorCode::IoError, "导出写入失败，原文件保留。", true))?;
        temp.persist(&path)
            .map_err(|_| AppError::new(ErrorCode::IoError, "无法替换导出文件。", true))?;
        Ok(())
    })
    .await
    .map_err(|_| AppError::new(ErrorCode::IoError, "导出任务中断。", true))?
}

command!(
    mogao_studio_request,
    studio_request,
    crate::modules::mogao::studio::StudioRequest,
    serde_json::Value
);

#[tauri::command]
pub async fn mogao_studio_ai_settings(
    state: State<'_, MogaoState>,
    input: serde_json::Value,
) -> AppResult<serde_json::Value> {
    state
        .service()?
        .ai_settings(input.get("settings").filter(|v| !v.is_null()).cloned())
        .await
}
#[tauri::command]
pub async fn mogao_studio_ai(
    state: State<'_, MogaoState>,
    input: serde_json::Value,
    on_chunk: tauri::ipc::Channel<serde_json::Value>,
) -> AppResult<serde_json::Value> {
    let id = input["requestId"]
        .as_str()
        .ok_or_else(|| AppError::validation("AI 请求 ID 缺失。"))?;
    state
        .service()?
        .ai_run(id, input["payload"].clone(), move |value| {
            on_chunk
                .send(value)
                .map_err(|_| AppError::new(ErrorCode::Cancelled, "创作页面已关闭。", false))
        })
        .await
}
#[tauri::command]
pub async fn mogao_studio_ai_cancel(
    state: State<'_, MogaoState>,
    input: serde_json::Value,
) -> AppResult<()> {
    let id = input["id"]
        .as_str()
        .ok_or_else(|| AppError::validation("AI 请求 ID 缺失。"))?;
    crate::platform::domain::id(id)?;
    state.service()?.ai.cancel(id);
    Ok(())
}
#[tauri::command]
pub async fn mogao_studio_export(
    state: State<'_, MogaoState>,
    input: serde_json::Value,
) -> AppResult<()> {
    state
        .service()?
        .platform
        .module_access(ModuleRequest {
            request_id: uuid::Uuid::new_v4().to_string(),
            id: "mogao".into(),
        })
        .await?;
    let name = input["filename"]
        .as_str()
        .ok_or_else(|| AppError::validation("导出文件名缺失。"))?;
    if name.len() > 250
        || name.contains(['/', '\\', '\0'])
        || !["txt", "md", "mgao", "json", "docx"]
            .iter()
            .any(|ext| name.ends_with(&format!(".{ext}")))
    {
        return Err(AppError::validation("不支持的导出文件名或类型。"));
    }
    let bytes: Vec<u8> = serde_json::from_value(input["bytes"].clone())
        .map_err(|_| AppError::validation("导出字节无效。"))?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err(AppError::validation("导出超过 64 MiB。"));
    }
    let file = rfd::AsyncFileDialog::new()
        .set_title("导出墨稿作品")
        .set_file_name(name)
        .save_file()
        .await
        .ok_or_else(|| AppError::new(ErrorCode::Cancelled, "已取消导出。", false))?;
    let path = file.path().to_owned();
    tokio::task::spawn_blocking(move || {
        use std::io::Write;
        let mut tmp = tempfile::NamedTempFile::new_in(
            path.parent()
                .ok_or_else(|| AppError::validation("导出位置无效。"))?,
        )
        .map_err(|_| AppError::new(ErrorCode::IoError, "无法创建导出临时文件。", true))?;
        tmp.write_all(&bytes)
            .and_then(|_| tmp.as_file().sync_all())
            .map_err(|_| AppError::new(ErrorCode::IoError, "导出失败，原文件保留。", true))?;
        tmp.persist(path)
            .map_err(|_| AppError::new(ErrorCode::IoError, "无法替换导出文件。", true))?;
        Ok(())
    })
    .await
    .map_err(|_| AppError::new(ErrorCode::IoError, "导出任务中断。", true))?
}
