use jarvis_neural_core::*;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::PathBuf, sync::Mutex};
use tauri::Manager;
use tokio_util::sync::CancellationToken;

pub struct NeuralState {
    memory: Mutex<Result<Memory>>,
    previews: Mutex<HashMap<String, Preview>>,
    running: Mutex<HashMap<String, CancellationToken>>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Preferences {
    pub privacy: Privacy,
    pub openai: ProviderConfig,
    pub groq: ProviderConfig,
    pub selected: Provider,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            privacy: Privacy::default(),
            openai: ProviderConfig {
                provider: Provider::Openai,
                model: String::new(),
                timeout_seconds: 45,
                retries: 0,
            },
            groq: ProviderConfig {
                provider: Provider::Groq,
                model: String::new(),
                timeout_seconds: 45,
                retries: 0,
            },
            selected: Provider::Groq,
        }
    }
}
impl Preferences {
    fn config(&self, p: Provider) -> ProviderConfig {
        match p {
            Provider::Openai => self.openai.clone(),
            Provider::Groq => self.groq.clone(),
        }
    }
}
impl NeuralState {
    pub fn new(app: &tauri::AppHandle) -> Self {
        let database = (|| {
            let directory = app
                .path()
                .app_data_dir()
                .map_err(|_| "App-Datenverzeichnis nicht verfügbar.")?;
            std::fs::create_dir_all(&directory)
                .map_err(|_| "App-Datenverzeichnis nicht beschreibbar.")?;
            Memory::open(&directory.join("neural.sqlite3"))
        })();
        Self {
            memory: Mutex::new(database),
            previews: Mutex::new(HashMap::new()),
            running: Mutex::new(HashMap::new()),
        }
    }
    fn db<T>(&self, f: impl FnOnce(&mut Memory) -> Result<T>) -> Result<T> {
        let mut guard = self.memory.lock().map_err(|_| "Datenbank gesperrt.")?;
        let memory = guard.as_mut().map_err(|e| e.clone())?;
        f(memory)
    }
    pub fn abort_all(&self) {
        if let Ok(active) = self.running.lock() {
            for token in active.values() {
                token.cancel();
            }
        }
        if let Ok(mut pending) = self.previews.lock() {
            pending.clear();
        }
    }
    pub(crate) fn prefs(&self) -> Result<Preferences> {
        self.db(|m| m.setting("preferences", Preferences::default()))
    }
    pub(crate) fn local_sources(&self,query:&str,category:Option<&str>)->Result<Vec<Source>> {
        self.memory_enabled()?;
        self.db(|m| {
            let mut result=m.search(query,20)?;
            if let Some(category)=category {
                result.retain(|s|m.connection.query_row("SELECT category FROM entries WHERE id=?1",[s.entry_id],|row|row.get::<_,String>(0)).is_ok_and(|c|c==category));
            }
            result.truncate(5);Ok(result)
        })
    }
    pub(crate) fn save_voice_note(&self,entry:Entry)->Result<i64> {
        self.memory_enabled()?; self.db(|m|m.save(&entry))
    }
    fn memory_enabled(&self) -> Result<()> {
        if self.prefs()?.privacy.memory_enabled {
            Ok(())
        } else {
            Err("Lokales Gedächtnis ist deaktiviert. Im Datenschutzbereich aktivieren.".into())
        }
    }
}
async fn local_task<T: Send + 'static>(
    app: tauri::AppHandle,
    task: impl FnOnce(&NeuralState) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || task(app.state::<NeuralState>().inner()))
        .await
        .map_err(|_| "Lokale Aufgabe unterbrochen.".to_owned())?
}
fn key(provider: Provider) -> Result<String> {
    #[cfg(windows)]
    {
        keyring::Entry::new("JARVIS.Neural.1.3", provider.name())
            .map_err(|_| "Windows Credential Manager nicht verfügbar.")?
            .get_password()
            .map_err(|_| {
                "Kein zugänglicher Schlüssel im Windows Credential Manager. Bitte neu hinzufügen."
                    .into()
            })
    }
    #[cfg(not(windows))]
    {
        let _ = provider;
        Err("Sichere Schlüsselspeicherung ist in diesem Entwicklungsstand nur unter Windows verfügbar; kein Klartext-Fallback.".into())
    }
}
pub fn has_groq_key() -> bool {
    key(Provider::Groq).is_ok()
}
#[tauri::command]
pub fn neural_status(state: tauri::State<'_, NeuralState>) -> Result<serde_json::Value> {
    let preferences = state.prefs()?;
    let stats = state.db(|m| m.stats())?;
    Ok(
        serde_json::json!({"preferences":preferences,"stats":stats,"keys":{"openai":key(Provider::Openai).is_ok(),"groq":key(Provider::Groq).is_ok()},"vault_available":cfg!(windows)}),
    )
}
#[tauri::command]
pub fn neural_settings(
    state: tauri::State<'_, NeuralState>,
    preferences: Preferences,
) -> Result<()> {
    if preferences.openai.provider != Provider::Openai
        || preferences.groq.provider != Provider::Groq
    {
        return Err("Providerkonfiguration ungültig.".into());
    }
    for config in [&preferences.openai, &preferences.groq] {
        if config.model.len() > 200
            || !(5..=120).contains(&config.timeout_seconds)
            || config.retries > 3
        {
            return Err("Timeout, Modell oder Retry-Einstellung ungültig.".into());
        }
    }
    let result = state.db(|m| m.set("preferences", &preferences));
    state.abort_all();
    result
}
#[tauri::command]
pub async fn ai_key_set(provider: Provider, secret: String) -> Result<()> {
    if secret.trim().is_empty() || secret.len() > 4096 || secret.contains(['\n', '\r']) {
        return Err("Schlüssel ungültig.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            keyring::Entry::new("JARVIS.Neural.1.3", provider.name())
                .map_err(|_| "Credential Manager nicht verfügbar.")?
                .set_password(secret.trim())
                .map_err(|_| "Schlüssel konnte nicht sicher gespeichert werden.".into())
        }
        #[cfg(not(windows))]
        {
            let _ = (provider, secret);
            Err("Kein sicherer Windows-Schlüsselspeicher auf dieser Plattform.".into())
        }
    })
    .await
    .map_err(|_| "Schlüsselspeicherung unterbrochen.".to_owned())?
}
#[tauri::command]
pub async fn ai_key_delete(state: tauri::State<'_, NeuralState>, provider: Provider) -> Result<()> {
    state.abort_all();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            match keyring::Entry::new("JARVIS.Neural.1.3", provider.name())
                .map_err(|_| "Credential Manager nicht verfügbar.")?
                .delete_credential()
            {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(_) => Err("Schlüssel konnte nicht gelöscht werden.".into()),
            }
        }
        #[cfg(not(windows))]
        {
            let _ = provider;
            Err("Windows Credential Manager ist hier nicht verfügbar.".into())
        }
    })
    .await
    .map_err(|_| "Schlüssellöschung unterbrochen.".to_owned())?
}
fn request_token(
    state: &NeuralState,
    id: Option<String>,
) -> std::result::Result<(String, CancellationToken), AiError> {
    let id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    if id.is_empty() || id.len() > 128 {
        return Err(AiError::safe("Ungültige Anfragekennung."));
    }
    let mut running = state
        .running
        .lock()
        .map_err(|_| AiError::safe("Anfragestatus gesperrt."))?;
    if running.contains_key(&id) {
        return Err(AiError::safe("Anfragekennung bereits aktiv."));
    }
    let token = CancellationToken::new();
    running.insert(id.clone(), token.clone());
    Ok((id, token))
}
#[tauri::command]
pub async fn ai_models(
    state: tauri::State<'_, NeuralState>,
    provider: Provider,
    request_id: Option<String>,
) -> std::result::Result<Vec<String>, AiError> {
    let (id, token) = request_token(state.inner(), request_id)?;
    let _guard = RunningGuard {
        state: state.inner(),
        id,
    };
    let secret = key(provider).map_err(|e| AiError::safe(&e))?;
    ProviderClient::official(provider)?
        .models(&secret, provider, &token)
        .await
}
#[tauri::command]
pub async fn ai_test(
    state: tauri::State<'_, NeuralState>,
    config: ProviderConfig,
    request_id: Option<String>,
) -> std::result::Result<serde_json::Value, AiError> {
    let (id, cancel) = request_token(state.inner(), request_id)?;
    let _guard = RunningGuard {
        state: state.inner(),
        id,
    };
    let secret = key(config.provider).map_err(|e| AiError::safe(&e))?;
    let client = ProviderClient::official(config.provider)?;
    let models = client.models(&secret, config.provider, &cancel).await?;
    if !models.contains(&config.model) {
        return Err(AiError::safe(
            "Gewähltes Modell ist nicht in der aktuellen berechtigten Modellliste enthalten.",
        ));
    }
    let preview = Preview {
        voice_tools: false,
        history: vec![],
        id: String::new(),
        primary: config.clone(),
        fallback: None,
        question: "Antworte kurz mit Bereit.".into(),
        sources: vec![],
    };
    let (_, model) = client.chat(&secret, &config, &preview, &cancel).await?;
    Ok(
        serde_json::json!({"provider":config.provider,"model":model,"message":"Modellliste und echte Textanfrage erfolgreich. Dieser Test kann API-Kosten verursachen."}),
    )
}
#[derive(Deserialize)]
pub struct Prepare {
    pub question: String,
    pub provider: Provider,
    pub use_knowledge: bool,
    pub fallback: Option<Provider>,
    #[serde(default)] pub history: Vec<ChatTurn>,
}
#[tauri::command]
pub async fn ai_prepare(app: tauri::AppHandle, request: Prepare) -> Result<serde_json::Value> {
    local_task(app, move |state| prepare_impl(state, request)).await
}
fn prepare_impl(state: &NeuralState, request: Prepare) -> Result<serde_json::Value> {
    if request.question.trim().is_empty() || request.question.chars().count() > 8000 {
        return Err("Frage muss 1 bis 8.000 Zeichen enthalten.".into());
    }
    validate_history(&request.history)?;
    let prefs = state.prefs()?;
    let primary = prefs.config(request.provider);
    primary.validate()?;
    let fallback = request.fallback.map(|p| prefs.config(p));
    if let Some(ref alternative) = fallback {
        alternative.validate()?;
        if alternative.provider == primary.provider {
            return Err("Ausweichanbieter muss verschieden sein.".into());
        }
    }
    let sources = if request.use_knowledge && prefs.privacy.memory_enabled {
        state.db(|m| m.search(&request.question, 5))?
    } else {
        vec![]
    };
    let preview = Preview {
        voice_tools: false,
        history: request.history,
        id: uuid::Uuid::new_v4().to_string(),
        primary,
        fallback,
        question: request.question.trim().into(),
        sources,
    };
    let messages = preview.messages();
    let mut pending = state.previews.lock().map_err(|_| "Vorschau gesperrt.")?;
    if pending.len() >= 20 {
        pending.clear();
    }
    pending.insert(preview.id.clone(), preview.clone());
    Ok(serde_json::json!({"preview":preview,"messages":messages}))
}
// Voice-only protocol: model can return text or propose one of the closed tools.
// Proposal parsing and a second, explicit authorization happen outside the provider.
pub(crate) fn prepare_voice(state:&NeuralState,request:Prepare)->Result<serde_json::Value> {
    let question=request.question.clone();
    let value=prepare_impl(state,request)?;
    let id=value["preview"]["id"].as_str().ok_or("Vorschaukennung fehlt.")?;
    let mut pending=state.previews.lock().map_err(|_|"Vorschau gesperrt.")?;
    let preview=pending.get_mut(id).ok_or("Vorschau fehlt.")?;
    preview.voice_tools=true;
    Ok(serde_json::json!({"preview":preview,"messages":preview.messages(),"utterance":question}))
}
struct RunningGuard<'a> {
    state: &'a NeuralState,
    id: String,
}
impl Drop for RunningGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut requests) = self.state.running.lock() {
            requests.remove(&self.id);
        }
    }
}
#[tauri::command]
pub async fn ai_send(
    state: tauri::State<'_, NeuralState>,
    request_id: String,
    document_consent: bool,
    fallback_consent: bool,
) -> std::result::Result<ChatReply, AiError> {
    send_impl(state,request_id,document_consent,fallback_consent,true).await
}
pub(crate) async fn send_voice(state:tauri::State<'_,NeuralState>,request_id:String,document_consent:bool,fallback_consent:bool)->std::result::Result<ChatReply,AiError> {
    send_impl(state,request_id,document_consent,fallback_consent,false).await
}
async fn send_impl(state:tauri::State<'_,NeuralState>,request_id:String,document_consent:bool,fallback_consent:bool,persist_allowed:bool)->std::result::Result<ChatReply,AiError> {
    let token = CancellationToken::new();
    let preview = {
        let mut pending = state
            .previews
            .lock()
            .map_err(|_| AiError::safe("Vorschau gesperrt."))?;
        let mut running = state
            .running
            .lock()
            .map_err(|_| AiError::safe("Anfragestatus gesperrt."))?;
        let preview = pending.remove(&request_id).ok_or_else(|| {
            AiError::safe("Vorschau fehlt oder wurde bereits verwendet. Neu vorbereiten.")
        })?;
        running.insert(request_id.clone(), token.clone());
        preview
    };
    let _guard = RunningGuard {
        state: state.inner(),
        id: request_id.clone(),
    };
    let prefs = state.prefs().map_err(|s| AiError::safe(&s))?;
    if preview.has_document_content()
        && (!prefs.privacy.document_cloud || !prefs.privacy.memory_enabled)
    {
        return Err(AiError::safe(
            "Cloud-Verarbeitung lokaler Inhalte ist in den Datenschutzeinstellungen gesperrt.",
        ));
    }
    preview
        .validate_consent(document_consent, fallback_consent)
        .map_err(|e| AiError::safe(&e))?;
    let primary_key = key(preview.primary.provider).map_err(|e| AiError::safe(&e))?;
    let primary = ProviderClient::official(preview.primary.provider)?;
    let fallback = if let Some(ref config) = preview.fallback {
        Some((
            ProviderClient::official(config.provider)?,
            key(config.provider).map_err(|e| AiError::safe(&e))?,
        ))
    } else {
        None
    };
    let mut result = run_authorized(
        &preview,
        document_consent,
        fallback_consent,
        &primary,
        &primary_key,
        fallback.as_ref().map(|(c, k)| (c, k.as_str())),
        &token,
    )
    .await;
    if token.is_cancelled() {
        return Err(AiError::cancelled());
    }
    if let Ok(ref mut reply) = result {
        let saved = state.db(|m| {
            if token.is_cancelled() {
                return Err("Anfrage abgebrochen.".into());
            }
            let current: Preferences = m.setting("preferences", Preferences::default())?;
            if persist_allowed && current.privacy.memory_enabled && current.privacy.persist_chats {
                m.save_chat(
                    &preview.question,
                    &reply.text,
                    reply.provider.name(),
                    &reply.model,
                )?;
            }
            Ok(())
        });
        if saved.is_err() {
            reply.storage_warning=Some("Antwort empfangen, aber der lokale Speicherstatus konnte nicht bestätigt werden. Datenbank prüfen.".into());
        }
    }
    if token.is_cancelled() {
        return Err(AiError::cancelled());
    }
    result
}
#[tauri::command]
pub fn ai_cancel(state: tauri::State<'_, NeuralState>, request_id: String) {
    if let Ok(mut pending) = state.previews.lock() {
        pending.remove(&request_id);
    }
    if let Ok(active) = state.running.lock() {
        if let Some(token) = active.get(&request_id) {
            token.cancel();
        }
    }
}
pub async fn legacy_groq(state: &NeuralState, message: String) -> Result<String> {
    if message.trim().is_empty() || message.chars().count() > 8000 {
        return Err("Nachricht muss 1 bis 8.000 Zeichen enthalten.".into());
    }
    let config = state.prefs()?.groq;
    config.validate()?;
    let secret = key(Provider::Groq)?;
    let preview = Preview {
        voice_tools: false,
        history: vec![],
        id: String::new(),
        primary: config.clone(),
        fallback: None,
        question: message,
        sources: vec![],
    };
    ProviderClient::official(Provider::Groq)
        .map_err(|e| e.message)?
        .chat(&secret, &config, &preview, &CancellationToken::new())
        .await
        .map(|r| r.0)
        .map_err(|e| e.message)
}
#[tauri::command]
pub async fn memory_list(app: tauri::AppHandle, query: String) -> Result<Vec<Entry>> {
    local_task(app, move |state| {
        state.memory_enabled()?;
        state.db(|m| m.list(&query))
    })
    .await
}
#[tauri::command]
pub async fn memory_save(app: tauri::AppHandle, entry: Entry) -> Result<i64> {
    local_task(app, move |state| {
        state.memory_enabled()?;
        state.db(|m| m.save(&entry))
    })
    .await
}
#[tauri::command]
pub async fn memory_delete(app: tauri::AppHandle, id: i64) -> Result<()> {
    local_task(app, move |state| {
        state.abort_all();
        state.db(|m| m.delete(id))
    })
    .await
}
#[tauri::command]
pub async fn memory_clear(app: tauri::AppHandle, confirmation: String) -> Result<()> {
    local_task(app, move |state| {
        state.abort_all();
        state.db(|m| m.clear(&confirmation))
    })
    .await
}
#[tauri::command]
pub async fn memory_export(app: tauri::AppHandle) -> Result<String> {
    local_task(app, move |state| state.db(|m| m.export())).await
}
#[tauri::command]
pub async fn memory_import(app: tauri::AppHandle, json: String) -> Result<usize> {
    local_task(app, move |state| {
        state.memory_enabled()?;
        state.db(|m| m.import(&json))
    })
    .await
}
#[tauri::command]
pub async fn memory_chats(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>> {
    local_task(app, move |state| state.db(|m| m.chats())).await
}
#[tauri::command]
pub async fn document_import(
    app: tauri::AppHandle,
    name: String,
    bytes: Vec<u8>,
    category: String,
    metadata: std::collections::BTreeMap<String, String>,
) -> Result<i64> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<NeuralState>();
        state.memory_enabled()?;
        let safe_name = PathBuf::from(&name)
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or("Dateiname ungültig.")?
            .to_owned();
        let body = extract(&safe_name, &bytes)?;
        state.db(|m| {
            m.save(&Entry {
                id: 0,
                title: safe_name.clone(),
                source: safe_name,
                body,
                category,
                metadata,
                updated: String::new(),
            })
        })
    })
    .await
    .map_err(|_| "Dokumentimport unterbrochen.".to_owned())?
}

#[cfg(all(test, windows))]
mod credential_tests {
    #[test]
    #[ignore = "Erfordert echten Windows Credential Manager; isolierter Testeintrag, keine echten API-Schlüssel"]
    fn credential_roundtrip_replace_and_delete() {
        let account = uuid::Uuid::new_v4().to_string();
        let entry = keyring::Entry::new("JARVIS.Neural.Test", &account).unwrap();
        struct Cleanup<'a>(&'a keyring::Entry);
        impl Drop for Cleanup<'_> {
            fn drop(&mut self) {
                let _ = self.0.delete_credential();
            }
        }
        let _cleanup = Cleanup(&entry);
        entry.set_password("DUMMY_TEST_VALUE_A").unwrap();
        assert_eq!(entry.get_password().unwrap(), "DUMMY_TEST_VALUE_A");
        entry.set_password("DUMMY_TEST_VALUE_B").unwrap();
        assert_eq!(entry.get_password().unwrap(), "DUMMY_TEST_VALUE_B");
        entry.delete_credential().unwrap();
        assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
    }
}
