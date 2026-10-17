use crate::contracts::{AppError, AppResult, ErrorCode};
use std::path::{Path, PathBuf};

pub struct WorkspacePaths {
    pub root: PathBuf,
    pub database: PathBuf,
    pub lock: PathBuf,
}
fn io_error() -> AppError {
    AppError::new(
        ErrorCode::IoError,
        "无法访问应用数据目录，请检查磁盘和权限。",
        true,
    )
}
impl WorkspacePaths {
    pub fn initialize(root: &Path) -> AppResult<Self> {
        if !root.is_absolute() {
            return Err(AppError::validation("数据目录必须为系统解析的绝对路径。"));
        }
        std::fs::create_dir_all(root).map_err(|_| io_error())?;
        let root = root.canonicalize().map_err(|_| io_error())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700))
                .map_err(|_| io_error())?;
        }
        for name in ["attachments", "drafts", "backups", "logs", "editing"] {
            let path = root.join(name);
            if path.is_symlink() {
                return Err(io_error());
            }
            std::fs::create_dir_all(&path).map_err(|_| io_error())?;
            if !path
                .canonicalize()
                .map_err(|_| io_error())?
                .starts_with(&root)
            {
                return Err(io_error());
            }
        }
        let database = root.join("workspace.sqlite");
        let lock = root.join("workspace.lock");
        for path in [
            &database,
            &lock,
            &root.join("workspace.sqlite-wal"),
            &root.join("workspace.sqlite-shm"),
        ] {
            if path.is_symlink() {
                return Err(io_error());
            }
        }
        Ok(Self {
            root,
            database,
            lock,
        })
    }
}
