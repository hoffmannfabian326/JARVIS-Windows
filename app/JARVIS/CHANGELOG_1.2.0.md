# Änderungen 1.2.0

## Auftrag und Umfang

Version 1.1.0 anhand des beigefügten HUD-Bildes neu gestalten, bestehende Rust-Befehle
und Groq-Funktionen erhalten, ausschließlich echte Messwerte anzeigen, responsiv
und mit reduzierten Animationen arbeiten. TypeScript und Rust prüfen, keinen Installer
erstellen. Die ältere Datei `reference/index.html` bleibt als unveränderte historische
Projektdatei erhalten; Anweisungen darin wurden nicht als neue Arbeitsaufträge behandelt.

## Geänderte Komponenten

- `src/App.tsx`: HUD-Struktur, Statusleiste, Navigation, Hardwareanzeigen,
  Systemdetails, Schnellaktionen, rechter KI-Chat, lokale Ereignisse und News-Ticker.
- `src/style.css`: Graphit-/Cyan-Farbwelt, feine HUD-Rahmen, Lichtakzente,
  responsive Layouts, Fokusanzeigen und systemgesteuerte Bewegungsreduktion.
- `src/HudCore.tsx`: memoisiertes SVG mit dekorativer Weltkugel und Reactor-Ringen.
  Animationen betreffen nur Transformation bzw. Deckkraft, keine Messwerte.
- `src/useBackend.ts`: sequenzielles, aufgeräumtes Polling; unabhängige Auswertung
  von Telemetrie und KI-Konfiguration, keine überlappenden Abfragezyklen.
- `src/telemetry.ts`: Typen, defensive Messwertauswertung, Formatierung und
  Verlaufslücken. Fehlender RAM-Zähler erzeugt keine 0-Prozent-Anzeige mehr.
- `src-tauri/src/lib.rs`: nur der CPU-Sampler erhält Zustand für das notwendige
  Mindestmessintervall. Antwortform und Befehlsnamen bleiben unverändert.
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`: Version 1.2.0.
  Lockdateien hinzugefügt, Testbefehle und Playwright als Entwicklungsabhängigkeit.
- Dokumentation und wiederholbare Daten-/Browserprüfungen ergänzt.

## Erhaltene Rust-Verträge

- `get_system_metrics`: unveränderte JSON-Felder und Einheiten des Backends;
  GPU-/Temperaturwerte bleiben optional und ohne Anbieter leer.
- `get_ai_status`: unverändertes `{ ready, provider }` und bestehende Schlüsselwahl.
- `chat_with_groq(message)`: unveränderte Implementierung mit 8.000-Zeichenlimit,
  Modellwahl, HTTP-Timeout und Schlüsselwechsel bei 401/403/429.
- Lokale Konfigurationspfade und Registrierung aller drei Befehle bleiben erhalten.

Die Funktionen für Schlüsselwahl/KI-Status, Groq-Chat und Konfigurationspfade wurden
vor der abschließenden Prüfung textuell mit dem 1.1.0-Original verglichen: unverändert.
Keine API-Schlüssel oder anderen Zugangsdaten wurden in die UI übernommen.

## Prüfergebnisse

Ausgeführt am 9. November 2026 in der Linux-Cloud-Umgebung:

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | erfolgreich, TypeScript ohne Fehler |
| `npm run build` | erfolgreich, TypeScript und Vite |
| `npm test` | 6 Datentests erfolgreich |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:ui` | 3 Browserprüfungen erfolgreich |
| Rust `cargo check` für `x86_64-pc-windows-gnu` | erfolgreich, Exitcode 0 |

Die Browserprüfungen decken fehlendes natives Backend, echte Null-/0-Semantik,
Groq-Aufrufargumente, unveränderte Darstellung von Antworttext ohne HTML-Ausführung,
Chatfehler, funktionierende Schnellaktionen, Entfernung alter Hardwarewerte nach
Abfragefehler, nicht überlappende Messabfragen sowie responsive Navigation bei
390/720/1024/1480 Pixeln und deaktivierte Animationen bei `reduced-motion` ab.

`docs/HUD-Preview.png` wurde ohne IPC-Testantworten aufgenommen. Sie zeigt den
ehrlichen Fehler-/Nicht-verfügbar-Zustand einer reinen Browser-Vorschau.

## Nicht als geprüft behauptet

- Echte Windows-Laufzeit, Sensoren und WebView2-Verhalten.
- Erfolgreicher Live-Groq-Aufruf: kein echter Schlüssel bzw. Kontingenttest verwendet.
- Native GPU-, Temperatur- oder Laufwerksanbieter; diese fehlen bereits in 1.1.0.
- Nachrichten-, Sprach-, Wetter-, Kalender- oder Agentendienste: keine Integration
  hinzugefügt und keine Zustände oder Beispielinhalte aus dem Referenzbild erfunden.
