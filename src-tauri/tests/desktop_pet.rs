use moshub_lib::{
    contracts::*,
    infrastructure::{backup, database::Database},
    platform::service::PlatformService,
};
use std::io::Read;
use std::sync::atomic::AtomicBool;
fn request() -> Request {
    Request {
        request_id: uuid::Uuid::new_v4().to_string(),
    }
}
#[tokio::test]
async fn pet_settings_persist_with_revision_conflicts_without_changing_personal_preferences() {
    let root = tempfile::tempdir().unwrap();
    let database = Database::open(root.path()).unwrap();
    let service = PlatformService::new(database.clone());
    let initial = service.get_pet_preferences(request()).await.unwrap();
    assert!(!initial.enabled);
    let saved = service
        .save_pet_preferences(SavePetPreferences {
            request_id: request().request_id,
            base_revision: initial.revision,
            preferences: PetPreferences {
                enabled: true,
                size: PetSize::Large,
                ..initial
            },
        })
        .await
        .unwrap();
    assert_eq!(saved.revision, 2);
    assert!(saved.enabled);
    assert_eq!(saved.size, PetSize::Large);
    let stale = service
        .save_pet_preferences(SavePetPreferences {
            request_id: request().request_id,
            base_revision: 1,
            preferences: PetPreferences::default(),
        })
        .await
        .unwrap_err();
    assert_eq!(stale.code, ErrorCode::Conflict);
    let reread = PlatformService::new(database.clone())
        .get_pet_preferences(request())
        .await
        .unwrap();
    assert_eq!(saved, reread);
    assert_eq!(
        service.get_preferences(request()).await.unwrap().revision,
        1
    );
    service
        .save_location(SaveLocation {
            request_id: request().request_id,
            location: PageLocation {
                page: "pet".into(),
                entity_id: None,
            },
        })
        .await
        .unwrap();
    assert_eq!(
        service.startup(request()).await.unwrap().location.page,
        "pet"
    );
    assert!(
        serde_json::from_value::<PetPreferences>(
            serde_json::json!({"revision":2,"enabled":true,"alwaysOnTop":true,"size":"enormous"})
        )
        .is_err()
    );
}
#[tokio::test]
async fn complete_backup_contains_the_actual_pet_preferences() {
    let root = tempfile::tempdir().unwrap();
    let database = Database::open(root.path()).unwrap();
    let service = PlatformService::new(database.clone());
    let saved = service
        .save_pet_preferences(SavePetPreferences {
            request_id: request().request_id,
            base_revision: 1,
            preferences: PetPreferences {
                enabled: true,
                always_on_top: false,
                size: PetSize::Small,
                ..PetPreferences::default()
            },
        })
        .await
        .unwrap();
    let archive = root.path().join("backups/pet.moshub.zip");
    let destination = archive.clone();
    let workspace = root.path().to_owned();
    database
        .call(move |c| {
            backup::snapshot(
                c,
                &workspace,
                &destination,
                &AtomicBool::new(false),
                &|_| {},
            )
        })
        .await
        .unwrap();
    let mut zip = zip::ZipArchive::new(std::fs::File::open(archive).unwrap()).unwrap();
    let mut bytes = Vec::new();
    zip.by_name("workspace.sqlite")
        .unwrap()
        .read_to_end(&mut bytes)
        .unwrap();
    let file = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(file.path(), bytes).unwrap();
    let conn = rusqlite::Connection::open(file.path()).unwrap();
    let json: String = conn
        .query_row(
            "SELECT value_json FROM platform_preferences WHERE key='desktopPet'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        serde_json::from_str::<PetPreferences>(&json).unwrap(),
        saved
    );
}
