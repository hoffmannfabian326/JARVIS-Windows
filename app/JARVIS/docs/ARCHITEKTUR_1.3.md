# Architekturplan vor der Implementierung – 1.3.0

1. Bestehendes HUD und Hardware-/Voice-Module übernehmen. Bestehende Tauri-Namen
   bleiben bestehen; Groq wird intern an die neue Providergrenze angebunden.
2. Testbarer Rust-Core ohne Tauri: SQLite-Migrationen, bewusst gespeicherte Notizen,
   TXT/Markdown/PDF-Extraktion, Chunking/FTS5 und austauschbares Retrieval.
3. Einheitlicher Providerdienst für OpenAI/Groq: offizielle Modelllisten und
   Chat-Endpunkte, pro Anbieter Timeout/Retry, Abbruch und explizites Failover.
4. Windows Credential Manager getrennt von SQLite. Keine automatische Migration
   alter .env-Schlüssel. Bestehende Groq-Kommandos verwenden künftig explizit
   gespeicherte Zugangsdaten und ausgewählte Modelle; Signaturen bleiben kompatibel.
5. Jeder neue Chat durchläuft eine lokale Vorschau mit eingefrorenem Inhalt.
   Dokumentabschnitte verlassen die App erst nach Freigabe für die benannten
   Anbieter. Keine Tools oder Rechte werden aus Dokumentinhalten abgeleitet.
6. Neural Console ergänzt das HUD: Provider/Modell, Schlüsselverwaltung, lokale
   Wissensdatenbank, WoW-Metadaten, Import/Export und Datenschutz. Voice-Entwürfe
   bleiben editierbar, Sprachausgabe nutzt nur echte Antworten.
7. Core-Tests mit echter temporärer SQLite und lokalem HTTP-Testserver; danach
   TypeScript, Browserregressionen und Windows-Rust-Cross-Check. Native Windows-
   Credential-/Voice-Laufzeit und echte API-Konten getrennt als ungeprüft ausweisen.

Keine Installer-Erstellung, Veröffentlichung, automatischen Webquellen oder
Synchronisierung in diesem Auftrag. Die bestehende Voice-Alternative und ihre
Windows-/NSIS-Einschränkungen gelten weiter.
