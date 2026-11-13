# Rust-/Tauri-Befehle 1.3

IPC-Aufrufe verwenden äußere camelCase-Argumentnamen. Verschachtelte Rust-Strukturen
verwenden die dokumentierten snake_case-Felder. Provider: `openai` oder `groq`.
Kein Befehl gibt einen gespeicherten API-Schlüssel zurück.

| Befehl | Argumente | Ergebnis / Zweck |
| --- | --- | --- |
| `neural_status` | keine | Preferences, tatsächliche DB-Zähler/-größe, Key-vorhanden-Bools, Windows-Vault-Verfügbarkeit; kein Onlineversprechen |
| `neural_settings` | `preferences` | Speichert Provider-/Datenschutzoptionen; verwirft Vorschauen und bricht aktuelle Anfragen ab |
| `ai_key_set` | `provider`, `secret` | Windows Credential Manager hinzufügen/ersetzen; Secret nur transient in IPC/Prozessspeicher |
| `ai_key_delete` | `provider` | Credential löschen; aktuelle Anfragen bestmöglich abbrechen; kein serverseitiger Schlüsselwiderruf |
| `ai_models` | `provider`, optional `requestId` | Frische Konto-Modellliste; eigene Anfragekennung erlaubt Abbruch |
| `ai_test` | `config`, optional `requestId` | Modellliste plus echte kleine Textanfrage; tatsächliches Modell und sicherer Befund, mögliche Kosten |
| `ai_prepare` | `request` | Lokale, einmalige Vorschau mit ID, Frage, Quellen, Nachrichten und Zielanbietern |
| `ai_send` | `requestId`, `documentConsent`, `fallbackConsent` | Bestätigte Anfrage; Text, echter Anbieter/Modell, lokale Kontextquellen, `fallback_used`, optionaler lokaler Speicherhinweis `storage_warning` |
| `ai_cancel` | `requestId` | Vorschau verwerfen oder HTTP/Backoff abbrechen; keine Garantie serverseitiger Stornierung |
| `memory_list` | `query` | Bis zu 1.000 Treffer nach Inhalt/Titel/Metadaten, neueste zuerst |
| `memory_save` | `entry` | Explizites Hinzufügen (`id=0`) oder Bearbeiten; transaktionale Neuindexierung |
| `memory_delete` | `id` | Eintrag/Chunks/Index löschen; ausstehende Vorschauen verwerfen |
| `memory_export` | keine | JSON-String mit Schema 1 und sämtlichen Wissenseinträgen, ohne Schlüssel/Settings/Chats |
| `memory_import` | `json` | Validierter additiver JSON-Import, maximal 10 MB/2.000 Einträge; neue IDs |
| `memory_clear` | `confirmation: "ALLES LÖSCHEN"` | Alle Wissenseinträge, Chunks, FTS-Tabellen und Chats löschen; VACUUM; Schlüssel und Einstellungen bleiben separat |
| `memory_chats` | keine | Bewusst gespeicherte Chats vollständig anzeigen/exportieren; nicht automatisch als RAG-Kontext verwendet |
| `document_import` | `name`, `bytes` (Bytearray), `category`, `metadata` | UTF-8-TXT/Markdown oder Text-PDF lokal extrahieren und indizieren; nur gewählte Datei, kein beliebiger Backend-Dateipfad |

`ProviderConfig`: `{ provider, model, timeout_seconds, retries }`.

`Preferences`: `{ selected, openai: ProviderConfig, groq: ProviderConfig,
privacy: { memory_enabled, persist_chats, document_cloud } }`.

`Prepare`: `{ question, provider, use_knowledge, fallback: Provider|null }`.

`Entry`: `{ id, title, body, category, source, metadata: Record<string,string>, updated }`.
Kategorien: Projekt, Technik, Präferenz, Dokumentation, WoW Forever, Wissen (sowie
Chat für ausdrücklich importierte Einträge). Titel maximal 240 Zeichen, Text
maximal 500.000 Zeichen, maximal 16 kurze Metadatenwerte. Neue/editiere Einträge
bekommen eine echte UTC-Speicherzeit; importierter Stand wird beibehalten.

Source: `{ label, entry_id, title, source, start_char, end_char, text, updated, metadata }`.
`start_char` ist nullbasiert, `end_char` exklusiv. UI zeigt daraus den lesbaren
Zeichenbereich; es werden keine PDF-Seiten erfunden.

Providerfehler: `{ code, message, retryable }`; lokale Speicherfehler sind sichere
Strings. Die UI zeigt keine rohen API-Antworten. Legacy-Adapter liefert weiterhin
`Result<String,String>`.

## Unveränderte Namen und bewusst geändertes internes Verhalten

- `get_system_metrics`: gleiche Parameter-/Antwortstruktur, gleicher echter Sampler.
- `get_ai_status`: weiterhin `{ ready, provider }`, jetzt ausschließlich Credential-
  Manager-Konfiguration für Groq. `ready` ist kein Online-Test.
- `chat_with_groq(message)`: weiterhin String-Antwort; Groq-only, frischer sicherer
  Schlüssel und gewähltes Groq-Modell erforderlich. Keine alte .env-Übernahme und
  keine automatische Weiterleitung zu OpenAI. Als Legacy-Adapter hat dieser Aufruf
  keine extern sichtbare Anfrage-ID; die neue UI benutzt abbrechbare `ai_send`-
  Sitzungen. Frühere Umgebungs-Ersatzschlüssel sind aus Sicherheitsgründen entfernt.
- `voice_capabilities`, `voice_permission`, `voice_start`, `voice_snapshot`,
  `voice_finish`, `voice_cancel`: unveränderte bestehende Schnittstellen.

DB-intensive Arbeit und PDF-Extraktion laufen auf Blocking-Workern. Keine DB-Sperre
bleibt über einen Netzwerk-await gehalten. Benutzerinhalte werden niemals als SQL,
HTML, PowerShell-Code oder Tauri-Berechtigung ausgeführt.
