use super::{domain, service::PlatformService};
use crate::{contracts::*, infrastructure::backup};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
pub struct RunningJob {
    pub state: Mutex<Job>,
    pub cancel: AtomicBool,
}
#[derive(Default)]
pub struct Maintenance {
    pub jobs: Mutex<BTreeMap<String, Arc<RunningJob>>>,
    pub prepared: Mutex<BTreeMap<String, backup::Prepared>>,
}
fn io() -> AppError {
    AppError::new(ErrorCode::IoError, "维护任务未完成，请重试。", true)
}
pub(super) fn update(job: &RunningJob, status: &str, progress: f64, error: Option<ErrorCode>) {
    if let Ok(mut state) = job.state.lock() {
        state.status = status.into();
        state.progress = progress;
        state.error_code = error;
        state.updated_at = chrono::Utc::now().to_rfc3339();
    }
}
fn filename(id: &str) -> String {
    format!("{id}.moshub.zip")
}
impl PlatformService {
    pub(super) async fn new_job(
        &self,
        operation: &str,
        request: String,
    ) -> AppResult<Arc<RunningJob>> {
        domain::id(&request)?;
        let job = Job {
            id: uuid::Uuid::new_v4().to_string(),
            operation: operation.into(),
            status: "pending".into(),
            progress: 0.0,
            error_code: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        let stored = job.clone();
        self.database.call(move|c|{c.execute("INSERT INTO platform_jobs(id,module_id,operation,status,progress,request_id,revision,created_at,updated_at) VALUES(?1,'platform',?2,'pending',0,?3,1,?4,?4)",rusqlite::params![stored.id,stored.operation,request,stored.updated_at])?;Ok(())}).await?;
        let runtime = Arc::new(RunningJob {
            state: Mutex::new(job.clone()),
            cancel: AtomicBool::new(false),
        });
        self.maintenance
            .jobs
            .lock()
            .map_err(|_| io())?
            .insert(job.id, runtime.clone());
        Ok(runtime)
    }
    pub(super) async fn finish_job(&self, job: Arc<RunningJob>, result: AppResult<()>) {
        match result {
            Ok(()) => update(&job, "succeeded", 1.0, None),
            Err(e) => {
                let status = if e.code == ErrorCode::Cancelled {
                    "cancelled"
                } else {
                    "failed"
                };
                let progress = job.state.lock().map(|s| s.progress).unwrap_or(0.0);
                update(&job, status, progress, Some(e.code));
            }
        }
        let state = job.state.lock().ok().map(|s| s.clone());
        if let Some(state) = state {
            let _=self.database.call(move|c|{c.execute("INSERT INTO platform_jobs(id,module_id,operation,status,progress,request_id,error_code,revision,created_at,updated_at) VALUES(?1,'platform',?2,?3,?4,?1,?5,1,?6,?6) ON CONFLICT(id) DO UPDATE SET status=excluded.status,progress=excluded.progress,error_code=excluded.error_code,updated_at=excluded.updated_at,revision=platform_jobs.revision+1",rusqlite::params![state.id,state.operation,state.status,state.progress,state.error_code.and_then(|e|serde_json::to_value(e).ok()).and_then(|v|v.as_str().map(str::to_owned)),state.updated_at])?;Ok(())}).await;
        }
    }
    pub async fn start_backup(&self, q: Request) -> AppResult<Job> {
        let job = self.new_job("backup", q.request_id).await?;
        let initial = job.state.lock().map_err(|_| io())?.clone();
        let service = self.clone();
        tokio::spawn(async move {
            let _access = service.access.write().await;
            let _documents = service.document_lock.lock().await;
            let _imports = service.import_lock.lock().await;
            let _drafts = service.draft_lock.lock().await;
            let root = service.database.root().to_owned();
            let id = job.state.lock().map(|s| s.id.clone()).unwrap_or_default();
            let progress = job.clone();
            update(&job, "running", 0.0, None);
            let result = service
                .database
                .call(move |c| {
                    backup::snapshot(
                        c,
                        &root,
                        &root.join("backups").join(filename(&id)),
                        &progress.cancel,
                        &|p| update(&progress, "running", p, None),
                    )?;
                    Ok(())
                })
                .await;
            drop(_drafts);
            drop(_imports);
            drop(_documents);
            drop(_access);
            service.finish_job(job, result).await;
        });
        Ok(initial)
    }
    pub async fn automatic_backup(&self, q: Request) -> AppResult<Option<Job>> {
        domain::id(&q.request_id)?;
        let date = chrono::Local::now().date_naive().to_string();
        let root = self.database.root().join("backups");
        for item in std::fs::read_dir(&root).map_err(|_| io())? {
            let item = item.map_err(|_| io())?;
            let name = item.file_name().to_string_lossy().into_owned();
            if name.starts_with(&format!("auto-{date}-"))
                && name.ends_with(".moshub.zip")
                && !item.path().is_symlink()
            {
                return Ok(None);
            }
        }
        let job = self.new_job("automaticBackup", q.request_id).await?;
        let initial = job.state.lock().map_err(|_| io())?.clone();
        let service = self.clone();
        tokio::spawn(async move {
            let _access = service.access.write().await;
            let _documents = service.document_lock.lock().await;
            let _imports = service.import_lock.lock().await;
            let _drafts = service.draft_lock.lock().await;
            let root = service.database.root().to_owned();
            let id = job.state.lock().map(|s| s.id.clone()).unwrap_or_default();
            let progress = job.clone();
            update(&job, "running", 0.0, None);
            let result = service
                .database
                .call(move |c| {
                    let path = root
                        .join("backups")
                        .join(format!("auto-{date}-{}.moshub.zip", id));
                    backup::snapshot(c, &root, &path, &progress.cancel, &|p| {
                        update(&progress, "running", p, None)
                    })?;
                    let mut autos = std::fs::read_dir(root.join("backups"))
                        .map_err(|_| io())?
                        .filter_map(Result::ok)
                        .filter(|e| {
                            e.file_name().to_string_lossy().starts_with("auto-")
                                && e.file_name().to_string_lossy().ends_with(".moshub.zip")
                                && !e.path().is_symlink()
                        })
                        .collect::<Vec<_>>();
                    autos.sort_by_key(|e| e.file_name());
                    let excess = autos.len().saturating_sub(7);
                    for entry in autos.into_iter().take(excess) {
                        std::fs::remove_file(entry.path()).map_err(|_| io())?;
                    }
                    Ok(())
                })
                .await;
            drop(_drafts);
            drop(_imports);
            drop(_documents);
            drop(_access);
            service.finish_job(job, result).await;
        });
        Ok(Some(initial))
    }
    pub async fn list_jobs(&self, q: Request) -> AppResult<Vec<Job>> {
        domain::id(&q.request_id)?;
        if let Ok(guard) = self.access.try_read() {
            let mut persisted=self.database.call(|c|{let mut s=c.prepare("SELECT id,operation,status,progress,updated_at,error_code FROM platform_jobs ORDER BY updated_at DESC LIMIT 50")?;Ok(s.query_map([],|r|Ok(Job{id:r.get(0)?,operation:r.get(1)?,status:r.get(2)?,progress:r.get(3)?,error_code:r.get::<_,Option<String>>(5)?.and_then(|s|serde_json::from_value(serde_json::Value::String(s)).ok()),updated_at:r.get(4)?}))?.collect::<rusqlite::Result<Vec<_>>>()?)}).await?;
            drop(guard);
            for runtime in self.maintenance.jobs.lock().map_err(|_| io())?.values() {
                let j = runtime.state.lock().map_err(|_| io())?.clone();
                persisted.retain(|p| p.id != j.id);
                persisted.push(j);
            }
            persisted.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
            persisted.truncate(50);
            Ok(persisted)
        } else {
            Ok(self
                .maintenance
                .jobs
                .lock()
                .map_err(|_| io())?
                .values()
                .filter_map(|r| r.state.lock().ok().map(|s| s.clone()))
                .collect())
        }
    }
    pub async fn cancel_job(&self, q: IdRequest) -> AppResult<()> {
        domain::id(&q.request_id)?;
        domain::id(&q.id)?;
        let jobs = self.maintenance.jobs.lock().map_err(|_| io())?;
        let job = jobs
            .get(&q.id)
            .ok_or_else(|| AppError::validation("任务已结束或中断；请从原操作入口重试。"))?;
        job.cancel.store(true, Ordering::Relaxed);
        Ok(())
    }
    pub async fn list_backups(&self, q: Request) -> AppResult<Vec<BackupRecord>> {
        domain::id(&q.request_id)?;
        let mut out = vec![];
        for item in std::fs::read_dir(self.database.root().join("backups")).map_err(|_| io())? {
            let item = item.map_err(|_| io())?;
            let name = item.file_name().to_string_lossy().into_owned();
            let id = name.strip_suffix(".moshub.zip").unwrap_or("");
            let raw = if id.starts_with("auto-") && id.len() > 16 {
                &id[16..]
            } else {
                id
            };
            if uuid::Uuid::parse_str(raw).is_ok() && !item.path().is_symlink() {
                let meta = item.metadata().map_err(|_| io())?;
                out.push(BackupRecord {
                    id: id.into(),
                    created_at: chrono::DateTime::<chrono::Utc>::from(
                        meta.modified().map_err(|_| io())?,
                    )
                    .to_rfc3339(),
                    size: meta.len(),
                    automatic: id.starts_with("auto-"),
                });
            }
        }
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(out)
    }
    pub fn backup_path(&self, id: &str) -> AppResult<PathBuf> {
        let raw = if id.starts_with("auto-") && id.len() > 16 {
            &id[16..]
        } else {
            id
        };
        domain::id(raw)?;
        if id.contains('/') || id.contains('\\') || id.contains("..") {
            return Err(AppError::validation("备份编号无效。"));
        }
        let path = self.database.root().join("backups").join(filename(id));
        if path.is_symlink() {
            return Err(io());
        }
        Ok(path)
    }
    pub async fn inspect_restore(&self, q: Request, path: &Path) -> AppResult<RestorePreview> {
        domain::id(&q.request_id)?;
        let root = self.database.root().to_owned();
        let path = path.to_owned();
        let job = self.new_job("inspectRestore", q.request_id).await?;
        let progress = job.clone();
        let providers = self.modules.lock().map_err(|_| io())?.providers();
        let result = tokio::task::spawn_blocking(move || {
            let prepared = backup::inspect(&root, &path, &progress.cancel, &|p| {
                update(&progress, "running", p * 0.9, None)
            })?;
            let mut conn =
                rusqlite::Connection::open(prepared.directory.path().join("workspace.sqlite"))?;
            let tx=conn.transaction()?;
            for (info,lifecycle) in providers {
                lifecycle.migrate(&tx)?;
                lifecycle.validate(&tx)?;
                tx.execute("INSERT OR IGNORE INTO platform_module_states(module_id,enabled,data_schema_version,revision,created_at,updated_at) VALUES(?1,0,?2,1,?3,?3)",rusqlite::params![info.id,info.data_schema_version,chrono::Utc::now().to_rfc3339()])?;
                tx.execute("UPDATE platform_module_states SET data_schema_version=?2 WHERE module_id=?1",rusqlite::params![info.id,info.data_schema_version])?;
            }
            tx.commit()?;
            super::foundation_repository::rebuild_search(&mut conn)?;
            conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;")?;
            drop(conn);
            observe(&progress, 1.0)?;
            Ok(prepared)
        })
        .await
        .map_err(|_| io())
        .and_then(|result| result);
        self.finish_job(job, result.as_ref().map(|_| ()).map_err(Clone::clone))
            .await;
        let prepared = result?;
        let id = uuid::Uuid::new_v4().to_string();
        let out = RestorePreview {
            id: id.clone(),
            created_at: prepared.manifest.created_at.clone(),
            workspace_id: prepared.manifest.workspace_id.clone(),
            schema_version: prepared.manifest.schema_version,
            projects: prepared.projects,
            resources: prepared.resources,
            tasks: prepared.tasks,
            file_count: prepared.manifest.files.len(),
        };
        let mut store = self.maintenance.prepared.lock().map_err(|_| io())?;
        store.clear();
        store.insert(id, prepared);
        Ok(out)
    }
    pub async fn start_restore(&self, q: IdRequest) -> AppResult<Job> {
        domain::id(&q.request_id)?;
        domain::id(&q.id)?;
        let prepared = self
            .maintenance
            .prepared
            .lock()
            .map_err(|_| io())?
            .remove(&q.id)
            .ok_or_else(|| AppError::validation("恢复预览已失效，请重新选择备份。"))?;
        let job = self.new_job("restore", q.request_id).await?;
        let initial = job.state.lock().map_err(|_| io())?.clone();
        let service = self.clone();
        tokio::spawn(async move {
            let _access = service.access.write().await;
            let _documents = service.document_lock.lock().await;
            let _imports = service.import_lock.lock().await;
            let _drafts = service.draft_lock.lock().await;
            let root = service.database.root().to_owned();
            let progress = job.clone();
            update(&job, "running", 0.0, None);
            let registry = service.modules.clone();
            let result = service
                .database
                .call(move |c| {
                    let safeguard = root
                        .join("backups")
                        .join(filename(&uuid::Uuid::new_v4().to_string()));
                    backup::snapshot(c, &root, &safeguard, &progress.cancel, &|p| {
                        update(&progress, "running", p * 0.7, None)
                    })?;
                    if progress.cancel.load(Ordering::Relaxed) {
                        return Err(AppError::new(
                            ErrorCode::Cancelled,
                            "恢复已取消，原空间保留。",
                            false,
                        ));
                    }
                    update(&progress, "running", 0.8, None);
                    backup::replace(c, &root, prepared)?;
                    registry.lock().map_err(|_| io())?.sync_persisted(c)?;

                    Ok(())
                })
                .await;
            drop(_drafts);
            drop(_imports);
            drop(_documents);
            drop(_access);
            service.finish_job(job, result).await;
        });
        Ok(initial)
    }
}

pub(super) fn observe(job: &RunningJob, progress: f64) -> AppResult<()> {
    if job.cancel.load(Ordering::Relaxed) {
        return Err(AppError::new(
            ErrorCode::Cancelled,
            "已取消，未提交的临时文件已清理。",
            false,
        ));
    }
    update(job, "running", progress, None);
    Ok(())
}

impl PlatformService {
    pub async fn export_backup_file(&self, q: IdRequest, target: PathBuf) -> AppResult<()> {
        domain::id(&q.request_id)?;
        let source = self.backup_path(&q.id)?;
        if !target.is_absolute() || target.is_symlink() {
            return Err(AppError::validation("导出位置无效。"));
        }
        let parent = target
            .parent()
            .ok_or_else(io)?
            .canonicalize()
            .map_err(|_| io())?;
        if parent.starts_with(self.database.root()) {
            return Err(AppError::validation("备份导出位置不能位于当前工作空间内。"));
        }
        let job = self.new_job("exportBackup", q.request_id).await?;
        let progress = job.clone();
        let result = tokio::task::spawn_blocking(move || {
            use std::io::{Read, Write};
            let mut input = std::fs::File::open(source).map_err(|_| io())?;
            let size = input.metadata().map_err(|_| io())?.len();
            let mut output = tempfile::NamedTempFile::new_in(parent).map_err(|_| io())?;
            let mut buffer = [0; 64 * 1024];
            let mut copied = 0;
            loop {
                observe(&progress, copied as f64 / size.max(1) as f64 * 0.95)?;
                let count = input.read(&mut buffer).map_err(|_| io())?;
                if count == 0 {
                    break;
                }
                output.write_all(&buffer[..count]).map_err(|_| io())?;
                copied += count as u64;
            }
            output.as_file().sync_all().map_err(|_| io())?;
            observe(&progress, 0.98)?;
            output.persist(target).map_err(|_| io())?;
            Ok(())
        })
        .await
        .map_err(|_| io())
        .and_then(|r| r);
        self.finish_job(job, result.clone()).await;
        result
    }
}
