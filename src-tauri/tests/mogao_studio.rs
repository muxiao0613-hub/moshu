use moshub_lib::{
    contracts::*,
    infrastructure::database::Database,
    modules::mogao::{
        MogaoService,
        studio::{
            StudioRequest,
            ai::{NativeAi, Sse, endpoint},
        },
    },
    platform::service::PlatformService,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn hash(s: &str) -> String {
    Sha256::digest(s.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn query(method: &str, path: &str, data: Value, revision: Option<i64>) -> StudioRequest {
    StudioRequest {
        request_id: id(),
        method: method.into(),
        path: path.into(),
        data,
        params: Value::Null,
        base_revision: revision,
    }
}
async fn setup() -> (tempfile::TempDir, Database, PlatformService, MogaoService) {
    let root = tempfile::tempdir().unwrap();
    let db = Database::open(root.path()).unwrap();
    let p = PlatformService::new(db.clone());
    let m = MogaoService::install(db.clone(), p.clone()).await.unwrap();
    p.set_module(SetModule {
        request_id: id(),
        id: "mogao".into(),
        enabled: true,
    })
    .await
    .unwrap();
    (root, db, p, m)
}
async fn send(
    m: &MogaoService,
    method: &str,
    path: &str,
    data: Value,
    revision: Option<i64>,
) -> Value {
    m.studio_request(query(method, path, data, revision))
        .await
        .unwrap()
}
async fn book(m: &MogaoService) -> String {
    send(
        m,
        "POST",
        "/projects",
        json!({"title":"远山","genre":"奇幻"}),
        None,
    )
    .await["id"]
        .as_str()
        .unwrap()
        .into()
}
#[tokio::test]
async fn original_editor_entities_are_local_revisioned_and_scoped() {
    let (_r, _d, p, m) = setup().await;
    let pid = book(&m).await;
    let other = book(&m).await;
    for (kind, data) in [
        (
            "chapters",
            json!({"title":"第一章","content":"<p>长河 sunrise 2026</p>","order":1}),
        ),
        ("characters", json!({"name":"长河"})),
        (
            "world-settings",
            json!({"title":"北城","category":"地点","content":"石桥"}),
        ),
        ("outlines", json!({"title":"开局","summary":"进入北城"})),
        ("plot-threads", json!({"title":"玉佩","description":"失踪"})),
        ("timeline-events", json!({"title":"春雨","order":1})),
    ] {
        let base = format!("/projects/{pid}/{kind}");
        let v = send(&m, "POST", &base, data, None).await;
        assert_eq!(v["revision"], 1);
        let path = format!("{base}/{}", v["id"].as_str().unwrap());
        assert_eq!(send(&m, "GET", &path, Value::Null, None).await, v);
        let wrong = format!("/projects/{other}/{kind}/{}", v["id"].as_str().unwrap());
        assert_eq!(
            m.studio_request(query("GET", &wrong, Value::Null, None))
                .await
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        let patch = if kind == "characters" {
            json!({"name":"长河修订"})
        } else {
            json!({"title":"已修订"})
        };
        let saved = send(&m, "PATCH", &path, patch.clone(), Some(1)).await;
        assert_eq!(saved["revision"], 2);
        assert_eq!(
            m.studio_request(query("PATCH", &path, patch, Some(1)))
                .await
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
    }
    let story = send(
        &m,
        "POST",
        "/short-stories",
        json!({"title":"雨夜","content":"<p>短篇正文</p>"}),
        None,
    )
    .await;
    assert_eq!(story["wordCount"], 4);
    let material = send(
        &m,
        "POST",
        "/materials",
        json!({"title":"雨景","rawContent":"屋檐滴水"}),
        None,
    )
    .await;
    assert_eq!(material["rawContent"], "屋檐滴水");
    p.set_module(SetModule {
        request_id: id(),
        id: "mogao".into(),
        enabled: false,
    })
    .await
    .unwrap();
    assert_eq!(
        m.studio_request(query("GET", "/projects", Value::Null, None))
            .await
            .unwrap_err()
            .code,
        ErrorCode::ModuleDisabled
    );
}
#[tokio::test]
async fn saved_body_guards_history_idempotency_and_recovery_state() {
    let (_r, _d, _p, m) = setup().await;
    let pid = book(&m).await;
    let base = format!("/projects/{pid}/chapters");
    let ch = send(
        &m,
        "POST",
        &base,
        json!({"title":"第一章","content":"<p>旧正文</p>"}),
        None,
    )
    .await;
    let path = format!("{base}/{}", ch["id"].as_str().unwrap());
    let request = query(
        "PATCH",
        &path,
        json!({"content":"<p>新正文</p>","baseContent":"<p>旧正文</p>"}),
        Some(1),
    );
    let first = m.studio_request(request.clone()).await.unwrap();
    let duplicate = m.studio_request(request.clone()).await.unwrap();
    assert_eq!(first, duplicate);
    let mut altered = request;
    altered.data["content"] = json!("重复 ID 不同内容");
    assert_eq!(
        m.studio_request(altered).await.unwrap_err().code,
        ErrorCode::Validation
    );
    let bad = query(
        "PATCH",
        &path,
        json!({"content":"覆盖新稿","baseContent":"旧底稿"}),
        Some(2),
    );
    assert_eq!(
        m.studio_request(bad).await.unwrap_err().details.unwrap()["remote"]["content"],
        "<p>新正文</p>"
    );
    let history = send(&m, "GET", &format!("{path}/versions"), Value::Null, None).await;
    assert_eq!(history.as_array().unwrap().len(), 1);
    assert_eq!(
        send(
            &m,
            "GET",
            &format!("{path}/versions/{}", history[0]["id"].as_str().unwrap()),
            Value::Null,
            None
        )
        .await["content"],
        "<p>旧正文</p>"
    );
    send(
        &m,
        "POST",
        "/local-state",
        json!({"key":"mogao_chapter_backup_test","value":"恢复稿"}),
        None,
    )
    .await;
    assert_eq!(
        send(&m, "GET", "/local-state", Value::Null, None).await["mogao_chapter_backup_test"],
        "恢复稿"
    );
    assert_eq!(
        m.studio_request(query(
            "POST",
            "/local-state",
            json!({"key":"mogao_api_key","value":"synthetic-secret"}),
            None
        ))
        .await
        .unwrap_err()
        .code,
        ErrorCode::Validation
    );
    for path in [
        "/auth/login",
        "/billing/requests",
        "/projects/anything/publish",
        "/../disk",
    ] {
        assert!(
            m.studio_request(query("POST", path, json!({}), None))
                .await
                .is_err()
        );
    }
}
#[tokio::test]
async fn character_memories_facts_and_reports_reject_stale_sources_atomically() {
    let (_r, _d, _p, m) = setup().await;
    let pid = book(&m).await;
    let ch = send(
        &m,
        "POST",
        &format!("/projects/{pid}/chapters"),
        json!({"title":"相遇","content":"<p>长河来到北城。</p>","order":1,"status":"final"}),
        None,
    )
    .await;
    let ch_id = ch["id"].as_str().unwrap();
    let ch_path = format!("/projects/{pid}/chapters/{ch_id}");
    let character = send(
        &m,
        "POST",
        &format!("/projects/{pid}/characters"),
        json!({"name":"长河"}),
        None,
    )
    .await;
    let mem_path = format!(
        "/projects/{pid}/characters/{}/memories",
        character["id"].as_str().unwrap()
    );
    let memory = json!({"chapterId":ch_id,"sourceHash":hash("<p>长河来到北城。</p>"),"claims":[{"kind":"experience","text":"来到北城","quote":"长河来到北城。"}],"profileChanges":[]});
    let staged = send(
        &m,
        "POST",
        &mem_path,
        json!({"action":"stage","memory":memory}),
        None,
    )
    .await;
    assert_eq!(staged["lifeMemories"][0]["status"], "pending");
    let confirmed = send(
        &m,
        "POST",
        &mem_path,
        json!({"action":"confirm","memory":staged["lifeMemories"][0]}),
        None,
    )
    .await;
    assert_eq!(confirmed["lifeMemories"][0]["status"], "confirmed");
    let fact = json!({"id":id(),"projectId":pid,"sourceChapterId":ch_id,"sourceHash":memory["sourceHash"],"subject":"长河","fact":"来到北城","quote":"长河来到北城。"});
    send(
        &m,
        "POST",
        &format!("/projects/{pid}/facts"),
        json!({"action":"stage","facts":[fact]}),
        None,
    )
    .await;
    let report = json!({"sourceHash":memory["sourceHash"],"text":"到达北城"});
    send(&m, "PATCH", &ch_path, json!({"continuity":report}), Some(1)).await;
    let next = send(
        &m,
        "PATCH",
        &ch_path,
        json!({"content":"<p>长河去了南城。</p>","baseContent":"<p>长河来到北城。</p>"}),
        Some(2),
    )
    .await;
    assert_eq!(next["continuity"]["status"], "stale");
    let current = send(
        &m,
        "GET",
        &format!(
            "/projects/{pid}/characters/{}",
            character["id"].as_str().unwrap()
        ),
        Value::Null,
        None,
    )
    .await;
    assert_eq!(current["lifeMemories"][0]["status"], "stale");
    assert_eq!(
        send(&m, "GET", &format!("/projects/{pid}"), Value::Null, None).await["factLedger"][0]["status"],
        "stale"
    );
    assert!(
        m.studio_request(query(
            "POST",
            &mem_path,
            json!({"action":"confirm","memory":confirmed["lifeMemories"][0]}),
            None
        ))
        .await
        .is_err()
    );
    assert!(
        m.studio_request(query(
            "PATCH",
            &ch_path,
            json!({"continuity":report}),
            Some(3)
        ))
        .await
        .is_err()
    );
    assert_eq!(
        send(&m, "GET", &ch_path, Value::Null, None).await["revision"],
        3
    );
}
#[tokio::test]
async fn book_backup_remaps_ids_history_and_rolls_back_invalid_rows() {
    let (_r, _d, _p, m) = setup().await;
    let pid = book(&m).await;
    let outline = send(
        &m,
        "POST",
        &format!("/projects/{pid}/outlines"),
        json!({"title":"第一卷","type":"volume"}),
        None,
    )
    .await;
    let ch = send(
        &m,
        "POST",
        &format!("/projects/{pid}/chapters"),
        json!({"title":"第一章","content":"<p>远山</p>","volumeId":outline["id"]}),
        None,
    )
    .await;
    send(
        &m,
        "POST",
        &format!(
            "/projects/{pid}/chapters/{}/versions",
            ch["id"].as_str().unwrap()
        ),
        json!({"content":"<p>早期稿</p>","note":"初稿"}),
        None,
    )
    .await;
    let backup = send(
        &m,
        "GET",
        &format!("/projects/{pid}/backup"),
        Value::Null,
        None,
    )
    .await;
    let restored = send(&m, "POST", "/projects/import", backup.clone(), None).await;
    assert_ne!(restored["id"], pid);
    let copy = send(
        &m,
        "GET",
        &format!("/projects/{}/backup", restored["id"].as_str().unwrap()),
        Value::Null,
        None,
    )
    .await;
    assert_eq!(copy["chapters"][0]["content"], "<p>远山</p>");
    assert_eq!(copy["chapters"][0]["volumeId"], copy["outlines"][0]["id"]);
    assert_eq!(copy["versions"][0]["content"], "<p>早期稿</p>");
    let mut bad = backup;
    bad["characters"] = json!([{"id":id(),"projectId":pid,"name":""}]);
    assert!(
        m.studio_request(query("POST", "/projects/import", bad, None))
            .await
            .is_err()
    );
    assert_eq!(
        send(&m, "GET", "/projects", Value::Null, None)
            .await
            .as_array()
            .unwrap()
            .len(),
        2
    );
}
#[test]
fn native_sse_handles_split_utf8_crlf_usage_and_failure() {
    let mut parser = Sse::default();
    let bytes="data: {\"choices\":[{\"delta\":{\"content\":\"远山\"}}]}\r\n\r\ndata: {\"choices\":[],\"usage\":{\"completion_tokens\":2}}\n\ndata: [DONE]\n\n".as_bytes();
    let mut chunks = Vec::new();
    for byte in bytes {
        chunks.extend(parser.push(&[*byte]).unwrap());
    }
    assert_eq!(chunks.len(), 2);
    assert_eq!(chunks[0]["choices"][0]["delta"]["content"], "远山");
    assert!(parser.complete);
    assert!(Sse::default().push(b"data: {invalid}\n").is_err());
    assert!(endpoint("http://127.0.0.1:1234/v1").is_ok());
    for u in [
        "http://example.com",
        "https://user:secret@example.com",
        "https://example.com?api_key=key",
        "file:///tmp/x",
    ] {
        assert!(endpoint(u).is_err());
    }
}
#[tokio::test]
async fn native_ai_real_local_http_stream_and_cancellation() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    let root = tempfile::tempdir().unwrap();
    let ai = NativeAi::new(root.path());
    ai.configure(&json!({"apiKey":"synthetic-session-key","persistent":false}))
        .unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        let mut bytes = [0u8; 8192];
        let n = socket.read(&mut bytes).unwrap();
        let request = String::from_utf8_lossy(&bytes[..n]);
        assert!(request.starts_with("POST /v1/chat/completions"));
        assert!(
            request
                .to_lowercase()
                .contains("authorization: bearer synthetic-session-key")
        );
        let body = "data: {\"choices\":[{\"delta\":{\"content\":\"本地协议验证\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n";
        write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
    });
    let mut got = Vec::new();
    let cfg =
        json!({"baseURL":format!("http://{address}/v1"),"model":"local-test","persistent":false});
    ai.run(
        &id(),
        &cfg,
        json!({"stream":true,"messages":[{"role":"user","content":"protocol-only"}]}),
        |v| {
            got.push(v);
            Ok(())
        },
    )
    .await
    .unwrap();
    server.join().unwrap();
    assert_eq!(got[0]["choices"][0]["delta"]["content"], "本地协议验证");
    assert!(!root.path().join("secret").exists());
}

#[tokio::test]
async fn cancelled_native_request_does_not_wait_for_provider_timeout() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    let root = tempfile::tempdir().unwrap();
    let ai = NativeAi::new(root.path());
    ai.configure(&json!({"apiKey":"synthetic-session-key"}))
        .unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let req = id();
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        let mut buf = [0; 8192];
        let _ = socket.read(&mut buf);
        std::thread::sleep(std::time::Duration::from_millis(500));
        let _ = socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n");
    });
    let cancel = ai.clone();
    let request_id = req.clone();
    let stop = async move {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        cancel.cancel(&request_id);
    };
    let start = std::time::Instant::now();
    let config = json!({"baseURL":format!("http://{address}/v1"),"model":"local-test"});
    let (result, ()) = tokio::join!(
        ai.run(
            &req,
            &config,
            json!({"stream":true,"messages":[{"role":"user","content":"protocol-only"}]}),
            |_| Ok(())
        ),
        stop
    );
    assert_eq!(result.unwrap_err().code, ErrorCode::Cancelled);
    assert!(start.elapsed() < std::time::Duration::from_secs(1));
    server.join().unwrap();
}

