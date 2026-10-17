use moshub_lib::{
    contracts::*,
    infrastructure::database::Database,
    modules::mogao::{MogaoService, contracts::*},
    platform::service::PlatformService,
};
use serde_json::json;
fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn req() -> Request {
    Request { request_id: id() }
}
fn scope(w: &Work) -> Scope {
    Scope {
        request_id: id(),
        work_id: w.id.clone(),
    }
}
fn entity(w: &Work, ch: &str) -> Entity {
    Entity {
        request_id: id(),
        work_id: w.id.clone(),
        id: ch.into(),
    }
}
fn fields(name: &str) -> WorkFields {
    WorkFields {
        name: name.into(),
        synopsis: "简介".into(),
        goal: "完成长篇".into(),
        genre: "奇幻".into(),
        favorite: false,
        archived: false,
        project_id: None,
        cover_resource_id: None,
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
async fn book(m: &MogaoService, name: &str) -> Work {
    m.save_work(SaveWork {
        request_id: id(),
        id: None,
        base_revision: None,
        fields: fields(name),
    })
    .await
    .unwrap()
}
async fn add(m: &MogaoService, w: &Work, title: &str, volume: Option<String>) -> Chapter {
    let tree = m.tree(scope(w)).await.unwrap();
    let t = m
        .create_node(CreateNode {
            request_id: id(),
            work_id: w.id.clone(),
            kind: "chapter".into(),
            title: title.into(),
            volume_id: volume,
            tree_revision: tree.work.tree_revision,
        })
        .await
        .unwrap();
    let ch = t.chapters.iter().find(|c| c.title == title).unwrap();
    m.chapter(entity(w, &ch.id)).await.unwrap()
}
fn save(ch: &Chapter, text: &str, version: bool) -> SaveChapter {
    SaveChapter {
        request_id: id(),
        work_id: ch.work_id.clone(),
        save: SaveNote {
            request_id: id(),
            id: ch.note.id.clone(),
            title: ch.note.title.clone(),
            body: json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]}),
            schema_version: 1,
            base_revision: ch.note.revision,
            client_edit_sequence: 1,
            create_version: version,
        },
    }
}
fn setting(w: &Work, kind: &str, title: &str) -> SaveSetting {
    SaveSetting {
        request_id: id(),
        work_id: w.id.clone(),
        id: None,
        base_revision: None,
        kind: kind.into(),
        title: title.into(),
        fields: SettingFields {
            aliases: "别名".into(),
            description: "人物描述".into(),
            goal: "目标".into(),
            relationships: "关系说明".into(),
            fixed: "作者设定".into(),
            category: "地区".into(),
            body: "计划中的结局，不是正文事实".into(),
            related_characters: vec![],
            resource_ids: vec![],
        },
        parent_id: None,
        chapter_id: None,
        position: 0,
    }
}
#[tokio::test]
async fn chapter_revisions_ownership_snapshots_restore_and_reopen() {
    let (root, db, p, m) = setup().await;
    let a = book(&m, "长篇甲").await;
    let b = book(&m, "长篇乙").await;
    let ch = add(&m, &a, "第一章", None).await;
    let input = save(&ch, "山川 日月。\n你好🌙", true);
    let (x, y) = tokio::join!(m.save_chapter(input.clone()), m.save_chapter(input));
    assert_eq!(usize::from(x.is_ok()) + usize::from(y.is_ok()), 1);
    assert!(matches!(
        x.as_ref().err().or(y.as_ref().err()).unwrap().code,
        ErrorCode::Conflict
    ));
    assert_eq!(
        m.chapter(entity(&b, &ch.note.id)).await.unwrap_err().code,
        ErrorCode::NotFound
    );
    let current = m.chapter(entity(&a, &ch.note.id)).await.unwrap();
    assert_eq!(current.word_count, 8);
    assert_eq!(current.note.revision, 2);
    let versions = m.versions(entity(&a, &ch.note.id)).await.unwrap();
    assert_eq!(versions.len(), 2);
    let old = versions.iter().find(|v| v.source_revision == 1).unwrap();
    let restored = m
        .restore(RestoreChapter {
            request_id: id(),
            work_id: a.id.clone(),
            id: ch.note.id.clone(),
            version_id: old.id.clone(),
            base_revision: 2,
        })
        .await
        .unwrap();
    assert_eq!(restored.note.revision, 3);
    assert!(restored.note.plain_text.is_empty());
    assert_eq!(m.versions(entity(&a, &ch.note.id)).await.unwrap().len(), 3);
    let wid = a.id.clone();
    let cid = ch.note.id.clone();
    drop(m);
    drop(p);
    drop(db);
    let db = Database::open(root.path()).unwrap();
    let p = PlatformService::new(db.clone());
    let m = MogaoService::install(db, p).await.unwrap();
    assert_eq!(
        m.chapter(Entity {
            request_id: id(),
            work_id: wid,
            id: cid
        })
        .await
        .unwrap()
        .note
        .revision,
        3
    );
}
#[tokio::test]
async fn drafts_keep_newer_sequence_reject_other_session_and_copy_atomically() {
    let (_root, db, _p, m) = setup().await;
    let w = book(&m, "恢复稿").await;
    let ch = add(&m, &w, "章节", None).await;
    let mut d = NoteDraft {
        session_id: id(),
        note_id: ch.note.id.clone(),
        base_revision: 1,
        client_edit_sequence: 7,
        title: "恢复的标题".into(),
        body: save(&ch, "未提交中文", false).save.body,
        schema_version: 1,
    };
    m.write_draft(WriteChapterDraft {
        request_id: id(),
        work_id: w.id.clone(),
        draft: d.clone(),
    })
    .await
    .unwrap();
    d.client_edit_sequence = 6;
    d.title = "较早回执".into();
    m.write_draft(WriteChapterDraft {
        request_id: id(),
        work_id: w.id.clone(),
        draft: d.clone(),
    })
    .await
    .unwrap();
    m.clear_draft(ClearChapterDraft {
        request_id: id(),
        work_id: w.id.clone(),
        id: ch.note.id.clone(),
        session_id: d.session_id.clone(),
        through_sequence: 6,
    })
    .await
    .unwrap();
    assert_eq!(
        m.draft(entity(&w, &ch.note.id))
            .await
            .unwrap()
            .unwrap()
            .draft
            .client_edit_sequence,
        7
    );
    d.session_id = id();
    assert_eq!(
        m.write_draft(WriteChapterDraft {
            request_id: id(),
            work_id: w.id.clone(),
            draft: d
        })
        .await
        .unwrap_err()
        .code,
        ErrorCode::Conflict
    );
    db.call(|c|{c.execute_batch("CREATE TRIGGER fail_copy BEFORE INSERT ON mogao_versions BEGIN SELECT RAISE(ABORT,'fault'); END;")?;Ok(())}).await.unwrap();
    assert!(m.copy_draft(entity(&w, &ch.note.id)).await.is_err());
    assert_eq!(m.tree(scope(&w)).await.unwrap().chapters.len(), 1);
    assert!(m.draft(entity(&w, &ch.note.id)).await.unwrap().is_some());
    db.call(|c| {
        c.execute_batch("DROP TRIGGER fail_copy")?;
        Ok(())
    })
    .await
    .unwrap();
    let copy = m.copy_draft(entity(&w, &ch.note.id)).await.unwrap();
    assert_eq!(copy.note.title, "恢复的标题");
    assert_eq!(copy.note.plain_text, "未提交中文");
    assert!(m.draft(entity(&w, &ch.note.id)).await.unwrap().is_none());
    assert!(
        m.chapter(entity(&w, &ch.note.id))
            .await
            .unwrap()
            .note
            .plain_text
            .is_empty()
    );
}
#[tokio::test]
async fn volumes_order_stable_ids_cross_work_rejected_and_soft_delete_keeps_outline() {
    let (_root, _db, _p, m) = setup().await;
    let w = book(&m, "目录").await;
    let other = book(&m, "别的作品").await;
    let t = m
        .create_node(CreateNode {
            request_id: id(),
            work_id: w.id.clone(),
            kind: "volume".into(),
            title: "第一卷".into(),
            volume_id: None,
            tree_revision: 1,
        })
        .await
        .unwrap();
    let v = t.volumes[0].clone();
    let a = add(&m, &w, "A", Some(v.id.clone())).await;
    let b = add(&m, &w, "B", None).await;
    let t = m.tree(scope(&w)).await.unwrap();
    let movement = MoveNode {
        request_id: id(),
        work_id: w.id.clone(),
        id: b.note.id.clone(),
        kind: "chapter".into(),
        title: "改名 B".into(),
        volume_id: Some(v.id.clone()),
        position: 0,
        status: "final".into(),
        tree_revision: t.work.tree_revision,
        base_revision: b.note.revision,
    };
    let moved = m.move_node(movement.clone()).await.unwrap();
    assert_eq!(moved.chapters[0].id, b.note.id);
    assert_eq!(moved.chapters[1].id, a.note.id);
    assert_eq!(
        m.move_node(movement).await.unwrap_err().code,
        ErrorCode::Conflict
    );
    assert_eq!(
        m.create_node(CreateNode {
            request_id: id(),
            work_id: other.id.clone(),
            kind: "chapter".into(),
            title: "跨作品".into(),
            volume_id: Some(v.id.clone()),
            tree_revision: 1
        })
        .await
        .unwrap_err()
        .code,
        ErrorCode::NotFound
    );
    let mut plan = setting(&w, "outline", "结局计划");
    plan.chapter_id = Some(a.note.id.clone());
    let plan = m.save_setting(plan).await.unwrap();
    m.delete_chapter(Mutation {
        request_id: id(),
        work_id: w.id.clone(),
        id: a.note.id.clone(),
        base_revision: 1,
        deleted: true,
    })
    .await
    .unwrap();
    assert_eq!(
        m.settings(scope(&w)).await.unwrap()[0].chapter_id,
        plan.chapter_id
    );
    m.delete_chapter(Mutation {
        request_id: id(),
        work_id: w.id.clone(),
        id: a.note.id.clone(),
        base_revision: 2,
        deleted: false,
    })
    .await
    .unwrap();
    assert_eq!(
        m.chapter(entity(&w, &a.note.id))
            .await
            .unwrap()
            .note
            .revision,
        3
    );
    assert!(
        m.delete_volume(Mutation {
            request_id: id(),
            work_id: w.id.clone(),
            id: v.id,
            base_revision: v.revision,
            deleted: true
        })
        .await
        .is_err()
    );
}
#[tokio::test]
async fn settings_cycle_foreign_relations_and_revision_checks() {
    let (_root, _db, _p, m) = setup().await;
    let w = book(&m, "设定").await;
    let other = book(&m, "其他").await;
    let person = m
        .save_setting(setting(&w, "character", "甲"))
        .await
        .unwrap();
    let mut input = setting(&w, "character", "乙");
    input.fields.related_characters = vec![person.id];
    let second = m.save_setting(input).await.unwrap();
    let mut foreign = setting(&other, "character", "丙");
    foreign.fields.related_characters = vec![second.id];
    assert!(m.save_setting(foreign).await.is_err());
    let root = m
        .save_setting(setting(&w, "outline", "根计划"))
        .await
        .unwrap();
    let mut child = setting(&w, "outline", "子计划");
    child.parent_id = Some(root.id.clone());
    let child = m.save_setting(child).await.unwrap();
    let mut cycle = setting(&w, "outline", "根计划");
    cycle.id = Some(root.id.clone());
    cycle.base_revision = Some(root.revision);
    cycle.parent_id = Some(child.id.clone());
    assert_eq!(
        m.save_setting(cycle).await.unwrap_err().code,
        ErrorCode::Validation
    );
    assert!(
        m.delete_setting(Mutation {
            request_id: id(),
            work_id: w.id.clone(),
            id: root.id,
            base_revision: 1,
            deleted: true
        })
        .await
        .is_err()
    );
    assert_eq!(m.tree(scope(&w)).await.unwrap().work.settings_revision, 5);
    assert!(m.tree(scope(&w)).await.unwrap().chapters.is_empty());
}
#[tokio::test]
async fn utf8_preview_import_transaction_failure_and_ordered_exports() {
    let (_root, db, _p, m) = setup().await;
    let parts = MogaoService::preview_txt(
        "\u{feff}序章\n开场。\n第一章 出发\n风起。\n第二章 归来\n终章。".as_bytes(),
    )
    .unwrap();
    assert_eq!(parts.len(), 3);
    assert!(MogaoService::preview_txt(&[0xff, 0xfe]).is_err());
    assert!(MogaoService::preview_txt(&vec![b'a'; 20 * 1024 * 1024 + 1]).is_err());
    assert_eq!(
        MogaoService::preview_txt("无章节的短篇。".as_bytes())
            .unwrap()
            .len(),
        1
    );
    db.call(|c|{c.execute_batch("CREATE TRIGGER fail_import BEFORE INSERT ON mogao_chapters WHEN NEW.position=1 BEGIN SELECT RAISE(ABORT,'fault'); END;")?;Ok(())}).await.unwrap();
    let input = ImportWork {
        request_id: id(),
        name: "导入".into(),
        chapters: parts,
    };
    assert!(m.import(input.clone()).await.is_err());
    assert!(
        m.works(WorkQuery {
            request_id: id(),
            keyword: "".into(),
            deleted: false,
            offset: 0,
            limit: 20
        })
        .await
        .unwrap()
        .is_empty()
    );
    db.call(|c| {
        c.execute_batch("DROP TRIGGER fail_import")?;
        Ok(())
    })
    .await
    .unwrap();
    let w = m.import(input).await.unwrap();
    let txt = String::from_utf8(
        m.export(ExportWork {
            request_id: id(),
            work_id: w.id.clone(),
            chapter_ids: vec![],
            format: "txt".into(),
        })
        .await
        .unwrap(),
    )
    .unwrap();
    assert!(txt.find("序章").unwrap() < txt.find("第二章").unwrap());
    let t = m.tree(scope(&w)).await.unwrap();
    let md = String::from_utf8(
        m.export(ExportWork {
            request_id: id(),
            work_id: w.id.clone(),
            chapter_ids: vec![t.chapters[2].id.clone(), t.chapters[0].id.clone()],
            format: "markdown".into(),
        })
        .await
        .unwrap(),
    )
    .unwrap();
    assert!(!md.contains("风起"));
    assert!(md.find("开场").unwrap() < md.find("终章").unwrap());
}
async fn wait(p: &PlatformService, j: &Job) -> Job {
    let start = std::time::Instant::now();
    loop {
        tokio::task::yield_now().await;
        let jobs = p.list_jobs(req()).await.unwrap();
        if let Some(j) = jobs
            .into_iter()
            .find(|v| v.id == j.id && !matches!(v.status.as_str(), "pending" | "running"))
        {
            return j;
        }
        assert!(start.elapsed().as_secs() < 10);
    }
}
#[tokio::test]
async fn backup_restore_resyncs_enabled_state_and_contains_drafts_settings_and_versions() {
    let (root, _db, p, m) = setup().await;
    let w = book(&m, "备份作品").await;
    let ch = add(&m, &w, "章节", None).await;
    m.save_chapter(save(&ch, "备份正文", true)).await.unwrap();
    m.save_setting(setting(&w, "character", "备份人物"))
        .await
        .unwrap();
    let draft = NoteDraft {
        session_id: id(),
        note_id: ch.note.id.clone(),
        base_revision: 2,
        client_edit_sequence: 9,
        title: "尚未采用".into(),
        body: save(&ch, "恢复稿", false).save.body,
        schema_version: 1,
    };
    m.write_draft(WriteChapterDraft {
        request_id: id(),
        work_id: w.id.clone(),
        draft,
    })
    .await
    .unwrap();
    let job = p.start_backup(req()).await.unwrap();
    assert_eq!(wait(&p, &job).await.status, "succeeded");
    let backup = p
        .list_backups(req())
        .await
        .unwrap()
        .into_iter()
        .find(|b| b.id == job.id)
        .unwrap();
    p.set_module(SetModule {
        request_id: id(),
        id: "mogao".into(),
        enabled: false,
    })
    .await
    .unwrap();
    assert_eq!(
        m.tree(scope(&w)).await.unwrap_err().code,
        ErrorCode::ModuleDisabled
    );
    assert!(
        p.create_project(CreateProject {
            request_id: id(),
            name: "停用仍可用".into(),
            description: "".into()
        })
        .await
        .is_ok()
    );
    let preview = p
        .inspect_restore(
            req(),
            &root
                .path()
                .join("backups")
                .join(format!("{}.moshub.zip", backup.id)),
        )
        .await
        .unwrap();
    let j = p
        .start_restore(IdRequest {
            request_id: id(),
            id: preview.id,
        })
        .await
        .unwrap();
    assert_eq!(wait(&p, &j).await.status, "succeeded");
    assert_eq!(p.list_modules(req()).await.unwrap()[0].state, "ready");
    assert_eq!(
        m.chapter(entity(&w, &ch.note.id))
            .await
            .unwrap()
            .note
            .plain_text,
        "备份正文"
    );
    assert!(m.draft(entity(&w, &ch.note.id)).await.unwrap().is_some());
    assert_eq!(m.settings(scope(&w)).await.unwrap().len(), 1);
    assert_eq!(m.versions(entity(&w, &ch.note.id)).await.unwrap().len(), 2);
}
#[tokio::test]
async fn project_purge_detaches_work_and_referenced_resource_cannot_be_purged() {
    let (_root, _db, p, m) = setup().await;
    let project = p
        .create_project(CreateProject {
            request_id: id(),
            name: "项目".into(),
            description: "".into(),
        })
        .await
        .unwrap();
    let r = p
        .create_link(CreateLink {
            request_id: id(),
            name: "参考".into(),
            url: "https://example.com".into(),
            description: "".into(),
            source: "".into(),
            folder_id: None,
            project_id: None,
        })
        .await
        .unwrap();
    let mut f = fields("独立作品");
    f.project_id = Some(project.id.clone());
    let w = m
        .save_work(SaveWork {
            request_id: id(),
            id: None,
            base_revision: None,
            fields: f,
        })
        .await
        .unwrap();
    let mut s = setting(&w, "world", "资料关联");
    s.fields.resource_ids.push(r.id.clone());
    m.save_setting(s).await.unwrap();
    let deleted = p
        .set_resource_deleted(SetResourceDeleted {
            request_id: id(),
            id: r.id.clone(),
            base_revision: r.revision,
            deleted: true,
        })
        .await
        .unwrap();
    assert_eq!(
        p.delete_impact(TrashMutation {
            request_id: id(),
            kind: "link".into(),
            id: r.id.clone(),
            base_revision: deleted.revision
        })
        .await
        .unwrap()
        .module_links,
        1
    );
    assert_eq!(
        p.purge_trash(TrashMutation {
            request_id: id(),
            kind: "link".into(),
            id: r.id,
            base_revision: deleted.revision
        })
        .await
        .unwrap_err()
        .code,
        ErrorCode::Validation
    );
    let deleted = p
        .set_project_deleted(SetProjectDeleted {
            request_id: id(),
            id: project.id.clone(),
            base_revision: project.revision,
            deleted: true,
        })
        .await
        .unwrap();
    p.purge_trash(TrashMutation {
        request_id: id(),
        kind: "project".into(),
        id: project.id,
        base_revision: deleted.revision,
    })
    .await
    .unwrap();
    assert!(
        m.tree(scope(&w))
            .await
            .unwrap()
            .work
            .fields
            .project_id
            .is_none()
    );
}

