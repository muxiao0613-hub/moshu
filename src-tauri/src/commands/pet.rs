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
/// Bounding envelope for movement between displays. The drop/restore step below
/// also checks individual displays so gaps in this envelope cannot hide the pet.
fn desktop_bounds(monitors: &[(i32, i32, u32, u32)], size: (u32, u32)) -> (i32, i32, i32, i32) {
    let Some(first) = monitors.first() else {
        return (0, 0, 0, 0);
    };
    let mut left = first.0;
    let mut top = first.1;
    let mut right = first.0.saturating_add(first.2 as i32);
    let mut bottom = first.1.saturating_add(first.3 as i32);
    for &(x, y, width, height) in &monitors[1..] {
        left = left.min(x);
        top = top.min(y);
        right = right.max(x.saturating_add(width as i32));
        bottom = bottom.max(y.saturating_add(height as i32));
    }
    (
        left,
        top,
        (right - size.0 as i32).max(left),
        (bottom - size.1 as i32).max(top),
    )
}
fn clamp_to(bounds: (i32, i32, i32, i32), point: (i32, i32)) -> (i32, i32) {
    (
        point.0.clamp(bounds.0, bounds.2),
        point.1.clamp(bounds.1, bounds.3),
    )
}
fn reachable_position(
    monitors: &[(i32, i32, u32, u32)],
    size: (u32, u32),
    point: (i32, i32),
) -> (i32, i32) {
    monitors
        .iter()
        .map(|monitor| clamp_to(desktop_bounds(&[*monitor], size), point))
        .min_by_key(|candidate| {
            let dx = i128::from(candidate.0) - i128::from(point.0);
            let dy = i128::from(candidate.1) - i128::from(point.1);
            dx * dx + dy * dy
        })
        .unwrap_or(point)
}
fn monitor_rects(window: &WebviewWindow) -> AppResult<Vec<(i32, i32, u32, u32)>> {
    Ok(window
        .available_monitors()
        .map_err(native_error)?
        .iter()
        .map(|monitor| {
            let origin = monitor.position();
            let size = monitor.size();
            (origin.x, origin.y, size.width, size.height)
        })
        .collect())
}
#[tauri::command]
pub async fn pet_drag(
    app: tauri::AppHandle,
    state: State<'_, PetDragState>,
    app_state: State<'_, AppState>,
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
    let dropped_at = {
        let mut drag = state
            .0
            .lock()
            .map_err(|_| AppError::new(ErrorCode::IoError, "拖动暂不可用，请重试。", true))?;
        let mut dropped_at = None;
        match input.phase {
            PetDragPhase::Start => {
                let pos = window.outer_position().map_err(native_error)?;
                let size = window.outer_size().map_err(native_error)?;
                let scale = window
                    .current_monitor()
                    .map_err(native_error)?
                    .or(window.primary_monitor().map_err(native_error)?)
                    .map(|monitor| monitor.scale_factor())
                    .unwrap_or(1.0);
                let monitors = monitor_rects(&window)?;
                let bounds = if monitors.is_empty() {
                    (pos.x, pos.y, pos.x, pos.y)
                } else {
                    desktop_bounds(&monitors, (size.width, size.height))
                };
                *drag = Some(PetDrag {
                    id: input.drag_id,
                    x: input.x,
                    y: input.y,
                    left: pos.x,
                    top: pos.y,
                    scale,
                    bounds,
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
                    if let Ok(pos) = window.outer_position() {
                        position(&window, Some((pos.x, pos.y)))?;
                    }
                    // Cosmetic state only: a failed write never reports a failed drag.
                    dropped_at = window.outer_position().ok().map(|pos| (pos.x, pos.y));
                }
            }
        }
        dropped_at
    };
    if let Some((x, y)) = dropped_at
        && let Ok(service) = app_state.service()
    {
        let _ = service.save_pet_position(x, y).await;
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
/// Keep the whole window on a real display when restoring, resizing or dropping it.
fn position(window: &WebviewWindow, remembered: Option<(i32, i32)>) -> AppResult<()> {
    let size = window.outer_size().map_err(native_error)?;
    let monitors = monitor_rects(window)?;
    if monitors.is_empty() {
        return Ok(());
    }
    let bounds = desktop_bounds(&monitors, (size.width, size.height));
    let target = match remembered {
        Some(point) => clamp_to(bounds, point),
        None => {
            let monitor = window
                .current_monitor()
                .map_err(native_error)?
                .or(window.primary_monitor().map_err(native_error)?);
            match monitor {
                Some(monitor) => {
                    let scale = monitor.scale_factor();
                    let origin = monitor.position();
                    let screen = monitor.size();
                    (
                        origin.x
                            + (screen.width as i32 - size.width as i32 - (24.0 * scale) as i32)
                                .max(0),
                        origin.y
                            + (screen.height as i32 - size.height as i32 - (88.0 * scale) as i32)
                                .max(0),
                    )
                }
                None => (bounds.2, bounds.3),
            }
        }
    };
    let target = reachable_position(&monitors, (size.width, size.height), target);
    window
        .set_position(tauri::PhysicalPosition::new(target.0, target.1))
        .map_err(native_error)?;
    Ok(())
}
pub fn sync_window(
    app: &tauri::AppHandle,
    prefs: &PetPreferences,
    remembered: Option<(i32, i32)>,
) -> AppResult<()> {
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
        let shown = window.is_visible().map_err(native_error)?;
        // Resizing or re-enabling must keep the whole companion on screen.
        let anchor = if shown {
            window
                .outer_position()
                .ok()
                .map(|pos| (pos.x, pos.y))
                .or(remembered)
        } else {
            remembered
        };
        position(&window, anchor)?;
        if !shown {
            window.show().map_err(native_error)?;
        }
    } else {
        let window = WebviewWindowBuilder::new(
            app,
            PET,
            WebviewUrl::App("index.html?surface=desktop-pet".into()),
        )
        .title("墨枢 · 南华")
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
        position(&window, remembered)?;
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
    let remembered = service.get_pet_position().await.unwrap_or(None);
    sync_window(&app, &prefs, remembered)
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
    let remembered = service.get_pet_position().await.unwrap_or(None);
    sync_window(&app, &preferences, remembered).map_err(|e| e.for_request(&request))?;
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
                    position(&window, None)?;
                    if let Ok(pos) = window.outer_position()
                        && let Ok(service) = state.service()
                    {
                        let _ = service.save_pet_position(pos.x, pos.y).await;
                    }
                }
            }
            PetActionKind::Greet => {
                let _ = app.emit_to(PET, "desktop-pet-greet", ());
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
                sync_window(&app, &prefs, None)?;
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
    use super::{PetDrag, clamp_to, command_allowed, desktop_bounds, reachable_position};
    #[test]
    fn drop_and_restore_snap_out_of_display_gaps_and_preserve_reachable_positions() {
        let monitors = [(0, 0, 1440, 900), (1440, -1080, 1920, 1080)];
        let size = (240, 324);
        assert_eq!(
            reachable_position(&monitors, size, (2000, 400)),
            (2000, -324)
        );
        assert_eq!(
            reachable_position(&monitors, size, (1600, -600)),
            (1600, -600)
        );
        // A disconnected screen and a too-large window still have a usable fallback.
        assert_eq!(
            reachable_position(&monitors[..1], size, (-1200, 600)),
            (0, 576)
        );
        assert_eq!(
            reachable_position(&[(0, 0, 300, 200)], (400, 300), (40, 50)),
            (0, 0)
        );
    }
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
    fn bounds_span_every_display_and_allow_crossing_screens() {
        // A 1440-wide primary plus a display to its left with a negative origin.
        let monitors = [(-1920, 0, 1920, 1080), (0, 0, 1440, 900)];
        assert_eq!(desktop_bounds(&monitors, (240, 324)), (-1920, 0, 1200, 756));
        assert_eq!(clamp_to((-1920, 0, 1200, 756), (-1500, 400)), (-1500, 400));
        assert_eq!(clamp_to((-1920, 0, 1200, 756), (-5000, 4000)), (-1920, 756));
    }
    #[test]
    fn bounds_keep_a_window_larger_than_the_display_anchored() {
        let monitors = [(0, 0, 300, 200)];
        assert_eq!(desktop_bounds(&monitors, (400, 300)), (0, 0, 0, 0));
    }
    #[test]
    fn companion_cannot_read_documents_or_call_ai_and_settings_commands() {
        assert!(command_allowed("main", "save_note"));
        assert!(command_allowed("desktop-pet", "pet_action"));
        assert!(command_allowed("desktop-pet", "get_desktop_pet"));
        assert!(command_allowed("desktop-pet", "pet_drag"));
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