#[tokio::test]
async fn character_baseline_history_survives_form_edits_and_source_confirmation() {
    let (_r, _d, _p, m) = setup().await;
    let pid = book(&m).await;
    let ch = send(
        &m,
        "POST",
        &format!("/projects/{pid}/chapters"),
        json!({"title":"渡口","content":"<p>长河立誓守护渡口。</p>","order":3,"status":"final"}),
        None,
    )
    .await;
    let ch_id = ch["id"].as_str().unwrap();
    let char_base = format!("/projects/{pid}/characters");
    let ch1 = send(
        &m,
        "POST",
        &char_base,
        json!({"name":"长河","personality":"谨慎"}),
        None,
    )
    .await;
    assert_eq!(ch1["profileVersions"].as_array().unwrap().len(), 1);
    let path = format!("{char_base}/{}", ch1["id"].as_str().unwrap());
    let ch2 = send(
        &m,
        "POST",
        &char_base,
        json!({"id":ch1["id"],"personality":"坚毅","profileEffectiveOrder":2,"profileVersions":[]}),
        Some(1),
    )
    .await;
    assert_eq!(ch2["profileVersions"].as_array().unwrap().len(), 2);
    assert_eq!(ch2["profileVersions"][1]["effectiveOrder"], 2);
    let mem=send(&m,"POST",&format!("{path}/memories"),json!({"action":"stage","memory":{"chapterId":ch_id,"sourceHash":hash("<p>长河立誓守护渡口。</p>"),"claims":[],"profileChanges":[{"field":"goals","text":"守护渡口","quote":"长河立誓守护渡口。"}]}}),None).await;
    let confirmed = send(
        &m,
        "POST",
        &format!("{path}/memories"),
        json!({"action":"confirmProfile","memory":mem["lifeMemories"][0]}),
        None,
    )
    .await;
    assert!(confirmed["goals"].as_str().unwrap().contains("守护渡口"));
    assert_eq!(confirmed["profileVersions"].as_array().unwrap().len(), 3);
    assert_eq!(confirmed["profileVersions"][2]["sourceChapterId"], ch_id);
    assert!(
        m.studio_request(query(
            "GET",
            &format!("/projects/{pid}/characters/context"),
            Value::Null,
            None
        ))
        .await
        .is_err()
    );
}

