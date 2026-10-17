use crate::contracts::{AppError, AppResult, ErrorCode};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::Arc};
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModuleInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub api_version: u32,
    pub data_schema_version: u32,
    pub requested_services: Vec<String>,
    pub state: String,
    pub enabled: bool,
    pub error_code: Option<ErrorCode>,
    pub data_bytes: u64,
}
pub trait ModuleLifecycle: Send + Sync {
    fn migrate(&self, _connection: &rusqlite::Transaction) -> AppResult<()> {
        Ok(())
    }
    fn data_bytes(&self, _c: &rusqlite::Connection) -> AppResult<u64> {
        Ok(0)
    }
    fn content_kinds(&self) -> &'static [&'static str] {
        &[]
    }
    fn search(
        &self,
        _c: &rusqlite::Connection,
        _q: &crate::contracts::SearchQuery,
        _enabled: bool,
    ) -> AppResult<Vec<crate::contracts::SearchHit>> {
        Ok(vec![])
    }
    fn trash(
        &self,
        _c: &rusqlite::Connection,
        _q: &crate::contracts::TrashQuery,
    ) -> AppResult<Vec<crate::contracts::TrashItem>> {
        Ok(vec![])
    }
    fn impact(
        &self,
        _c: &rusqlite::Connection,
        _q: &crate::contracts::TrashMutation,
    ) -> AppResult<crate::contracts::DeleteImpact> {
        Err(AppError::validation("模块回收类型无效。"))
    }
    fn restore(
        &self,
        _c: &mut rusqlite::Connection,
        _q: crate::contracts::TrashMutation,
    ) -> AppResult<()> {
        Err(AppError::validation("模块回收类型无效。"))
    }
    fn purge(
        &self,
        _c: &mut rusqlite::Connection,
        _q: crate::contracts::TrashMutation,
    ) -> AppResult<()> {
        Err(AppError::validation("模块回收类型无效。"))
    }
    // Read-only module publications: canonical content stays owned by the provider.
    fn library(
        &self,
        _c: &rusqlite::Connection,
        _q: &crate::contracts::LibraryQuery,
    ) -> AppResult<Vec<crate::contracts::LibraryEntry>> {
        Ok(vec![])
    }
    fn read_library(
        &self,
        _c: &rusqlite::Connection,
        _q: &crate::contracts::ReadLibrary,
    ) -> AppResult<crate::contracts::LibraryReading> {
        Err(AppError::new(
            ErrorCode::NotFound,
            "资料条目不存在。",
            false,
        ))
    }
    fn initialize(&self) -> AppResult<()>;
    fn flush_and_stop(&self) -> AppResult<()>;
    fn validate(&self, _connection: &rusqlite::Connection) -> AppResult<()> {
        Ok(())
    }
}
pub struct Registry {
    entries: BTreeMap<String, (ModuleInfo, Arc<dyn ModuleLifecycle>)>,
}
impl Default for Registry {
    fn default() -> Self {
        Self::new()
    }
}
impl Registry {
    pub fn new() -> Self {
        Self {
            entries: BTreeMap::new(),
        }
    }
    pub fn register(
        &mut self,
        mut info: ModuleInfo,
        lifecycle: Arc<dyn ModuleLifecycle>,
    ) -> AppResult<()> {
        if info.id.is_empty()
            || !info
                .id
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
            || info.api_version != 1
            || info.data_schema_version < 1
            || self.entries.contains_key(&info.id)
            || info.requested_services.iter().any(|s| {
                ![
                    "resources.read",
                    "resources.publish",
                    "projects.read",
                    "search.publish",
                    "jobs.register",
                    "backup.participate",
                    "ai.request",
                    "ui.navigation",
                ]
                .contains(&s.as_str())
            })
        {
            return Err(AppError::validation("模块清单不兼容或重复。"));
        }
        info.enabled = false;
        info.state = "disabled".into();
        info.error_code = None;
        self.entries.insert(info.id.clone(), (info, lifecycle));
        Ok(())
    }
    pub fn list(&self) -> Vec<ModuleInfo> {
        self.entries.values().map(|(i, _)| i.clone()).collect()
    }
    pub fn providers(&self) -> Vec<(ModuleInfo, Arc<dyn ModuleLifecycle>)> {
        self.entries.values().cloned().collect()
    }
    pub fn fail(&mut self, id: &str, code: ErrorCode) {
        if let Some((info, _)) = self.entries.get_mut(id) {
            info.enabled = false;
            info.state = "error".into();
            info.error_code = Some(code);
        }
    }
    pub fn sync_persisted(&mut self, connection: &rusqlite::Connection) -> AppResult<()> {
        for (info, lifecycle) in self.entries.values_mut() {
            let enabled = connection.query_row(
                "SELECT enabled FROM platform_module_states WHERE module_id=?1",
                [&info.id],
                |r| r.get::<_, bool>(0),
            )?;
            let result = if enabled {
                lifecycle.initialize()
            } else {
                lifecycle.flush_and_stop()
            };
            info.enabled = enabled && result.is_ok();
            info.state = if result.is_err() {
                "error"
            } else if enabled {
                "ready"
            } else {
                "disabled"
            }
            .into();
            info.error_code = result.err().map(|e| e.code);
        }
        Ok(())
    }
    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> AppResult<ModuleInfo> {
        let (info, lifecycle) = self
            .entries
            .get_mut(id)
            .ok_or_else(|| AppError::new(ErrorCode::NotFound, "模块未随应用交付。", false))?;
        if enabled == info.enabled && info.state != "error" {
            return Ok(info.clone());
        }
        info.state = if enabled { "initializing" } else { "disabling" }.into();
        let result = if enabled {
            lifecycle.initialize()
        } else {
            lifecycle.flush_and_stop()
        };
        match result {
            Ok(()) => {
                info.enabled = enabled;
                info.state = if enabled { "ready" } else { "disabled" }.into();
                info.error_code = None;
                Ok(info.clone())
            }
            Err(error) => {
                info.state = if enabled { "error" } else { "ready" }.into();
                info.error_code = Some(error.code.clone());
                Err(error)
            }
        }
    }
    pub fn require_ready(&self, id: &str) -> AppResult<()> {
        let info = &self
            .entries
            .get(id)
            .ok_or_else(|| AppError::new(ErrorCode::NotFound, "模块不存在。", false))?
            .0;
        if !info.enabled || info.state != "ready" {
            return Err(AppError::new(
                ErrorCode::ModuleDisabled,
                "请先启用模块。",
                false,
            ));
        }
        Ok(())
    }
}
