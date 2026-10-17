use super::{domain, service::PlatformService};
use crate::contracts::*;
impl PlatformService {
    pub async fn list_module_library(&self, q: LibraryQuery) -> AppResult<LibraryPage> {
        domain::id(&q.request_id)?;
        domain::keyword(&q.keyword)?;
        domain::pagination(q.offset, q.limit)?;
        let providers = self
            .modules
            .lock()
            .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
            .providers();
        self.database
            .call(move |c| {
                let mut items = Vec::new();
                let mut warnings = Vec::new();
                for (info, provider) in providers {
                    if info.state == "error" {
                        warnings.push(format!("{}暂不可用，请在模块中心检查。", info.name));
                        continue;
                    }
                    match provider.library(c, &q) {
                        Ok(mut rows) => {
                            for row in &mut rows {
                                row.module_id = info.id.clone();
                                row.module_name = info.name.clone();
                                row.disabled = !info.enabled;
                            }
                            items.extend(rows);
                        }
                        Err(_) => {
                            warnings.push(format!("{}作品读取失败，请重试或检查模块。", info.name))
                        }
                    }
                }
                items.sort_by(|a, b| {
                    b.updated_at
                        .cmp(&a.updated_at)
                        .then(a.module_id.cmp(&b.module_id))
                        .then(a.kind.cmp(&b.kind))
                        .then(a.id.cmp(&b.id))
                });
                let has_more = items.len() > (q.offset + q.limit) as usize;
                let items = items
                    .into_iter()
                    .skip(q.offset as usize)
                    .take(q.limit as usize)
                    .collect();
                Ok(LibraryPage {
                    items,
                    has_more,
                    warnings,
                })
            })
            .await
    }
    pub async fn read_module_library(&self, q: ReadLibrary) -> AppResult<LibraryReading> {
        domain::id(&q.request_id)?;
        domain::id(&q.id)?;
        domain::optional_id(&q.section_id)?;
        let (info, provider) = self
            .modules
            .lock()
            .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
            .providers()
            .into_iter()
            .find(|(i, _)| i.id == q.module_id)
            .ok_or_else(|| AppError::new(ErrorCode::NotFound, "模块未随当前应用交付。", false))?;
        if info.state == "error" {
            return Err(AppError::new(
                ErrorCode::ModuleDisabled,
                "模块数据暂不可用，请在模块中心检查。",
                true,
            ));
        }
        self.database
            .call(move |c| {
                // One snapshot prevents mixing an old chapter directory with a later body.
                let tx = c.transaction()?;
                let mut view = provider.read_library(&tx, &q)?;
                view.entry.module_id = info.id;
                view.entry.module_name = info.name;
                view.entry.disabled = !info.enabled;
                view.edit_target.disabled = !info.enabled;
                tx.commit()?;
                Ok(view)
            })
            .await
    }
}
