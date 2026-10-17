use super::attachments::{MAX_FILE_SIZE, read_bounded, sync_directory};
use crate::contracts::*;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

fn io_error() -> AppError {
    AppError::new(
        ErrorCode::IoError,
        "编辑副本暂不可用，原件和编辑会话已保留。",
        true,
    )
}
pub fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
pub fn format(filename: &str) -> AppResult<String> {
    let extension = Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !["md", "markdown", "docx", "doc", "xlsx", "xls", "csv", "tsv"].contains(&extension.as_str())
    {
        return Err(AppError::validation("此文件不支持文档编辑。"));
    }
    Ok(extension)
}
pub fn markdown(bytes: &[u8]) -> AppResult<String> {
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(AppError::validation("Markdown 编辑上限为 UTF-8 / 2 MiB。"));
    }
    String::from_utf8(bytes.to_vec())
        .map_err(|_| AppError::validation("Markdown 需要 UTF-8 编码。"))
}
// Only an opaque, validated session ID crosses IPC. Office never receives a managed blob.
pub fn copy_path(root: &Path, session: &DocumentSession) -> AppResult<PathBuf> {
    crate::platform::domain::id(&session.id)?;
    if session.filename.contains(['/', '\\'])
        || session.filename.chars().any(char::is_control)
        || session.filename.is_empty()
        || session.filename.len() > 240
    {
        return Err(io_error());
    }
    let directory = root.join("editing");
    if directory.is_symlink() || directory.canonicalize().map_err(|_| io_error())? != directory {
        return Err(io_error());
    }
    let folder = directory.join(&session.id);
    if folder.is_symlink() {
        return Err(io_error());
    }
    fs::create_dir_all(&folder).map_err(|_| io_error())?;
    if folder.canonicalize().map_err(|_| io_error())? != folder {
        return Err(io_error());
    }
    let path = folder.join(&session.filename);
    if path.is_symlink() {
        return Err(io_error());
    }
    Ok(path)
}
pub fn create_copy(root: &Path, session: &DocumentSession, bytes: &[u8]) -> AppResult<()> {
    let path = copy_path(root, session)?;
    let folder = path.parent().ok_or_else(io_error)?;
    let mut temp = tempfile::NamedTempFile::new_in(folder).map_err(|_| io_error())?;
    temp.write_all(bytes).map_err(|_| io_error())?;
    temp.as_file().sync_all().map_err(|_| io_error())?;
    temp.persist_noclobber(&path).map_err(|_| io_error())?;
    sync_directory(folder)?;
    sync_directory(&root.join("editing"))
}
pub fn office_closed(root: &Path, session: &DocumentSession) -> AppResult<()> {
    let path = copy_path(root, session)?;
    let folder = path.parent().ok_or_else(io_error)?;
    if folder
        .join(format!(".~lock.{}#", session.filename))
        .exists()
        || folder.join(format!("~${}", session.filename)).exists()
    {
        return Err(AppError::validation(
            "请先在 Office 中保存并关闭此文档，再回到墨枢提交。",
        ));
    }
    Ok(())
}
pub fn read_copy(root: &Path, session: &DocumentSession) -> AppResult<Vec<u8>> {
    let path = copy_path(root, session)?;
    let before = fs::metadata(&path).map_err(|_| io_error())?;
    let bytes = read_bounded(&path, MAX_FILE_SIZE)?;
    let after = fs::metadata(&path).map_err(|_| io_error())?;
    if before.len() != after.len()
        || before.modified().ok() != after.modified().ok()
        || bytes.len() as u64 != after.len()
    {
        return Err(AppError::new(
            ErrorCode::IoError,
            "Office 仍在写入，请保存并关闭文档后重试。",
            true,
        ));
    }
    Ok(bytes)
}
pub fn remove_copy(root: &Path, session: &DocumentSession) -> AppResult<()> {
    let path = copy_path(root, session)?;
    // Delete only our file, not Office's unknown sidecars or another process's lock.
    if path.exists() {
        fs::remove_file(&path).map_err(|_| io_error())?;
    }
    let parent = path.parent().ok_or_else(io_error)?;
    sync_directory(parent)?;
    let _ = fs::remove_dir(parent);
    sync_directory(&root.join("editing"))
}