#[tokio::test]
async fn global_search_disabled_titles_only_and_global_trash_restore_and_purge() {
    let (_root, _db, p, m) = setup().await;
    let w = book(&m, "全局中文作品").await;
    let ch = add(&m, &w, "章节标题", None).await;
    m.save_chapter(save(&ch, "只有正文可命中长河落日", true))
        .await
        .unwrap();
    let person = m
        .save_setting(setting(&w, "character", "主角姓名"))
        .await
        .unwrap();
    let query = |keyword: &str| SearchQuery {
        request_id: id(),
        keyword: keyword.into(),
        kind: None,
        project_id: None,
        tag: None,
        offset: 0,
        limit: 20,
    };
    let hit = p
        .search(query("长河落日"))
        .await
        .unwrap()
        .items
        .pop()
        .unwrap();
    assert_eq!(hit.module_id.as_deref(), Some("mogao"));
    assert_eq!(hit.work_id.as_deref(), Some(w.id.as_str()));
    assert_eq!(hit.id, ch.note.id);
    p.set_module(SetModule {
        request_id: id(),
        id: "mogao".into(),
        enabled: false,
    })
    .await
    .unwrap();
    assert!(p.search(query("长河落日")).await.unwrap().items.is_empty());
    let title = p
        .search(query("全局中文作品"))
        .await
        .unwrap()
        .items
        .pop()
        .unwrap();
    assert!(title.disabled);
    assert!(title.snippet.is_empty());
    p.set_module(SetModule {
        request_id: id(),
        id: "mogao".into(),
        enabled: true,
    })
    .await
    .unwrap();
    m.delete_chapter(Mutation {
        request_id: id(),
        work_id: w.id.clone(),
        id: ch.note.id.clone(),
        base_revision: 2,
        deleted: true,
    })
    .await
    .unwrap();
    let trash = p
        .trash(TrashQuery {
            request_id: id(),
            kind: None,
            offset: 0,
            limit: 20,
        })
        .await
        .unwrap();
    let deleted = trash.into_iter().find(|t| t.id == ch.note.id).unwrap();
    let mutation = TrashMutation {
        request_id: id(),
        kind: deleted.kind,
        id: deleted.id,
        base_revision: deleted.revision,
    };
    assert_eq!(p.delete_impact(mutation.clone()).await.unwrap().versions, 2);
    p.restore_trash(mutation).await.unwrap();
    assert_eq!(
        m.chapter(entity(&w, &ch.note.id))
            .await
            .unwrap()
            .note
            .plain_text,
        "只有正文可命中长河落日"
    );
    m.delete_setting(Mutation {
        request_id: id(),
        work_id: w.id.clone(),
        id: person.id.clone(),
        base_revision: person.revision,
        deleted: true,
    })
    .await
    .unwrap();
    p.purge_trash(TrashMutation {
        request_id: id(),
        kind: "mogao-character".into(),
        id: person.id,
        base_revision: 2,
    })
    .await
    .unwrap();
    assert!(m.settings(scope(&w)).await.unwrap().is_empty());
    m.delete_work(Mutation {
        request_id: id(),
        work_id: w.id.clone(),
        id: w.id.clone(),
        base_revision: 1,
        deleted: true,
    })
    .await
    .unwrap();
    p.purge_trash(TrashMutation {
        request_id: id(),
        kind: "mogao-work".into(),
        id: w.id.clone(),
        base_revision: 2,
    })
    .await
    .unwrap();
    assert!(m.tree(scope(&w)).await.is_err());
}

