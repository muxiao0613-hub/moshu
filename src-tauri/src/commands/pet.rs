use super::AppState;
use crate::{contracts::*, platform::service::PlatformService};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const PET: &str = "desktop-pet";
#[derive(Default)]
pub struct PetDragState(std::sync::Mutex<Option<PetDrag>>);
struct PetDrag {
    id: String,
    x: f64,
    y: f64,
    left: i32,
    top: i32,
    scale: f64,
    bounds: (i32, i32, i32, i32),
}
impl PetDrag {
    fn position(&self, x: f64, y: f64) -> (i32, i32) {
        let left = (f64::from(self.left) + (x - self.x) * self.scale).round() as i32;
        let top = (f64::from(self.top) + (y - self.y) * self.scale).round() as i32;
        (
            left.clamp(self.bounds.0, self.bounds.2),
            top.clamp(self.bounds.1, self.bounds.3),
        )
    }
}
#[tauri::command]
pub async fn pet_drag(
    app: tauri::AppHandle,
    state: State<'_, PetDragState>,
    input: PetDragRequest,
) -> AppResult<()> {
    crate::platform::domain::id(&input.request_id)?;
    crate::platform::domain::id(&input.drag_id)?;
    if !input.x.is_finite()
        || !input.y.is_finite()
        || input.x.abs() > 1_000_000.0
        || input.y.abs() > 1_000_000.0
    {
        return Err(AppError::validation("拖动坐标无效。"));
    }
    let window = app
        .get_webview_window(PET)
        .ok_or_else(|| AppError::new(ErrorCode::NotFound, "桌宠尚未显示。", false))?;
    let mut drag = state
        .0
        .lock()
        .map_err(|_| AppError::new(ErrorCode::IoError, "拖动暂不可用，请重试。", true))?;
    match input.phase {
        PetDragPhase::Start => {
            let pos = window.outer_position().map_err(native_error)?;
            let size = window.outer_size().map_err(native_error)?;
            let monitor = window
                .current_monitor()
                .map_err(native_error)?
                .or(window.primary_monitor().map_err(native_error)?)
                .ok_or_else(|| AppError::new(ErrorCode::IoError, "无法定位当前屏幕。", true))?;
            let origin = monitor.position();
            let screen = monitor.size();
            let right = origin.x + (screen.width.saturating_sub(size.width)) as i32;
            let bottom = origin.y + (screen.height.saturating_sub(size.height)) as i32;
            *drag = Some(PetDrag {
                id: input.drag_id,
                x: input.x,
                y: input.y,
                left: pos.x,
                top: pos.y,
                scale: monitor.scale_factor(),
                bounds: (origin.x, origin.y, right, bottom),
            });
        }
        PetDragPhase::Move => {
            if let Some(session) = drag.as_ref().filter(|s| s.id == input.drag_id) {
                let (left, top) = session.position(input.x, input.y);
                window
                    .set_position(tauri::PhysicalPosition::new(left, top))
                    .map_err(native_error)?;
            }
        }
        PetDragPhase::End => {
            if drag.as_ref().is_some_and(|s| s.id == input.drag_id) {
                *drag = None;
            }
        }
    }
    Ok(())
}
fn native_error(_: tauri::Error) -> AppError {
    AppError::new(ErrorCode::IoError, "桌宠窗口操作未完成，请重试。", true)
}
pub fn command_allowed(window: &str, command: &str) -> bool {
    window == "main"
        || (window == PET && matches!(command, "get_desktop_pet" | "pet_action" | "pet_drag"))
}
fn visible(app: &tauri::AppHandle) -> bool {
    app.get_webview_window(PET)
        .is_some_and(|w| w.is_visible().unwrap_or(false))
}
fn dimensions(size: &PetSize) -> (f64, f64) {
    match size {
        PetSize::Small => (200.0, 270.0),
        PetSize::Medium => (240.0, 324.0),
        PetSize::Large => (288.0, 388.0),
    }
}
fn position(window: &WebviewWindow) -> AppResult<()> {
    if let Some(monitor) = window
        .current_monitor()
        .map_err(native_error)?
        .or(window.primary_monitor().map_err(native_error)?)
    {
        let scale = monitor.scale_factor();
        let origin = monitor.position();
        let screen = monitor.size();
        let size = window.outer_size().map_err(native_error)?;
        // Place the entire window inside the current screen, above the usual dock/taskbar.
        let x = origin.x + (screen.width as i32 - size.width as i32 - (24.0 * scale) as i32).max(0);
        let y =
            origin.y + (screen.height as i32 - size.height as i32 - (88.0 * scale) as i32).max(0);
        window
            .set_position(tauri::PhysicalPosition::new(x, y))
            .map_err(native_error)?;
    }
    Ok(())
}
pub fn sync_window(app: &tauri::AppHandle, prefs: &PetPreferences) -> AppResult<()> {
    if !prefs.enabled {
        if let Some(window) = app.get_webview_window(PET) {
            window.hide().map_err(native_error)?;
        }
        return Ok(());
    }
    let (width, height) = dimensions(&prefs.size);
    if let Some(window) = app.get_webview_window(PET) {
        window
            .set_always_on_top(prefs.always_on_top)
            .map_err(native_error)?;
        window
            .set_size(tauri::LogicalSize::new(width, height))
            .map_err(native_error)?;
        if !window.is_visible().map_err(native_error)? {
            position(&window)?;
            window.show().map_err(native_error)?;
        }
    } else {
        let window = WebviewWindowBuilder::new(
            app,
            PET,
            WebviewUrl::App("index.html?surface=desktop-pet".into()),
        )
        .title("墨枢 · 小狐狸")
        .inner_size(width, height)
        .decorations(false)
        .transparent(true)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(prefs.always_on_top)
        .focused(false)
        .visible(false)
        .disable_drag_drop_handler()
        .build()
        .map_err(native_error)?;
        position(&window)?;
        window.show().map_err(native_error)?;
    }
    Ok(())
}
pub async fn restore(app: tauri::AppHandle, service: PlatformService) -> AppResult<()> {
    let prefs = service
        .get_pet_preferences(Request {
            request_id: uuid::Uuid::new_v4().to_string(),
        })
        .await?;
    sync_window(&app, &prefs)
}
#[tauri::command]
pub async fn get_desktop_pet(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    input: Request,
) -> AppResult<DesktopPetState> {
    let request = input.request_id.clone();
    let result = state.service()?.get_pet_preferences(input).await;
    result
        .map(|preferences| DesktopPetState {
            preferences,
            visible: visible(&app),
        })
        .map_err(|e| e.for_request(&request))
}
#[tauri::command]
pub async fn save_desktop_pet(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    input: SavePetPreferences,
) -> AppResult<DesktopPetState> {
    let request = input.request_id.clone();
    let service = state.service()?;
    let _access = service
        .access
        .try_read()
        .map_err(|_| AppError::new(ErrorCode::DbBusy, "维护正在进行，请稍后设置桌宠。", true))?;
    let preferences = service
        .save_pet_preferences(input)
        .await
        .map_err(|e| e.for_request(&request))?;
    sync_window(&app, &preferences).map_err(|e| e.for_request(&request))?;
    let _ = app.emit_to("main", "desktop-pet-changed", ());
    Ok(DesktopPetState {
        preferences,
        visible: visible(&app),
    })
}
#[tauri::command]
pub async fn pet_action(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    input: PetAction,
) -> AppResult<()> {
    crate::platform::domain::id(&input.request_id)?;
    let result = async {
        match input.action {
            PetActionKind::OpenWorkspace => {
                if let Some(window) = app.get_webview_window("main") {
                    window.unminimize().map_err(native_error)?;
                    window.show().map_err(native_error)?;
                    window.set_focus().map_err(native_error)?;
                }
            }
            PetActionKind::Recenter => {
                if let Some(window) = app.get_webview_window(PET) {
                    position(&window)?;
                }
            }
            PetActionKind::Hide => {
                let service = state.service()?;
                let _access = service.access.try_read().map_err(|_| {
                    AppError::new(ErrorCode::DbBusy, "维护正在进行，请稍后收起桌宠。", true)
                })?;
                let current = service
                    .get_pet_preferences(Request {
                        request_id: input.request_id.clone(),
                    })
                    .await?;
                let prefs = service
                    .save_pet_preferences(SavePetPreferences {
                        request_id: input.request_id.clone(),
                        base_revision: current.revision,
                        preferences: PetPreferences {
                            enabled: false,
                            ..current
                        },
                    })
                    .await?;
                sync_window(&app, &prefs)?;
                let _ = app.emit_to("main", "desktop-pet-changed", ());
            }
        }
        Ok(())
    }
    .await;
    result.map_err(|e: AppError| e.for_request(&input.request_id))
}

#[cfg(test)]
mod tests {
    use super::{PetDrag, command_allowed};
    #[test]
    fn drag_scales_pointer_distance_and_keeps_the_whole_window_on_screen() {
        let drag = PetDrag {
            id: "test".into(),
            x: 50.0,
            y: 80.0,
            left: 500,
            top: 600,
            scale: 2.0,
            bounds: (0, 0, 1000, 1200),
        };
        assert_eq!(drag.position(40.0, 60.0), (480, 560));
        assert_eq!(drag.position(-900.0, 2000.0), (0, 1200));
    }
    #[test]
    fn companion_cannot_read_documents_or_call_ai_and_settings_commands() {
        assert!(command_allowed("main", "save_note"));
        assert!(command_allowed("desktop-pet", "pet_action"));
        assert!(command_allowed("desktop-pet", "get_desktop_pet"));
        for command in [
            "get_note",
            "read_module_library",
            "mogao_studio_ai",
            "save_desktop_pet",
            "export_diagnostics",
        ] {
            assert!(!command_allowed("desktop-pet", command));
        }
        assert!(!command_allowed("unregistered", "pet_action"));
    }
}