async fn wait_job(p: &PlatformService, job: &Job) -> Job {
    let start = std::time::Instant::now();
    loop {
        let jobs = p.list_jobs(Request { request_id: id() }).await.unwrap();
        if let Some(j) = jobs
            .into_iter()
            .find(|j| j.id == job.id && !["pending", "running"].contains(&j.status.as_str()))
        {
            return j;
        }
        assert!(start.elapsed().as_secs() < 15);
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
}
#[tokio::test]
async fn full_workspace_restore_includes_imported_works_versions_drafts_and_ai_candidates() {
    let (root, db, p, m) = setup().await;
    let pid = book(&m).await;
    send(
        &m,
        "POST",
        &format!("/projects/{pid}/chapters"),
        json!({"title":"归来","content":"<p>已保存</p>"}),
        None,
    )
    .await;
    send(
        &m,
        "POST",
        "/local-state",
        json!({"key":"mogao_chapter_backup_roundtrip","value":"尚未采用的恢复稿"}),
        None,
    )
    .await;
    db.call(|c|{c.execute("INSERT INTO mogao_studio_ai_runs(id,request_json,model,output,status,created_at) VALUES('test-candidate','{}','protocol-only','测试候选','cancelled','2026-10-17')",[])?;Ok(())}).await.unwrap();
    let job = p.start_backup(Request { request_id: id() }).await.unwrap();
    assert_eq!(wait_job(&p, &job).await.status, "succeeded");
    let current = send(&m, "GET", &format!("/projects/{pid}"), Value::Null, None).await;
    send(
        &m,
        "PATCH",
        &format!("/projects/{pid}"),
        json!({"title":"备份之后"}),
        current["revision"].as_i64(),
    )
    .await;
    let preview = p
        .inspect_restore(
            Request { request_id: id() },
            &root
                .path()
                .join("backups")
                .join(format!("{}.moshub.zip", job.id)),
        )
        .await
        .unwrap();
    let restored = p
        .start_restore(IdRequest {
            request_id: id(),
            id: preview.id,
        })
        .await
        .unwrap();
    assert_eq!(wait_job(&p, &restored).await.status, "succeeded");
    assert_eq!(
        send(&m, "GET", &format!("/projects/{pid}"), Value::Null, None).await["title"],
        "远山"
    );
    assert_eq!(
        send(&m, "GET", "/local-state", Value::Null, None).await["mogao_chapter_backup_roundtrip"],
        "尚未采用的恢复稿"
    );
    assert_eq!(
        send(&m, "GET", "/ai-runs", Value::Null, None).await[0]["output"],
        "测试候选"
    );
}
#[tokio::test]
async fn native_ai_candidate_history_excludes_session_credentials() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    let (_root, db, _p, m) = setup().await;
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    m.ai_settings(Some(json!({"baseURL":format!("http://{address}/v1"),"model":"protocol-only","persistent":false,"apiKey":"synthetic-history-secret"}))).await.unwrap();
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        let mut buf = [0; 8192];
        let _ = socket.read(&mut buf);
        let body = "data: {\"choices\":[{\"delta\":{\"content\":\"保留的候选\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n";
        write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
    });
    m.ai_run(&id(),json!({"stream":true,"apiKey":"must-not-persist","messages":[{"role":"user","content":"synthetic protocol request"}]}),|_|Ok(())).await.unwrap();
    server.join().unwrap();
    let history = send(&m, "GET", "/ai-runs", Value::Null, None).await;
    assert_eq!(history[0]["output"], "保留的候选");
    assert_eq!(history[0]["status"], "completed");
    let stored = db
        .call(|c| {
            let config: String = c.query_row(
                "SELECT value FROM mogao_studio_state WHERE key='mogao_native_ai_config'",
                [],
                |r| r.get(0),
            )?;
            let request: String =
                c.query_row("SELECT request_json FROM mogao_studio_ai_runs", [], |r| {
                    r.get(0)
                })?;
            Ok(config + &request)
        })
        .await
        .unwrap();
    assert!(!stored.contains("synthetic-history-secret"));
    assert!(!stored.contains("must-not-persist"));
}

