# Version 1.4.1 – Windows-Stimmenreparatur

Aktuelle Reparatur, Grenzen und Praxistest: [docs/STIMMENREPARATUR_1.4.1.md](docs/STIMMENREPARATUR_1.4.1.md).
Der neue Testinstaller benötigt weiterhin eine persönliche hörbare Windows-Abnahme.
Die folgenden 1.4-Unterlagen dokumentieren die unveränderten übrigen Funktionen.

# J.A.R.V.I.S. 1.4.0 — Autonomous Voice Interface

Überprüfbarer Entwicklungsstand für **Windows 10/11 x64** mit React, TypeScript,
Tauri 2, Rust und SQLite/FTS5. Aktivierungswort: **„Javis“** (ohne r).

Die klassische Chatoberfläche wurde durch einen Sprachablauf mit orange-goldenem
Neural Core, echten Hardwareanzeigen, aktuellem Ergebnis und sechs kompakten
Modul-Overlays ersetzt. Es gibt keinen KI-Texteingabebereich, Nachrichtenverlauf
oder Chat-Navigation. Textfelder dienen nur Einstellungen, Wissenssuche und
bewusster Notizpflege. Alle Module sind per Maus und Tastatur erreichbar.

**Kein Installer.** Die Bundle-Erstellung ist in `src-tauri/tauri.conf.json`
deaktiviert. Der ausführbare Windows-Debug-Build wurde unter Linux nach x64
cross-kompiliert; ein echter Windows-Mikrofon-/Wake-/TTS-Test steht noch aus.
Die Wake-Word-Funktion ist ein experimenteller realer SAPI-Grammatikpfad,
kein vorgetäuschter Erkenner und kein bereits validiertes Hotword-Modell.

## Voraussetzungen und Start unter Windows

- Windows 10/11 x64, WebView2 Runtime, Windows PowerShell 5.1 und .NET Framework 4.8.
- Node-LTS ab 22.6, Rust stable für `x86_64-pc-windows-msvc`, C++ Build Tools/Windows SDK.
- Für Sprache: installiertes **de-DE-Desktop-SAPI-Sprachmodell** und passende
  deutsche Microsoft-Desktop-Stimmen. Eine installierte OneCore-/Cloud-Stimme
  garantiert keine Verfügbarkeit über System.Speech.
- Windows-Einstellungen → Datenschutz → Mikrofon: Zugriff für Desktop-Apps erlauben.
  Die App-Einwilligung ersetzt diese Betriebssystemberechtigung nicht.
- Das gewählte WinMM-Eingabegerät muss 16-kHz-/16-Bit-/Mono-PCM unterstützen.

```powershell
npm ci
npm run check
npm run build
npm test
cargo test --manifest-path crates/neural-core/Cargo.toml --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/voice-host-probe.ps1
npm run tauri dev
```

Die Probe kompiliert/listet nur lokale Fähigkeiten; sie öffnet **kein Mikrofon**.
Für Browserprüfungen: `npx playwright install chromium`, danach `npm run test:ui`.
Eine reine Browser-Vorschau hat keine Tauri-/Windows-Zugriffe und zeigt
„Nicht verfügbar“. Die mitgelieferten Screenshots stammen aus dieser echten
Browser-Situation und enthalten keine eingesetzten Test-Messwerte.

## Erste Sprachsitzung

1. **Voice** öffnen und ein Eingabemikrofon oder Windows-Standard auswählen.
2. Das Mikrofon ausdrücklich für diese Sitzung freigeben.
3. Optional die lokale Wake-Word-Erkennung aktivieren. Erst dann hört die App
   lokal auf „Javis“. Die aktive Aufnahme ist oben dauerhaft sichtbar.
4. „Javis“ sagen, die sichtbare Aktivierung abwarten und den Befehl sprechen.
   Der Kombinationspfad unterstützt auch „Javis, …“ in einer Äußerung, seine
   Zuverlässigkeit muss jedoch erst auf echter Hardware geprüft werden.
5. Alternativ **Zum Sprechen halten** benutzen: Maus, Enter oder Leertaste halten
   und loslassen. **Einmal zuhören** beendet die Aufnahme nach einer Sprechpause.
6. Lokale Aktionen laufen direkt in Rust. Allgemeine Fragen erzeugen zuerst
   eine lokale Cloud-Vorschau. **Cloud-Versand bestätigen** oder die ausdrücklich
   angesagte Bestätigungsphrase verwenden. Für Dokumente und einen Ausweichanbieter
   gelten zusätzliche getrennte Freigaben. Bei unklarer Erkennung abbrechen.
