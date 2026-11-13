# Neural Intelligence Core – Architektur

## Bestand und Änderungen

Hardware-Sampler und Voice-Rustmodul wurden aus dem aktuellen 1.2-Stand übernommen.
Die bestehenden Befehle `get_system_metrics`, `get_ai_status`, `chat_with_groq`
sowie alle sechs Voice-Befehle bleiben registriert. Die Arc-Reactor-Darstellung,
Hardware-Nullwerte, Mikrofonfreigabe, Push-to-Talk, Echtpegel und lokale TTS bleiben.

Technisch notwendige Änderung: Der alte Groq-Code las automatisch `.env`-Schlüssel
und ein festes Defaultmodell. Das widerspricht den neuen Sicherheits- und
Modellanforderungen. `get_ai_status` prüft jetzt den neuen Credential-Store;
`chat_with_groq(message)` ist ein kompatibler String-Adapter zum neuen Groq-Dienst.
Er nutzt ausdrücklich gespeicherte Schlüssel und ein gewähltes Modell, keine
Dokumente und keinen anderen Anbieter. Der alte automatische Ersatzschlüssel aus
Umgebungsvariablen wird nicht mehr verwendet. Alle übrigen Voice-/Hardwarebefehle
behalten Eingaben und Antwortformen bei.

## Schichten

- `crates/neural-core`: Tauri-unabhängige Logik für SQLite, Extraktion, Chunking,
  Retrieval, Providertransport, sichere Fehlerklassen, Retry und Cancellation.
- `src-tauri/src/neural.rs`: Betriebsintegration, Credential Manager, App-Datenpfad,
  Vorschau- und Anfrageregister, Datenschutz und Tauri-Befehle.
- `src/useNeural.ts`: UI-Zustand und Ablehnung verspäteter Antworten nach Abbruch.
- `src/NeuralConsole.tsx`: Provider, Modelle, Schlüssel, Wissen und Datenschutz.
- Bestehende Voice Engine nimmt ausschließlich lokal auf. Erkannter Text bleibt
  bearbeitbarer Entwurf. Neue UI-Chats nutzen die anbieterneutrale Vorschau/Senden-
  Grenze statt direkt den alten Groq-Adapter. Optionales TTS liest nur echte,
  nicht abgebrochene Antworten vor.

## Datenbank und Retrieval

SQLite wird gebündelt gebaut, FTS5 ist im ausführbaren Code enthalten. Migration
`user_version 0 -> 1` erfolgt in einer Transaktion. Neuere unbekannte Schemaversionen
werden abgelehnt, nicht überschrieben. Tabellen: `settings`, `entries`, `chunks`,
`chunks_fts`, `chats`. Foreign Keys, Busy-Timeout und `secure_delete` sind aktiviert.
Speichern/Ändern/Löschen synchronisiert Chunks und Suchindex transaktional. Ein
ungültiger JSON-Import wird vollständig abgelehnt. Exporte enthalten alle Einträge,
keine API-Schlüssel und keine Anbieter-/Datenschutzeinstellungen.

`KnowledgeSearch` ist die austauschbare Suchschnittstelle. Der aktuelle Adapter
verwendet FTS5/unicode61 und BM25, keine Embeddings und keine behauptete semantische
Suche. Deutsche Funktionswörter werden reduziert. Suchoperatoren aus Nutzereingaben
werden nicht als FTS-Syntax übernommen. Titel, Kategorie und WoW-Metadaten sind
mitindiziert, während Belegtexte/Positionen unverändert aus dem Dokument stammen.

Chunks sind maximal 1.200 Unicode-Zeichen groß, bevorzugen Zeilen-/Wortgrenzen und
überlappen bis zu 120 Zeichen. Quellen nennen den tatsächlichen extrahierten Text,
Dateinamen, Start-/Endzeichen, gespeicherten Stand und eigene Metadaten. PDF-Seiten
werden nicht geraten. Es werden keine Ausgangsdateien an KI-Anbieter hochgeladen.
PDF-Extraktion läuft außerhalb des UI-Threads mit `pdf-extract 0.12.1`; keine App-
Logger werden initialisiert. Scan-/Bild-PDFs ohne Text werden abgelehnt.

## Einwilligung und unvertrauenswürdige Inhalte

`ai_prepare` erzeugt einen eingefrorenen Backend-Snapshot mit UUID. Die UI erhält
Frage, alle Nachrichten, Quellen, primären und gegebenenfalls alternativen Anbieter.
`ai_send` akzeptiert nur die UUID und Freigaben, keine nachträglich veränderten
Nachrichten. Der Snapshot ist einmal verwendbar. Maximal 20 Vorschauen bleiben im
RAM; ältere Vorschauen können danach ungültig sein. Kein unbemerkter Wiederholversand.

