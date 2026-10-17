use super::*;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PetSize {
    Small,
    Medium,
    Large,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PetPreferences {
    pub revision: i64,
    pub enabled: bool,
    pub always_on_top: bool,
    pub size: PetSize,
}
impl Default for PetPreferences {
    fn default() -> Self {
        Self {
            revision: 1,
            enabled: false,
            always_on_top: true,
            size: PetSize::Medium,
        }
    }
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavePetPreferences {
    pub request_id: String,
    pub base_revision: i64,
    pub preferences: PetPreferences,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPetState {
    pub preferences: PetPreferences,
    pub visible: bool,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PetActionKind {
    OpenWorkspace,
    Hide,
    Recenter,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PetAction {
    pub request_id: String,
    pub action: PetActionKind,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PetDragPhase {
    Start,
    Move,
    End,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PetDragRequest {
    pub request_id: String,
    pub drag_id: String,
    pub phase: PetDragPhase,
    pub x: f64,
    pub y: f64,
}
