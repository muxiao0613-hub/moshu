use super::{domain, service::PlatformService};
use crate::contracts::*;
use rusqlite::{Connection, OptionalExtension, params};

fn read(conn: &Connection) -> AppResult<PetPreferences> {
    let row: Option<(String, i64)> = conn
        .query_row(
            "SELECT value_json,revision FROM platform_preferences WHERE key='desktopPet'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    match row {
        None => Ok(PetPreferences::default()),
        Some((json, revision)) => {
            let mut preferences: PetPreferences = serde_json::from_str(&json).map_err(|_| {
                AppError::new(ErrorCode::DbError, "桌宠设置损坏，请重新设置。", true)
            })?;
            preferences.revision = revision;
            Ok(preferences)
        }
    }
}
impl PlatformService {
    pub async fn get_pet_preferences(&self, input: Request) -> AppResult<PetPreferences> {
        domain::id(&input.request_id)?;
        self.database.call(|c| read(c)).await
    }
    pub async fn save_pet_preferences(
        &self,
        input: SavePetPreferences,
    ) -> AppResult<PetPreferences> {
        domain::id(&input.request_id)?;
        domain::revision(input.base_revision)?;
        self.database.call(move |c|{
            let tx=c.transaction()?;
            let current=read(&tx)?;
            if current.revision!=input.base_revision {return Err(AppError::conflict(current.revision));}
            let mut next=input.preferences;
            next.revision=current.revision+1;
            let json=serde_json::to_string(&next).map_err(|_|AppError::validation("桌宠设置格式无效。"))?;
            let stamp=chrono::Utc::now().to_rfc3339();
            let changed=tx.execute("INSERT INTO platform_preferences(key,value_json,schema_version,revision,created_at,updated_at) VALUES('desktopPet',?1,1,?2,?3,?3) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision,updated_at=excluded.updated_at WHERE revision=?4",params![json,next.revision,stamp,input.base_revision])?;
            if changed!=1 {return Err(AppError::conflict(current.revision));}
            tx.commit()?;Ok(next)
        }).await
    }
}