#[tokio::test]
async fn location_restore_and_structured_archive_keep_deleted_chapters_history_and_drafts() {
    let (_root, _db, _p, m) = setup().await;
    let w = book(&m, "位置与档案").await;
    let ch = add(&m, &w, "章节", None).await;
    m.save_chapter(save(&ch, "历史内容", true)).await.unwrap();
    m.save_location(moshub_lib::modules::mogao::contracts::SaveLocation {
        request_id: id(),
        location: Location {
            work_id: Some(w.id.clone()),
            chapter_id: Some(ch.note.id.clone()),
        },
    })
    .await
    .unwrap();
    assert_eq!(
        m.location(req()).await.unwrap().chapter_id,
        Some(ch.note.id.clone())
    );
    let draft = NoteDraft {
        session_id: id(),
        note_id: ch.note.id.clone(),
        base_revision: 2,
        client_edit_sequence: 4,
        title: "恢复稿".into(),
        body: save(&ch, "未提交内容", false).save.body,
        schema_version: 1,
    };
    m.write_draft(WriteChapterDraft {
        request_id: id(),
        work_id: w.id.clone(),
        draft,
    })
    .await
    .unwrap();
    m.delete_chapter(Mutation {
        request_id: id(),
        work_id: w.id.clone(),
        id: ch.note.id.clone(),
        base_revision: 2,
        deleted: true,
    })
    .await
    .unwrap();
    assert!(m.location(req()).await.unwrap().chapter_id.is_none());
    let bytes = m
        .export(ExportWork {
            request_id: id(),
            work_id: w.id,
            chapter_ids: vec![],
            format: "json".into(),
        })
        .await
        .unwrap();
    let archive: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(archive["format"], "moshub-mogao-backup");
    let chapter = &archive["chapters"][0];
    assert!(chapter["summary"]["deletedAt"].is_string());
    assert_eq!(chapter["content"]["plainText"], "历史内容");
    assert_eq!(chapter["draft"]["draft"]["title"], "恢复稿");
    assert_eq!(chapter["versions"].as_array().unwrap().len(), 2);
}
#[tokio::test]
async fn future_module_backup_rejected_before_replacing_current_workspace_and_core_still_works() {
    use std::sync::atomic::AtomicBool;
    let (root, db, p, m) = setup().await;
    let w = book(&m, "当前安全作品").await;
    let path = root.path().join("backups/future-module.moshub.zip");
    let target = path.clone();
    let home = root.path().to_owned();
    db.call(move |c| {
        c.execute("INSERT INTO mogao_schema VALUES(99,'future')", [])?;
        moshub_lib::infrastructure::backup::snapshot(
            c,
            &home,
            &target,
            &AtomicBool::new(false),
            &|_| {},
        )?;
        c.execute("DELETE FROM mogao_schema WHERE version=99", [])?;
        Ok(())
    })
    .await
    .unwrap();
    assert_eq!(
        p.inspect_restore(req(), &path).await.unwrap_err().code,
        ErrorCode::MigrationFailed
    );
    assert_eq!(
        m.tree(scope(&w)).await.unwrap().work.fields.name,
        "当前安全作品"
    );
    assert!(
        p.create_note(CreateNote {
            request_id: id(),
            title: "平台仍可写入".into(),
            project_id: None
        })
        .await
        .is_ok()
    );
}
#[tokio::test]
async fn module_migration_failure_isolated_and_enable_revalidates_without_affecting_platform() {
    let root = tempfile::tempdir().unwrap();
    let db = Database::open(root.path()).unwrap();
    db.call(|c| {
        c.execute_batch("CREATE TABLE mogao_works(blocked INTEGER)")?;
        Ok(())
    })
    .await
    .unwrap();
    let p = PlatformService::new(db.clone());
    assert!(MogaoService::install(db, p.clone()).await.is_err());
    assert_eq!(p.list_modules(req()).await.unwrap()[0].state, "error");
    assert!(
        p.set_module(SetModule {
            request_id: id(),
            id: "mogao".into(),
            enabled: true
        })
        .await
        .is_err()
    );
    assert!(
        p.create_project(CreateProject {
            request_id: id(),
            name: "不受模块故障影响".into(),
            description: "".into()
        })
        .await
        .is_ok()
    );
}

