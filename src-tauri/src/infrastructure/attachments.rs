use crate::contracts::{AppError, AppResult, Blob, ErrorCode, FilePreview};
use base64::Engine;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub const MAX_FILE_SIZE: u64 = 100 * 1024 * 1024;
fn io_error() -> AppError {
    AppError::new(
        ErrorCode::IoError,
        "文件操作失败，请检查文件、磁盘空间和权限。",
        true,
    )
}
fn digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
#[derive(Clone)]
pub struct AttachmentStore {
    root: PathBuf,
}
pub struct ImportedFile {
    pub blob: Blob,
    pub original_name: String,
    pub name: String,
    pub created: bool,
}
impl AttachmentStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
    fn directory(&self) -> AppResult<PathBuf> {
        let path = self.root.join("attachments");
        if path.is_symlink() || path.canonicalize().map_err(|_| io_error())? != path {
            return Err(io_error());
        }
        Ok(path)
    }
    fn blob_path(&self, internal: &str) -> AppResult<PathBuf> {
        let (hash, ext) = internal.split_once('.').ok_or_else(io_error)?;
        if hash.len() != 64
            || !hash
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            || !["png", "jpg", "gif", "webp", "pdf", "txt", "bin"].contains(&ext)
        {
            return Err(io_error());
        }
        let path = self.directory()?.join(internal);
        if path.is_symlink() {
            return Err(io_error());
        }
        Ok(path)
    }
    pub fn import(&self, source: &Path) -> AppResult<ImportedFile> {
        self.import_observed(source, &|_| Ok(()))
    }
    pub fn import_observed(
        &self,
        source: &Path,
        progress: &dyn Fn(f64) -> AppResult<()>,
    ) -> AppResult<ImportedFile> {
        progress(0.0)?;
        if !source.is_absolute() || source.is_symlink() {
            return Err(AppError::validation("请选择普通文件。"));
        }
        let mut source_file = File::open(source).map_err(|_| io_error())?;
        let meta = source_file.metadata().map_err(|_| io_error())?;
        if !meta.is_file() {
            return Err(AppError::validation("请选择普通文件。"));
        }
        if meta.len() > MAX_FILE_SIZE {
            return Err(AppError::validation("每份文件上限为 100 MB。"));
        }
        let original_name = source
            .file_name()
            .and_then(|s| s.to_str())
            .filter(|s| !s.chars().any(char::is_control))
            .ok_or_else(|| AppError::validation("文件名无法识别。"))?
            .to_owned();
        let name =
            crate::platform::domain::title(&original_name.chars().take(200).collect::<String>())?;
        let directory = self.directory()?;
        let mut temp = tempfile::Builder::new()
            .prefix(".import-")
            .tempfile_in(&directory)
            .map_err(|_| io_error())?;
        let mut hasher = Sha256::new();
        let mut buffer = [0; 64 * 1024];
        let mut sample = Vec::new();
        let mut size = 0;
        loop {
            progress((size as f64 / meta.len().max(1) as f64).min(1.0) * 0.95)?;
            let count = source_file.read(&mut buffer).map_err(|_| io_error())?;
            if count == 0 {
                break;
            }
            size += count as u64;
            if size > MAX_FILE_SIZE {
                return Err(AppError::validation("文件在复制时超过了 100 MB 上限。"));
            }
            if sample.is_empty() {
                sample.extend_from_slice(&buffer[..count.min(4096)]);
            }
            hasher.update(&buffer[..count]);
            temp.write_all(&buffer[..count]).map_err(|_| io_error())?;
        }
        temp.as_file().sync_all().map_err(|_| io_error())?;
        let sha256: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let (mime, extension) = classify(&sample);
        let internal_path = format!("{sha256}.{extension}");
        let path = self.blob_path(&internal_path)?;
        progress(0.98)?;
        let created = match temp.persist_noclobber(&path) {
            Ok(file) => {
                file.sync_all().map_err(|_| io_error())?;
                true
            }
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                let bytes = read_bounded(&path, MAX_FILE_SIZE)?;
                if bytes.len() as u64 != size || digest(&bytes) != sha256 {
                    return Err(AppError::new(
                        ErrorCode::IoError,
                        "已有托管附件校验失败，请保留数据并检查备份。",
                        false,
                    ));
                }
                false
            }
            Err(_) => return Err(io_error()),
        };
        sync_directory(&directory)?;
        Ok(ImportedFile {
            blob: Blob {
                id: uuid::Uuid::new_v4().to_string(),
                sha256,
                internal_path,
                size,
                mime_type: mime.into(),
            },
            original_name,
            name,
            created,
        })
    }
    pub fn remove_uncommitted(&self, blob: &Blob) -> AppResult<()> {
        fs::remove_file(self.blob_path(&blob.internal_path)?).map_err(|_| io_error())?;
        sync_directory(&self.directory()?)
    }
    pub fn read(&self, blob: &Blob) -> AppResult<Vec<u8>> {
        let bytes = read_bounded(&self.blob_path(&blob.internal_path)?, MAX_FILE_SIZE)?;
        if bytes.len() as u64 != blob.size || digest(&bytes) != blob.sha256 {
            return Err(AppError::new(
                ErrorCode::IoError,
                "托管附件缺失或校验失败，资料记录已保留。",
                false,
            ));
        }
        Ok(bytes)
    }
    pub fn preview(&self, blob: &Blob) -> AppResult<FilePreview> {
        // Verify integrity even for a format that cannot be previewed.
        let bytes = self.read(blob)?;
        let mut result = FilePreview {
            kind: "unsupported".into(),
            text: None,
            data_url: None,
            message: Some("此格式或大小暂不支持预览，可系统打开或导出副本。".into()),
        };
        if blob.mime_type == "text/plain" && bytes.len() <= 2 * 1024 * 1024 {
            let text = String::from_utf8(bytes).map_err(|_| {
                AppError::new(
                    ErrorCode::IoError,
                    "文本不是 UTF-8 编码，请使用系统应用打开。",
                    false,
                )
            })?;
            result.kind = "text".into();
            result.text = Some(text.trim_start_matches('\u{feff}').into());
            result.message = None;
        } else if ["image/png", "image/jpeg", "image/gif", "image/webp"]
            .contains(&blob.mime_type.as_str())
            && bytes.len() <= 10 * 1024 * 1024
        {
            result.kind = "image".into();
            result.data_url = Some(format!(
                "data:{};base64,{}",
                blob.mime_type,
                base64::engine::general_purpose::STANDARD.encode(bytes)
            ));
            result.message = None;
        }
        Ok(result)
    }
    pub fn export(&self, blob: &Blob, destination: &Path) -> AppResult<()> {
        self.export_bytes(&self.read(blob)?, destination)
    }
    pub fn export_bytes(&self, bytes: &[u8], destination: &Path) -> AppResult<()> {
        self.export_bytes_observed(bytes, destination, &|_| Ok(()))
    }
    pub fn export_bytes_observed(
        &self,
        bytes: &[u8],
        destination: &Path,
        progress: &dyn Fn(f64) -> AppResult<()>,
    ) -> AppResult<()> {
        progress(0.0)?;
        if !destination.is_absolute() || destination.is_symlink() {
            return Err(AppError::validation("导出位置无效。"));
        }
        let parent = destination
            .parent()
            .ok_or_else(io_error)?
            .canonicalize()
            .map_err(|_| io_error())?;
        if parent.starts_with(&self.root) {
            return Err(AppError::validation("导出位置不能位于应用工作空间内。"));
        }
        let mut temp = tempfile::Builder::new()
            .prefix(".moshub-export-")
            .tempfile_in(&parent)
            .map_err(|_| io_error())?;
        for (index, chunk) in bytes.chunks(64 * 1024).enumerate() {
            progress((index * 64 * 1024) as f64 / bytes.len().max(1) as f64 * 0.95)?;
            temp.write_all(chunk).map_err(|_| io_error())?;
        }
        temp.as_file().sync_all().map_err(|_| io_error())?;
        progress(0.98)?;
        temp.persist(destination).map_err(|_| io_error())?;
        sync_directory(&parent)
    }
    pub fn viewing_copy(&self, blob: &Blob, original_name: &str) -> AppResult<PathBuf> {
        // External applications receive a disposable copy, never the managed attachment.
        let bytes = self.read(blob)?;
        let fallback = blob.internal_path.split_once('.').ok_or_else(io_error)?.1;
        let extension = Path::new(original_name)
            .extension()
            .and_then(|e| e.to_str())
            .filter(|e| {
                !e.is_empty() && e.len() <= 16 && e.bytes().all(|b| b.is_ascii_alphanumeric())
            })
            .unwrap_or(fallback);
        let mut temp = tempfile::Builder::new()
            .prefix("moshub-view-")
            .suffix(&format!(".{extension}"))
            .tempfile()
            .map_err(|_| io_error())?;
        temp.write_all(&bytes).map_err(|_| io_error())?;
        temp.as_file().sync_all().map_err(|_| io_error())?;
        let (_, path) = temp.keep().map_err(|_| io_error())?;
        Ok(path)
    }
    #[cfg(feature = "desktop")]
    pub fn open(&self, blob: &Blob, original_name: &str) -> AppResult<()> {
        let path = self.viewing_copy(blob, original_name)?;
        if opener::open(&path).is_err() {
            let _ = fs::remove_file(&path);
            return Err(io_error());
        }
        // The OS temp directory owns this viewing copy; it is not a workspace attachment or backup.
        Ok(())
    }
    pub fn cleanup(&self, referenced: &[String]) -> AppResult<()> {
        let directory = self.directory()?;
        for entry in fs::read_dir(&directory).map_err(|_| io_error())? {
            let entry = entry.map_err(|_| io_error())?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if entry.path().is_symlink() {
                return Err(io_error());
            }
            if name.starts_with(".import-")
                || (self.blob_path(&name).is_ok() && !referenced.contains(&name))
            {
                fs::remove_file(entry.path()).map_err(|_| io_error())?;
            }
        }
        Ok(())
    }
}
pub(super) fn read_bounded(path: &Path, limit: u64) -> AppResult<Vec<u8>> {
    if path.is_symlink() {
        return Err(io_error());
    }
    let file = File::open(path).map_err(|_| io_error())?;
    if !file.metadata().map_err(|_| io_error())?.is_file() {
        return Err(io_error());
    }
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| io_error())?;
    if bytes.len() as u64 > limit {
        return Err(io_error());
    }
    Ok(bytes)
}
fn classify(bytes: &[u8]) -> (&'static str, &'static str) {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        ("image/png", "png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        ("image/jpeg", "jpg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        ("image/gif", "gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        ("image/webp", "webp")
    } else if bytes.starts_with(b"%PDF-") {
        ("application/pdf", "pdf")
    } else if (std::str::from_utf8(bytes).is_ok()
        || std::str::from_utf8(bytes)
            .err()
            .is_some_and(|e| e.error_len().is_none()))
        && !bytes.iter().any(|b| *b < 32 && !b"\t\n\r".contains(b))
    {
        ("text/plain", "txt")
    } else {
        ("application/octet-stream", "bin")
    }
}
pub(super) fn sync_directory(path: &Path) -> AppResult<()> {
    #[cfg(unix)]
    File::open(path)
        .and_then(|f| f.sync_all())
        .map_err(|_| io_error())?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}
