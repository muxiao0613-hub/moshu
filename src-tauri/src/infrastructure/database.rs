use crate::contracts::{AppError, AppResult, ErrorCode};
use crate::infrastructure::paths::WorkspacePaths;
use fs2::FileExt;
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::{
    fs::OpenOptions,
    path::Path,
    sync::{Arc, mpsc},
    thread::{self, JoinHandle},
};
use tokio::sync::oneshot;

type Operation = Box<dyn FnOnce(&mut Connection) + Send>;
struct Worker {
    sender: Option<mpsc::SyncSender<Operation>>,
    thread: Option<JoinHandle<()>>,
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.sender.take();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
#[derive(Clone)]
pub struct Database {
    worker: Arc<Worker>,
    root: std::path::PathBuf,
}
impl Database {
    pub fn open(root: &Path) -> AppResult<Self> {
        let paths = WorkspacePaths::initialize(root)?;
        let root = paths.root.clone();
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&paths.lock)
            .map_err(|_| AppError::new(ErrorCode::IoError, "无法锁定工作空间。", true))?;
        lock.try_lock_exclusive().map_err(|_| {
            AppError::new(
                ErrorCode::WorkspaceLocked,
                "工作空间已由另一实例使用。",
                true,
            )
        })?;
        crate::infrastructure::backup::recover(&root)?;
        let (sender, receiver) = mpsc::sync_channel::<Operation>(32);
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let thread = thread::Builder::new()
            .name("moshub-db".into())
            .spawn(move || {
                // The OS lock is held until the connection closes, including draining queued work.
                let _workspace_lock = lock;
                let result = Connection::open(&paths.database)
                    .map_err(AppError::from)
                    .and_then(|mut conn| {
                        let version: u32 =
                            conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
                        if (1..4).contains(&version) {
                            validate_previous(&conn, version)?;
                            let path = paths
                                .root
                                .join("backups")
                                .join(format!("{}.moshub.zip", uuid::Uuid::new_v4()));
                            crate::infrastructure::backup::snapshot(
                                &conn,
                                &paths.root,
                                &path,
                                &std::sync::atomic::AtomicBool::new(false),
                                &|_| {},
                            )?;
                        }
                        initialize(&mut conn)?;
                        let mut statement =
                            conn.prepare("SELECT internal_path FROM platform_blobs")?;
                        let referenced = statement
                            .query_map([], |r| r.get(0))?
                            .collect::<rusqlite::Result<Vec<String>>>()?;
                        crate::infrastructure::attachments::AttachmentStore::new(
                            paths.root.clone(),
                        )
                        .cleanup(&referenced)?;
                        drop(statement);
                        Ok(conn)
                    });
                match result {
                    Ok(mut conn) => {
                        if ready_tx.send(Ok(())).is_err() {
                            return;
                        }
                        while let Ok(operation) = receiver.recv() {
                            operation(&mut conn);
                        }
                    }
                    Err(error) => {
                        let _ = ready_tx.send(Err(error));
                    }
                }
            })
            .map_err(|_| AppError::new(ErrorCode::DbError, "无法启动数据工作线程。", true))?;
        let result = ready_rx
            .recv()
            .map_err(|_| AppError::new(ErrorCode::DbError, "数据工作线程初始化失败。", true))?;
        if let Err(error) = result {
            let _ = thread.join();
            return Err(error);
        }
        Ok(Self {
            root,
            worker: Arc::new(Worker {
                sender: Some(sender),
                thread: Some(thread),
            }),
        })
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    pub async fn call<T, F>(&self, operation: F) -> AppResult<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> AppResult<T> + Send + 'static,
    {
        let (sender, receiver) = oneshot::channel();
        let operation = Box::new(move |conn: &mut Connection| {
            let _ = sender.send(operation(conn));
        });
        self.worker
            .sender
            .as_ref()
            .ok_or_else(|| AppError::new(ErrorCode::DbError, "数据服务已关闭。", true))?
            .try_send(operation)
            .map_err(|error| match error {
                mpsc::TrySendError::Full(_) => {
                    AppError::new(ErrorCode::DbBusy, "保存队列繁忙，请稍后重试。", true)
                }
                mpsc::TrySendError::Disconnected(_) => {
                    AppError::new(ErrorCode::DbError, "数据服务已中断。", true)
                }
            })?;
        receiver.await.map_err(|_| {
            AppError::new(
                ErrorCode::DbError,
                "数据操作未完成，请重新读取后重试。",
                true,
            )
        })?
    }
}

fn migration_error() -> AppError {
    AppError::new(
        ErrorCode::MigrationFailed,
        "数据格式无法初始化或不兼容，请保留原数据并检查应用版本。",
        false,
    )
}
pub fn initialize(conn: &mut Connection) -> AppResult<()> {
    conn.busy_timeout(std::time::Duration::from_secs(3))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    let version: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let migrations = [
        include_str!("../../migrations/0001_platform.sql"),
        include_str!("../../migrations/0002_document_editing.sql"),
        include_str!("../../migrations/0003_foundation.sql"),
        include_str!("../../migrations/0004_module_links.sql"),
    ];
    if version > migrations.len() as u32 {
        return Err(migration_error());
    }
    if version == 0 {
        let tables: u32 = conn.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            [],
            |r| r.get(0),
        )?;
        if tables != 0 {
            return Err(migration_error());
        }
    } else {
        let schema: u32 = conn
            .query_row("SELECT schema_version FROM platform_meta", [], |r| r.get(0))
            .map_err(|_| migration_error())?;
        if schema != version {
            return Err(migration_error());
        }
        for (index, sql) in migrations.iter().enumerate().take(version as usize) {
            let stored: String = conn
                .query_row(
                    "SELECT checksum FROM platform_migrations WHERE version=?1",
                    [(index + 1) as u32],
                    |r| r.get(0),
                )
                .map_err(|_| migration_error())?;
            let checksum = Sha256::digest(sql.as_bytes())
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            if stored != checksum {
                return Err(migration_error());
            }
        }
    }
    // Validate an existing database before upgrading, so a damaged v1 remains untouched.
    let integrity: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
    if integrity != "ok" || conn.prepare("PRAGMA foreign_key_check")?.exists([])? {
        return Err(migration_error());
    }
    if version < migrations.len() as u32 {
        let tx = conn.transaction()?;
        for (index, sql) in migrations.iter().enumerate().skip(version as usize) {
            tx.execute_batch(sql).map_err(|_| migration_error())?;
            if index == 0 {
                tx.execute(
                    "INSERT INTO platform_meta(workspace_id,schema_version) VALUES (?1,1)",
                    [uuid::Uuid::new_v4().to_string()],
                )?;
            }
            tx.execute(
                "INSERT INTO platform_migrations(version,checksum,applied_at) VALUES(?1,?2,?3)",
                rusqlite::params![
                    (index + 1) as u32,
                    Sha256::digest(sql.as_bytes())
                        .iter()
                        .map(|byte| format!("{byte:02x}"))
                        .collect::<String>(),
                    chrono::Utc::now().to_rfc3339()
                ],
            )?;
        }
        tx.execute(
            "UPDATE platform_meta SET schema_version=?1",
            [migrations.len() as u32],
        )?;
        tx.pragma_update(None, "user_version", migrations.len() as u32)?;
        tx.commit()?;
    }
    let integrity: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
    if integrity != "ok" {
        return Err(migration_error());
    }
    let fk_errors = conn.prepare("PRAGMA foreign_key_check")?.exists([])?;
    if fk_errors {
        return Err(migration_error());
    }
    conn.execute("UPDATE platform_jobs SET status='interrupted',updated_at=?1 WHERE status IN ('pending','running')",[chrono::Utc::now().to_rfc3339()])?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "FULL")?;
    Ok(())
}

fn validate_previous(conn: &Connection, version: u32) -> AppResult<()> {
    let schema: u32 = conn
        .query_row("SELECT schema_version FROM platform_meta", [], |r| r.get(0))
        .map_err(|_| migration_error())?;
    if schema != version {
        return Err(migration_error());
    }
    for (index, sql) in [
        include_str!("../../migrations/0001_platform.sql"),
        include_str!("../../migrations/0002_document_editing.sql"),
        include_str!("../../migrations/0003_foundation.sql"),
    ]
    .iter()
    .enumerate()
    .take(version as usize)
    {
        let stored: String = conn
            .query_row(
                "SELECT checksum FROM platform_migrations WHERE version=?1",
                [(index + 1) as u32],
                |r| r.get(0),
            )
            .map_err(|_| migration_error())?;
        let expected = Sha256::digest(sql.as_bytes())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        if stored != expected {
            return Err(migration_error());
        }
    }
    let check: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
    if check != "ok" || conn.prepare("PRAGMA foreign_key_check")?.exists([])? {
        return Err(migration_error());
    }
    Ok(())
}