#[tokio::test]
async fn restore_foundation_only_backup_migrates_empty_module_and_disables_its_runtime() {
    let root = tempfile::tempdir().unwrap();
    let db = Database::open(root.path()).unwrap();
    let p = PlatformService::new(db.clone());
    p.create_note(CreateNote {
        request_id: id(),
        title: "基础笔记".into(),
        project_id: None,
    })
    .await
    .unwrap();
    let before = p.start_backup(req()).await.unwrap();
    assert_eq!(wait(&p, &before).await.status, "succeeded");
    let m = MogaoService::install(db, p.clone()).await.unwrap();
    p.set_module(SetModule {
        request_id: id(),
        id: "mogao".into(),
        enabled: true,
    })
    .await
    .unwrap();
    let _ = book(&m, "稍后新增的作品").await;
    let preview = p
        .inspect_restore(
            req(),
            &root
                .path()
                .join("backups")
                .join(format!("{}.moshub.zip", before.id)),
        )
        .await
        .unwrap();
    let job = p
        .start_restore(IdRequest {
            request_id: id(),
            id: preview.id,
        })
        .await
        .unwrap();
    assert_eq!(wait(&p, &job).await.status, "succeeded");
    assert_eq!(p.list_modules(req()).await.unwrap()[0].state, "disabled");
    assert_eq!(
        p.list_notes(ListRequest {
            request_id: id(),
            offset: 0,
            limit: 20
        })
        .await
        .unwrap()[0]
            .title,
        "基础笔记"
    );
    p.set_module(SetModule {
        request_id: id(),
        id: "mogao".into(),
        enabled: true,
    })
    .await
    .unwrap();
    assert!(
        m.works(WorkQuery {
            request_id: id(),
            keyword: "".into(),
            deleted: false,
            offset: 0,
            limit: 20
        })
        .await
        .unwrap()
        .is_empty()
    );
}

