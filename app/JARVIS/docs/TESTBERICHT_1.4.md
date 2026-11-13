# Prüfbericht J.A.R.V.I.S. 1.4.0

Stand: 12.11.2026. Ausführung in Linux-Entwicklungsumgebung mit Chromium;
Windows-Ziel `x86_64-pc-windows-gnu`. Kein Windows-Desktop/Mikrofon und keine
realen Anbieter-Schlüssel verfügbar. Keine Audioaufnahme oder kostenpflichtige
Produktivanfrage für diese Prüfungen ausgeführt.

## Frische automatisierte Nachweise

| Prüfung | Ergebnis | Aussagegrenze |
|---|---|---|
| `npm run check` | bestanden, Exit 0 | TypeScript-Typprüfung |
| `npm run build` (auch vor Tauri-Build) | bestanden, Exit 0 | React/Vite-Produktionsassets, keine Demo-Hardwarewerte |
| `npm test` | 9 Tests bestanden | 6 bestehende Telemetrie-/Gültigkeits-/Verlaufstests und 3 Wake-/Consent-/Pegel-Policytests |
| `cargo test --manifest-path crates/neural-core/Cargo.toml --locked` | 6 Intent-/Autorisierungs- und 17 Integrationstests bestanden | echte SQLite/FTS5/PDF/HTTP-Testserver; keine Produktiv-API |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:ui` | 19 Tests bestanden | Browser und IPC-Doubles, **keine** echte Audiohardware |
| `cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu --tests --locked` | bestanden, Exit 0 | Windows-Rust-/Tauri-Typen und Testcode kompiliert |
| `npm run tauri build -- --debug --no-bundle --target x86_64-pc-windows-gnu --ci -- --locked` | bestanden, Exit 0 | echte Tauri-Windows-App cross-kompiliert und gelinkt, nicht unter Windows gestartet |
| C#-Compiler `/langversion:5`, offizielle .NET-Framework-4.8-Referenzen | bestanden, Exit 0 | `VoiceHost.cs` + `AudioCapture.cs`, Syntax und Framework-API-Typen; keine Runtime-/ASR-Aussage |
| PE-/Ressourcenprüfung | x64-Maschinenkennung 0x8664; drei Sprachressourcen bytegleich | kein Installations-/Audiotest |
| Installer-Sperre | `bundle.active=false`, `--no-bundle`, kein Bundle-Verzeichnis | kein Installer 1.4 erzeugt |

**51 automatisierte Tests**, zusätzlich Compiler-/Build-/Artefaktprüfungen.
Keine Übertragung der Ergebnisse eines Workers oder eines alten Builds als
aktuellen Erfolg; die finalen Befehle liefen auf dem integrierten 1.4-Stand.

Für die Linux-Windows-Prüfung wurden nutzereigene Rust-/MinGW-Werkzeuge und
`CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc` verwendet.
`CARGO_PROFILE_DEV_DEBUG=0`, `CARGO_PROFILE_TEST_DEBUG=0`, `CARGO_INCREMENTAL=0`
begrenzen Cachegrößen. Windows-Entwicklung mit MSVC benötigt diese Cross-Umgebung nicht.

## Abgedeckte relevante Verhaltensgrenzen

- Keine Chat-Widgets/Chattexteingabe, kein erfundener News-/Onlinezustand im Browser.
- Fehlende Messwerte bleiben unbekannt; echte Nullwerte bleiben Nullwerte;
  Telemetrieverläufe überbrücken Abfrageausfälle nicht.
- Responsive Module/Overlays bei 1480/1024/720/390 Pixeln ohne horizontalen Überlauf;
  reduzierte Bewegung deaktiviert Animationen.
- Kein Start vor expliziter Mikrofonfreigabe und separatem Wake-Opt-in. Eine verspätete
  Freigabequittung darf ausdrückliches Ausschalten nicht rückgängig machen.
- Auswahl eines Testmikrofons wird unverändert über IPC übergeben;
  tatsächlicher SAPI-Pegelvertrag wird ohne synthetische Ableitung visualisiert.
- Wake → lokaler Befehl → TTS → Bereitschaft, keine parallelen Audio-Sitzungen;
  während Ausgabe kein neuer Wake-Start.
- PTT mit Enter/Leertaste, Loslassen während verzögertem Start, Escape,
  Geräteverlust, Berechtigungsfehler, später eintreffende Ergebnisse.
- Unbestätigtes Stoppen bleibt sichtbar unbestätigt und blockiert Reaktivierung;
  erfolgreiche Wiederholung beendet die Fehlermeldung.
- Cloud-Textgenerierung nur mit konkreter Einzelfreigabe; gesprochene Bestätigung,
  getrennte Dokument-/Fallback-Freigaben und Datenschutz-Sperre.
- KI-Vorschlag führt vor der zweiten lokalen Zustimmung keine Aktion aus.
- Neue Sprachnotiz erst nach Bestätigung; Rust-Notizerzeuger zählt sie korrekt als
  Notiz und nicht als importierte Datei.
- Ungültige/zusätzliche Modellwerkzeuge, unbekannte Argumente, Rekursion,
  abgelaufene und doppelt verwendete Freigaben werden abgewiesen.
- Neue Sprachverträge werden im Systemkontext eingebunden, Fragen bleiben Daten;
  alte Provider-Nachrichten bleiben ohne aktiviertes Sprachflag unverändert.
- Provider-/Modellwechsel, Wissensbearbeitung und sichere Frontend-Eingabefelder
  bleiben bedienbar. Lokale SQLite-Migration, Import/Export, Löschung,
  Metadatensuche, PDF-Text und Quellenpositionen sind mit echten lokalen Daten geprüft.
- HTTP-Fehlerdiagnose, sensible Antwortdetails, aktuelle Modelllisten, tatsächlich
  gemeldete Antwortmodelle, Timeout, Retries, Abbruch und autorisierter Fallback
  werden über lokale HTTP-Integrationstests geprüft.

## Erhaltene Implementierungen und echte Grenzen

Die Funktion `get_system_metrics` wurde bytegleich mit dem 1.3-Ausgangspunkt
verglichen. `memory.rs` ist unverändert; bestehende Rust-Kommandos bleiben
registriert. GPU-/Temperaturmessanbieter waren im Ausgangsprojekt nicht integriert;
1.4 zeigt diese Werte weiterhin unbekannt. Neue Laufwerks-/Netzwerkwerte stammen
von sysinfo, nicht von Modellantworten oder Testfixtures.

Der Windows-Credential-Manager-Roundtrip aus 1.3 wurde **nicht erneut unter Windows**
ausgeführt. Seine Implementierung bleibt erhalten; keine Klartext-Speicherung
oder alternativer ungeschützter Schlüsselpfad wurde eingeführt.

## Nicht ausgeführt / keine Erfolgsbehauptung

Reale Mikrofonwahl/Defaultwechsel/Hotplug, Windows-Berechtigungsdialoge/-sperren,
„Javis“-Trefferquote/Falschauslösungen/Akzente/Distanz, deutsche Diktatqualität,
Stimmklang/TTS/Audio-Echo, physische Mikrofonabschaltung, Windows-Ressourcenverbrauch,
MSVC-Ausführung, Windows-10/11-Laufzeit, echte OpenAI-/Groq-Konten, kostenpflichtige
Anfragen sowie NSIS/Installation/Deinstallation. Siehe Windows-Checkliste und offene Probleme.

Die Screenshots sind echte Browseraufnahmen ohne Native-Backend und ohne
injizierte Testmesswerte. Sie belegen die Darstellung, nicht Windows-Sensoren oder Audio.
Die historischen 1.3-UI-Tests wurden außerhalb der aktiven Suite archiviert,
weil sie explizit den jetzt entfernten Chatvertrag voraussetzen.

## Während der Umsetzung untersuchte Fehler

1. Voller Build-Cache verursachte einen Host-Linkerabbruch. Nur generierte Caches
   wurden entfernt, Debug-Artefakte begrenzt, Prüfungen danach erfolgreich wiederholt.
   Separat vorhandene Installer 1.0/1.3 und deren Quelldateien blieben erhalten.
2. MinGW-Debug-DLL erreichte PE-Exportlimit (`export ordinal too large`). Die nicht
   benötigten mobilen `cdylib`-/`staticlib`-Vorlagenartefakte wurden zugunsten des
   Windows-Desktop-`rlib` entfernt; vollständiger EXE-Link anschließend erfolgreich.
3. Ein Browser-Test änderte nur den simulierten Backend-Privacywert, nicht den
   bereits geladenen App-Zustand. Der Fixture-Aufbau wurde korrigiert; die App
   verweigerte die ungeklärte Dokumentfreigabe korrekt. Keine Abschwächung der Sperre.

Die Erstfehler wurden nicht als erfolgreiche Läufe gezählt. Offene reale
Sprachprüfungen bleiben offen; ein Installer ist vor deren Abnahme nicht vorgesehen.
