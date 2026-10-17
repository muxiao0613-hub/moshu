//! Character baselines are append-only and have an effective chapter order.
use super::*;
const KEYS: &str = "name aliases role age gender appearance personality background abilities goals relationships arc firstAppearance notes voiceSamples profileEvidence";
fn fields(v: &Value) -> Value {
    Value::Object(
        KEYS.split_whitespace()
            .map(|k| {
                (
                    k.to_owned(),
                    v.get(k).cloned().unwrap_or_else(|| {
                        if [
                            "aliases",
                            "relationships",
                            "voiceSamples",
                            "profileEvidence",
                        ]
                        .contains(&k)
                        {
                            json!([])
                        } else if k == "role" {
                            json!("supporting")
                        } else {
                            json!("")
                        }
                    }),
                )
            })
            .collect(),
    )
}
pub(super) fn ensure(character: &mut Value) {
    if character["profileVersions"]
        .as_array()
        .is_none_or(Vec::is_empty)
    {
        character["profileVersions"] = json!([{"id":uid(),"effectiveOrder":0,"createdAt":now(),"label":"已有底色（历史起点）","fields":fields(character)}]);
    }
}
pub(super) fn at(character: &Value, order: i64) -> Value {
    let versions = character["profileVersions"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let start = versions
        .iter()
        .rposition(|v| v["effectiveOrder"] == 0)
        .unwrap_or(0);
    let mut eligible = versions
        .into_iter()
        .skip(start)
        .enumerate()
        .filter(|(_, v)| v["effectiveOrder"].as_i64().unwrap_or(0) <= order)
        .collect::<Vec<_>>();
    eligible.sort_by_key(|(i, v)| (v["effectiveOrder"].as_i64().unwrap_or(0), *i));
    let mut value = json!({});
    for (_, v) in eligible {
        if let Some(map) = v.get("changes").unwrap_or(&v["fields"]).as_object() {
            for (k, v) in map {
                value[k] = v.clone();
            }
        }
    }
    value
}
pub(super) fn append(
    character: &mut Value,
    order: i64,
    label: &str,
    source: Option<&str>,
    snapshot: Option<Value>,
) {
    let f = snapshot.unwrap_or_else(|| fields(character));
    let before = at(character, order);
    let changes: serde_json::Map<String, Value> = KEYS
        .split_whitespace()
        .filter(|k| f[*k] != before[*k])
        .map(|k| (k.to_owned(), f[k].clone()))
        .collect();
    if changes.is_empty() {
        return;
    }
    let mut v =
        json!({"id":uid(),"effectiveOrder":order,"createdAt":now(),"label":label,"fields":f});
    if order > 0 {
        v["changes"] = Value::Object(changes);
    }
    if let Some(id) = source {
        v["sourceChapterId"] = json!(id);
    }
    character["profileVersions"].as_array_mut().unwrap().push(v);
}
