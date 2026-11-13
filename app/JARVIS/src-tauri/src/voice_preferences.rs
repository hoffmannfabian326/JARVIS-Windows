//! Only a voice identifier; no microphone permission, transcript, key or cloud settings.
use std::{fs, path::Path};
use serde::{Deserialize,Serialize};
#[derive(Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
struct Selection { voice_id: String }
fn valid(value:&str)->bool { value.len()<=512 && !value.chars().any(char::is_control) }
pub fn load(directory:&Path)->Result<Option<String>,String> {
 let path=directory.join("voice-selection.json");
 let bytes=match fs::read(path){Ok(bytes)=>bytes,Err(error) if error.kind()==std::io::ErrorKind::NotFound=>return Ok(None),Err(_)=>return Err("Gespeicherte Stimme konnte nicht gelesen werden.".into())};
 if bytes.len()>4096{return Err("Gespeicherte Stimmenauswahl ist ungültig. Bitte neu auswählen.".into());}
 let value:Selection=serde_json::from_slice(&bytes).map_err(|_|"Gespeicherte Stimmenauswahl ist ungültig. Bitte neu auswählen.")?;
 if !valid(&value.voice_id){return Err("Gespeicherte Stimmenauswahl ist ungültig.".into());}
 Ok(Some(value.voice_id))
}
pub fn save(directory:&Path,voice_id:String)->Result<(),String> {
 if !valid(&voice_id){return Err("Ungültige Stimmenkennung.".into());}
 fs::create_dir_all(directory).map_err(|_|"Stimmenauswahl konnte nicht gespeichert werden.")?;
 let temporary=directory.join(format!("voice-selection-{}.tmp",uuid::Uuid::new_v4()));
 let result=(||{let bytes=serde_json::to_vec(&Selection{voice_id}).map_err(|_|())?;fs::write(&temporary,bytes).map_err(|_|())?;fs::rename(&temporary,directory.join("voice-selection.json")).map_err(|_|())})();
 if result.is_err(){let _=fs::remove_file(temporary);return Err("Stimmenauswahl konnte nicht gespeichert werden.".into());}Ok(())
}
#[cfg(test)] mod tests {
 use super::*;
 struct Temp(std::path::PathBuf); impl Drop for Temp{fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
 fn directory()->Temp{let d=std::env::temp_dir().join(format!("jarvis-voice-pref-{}",uuid::Uuid::new_v4()));fs::create_dir_all(&d).unwrap();Temp(d)}
 #[test]fn selection_survives_reopen_and_replace(){let d=directory();assert_eq!(load(&d.0).unwrap(),None);save(&d.0,"Microsoft Hedda Desktop".into()).unwrap();assert_eq!(load(&d.0).unwrap().as_deref(),Some("Microsoft Hedda Desktop"));save(&d.0,"TEST English".into()).unwrap();assert_eq!(load(&d.0).unwrap().as_deref(),Some("TEST English"));}
 #[test]fn corrupt_selection_is_an_error_not_absence(){let d=directory();fs::write(d.0.join("voice-selection.json"),b"{").unwrap();assert!(load(&d.0).is_err());}
 #[test]fn selection_rejects_control_data_and_oversized_input(){let d=directory();assert!(save(&d.0,"x\n".into()).is_err());assert!(save(&d.0,"x".repeat(513)).is_err());}
}
