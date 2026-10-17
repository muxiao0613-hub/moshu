use moshub_lib::{
    contracts::*,
    infrastructure::database::Database,
    platform::{domain::calendar_date, service::PlatformService},
};
use tempfile::TempDir;
fn uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn id(value: &str) -> IdRequest {
    IdRequest {
        request_id: uuid(),
        id: value.into(),
    }
}
fn setup() -> (TempDir, Database, PlatformService) {
    let root = TempDir::new().unwrap();
    let db = Database::open(root.path()).unwrap();
    let s = PlatformService::new(db.clone());
    (root, db, s)
}
fn query(view: TaskView) -> TaskQuery {
    TaskQuery {
        request_id: uuid(),
        offset: 0,
        limit: 100,
        view,
        status: None,
        due_date: None,
        project_id: None,
        keyword: String::new(),
    }
}
fn create(date: Option<String>) -> CreateTask {
    CreateTask {
        request_id: uuid(),
        title: "本地任务".into(),
        description: "计划与行动".into(),
        status: TaskStatus::NotStarted,
        priority: TaskPriority::Medium,
        due_date: date,
        project_id: None,
    }
}
fn edit(task: &Task) -> SaveTask {
    SaveTask {
        request_id: uuid(),
        id: task.id.clone(),
        base_revision: task.revision,
        title: task.title.clone(),
        description: task.description.clone(),
        status: task.status.clone(),
        priority: task.priority.clone(),
        due_date: task.due_date.clone(),
        project_id: task.project_id.clone(),
    }
}
fn deleted(t: &Task, value: bool) -> SetTaskDeleted {
    SetTaskDeleted {
        request_id: uuid(),
        id: t.id.clone(),
        base_revision: t.revision,
        deleted: value,
    }
}
#[tokio::test]
async fn tasks_create_edit_complete_reopen_delete_restore_and_reopen_database() {
    let (root, db, s) = setup();
    let project = s
        .create_project(CreateProject {
            request_id: uuid(),
            name: "学习项目".into(),
            description: "关联".into(),
        })
        .await
        .unwrap();
    let mut req = create(Some("2000-02-29".into()));
    req.project_id = Some(project.id.clone());
    let task = s.create_task(req).await.unwrap();
    let mut q = edit(&task);
    q.status = TaskStatus::InProgress;
    q.priority = TaskPriority::High;
    q.description = "更新的说明".into();
    let task = s.save_task(q).await.unwrap();
    assert_eq!(task.revision, 2);
    assert!(task.overdue);
    let mut q = edit(&task);
    q.status = TaskStatus::Completed;
    let task = s.save_task(q).await.unwrap();
    assert!(!task.overdue);
    assert_eq!(
        s.query_tasks(query(TaskView::Completed))
            .await
            .unwrap()
            .items[0]
            .id,
        task.id
    );
    let mut q = edit(&task);
    q.status = TaskStatus::NotStarted;
    q.due_date = None;
    let task = s.save_task(q).await.unwrap();
    assert!(!task.overdue);
    assert_eq!(task.due_date, None);
    let removed = s.set_task_deleted(deleted(&task, true)).await.unwrap();
    assert!(
        s.query_tasks(query(TaskView::All))
            .await
            .unwrap()
            .items
            .is_empty()
    );
    assert_eq!(
        s.set_task_deleted(deleted(&removed, true))
            .await
            .unwrap()
            .revision,
        removed.revision
    );
    let restored = s.set_task_deleted(deleted(&removed, false)).await.unwrap();
    assert_eq!(restored.project_id, Some(project.id));
    assert_eq!(restored.description, "更新的说明");
    drop(s);
    drop(db);
    let s = PlatformService::new(Database::open(root.path()).unwrap());
    assert_eq!(
        s.get_task(id(&restored.id)).await.unwrap().revision,
        restored.revision
    );
    assert_eq!(
        s.query_tasks(query(TaskView::All))
            .await
            .unwrap()
            .items
            .len(),
        1
    );
}
#[tokio::test]
async fn calendar_views_keep_completion_separate_and_filter_exact_dates_and_literal_keywords() {
    let (_root, _db, s) = setup();
    let today = chrono::Local::now().date_naive();
    let yesterday = today
        .checked_sub_days(chrono::Days::new(1))
        .unwrap()
        .format("%Y-%m-%d")
        .to_string();
    let tomorrow = today
        .checked_add_days(chrono::Days::new(1))
        .unwrap()
        .format("%Y-%m-%d")
        .to_string();
    let today = today.format("%Y-%m-%d").to_string();
    let old = s
        .create_task(create(Some(yesterday.clone())))
        .await
        .unwrap();
    let mut done = create(Some(yesterday));
    done.status = TaskStatus::Completed;
    let done = s.create_task(done).await.unwrap();
    let due = s.create_task(create(Some(today.clone()))).await.unwrap();
    let mut completed_today = create(Some(today.clone()));
    completed_today.status = TaskStatus::Completed;
    let completed_today = s.create_task(completed_today).await.unwrap();
    let mut future = create(Some(tomorrow));
    future.title = "保留 %_ 字面匹配".into();
    future.status = TaskStatus::InProgress;
    let future = s.create_task(future).await.unwrap();
    s.create_task(create(None)).await.unwrap();
    let page = s.query_tasks(query(TaskView::Today)).await.unwrap();
    assert_eq!(page.today, today);
    assert_eq!(page.items.len(), 2);
    assert!(page.items.iter().any(|t| t.id == due.id));
    assert!(page.items.iter().any(|t| t.id == completed_today.id));
    let overdue = s.query_tasks(query(TaskView::Overdue)).await.unwrap();
    assert_eq!(overdue.items.len(), 1);
    assert_eq!(overdue.items[0].id, old.id);
    assert!(overdue.items[0].overdue);
    assert!(!done.overdue);
    let mut q = query(TaskView::All);
    q.status = Some(TaskStatus::InProgress);
    q.keyword = "%_".into();
    let filtered = s.query_tasks(q).await.unwrap();
    assert_eq!(filtered.items[0].id, future.id);
    assert_eq!(filtered.items.len(), 1);
    let mut q = query(TaskView::All);
    q.due_date = Some(today);
    q.status = Some(TaskStatus::NotStarted);
    assert_eq!(s.query_tasks(q).await.unwrap().items[0].id, due.id);
}
#[tokio::test]
async fn invalid_dates_payloads_and_owners_cannot_create_or_mutate_tasks() {
    let (_root, _db, s) = setup();
    for date in [
        "2026-02-29",
        "2026-13-01",
        "2026-10-11T00:00:00Z",
        "2026-1-01",
        "0000-01-01",
        "2026-04-31",
        "",
    ] {
        assert!(calendar_date(date).is_err());
        assert_eq!(
            s.create_task(create(Some(date.into())))
                .await
                .unwrap_err()
                .code,
            ErrorCode::Validation
        );
    }
    calendar_date("2000-02-29").unwrap();
    calendar_date("9999-12-31").unwrap();
    let mut q = create(None);
    q.project_id = Some(uuid());
    assert_eq!(
        s.create_task(q).await.unwrap_err().code,
        ErrorCode::NotFound
    );
    assert!(
        s.query_tasks(query(TaskView::All))
            .await
            .unwrap()
            .items
            .is_empty()
    );
    let mut q = create(None);
    q.title = "'; DROP TABLE platform_tasks; --".into();
    let t = s.create_task(q).await.unwrap();
    assert_eq!(t.title, "'; DROP TABLE platform_tasks; --");
    let mut q = edit(&t);
    q.due_date = Some("not-a-date".into());
    assert_eq!(
        s.save_task(q).await.unwrap_err().code,
        ErrorCode::Validation
    );
    assert_eq!(s.get_task(id(&t.id)).await.unwrap().revision, 1);
    let mut value = serde_json::to_value(create(None)).unwrap();
    value["status"] = serde_json::json!("overdue");
    assert!(serde_json::from_value::<CreateTask>(value).is_err());
}
#[tokio::test]
async fn concurrent_revisions_and_failed_or_ignored_updates_preserve_previous_task() {
    let (_root, db, s) = setup();
    let t = s.create_task(create(None)).await.unwrap();
    let mut a = edit(&t);
    a.description = "第一份".into();
    let mut b = edit(&t);
    b.description = "第二份".into();
    let (a, b) = tokio::join!(s.save_task(a), s.save_task(b));
    assert_ne!(a.is_ok(), b.is_ok());
    assert_eq!(a.err().or(b.err()).unwrap().code, ErrorCode::Conflict);
    assert_eq!(
        s.set_task_deleted(deleted(&t, true))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let current = s.get_task(id(&t.id)).await.unwrap();
    db.call(|c|{c.execute_batch("CREATE TRIGGER ignored_task BEFORE UPDATE ON platform_tasks BEGIN SELECT RAISE(IGNORE); END;")?;Ok(())}).await.unwrap();
    let mut q = edit(&current);
    q.status = TaskStatus::Completed;
    assert_eq!(s.save_task(q).await.unwrap_err().code, ErrorCode::Conflict);
    assert_eq!(
        s.set_task_deleted(deleted(&current, true))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(s.get_task(id(&t.id)).await.unwrap().revision, 2);
    db.call(|c|{c.execute_batch("DROP TRIGGER ignored_task; CREATE TRIGGER failed_task BEFORE UPDATE ON platform_tasks BEGIN SELECT RAISE(ABORT,'injected'); END;")?;Ok(())}).await.unwrap();
    let mut q = edit(&current);
    q.title = "未提交".into();
    assert_eq!(s.save_task(q).await.unwrap_err().code, ErrorCode::DbError);
    let actual = s.get_task(id(&t.id)).await.unwrap();
    assert_eq!(actual.description, current.description);
    assert_eq!(actual.title, current.title);
}
#[tokio::test]
async fn project_ownership_allows_archive_preserves_deleted_links_and_rejects_new_assignment() {
    let (_root, _db, s) = setup();
    let p = s
        .create_project(CreateProject {
            request_id: uuid(),
            name: "关联项目".into(),
            description: String::new(),
        })
        .await
        .unwrap();
    let p = s
        .update_project(UpdateProject {
            request_id: uuid(),
            id: p.id,
            name: p.name,
            description: p.description,
            status: ProjectStatus::Archived,
            base_revision: p.revision,
        })
        .await
        .unwrap();
    let mut q = create(None);
    q.project_id = Some(p.id.clone());
    let t = s.create_task(q).await.unwrap();
    let mut query = query(TaskView::All);
    query.project_id = Some(p.id.clone());
    assert_eq!(s.query_tasks(query).await.unwrap().items[0].id, t.id);
    s.set_project_deleted(SetProjectDeleted {
        request_id: uuid(),
        id: p.id.clone(),
        base_revision: p.revision,
        deleted: true,
    })
    .await
    .unwrap();
    let mut q = edit(&t);
    q.description = "保留原关联".into();
    let t = s.save_task(q).await.unwrap();
    assert_eq!(t.project_id, Some(p.id.clone()));
    let mut q = create(None);
    q.project_id = Some(p.id.clone());
    assert_eq!(
        s.create_task(q).await.unwrap_err().code,
        ErrorCode::NotFound
    );
    let fresh = s.create_task(create(None)).await.unwrap();
    let mut q = edit(&fresh);
    q.project_id = Some(p.id);
    assert_eq!(s.save_task(q).await.unwrap_err().code, ErrorCode::NotFound);
    assert_eq!(s.get_task(id(&fresh.id)).await.unwrap().project_id, None);
}
#[tokio::test]
async fn priority_and_pagination_include_all_tasks_without_duplicates() {
    let (_root, _db, s) = setup();
    let mut expected = std::collections::HashSet::new();
    for i in 0..105 {
        let mut q = create(None);
        q.priority = if i == 104 {
            TaskPriority::High
        } else {
            TaskPriority::Low
        };
        expected.insert(s.create_task(q).await.unwrap().id);
    }
    let mut q = query(TaskView::All);
    q.limit = 20;
    let first = s.query_tasks(q).await.unwrap();
    assert_eq!(first.items[0].priority, TaskPriority::High);
    assert!(first.has_more);
    let mut actual = std::collections::HashSet::new();
    for offset in (0..120).step_by(20) {
        let mut q = query(TaskView::All);
        q.offset = offset;
        q.limit = 20;
        let page = s.query_tasks(q).await.unwrap();
        if offset == 100 {
            assert!(!page.has_more);
        }
        for t in page.items {
            assert!(actual.insert(t.id));
        }
    }
    assert_eq!(actual, expected);
}
#[test]
fn timezone_reopen_helper() {
    let Some(root) = std::env::var_os("MOSHUB_TEST_TIMEZONE_ROOT") else {
        return;
    };
    let root = std::path::PathBuf::from(root);
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async {
        let s = PlatformService::new(Database::open(&root).unwrap());
        let page = s.query_tasks(query(TaskView::All)).await.unwrap();
        assert_eq!(
            page.today,
            chrono::Local::now().format("%Y-%m-%d").to_string()
        );
        std::fs::write(
            root.join("timezone-result.json"),
            serde_json::to_vec(&page).unwrap(),
        )
        .unwrap();
    });
}
#[tokio::test]
async fn switching_timezones_on_reopen_never_shifts_stored_calendar_due_date() {
    let (root, db, s) = setup();
    let t = s
        .create_task(create(Some("2000-02-29".into())))
        .await
        .unwrap();
    drop(s);
    drop(db);
    for zone in ["Asia/Shanghai", "Pacific/Honolulu"] {
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "timezone_reopen_helper", "--nocapture"])
            .env("MOSHUB_TEST_TIMEZONE_ROOT", root.path())
            .env("TZ", zone)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());
        let page: TaskPage = serde_json::from_slice(
            &std::fs::read(root.path().join("timezone-result.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(page.items[0].id, t.id);
        assert_eq!(page.items[0].due_date.as_deref(), Some("2000-02-29"));
        assert!(page.items[0].overdue);
        calendar_date(&page.today).unwrap();
    }
}