7. **Unterbrechen** stoppt den Auftrag/die Ausgabe. **Mikrofon aus** oder Escape
   beendet auch die Mikrofonfreigabe. Bei Fensterwechsel wird die Freigabe beendet.

Beispiele: „Wie hoch ist meine CPU-Auslastung?“, „Welches KI-Modell verwendest du?“,
„Öffne meine WoW-Guides“, „Suche in meinem lokalen Wissen nach Raid-Strategien“,
„Schalte deine Sprachausgabe leiser“, „Merke dir …“.

Neue Erinnerungen werden erst nach **Aktion bestätigen** gespeichert. Aus einer
KI-Antwort abgeleitete Werkzeugvorschläge brauchen ebenfalls eine zweite lokale
Bestätigung. Freigaben sind einmalig und nach 120 Sekunden ungültig. Ein neues
Kommando, Abbruch oder Fensterwechsel verwirft eine offene Freigabe.

Während KI-Verarbeitung und TTS ist das Mikrofon geschlossen. Deshalb lässt sich
laufende Sprachausgabe über den sichtbaren Unterbrechen-Knopf oder Escape stoppen;
„Javis, stopp“ wird während der Ausgabe absichtlich nicht aufgenommen.
Nach Abschluss kehrt die App nur bei weiterhin gültigem Wake-Opt-in, aktivem
Fenster und bestätigtem Mikrofonzustand in die Bereitschaft zurück.

## KI-Anbieter, Gedächtnis und Datenschutz

In **Einstellungen** OpenAI/Groq auswählen, einen sicheren Schlüssel hinzufügen,
Modelle beim Anbieter abrufen und ein Modell wählen. Ein Verbindungstest ist
explizit auszulösen und kann API-Kosten verursachen. Eine Modellliste oder ein
vorhandener Schlüssel bestätigt keine Online-Verbindung oder Modellberechtigung.

Alle API-Aufrufe bleiben im Rust-Backend. Vorhandene sichere Schlüssel aus Version
1.3 bleiben unter `JARVIS.Neural.1.3` im Windows Credential Manager erreichbar;
es werden keine alten `.env`-Schlüssel importiert. Keine Schlüssel in React-Zustand,
localStorage, Protokollen, Wissensexporten oder Quellpaketen speichern.

SQLite, FTS5, TXT/Markdown/PDF-Import, Quellen, WoW-Metadaten, Bearbeitung, Export,
Import und Löschfunktionen bleiben erhalten. Sprachdialoge werden **nicht**
automatisch dauerhaft gespeichert, auch wenn früher Chat-Persistenz aktiv war.
Historische Dialogdaten können weiterhin exportiert und mit dem Gedächtnis
vollständig gelöscht werden; eine Chatansicht wird nicht mehr angezeigt.

Cloud-Dokumentverarbeitung ist standardmäßig gesperrt. Die Versandvorschau zeigt
Frage, Systemnachrichten und ausgewählte Quellenabschnitte. Ohne ausdrückliche
Einzelfreigabe erfolgt kein Textgenerierungsaufruf. Ein optionaler Providerwechsel
bei technischen Fehlern benötigt eine eigene Zustimmung.

## Lieferung und Nachweise

- Vorabplan: `docs/ARCHITEKTUR_1.4.md`
- Wake Word, Audioarchitektur, Alternativen/Lizenzen: `docs/WAKE_WORD_ARCHITEKTUR_1.4.md`
- Rust-Befehle, KI-Tools und Grenzen: `docs/TOOLS_BERECHTIGUNGEN_1.4.md`
- Datenfluss, Datenschutz und Kosten: `docs/DATENSCHUTZ_1.4.md`
- Ausgeführte und offene Prüfungen: `docs/TESTBERICHT_1.4.md`
- Windows-Audio-Checkliste: `docs/WINDOWS_VOICE_TEST_1.4.md`
- Offene Probleme: `docs/OFFENE_PROBLEME_1.4.md`
- Screenshots: `docs/HUD_1.4_Desktop.png`, `docs/HUD_1.4_Mobil.png`, `docs/HUD_1.4_Voice.png`
- Änderungen: `CHANGELOG_1.4.0.md`

Die 1.2-/1.3-Dokumente und `tests/legacy-1.3` dokumentieren historische Stände.
Für den aktuellen Sprachablauf gelten die 1.4-Dokumente. Die bestehenden
Hardwarebefehle sind unverändert; GPU-Auslastung und Temperaturen bleiben ohne
integrierten Messanbieter ausdrücklich „Nicht verfügbar“. Laufwerke und Netzwerksummen
werden ergänzend über echte lokale sysinfo-Abfragen ermittelt, ohne Internetstatus
oder Datenraten zu erfinden.
