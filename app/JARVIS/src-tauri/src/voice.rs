use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::path::PathBuf;
use std::{
    io::{BufRead, BufReader, Read, Write},
    process::{Child, Command, Stdio},
    sync::{
        mpsc::{self, Sender},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
#[cfg(windows)]
use tauri::path::BaseDirectory;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Voice {
    pub id: String,
    pub name: String,
    pub gender: String,
    pub culture: String,
    #[serde(default="enabled_default")]
    pub enabled: bool,
}
fn enabled_default()->bool {true}
#[derive(Debug, Serialize, Deserialize)]
pub struct Capabilities {
    pub available: bool,
    pub voices: Vec<Voice>,
    pub recognition: bool,
    pub note: String,
    #[serde(default)] pub tts_error: Option<String>,
    #[serde(default)] pub tts_code: Option<String>,
    #[serde(default)] pub tts_hresult: Option<String>,
    #[serde(default)] pub host_architecture: Option<String>,
    #[serde(default)] pub protocol_version: Option<u32>,
}
#[derive(Clone, Serialize)]
pub struct Snapshot {
    pub session_id: String,
    pub mode: String,
    pub state: String,
    pub level: Option<u8>,
    pub transcript: String,
    pub error: Option<String>,
    pub activated: bool,
}
impl Snapshot {
    fn terminal(&self) -> bool {
        matches!(self.state.as_str(), "complete" | "cancelled" | "error")
    }
}
struct Session {
    child: Option<Child>,
    control: Option<Sender<()>>,
    snapshot: Snapshot,
    started: Instant,
    exit_seen: Option<Instant>,
}
#[derive(Default)]
struct Inner {
    permission: bool,
    next: u64,
    epoch: u64,
    session: Option<Session>,
}
#[derive(Default, Clone)]
pub struct VoiceState(Arc<Mutex<Inner>>, Arc<Mutex<()>>);
fn kill(session: &mut Session) -> Result<(),String> {
    session.control.take();
    if let Some(child)=session.child.as_mut() {
        if !matches!(child.try_wait(),Ok(Some(_))) {
            if child.kill().is_err() && !matches!(child.try_wait(),Ok(Some(_))) {
                return Err("Beenden des Sprachhosts nicht bestätigt. Mikrofonstatus ist unbestätigt.".into());
            }
        }
        let deadline=Instant::now()+Duration::from_secs(2);
        loop {
            match child.try_wait() {
                Ok(Some(_))=>break,
                Ok(None) if Instant::now()<deadline=>std::thread::sleep(Duration::from_millis(10)),
                _=>return Err("Ende des Sprachhosts nicht bestätigt. Mikrofonstatus ist unbestätigt.".into()),
            }
        }
    }
    session.child.take(); session.snapshot.level=None; Ok(())
}
impl VoiceState {
    pub fn shutdown(&self) {
        if let Ok(mut inner)=self.0.lock(){inner.permission=false;}
        let _=self.cancel(None,false);
    }
    pub fn cancel(&self,id:Option<&str>,only_recording:bool)->Result<(),String> {
        let mut inner=self.0.lock().map_err(|_|"Sprachzustand gesperrt.")?;
        if id.is_some_and(|id|inner.session.as_ref().is_none_or(|s|s.snapshot.session_id!=id)){return Ok(());}
        if only_recording&&inner.session.as_ref().is_some_and(|s|s.snapshot.mode=="speak"&&!s.snapshot.terminal()){return Ok(());}
        inner.epoch=inner.epoch.wrapping_add(1);
        if let Some(session)=inner.session.as_mut() {
            if only_recording&&!matches!(session.snapshot.mode.as_str(),"listen"|"wake"){return Ok(());}
            kill(session)?;session.snapshot.state="cancelled".into();session.snapshot.transcript.clear();
        }
        Ok(())
    }
}
fn helper(app: &tauri::AppHandle) -> Result<Command, String> {
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("Die lokale Sprachengine benötigt Windows 10/11 mit Windows PowerShell 5.1 und System.Speech.".into())
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let base = std::env::var_os("SystemRoot").ok_or("Windows-Systemverzeichnis fehlt.")?;
        let executable = PathBuf::from(base).join("System32/WindowsPowerShell/v1.0/powershell.exe");
        let script = app
            .path()
            .resolve("voice/launch.ps1", BaseDirectory::Resource)
            .map_err(|_| "Sprachressourcen fehlen.")?;
        let source = app
            .path()
            .resolve("voice/VoiceHost.cs", BaseDirectory::Resource)
            .map_err(|_| "Sprachressourcen fehlen.")?;
        if !script.is_file() || !source.is_file() {
            return Err("Lokale Sprachressourcen fehlen. Ressourcenpaket prüfen.".into());
        }
        let mut command = Command::new(executable);
        command
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(script)
            .arg("-Source")
            .arg(source);
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW; no shell or user text in arguments.
        Ok(command)
    }
}
fn launch(
    app: &tauri::AppHandle,
    request: &serde_json::Value,
) -> Result<(Child, Sender<()>), String> {
    launch_command(helper(app)?,request)
}
fn launch_command(mut command:Command,request:&serde_json::Value)->Result<(Child,Sender<()>),String> {
    command
        .env_remove("GROQ_API_KEY_1")
        .env_remove("GROQ_API_KEY_2")
        .env_remove("GROQ_MODEL");
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Lokaler Sprachhost konnte nicht gestartet werden.")?;
    let Some(mut input) = child.stdin.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Sprachkanal fehlt.".into());
    };
    let payload = request.to_string();
    let (sender, receiver) = mpsc::channel();
    // Never block the state mutex or watchdog on a full child stdin pipe.
    std::thread::spawn(move || {
        if writeln!(input, "{payload}")
            .and_then(|_| input.flush())
            .is_err()
        {
            return;
        }
        if receiver.recv().is_ok() {
            let _ = writeln!(input, "finish").and_then(|_| input.flush());
        }
    });
    Ok((child, sender))
}
fn parse_capabilities(output:&str)->Result<Capabilities,String> {
    for line in output.lines() {
        if let Ok(value)=serde_json::from_str::<serde_json::Value>(line) {
            if value["type"]=="capabilities" {
                let result:Capabilities=serde_json::from_value(value).map_err(|_|"Ungültiges Stimmenprotokoll vom Windows-Sprachhost.")?;
                if !result.available {return Err("Windows-Sprachengine ist nicht verfügbar. Dies ist keine leere Stimmenliste.".into());}
                if result.voices.len()>512 || result.voices.iter().any(|v|v.id.is_empty()||v.id.len()>512||v.culture.len()>32){return Err("Ungültiges Stimmenprotokoll vom Windows-Sprachhost.".into());}
                return Ok(result);
            }
            if value["type"]=="error" {return Err("Windows-Sprachhost meldet einen Initialisierungsfehler. Stimmen erneut suchen und Sprachdiagnose prüfen.".into());}
        }
    }
    Err("Windows-Sprachhost lieferte keine gültige Stimmenantwort. Dies bedeutet nicht, dass keine Stimmen installiert sind.".into())
}
fn probe_command(command:Command,timeout:Duration)->Result<Capabilities,String> {
    let (mut child,control)=launch_command(command,&serde_json::json!({"mode":"probe"}))?;
    drop(control); // Probe has no finish command: close stdin after the initial request.
    let stdout=child.stdout.take().ok_or("Sprachhost-Ausgabekanal fehlt.")?;
    let reader=std::thread::spawn(move||{let mut output=String::new();stdout.take(65537).read_to_string(&mut output).map(|_|output)});
    let deadline=Instant::now()+timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status))=>{if !status.success(){let _=reader.join();return Err("Windows-Sprachhost wurde mit einem Fehler beendet.".into());}break;},
            Ok(None) if Instant::now()<deadline=>std::thread::sleep(Duration::from_millis(50)),
            _=>{let _=child.kill();let _=child.wait();let _=reader.join();return Err("Stimmenprüfung hat das Zeitlimit erreicht. Bitte erneut suchen; dies ist keine leere Stimmenliste.".into());}
        }
    }
    let output=reader.join().map_err(|_|"Stimmenübertragung unterbrochen.")?.map_err(|_|"Stimmenantwort ist nicht gültiges UTF-8.")?;
    if output.len()>65536{return Err("Stimmenantwort überschreitet die zulässige Größe.".into());}
    parse_capabilities(&output)
}
fn log_probe(app:&tauri::AppHandle,result:&Result<Capabilities,String>) {
    // Fixed diagnostic codes/counts only. Never exception messages, paths, voice names or text.
    if let Ok(directory)=app.path().app_data_dir() {
        let _=std::fs::create_dir_all(&directory);let path=directory.join("voice-diagnostics.log");
        let (code,count,architecture,hresult)=match result {
            Ok(c)=>(if c.tts_error.is_some(){"VOICE_ENUMERATION_FAILED"}else{"VOICE_PROBE_OK"},Some(c.voices.len()),c.host_architecture.as_deref().filter(|s|matches!(*s,"x64"|"x86")),c.tts_hresult.as_deref().filter(|s|s.len()==8&&s.chars().all(|c|c.is_ascii_hexdigit()))),
            Err(message)=>(if message.contains("Zeitlimit"){"VOICE_PROBE_TIMEOUT"}else if message.contains("Ressourcen"){"VOICE_RESOURCE_MISSING"}else if message.contains("Protokoll")||message.contains("UTF-8")||message.contains("Stimmenantwort"){"VOICE_PROTOCOL_FAILED"}else if message.contains("Initialisierungsfehler"){"VOICE_HOST_INITIALIZATION_FAILED"}else{"VOICE_PROBE_FAILED"},None,None,None),
        };
        let value=serde_json::json!({"time_unix":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|t|t.as_secs()).unwrap_or(0),"code":code,"voice_count":count,"architecture":architecture,"hresult":hresult});
        use std::fs::OpenOptions;
        let oversized=std::fs::metadata(&path).is_ok_and(|m|m.len()>65536);
        if let Ok(mut file)=OpenOptions::new().create(true).write(true).append(!oversized).truncate(oversized).open(path){let _=writeln!(file,"{value}");}
    }
}
#[tauri::command]
pub async fn voice_capabilities(app:tauri::AppHandle)->Result<Capabilities,String> {
    tauri::async_runtime::spawn_blocking(move||{
        let result=helper(&app).and_then(|command|probe_command(command,Duration::from_secs(30)));
        log_probe(&app,&result);result
    }).await.map_err(|_|"Stimmenprüfung unterbrochen.".to_owned())?
}
#[tauri::command]
pub fn voice_selection_get(app:tauri::AppHandle)->Result<Option<String>,String> {
    crate::voice_preferences::load(&app.path().app_data_dir().map_err(|_|"App-Datenverzeichnis nicht verfügbar.")?)
}
#[tauri::command]
pub fn voice_selection_set(app:tauri::AppHandle,state:tauri::State<'_,VoiceState>,voice_id:String)->Result<(),String> {
    let _guard=state.1.lock().map_err(|_|"Stimmenauswahl ist gesperrt.")?;
    crate::voice_preferences::save(&app.path().app_data_dir().map_err(|_|"App-Datenverzeichnis nicht verfügbar.")?,voice_id)
}
#[tauri::command]
pub fn voice_permission(state: tauri::State<'_, VoiceState>, allowed: bool) -> Result<(), String> {
    let mut inner = state.0.lock().map_err(|_| "Sprachzustand gesperrt.")?;
    inner.permission = allowed;
    if !allowed {
        inner.epoch=inner.epoch.wrapping_add(1);
        if let Some(session) = inner
            .session
            .as_mut()
            .filter(|s| matches!(s.snapshot.mode.as_str(), "listen" | "wake"))
        {
            kill(session)?;
            session.snapshot.state = "cancelled".into();
            session.snapshot.transcript.clear();
        }
    }
    Ok(())
}
#[derive(Deserialize)]
pub struct StartRequest {
    mode: String,
    voice: Option<String>,
    text: Option<String>,
    volume: Option<u8>,
    rate: Option<i8>,
    device_id: Option<String>,
    confidence: Option<f32>,
    silence_ms: Option<u32>,
}
#[tauri::command]
pub async fn voice_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, VoiceState>,
    request: StartRequest,
) -> Result<Snapshot, String> {
    let shared = state.inner().clone();
    let epoch=state.0.lock().map_err(|_|"Sprachzustand gesperrt.")?.epoch;
    tauri::async_runtime::spawn_blocking(move || start_session(app, shared, request, epoch))
        .await
        .map_err(|_| "Sprachstart unterbrochen.".to_owned())?
}
fn start_session(
    app: tauri::AppHandle,
    state: VoiceState,
    request: StartRequest,
    epoch: u64,
) -> Result<Snapshot, String> {
    if !matches!(request.mode.as_str(), "listen" | "speak" | "wake") {
        return Err("Ungültiger Sprachmodus.".into());
    }
    if request.device_id.as_ref().is_some_and(|v| v.len()>200)
        || request.confidence.is_some_and(|v| !v.is_finite() || !(0.5..=0.95).contains(&v))
        || request.silence_ms.is_some_and(|v| !(800..=3000).contains(&v)) {
        return Err("Mikrofon- oder Erkennungseinstellung ungültig.".into());
    }
    if request.mode == "speak"
        && (request
            .voice
            .as_ref()
            .is_none_or(|v| v.is_empty() || v.len() > 256)
            || request
                .text
                .as_ref()
                .is_none_or(|v| v.trim().is_empty() || v.chars().count() > 16000)
            || request.volume.is_none_or(|v| v > 100)
            || request.rate.is_none_or(|v| !(-10..=10).contains(&v)))
    {
        return Err("Stimme, Text, Lautstärke oder Sprechgeschwindigkeit ungültig.".into());
    }
    #[cfg(windows)]
    if matches!(request.mode.as_str(), "listen" | "wake")
        && !app
            .get_webview_window("main")
            .and_then(|w| w.is_focused().ok())
            .unwrap_or(false)
    {
        return Err("Aufnahme nur im aktiven App-Fenster erlaubt.".into());
    }
    let mut inner = state.0.lock().map_err(|_| "Sprachzustand gesperrt.")?;
    if inner.epoch!=epoch {return Err("Sprachstart wurde bereits abgebrochen.".into());}
    if matches!(request.mode.as_str(), "listen" | "wake") && !inner.permission {
        return Err("Bitte das Mikrofon ausdrücklich für diese Sitzung freigeben.".into());
    }
    if inner
        .session
        .as_ref()
        .is_some_and(|s| !s.snapshot.terminal())
    {
        return Err("Eine Sprachaktion läuft bereits. Zuerst stoppen.".into());
    }
    if let Some(old) = inner.session.as_mut() {
        kill(old)?;
    }
    let payload = serde_json::json!({ "mode":request.mode, "voice":request.voice, "text":request.text, "volume":request.volume, "rate":request.rate, "device_id":request.device_id, "confidence":request.confidence, "silence_ms":request.silence_ms });
    let (mut child, control) = launch(&app, &payload)?;
    let stdout = child.stdout.take().ok_or("Sprachausgabe-Kanal fehlt.")?;
    inner.next += 1;
    let id = inner.next.to_string();
    let snapshot = Snapshot {
        session_id: id.clone(),
        mode: request.mode,
        state: "starting".into(),
        level: None,
        transcript: String::new(),
        error: None,
        activated: false,
    };
    inner.session = Some(Session {
        child: Some(child),
        control: Some(control),
        snapshot: snapshot.clone(),
        started: Instant::now(),
        exit_seen: None,
    });
    drop(inner);
    let shared = state.clone();
    let reader_id = id.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
                continue;
            };
            let Ok(mut inner) = shared.0.lock() else {
                break;
            };
            let Some(session) = inner.session.as_mut() else {
                break;
            };
            if session.snapshot.session_id != reader_id || session.snapshot.terminal() {
                break;
            }
            match value["type"].as_str() {
                Some("level") if matches!(session.snapshot.state.as_str(), "listening" | "armed" | "activated") => {
                    session.snapshot.level = value["level"]
                        .as_u64()
                        .filter(|v| *v <= 100)
                        .map(|v| v as u8);
                }
                Some("listening")
                    if matches!(session.snapshot.mode.as_str(), "listen" | "wake")
                        && matches!(session.snapshot.state.as_str(), "starting" | "activated") =>
                {
                    session.snapshot.state = "listening".into()
                }
                Some("speaking") if session.snapshot.mode == "speak" => {
                    session.snapshot.state = "speaking".into()
                }
                Some("armed") if session.snapshot.mode == "wake" => {session.snapshot.state="armed".into();}
                Some("activated") if session.snapshot.mode == "wake" => {session.snapshot.state="activated".into();session.snapshot.activated=true;}
                Some("complete") => {
                    session.snapshot.state = "complete".into();
                    session.snapshot.level = None;
                    session.snapshot.transcript = value["transcript"]
                        .as_str()
                        .unwrap_or("")
                        .chars()
                        .take(8000)
                        .collect();
                }
                Some("error") => {
                    session.snapshot.state = "error".into();
                    session.snapshot.level = None;
                    session.snapshot.error = Some(
                        value["error"]
                            .as_str()
                            .unwrap_or("Lokale Sprachaktion fehlgeschlagen.")
                            .to_owned(),
                    );
                }
                _ => {}
            }
        }
    });
    let shared = state.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(100));
        let Ok(mut inner) = shared.0.lock() else {
            return;
        };
        let Some(session) = inner.session.as_mut() else {
            return;
        };
        if session.snapshot.session_id != id {
            return;
        }
        if session.snapshot.terminal() {
            if kill(session).is_ok(){return;}
            session.snapshot.error=Some("Mikrofon-Abbruch nicht bestätigt. Sprachhost wird erneut beendet.".into());
            continue;
        }
        let timeout = if session.snapshot.mode == "wake" { 345 } else if session.snapshot.mode == "listen" {
            45
        } else {
            200
        };
        let exited = session
            .child
            .as_mut()
            .is_none_or(|child| !matches!(child.try_wait(), Ok(None)));
        if exited && session.exit_seen.is_none() {
            session.exit_seen = Some(Instant::now());
        }
        let exited_without_result = session
            .exit_seen
            .is_some_and(|seen| seen.elapsed() > Duration::from_millis(500));
        if exited_without_result || session.started.elapsed() > Duration::from_secs(timeout) {
            let stopped = kill(session).is_ok();
            session.snapshot.state = "error".into();
            session.snapshot.error =
                Some(if stopped { "Sprachhost beendet oder Zeitlimit erreicht. Aufnahme ist gestoppt." } else { "Sprachhost-Zeitlimit: Mikrofon-Abbruch nicht bestätigt. Beenden wird erneut versucht." }.into());
            if stopped { return; }
        }
    });
    Ok(snapshot)
}
#[tauri::command]
pub fn voice_snapshot(
    state: tauri::State<'_, VoiceState>,
    session_id: String,
) -> Result<Snapshot, String> {
    let inner = state.0.lock().map_err(|_| "Sprachzustand gesperrt.")?;
    inner
        .session
        .as_ref()
        .filter(|s| s.snapshot.session_id == session_id)
        .map(|s| s.snapshot.clone())
        .ok_or_else(|| "Sprachsitzung nicht mehr vorhanden.".into())
}
#[tauri::command]
pub fn voice_finish(state: tauri::State<'_, VoiceState>, session_id: String) -> Result<(), String> {
    let mut inner = state.0.lock().map_err(|_| "Sprachzustand gesperrt.")?;
    let session = inner
        .session
        .as_mut()
        .filter(|s| s.snapshot.session_id == session_id && matches!(s.snapshot.mode.as_str(), "listen" | "wake"))
        .ok_or("Keine passende Aufnahme.")?;
    if session.snapshot.terminal() || session.snapshot.state == "finishing" {
        return Ok(());
    }
    session.snapshot.state = "finishing".into();
    session.snapshot.level = None;
    let result = session
        .control
        .as_ref()
        .ok_or("Sprachkanal nicht verfügbar.")
        .and_then(|sender| {
            sender
                .send(())
                .map_err(|_| "Aufnahme konnte nicht abgeschlossen werden.")
        });
    if result.is_err() {
        let _ = kill(session);
        session.snapshot.state = "error".into();
    }
    result.map_err(String::from)
}
#[tauri::command]
pub fn voice_cancel(state: tauri::State<'_, VoiceState>, session_id: Option<String>) -> Result<(),String> {
    state.cancel(session_id.as_deref(), false)
}