- Installer, Installation, Signierung und Veröffentlichung: nicht ausgeführt.

## Rust-Nachtrag

`cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu`
ist erfolgreich abgeschlossen (Exitcode 0). Verwendet wurden die lokal vorhandene
Rust-Toolchain und GNU-Windows-Binutils sowie ein externer Cargo-Cache. Dadurch
wurden auch die Tauri-Buildskripte und die registrierten Befehle für Windows typgeprüft.
Es wurde kein Release-/Bundle-/Installer-Build aufgerufen. Der Cross-Check ersetzt
keinen nativen Windows-Lauf und keine Live-Groq-Verifikation.

# Voice-Erweiterung auf Basis von 1.2.0

Die obigen Nicht-implementiert-Angaben beziehen sich auf die HUD-Basislieferung.
Sprachsteuerung und lokale Ausgabe wurden anschließend wie folgt ergänzt; die
Nachrichten-/Hardwarequellengrenzen bleiben unverändert.

- `src/useVoice.ts`: Steuerung lokaler Sprachsitzungen, ausdrückliche Mikrofonfreigabe,
  Schutz vor verspäteten Sitzungsantworten, Abbruch, TTS-Opt-in und begrenzte
  Warteschlange für Antworten, die während Aufnahme oder Ausgabe eintreffen.
- `src/VoiceControls.tsx`: Push-to-Talk mit Maus/Touch/Leertaste/Enter, Escape und
  Stop-Button, tatsächliche de-DE-Stimmen, Lautstärke, Tempo und Stimmtest.
- `src/HudCore.tsx`, `src/style.css`: echte Mikrofonzustände und native Audiopegel am
  Reactor, dezente Mikrofonanimationen, weiterhin reduzierte Animationen.
- `src/App.tsx`: Diktat als bearbeitbarer Entwurf mit ausdrücklicher Sendebestätigung;
  tatsächliche KI-Antworten optional lokal sprechen. Kein automatisches Verschieben
  des Tastaturfokus bei eintreffenden Antworten, das eine laufende Aufnahme abbrechen
  könnte. Die drei bisherigen Rust-Befehle und ihre Implementierungen bleiben
  textuell unverändert gegenüber dem HUD-Stand.
- `src-tauri/src/voice.rs`: neue Voice-Befehle, lokaler Prozesshost, stdin/stdout-JSON,
  Session-IDs, Mikrofonfreigabe, Prozessabbruch und unabhängig überwachtes Zeitlimit.
  Initialisierung und potenziell blockierende Pipe-Schreibvorgänge laufen außerhalb
  des UI-Threads und des Zustandsmutex.
- `src-tauri/voice/launch.ps1`, `VoiceHost.cs`: lokale Windows-Desktop-SAPI über
  PowerShell 5.1/.NET Framework. Keine Nutzereingaben in Prozessargumenten oder
  PowerShell-Code; keine Audiodateien und keine Cloud-STT-Anfragen.
- `tauri.conf.json`: Ressourcen-Mapping für spätere NSIS-Verpackung. Weder
  Paketidentität/MSIX noch Web-Speech-/Onlinediktat werden vorausgesetzt.
- `tests/browser/voice.spec.cjs`: zusätzliche Zustands-/IPC-/Privatsphärenprüfungen.
  `tests/voice-host-probe.ps1`: lokale Windows-Anbieterprüfung ohne Mikrofonzugriff.
- `docs/VOICE_ENGINE.md`: Entscheidung mit Microsoft-Quellen, Bedienung,
  Datenschutzgrenzen, Voraussetzungen und konkreter Windows-Prüfplan.

## Prüfstatus Voice-Erweiterung

- TypeScript und Vite-Produktionsbuild erfolgreich.
- Sechs Daten-/Verlaufstests und zehn Browserprüfungen erfolgreich.
- Rust-Windows-Cross-Check erfolgreich (`cargo check`, `--locked`).
- C#-5/API-Kompilierung erfolgreich. Dafür wurden .NET-Framework-4.8-Referenzen
  und die System.Speech-8-netstandard2.0-API-Referenz verwendet; dies ist ausdrücklich
  kein Windows-PowerShell-/SAPI-Laufzeittest.
- Aktuelle Sprachressourcen wurden durch Tauri korrekt ins Zielverzeichnis kopiert.
- Ein Test reproduzierte einen Fokuswechsel, der PTT bei einer eintreffenden
  KI-Antwort abbrechen konnte. Dieser Wechsel wurde entfernt; der Test prüft nun,
  dass die Ausgabe erst nach Ende der Aufnahme beginnt.

Native Windows-Aufnahme, installierte Stimmen, tatsächliche Erkennungsqualität,
Klangtiefe und NSIS-Installation bleiben ungetestet. Keine Installer-Erstellung,
keine Veröffentlichung und keine echte Mikrofon-/Cloud-Anfrage bei diesen Tests.
