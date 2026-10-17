pub mod contracts;
mod library;
mod repository;
mod service;
pub mod studio;
pub use service::MogaoService;

use crate::{
    contracts::*,
    platform::modules::{ModuleInfo, ModuleLifecycle},
};
use rusqlite::{OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
pub struct Lifecycle {
    pub ai: studio::ai::NativeAi,
}
impl ModuleLifecycle for Lifecycle {
    fn migrate(&self, tx: &Transaction) -> AppResult<()> {
        let migrations = [
            include_str!("migrations/0001.sql"),
            include_str!("migrations/0002_location.sql"),
            include_str!("migrations/0003_studio.sql"),
            include_str!("migrations/0004_studio_ai.sql"),
        ];
        let exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='mogao_schema')",
            [],
            |r| r.get(0),
        )?;
        let version = if exists {
            tx.query_row(
                "SELECT coalesce(max(version),0) FROM mogao_schema",
                [],
                |r| r.get::<_, u32>(0),
            )?
        } else {
            0
        };
        let count = if exists {
            tx.query_row("SELECT count(*) FROM mogao_schema", [], |r| {
                r.get::<_, u32>(0)
            })?
        } else {
            0
        };
        if count != version || version > migrations.len() as u32 {
            return Err(AppError::new(
                ErrorCode::MigrationFailed,
                "墨稿数据来自更新版本，请保留备份。",
                false,
            ));
        }
        for (index, sql) in migrations.iter().enumerate() {
            let checksum = Sha256::digest(sql.as_bytes())
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>();
            if index < (version as usize) {
                let saved: Option<String> = tx
                    .query_row(
                        "SELECT checksum FROM mogao_schema WHERE version=?1",
                        [(index + 1) as u32],
                        |r| r.get(0),
                    )
                    .optional()?;
                if saved.as_deref() != Some(&checksum) {
                    return Err(AppError::new(
                        ErrorCode::MigrationFailed,
                        "墨稿迁移校验不一致，请保留备份。",
                        false,
                    ));
                }
            } else {
                tx.execute_batch(sql)?;
                tx.execute(
                    "INSERT INTO mogao_schema VALUES(?1,?2)",
                    rusqlite::params![(index + 1) as u32, checksum],
                )?;
            }
        }

        Ok(())
    }
    fn data_bytes(&self, c: &rusqlite::Connection) -> AppResult<u64> {
        let size:i64=c.query_row("SELECT coalesce((SELECT sum(length(CAST(name||synopsis||goal||genre AS BLOB))) FROM mogao_works),0)+coalesce((SELECT sum(length(CAST(body_json AS BLOB))) FROM mogao_chapters),0)+coalesce((SELECT sum(length(CAST(body_json AS BLOB))) FROM mogao_versions),0)+coalesce((SELECT sum(length(CAST(body_json AS BLOB))) FROM mogao_drafts),0)+coalesce((SELECT sum(length(CAST(title||fields_json AS BLOB))) FROM mogao_settings),0)",[],|r|r.get(0))?;
        let studio:i64=c.query_row("SELECT coalesce((SELECT sum(length(CAST(data AS BLOB))) FROM mogao_studio_entities),0)+coalesce((SELECT sum(length(CAST(data AS BLOB))) FROM mogao_studio_versions),0)+coalesce((SELECT sum(length(CAST(value AS BLOB))) FROM mogao_studio_state),0)",[],|r|r.get(0))?;
        let ai:i64=c.query_row("SELECT coalesce(sum(length(CAST(request_json||output AS BLOB))),0) FROM mogao_studio_ai_runs",[],|r|r.get(0))?;
        Ok((size + studio + ai) as u64)
    }
    fn content_kinds(&self) -> &'static [&'static str] {
        &[
            "mogao-work",
            "mogao-chapter",
            "mogao-character",
            "mogao-world",
            "mogao-outline",
            "mogao-studio-projects",
            "mogao-studio-chapters",
            "mogao-studio-characters",
            "mogao-studio-world-settings",
            "mogao-studio-outlines",
            "mogao-studio-plot-threads",
            "mogao-studio-timeline-events",
            "mogao-studio-materials",
            "mogao-studio-short-stories",
        ]
    }
    fn search(
        &self,
        c: &rusqlite::Connection,
        q: &SearchQuery,
        enabled: bool,
    ) -> AppResult<Vec<SearchHit>> {
        let mut hits = repository::search(c, q, enabled)?;
        hits.extend(studio::platform::search(c, q, enabled)?);
        Ok(hits)
    }
    fn trash(&self, c: &rusqlite::Connection, q: &TrashQuery) -> AppResult<Vec<TrashItem>> {
        let mut items = repository::trash(c, q)?;
        items.extend(studio::platform::trash(c, q)?);
        Ok(items)
    }
    fn impact(&self, c: &rusqlite::Connection, q: &TrashMutation) -> AppResult<DeleteImpact> {
        if q.kind.starts_with("mogao-studio-") {
            return studio::platform::impact(c, q);
        }
        repository::impact(c, q)
    }
    fn restore(&self, c: &mut rusqlite::Connection, q: TrashMutation) -> AppResult<()> {
        if q.kind.starts_with("mogao-studio-") {
            return studio::platform::mutate(c, q, false);
        }
        repository::trash_restore(c, q)
    }
    fn purge(&self, c: &mut rusqlite::Connection, q: TrashMutation) -> AppResult<()> {
        if q.kind.starts_with("mogao-studio-") {
            return studio::platform::mutate(c, q, true);
        }
        repository::purge(c, q)
    }
    fn library(&self, c: &rusqlite::Connection, q: &LibraryQuery) -> AppResult<Vec<LibraryEntry>> {
        library::list(c, q)
    }
    fn read_library(&self, c: &rusqlite::Connection, q: &ReadLibrary) -> AppResult<LibraryReading> {
        library::read(c, q)
    }
    fn initialize(&self) -> AppResult<()> {
        Ok(())
    }
    fn validate(&self, c: &rusqlite::Connection) -> AppResult<()> {
        repository::validate(c)?;
        studio::validate(c)
    }
    fn flush_and_stop(&self) -> AppResult<()> {
        self.ai.cancel("");
        Ok(())
    }
}
pub fn manifest() -> ModuleInfo {
    ModuleInfo {
        id: "mogao".into(),
        name: "墨稿".into(),
        description: "长篇与短篇写作、人物和设定、素材及可选 AI；无需密钥即可手动创作。".into(),
        version: "0.1.0".into(),
        api_version: 1,
        data_schema_version: 4,
        requested_services: vec![
            "ui.navigation".into(),
            "backup.participate".into(),
            "projects.read".into(),
            "resources.read".into(),
            "search.publish".into(),
        ],
        state: "disabled".into(),
        enabled: false,
        error_code: None,
        data_bytes: 0,
    }
}