#[cfg(all(test,windows))]
mod windows_process_tests {
    #[test]
    fn cancellation_terminates_real_owned_process_and_invalidates_start_lease() {
        use super::*;
        use std::os::windows::process::CommandExt;
        let executable=std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32/WindowsPowerShell/v1.0/powershell.exe");
        // Fixed sleeping child only, not the speech host. No microphone or network.
        let child=Command::new(executable).args(["-NoLogo","-NoProfile","-NonInteractive","-Command","Start-Sleep -Seconds 60"]).creation_flags(0x08000000).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
        let state=VoiceState::default();
        {let mut inner=state.0.lock().unwrap();inner.permission=true;inner.session=Some(Session{child:Some(child),control:None,snapshot:Snapshot{session_id:"native-test".into(),mode:"wake".into(),state:"armed".into(),level:None,transcript:String::new(),error:None,activated:false},started:Instant::now(),exit_seen:None});}
        state.cancel(None,false).expect("Owned Windows process must stop");
        {let inner=state.0.lock().unwrap();assert!(inner.epoch>0);let session=inner.session.as_ref().unwrap();assert!(session.child.is_none());assert_eq!(session.snapshot.state,"cancelled");}
        state.shutdown();assert!(!state.0.lock().unwrap().permission);
    }
}