Für lokale Dokumente sind globale Datenschutzfreigabe und konkrete Anfragefreigabe
notwendig. Ausweichanbieter benötigen eine eigene ausdrückliche Freigabe vor dem
Versand. Datenschutzänderungen, Gedächtnislöschungen und Schlüsselentzug verwerfen
betroffene Vorschauen und brechen laufende Anfragen bestmöglich ab. Ein DB-Mutex
und erneute Prüfung vor Chat-Persistenz verhindern Speicherung nach Voll-Löschung.

Dokumente stehen ausschließlich in einer `user`-Nachricht als serialisierte,
markierte `UNTRUSTED_LOCAL_CONTEXT`-Daten. Sie können keine Systemrolle oder
Berechtigung im Code erzeugen. Das Systemprompt erklärt diese Grenze. Es gibt
keine Modellwerkzeuge oder Dokument-Aktionsausführung. Unbekannte `[Snn]`-Belege
werden als unbelegt gekennzeichnet. Echte übermittelte Quellen werden getrennt
unter der Antwort angezeigt; deren bloße Übermittlung beweist nicht, dass jede
Modellaussage sachlich daraus folgt. Prompt-Injection und Halluzinationen sind
nicht allein durch ein Systemprompt garantiert ausgeschlossen; Aussagen prüfen.

## Offizielle Provider-Schnittstellen

Geprüft am 9. November 2026:

| Anbieter | Modelle | Text-Chat |
| --- | --- | --- |
| OpenAI | `GET https://api.openai.com/v1/models` | `POST https://api.openai.com/v1/chat/completions` |
| Groq | `GET https://api.groq.com/openai/v1/models` | `POST https://api.groq.com/openai/v1/chat/completions` |

Quellen: [OpenAI Modelle](https://developers.openai.com/api/reference/resources/models/methods/list),
[OpenAI Chat](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create),
[Groq API](https://console.groq.com/docs/api-reference).

Keine fest verdrahteten produktiven Modellnamen. Modelllisten stammen aus dem
jeweiligen Konto. Bekannte Such-/Agentenkennungen (search/compound/browser/
web-research) sind für diesen Stand gesperrt, um keine ungefragten externen
Recherchefunktionen einzuschalten. Diese Namensprüfung ist keine vollständige
Fähigkeitsbeschreibung zukünftiger Anbietermodelle. Nur reine Textmodelle verwenden
und neue Modelle über den Verbindungstest prüfen. Die App deklariert keine Tools
und sendet `tool_choice: none`. Nicht chatfähige oder nicht berechtigte Modelle
liefern verständliche Modellfehler.

Beide Adapter begrenzen mit `max_completion_tokens=1200`; OpenAI zusätzlich
`store=false`. Dies ist keine Zusage zu allen Aufbewahrungsrichtlinien des Anbieters.
TLS-Ziele sind im Rust-Produktionscode fest; Redirects sind abgeschaltet. Es gibt
keinen benutzersteuerbaren API-Host im IPC. Testserveradressen sind nur im Core-Test
verwendet. Antwortmetadaten stammen tatsächlich aus dem Anbieterfeld `model`.

Pro Provider 5–120 Sekunden Timeout und 0–3 zusätzliche Versuche. Nur technische
Netzwerk-/Zeitlimitfehler, 429 und 5xx sind wiederholbar bzw. bei ausdrücklicher
Freigabe ausweichfähig. 401, 403 und Modellfehler sind es nicht. Backoff beträgt
1/2/4 Sekunden. Numerisches Retry-After wird berücksichtigt; bei mehr als 30
Sekunden wird kein vorzeitiger weiterer Versuch gestartet. HTTP-Datumswerte in
Retry-After werden derzeit nicht gesondert interpretiert. Timeout und Cancellation
gelten auch beim Lesen der Antwort und während Backoff. Abbruch löscht keine bereits
beim Anbieter verarbeiteten Daten und garantiert keine Kostenerstattung.

Rohe HTTP-Fehlerantworten, Header, Schlüssel und Netzwerk-Ausnahmedetails werden
nicht ausgegeben. 401/403/429 werden unterschieden; Konto-/Modell-/Billingursachen
lassen sich aus diesen Codes allein nicht immer eindeutig bestimmen. Die Oberfläche
behauptet deshalb keine präzisere Diagnose als tatsächlich nachgewiesen.
