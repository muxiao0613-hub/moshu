use crate::{contracts::*, platform::domain};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::PathBuf,
};

#[derive(Clone)]
pub struct DraftStore {
    root: PathBuf,
    workspace_id: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Payload {
    format_version: u32,
    workspace_id: String,
    draft: NoteDraft,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    payload: String,
    checksum: String,
}
fn error() -> AppError {
    AppError::new(
        ErrorCode::IoError,
        "恢复草稿无法读取或写入；原文件已保留，请检查磁盘与权限。",
        true,
    )
}
fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
pub fn validate(draft: &NoteDraft) -> AppResult<()> {
    domain::id(&draft.session_id)?;
    domain::id(&draft.note_id)?;
    domain::revision(draft.base_revision)?;
    if draft.client_edit_sequence > domain::MAX_SAFE_INTEGER
        || draft.title.chars().count() > 200
        || draft.title.contains('\0')
    {
        return Err(AppError::validation("恢复草稿字段无效。"));
    }
    domain::document(&draft.body, draft.schema_version)?;
    Ok(())
}
impl DraftStore {
    pub fn new(root: PathBuf, workspace_id: String) -> Self {
        Self { root, workspace_id }
    }
    fn directory(&self) -> AppResult<PathBuf> {
        let path = self.root.join("drafts");
        if path.is_symlink() || path.canonicalize().map_err(|_| error())? != path {
            return Err(error());
        }
        Ok(path)
    }
    fn path(&self, id: &str) -> AppResult<PathBuf> {
        domain::id(id)?;
        let path = self.directory()?.join(format!("{id}.json"));
        if path.is_symlink() {
            return Err(error());
        }
        Ok(path)
    }
    pub fn get(&self, id: &str) -> AppResult<NoteDraft> {
        let file = File::open(self.path(id)?).map_err(|_| error())?;
        if !file.metadata().map_err(|_| error())?.is_file() {
            return Err(error());
        }
        let mut bytes = Vec::new();
        file.take(8 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| error())?;
        if bytes.len() > 8 * 1024 * 1024 {
            return Err(error());
        }
        let envelope: Envelope = serde_json::from_slice(&bytes).map_err(|_| error())?;
        if hash(envelope.payload.as_bytes()) != envelope.checksum {
            return Err(error());
        }
        let payload: Payload = serde_json::from_str(&envelope.payload).map_err(|_| error())?;
        if payload.format_version != 1
            || payload.workspace_id != self.workspace_id
            || payload.draft.session_id != id
        {
            return Err(error());
        }
        validate(&payload.draft).map_err(|_| error())?;
        Ok(payload.draft)
    }
    // Caller serializes all operations, including conditional acknowledgement removal.
    pub fn write(&self, draft: NoteDraft) -> AppResult<()> {
        validate(&draft)?;
        let path = self.path(&draft.session_id)?;
        if path.exists() {
            let existing = self.get(&draft.session_id)?;
            if existing.note_id != draft.note_id {
                return Err(AppError::validation("草稿会话归属不一致。"));
            }
            if existing.client_edit_sequence > draft.client_edit_sequence {
                return Ok(());
            }
        }
        let payload = serde_json::to_string(&Payload {
            format_version: 1,
            workspace_id: self.workspace_id.clone(),
            draft,
        })
        .map_err(|_| error())?;
        let bytes = serde_json::to_vec(&Envelope {
            checksum: hash(payload.as_bytes()),
            payload,
        })
        .map_err(|_| error())?;
        let directory = self.directory()?;
        let mut temp = tempfile::Builder::new()
            .prefix(".draft-temp-")
            .tempfile_in(&directory)
            .map_err(|_| error())?;
        temp.write_all(&bytes).map_err(|_| error())?;
        temp.as_file().sync_all().map_err(|_| error())?;
        temp.persist(path).map_err(|_| error())?;
        self.sync()
    }
    pub fn discard(&self, id: &str, through_sequence: Option<u64>) -> AppResult<()> {
        let path = self.path(id)?;
        if !path.exists() {
            return Ok(());
        }
        if let Some(sequence) = through_sequence
            && self.get(id)?.client_edit_sequence > sequence
        {
            return Ok(());
        }
        fs::remove_file(path).map_err(|_| error())?;
        self.sync()
    }
    pub fn list(&self, offset: u32, limit: u32) -> AppResult<Vec<DraftEntry>> {
        let mut ids = Vec::new();
        for entry in fs::read_dir(self.directory()?).map_err(|_| error())? {
            let name = entry
                .map_err(|_| error())?
                .file_name()
                .to_string_lossy()
                .into_owned();
            if let Some(id) = name.strip_suffix(".json")
                && domain::id(id).is_ok()
            {
                ids.push(id.to_owned());
            }
        }
        ids.sort();
        Ok(ids
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .map(|id| match self.get(&id) {
                Ok(draft) => DraftEntry {
                    session_id: id,
                    note_id: Some(draft.note_id),
                    title: Some(draft.title),
                    issue: None,
                },
                Err(_) => DraftEntry {
                    session_id: id,
                    note_id: None,
                    title: None,
                    issue: Some("草稿校验失败，文件已保留。".into()),
                },
            })
            .collect())
    }
    fn sync(&self) -> AppResult<()> {
        #[cfg(unix)]
        File::open(self.directory()?)
            .and_then(|f| f.sync_all())
            .map_err(|_| error())?;
        Ok(())
    }
}