#[cfg(test)] mod protocol_tests {
 use super::*;
 #[test]fn multiple_voices_keep_cultures_and_availability(){let c=parse_capabilities(r#"{"type":"capabilities","available":true,"recognition":false,"note":"TEST","voices":[{"id":"Microsoft Hedda Desktop","name":"Microsoft Hedda Desktop","culture":"de-DE","gender":"Female","enabled":true},{"id":"TEST English","name":"TEST English","culture":"en-US","gender":"Female","enabled":false}]}"#).unwrap();assert_eq!(c.voices.len(),2);assert_eq!(c.voices[0].culture,"de-DE");assert!(c.voices[0].enabled);assert!(!c.voices[1].enabled);}
 #[test]fn empty_success_is_distinct_from_host_error(){assert!(parse_capabilities(r#"{"type":"capabilities","available":true,"recognition":false,"note":"TEST","voices":[]}"#).unwrap().voices.is_empty());assert!(parse_capabilities(r#"{"type":"error","error":"SECRET must not escape"}"#).unwrap_err().contains("Initialisierungsfehler"));}
 #[test]fn invalid_json_and_wrong_schema_fail_closed(){assert!(parse_capabilities("not JSON").is_err());assert!(parse_capabilities(r#"{"type":"capabilities","voices":{}}"#).is_err());}
 #[test]fn tts_enumeration_error_is_retained_even_if_recognition_works(){let c=parse_capabilities(r#"{"type":"capabilities","available":true,"recognition":true,"note":"TEST","voices":[],"tts_error":"TEST: enumeration failed","tts_code":"VOICE_ENUMERATION_FAILED"}"#).unwrap();assert!(c.tts_error.is_some());assert!(c.recognition);}
}
#[cfg(all(test,windows))] mod native_probe_tests {
 use super::*;
 fn powershell()->Command{use std::os::windows::process::CommandExt;let mut c=Command::new(std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32/WindowsPowerShell/v1.0/powershell.exe"));c.creation_flags(0x08000000);c.args(["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass"]);c}
 #[test]fn real_hidden_speech_host_crosses_rust_json_boundary_without_recording(){let root=std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));let mut c=powershell();c.arg("-File").arg(root.join("voice/launch.ps1")).arg("-Source").arg(root.join("voice/VoiceHost.cs"));let result=probe_command(c,Duration::from_secs(30)).unwrap();assert_eq!(result.host_architecture.as_deref(),Some("x64"));assert_eq!(result.protocol_version,Some(2));assert!(result.tts_error.is_none(),"Runner TTS enumeration must succeed");for v in result.voices{assert!(!v.culture.is_empty());assert!(!v.name.is_empty());}}
 #[test]fn delayed_host_and_timeout_use_real_hidden_processes(){let mut delayed=powershell();delayed.args(["-Command","Start-Sleep -Milliseconds 350;[Console]::WriteLine('{\"type\":\"capabilities\",\"available\":true,\"recognition\":false,\"note\":\"TEST fixture, no audio\",\"voices\":[]}')"]);assert!(probe_command(delayed,Duration::from_secs(10)).is_ok());let mut hung=powershell();hung.args(["-Command","Start-Sleep -Seconds 60"]);let error=probe_command(hung,Duration::from_millis(150)).unwrap_err();assert!(error.contains("Zeitlimit"));}
}
