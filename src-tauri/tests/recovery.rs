use moshub_lib::{
    contracts::*,
    infrastructure::{backup, database::Database},
    platform::service::PlatformService,
};
use serde_json::{Value, json};
use std::{
    path::Path,
    process::{Child, Command, Stdio},
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};
fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn request(id_value: &str) -> IdRequest {
    IdRequest {
        request_id: id(),
        id: id_value.into(),
    }
}
fn save(note: &Note, text: &str) -> SaveNote {
    SaveNote {
        request_id: id(),
        id: note.id.clone(),
        title: note.title.clone(),
        body: json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]}),
        schema_version: 1,
        base_revision: note.revision,
        client_edit_sequence: 1,
        create_version: true,
    }
}
struct ChildGuard(Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn wait_for(condition: impl Fn() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !condition() {
        assert!(Instant::now() < deadline, "fixture readiness timed out");
        std::thread::sleep(Duration::from_millis(5));
    }
}

#[test]
fn restore_crash_helper() {
    let Some(root) = std::env::var_os("MOSHUB_TEST_RESTORE_CRASH_ROOT") else {
        return;
    };
    let root = Path::new(&root);
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async {
        let db = Database::open(root).unwrap();
        let s = PlatformService::new(db.clone());
        let note = s
            .create_note(CreateNote {
                request_id: id(),
                title: "切换中断验证".into(),
                project_id: None,
            })
            .await
            .unwrap();
        s.save_note(save(&note, "备份中的旧稿")).await.unwrap();
        let source = root.to_owned();
        let archive = root.join("backups/crash-fixture.moshub.zip");
        let target = archive.clone();
        db.call(move |c| {
            backup::snapshot(c, &source, &target, &AtomicBool::new(false), &|_| {})?;
            Ok(())
        })
        .await
        .unwrap();
        let note = s.get_note(request(&note.id)).await.unwrap();
        s.save_note(save(&note, "当前空间的新稿必须保留"))
            .await
            .unwrap();
        let prepared = backup::inspect(root, &archive, &AtomicBool::new(false), &|_| {}).unwrap();
        drop(s);
        drop(db);
        std::fs::write(
            root.join("ready.tmp"),
            serde_json::to_vec(&json!({"stage":prepared.directory.path(),"note":note.id})).unwrap(),
        )
        .unwrap();
        std::fs::rename(root.join("ready.tmp"), root.join("ready.json")).unwrap();
        wait_for(|| root.join("go").exists());
        let mut conn = rusqlite::Connection::open(root.join("workspace.sqlite")).unwrap();
        backup::replace(&mut conn, root, prepared).unwrap();
        panic!("parent should kill this child while new database initialization is blocked");
    });
}

#[tokio::test]
async fn killed_real_restore_rolls_back_all_directories_and_preserves_acknowledged_content() {
    let root = tempfile::tempdir().unwrap();
    let mut child = ChildGuard(
        Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "restore_crash_helper", "--nocapture"])
            .env("MOSHUB_TEST_RESTORE_CRASH_ROOT", root.path())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    wait_for(|| root.path().join("ready.json").exists());
    let ready: Value =
        serde_json::from_slice(&std::fs::read(root.path().join("ready.json")).unwrap()).unwrap();
    let staged = rusqlite::Connection::open(
        Path::new(ready["stage"].as_str().unwrap()).join("workspace.sqlite"),
    )
    .unwrap();
    // Hold the validated new database busy, giving the parent an observable safe crash point.
    staged.execute_batch("BEGIN EXCLUSIVE").unwrap();
    std::fs::write(root.path().join("go"), b"go").unwrap();
    wait_for(|| {
        let Ok(bytes) = std::fs::read(root.path().join("restore-journal.json")) else {
            return false;
        };
        let Ok(j) = serde_json::from_slice::<Value>(&bytes) else {
            return false;
        };
        j["committed"] == false
            && j["old"]
                .as_str()
                .is_some_and(|old| root.path().join(old).join("editing").exists())
    });
    child.0.kill().unwrap();
    child.0.wait().unwrap();
    staged.execute_batch("ROLLBACK").unwrap();
    drop(staged);
    let service = PlatformService::new(Database::open(root.path()).unwrap());
    assert_eq!(
        service
            .get_note(request(ready["note"].as_str().unwrap()))
            .await
            .unwrap()
            .plain_text,
        "当前空间的新稿必须保留"
    );
    assert!(!root.path().join("restore-journal.json").exists());
    for folder in ["attachments", "drafts", "editing"] {
        assert!(root.path().join(folder).is_dir());
    }
    assert!(
        root.path()
            .join("backups/crash-fixture.moshub.zip")
            .is_file()
    );
}
