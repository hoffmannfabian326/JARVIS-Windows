//! Closed voice-tool vocabulary. Model output is a proposal, never executable code.
use crate::Entry;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct PlanBook(HashMap<String, (Action, bool, Instant)>);

pub fn confirmed_note(text: &str) -> Result<Entry, String> {
    let body = text.trim().to_owned();
    Action::Remember { text: body.clone() }.validate()?;
    Ok(Entry {
        id: 0,
        title: body.chars().take(60).collect(),
        body,
        category: "Wissen".into(),
        source: String::new(),
        metadata: std::collections::BTreeMap::from([(
            "eingabe".into(),
            "bewusst bestätigte Sprache".into(),
        )]),
        updated: String::new(),
    })
}
impl PlanBook {
    pub fn insert(&mut self, id: String, action: Action, from_model: bool, now: Instant) {
        self.0.clear();
        self.0.insert(id, (action, from_model, now));
    }
    pub fn clear(&mut self) {
        self.0.clear();
    }
    fn remove(&mut self, id: &str, now: Instant) -> Result<(Action, bool), String> {
        let (action, model, created) = self
            .0
            .remove(id)
            .ok_or("Aktion fehlt oder wurde bereits verbraucht.")?;
        if now.saturating_duration_since(created) > Duration::from_secs(120) {
            return Err("Bestätigung abgelaufen. Befehl erneut sprechen.".into());
        }
        action.validate()?;
        Ok((action, model))
    }
    pub fn take(&mut self, id: &str, confirmed: bool, now: Instant) -> Result<Action, String> {
        let (action, model) = self.remove(id, now)?;
        if (action.confirmation() || model) && !confirmed {
            return Err("Diese Aktion benötigt eine ausdrückliche Einzelfreigabe.".into());
        }
        if matches!(action, Action::CloudQuestion { .. }) {
            return Err("Cloud-Anfragen benötigen eine separate Versandvorschau.".into());
        }
        Ok(action)
    }
    pub fn preview_question(&mut self, id: &str, now: Instant) -> Result<String, String> {
        match self.remove(id, now)?.0 {
            Action::CloudQuestion { question } => Ok(question),
            _ => Err("Keine Cloud-Frage vorbereitet.".into()),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Module {
    Knowledge,
    Wow,
    News,
    Tools,
    Voice,
    Settings,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Metric {
    Cpu,
    Ram,
    Gpu,
    Temperatures,
    Storage,
    Network,
    All,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    Hardware {
        metric: Metric,
    },
    ProviderStatus,
    SearchKnowledge {
        query: String,
        category: Option<String>,
    },
    OpenModule {
        module: Module,
    },
    SetVolume {
        value: u8,
    },
    SetSpeech {
        enabled: bool,
    },
    Remember {
        text: String,
    },
    WebSearch,
    CloudQuestion {
        question: String,
    },
}
impl Action {
    pub fn validate(&self) -> Result<(), String> {
        let valid = match self {
            Self::SetVolume { value } => *value <= 100,
            Self::Remember { text } | Self::CloudQuestion { question: text } => {
                !text.trim().is_empty() && text.chars().count() <= 8000
            }
            Self::SearchKnowledge { query, category } => {
                !query.trim().is_empty()
                    && query.chars().count() <= 400
                    && category.as_deref().is_none_or(|c| c == "WoW Forever")
            }
            _ => true,
        };
        if valid {
            Ok(())
        } else {
            Err("Werkzeugargumente außerhalb der erlaubten Grenzen.".into())
        }
    }
    pub fn confirmation(&self) -> bool {
        matches!(self, Self::Remember { .. } | Self::CloudQuestion { .. })
    }
    pub fn summary(&self) -> String {
        match self {
            Self::Hardware { .. } => "Aktuelle lokale Hardwaredaten abfragen".into(),
            Self::ProviderStatus => "Tatsächlich konfigurierte KI-Verbindung anzeigen".into(),
            Self::SearchKnowledge { query, .. } => format!("Lokal im Wissen suchen: {query}"),
            Self::OpenModule { .. } => "Dashboard-Modul öffnen".into(),
            Self::SetVolume { value } => format!("Sprachausgabe auf {value} Prozent einstellen"),
            Self::SetSpeech { enabled } => if *enabled { "Sprachausgabe einschalten" } else { "Sprachausgabe ausschalten" }.into(),
            Self::Remember { text } => format!("Neue Erinnerung lokal speichern: {text}"),
            Self::WebSearch => "Aktuelle Webrecherche ist nicht angebunden".into(),
            Self::CloudQuestion { .. } => "Frage nach Einzelfreigabe an den gewählten Cloud-Anbieter senden; API-Kosten möglich".into(),
        }
    }
}
pub fn route(utterance: &str, volume: u8) -> Result<Action, String> {
    let original = utterance.trim();
    if original.is_empty() || original.chars().count() > 8000 {
        return Err("Sprachbefehl muss 1 bis 8.000 Zeichen enthalten.".into());
    }
    let without_wake = original
        .get(..5)
        .filter(|w| w.eq_ignore_ascii_case("javis"))
        .and_then(|_| {
            let rest = &original[5..];
            (rest.is_empty() || rest.starts_with(|c: char| c.is_whitespace() || c == ','))
                .then_some(rest.trim_start_matches(|c: char| c.is_whitespace() || c == ','))
        })
        .unwrap_or(original);
    let text = without_wake.trim();
    if text.is_empty() {
        return Err("Kein Befehl nach Javis erkannt.".into());
    }
    let lower = text.to_lowercase();
    let words = lower
        .split(|c: char| !c.is_alphanumeric())
        .collect::<Vec<_>>();
    let has = |word: &str| words.contains(&word);
    let action = if let Some(body) = lower
        .strip_prefix("merke dir ")
        .map(|_| &text["merke dir ".len()..])
        .or_else(|| {
            lower
                .strip_prefix("speichere als notiz ")
                .map(|_| &text["speichere als notiz ".len()..])
        }) {
        Action::Remember {
            text: body.trim().into(),
        }
    } else if lower.starts_with("erkläre ")
        || lower.starts_with("was ist ")
        || lower.starts_with("wie funktioniert ")
    {
        Action::CloudQuestion {
            question: text.into(),
        }
    } else if lower.contains("leiser") {
        Action::SetVolume {
            value: volume.saturating_sub(10),
        }
    } else if lower.contains("lauter") {
        Action::SetVolume {
            value: volume.saturating_add(10).min(100),
        }
    } else if lower.contains("sprachausgabe") && (has("aus") || has("stopp") || has("ausschalten"))
    {
        Action::SetSpeech { enabled: false }
    } else if lower.contains("sprachausgabe")
        && (has("ein") || has("einschalten") || has("aktivieren"))
    {
        Action::SetSpeech { enabled: true }
    } else if lower.contains("lautstärke") && lower.contains("prozent") {
        let number = lower
            .split_whitespace()
            .find_map(|w| w.parse::<u8>().ok())
            .ok_or("Bitte eine Lautstärke zwischen 0 und 100 Prozent nennen.")?;
        Action::SetVolume { value: number }
    } else if (lower.starts_with("öffne ") || lower.starts_with("zeige "))
        && [
            "wow",
            "guide",
            "wissen",
            "notiz",
            "einstellung",
            "provider",
            "voice",
            "stimme",
            "mikrofon",
            "news",
            "tools",
        ]
        .iter()
        .any(|w| lower.contains(w))
    {
        if lower.contains("wow") || lower.contains("guides") {
            Action::OpenModule {
                module: Module::Wow,
            }
        } else if lower.contains("wissen") || lower.contains("notiz") {
            Action::OpenModule {
                module: Module::Knowledge,
            }
        } else if lower.contains("einstellung") || lower.contains("provider") {
            Action::OpenModule {
                module: Module::Settings,
            }
        } else if lower.contains("voice") || lower.contains("stimme") || lower.contains("mikrofon")
        {
            Action::OpenModule {
                module: Module::Voice,
            }
        } else if lower.contains("news") {
            Action::OpenModule {
                module: Module::News,
            }
        } else if lower.contains("tools") {
            Action::OpenModule {
                module: Module::Tools,
            }
        } else {
            Action::CloudQuestion {
                question: text.into(),
            }
        }
    } else if lower.contains("suche")
        && (lower.contains("wissen")
            || lower.contains("notiz")
            || lower.contains("guide")
            || lower.contains("dokument")
            || lower.contains("raid"))
    {
        let query = lower
            .split_once(" nach ")
            .map(|(_, q)| q)
            .unwrap_or(&lower)
            .trim()
            .chars()
            .take(400)
            .collect();
        Action::SearchKnowledge {
            query,
            category: (lower.contains("wow") || lower.contains("guide"))
                .then(|| "WoW Forever".into()),
        }
    } else if lower.contains("internet")
        || lower.contains("webrecherche")
        || lower.contains("aktuelle nachrichten")
    {
        Action::WebSearch
    } else if lower.contains("modell") || lower.contains("anbieter") || lower.contains("provider") {
        Action::ProviderStatus
    } else if has("cpu") || lower.contains("prozessor") {
        Action::Hardware {
            metric: if lower.contains("temperatur") {
                Metric::Temperatures
            } else {
                Metric::Cpu
            },
        }
    } else if has("ram") || lower.contains("arbeitsspeicher") {
        Action::Hardware {
            metric: Metric::Ram,
        }
    } else if has("gpu") || lower.contains("grafikkarte") {
        Action::Hardware {
            metric: if lower.contains("temperatur") {
                Metric::Temperatures
            } else {
                Metric::Gpu
            },
        }
    } else if lower.contains("temperatur") {
        Action::Hardware {
            metric: Metric::Temperatures,
        }
    } else if lower.contains("festplatte")
        || lower.contains("speicherplatz")
        || lower.contains("laufwerk")
    {
        Action::Hardware {
            metric: Metric::Storage,
        }
    } else if lower.contains("netzwerk") {
        Action::Hardware {
            metric: Metric::Network,
        }
    } else if lower.contains("systemstatus") || lower.contains("hardware") {
        Action::Hardware {
            metric: Metric::All,
        }
    } else {
        Action::CloudQuestion {
            question: text.into(),
        }
    };
    action.validate()?;
    Ok(action)
}
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum ModelResponse {
    Answer { text: String },
    Tool { action: Action },
}
pub fn model_response(text: &str) -> Result<ModelResponse, String> {
    let result: ModelResponse = serde_json::from_str(text)
        .map_err(|_| "KI-Antwort enthält keinen gültigen Werkzeugvorschlag.".to_owned())?;
    match &result {
        ModelResponse::Tool { action } => {
            action.validate()?;
            if matches!(action, Action::CloudQuestion { .. }) {
                return Err("Rekursive Cloud-Werkzeuge sind nicht erlaubt.".into());
            }
        }
        ModelResponse::Answer { text } if text.is_empty() || text.chars().count() > 16000 => {
            return Err("KI-Antwort außerhalb der erlaubten Länge.".into())
        }
        _ => {}
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn german_examples_route_to_real_local_tools() {
        assert_eq!(
            route("Javis, wie hoch ist meine CPU-Auslastung?", 70).unwrap(),
            Action::Hardware {
                metric: Metric::Cpu
            }
        );
        assert_eq!(
            route("Javis, öffne meine WoW-Guides.", 70).unwrap(),
            Action::OpenModule {
                module: Module::Wow
            }
        );
        assert_eq!(
            route("Javis, schalte deine Sprachausgabe leiser.", 5).unwrap(),
            Action::SetVolume { value: 0 }
        );
        assert!(
            matches!(route("Suche in meinem lokalen Wissen nach Raid-Strategien",70).unwrap(),Action::SearchKnowledge{query,..} if query=="raid-strategien")
        );
        assert!(matches!(
            route("Welches KI-Modell verwendest du?", 70).unwrap(),
            Action::ProviderStatus
        ));
    }
    #[test]
    fn german_setting_tokens_are_not_substring_matches() {
        assert_eq!(
            route("Schalte die Sprachausgabe ein", 70).unwrap(),
            Action::SetSpeech { enabled: true }
        );
        assert_eq!(
            route("Schalte die Sprachausgabe aus", 70).unwrap(),
            Action::SetSpeech { enabled: false }
        );
        assert_eq!(
            route("Zeige meine Temperaturen", 70).unwrap(),
            Action::Hardware {
                metric: Metric::Temperatures
            }
        );
        assert!(matches!(
            route("Wie lerne ich programmieren?", 70).unwrap(),
            Action::CloudQuestion { .. }
        ));
        assert!(matches!(
            route("Was ist eine CPU?", 70).unwrap(),
            Action::CloudQuestion { .. }
        ));
    }
    #[test]
    fn explicit_memory_and_cloud_confirmation_required() {
        assert!(route("Merke dir Meine Gilde spielt samstags", 70)
            .unwrap()
            .confirmation());
        assert!(route("Was ist Gravitation?", 70).unwrap().confirmation());
        assert!(!route("CPU Auslastung", 70).unwrap().confirmation());
    }
    #[test]
    fn model_output_cannot_introduce_tools_or_arguments() {
        for bad in [
            r#"{"type":"tool","action":{"kind":"shell","command":"whoami"}}"#,
            r#"{"type":"tool","action":{"kind":"set_volume","value":101}}"#,
            r#"{"type":"tool","action":{"kind":"open_module","module":"settings","path":"C:/"}}"#,
            r#"{"type":"tool","action":{"kind":"cloud_question","question":"loop"}}"#,
        ] {
            assert!(model_response(bad).is_err());
        }
        assert!(matches!(
            model_response(r#"{"type":"tool","action":{"kind":"hardware","metric":"cpu"}}"#)
                .unwrap(),
            ModelResponse::Tool { .. }
        ));
    }
    #[test]
    fn wake_prefix_is_exact_word_and_arguments_bounded() {
        assert!(route("Javis", 70).is_err());
        assert!(
            matches!(route("JavisABC",70).unwrap(),Action::CloudQuestion{question} if question=="JavisABC")
        );
        assert!(route(&"x".repeat(8001), 70).is_err());
        assert!(route("Lautstärke 255 Prozent", 70).is_err());
    }
    #[test]
    fn approvals_expire_are_single_use_and_model_cannot_self_approve() {
        let now = Instant::now();
        let mut book = PlanBook::default();
        book.insert(
            "a".into(),
            Action::Remember {
                text: "Notiz".into(),
            },
            false,
            now,
        );
        assert!(book.take("a", false, now).is_err());
        assert!(book.take("a", true, now).is_err());
        book.insert("b".into(), Action::ProviderStatus, true, now);
        assert!(book.take("b", false, now).is_err());
        book.insert("c".into(), Action::ProviderStatus, false, now);
        assert!(book
            .take("c", true, now + Duration::from_secs(121))
            .is_err());
        book.insert("d".into(), Action::ProviderStatus, false, now);
        assert!(book.take("d", false, now).is_ok());
        assert!(book.take("d", true, now).is_err());
        book.insert(
            "e".into(),
            Action::CloudQuestion {
                question: "Frage".into(),
            },
            false,
            now,
        );
        assert!(book.take("e", true, now).is_err());
    }
}
