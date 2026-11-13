# Lieferumfang

Vollständiger Quellstand im Ordner `JARVIS_1.4.0` mit React/TypeScript, Rust,
Tauri-Konfiguration, SQLite/Provider-Kern, lokalem Windows-Sprachhost, Lockdateien,
Tests, Dokumentation und drei aktuellen HUD-Screenshots. Kein Installer und keine
mitgelieferten API-Schlüssel, Datenbanken, Roh-Audios oder Entwicklungs-Abhängigkeiten.

Änderungsschwerpunkte:

- `src/App.tsx`, `HudCore.tsx`, `style.css`: Dashboard ohne Chat, aktueller Kontext,
  sichere Freigaben, sechs Overlays, responsive/reduzierte Animationen.
- `src/useAutonomousVoice.ts`, `voicePolicy.ts`, `VoiceSettings.tsx`: Sitzung,
  Mikrofon-/Geräte-/Wake-/PTT-/TTS-Lifecycle, bestätigte Abschaltung.
- `src/useNeural.ts`, `NeuralConsole.tsx`: neuer Sprachversand, bestehende Provider/
  Wissensverwaltung, keine sichtbare Chatansicht.
- `src-tauri/src/assistant.rs`, `audio_devices.rs`, `voice.rs`, `neural.rs`, `lib.rs`:
  feste Tools, native Geräte, Kontroll- und Autorisierungsgrenzen, keine neuen Shellrechte.
- `src-tauri/voice/AudioCapture.cs`, `VoiceHost.cs`, `launch.ps1`: lokale PCM-Eingabe,
  SAPI-Grammatik/Diktat/TTS, feste Skripte ohne Benutzertext als Code.
- `crates/neural-core/src/intent.rs`, `provider.rs`: geschlossene Vorschläge,
  einmalige Bestätigungen, Sprach-Systemvertrag; SQLite-Implementierung unverändert.

Der ursprüngliche 1.3-Ordner wurde erhalten. Buildausgaben/Framework-Werkzeuge
liegen außerhalb des Quellpakets. `README_DE.md` und die 1.4-Dokumente sind maßgeblich;
ältere Dokumente/Tests sind als historischer Ausgangspunkt mit enthalten.
