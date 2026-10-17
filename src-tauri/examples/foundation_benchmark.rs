//! Release core benchmark with real SQLite fixtures; excludes WebView rendering.
use moshub_lib::{
    contracts::*, infrastructure::database::Database, platform::service::PlatformService,
};
use rusqlite::params;
use serde_json::json;
use std::time::Instant;
fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn request() -> Request {
    Request { request_id: id() }
}
fn p95(samples: &[f64]) -> f64 {
    let mut sorted = samples.to_vec();
    sorted.sort_by(f64::total_cmp);
    sorted[(sorted.len() * 95).div_ceil(100) - 1]
}
fn query(keyword: &str) -> SearchQuery {
    SearchQuery {
        request_id: id(),
        keyword: keyword.into(),
        kind: None,
        project_id: None,
        tag: None,
        offset: 0,
        limit: 20,
    }
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    rt.block_on(async {
        let root=tempfile::tempdir()?;let db=Database::open(root.path())?;let service=PlatformService::new(db.clone());
        db.call(|c| {let tx=c.transaction()?;let stamp="2026-10-13T00:00:00Z";let mut projects=Vec::new();
            for n in 0..100 {let project=id();tx.execute("INSERT INTO platform_projects(id,name,description,status,created_at,updated_at) VALUES(?1,?2,?3,'active',?4,?4)",params![project,format!("学习项目{n}"),"中文项目容量验证",stamp])?;projects.push(project);}
            for n in 0..10_000 {let resource=id();tx.execute("INSERT INTO platform_resources(id,kind,name,description,source,url,created_at,updated_at) VALUES(?1,'link',?2,?3,'基准数据','https://example.com/study',?4,?4)",params![resource,format!("参考资料{n}"),format!("春风学习材料分组{}",n%50),stamp])?;tx.execute("INSERT INTO platform_project_resources VALUES(?1,?2,?3)",params![projects[n%100],resource,stamp])?;}
            for n in 0..1_000 {let note=id();let text=format!("春风吹过书页，中文笔记{n}。{}", "阅读与整理知识。".repeat(100));let body=json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]});tx.execute("INSERT INTO platform_resources(id,kind,name,created_at,updated_at) VALUES(?1,'note',?2,?3,?3)",params![note,format!("阅读笔记{n}"),stamp])?;tx.execute("INSERT INTO platform_notes(resource_id,body_json,plain_text,schema_version,created_at,updated_at) VALUES(?1,?2,?3,1,?4,?4)",params![note,body.to_string(),text,stamp])?;tx.execute("INSERT INTO platform_project_resources VALUES(?1,?2,?3)",params![projects[n%100],note,stamp])?;}
            for n in 0..5_000 {tx.execute("INSERT INTO platform_tasks(id,title,description,status,priority,due_date,project_id,created_at,updated_at) VALUES(?1,?2,'整理资料','notStarted','medium','2026-10-13',?3,?4,?4)",params![id(),format!("任务{n}"),projects[n%100],stamp])?;}
            tx.commit()?;Ok(())}).await?;
        let before=Instant::now();service.rebuild_search(request()).await?;let rebuild_ms=before.elapsed().as_secs_f64()*1000.0;
        let mut searches=Vec::new();for n in 0..50 {let before=Instant::now();let found=service.search(query(["风吹过","参考资料99","任务49","学习项目9","无匹配关键词"][n%5])).await?;if n%5==0 {assert_eq!(found.items.len(),20);assert!(found.has_more);}searches.push(before.elapsed().as_secs_f64()*1000.0);}
        let mut note=service.get_note(IdRequest{request_id:id(),id:db.call(|c|Ok(c.query_row("SELECT resource_id FROM platform_notes LIMIT 1",[],|r|r.get::<_,String>(0))?)).await?}).await?;
        let mut saves=Vec::new();let mut dirty_searches=Vec::new();
        for n in 0..50 {let text=format!("{}记录{:02}","春风阅读记录。".repeat(1428),n);assert_eq!(text.chars().count(),10000);let body=json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]});let before=Instant::now();let receipt=service.save_note(SaveNote{request_id:id(),id:note.id.clone(),title:note.title.clone(),body,schema_version:1,base_revision:note.revision,client_edit_sequence:n+1,create_version:n%10==0}).await?;saves.push(before.elapsed().as_secs_f64()*1000.0);note.revision=receipt.saved_revision;if n<20 {let before=Instant::now();let found=service.search(query("风吹过")).await?;assert!(!found.items.is_empty());dirty_searches.push(before.elapsed().as_secs_f64()*1000.0);}}
        let before=Instant::now();let backup=service.start_backup(request()).await?;loop {tokio::task::yield_now().await;assert!(before.elapsed().as_secs()<120,"backup timed out");let jobs=service.list_jobs(request()).await?;let job=jobs.iter().find(|j|j.id==backup.id).expect("job exists");if job.status=="succeeded"{break;}assert!(!["failed","cancelled","interrupted"].contains(&job.status.as_str()));std::thread::sleep(std::time::Duration::from_millis(10));}let backup_ms=before.elapsed().as_secs_f64()*1000.0;
        {let _finished=service.access.read().await;}tokio::task::yield_now().await;drop(service);drop(db);let before=Instant::now();let service=PlatformService::new(Database::open(root.path())?);let status=service.status(request()).await?;assert_eq!(status.project_count,100);assert_eq!(status.note_count,1_000);let reopen_ms=before.elapsed().as_secs_f64()*1000.0;
        let report=json!({"kind":"releaseCoreOnly","os":std::env::consts::OS,"arch":std::env::consts::ARCH,"projects":100,"linkResources":10_000,"notes":1_000,"tasks":5_000,"searchSamples":50,"searchP95Ms":p95(&searches),"dirtySearchSamples":20,"dirtySearchP95Ms":p95(&dirty_searches),"saveCharacters":10000,"saveSamples":50,"saveP95Ms":p95(&saves),"rebuildMs":rebuild_ms,"backupMs":backup_ms,"databaseReopenMs":reopen_ms});
        println!("{}",serde_json::to_string_pretty(&report)?);Ok::<_,Box<dyn std::error::Error>>(())
    })
}