#[tokio::test]
async fn imported_studio_participates_in_global_search_and_trash_without_touching_foundation() {
    let (_r, _db, p, m) = setup().await;
    let pid = book(&m).await;
    let chapter = send(
        &m,
        "POST",
        &format!("/projects/{pid}/chapters"),
        json!({"title":"灯火","content":"<p>长河落日</p>"}),
        None,
    )
    .await;
    let ch_id = chapter["id"].as_str().unwrap();
    let path = format!("/projects/{pid}/chapters/{ch_id}");
    let search = |keyword: &str| SearchQuery {
        request_id: id(),
        keyword: keyword.into(),
        kind: None,
        project_id: None,
        tag: None,
        offset: 0,
        limit: 20,
    };
    assert_eq!(
        p.search(search("长河落日")).await.unwrap().items[0].kind,
        "mogao-studio-chapters"
    );
    p.set_module(SetModule {
        request_id: id(),
        id: "mogao".into(),
        enabled: false,
    })
    .await
    .unwrap();
    assert!(p.search(search("长河落日")).await.unwrap().items.is_empty());
    assert!(p.search(search("远山")).await.unwrap().items[0].disabled);
    p.set_module(SetModule {
        request_id: id(),
        id: "mogao".into(),
        enabled: true,
    })
    .await
    .unwrap();
    send(&m, "DELETE", &path, Value::Null, Some(1)).await;
    let deleted = p
        .trash(TrashQuery {
            request_id: id(),
            kind: None,
            offset: 0,
            limit: 20,
        })
        .await
        .unwrap()
        .into_iter()
        .find(|v| v.id == ch_id)
        .unwrap();
    p.restore_trash(TrashMutation {
        request_id: id(),
        kind: deleted.kind,
        id: deleted.id,
        base_revision: deleted.revision,
    })
    .await
    .unwrap();
    let saved = send(&m, "GET", &path, Value::Null, None).await;
    assert_eq!(saved["content"], "<p>长河落日</p>");
    assert_eq!(saved["revision"], 3);
    let list = send(
        &m,
        "GET",
        &format!("/projects/{pid}/chapters"),
        Value::Null,
        None,
    )
    .await;
    assert!(list[0].get("content").is_none());
}

