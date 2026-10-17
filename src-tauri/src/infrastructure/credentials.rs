use crate::contracts::{AppError, AppResult, ErrorCode};

// S00 probes only a unique synthetic credential; no user's existing entries are read.
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn probe_system_store() -> AppResult<()> {
    let entry = keyring::Entry::new(
        "app.moshub.desktop.s00-probe",
        &uuid::Uuid::new_v4().to_string(),
    )
    .map_err(|_| unavailable())?;
    let value = uuid::Uuid::new_v4().to_string();
    entry.set_password(&value).map_err(|_| unavailable())?;
    let result = entry.get_password();
    let cleanup = entry.delete_credential();
    match (result, cleanup) {
        (Ok(actual), Ok(())) if actual == value => Ok(()),
        _ => Err(unavailable()),
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn probe_system_store() -> AppResult<()> {
    Err(unavailable())
}
fn unavailable() -> AppError {
    AppError::new(
        ErrorCode::AiUnavailable,
        "系统凭据存储验证失败；后续 AI 配置需使用明确标记的会话密钥。",
        false,
    )
}
