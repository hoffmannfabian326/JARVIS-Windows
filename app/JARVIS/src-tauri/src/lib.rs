mod neural;
mod voice;
mod voice_preferences;
mod audio_devices;
mod assistant;
use serde::Serialize;
use std::{sync::Mutex, time::Instant};
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
use tauri::Manager;

struct MetricsSampler {
    system: System,
    last_cpu_sample: Instant,
    cpu_percent: Option<f32>,
}
struct MetricsState(Mutex<MetricsSampler>);

#[derive(Serialize)]
struct SystemMetrics {
    cpu_percent: Option<f32>,
    ram_used_gb: Option<f64>,
    ram_total_gb: Option<f64>,
    gpu_percent: Option<f32>,
    cpu_temp_c: Option<f32>,
    gpu_temp_c: Option<f32>,
    os_name: String,
    cpu_name: String,
}

#[derive(Serialize)]
struct AiStatus { ready: bool, provider: &'static str }

#[tauri::command]
fn get_ai_status() -> AiStatus { AiStatus { ready: neural::has_groq_key(), provider: "Groq" } }

#[tauri::command]
fn get_system_metrics(state: tauri::State<'_, MetricsState>) -> Result<SystemMetrics, String> {
    let mut sampler = state.0.lock().map_err(|_| "Systemmonitor nicht verfügbar".to_string())?;
    // CPU usage is a delta between two samples. Never expose the warm-up value.
    if sampler.last_cpu_sample.elapsed() >= sysinfo::MINIMUM_CPU_UPDATE_INTERVAL {
        sampler.system.refresh_cpu_usage();
        sampler.cpu_percent = if sampler.system.cpus().is_empty() { None } else {
            let value = sampler.system.global_cpu_usage();
            (value.is_finite() && (0.0..=100.0).contains(&value)).then_some(value)
        };
        sampler.last_cpu_sample = Instant::now();
    }
    let cpu_percent = sampler.cpu_percent;
    let sys = &mut sampler.system;
    sys.refresh_memory();
    let total = sys.total_memory();
    let (ram_used_gb, ram_total_gb) = if total == 0 { (None, None) } else {
        (Some(sys.used_memory() as f64 / 1_073_741_824.0), Some(total as f64 / 1_073_741_824.0))
    };
    Ok(SystemMetrics {
        cpu_percent, ram_used_gb, ram_total_gb,
        // No hardware provider is integrated for these values: never invent readings.
        gpu_percent: None, cpu_temp_c: None, gpu_temp_c: None,
        os_name: System::long_os_version().unwrap_or_else(|| "Nicht verfügbar".into()),
        cpu_name: sys.cpus().first().map(|cpu| cpu.brand().to_string()).unwrap_or_else(|| "Nicht verfügbar".into()),
    })
}

#[tauri::command]
async fn chat_with_groq(state: tauri::State<'_, neural::NeuralState>, message: String) -> Result<String, String> {
    neural::legacy_groq(state.inner(), message).await
}

pub fn run() {
    tauri::Builder::default()
        .manage(voice::VoiceState::default())
        .manage(assistant::AssistantState::default())
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::Focused(false) => {let _=window.state::<voice::VoiceState>().cancel(None, true);},
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => { window.state::<voice::VoiceState>().shutdown(); if let Some(state)=window.try_state::<neural::NeuralState>(){state.abort_all();} },
                _ => {},
            }
        })
        .setup(|app| {
            app.manage(neural::NeuralState::new(app.handle()));
            let sys = System::new_with_specifics(RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::everything()));
            app.manage(MetricsState(Mutex::new(MetricsSampler {
                system: sys, last_cpu_sample: Instant::now(), cpu_percent: None,
            })));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_system_metrics, get_ai_status, chat_with_groq, audio_devices::voice_devices, assistant::assistant_plan, assistant::assistant_run, assistant::assistant_cancel, assistant::assistant_model_response, assistant::assistant_cloud_prepare, assistant::assistant_cloud_send, assistant::get_dashboard_details, voice::voice_capabilities, voice::voice_selection_get, voice::voice_selection_set, voice::voice_permission, voice::voice_start, voice::voice_snapshot, voice::voice_finish, voice::voice_cancel, neural::neural_status, neural::neural_settings, neural::ai_key_set, neural::ai_key_delete, neural::ai_models, neural::ai_test, neural::ai_prepare, neural::ai_send, neural::ai_cancel, neural::memory_list, neural::memory_save, neural::memory_delete, neural::memory_clear, neural::memory_export, neural::memory_import, neural::memory_chats, neural::document_import])
        .run(tauri::generate_context!())
        .expect("J.A.R.V.I.S. konnte nicht gestartet werden");
}
