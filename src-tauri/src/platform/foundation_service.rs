use super::{domain, foundation_repository as repo, service::PlatformService};
use crate::contracts::*;
use rusqlite::OptionalExtension;
fn page(value: &str) -> AppResult<()> {
    if ![
        "home",
        "projects",
        "resources",
        "notes",
        "tasks",
        "search",
        "modules",
        "trash",
        "settings",
        "help",
        "pet",
        "document",
        "module",
    ]
    .contains(&value)
    {
        return Err(AppError::validation("页面无效。"));
    }
    Ok(())
}

impl PlatformService {
    pub async fn startup(&self, q: Request) -> AppResult<Startup> {
        domain::id(&q.request_id)?;
        let mut startup = self.database.call(repo::startup).await?;
        if startup.location.page == "module"
            && self
                .modules
                .lock()
                .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
                .require_ready(startup.location.entity_id.as_deref().unwrap_or(""))
                .is_err()
        {
            startup.location = PageLocation {
                page: "home".into(),
                entity_id: None,
            };
            startup.notice = Some("上次模块不可用，已返回首页。".into());
        }
        Ok(startup)
    }
    pub async fn get_preferences(&self, q: Request) -> AppResult<Preferences> {
        domain::id(&q.request_id)?;
        self.database.call(|c| repo::preferences(c)).await
    }
    pub async fn save_preferences(&self, q: SavePreferences) -> AppResult<Preferences> {
        domain::id(&q.request_id)?;
        domain::revision(q.base_revision)?;
        domain::personal_preferences(&q.preferences)?;
        if let Some(id) = &q.preferences.avatar_resource_id {
            let preview = self
                .preview_file(IdRequest {
                    request_id: q.request_id.clone(),
                    id: id.clone(),
                })
                .await?;
            if preview.kind != "image" {
                return Err(AppError::validation("头像须为已导入的受支持图片。"));
            }
        }
        self.database
            .call(move |c| repo::save_preferences(c, q))
            .await
    }
    pub async fn reset_preferences(&self, q: Request) -> AppResult<Preferences> {
        domain::id(&q.request_id)?;
        self.database
            .call(move |c| {
                let revision = c
                    .query_row(
                        "SELECT revision FROM platform_preferences WHERE key='personal'",
                        [],
                        |r| r.get::<_, i64>(0),
                    )
                    .unwrap_or(1);
                let next=Preferences{revision:revision+1,..Preferences::default()};
                let json=serde_json::to_string(&next).map_err(|_|AppError::validation("设置格式无效。"))?;
                c.execute("INSERT INTO platform_preferences(key,value_json,schema_version,revision,created_at,updated_at) VALUES('personal',?1,1,?2,?3,?3) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision,updated_at=excluded.updated_at",rusqlite::params![json,next.revision,chrono::Utc::now().to_rfc3339()])?;
                Ok(next)
            })
            .await
    }
    pub async fn save_location(&self, q: SaveLocation) -> AppResult<()> {
        domain::id(&q.request_id)?;
        page(&q.location.page)?;
        if q.location.page == "module" {
            let id = q
                .location
                .entity_id
                .as_ref()
                .ok_or_else(|| AppError::validation("模块编号缺失。"))?;
            self.modules
                .lock()
                .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
                .require_ready(id)?;
        } else {
            domain::optional_id(&q.location.entity_id)?;
        }
        self.database
            .call(move |c| repo::save_location(c, &q.location))
            .await
    }
    pub async fn search(&self, q: SearchQuery) -> AppResult<SearchPage> {
        domain::id(&q.request_id)?;
        domain::keyword(&q.keyword)?;
        domain::pagination(q.offset, q.limit)?;
        domain::optional_id(&q.project_id)?;
        let providers = self
            .modules
            .lock()
            .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
            .providers();
        if q.kind.as_deref().is_some_and(|k| {
            !["project", "file", "link", "note", "task"].contains(&k)
                && !providers
                    .iter()
                    .any(|(_, p)| p.content_kinds().contains(&k))
        }) {
            return Err(AppError::validation("搜索类型无效。"));
        }
        if let Some(tag) = &q.tag {
            domain::tags(std::slice::from_ref(tag))?;
        }
        self.database
            .call(move |c| {
                let mut core = q.clone();
                core.offset = 0;
                core.limit = q.offset + q.limit + 1;
                let mut page = repo::search(c, core)?;
                for (info, provider) in providers {
                    if info.state != "error"
                        && let Ok(rows) = provider.search(c, &q, info.enabled)
                    {
                        page.items.extend(rows);
                    }
                }
                page.items.sort_by(|a, b| {
                    b.updated_at
                        .cmp(&a.updated_at)
                        .then(a.id.cmp(&b.id))
                        .then(a.kind.cmp(&b.kind))
                });
                page.has_more = page.items.len() > (q.offset + q.limit) as usize;
                page.items = page
                    .items
                    .into_iter()
                    .skip(q.offset as usize)
                    .take(q.limit as usize)
                    .collect();
                Ok(page)
            })
            .await
    }
    pub async fn rebuild_search(&self, q: Request) -> AppResult<()> {
        domain::id(&q.request_id)?;
        self.database.call(repo::rebuild_search).await
    }
    pub async fn dashboard(&self, q: Request) -> AppResult<Dashboard> {
        domain::id(&q.request_id)?;
        self.database.call(move|c|{let today=chrono::Local::now().date_naive().to_string();let mut s=c.prepare("SELECT id FROM platform_projects WHERE deleted_at IS NULL ORDER BY coalesce((SELECT visited_at FROM platform_recent_visits WHERE entity_type='projects' AND entity_id=platform_projects.id),updated_at) DESC,id LIMIT 6")?;let ids=s.query_map([],|r|r.get::<_,String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;let projects=ids.iter().map(|id|super::repository::get_project(c,id)).collect::<AppResult<_>>()?;let notes=super::repository::list_notes(c,ListRequest{request_id:q.request_id.clone(),offset:0,limit:6})?;let query=|view|TaskQuery{request_id:q.request_id.clone(),offset:0,limit:6,view,status:None,due_date:None,project_id:None,keyword:String::new()};let today_tasks=super::task_repository::query(c,query(TaskView::Today),today.clone())?.items.into_iter().filter(|t|t.status!=TaskStatus::Completed).collect();let overdue_tasks=super::task_repository::query(c,query(TaskView::Overdue),today.clone())?.items;Ok(Dashboard{projects,notes,today_tasks,overdue_tasks,today})}).await
    }
    pub async fn trash(&self, q: TrashQuery) -> AppResult<Vec<TrashItem>> {
        domain::id(&q.request_id)?;
        domain::pagination(q.offset, q.limit)?;
        let providers = self
            .modules
            .lock()
            .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
            .providers();
        self.database
            .call(move |c| {
                let core = TrashQuery {
                    request_id: q.request_id.clone(),
                    kind: q.kind.clone(),
                    offset: 0,
                    limit: q.offset + q.limit + 1,
                };
                let mut rows = repo::trash(c, core)?;
                for (info, p) in providers {
                    if info.state != "error"
                        && let Ok(items) = p.trash(c, &q)
                    {
                        rows.extend(items);
                    }
                }
                rows.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at).then(a.id.cmp(&b.id)));
                Ok(rows
                    .into_iter()
                    .skip(q.offset as usize)
                    .take(q.limit as usize)
                    .collect())
            })
            .await
    }
    fn content_provider(
        &self,
        kind: &str,
    ) -> AppResult<Option<std::sync::Arc<dyn super::modules::ModuleLifecycle>>> {
        Ok(self
            .modules
            .lock()
            .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
            .providers()
            .into_iter()
            .find(|(_, p)| p.content_kinds().contains(&kind))
            .map(|(_, p)| p))
    }
    pub async fn delete_impact(&self, q: TrashMutation) -> AppResult<DeleteImpact> {
        domain::id(&q.request_id)?;
        domain::id(&q.id)?;
        domain::revision(q.base_revision)?;
        let provider = self.content_provider(&q.kind)?;
        self.database
            .call(move |c| match provider {
                Some(p) => p.impact(c, &q),
                None => repo::impact(c, &q),
            })
            .await
    }
    pub async fn restore_trash(&self, q: TrashMutation) -> AppResult<()> {
        domain::id(&q.request_id)?;
        domain::id(&q.id)?;
        domain::revision(q.base_revision)?;
        if let Some(provider) = self.content_provider(&q.kind)? {
            return self.database.call(move |c| provider.restore(c, q)).await;
        }
        self.database
            .call(move |c| {
                repo::impact(c, &q)?;
                match q.kind.as_str() {
                    "project" => {
                        super::repository::set_project_deleted(
                            c,
                            SetProjectDeleted {
                                request_id: q.request_id,
                                id: q.id,
                                base_revision: q.base_revision,
                                deleted: false,
                            },
                        )?;
                    }
                    "task" => {
                        super::task_repository::deleted(
                            c,
                            SetTaskDeleted {
                                request_id: q.request_id,
                                id: q.id,
                                base_revision: q.base_revision,
                                deleted: false,
                            },
                            &chrono::Local::now().date_naive().to_string(),
                        )?;
                    }
                    _ => {
                        super::content_repository::set_resource_deleted(
                            c,
                            SetResourceDeleted {
                                request_id: q.request_id,
                                id: q.id,
                                base_revision: q.base_revision,
                                deleted: false,
                            },
                        )?;
                    }
                }
                Ok(())
            })
            .await
    }
    pub async fn purge_trash(&self, q: TrashMutation) -> AppResult<()> {
        domain::id(&q.request_id)?;
        domain::id(&q.id)?;
        domain::revision(q.base_revision)?;
        if let Some(provider) = self.content_provider(&q.kind)? {
            return self.database.call(move |c| provider.purge(c, q)).await;
        }
        let _documents = self.document_lock.lock().await;
        let _imports = self.import_lock.lock().await;
        let paths = self.database.call(move |c| repo::purge(c, q)).await?;
        let root = self.database.root().to_owned();
        for name in paths {
            if !name.contains('/') && !name.contains('\\') && !name.contains("..") {
                let path = root.join("attachments").join(name);
                if path.is_file() && !path.is_symlink() {
                    std::fs::remove_file(path).map_err(|_| {
                        AppError::new(
                            ErrorCode::IoError,
                            "内容已删除，未引用文件清理失败；重启将重试。",
                            true,
                        )
                    })?;
                }
            }
        }
        Ok(())
    }
    pub async fn storage_info(&self, q: Request) -> AppResult<StorageInfo> {
        domain::id(&q.request_id)?;
        let status = self.status(q).await?;
        let root = self.database.root().to_owned();
        tokio::task::spawn_blocking(move || {
            fn size(path: &std::path::Path) -> AppResult<u64> {
                if path.is_symlink() {
                    return Err(AppError::new(
                        ErrorCode::IoError,
                        "数据目录含不安全链接。",
                        false,
                    ));
                }
                let meta = path
                    .metadata()
                    .map_err(|_| AppError::new(ErrorCode::IoError, "无法统计数据容量。", true))?;
                if meta.is_file() {
                    return Ok(meta.len());
                }
                let mut total = 0;
                for item in std::fs::read_dir(path)
                    .map_err(|_| AppError::new(ErrorCode::IoError, "无法统计目录。", true))?
                {
                    total += size(
                        &item
                            .map_err(|_| AppError::new(ErrorCode::IoError, "无法统计目录。", true))?
                            .path(),
                    )?;
                }
                Ok(total)
            }
            Ok(StorageInfo {
                location: root.to_string_lossy().into(),
                database_bytes: size(&root.join("workspace.sqlite"))?,
                attachment_bytes: size(&root.join("attachments"))?,
                editing_bytes: size(&root.join("editing"))?,
                backup_bytes: size(&root.join("backups"))?,
                schema_version: status.schema_version,
                app_version: status.app_version,
            })
        })
        .await
        .map_err(|_| AppError::new(ErrorCode::IoError, "容量任务中断。", true))?
    }
}
impl PlatformService {
    pub async fn register_module(
        &self,
        info: super::modules::ModuleInfo,
        lifecycle: std::sync::Arc<dyn super::modules::ModuleLifecycle>,
    ) -> AppResult<()> {
        self.modules
            .lock()
            .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
            .register(info.clone(), lifecycle.clone())?;
        let id = info.id.clone();
        let installed=self.database.call(move|c|{let tx=c.transaction()?;lifecycle.migrate(&tx)?;lifecycle.validate(&tx)?;let enabled=tx.query_row("SELECT enabled FROM platform_module_states WHERE module_id=?1",[&id],|r|r.get::<_,bool>(0)).optional()?.unwrap_or(false);tx.execute("INSERT OR IGNORE INTO platform_module_states(module_id,enabled,data_schema_version,revision,created_at,updated_at) VALUES(?1,0,?2,1,?3,?3)",rusqlite::params![id,info.data_schema_version,chrono::Utc::now().to_rfc3339()])?;tx.execute("UPDATE platform_module_states SET data_schema_version=?2 WHERE module_id=?1",rusqlite::params![id,info.data_schema_version])?;tx.commit()?;Ok(enabled)}).await;
        let enabled = match installed {
            Ok(enabled) => enabled,
            Err(error) => {
                self.modules
                    .lock()
                    .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
                    .fail(&info.id, error.code.clone());
                return Err(error);
            }
        };
        if enabled {
            self.modules
                .lock()
                .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
                .set_enabled(&info.id, true)?;
        }
        Ok(())
    }
    pub async fn list_modules(&self, q: Request) -> AppResult<Vec<super::modules::ModuleInfo>> {
        domain::id(&q.request_id)?;
        let providers = self
            .modules
            .lock()
            .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
            .providers();
        self.database
            .call(move |c| {
                Ok(providers
                    .into_iter()
                    .map(|(mut info, provider)| {
                        info.data_bytes = provider.data_bytes(c).unwrap_or(0);
                        info
                    })
                    .collect())
            })
            .await
    }
    pub async fn set_module(&self, q: SetModule) -> AppResult<super::modules::ModuleInfo> {
        domain::id(&q.request_id)?;
        let previous = self
            .modules
            .lock()
            .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
            .list()
            .into_iter()
            .find(|i| i.id == q.id)
            .ok_or_else(|| AppError::new(ErrorCode::NotFound, "模块未交付。", false))?;
        if q.enabled {
            let provider = self
                .modules
                .lock()
                .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
                .providers()
                .into_iter()
                .find(|(i, _)| i.id == q.id)
                .map(|(_, p)| p)
                .ok_or_else(|| AppError::validation("模块未交付。"))?;
            let result = self
                .database
                .call(move |c| {
                    let tx = c.transaction()?;
                    provider.migrate(&tx)?;
                    provider.validate(&tx)?;
                    tx.commit()?;
                    Ok(())
                })
                .await;
            if let Err(error) = result {
                self.modules
                    .lock()
                    .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
                    .fail(&q.id, error.code.clone());
                return Err(error);
            }
        }
        let info = self
            .modules
            .lock()
            .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
            .set_enabled(&q.id, q.enabled)?;
        let copy = info.clone();
        let result=self.database.call(move|c|{let tx=c.transaction()?;let changed=tx.execute("INSERT INTO platform_module_states(module_id,enabled,data_schema_version,revision,created_at,updated_at) VALUES(?1,?2,?3,1,?4,?4) ON CONFLICT(module_id) DO UPDATE SET enabled=excluded.enabled,revision=platform_module_states.revision+1,updated_at=excluded.updated_at",rusqlite::params![copy.id,copy.enabled,copy.data_schema_version,chrono::Utc::now().to_rfc3339()])?;if changed!=1{return Err(AppError::new(ErrorCode::DbError,"模块状态未能保存。",true))}
            if !copy.enabled{tx.execute("DELETE FROM platform_search_projection WHERE module_id=?1",[copy.id])?;}tx.commit()?;Ok(())}).await;
        if let Err(error) = result {
            let _ = self
                .modules
                .lock()
                .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
                .set_enabled(&q.id, previous.enabled);
            return Err(error);
        }

        Ok(info)
    }
}
impl PlatformService {
    pub async fn module_access(&self, q: ModuleRequest) -> AppResult<super::modules::ModuleInfo> {
        domain::id(&q.request_id)?;
        let registry = self
            .modules
            .lock()
            .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态暂不可用。", true))?;
        registry.require_ready(&q.id)?;
        registry
            .list()
            .into_iter()
            .find(|m| m.id == q.id)
            .ok_or_else(|| AppError::new(ErrorCode::NotFound, "模块未交付。", false))
    }
}