pub fn editors() -> Vec<OfficeEditor> {
    let mut result = vec![OfficeEditor {
        id: "system".into(),
        name: "系统默认应用".into(),
        formats: vec!["docx", "doc", "xlsx", "xls", "csv", "tsv"]
            .into_iter()
            .map(String::from)
            .collect(),
    }];
    #[cfg(target_os = "macos")]
    for (id, name, path, formats) in [
        (
            "word",
            "Microsoft Word",
            "/Applications/Microsoft Word.app",
            vec!["docx", "doc"],
        ),
        (
            "excel",
            "Microsoft Excel",
            "/Applications/Microsoft Excel.app",
            vec!["xlsx", "xls", "csv", "tsv"],
        ),
        (
            "wps",
            "WPS Office",
            "/Applications/wpsoffice.app",
            vec!["docx", "doc", "xlsx", "xls", "csv", "tsv"],
        ),
        (
            "libreoffice",
            "LibreOffice",
            "/Applications/LibreOffice.app",
            vec!["docx", "doc", "xlsx", "xls", "csv", "tsv"],
        ),
    ] {
        if Path::new(path).is_dir() {
            result.push(OfficeEditor {
                id: id.into(),
                name: name.into(),
                formats: formats.into_iter().map(String::from).collect(),
            });
        }
    }
    // An explicit developer override is never used by Release and never returned as a private path.
    #[cfg(all(debug_assertions, target_os = "macos"))]
    if std::env::var_os("MOSHUB_DEV_OFFICE_APP").is_some_and(|s| Path::new(&s).is_dir()) {
        result.push(OfficeEditor {
            id: "development".into(),
            name: "LibreOffice（开发验证）".into(),
            formats: vec!["docx", "doc", "xlsx", "xls", "csv", "tsv"]
                .into_iter()
                .map(String::from)
                .collect(),
        });
    }
    result
}
#[cfg(feature = "desktop")]
pub fn open_editor(root: &Path, session: &DocumentSession, id: &str) -> AppResult<()> {
    let editor = editors()
        .into_iter()
        .find(|e| e.id == id && e.formats.contains(&session.format))
        .ok_or_else(|| AppError::validation("所选编辑器不可用，请选择已安装的 Office 应用。"))?;
    let path = copy_path(root, session)?;
    // Verify the working file exists and is a regular, bounded file before launching.
    read_copy(root, session)?;
    if editor.id == "system" {
        return opener::open(path).map_err(|_| {
            AppError::new(
                ErrorCode::IoError,
                "没有可打开此文件的默认应用，请安装 Office、WPS 或 LibreOffice。",
                true,
            )
        });
    }
    #[cfg(target_os = "macos")]
    {
        let application = match editor.id.as_str() {
            "word" => PathBuf::from("/Applications/Microsoft Word.app"),
            "excel" => PathBuf::from("/Applications/Microsoft Excel.app"),
            "wps" => PathBuf::from("/Applications/wpsoffice.app"),
            "libreoffice" => PathBuf::from("/Applications/LibreOffice.app"),
            #[cfg(debug_assertions)]
            "development" => std::env::var_os("MOSHUB_DEV_OFFICE_APP")
                .map(PathBuf::from)
                .ok_or_else(io_error)?,
            _ => return Err(io_error()),
        };
        let mut command = std::process::Command::new("/usr/bin/open");
        command.arg("-a").arg(application).arg(&path);
        #[cfg(debug_assertions)]
        if editor.id == "development"
            && let Some(profile) = std::env::var_os("MOSHUB_DEV_OFFICE_PROFILE")
        {
            let profile = PathBuf::from(profile);
            if !profile.is_absolute() || !profile.starts_with(root) {
                return Err(io_error());
            }
            let url = url::Url::from_directory_path(profile).map_err(|_| io_error())?;
            command
                .arg("--args")
                .arg(format!("-env:UserInstallation={url}"));
            command.arg(&path);
        }
        let status = command
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|_| io_error())?;
        if !status.success() {
            return Err(io_error());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    Err(AppError::validation(
        "此编辑器不可用，请使用系统默认 Office 应用。",
    ))
}