#[tokio::test]
async fn platform_library_reads_canonical_studio_manuscripts_and_survives_disable() {
    let (_r, _db, p, m) = setup().await;
    let pid = book(&m).await;
    let other = book(&m).await;
    let ch2 = send(
        &m,
        "POST",
        &format!("/projects/{pid}/chapters"),
        json!({"title":"第二章","order":2,"content":"<p>后章</p>"}),
        None,
    )
    .await;
    let ch1 = send(
        &m,
        "POST",
        &format!("/projects/{pid}/chapters"),
        json!({"title":"第一章","order":1,"content":"<p>石桥 &amp; 灯</p><p>第二段<br>续行</p>"}),
        None,
    )
    .await;
    let short = send(
        &m,
        "POST",
        "/short-stories",
        json!({"title":"独立短篇","premise":"归乡","content":"<p>短篇正文</p>"}),
        None,
    )
    .await;
    let page = p
        .list_module_library(LibraryQuery {
            request_id: id(),
            keyword: String::new(),
            offset: 0,
            limit: 2,
        })
        .await
        .unwrap();
    assert_eq!(page.items.len(), 2);
    assert!(page.has_more);
    assert!(page.warnings.is_empty());
    let mut q = ReadLibrary {
        request_id: id(),
        module_id: "mogao".into(),
        kind: "mogao-studio-projects".into(),
        id: pid.clone(),
        section_id: None,
    };
    let reading = p.read_module_library(q.clone()).await.unwrap();
    assert_eq!(
        reading
            .sections
            .iter()
            .map(|s| s.title.as_str())
            .collect::<Vec<_>>(),
        vec!["第一章", "第二章"]
    );
    assert_eq!(reading.text, "石桥 & 灯\n\n第二段\n续行");
    assert_eq!(reading.edit_target.work_id.as_deref(), Some(pid.as_str()));
    assert_eq!(reading.edit_target.id, ch1["id"].as_str().unwrap());
    assert_eq!(reading.edit_target.kind, "mogao-studio-chapters");
    assert_eq!(
        reading.entry.word_count,
        ch1["wordCount"].as_u64().unwrap() + ch2["wordCount"].as_u64().unwrap()
    );
    // A chapter from another work is never accepted by the read projection.
    q.id = other;
    q.section_id = Some(ch1["id"].as_str().unwrap().into());
    assert_eq!(
        p.read_module_library(q.clone()).await.unwrap_err().code,
        ErrorCode::NotFound
    );
    q.id = pid.clone();
    q.section_id = None;
    let updated = send(
        &m,
        "PATCH",
        &format!("/projects/{pid}/chapters/{}", ch1["id"].as_str().unwrap()),
        json!({"content":"<p>更新后的正文</p>","baseContent":ch1["content"]}),
        Some(1),
    )
    .await;
    let reading = p.read_module_library(q.clone()).await.unwrap();
    assert_eq!(reading.text, "更新后的正文");
    assert_eq!(reading.revision, 2);
    // The already saved novel remains a readable platform document when writing is disabled.
    p.set_module(SetModule {
        request_id: id(),
        id: "mogao".into(),
        enabled: false,
    })
    .await
    .unwrap();
    let reading = p.read_module_library(q.clone()).await.unwrap();
    assert!(reading.entry.disabled);
    assert!(reading.edit_target.disabled);
    assert_eq!(reading.text, "更新后的正文");
    p.set_module(SetModule {
        request_id: id(),
        id: "mogao".into(),
        enabled: true,
    })
    .await
    .unwrap();
    send(
        &m,
        "DELETE",
        &format!(
            "/projects/{pid}/chapters/{}",
            updated["id"].as_str().unwrap()
        ),
        Value::Null,
        Some(2),
    )
    .await;
    assert_eq!(p.read_module_library(q.clone()).await.unwrap().text, "后章");
    send(
        &m,
        "DELETE",
        &format!("/projects/{pid}"),
        Value::Null,
        Some(1),
    )
    .await;
    assert_eq!(
        p.read_module_library(q.clone()).await.unwrap_err().code,
        ErrorCode::NotFound
    );
    p.restore_trash(TrashMutation {
        request_id: id(),
        kind: "mogao-studio-projects".into(),
        id: pid.clone(),
        base_revision: 2,
    })
    .await
    .unwrap();
    assert_eq!(p.read_module_library(q).await.unwrap().text, "后章");
    let reading = p
        .read_module_library(ReadLibrary {
            request_id: id(),
            module_id: "mogao".into(),
            kind: "mogao-studio-short-stories".into(),
            id: short["id"].as_str().unwrap().into(),
            section_id: None,
        })
        .await
        .unwrap();
    assert_eq!(reading.text, "短篇正文");
    assert_eq!(reading.sections.len(), 1);
    assert_eq!(reading.edit_target.kind, "mogao-studio-short-stories");
}

