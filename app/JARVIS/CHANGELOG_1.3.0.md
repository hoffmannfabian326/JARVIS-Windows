# J.A.R.V.I.S. 1.3.0 – Neural Intelligence Core

## Geliefert

- Architekturplan vor Implementierung; neue getrennte Core-/Tauri-/UI-Schichten.
- Anbieterneutrale Rust-Providerkonfiguration für OpenAI/Groq, dynamische Modelllisten,
  Modell-Verbindungstest, unterschiedliche Timeouts/Retry-Einstellungen, Abbruch
  und konkrete, standardmäßig deaktivierte Ausweichfreigabe.
- Windows Credential Manager statt alter automatisch geladener .env-Schlüssel;
  Hinzufügen, Ersetzen, Testen und Löschen, ohne gespeicherte Secrets zurückzugeben.
- Lokales SQLite-Gedächtnis mit Migration, explizitem Speichern/Bearbeiten/Löschen,
  Suche, additivem JSON-Import, vollständigem Export und bestätigter Voll-Löschung.
- TXT-/Markdown-/Text-PDF-Import; Unicode-Chunks mit echten Positionen und FTS5/BM25.
  Austauschbare Suchschnittstelle; keine eingebauten Embedding-/Cloud-Vektordienste.
- Lokale, unveränderliche Versandvorschau, globale und anfragebezogene Dokumentfreigabe,
  pro Chat abschaltbare Wissenssuche, tatsächliche Modell-/Anbieteranzeige und Quellen.
- WoW-Forever-Kategorie und frei gepflegte Raid-/Boss-/Klassen-/Rollen-/Versionsmetadaten.
- Datenschutzbereich, optionale Chat-Persistenz, Chatansicht/-export und lokale Löschung.
- Bestehendes Arc-Reactor-HUD, Hardwarefunktionen und lokale deutsche Voice Engine
  beibehalten. Diktat bleibt bearbeitbar und muss auch die neue Versandprüfung durchlaufen.
- Keine aktuellen Webquellen, automatische Datensynchronisation, Daueraufnahme,
  versteckte Telemetrie, Installer-Erstellung oder App-Veröffentlichung.
- Getrennte lokale Entwicklungs-CSP für Vite; Produktions-CSP nicht aufgeweicht.

## Bewusste Schnittstellenänderungen

Die vorhandenen Kommandonamen bleiben erhalten. Der Groq-Altadapter verwendet jetzt
bewusst gespeicherte Credentials und ein ausgewähltes Modell statt automatischer
.env-Schlüsselübernahme/festem Defaultmodell. Die zwei früheren Umgebungs-Schlüssel
werden nicht weiter automatisch rotiert. Die neue Multi-Provider-UI verwendet
`ai_prepare`/`ai_send`; `chat_with_groq(message)` bleibt als Groq-only-String-Adapter
für bestehende Aufrufer erhalten. Alte Schlüssel müssen ausdrücklich neu hinterlegt
werden. Details: `docs/RUST_BEFEHLE_1.3.md`.

## Prüfung und Freigabe

Die tatsächlich ausgeführten Prüfungen und offenen Windows-/Konto-/Sicherheitsgrenzen
stehen in `docs/TESTBERICHT_1.3.md`. Ein Entwicklungsstand mit grünen automatisierten
Prüfungen ersetzt keine native Windows- und Kontoabnahme. Installer erst nach
weiterer Prüfung und ausdrücklicher Freigabe.
