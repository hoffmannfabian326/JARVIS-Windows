# Testbericht – J.A.R.V.I.S. 1.3.0

Datum: 9. November 2026. Ausführungsumgebung: Linux-Cloud, Chromium, Node 24,
Rust-Toolchain mit Windows-GNU-Ziel und lokalem GNU-Windows-C-Compiler.
Kein nativer Windows-Rechner und keine echten OpenAI-/Groq-Zugangsdaten verwendet.

## Frische automatische Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | erfolgreich, TypeScript ohne Fehler |
| `npm run build` | erfolgreich, React/Vite-Produktionsbuild |
| `npm test` | 6 bestehende Telemetrie-/Format-/Verlaufstests erfolgreich |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:ui` | 14 Browserprüfungen erfolgreich |
| `cargo test --manifest-path crates/neural-core/Cargo.toml --locked` | 15 echte Core-Integrationstests erfolgreich |
| `cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu --tests --locked` | erfolgreich einschließlich Windows Credential Manager und registrierter Tauri-/Voice-Befehle |
| Tauri-Konfiguration, Versionen und Voice-Ressourcen | durch Windows-Cross-Check sowie separaten Datei-/Versionsvergleich bestätigt |

Gesamt: **35 ausgeführte Daten-/Core-/Browsertests**. Der vorbereitete native
Credential-Manager-Test wurde nicht ausgeführt und ist in dieser Zahl nicht enthalten.

## Was die Core-Tests tatsächlich ausführen

Echte temporäre bzw. In-Memory-SQLite-Datenbanken mit gebündeltem FTS5 und ein lokaler
HTTP-Testserver; keine produktiven Cloud-Aufrufe und keine echten Schlüssel.

- Migration von neuer DB, Wiederöffnen persistierter DB, Ablehnung neuerer Schemas.
- Unicode-Chunkpositionen und Grenzen, FTS-Update/Delete, sichere Suchoperatorbehandlung.
- JSON-Export/Import, atomarer Rollback ungültiger Imports, bestätigte Voll-Löschung
  einschließlich Chats und Suchindex.
- UTF-8-Import, ungültige Formate, tatsächlich erzeugtes valides Text-PDF mit
  nachgewiesener Extraktion/Indexierung und realen Quellenpositionen.
- Suchbare eigene WoW-Metadaten ohne erfundene Guidetexte.
- Datenschutzstandards, Dokumentfreigabe und untrusted Kontext ausschließlich in
  Daten-/Userrolle; keine Systemrollenübernahme.
- Dynamische Modellliste, tatsächliche Antwortmodell-Metadaten, sichere
  401/403/429/400/500-Fehler ohne rohe sensible Serverantworten.
- Begrenzter Retry, tatsächlicher konfigurierter Timeout und HTTP-Abbruch.
- Kein Failover ohne ausdrückliche Zustimmung; technischer Ausweichfall und kein
  Ausweichfall bei Authentifizierungsfehlern.
- Kennzeichnung erfundener lokaler Quellen-IDs und Sperre bekannter Such-/Agentennamen.

## Was die Browserprüfungen tatsächlich nachweisen

Synthetische Antworten nur an der IPC-Testgrenze, nicht als produktive Demo-Werte.

- Unverfälschte Hardware-Nullwerte, 0-Werte, keine HTML-Ausführung aus KI-Antworttext,
  funktionierende Navigation/Schnellaktionen, Responsive-Layouts 390–1480 Pixel und
  reduzierte Animationen.
- Provider-/Modellauswahl aus abgefragter Liste, pro Anbieter gespeicherte Timeout-/
  Retry-Optionen, geleertes Schlüssel-Eingabefeld und keine localStorage-Einträge.
- Diagnoseanzeige eines simulierten Berechtigungsfehlers und Schlüssel-Löschaufruf.
- Lokaler Dateiimport, bewusstes Speichern, Bearbeiten und vollständige Löschbestätigung.
- Versandvorschau, getrennte Dokument-/Ausweichfreigabe, tatsächliche Quellen-/
  Modellanzeige und Verwerfen einer späten Antwort nach Abbruch.
- Mikrofonfreigabe, tastaturbedientes PTT, gemeldeter Pegel am Reactor, Bearbeitung
  des Diktats vor explizitem Versand, Abbruch während Initialisierung/Fokusverlust,
  Freigabeentzug, lokale TTS-Optionen, Abschalten vor verspäteter Antwort und Ausgabe
  erst nach Aufnahmeende.

Hardware, Mikrofon, Audioausgabe und Credential Manager werden hier nicht simuliert
als erfolgreich getestete Windows-Geräteoperationen ausgegeben.

## Nicht ausgeführt / vor Installerfreigabe erforderlich

1. Nativer Windows-MSVC-Compile-/Link-/Starttest und echte WebView2-Laufzeit.
2. Credential-Manager-Roundtrip unter Windows. Vorbereitet und bei `--tests`
   typgeprüft: `credential_roundtrip_replace_and_delete`, standardmäßig ignoriert.
   Er verwendet einen UUID-Testaccount unter `JARVIS.Neural.Test`, keine echten
   API-Schlüssel. Auf Windows gezielt ausführen:
   `cargo test --manifest-path src-tauri/Cargo.toml credential_roundtrip_replace_and_delete -- --ignored`.
3. Konto-/Modelltests mit neu ausgestellten, berechtigten OpenAI-/Groq-Schlüsseln,
   realen Rate-Limits/Kontingenten, Netzwerkausfall und eventuellen Unternehmens-Proxys.
4. Echte Hardware-, SAPI-Erkenner-/Stimmen-/Mikrofon-/Sprachausgabeprüfung. Native
   Implementierung und Ressourcen wurden unverändert übernommen bzw. mitkompiliert.
   Siehe Windows-Prüfplan in `docs/VOICE_ENGINE.md`.
5. Große/komplexe/mehrsprachige PDFs, verschlüsselte und beschädigte PDFs sowie
   Ressourcenmissbrauch: Input-/Textlimits sind vorhanden, aber kein harter
   separater Prozess-/Speicher-Sandbox für PDF-Parser. Keine OCR.
6. Harte Crash-/Stromverlust- und Vollplattenprüfung, forensische Löschung auf
   realen SSDs/Backups. SQLite-Transaktionen/VACUUM sind kein solcher Nachweis.
7. NSIS-Bundle, Installation/Deinstallation, Ressourcen aus tatsächlichem
   Installationsverzeichnis, Code-Signierung. **Kein Installer erstellt.**

## Bewusste Entwicklungsgrenzen

FTS5 ist lexikalisch, keine semantische Vektorsuche. Keine Live-Web-/Server-News.
Modelllisten liefern nicht alle Fähigkeiten/Berechtigungen; ein Modelltest bleibt
notwendig. Die Namenprüfung bekannter Suchmodelle garantiert keine Eigenschaften
aller zukünftigen Anbieterangebote. KI-Quellen können fachlich falsch verwendet
werden; echte übermittelte Belege sind sichtbar, aber kein Wahrheitszertifikat.

Wissensanzeige zeigt bis zu 1.000 Treffer pro Suche; vollständiger Export umfasst
alle Einträge. Exporte/DB sind nicht verschlüsselt. Hohe Datenmengen und lange
geöffnete Chatverläufe wurden nicht lastgetestet. Numeric Retry-After wird beachtet;
HTTP-Datumsformen derzeit nicht gesondert interpretiert. Keine Freigabe als
vollständig getestete Windows-Veröffentlichung aus diesen Cross-Checks ableiten.
