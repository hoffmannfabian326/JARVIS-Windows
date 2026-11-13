# KI-Tools, Rust-Befehle und Berechtigungen 1.4

Eine KI-Antwort ist Text oder ein Vorschlag. Es gibt keine automatische Ausführung,
Shell, beliebige Dateipfade, Systemskripte, Berechtigungserweiterung oder freie
Tool-Registrierung. Das bestehende Provider-Backend verwendet weiterhin
`tool_choice: none`. Die eigene JSON-Vorschlagsschnittstelle wird in Rust streng
gegen ein geschlossenes Enum geprüft (`deny_unknown_fields`).

## Erlaubte Aktionen

| `kind` | Argumente | Wirkung | Freigabe |
|---|---|---|---|
| `hardware` | metric: cpu/ram/gpu/temperatures/storage/network/all | echte lokale Systemabfrage, Unbekanntes bleibt unbekannt | direkter lokaler Sprach-/Buttonauftrag; KI-Vorschlag separat bestätigen |
| `provider_status` | keine | gewählter Anbieter/Modell, kein Online-Nachweis | wie oben |
| `search_knowledge` | query ≤400 Zeichen, category null/„WoW Forever“ | lokale FTS-Suche, echte Quellen/Positionen, optional vorlesen | wie oben; keine Cloud-Verarbeitung |
| `open_module` | knowledge/wow/news/tools/voice/settings | genau eines der sechs Overlays | wie oben |
| `set_volume` | value 0–100 | TTS-Lautstärke dieser Sitzung | wie oben |
| `set_speech` | enabled boolean | lokale Sprachausgabe ein-/ausschalten | wie oben |
| `remember` | text ≤8.000 Zeichen | bewusst gespeicherte lokale Notiz | immer explizite Einzelfreigabe |
| `web_search` | keine | meldet fehlende Schnittstelle | führt keine Recherche aus |
| `cloud_question` | question ≤8.000 Zeichen | nur lokale Vorschauvorbereitung | separate Cloud-/Dokument-/Fallback-Freigaben vor jeder tatsächlichen Anfrage |

Neue Sprachaufträge werden zunächst lokal geroutet. Freie allgemeine Fragen
gehen erst nach Kosten-/Datenfreigabe an die gewählte KI. Sie darf im Ergebnis eine
zulässige Aktion vorschlagen. **Jeder** KI-Vorschlag, auch eine reine Leseaktion,
braucht vor Ausführung eine zweite lokale Bestätigung. Ungültige JSON-/Toolausgaben
werden abgewiesen; reine Prosa bleibt nicht ausführbarer Antworttext.

## Neue Tauri-Befehle

- `voice_devices()` → `{devices:[{id,name}], default_id}`; keine Aufnahme.
- `get_dashboard_details()` → echte Laufwerke und Netzwerksummen; keine erfundenen
  Netzwerkqualitäten, Geschwindigkeiten oder Internetzustände.
- `assistant_plan(utterance, volume)` → `{id,action,summary,confirmation,origin}`.
  Es findet kein API-Aufruf statt. Ein neuer Plan verwirft den vorherigen.
- `assistant_run(plan_id, confirmed)` → `{text,action,sources,origin}`; verbraucht
  einen Plan einmalig. Alter/Bestätigung werden im Backend geprüft, nicht nur in React.
- `assistant_cloud_prepare(plan_id, provider, use_knowledge, fallback)` → lokale
  Versandvorschau einschließlich `messages` und ursprünglicher `utterance`.
- `assistant_cloud_send(request_id, confirmed, document_consent, fallback_consent)`
  → bestehendes `ChatReply` mit tatsächlich verwendetem Anbieter und Modell.
  Neue Sprachdialoge werden nie automatisch persistiert. Die bestehende
  `persist_chats`-Option aus 1.3 hebt diese Grenze nicht auf.
- `assistant_model_response(text)` → Antworttext oder neuer, separat freizugebender
  Plan; dieses Kommando führt keine Aktionen aus.
- `assistant_cancel()` → verwirft offene lokale Pläne und Sprach-Cloud-Freigaben.
  Laufende Provider-Anfragen werden zusätzlich über das vorhandene `ai_cancel` beendet.

Tauri-JavaScript verwendet die gewohnten camelCase-Argumente, z. B. `planId`,
`requestId`, `documentConsent`. Rust verwendet snake_case.

## Bestehende Schnittstellen

`get_system_metrics`, `get_ai_status`, `chat_with_groq`, alle `neural_*`, `ai_*`,
`memory_*`, `document_import` und bisherigen `voice_*`-Befehle bleiben registriert.
Hardwareabfrage und SQLite-Implementierung bleiben gegenüber 1.3 unverändert.

Additive Änderungen:

- `voice_start.request.mode`: zusätzlich `wake`; neue optionale `device_id`,
  `confidence`, `silence_ms`. Bisherige Listen-/Speak-Anfragen bleiben gültig.
- Snapshot: zusätzliche Zustände `armed`, `activated` und Feld `activated`.
- `voice_cancel`: auf Erfolg weiterhin leer/null; ein nicht bestätigtes Prozessende
  liefert jetzt einen Fehler statt ihn zu verschweigen.
- Provider-`Preview`: optionales/default-falsches `voice_tools`. Nur der neue
  Sprachpfad setzt es. Der JSON-Vorschlagsvertrag liegt im **System**-Kontext;
  die ursprüngliche Frage und untrusted Dokumente bleiben Daten. Alte Aufrufe
  erhalten ihre bisherigen Nachrichten ohne den Sprachvertrag.
- Bundle-Erstellung deaktiviert; Windows-Desktop-Bibliotheksziel `rlib`.

Die Credential-Manager-Kennung `JARVIS.Neural.1.3` und Tauri-App-Kennung
`com.jarvis.commandcenter` bleiben stabil. Kein Import alter Umgebungsschlüssel,
keine Datenbankschemaänderung, keine automatische Löschung bestehender Inhalte.

## Bestätigungen und Grenzen

Pläne/Sprach-Cloud-Freigaben gelten maximal 120 Sekunden und sind einmalig.
Fehlende/abgelaufene/verbrauchte Bestätigungen werden im Rust-Backend abgewiesen.
Eine neue Erinnerung ist eine Notiz mit leerem Dateiquellenfeld und tatsächlicher
Eingabemetadaten-Kennung; sie erhöht nicht fälschlich den Dokumentzähler.

Stimmliche Freigabe ist keine Sprecher-Authentifizierung. Sicherheitskritische
OS-Aktionen werden deshalb nicht angeboten. API-Aufrufe können trotz Abbruch
bereits Kosten verursacht haben; eine serverseitige Ausführung lässt sich durch
lokales Abbrechen nicht rückgängig machen.
