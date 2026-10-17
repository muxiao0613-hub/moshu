use crate::contracts::{AppError, AppResult, ErrorCode};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    io::{Read, Write},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};
const MAX_TOTAL: u64 = 10 * 1024 * 1024 * 1024;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entry {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub backup_format_version: u32,
    pub app_version: String,
    pub workspace_id: String,
    pub schema_version: u32,
    pub created_at: String,
    pub module_versions: std::collections::BTreeMap<String, u32>,
    pub files: Vec<Entry>,
}
fn invalid() -> AppError {
    AppError::new(
        ErrorCode::BackupInvalid,
        "备份损坏、格式不兼容或内容清单不完整。",
        false,
    )
}
fn io() -> AppError {
    AppError::new(
        ErrorCode::IoError,
        "备份文件操作失败，请检查权限和磁盘空间。",
        true,
    )
}
// Unix directory sync makes rename/journal publication durable in addition to file bytes.
// Other platforms retain file sync; their power-loss behavior needs native validation.
fn sync_directory(path: &Path) -> AppResult<()> {
    #[cfg(unix)]
    fs::File::open(path)
        .and_then(|file| file.sync_all())
        .map_err(|_| io())?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}
fn sync_tree(path: &Path) -> AppResult<()> {
    if path.is_symlink() {
        return Err(invalid());
    }
    if path.is_file() {
        return fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .and_then(|file| file.sync_all())
            .map_err(|_| io());
    }
    for child in fs::read_dir(path).map_err(|_| io())? {
        sync_tree(&child.map_err(|_| io())?.path())?;
    }
    sync_directory(path)
}
fn check(cancel: &AtomicBool) -> AppResult<()> {
    if cancel.load(Ordering::Relaxed) {
        Err(AppError::new(
            ErrorCode::Cancelled,
            "已在安全点取消。",
            false,
        ))
    } else {
        Ok(())
    }
}
fn valid_path(name: &str) -> AppResult<()> {
    let parts = name.split('/').collect::<Vec<_>>();
    if name.is_empty()
        || name.len() > 1024
        || name.contains('\\')
        || name.contains(':')
        || name.contains('\0')
        || parts
            .iter()
            .any(|p| p.is_empty() || *p == "." || *p == "..")
        || !matches!(
            parts[0],
            "workspace.sqlite" | "attachments" | "drafts" | "editing"
        )
    {
        return Err(invalid());
    }
    if parts[0] == "workspace.sqlite" && parts.len() != 1 {
        return Err(invalid());
    }
    Ok(())
}
fn open_file(root: &Path, name: &str, limit: u64) -> AppResult<(fs::File, u64)> {
    valid_path(name)?;
    let path = root.join(name);
    let mut ancestor = path.as_path();
    while ancestor != root {
        if ancestor.is_symlink() {
            return Err(invalid());
        }
        ancestor = ancestor.parent().ok_or_else(invalid)?;
    }
    let f = fs::File::open(&path).map_err(|_| io())?;
    let size = f.metadata().map_err(|_| io())?.len();
    if size > limit {
        return Err(invalid());
    }
    Ok((f, size))
}
fn walk(root: &Path, folder: &str, files: &mut Vec<String>) -> AppResult<()> {
    let path = root.join(folder);
    if path.is_symlink() {
        return Err(invalid());
    }
    for item in fs::read_dir(path).map_err(|_| io())? {
        let item = item.map_err(|_| io())?;
        let ty = item.file_type().map_err(|_| io())?;
        let name = format!(
            "{folder}/{}",
            item.file_name().to_str().ok_or_else(invalid)?
        );
        valid_path(&name)?;
        if ty.is_symlink() {
            return Err(invalid());
        }
        if ty.is_dir() {
            walk(root, &name, files)?;
        } else if ty.is_file() {
            files.push(name);
        } else {
            return Err(invalid());
        }
    }
    Ok(())
}
pub fn snapshot(
    conn: &Connection,
    root: &Path,
    destination: &Path,
    cancel: &AtomicBool,
    progress: &dyn Fn(f64),
) -> AppResult<Manifest> {
    check(cancel)?;
    let temp = tempfile::tempdir_in(root).map_err(|_| io())?;
    let db_path = temp.path().join("workspace.sqlite");
    let mut copy = Connection::open(&db_path)?;
    {
        let backup = rusqlite::backup::Backup::new(conn, &mut copy)?;
        backup.run_to_completion(128, std::time::Duration::from_millis(1), None)?;
    }
    // Credentials, secret references and diagnostic/job error details are not portable backup data.
    copy.execute("UPDATE ai_connections SET secret_ref=NULL", [])?;
    copy.execute("DELETE FROM platform_jobs", [])?;
    copy.execute("DELETE FROM platform_search_projection", [])?;
    if copy
        .prepare("SELECT 1 FROM sqlite_master WHERE name='platform_search_dirty'")?
        .exists([])?
    {
        copy.execute("INSERT OR IGNORE INTO platform_search_dirty VALUES(1)", [])?;
    }
    let (workspace_id, schema_version) = copy.query_row(
        "SELECT workspace_id,schema_version FROM platform_meta",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let mut blobs = copy.prepare("SELECT internal_path,size,sha256 FROM platform_blobs")?;
    let blob_rows = blobs
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)? as u64,
                r.get::<_, String>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(blobs);
    let mut files = vec!["workspace.sqlite".into()];
    for (name, _, _) in &blob_rows {
        if name.contains('/') || name.contains('\\') {
            return Err(invalid());
        }
        files.push(format!("attachments/{name}"));
    }
    walk(root, "drafts", &mut files)?;
    walk(root, "editing", &mut files)?;
    if files.len() >= 100_000 {
        return Err(invalid());
    }
    // Office locks mean application memory may not have reached the durable copy yet.
    if files.iter().any(|f| {
        f.starts_with("editing/")
            && (f
                .split('/')
                .any(|n| n.starts_with(".~lock.") || n.starts_with("~$")))
    }) {
        return Err(AppError::validation(
            "请先在 Office 保存并关闭文档，再备份。",
        ));
    }
    let modules = {
        let mut s =
            copy.prepare("SELECT module_id,data_schema_version FROM platform_module_states")?;
        s.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<std::collections::BTreeMap<_, _>>>()?
    };
    drop(copy);
    let parent = destination.parent().ok_or_else(io)?;
    let mut output = tempfile::NamedTempFile::new_in(parent).map_err(|_| io())?;
    let mut writer = zip::ZipWriter::new(output.as_file_mut());
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o600);
    let mut manifest = Manifest {
        backup_format_version: 1,
        app_version: env!("CARGO_PKG_VERSION").into(),
        workspace_id,
        schema_version,
        created_at: chrono::Utc::now().to_rfc3339(),
        module_versions: modules,
        files: vec![],
    };
    let mut total: u64 = 0;
    let blob_checks = blob_rows
        .iter()
        .map(|(path, size, sha)| (path.as_str(), (*size, sha.as_str())))
        .collect::<std::collections::BTreeMap<_, _>>();
    for (index, name) in files.iter().enumerate() {
        check(cancel)?;
        let base = if name == "workspace.sqlite" {
            temp.path()
        } else {
            root
        };
        let (mut source, size) = open_file(base, name, MAX_TOTAL - total)?;
        writer.start_file(name, options).map_err(|_| io())?;
        let mut actual = 0u64;
        let mut digest = Sha256::new();
        let mut buffer = [0u8; 64 * 1024];
        loop {
            check(cancel)?;
            let n = source.read(&mut buffer).map_err(|_| io())?;
            if n == 0 {
                break;
            }
            actual += n as u64;
            if actual > size {
                return Err(invalid());
            }
            digest.update(&buffer[..n]);
            writer.write_all(&buffer[..n]).map_err(|_| io())?;
            progress(
                (index as f64 + actual as f64 / size.max(1) as f64) / (files.len() + 1) as f64
                    * 0.9,
            );
        }
        if actual != size || source.metadata().map_err(|_| io())?.len() != size {
            return Err(invalid());
        }
        let checksum = digest
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        if let Some((expected_size, expected_sha)) = name
            .strip_prefix("attachments/")
            .and_then(|p| blob_checks.get(p))
            && (*expected_size != size || *expected_sha != checksum)
        {
            return Err(invalid());
        }
        total += size;
        manifest.files.push(Entry {
            path: name.clone(),
            size,
            sha256: checksum,
        });
        progress((index + 1) as f64 / (files.len() + 1) as f64 * 0.9);
    }
    writer
        .start_file("manifest.json", options)
        .map_err(|_| io())?;
    writer
        .write_all(&serde_json::to_vec(&manifest).map_err(|_| invalid())?)
        .map_err(|_| io())?;
    writer.finish().map_err(|_| io())?;
    output.as_file().sync_all().map_err(|_| io())?;
    check(cancel)?;
    output.persist_noclobber(destination).map_err(|_| io())?;
    sync_directory(destination.parent().ok_or_else(io)?)?;
    progress(1.0);
    Ok(manifest)
}
pub struct Prepared {
    pub directory: tempfile::TempDir,
    pub manifest: Manifest,
    pub projects: u32,
    pub resources: u32,
    pub tasks: u32,
}
pub fn inspect(
    root: &Path,
    path: &Path,
    cancel: &AtomicBool,
    progress: &dyn Fn(f64),
) -> AppResult<Prepared> {
    let file = fs::File::open(path).map_err(|_| io())?;
    if file.metadata().map_err(|_| io())?.len() > MAX_TOTAL {
        return Err(invalid());
    }
    let mut archive = zip::ZipArchive::new(file).map_err(|_| invalid())?;
    if archive.len() > 100_000 {
        return Err(invalid());
    }
    let mut manifest_file = archive.by_name("manifest.json").map_err(|_| invalid())?;
    if manifest_file.size() > 16 * 1024 * 1024 {
        return Err(invalid());
    }
    let mut json = Vec::new();
    manifest_file
        .by_ref()
        .take(16 * 1024 * 1024 + 1)
        .read_to_end(&mut json)
        .map_err(|_| invalid())?;
    drop(manifest_file);
    let manifest: Manifest = serde_json::from_slice(&json).map_err(|_| invalid())?;
    if manifest.backup_format_version != 1
        || manifest.schema_version > 4
        || manifest.files.len() + 1 != archive.len()
    {
        return Err(invalid());
    }
    let temp = tempfile::tempdir_in(root).map_err(|_| io())?;
    let mut seen = BTreeSet::new();
    let mut filesystem_names = BTreeSet::new();
    let mut total: u64 = 0;
    for i in 0..archive.len() {
        check(cancel)?;
        let mut entry = archive.by_index(i).map_err(|_| invalid())?;
        let name = entry.name().to_owned();
        if !seen.insert(name.clone())
            || !filesystem_names.insert(name.to_lowercase())
            || entry.is_dir()
            || entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
        {
            return Err(invalid());
        }
        if name == "manifest.json" {
            continue;
        }
        valid_path(&name)?;
        let expected = manifest
            .files
            .iter()
            .find(|e| e.path == name)
            .ok_or_else(invalid)?;
        total = total.checked_add(expected.size).ok_or_else(invalid)?;
        if total > MAX_TOTAL || entry.size() != expected.size {
            return Err(invalid());
        }
        let target = temp.path().join(&name);
        // Also reject collisions after the host filesystem's case/Unicode normalization.
        if target.exists() {
            return Err(invalid());
        }
        fs::create_dir_all(target.parent().ok_or_else(invalid)?).map_err(|_| io())?;
        let mut out = fs::File::create(&target).map_err(|_| io())?;
        let mut digest = Sha256::new();
        let mut actual = 0;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            check(cancel)?;
            let n = entry.read(&mut buffer).map_err(|_| invalid())?;
            if n == 0 {
                break;
            }
            actual += n as u64;
            if actual > expected.size {
                return Err(invalid());
            }
            digest.update(&buffer[..n]);
            out.write_all(&buffer[..n]).map_err(|_| io())?;
        }
        let checksum = digest
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        if actual != expected.size || checksum != expected.sha256 {
            return Err(invalid());
        }
        out.sync_all().map_err(|_| io())?;
        drop(entry);
        progress((i + 1) as f64 / archive.len() as f64 * 0.9);
    }
    if manifest.files.iter().any(|e| !seen.contains(&e.path)) {
        return Err(invalid());
    }
    for name in ["attachments", "drafts", "editing"] {
        fs::create_dir_all(temp.path().join(name)).map_err(|_| io())?;
    }
    let mut conn = Connection::open(temp.path().join("workspace.sqlite")).map_err(|_| invalid())?;
    let (identity, version): (String, u32) = conn
        .query_row(
            "SELECT workspace_id,schema_version FROM platform_meta",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| invalid())?;
    if identity != manifest.workspace_id || version != manifest.schema_version {
        return Err(invalid());
    }
    crate::infrastructure::database::initialize(&mut conn).map_err(|_| invalid())?;
    let module_versions = {
        let mut statement = conn
            .prepare("SELECT module_id,data_schema_version FROM platform_module_states")
            .map_err(|_| invalid())?;
        statement
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|_| invalid())?
            .collect::<rusqlite::Result<std::collections::BTreeMap<String, u32>>>()
            .map_err(|_| invalid())?
    };
    if module_versions != manifest.module_versions {
        return Err(invalid());
    }
    {
        use rusqlite::OptionalExtension;
        let personal: Option<(String, u32)> = conn
            .query_row(
                "SELECT value_json,schema_version FROM platform_preferences WHERE key='personal'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|_| invalid())?;
        if let Some((json, version)) = personal {
            if version != 1 {
                return Err(invalid());
            }
            let settings: crate::contracts::Preferences =
                serde_json::from_str(&json).map_err(|_| invalid())?;
            crate::platform::domain::personal_preferences(&settings).map_err(|_| invalid())?;
        }
    }
    for table in ["platform_notes", "platform_note_versions"] {
        let mut statement = conn
            .prepare(&format!(
                "SELECT body_json,schema_version,plain_text FROM {table}"
            ))
            .map_err(|_| invalid())?;
        let rows = statement
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, u32>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(|_| invalid())?;
        for row in rows {
            let (json, version, plain) = row.map_err(|_| invalid())?;
            let body = serde_json::from_str(&json).map_err(|_| invalid())?;
            let derived =
                crate::platform::domain::document(&body, version).map_err(|_| invalid())?;
            if derived != plain {
                return Err(invalid());
            }
        }
    }
    if conn
        .prepare("SELECT 1 FROM ai_connections WHERE secret_ref IS NOT NULL")
        .map_err(|_| invalid())?
        .exists([])
        .map_err(|_| invalid())?
    {
        return Err(invalid());
    }
    let mut blobs = conn
        .prepare("SELECT internal_path,size,sha256 FROM platform_blobs")
        .map_err(|_| invalid())?;
    for row in blobs
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)? as u64,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|_| invalid())?
    {
        let (p, size, sha) = row.map_err(|_| invalid())?;
        if p.contains('/') || p.contains('\\') {
            return Err(invalid());
        }
        let expected = manifest
            .files
            .iter()
            .find(|e| e.path == format!("attachments/{p}"))
            .ok_or_else(invalid)?;
        if expected.size != size || expected.sha256 != sha {
            return Err(invalid());
        }
    }
    drop(blobs);
    let mut sessions = conn
        .prepare("SELECT id,filename,markdown FROM platform_document_sessions")
        .map_err(|_| invalid())?;
    for row in sessions
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|_| invalid())?
    {
        let (id, name, markdown) = row.map_err(|_| invalid())?;
        uuid::Uuid::parse_str(&id).map_err(|_| invalid())?;
        if markdown.is_none() {
            let path = format!("editing/{id}/{name}");
            valid_path(&path)?;
            if !seen.contains(&path) {
                return Err(invalid());
            }
        }
    }
    drop(sessions);
    let count = |table: &str| -> AppResult<u32> {
        conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
            .map_err(|_| invalid())
    };
    let projects = count("platform_projects")?;
    let resources = count("platform_resources")?;
    let tasks = count("platform_tasks")?;
    conn.execute(
        "UPDATE platform_jobs SET status='interrupted' WHERE status IN ('pending','running')",
        [],
    )?;
    conn.execute("UPDATE ai_connections SET secret_ref=NULL", [])?;
    conn.execute("INSERT OR IGNORE INTO platform_search_dirty VALUES(1)", [])?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;")?;
    drop(conn);
    progress(1.0);
    Ok(Prepared {
        directory: temp,
        manifest,
        projects,
        resources,
        tasks,
    })
}
const NAMES: [&str; 4] = ["workspace.sqlite", "attachments", "drafts", "editing"];
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Journal {
    old: String,
    committed: bool,
}
fn write_journal(root: &Path, j: &Journal) -> AppResult<()> {
    let mut f = tempfile::NamedTempFile::new_in(root).map_err(|_| io())?;
    f.write_all(&serde_json::to_vec(j).map_err(|_| io())?)
        .map_err(|_| io())?;
    f.as_file().sync_all().map_err(|_| io())?;
    f.persist(root.join("restore-journal.json"))
        .map_err(|_| io())?;
    sync_directory(root)?;
    Ok(())
}
fn remove(path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_symlink() {
        return Err(invalid());
    }
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
    .map_err(|_| io())
}
pub fn recover(root: &Path) -> AppResult<()> {
    let path = root.join("restore-journal.json");
    if !path.exists() {
        return Ok(());
    }
    if path.is_symlink() {
        return Err(invalid());
    }
    let j: Journal =
        serde_json::from_slice(&fs::read(&path).map_err(|_| io())?).map_err(|_| invalid())?;
    if !j.old.starts_with("restore-old-")
        || j.old.contains('/')
        || j.old.contains('\\')
        || j.old.contains("..")
    {
        return Err(invalid());
    }
    let old = root.join(&j.old);
    if old.is_symlink() {
        return Err(invalid());
    }
    if j.committed {
        // Do not remove the fallback until the commit record's directory entry is durable.
        sync_directory(root)?;
    }
    if !j.committed {
        for name in NAMES {
            let saved = old.join(name);
            if saved.exists() {
                remove(&root.join(name))?;
                fs::rename(saved, root.join(name)).map_err(|_| io())?;
                sync_directory(root)?;
                sync_directory(&old)?;
            }
        }
        for wal in ["workspace.sqlite-wal", "workspace.sqlite-shm"] {
            remove(&root.join(wal))?;
        }
    }
    remove(&old)?;
    sync_directory(root)?;
    fs::remove_file(path).map_err(|_| io())?;
    sync_directory(root)?;
    Ok(())
}
pub fn replace(conn: &mut Connection, root: &Path, prepared: Prepared) -> AppResult<()> {
    // Keep workspace.lock and the root directory stable throughout the switch.
    // A prepared tree must be durable before it can become the only committed copy.
    sync_tree(prepared.directory.path())?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
    let dummy = Connection::open_in_memory()?;
    let old_conn = std::mem::replace(conn, dummy);
    if let Err((original, _)) = old_conn.close() {
        *conn = original;
        return Err(io());
    }
    let result = (|| {
        let old_name = format!("restore-old-{}", uuid::Uuid::new_v4());
        let old = root.join(&old_name);
        fs::create_dir(&old).map_err(|_| io())?;
        let journal = Journal {
            old: old_name,
            committed: false,
        };
        write_journal(root, &journal)?;
        for wal in ["workspace.sqlite-wal", "workspace.sqlite-shm"] {
            remove(&root.join(wal))?;
        }
        for name in NAMES {
            fs::rename(root.join(name), old.join(name)).map_err(|_| io())?;
            sync_directory(&old)?;
            sync_directory(root)?;
            fs::rename(prepared.directory.path().join(name), root.join(name)).map_err(|_| io())?;
            sync_directory(root)?;
            sync_directory(prepared.directory.path())?;
        }
        let mut new = Connection::open(root.join("workspace.sqlite"))?;
        crate::infrastructure::database::initialize(&mut new)?;
        write_journal(
            root,
            &Journal {
                old: journal.old.clone(),
                committed: true,
            },
        )?;
        *conn = new;
        Ok(())
    })();
    if let Err(error) = result {
        let committed = fs::read(root.join("restore-journal.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Journal>(&bytes).ok())
            .is_some_and(|journal| journal.committed);
        if committed {
            // Publication is the commit point. A later metadata sync/cleanup failure must
            // not report rollback while the newly validated database is already active.
            let mut restored = Connection::open(root.join("workspace.sqlite"))?;
            crate::infrastructure::database::initialize(&mut restored)?;
            *conn = restored;
            let _ = recover(root);
            return Ok(());
        }
        recover(root)?;
        let mut original = Connection::open(root.join("workspace.sqlite"))?;
        crate::infrastructure::database::initialize(&mut original)?;
        *conn = original;
        return Err(error);
    }
    // Cleanup is recoverable at next startup and cannot undo a confirmed switch.
    let _ = recover(root);
    Ok(())
}