#[tokio::test]
async fn platform_library_includes_existing_manual_works_and_restored_content_without_copies() {
    use moshub_lib::modules::mogao::contracts::*;
    let (root, db, p, m) = setup().await;
    let w = m
        .import(ImportWork {
            request_id: id(),
            name: "此前手动版".into(),
            chapters: vec![ImportChapter {
                title: "开篇".into(),
                text: "手动版第一段。\n\n手动版第二段。".into(),
            }],
        })
        .await
        .unwrap();
    let q = ReadLibrary {
        request_id: id(),
        module_id: "mogao".into(),
        kind: "mogao-work".into(),
        id: w.id.clone(),
        section_id: None,
    };
    let reading = p.read_module_library(q.clone()).await.unwrap();
    assert!(reading.text.contains("手动版第一段。"));
    assert!(reading.text.contains("手动版第二段。"));
    assert_eq!(reading.edit_target.kind, "mogao-chapter");
    let page = p
        .list_module_library(LibraryQuery {
            request_id: id(),
            keyword: "手动版".into(),
            offset: 0,
            limit: 10,
        })
        .await
        .unwrap();
    assert_eq!(page.items.len(), 1);
    let resource_count: i64 = db
        .call(|c| Ok(c.query_row("SELECT count(*) FROM platform_resources", [], |r| r.get(0))?))
        .await
        .unwrap();
    assert_eq!(resource_count, 0); // Live publications never create orphan manuscript copies.
    let backup = p.start_backup(Request { request_id: id() }).await.unwrap();
    assert_eq!(wait_job(&p, &backup).await.status, "succeeded");
    let mut fields = w.fields.clone();
    fields.name = "备份之后的标题".into();
    m.save_work(SaveWork {
        request_id: id(),
        id: Some(w.id.clone()),
        base_revision: Some(w.revision),
        fields,
    })
    .await
    .unwrap();
    assert_eq!(
        p.read_module_library(q.clone()).await.unwrap().entry.title,
        "备份之后的标题"
    );
    let preview = p
        .inspect_restore(
            Request { request_id: id() },
            &root
                .path()
                .join("backups")
                .join(format!("{}.moshub.zip", backup.id)),
        )
        .await
        .unwrap();
    let restored = p
        .start_restore(IdRequest {
            request_id: id(),
            id: preview.id,
        })
        .await
        .unwrap();
    assert_eq!(wait_job(&p, &restored).await.status, "succeeded");
    assert_eq!(
        p.read_module_library(q.clone()).await.unwrap().entry.title,
        "此前手动版"
    );
    assert_eq!(p.read_module_library(q).await.unwrap().text, reading.text);
}
