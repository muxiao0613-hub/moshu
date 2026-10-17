use super::repository::{get_project, not_found, now};
use crate::contracts::*;
use rusqlite::{Connection, OptionalExtension, Row, params};
fn row(r: &Row<'_>, today: &str) -> rusqlite::Result<Task> {
    let status: String = r.get(3)?;
    let priority: String = r.get(4)?;
    let due_date: Option<String> = r.get(5)?;
    if let Some(date) = &due_date {
        super::domain::calendar_date(date).map_err(|_| rusqlite::Error::InvalidQuery)?;
    }
    let overdue = status != "completed" && due_date.as_deref().is_some_and(|date| date < today);
    Ok(Task {
        id: r.get(0)?,
        title: r.get(1)?,
        description: r.get(2)?,
        status: match status.as_str() {
            "notStarted" => TaskStatus::NotStarted,
            "inProgress" => TaskStatus::InProgress,
            "completed" => TaskStatus::Completed,
            _ => return Err(rusqlite::Error::InvalidQuery),
        },
        priority: match priority.as_str() {
            "low" => TaskPriority::Low,
            "medium" => TaskPriority::Medium,
            "high" => TaskPriority::High,
            _ => return Err(rusqlite::Error::InvalidQuery),
        },
        due_date,
        project_id: r.get(6)?,
        revision: r.get(7)?,
        created_at: r.get(8)?,
        updated_at: r.get(9)?,
        deleted_at: r.get(10)?,
        overdue,
    })
}
const COLUMNS: &str = "id,title,description,status,priority,due_date,project_id,revision,created_at,updated_at,deleted_at";
pub fn get(c: &Connection, id: &str, today: &str) -> AppResult<Task> {
    c.query_row(
        &format!("SELECT {COLUMNS} FROM platform_tasks WHERE id=?1"),
        [id],
        |r| row(r, today),
    )
    .optional()?
    .ok_or_else(not_found)
}
fn owner(c: &Connection, id: &Option<String>) -> AppResult<()> {
    if let Some(id) = id
        && get_project(c, id)?.deleted_at.is_some()
    {
        return Err(not_found());
    }
    Ok(())
}
pub fn query(c: &Connection, q: TaskQuery, today: String) -> AppResult<TaskPage> {
    owner(c, &q.project_id)?;
    let sql = format!(
        "SELECT {COLUMNS} FROM platform_tasks WHERE deleted_at IS NULL AND (?1='all' OR (?1='today' AND due_date=?2) OR (?1='overdue' AND due_date<?2 AND status!='completed') OR (?1='completed' AND status='completed')) AND (?3 IS NULL OR status=?3) AND (?4 IS NULL OR due_date=?4) AND (?5 IS NULL OR project_id=?5) AND (?6='' OR instr(lower(title||' '||description),lower(?6))>0) ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,due_date IS NULL,due_date,updated_at DESC,id LIMIT ?7 OFFSET ?8"
    );
    let mut statement = c.prepare(&sql)?;
    let mut items = statement
        .query_map(
            params![
                q.view.as_str(),
                today,
                q.status.as_ref().map(TaskStatus::as_str),
                q.due_date,
                q.project_id,
                q.keyword,
                q.limit + 1,
                q.offset
            ],
            |r| row(r, &today),
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let has_more = items.len() > q.limit as usize;
    items.truncate(q.limit as usize);
    Ok(TaskPage {
        items,
        today,
        has_more,
    })
}
pub fn create(c: &mut Connection, q: CreateTask, today: &str) -> AppResult<Task> {
    let tx = c.transaction()?;
    owner(&tx, &q.project_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    let time = now();
    let changed=tx.execute("INSERT INTO platform_tasks(id,title,description,status,priority,due_date,project_id,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8)",params![id,q.title,q.description,q.status.as_str(),q.priority.as_str(),q.due_date,q.project_id,time])?;
    if changed != 1 {
        return Err(AppError::new(
            ErrorCode::DbError,
            "任务未创建，请重试。",
            true,
        ));
    }
    let task = get(&tx, &id, today)?;
    tx.commit()?;
    Ok(task)
}
pub fn save(c: &mut Connection, q: SaveTask, today: &str) -> AppResult<Task> {
    let tx = c.transaction()?;
    let old = get(&tx, &q.id, today)?;
    if old.deleted_at.is_some() {
        return Err(not_found());
    }
    if old.revision != q.base_revision {
        return Err(AppError::conflict(old.revision));
    }
    if old.project_id != q.project_id {
        owner(&tx, &q.project_id)?;
    }
    let changed=tx.execute("UPDATE platform_tasks SET title=?1,description=?2,status=?3,priority=?4,due_date=?5,project_id=?6,updated_at=?7,revision=revision+1 WHERE id=?8 AND revision=?9 AND deleted_at IS NULL",params![q.title,q.description,q.status.as_str(),q.priority.as_str(),q.due_date,q.project_id,now(),q.id,q.base_revision])?;
    if changed != 1 {
        return Err(AppError::conflict(old.revision));
    }
    let task = get(&tx, &q.id, today)?;
    tx.commit()?;
    Ok(task)
}
pub fn deleted(c: &mut Connection, q: SetTaskDeleted, today: &str) -> AppResult<Task> {
    let tx = c.transaction()?;
    let old = get(&tx, &q.id, today)?;
    if old.revision != q.base_revision {
        return Err(AppError::conflict(old.revision));
    }
    if old.deleted_at.is_some() != q.deleted {
        let time = now();
        let deleted = q.deleted.then_some(time.clone());
        let changed=tx.execute("UPDATE platform_tasks SET deleted_at=?1,updated_at=?2,revision=revision+1 WHERE id=?3 AND revision=?4",params![deleted,time,q.id,q.base_revision])?;
        if changed != 1 {
            return Err(AppError::conflict(old.revision));
        }
    }
    let task = get(&tx, &q.id, today)?;
    tx.commit()?;
    Ok(task)
}
