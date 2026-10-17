use super::{Lifecycle, contracts::*, repository};
use crate::{contracts::*, infrastructure::database::Database, platform::service::PlatformService};
use std::sync::Arc;
#[derive(Clone)]
pub struct MogaoService {
    database: Database,
    pub ai: super::studio::ai::NativeAi,
    pub platform: PlatformService,
}
impl MogaoService {
    pub async fn install(database: Database, platform: PlatformService) -> AppResult<Self> {
        let ai = super::studio::ai::NativeAi::new(database.root());
        platform
            .register_module(super::manifest(), Arc::new(Lifecycle { ai: ai.clone() }))
            .await?;
        database.call(|c| {c.execute("UPDATE mogao_studio_ai_runs SET status='interrupted',finished_at=?1 WHERE status='running'",[chrono::Utc::now().to_rfc3339()])?;Ok(())}).await?;
        Ok(Self {
            database,
            platform,
            ai,
        })
    }
    async fn call<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut rusqlite::Connection) -> AppResult<T> + Send + 'static,
    ) -> AppResult<T> {
        let _access = self.platform.access.try_read().map_err(|_| {
            AppError::new(ErrorCode::DbBusy, "备份或恢复正在进行，请稍后重试。", true)
        })?;
        let registry = self.platform.modules.clone();
        self.database
            .call(move |c| {
                registry
                    .lock()
                    .map_err(|_| AppError::new(ErrorCode::DbError, "模块状态不可用。", true))?
                    .require_ready("mogao")?;
                f(c)
            })
            .await
    }
    pub async fn studio_request(
        &self,
        q: super::studio::StudioRequest,
    ) -> AppResult<serde_json::Value> {
        self.call(move |c| super::studio::request(c, q)).await
    }
    pub async fn ai_settings(
        &self,
        data: Option<serde_json::Value>,
    ) -> AppResult<serde_json::Value> {
        let current = self.call(|c| {
            use rusqlite::OptionalExtension;
            let raw: Option<String> = c.query_row("SELECT value FROM mogao_studio_state WHERE key='mogao_native_ai_config'", [], |r|r.get(0)).optional()?;
            Ok(raw.and_then(|s|serde_json::from_str::<serde_json::Value>(&s).ok()).unwrap_or(serde_json::json!({"baseURL":"https://api.deepseek.com","model":"deepseek-chat","persistent":false})))
        }).await?;
        let mut config = current;
        if let Some(data) = data {
            let base = data["baseURL"].as_str().unwrap_or("");
            super::studio::ai::endpoint(base)?;
            if data["model"]
                .as_str()
                .is_none_or(|s| s.trim().is_empty() || s.len() > 200)
            {
                return Err(AppError::validation("模型名称无效。"));
            }
            self.ai.configure(&data)?;
            config = serde_json::json!({"baseURL":base,"model":data["model"],"persistent":data["persistent"].as_bool().unwrap_or(false)});
            let saved = config.to_string();
            self.call(move |c| {c.execute("INSERT INTO mogao_studio_state VALUES('mogao_native_ai_config',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[saved])?;Ok(())}).await?;
        }
        config["configured"] = serde_json::json!(
            self.ai
                .configured(config["persistent"].as_bool().unwrap_or(false))
        );
        Ok(config)
    }
    pub async fn ai_run(
        &self,
        id: &str,
        payload: serde_json::Value,
        emit: impl FnMut(serde_json::Value) -> AppResult<()> + Send,
    ) -> AppResult<serde_json::Value> {
        crate::platform::domain::id(id)?;
        let config = self.ai_settings(None).await?;
        let mut safe = payload;
        if !safe.is_object() || safe.to_string().len() > 2 * 1024 * 1024 {
            return Err(AppError::validation("AI 上下文过大或格式无效。"));
        }
        safe.as_object_mut().unwrap().retain(|key, _| {
            [
                "messages",
                "stream",
                "max_tokens",
                "temperature",
                "top_p",
                "response_format",
                "stream_options",
            ]
            .contains(&key.as_str())
        });
        let request = id.to_owned();
        let model = config["model"].as_str().unwrap_or("").to_owned();
        let encoded = safe.to_string();
        self.call(move |c| {c.execute("INSERT INTO mogao_studio_ai_runs(id,request_json,model,status,created_at) VALUES(?1,?2,?3,'running',?4)",rusqlite::params![request,encoded,model,chrono::Utc::now().to_rfc3339()])?;Ok(())}).await?;
        let mut output = String::new();
        let mut emit = emit;
        let result = self
            .ai
            .run(id, &config, safe, |value| {
                if let Some(text) = value["choices"][0]["delta"]["content"].as_str() {
                    output.push_str(text);
                }
                emit(value)
            })
            .await;
        if let Ok(value) = &result
            && let Some(text) = value["choices"][0]["message"]["content"].as_str()
        {
            output = text.to_owned();
        }
        let status = match &result {
            Ok(_) => "completed",
            Err(e) if e.code == ErrorCode::Cancelled => "cancelled",
            _ => "failed",
        };
        let error = result.as_ref().err().map(|e| format!("{:?}", e.code));
        let request = id.to_owned();
        // A module stop can finish its own in-flight record, but cannot write during workspace replacement.
        let _access = self.platform.access.try_read().map_err(|_| {
            AppError::new(
                ErrorCode::DbBusy,
                "候选收尾遇到空间切换，请稍后查看生成记录。",
                true,
            )
        })?;
        self.database.call(move |c| {c.execute("UPDATE mogao_studio_ai_runs SET output=?2,status=?3,finished_at=?4,error_code=?5 WHERE id=?1 AND status='running'",rusqlite::params![request,output,status,chrono::Utc::now().to_rfc3339(),error])?;Ok(())}).await?;
        result
    }
    pub async fn location(&self, q: Request) -> AppResult<Location> {
        domain_request(&q.request_id)?;
        self.call(repository::location).await
    }
    pub async fn save_location(&self, q: super::contracts::SaveLocation) -> AppResult<()> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::save_location(c, q)).await
    }
    pub async fn works(&self, q: WorkQuery) -> AppResult<Vec<Work>> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::works(c, q)).await
    }
    pub async fn save_work(&self, q: SaveWork) -> AppResult<Work> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::save_work(c, q)).await
    }
    pub async fn delete_work(&self, q: Mutation) -> AppResult<Work> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::delete_work(c, q)).await
    }
    pub async fn tree(&self, q: Scope) -> AppResult<Tree> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::tree(c, q)).await
    }
    pub async fn create_node(&self, q: CreateNode) -> AppResult<Tree> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::create_node(c, q)).await
    }
    pub async fn move_node(&self, q: MoveNode) -> AppResult<Tree> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::move_node(c, q)).await
    }
    pub async fn delete_volume(&self, q: Mutation) -> AppResult<Tree> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::delete_volume(c, q)).await
    }
    pub async fn copy_draft(&self, q: Entity) -> AppResult<Chapter> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::copy_draft(c, q)).await
    }
    pub async fn delete_chapter(&self, q: Mutation) -> AppResult<Tree> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::delete_chapter(c, q)).await
    }
    pub async fn chapter(&self, q: Entity) -> AppResult<Chapter> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::chapter(c, &q, false)).await
    }
    pub async fn save_chapter(&self, q: SaveChapter) -> AppResult<SaveReceipt> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::save_chapter(c, q)).await
    }
    pub async fn versions(&self, q: Entity) -> AppResult<Vec<Version>> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::versions(c, q)).await
    }
    pub async fn restore(&self, q: RestoreChapter) -> AppResult<Chapter> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::restore(c, q)).await
    }
    pub async fn draft(&self, q: Entity) -> AppResult<Option<Draft>> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::draft(c, &q)).await
    }
    pub async fn write_draft(&self, q: WriteChapterDraft) -> AppResult<()> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::write_draft(c, q)).await
    }
    pub async fn clear_draft(&self, q: ClearChapterDraft) -> AppResult<()> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::clear_draft(c, q)).await
    }
    pub async fn settings(&self, q: Scope) -> AppResult<Vec<Setting>> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::settings(c, &q)).await
    }
    pub async fn save_setting(&self, q: SaveSetting) -> AppResult<Setting> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::save_setting(c, q)).await
    }
    pub async fn delete_setting(&self, q: Mutation) -> AppResult<()> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::delete_setting(c, q)).await
    }
    pub async fn import(&self, q: ImportWork) -> AppResult<Work> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::import(c, q)).await
    }
    pub async fn export(&self, q: ExportWork) -> AppResult<Vec<u8>> {
        domain_request(&q.request_id)?;
        self.call(move |c| repository::export(c, q)).await
    }
    pub fn preview_txt(bytes: &[u8]) -> AppResult<Vec<ImportChapter>> {
        repository::preview_txt(bytes)
    }
}
fn domain_request(id: &str) -> AppResult<()> {
    crate::platform::domain::id(id)
}
