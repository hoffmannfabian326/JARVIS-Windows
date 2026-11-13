use crate::neural::{self, NeuralState, Prepare};
use jarvis_neural_core::intent::{self, Action, Metric, ModelResponse, PlanBook};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::Manager;
#[derive(Default)]
pub struct AssistantState {
    plans: Mutex<PlanBook>,
    cloud: Mutex<HashMap<String, Instant>>,
}
#[derive(Serialize)]
pub struct Plan {
    id: String,
    action: Action,
    summary: String,
    confirmation: bool,
    origin: &'static str,
}
fn plan(state: &AssistantState, action: Action, model: bool) -> Result<Plan, String> {
    action.validate()?;
    let id = uuid::Uuid::new_v4().to_string();
    let result = Plan {
        id: id.clone(),
        summary: action.summary(),
        confirmation: action.confirmation() || model,
        origin: if model { "model" } else { "local" },
        action: action.clone(),
    };
    state
        .plans
        .lock()
        .map_err(|_| "Aktionsstatus gesperrt.")?
        .insert(id, action, model, Instant::now());
    Ok(result)
}
#[tauri::command]
pub fn assistant_plan(
    state: tauri::State<'_, AssistantState>,
    utterance: String,
    volume: u8,
) -> Result<Plan, String> {
    if volume > 100 {
        return Err("Lautstärke ungültig.".into());
    }
    plan(&state, intent::route(&utterance, volume)?, false)
}
#[tauri::command]
pub fn assistant_cancel(state: tauri::State<'_, AssistantState>) {
    if let Ok(mut plans) = state.plans.lock() {
        plans.clear();
    }
    if let Ok(mut cloud) = state.cloud.lock() {
        cloud.clear();
    }
}
#[tauri::command]
pub fn assistant_model_response(
    state: tauri::State<'_, AssistantState>,
    text: String,
) -> Result<serde_json::Value, String> {
    if text.chars().count() > 16000 {
        return Err("KI-Antwort zu lang.".into());
    }
    // Plain prose remains inert data. Structured proposals must match the closed schema.
    if !text.trim_start().starts_with('{') && !text.trim_start().starts_with("```") {
        return Ok(serde_json::json!({"text":text,"plan":null}));
    }
    match intent::model_response(&text)? {
        ModelResponse::Answer { text } => Ok(serde_json::json!({"text":text,"plan":null})),
        ModelResponse::Tool { action } => Ok(
            serde_json::json!({"text":"Die KI schlägt eine erlaubte Aktion vor. Bitte separat bestätigen.","plan":plan(&state,action,true)?}),
        ),
    }
}
#[derive(Serialize)]
pub struct DashboardDetails {
    disks: Vec<DiskInfo>,
    networks: Vec<NetworkInfo>,
}
#[derive(Serialize)]
struct DiskInfo {
    name: String,
    total_bytes: u64,
    available_bytes: u64,
}
#[derive(Serialize)]
struct NetworkInfo {
    name: String,
    received_bytes: u64,
    transmitted_bytes: u64,
}
#[tauri::command]
pub async fn get_dashboard_details() -> Result<DashboardDetails, String> {
    tauri::async_runtime::spawn_blocking(collect_details)
        .await
        .map_err(|_| "Systemdetails unterbrochen.".into())
}
fn collect_details() -> DashboardDetails {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let networks = sysinfo::Networks::new_with_refreshed_list();
    DashboardDetails {
        disks: disks
            .list()
            .iter()
            .map(|d| DiskInfo {
                name: d.mount_point().to_string_lossy().into_owned(),
                total_bytes: d.total_space(),
                available_bytes: d.available_space(),
            })
            .collect(),
        networks: networks
            .iter()
            .map(|(name, data)| NetworkInfo {
                name: name.clone(),
                received_bytes: data.total_received(),
                transmitted_bytes: data.total_transmitted(),
            })
            .collect(),
    }
}
fn percent(value: Option<f32>) -> String {
    value
        .filter(|v| v.is_finite())
        .map(|v| format!("{v:.1} Prozent").replace('.', ","))
        .unwrap_or_else(|| "Nicht verfügbar".into())
}
fn temperature(value: Option<f32>) -> String {
    value
        .filter(|v| v.is_finite())
        .map(|v| format!("{v:.1} Grad Celsius").replace('.', ","))
        .unwrap_or_else(|| "Nicht verfügbar".into())
}
#[tauri::command]
pub async fn assistant_run(
    app: tauri::AppHandle,
    plan_id: String,
    confirmed: bool,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_impl(
            app.state::<AssistantState>(),
            app.state::<NeuralState>(),
            app.state::<crate::MetricsState>(),
            plan_id,
            confirmed,
        )
    })
    .await
    .map_err(|_| "Lokale Aktion unterbrochen.".to_owned())?
}
fn run_impl(
    state: tauri::State<'_, AssistantState>,
    neural: tauri::State<'_, NeuralState>,
    metrics: tauri::State<'_, crate::MetricsState>,
    plan_id: String,
    confirmed: bool,
) -> Result<serde_json::Value, String> {
    let action = state
        .plans
        .lock()
        .map_err(|_| "Aktionsstatus gesperrt.")?
        .take(&plan_id, confirmed, Instant::now())?;
    let mut sources = vec![];
    let text=match &action {
        Action::Hardware{metric}=>{
            let m=crate::get_system_metrics(metrics)?;
            match metric {
                Metric::Cpu=>format!("Die CPU-Auslastung beträgt: {}.",percent(m.cpu_percent)),
                Metric::Gpu=>format!("GPU-Auslastung: {}.",percent(m.gpu_percent)),
                Metric::Ram=>match (m.ram_used_gb,m.ram_total_gb) { (Some(used),Some(total))=>format!("Arbeitsspeicher: {used:.1} von {total:.1} Gibibyte belegt.").replace('.',","),_=>"Arbeitsspeicher: Nicht verfügbar.".into()},
                Metric::Temperatures=>format!("CPU-Temperatur: {}. GPU-Temperatur: {}.",temperature(m.cpu_temp_c),temperature(m.gpu_temp_c)),
                Metric::Storage=>{let d=collect_details();if d.disks.is_empty(){"Laufwerke: Nicht verfügbar.".into()}else{d.disks.iter().map(|d|format!("{}: {:.1} GiB von {:.1} GiB frei.",d.name,d.available_bytes as f64/1073741824.,d.total_bytes as f64/1073741824.)).collect::<Vec<_>>().join(" ")}},
                Metric::Network=>{let d=collect_details();if d.networks.is_empty(){"Netzwerkdaten: Nicht verfügbar.".into()}else{format!("{} lokale Netzwerkschnittstellen gefunden. Dies bestätigt keine Internetverbindung.",d.networks.len())}},
                Metric::All=>format!("CPU: {}. GPU: {}. CPU-Temperatur: {}. Betriebssystem: {}.",percent(m.cpu_percent),percent(m.gpu_percent),temperature(m.cpu_temp_c),m.os_name),
            }
        },
        Action::ProviderStatus=>{let p=neural.prefs()?;let c=match p.selected {jarvis_neural_core::Provider::Openai=>p.openai,jarvis_neural_core::Provider::Groq=>p.groq};format!("Gewählter Anbieter: {}. Modell: {}. Die Auswahl bestätigt keine Online-Verbindung.",c.provider.name(),if c.model.is_empty(){"Nicht ausgewählt"}else{&c.model})},
        Action::SearchKnowledge{query,category}=>{sources=neural.local_sources(query,category.as_deref())?;if sources.is_empty(){"Keine passenden lokalen Quellen gefunden.".into()}else{sources.iter().take(3).map(|s|format!("Quelle {}: {}. {}",s.label,s.title,s.text.chars().take(650).collect::<String>())).collect::<Vec<_>>().join(" ")}},
        Action::Remember{text}=>{neural.save_voice_note(intent::confirmed_note(text)?)?;"Die bestätigte Erinnerung wurde lokal gespeichert.".into()},
        Action::WebSearch=>"Aktuelle Webrecherche ist nicht angebunden. Ich erfinde keine aktuellen Nachrichten oder Internetquellen.".into(),
        _=>action.summary(),
    };
    Ok(serde_json::json!({"text":text,"action":action,"sources":sources,"origin":"local"}))
}
#[tauri::command]
pub fn assistant_cloud_prepare(
    state: tauri::State<'_, AssistantState>,
    neural: tauri::State<'_, NeuralState>,
    plan_id: String,
    provider: jarvis_neural_core::Provider,
    use_knowledge: bool,
    fallback: Option<jarvis_neural_core::Provider>,
) -> Result<serde_json::Value, String> {
    let question = state
        .plans
        .lock()
        .map_err(|_| "Aktionsstatus gesperrt.")?
        .preview_question(&plan_id, Instant::now())?;
    let preview = neural::prepare_voice(
        &neural,
        Prepare {
            history: vec![],
            question,
            provider,
            use_knowledge,
            fallback,
        },
    )?;
    let id = preview["preview"]["id"]
        .as_str()
        .ok_or("Vorschaukennung fehlt.")?
        .to_owned();
    let mut pending = state.cloud.lock().map_err(|_| "Freigabestatus gesperrt.")?;
    pending.clear();
    pending.insert(id, Instant::now());
    Ok(preview)
}
#[tauri::command]
pub async fn assistant_cloud_send(
    state: tauri::State<'_, AssistantState>,
    neural: tauri::State<'_, NeuralState>,
    request_id: String,
    confirmed: bool,
    document_consent: bool,
    fallback_consent: bool,
) -> std::result::Result<jarvis_neural_core::ChatReply, jarvis_neural_core::AiError> {
    let created = state
        .cloud
        .lock()
        .map_err(|_| jarvis_neural_core::AiError::safe("Freigabestatus gesperrt."))?
        .remove(&request_id)
        .ok_or_else(|| jarvis_neural_core::AiError::safe("Keine offene Sprachfreigabe."))?;
    if !confirmed || created.elapsed() > Duration::from_secs(120) {
        return Err(jarvis_neural_core::AiError::safe(
            "Explizite Cloud-Freigabe fehlt oder ist abgelaufen.",
        ));
    }
    neural::send_voice(neural, request_id, document_consent, fallback_consent).await
}