#[tokio::test]
async fn foundation_v3_upgrade_to_module_links_keeps_content_and_creates_protection_backup() {
    use sha2::{Digest, Sha256};
    let root = tempfile::tempdir().unwrap();
    moshub_lib::infrastructure::paths::WorkspacePaths::initialize(root.path()).unwrap();
    let c = rusqlite::Connection::open(root.path().join("workspace.sqlite")).unwrap();
    for (index, sql) in [
        include_str!("../migrations/0001_platform.sql"),
        include_str!("../migrations/0002_document_editing.sql"),
        include_str!("../migrations/0003_foundation.sql"),
    ]
    .iter()
    .enumerate()
    {
        c.execute_batch(sql).unwrap();
        let checksum = Sha256::digest(sql.as_bytes())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        c.execute(
            "INSERT INTO platform_migrations VALUES(?1,?2,'2026-10-13')",
            rusqlite::params![(index + 1) as u32, checksum],
        )
        .unwrap();
    }
    let wid = id();
    let nid = id();
    c.execute("INSERT INTO platform_meta VALUES(?1,3)", [&wid])
        .unwrap();
    c.pragma_update(None, "user_version", 3).unwrap();
    c.execute("INSERT INTO platform_resources(id,kind,name,created_at,updated_at) VALUES(?1,'note','基础版已有笔记','date','date')",[&nid]).unwrap();
    c.execute("INSERT INTO platform_notes(resource_id,body_json,plain_text,schema_version,created_at,updated_at) VALUES(?1,?2,'升级前正文',1,'date','date')",rusqlite::params![nid,json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"升级前正文"}]}]}).to_string()]).unwrap();
    drop(c);
    let db = Database::open(root.path()).unwrap();
    let p = PlatformService::new(db.clone());
    assert_eq!(p.status(req()).await.unwrap().schema_version, 4);
    assert_eq!(p.status(req()).await.unwrap().workspace_id, wid);
    assert_eq!(
        p.get_note(IdRequest {
            request_id: id(),
            id: nid
        })
        .await
        .unwrap()
        .plain_text,
        "升级前正文"
    );
    assert_eq!(p.list_backups(req()).await.unwrap().len(), 1);
    let _m = MogaoService::install(db, p.clone()).await.unwrap();
    assert!(!p.list_modules(req()).await.unwrap()[0].enabled);
}
