use super::{domain, service::PlatformService, task_repository};
use crate::contracts::*;
fn fields(
    title: &str,
    description: &str,
    date: &Option<String>,
    project: &Option<String>,
) -> AppResult<String> {
    let title = domain::title(title)?;
    domain::description(description)?;
    if let Some(date) = date {
        domain::calendar_date(date)?;
    }
    domain::optional_id(project)?;
    Ok(title)
}
fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}
impl PlatformService {
    pub async fn query_tasks(&self, q: TaskQuery) -> AppResult<TaskPage> {
        domain::id(&q.request_id)?;
        domain::pagination(q.offset, q.limit)?;
        domain::optional_id(&q.project_id)?;
        domain::keyword(&q.keyword)?;
        if let Some(date) = &q.due_date {
            domain::calendar_date(date)?;
        }
        let today = today();
        self.database
            .call(move |c| task_repository::query(c, q, today))
            .await
    }
    pub async fn get_task(&self, q: IdRequest) -> AppResult<Task> {
        domain::id(&q.request_id)?;
        domain::id(&q.id)?;
        let today = today();
        self.database
            .call(move |c| task_repository::get(c, &q.id, &today))
            .await
    }
    pub async fn create_task(&self, mut q: CreateTask) -> AppResult<Task> {
        domain::id(&q.request_id)?;
        q.title = fields(&q.title, &q.description, &q.due_date, &q.project_id)?;
        let today = today();
        self.database
            .call(move |c| task_repository::create(c, q, &today))
            .await
    }
    pub async fn save_task(&self, mut q: SaveTask) -> AppResult<Task> {
        domain::id(&q.request_id)?;
        domain::id(&q.id)?;
        domain::revision(q.base_revision)?;
        q.title = fields(&q.title, &q.description, &q.due_date, &q.project_id)?;
        let today = today();
        self.database
            .call(move |c| task_repository::save(c, q, &today))
            .await
    }
    pub async fn set_task_deleted(&self, q: SetTaskDeleted) -> AppResult<Task> {
        domain::id(&q.request_id)?;
        domain::id(&q.id)?;
        domain::revision(q.base_revision)?;
        let today = today();
        self.database
            .call(move |c| task_repository::deleted(c, q, &today))
            .await
    }
}
