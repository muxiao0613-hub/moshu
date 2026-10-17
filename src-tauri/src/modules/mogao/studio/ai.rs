//! AI transport owns credentials and HTTP. Provider bodies/errors never enter diagnostics.
use super::*;
use std::collections::{HashMap, HashSet};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
#[derive(Clone)]
pub struct NativeAi {
    account: String,
    cancelled: Arc<Mutex<HashSet<String>>>,
    secret: Arc<Mutex<Option<String>>>,
    active: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}
impl NativeAi {
    pub fn new(root: &std::path::Path) -> Self {
        Self {
            account: hash(&root.to_string_lossy()),
            cancelled: Arc::default(),
            secret: Arc::default(),
            active: Arc::default(),
        }
    }
    pub fn cancel(&self, id: &str) {
        if !id.is_empty()
            && let Ok(mut pending) = self.cancelled.lock()
        {
            if pending.len() >= 128 {
                pending.clear();
            }
            pending.insert(id.to_owned());
        }
        if let Ok(active) = self.active.lock() {
            for (key, flag) in active.iter() {
                if id.is_empty() || key == id {
                    flag.store(true, Ordering::Relaxed);
                }
            }
        }
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    fn entry(&self) -> AppResult<keyring::Entry> {
        keyring::Entry::new("app.moshub.desktop.mogao", &self.account)
            .map_err(|_| unavailable("系统凭据存储不可用，请选择仅本次会话。"))
    }
    fn key(&self, persistent: bool) -> AppResult<String> {
        if let Some(key) = self
            .secret
            .lock()
            .map_err(|_| unavailable("密钥状态不可用。"))?
            .clone()
        {
            return Ok(key);
        }
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        if persistent {
            return self
                .entry()?
                .get_password()
                .map_err(|_| unavailable("系统凭据中没有此空间的密钥，请重新配置。"));
        }
        let _ = persistent;
        Err(unavailable("请在墨稿设置中填写 AI 连接。"))
    }
    pub fn configure(&self, data: &Value) -> AppResult<()> {
        let persistent = data["persistent"].as_bool().unwrap_or(false);
        let supplied = data["apiKey"].as_str().unwrap_or("");
        let remembered = if supplied.is_empty() && persistent {
            self.secret
                .lock()
                .map_err(|_| unavailable("密钥状态不可用。"))?
                .clone()
        } else {
            None
        };
        let key = if supplied.is_empty() {
            remembered.as_deref().unwrap_or("")
        } else {
            supplied
        };
        if data["clear"] == true {
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            match self.entry()?.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => {}
                Err(_) => return Err(unavailable("系统密钥清除失败。")),
            }
            *self
                .secret
                .lock()
                .map_err(|_| unavailable("密钥状态不可用。"))? = None;
            return Ok(());
        }
        if key.len() > 8192 || key.contains(['\r', '\n']) {
            return Err(AppError::validation("API Key 格式无效。"));
        }
        if !key.is_empty() {
            if persistent {
                #[cfg(any(target_os = "macos", target_os = "windows"))]
                self.entry()?
                    .set_password(key)
                    .map_err(|_| unavailable("密钥未保存，请改用仅本次会话。"))?;
                #[cfg(not(any(target_os = "macos", target_os = "windows")))]
                return Err(unavailable("当前系统不支持安全凭据，请选择仅本次会话。"));
            }
            *self
                .secret
                .lock()
                .map_err(|_| unavailable("密钥状态不可用。"))? = Some(key.to_owned());
        }
        Ok(())
    }
    pub fn configured(&self, persistent: bool) -> bool {
        self.key(persistent).is_ok()
    }
    pub async fn run(
        &self,
        id: &str,
        config: &Value,
        mut payload: Value,
        mut emit: impl FnMut(Value) -> AppResult<()> + Send,
    ) -> AppResult<Value> {
        crate::platform::domain::id(id)?;
        if self
            .cancelled
            .lock()
            .map_err(|_| unavailable("AI 状态不可用。"))?
            .remove(id)
        {
            return Err(AppError::new(ErrorCode::Cancelled, "已停止生成。", false));
        }
        let endpoint = endpoint(config["baseURL"].as_str().unwrap_or(""))?;
        let key = self.key(config["persistent"].as_bool().unwrap_or(false))?;
        if !payload.is_object()
            || payload.to_string().len() > 2 * 1024 * 1024
            || payload["messages"]
                .as_array()
                .is_none_or(|v| v.is_empty() || v.len() > 200)
        {
            return Err(AppError::validation("AI 上下文格式或大小无效。"));
        }
        let model = config["model"]
            .as_str()
            .filter(|s| !s.trim().is_empty() && s.len() <= 200)
            .ok_or_else(|| AppError::validation("请填写模型名称。"))?;
        let allowed = [
            "messages",
            "stream",
            "max_tokens",
            "temperature",
            "top_p",
            "response_format",
            "stream_options",
        ];
        payload
            .as_object_mut()
            .unwrap()
            .retain(|k, _| allowed.contains(&k.as_str()));
        payload["model"] = json!(model);
        payload["max_tokens"] = json!(
            payload["max_tokens"]
                .as_u64()
                .unwrap_or(4096)
                .clamp(1, 32000)
        );
        let flag = Arc::new(AtomicBool::new(false));
        {
            let mut active = self
                .active
                .lock()
                .map_err(|_| unavailable("AI 状态不可用。"))?;
            if active.len() >= 2 || active.contains_key(id) {
                return Err(unavailable("AI 请求仍在进行，请稍后重试。"));
            }
            active.insert(id.into(), flag.clone());
        }
        let result=async {
   let client=reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).connect_timeout(std::time::Duration::from_secs(15)).read_timeout(std::time::Duration::from_secs(60)).timeout(std::time::Duration::from_secs(180)).build().map_err(|_|unavailable("无法初始化 AI 连接。"))?;
   let future=async {
    let mut response=client.post(endpoint).bearer_auth(key).json(&payload).send().await.map_err(|_|unavailable("AI 连接失败，请检查网络与接口地址。"))?;
    let status=response.status();
    if !status.is_success() {return Err(unavailable(match status.as_u16(){401|403=>"AI 密钥或权限无效。",429=>"AI 请求频率或额度受限，请稍后重试。",400=>"AI 请求不被接口接受，请核对模型与参数。",_=>"AI 服务暂时不可用，请稍后重试。"}));}
    let streaming=payload["stream"]==true;
    let mut bytes=Vec::new();let mut total=0usize;let mut parser=Sse::default();
    while let Some(chunk)=response.chunk().await.map_err(|_|unavailable("AI 响应中断，已生成的候选保留。"))? {
     total+=chunk.len();if total>4*1024*1024 {return Err(unavailable("AI 输出超过 4 MiB，已停止接收。"));}
     if streaming {for value in parser.push(&chunk)? {emit(value)?;}} else {bytes.extend_from_slice(&chunk);}
    }
    if streaming {if !parser.complete {return Err(unavailable("AI 流未完整结束，请审阅已生成部分后重试。"));}Ok(Value::Null)}
    else {let value:Value=serde_json::from_slice(&bytes).map_err(|_|unavailable("AI 返回了无效数据。"))?;if !value["choices"].is_array() {return Err(unavailable("AI 返回缺少候选内容。"));}Ok(value)}
   };
   tokio::pin!(future);
   loop {tokio::select!{result=&mut future=>return result,_=tokio::time::sleep(std::time::Duration::from_millis(100))=>{if flag.load(Ordering::Relaxed) || self.cancelled.lock().is_ok_and(|v|v.contains(id)) {return Err(AppError::new(ErrorCode::Cancelled,"已停止生成，已产生的候选保留。",false));}}}}
  }.await;
        if let Ok(mut active) = self.active.lock() {
            active.remove(id);
        }
        result
    }
}
fn unavailable(message: &str) -> AppError {
    AppError::new(ErrorCode::AiUnavailable, message, false)
}
pub fn endpoint(base: &str) -> AppResult<url::Url> {
    let mut u =
        url::Url::parse(base.trim()).map_err(|_| AppError::validation("AI 接口地址无效。"))?;
    let local = u
        .host_str()
        .is_some_and(|h| h == "localhost" || h == "127.0.0.1" || h == "[::1]");
    if !(u.scheme() == "https" || (local && u.scheme() == "http"))
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
    {
        return Err(AppError::validation(
            "AI 接口须为 HTTPS；本机服务可用 HTTP，地址不得含密钥或查询参数。",
        ));
    }
    let path = format!("{}/chat/completions", u.path().trim_end_matches('/'));
    u.set_path(&path);
    Ok(u)
}
#[derive(Default)]
pub struct Sse {
    buffer: Vec<u8>,
    pub complete: bool,
}
impl Sse {
    pub fn push(&mut self, bytes: &[u8]) -> AppResult<Vec<Value>> {
        self.buffer.extend_from_slice(bytes);
        let mut values = Vec::new();
        while let Some(end) = self.buffer.iter().position(|b| *b == b'\n') {
            let line = self.buffer.drain(..=end).collect::<Vec<_>>();
            let line = std::str::from_utf8(&line)
                .map_err(|_| unavailable("AI 流编码无效。"))?
                .trim_end();
            if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if data == "[DONE]" {
                    self.complete = true;
                    continue;
                }
                if data.is_empty() {
                    continue;
                }
                let v: Value =
                    serde_json::from_str(data).map_err(|_| unavailable("AI 流数据无效。"))?;
                if v.get("error").is_some() {
                    return Err(unavailable("AI 流返回错误，已生成的候选保留。"));
                }
                if v["choices"]
                    .as_array()
                    .is_some_and(|a| a.iter().any(|v| v["finish_reason"].as_str().is_some()))
                {
                    self.complete = true;
                }
                values.push(v);
            }
        }
        if self.buffer.len() > 1024 * 1024 {
            return Err(unavailable("AI 流单条消息过大。"));
        }
        Ok(values)
    }
}
