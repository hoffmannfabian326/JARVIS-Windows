# J.A.R.V.I.S. 1.4.2 – Text-Chat wiederherstellen

Stand: 13.11.2026. Branch: `fix/restore-text-chat`.
Basis: unveränderter, im Branch separat eingecheckter 1.4.1-Quellstand aus dem
veröffentlichten Paket (SHA-256 f0d33a9bedf0cae4421fa460ac6a2fc01ff8020c0b8e3e686653b9b5f6de7ae1).
Der Standardbranch wird nicht geändert. Vorabplan: CHAT_WIEDERHERSTELLUNG_PLAN.md.

## Warum der Chat verschwunden war

In 1.3 war der Chat Bestandteil von `App.tsx`. Der Architekturplan von 1.4 entfernte
Texteingabe und Chatblasen ausdrücklich für das Autonomous Voice Interface. Das
war eine Layout-/Bedienentscheidung, kein Nachweis einer ausgefallenen OpenAI-API.
`ai_prepare`, `ai_send`, `ai_cancel`, `chat_with_groq`, Credential Manager und der
Providerclient blieben vorhanden. Auch `useNeural`, `NeuralSelector` und `NeuralReview`
enthielten den benötigten Textpfad weiterhin. Dieser bestehende Pfad wird verwendet.

## Umsetzung und begrenzte Schnittstellenänderung

- `src/ChatPanel.tsx`: ein-/ausblendbarer Drawer, Text/Enter/Zeilenumbruch, lokale
  Versandvorschau, explizites Senden, Antworten/Quellen/Provider/Modell, Fehler,
  Abbruch und Sitzungsverlauf. Text wird als React-Text dargestellt, nie als HTML
  oder ausführbare KI-Aktion. Quellen sind ausschließlich echte Backend-Quellen.
- `src/App.tsx`: Chat-Schalter, Pause/Abbruch der Sprachsitzung und Rückkehr zur
  vorhandenen Steuerung. Aufbau und Hardwareanzeigen bleiben bestehen.
- `src/style.css`: ausschließlich zusätzliche, dezente Cyan-Regeln für den Drawer;
  bestehende Orange-/Gold-HUD-Regeln werden nicht ersetzt.
- `src/useNeural.ts`: vorhandenes Prepare/Send/Cancel wiederverwenden. Eine eigene
  Instanz desselben Hooks isoliert Text- und Sprachzustände; es gibt keinen zweiten
  Providerclient. `prepare` liefert die vorbereitete Vorschau zurück.
- `src/NeuralConsole.tsx`: vorhandene Anbieter-/Modell- und Freigabekomponenten;
  Datenschutzstatus für dauerhaft gespeicherte Text-Chats wieder sichtbar.
- `crates/neural-core/src/provider.rs`: optionale begrenzte History, sichere
  Fehlercode-Klassifikation für Quota/Guthaben/Rate-Limit/Modellberechtigung.
- `src-tauri/src/neural.rs`: History in bestehendem `ai_prepare` validieren und in
  der Vorschau einfrieren; Dokumentfreigabe auch bei lokalem Kontext in History.
- `src-tauri/src/assistant.rs`: neue optionale History für Voice explizit leer lassen.
- Tests, Dokumente und Versionsmetadaten ergänzen den Patch; alle Rust-Befehle bleiben.

Additiv: `ai_prepare.request.history` ist optional (Standard `[]`). Ein Eintrag hat
`role: user|assistant`, `content`, `local_context` (Standard false). Keine system-/tool-
Rollen, maximal 20 Nachrichten, 24.000 Zeichen insgesamt, 8.000 pro Nachricht. Die
bestehende Preview enthält die eingefrorene History; die vollständigen Nachrichten
sind vor dem Senden einsehbar. Ältere Nachrichten werden nur in dieser begrenzten
Form wieder mitgesendet. Produktcode enthält kein fest vorgeschriebenes Core-Modell.
OpenAI/gpt-4.1-mini ist die vom Nutzer genannte Testkonfiguration; die tatsächliche
App-Auswahl kommt unverändert aus den vorhandenen Einstellungen.

## Datenschutz und Fehlerbehandlung

Jede kostenpflichtige Anfrage benötigt eine ausdrückliche Cloud-Bestätigung.
Dokumentinhalte und frühere Antworten aus Dokumentkontext benötigen zusätzlich
aktiven Datenschutzschalter plus Einzelfreigabe. Diese Herkunft wird bereits aus
übermitteltem Kontext bestimmt, nicht erst aus vom Modell zitierten Quellen.
Weiterleitung an einen anderen Anbieter braucht unverändert eine eigene Freigabe.
Text-Chat ruft niemals `assistant_model_response` oder ein lokales Werkzeug auf.

Der neue Chat verwendet ausschließlich Backend-Aufrufe und übernimmt keine Schlüssel
in Frontend-Zustand, localStorage, Protokolle oder Quellcode. Die vorhandene sichere
Schlüsseleingabe bleibt unverändert. Temporärer Verlauf ist nur App-Sitzung; bestehendes
explizites `privacy.persist_chats` gilt für Text-Chats und wird sichtbar angezeigt.
Sprachdialoge werden weiterhin nicht automatisch gespeichert. „Sitzung leeren“ leert
nur die Anzeige, nicht bereits bewusst gespeicherte SQLite-Chats. Vollständiges Löschen
und Export verbleiben im vorhandenen Gedächtnisbereich.

Bei API-Fehlern werden höchstens 8 KiB Antwortkörper für maximal zwei Sekunden gelesen.
Nur bekannte `error.code`/`error.type`-Werte führen zu festen, verständlichen Meldungen;
keine rohen Antworten werden angezeigt oder geloggt. 401, 403, Quota/Guthaben, 429,
Modell-, Netzwerk-, Timeout- und Serverfehler bleiben unterscheidbar. Quota wird
weder wiederholt noch automatisch als technischer Fehler weitergeleitet. Unbekannte
429-Ursachen lassen sich ohne offiziellen Fehlercode nicht zuverlässig als fehlendes
Guthaben bestimmen; sie werden als Rate-Limit mit Hinweis auf Anbieterlimits gemeldet.

## Nachweise und Grenzen

Frische Ausführungsergebnisse: beim Release geliefertes BUILD_REPORT_1.4.2.md und
WINDOWS_CHAT_SMOKE.json. Browser-Fixtures ersetzen IPC und sind keine echten
OpenAI-/Groq-Antworten. Rust-HTTP-Testserver prüfen erfolgreiche echte HTTP-
Antwortverarbeitung und Fehlercodes lokal, ohne Produktivkonten. Der neue Öffnungs-
Regressionstest schlug am ursprünglichen 1.4.1-Stand wegen fehlendem Chat-Schalter fehl.

Windows-Test: reale Release-Anwendung mit WebView2, keine ersetzte Tauri-Grenze.
CDP/Debug-Port wird ausschließlich per Umgebungsvariable für den isolierten CI-
Testprozess eingeschaltet, nicht im Produkt oder Installer. Ein temporärer,
ausdrücklich ungültiger Testwert wird über das echte Backend im Credential Manager
gespeichert und wieder gelöscht. Nur mit verifizierter ausgehender Firewall-Sperre
für genau diese exe darf die Anfrage ausgelöst werden. Es wird kein Dummy-Schlüssel
an OpenAI/Groq gesendet. Geprüft werden Eingabe, lokale Rust-Vorschau, Nutzer-
konfiguration, Senden bis zum realen Netzwerkfehler, Fehleranzeige, Providerwechsel
und erhaltenes Voice-Panel. Ein erfolgreicher Provider-Chat wird damit nicht behauptet.
Der Test benötigt auf dem Runner Firewall-Rechte; die ausgelieferte Anwendung nicht.

Echte authentifizierte OpenAI-/Groq-Anfrage: NICHT VERIFIZIERT, falls keine sicher
zugänglichen Schlüssel verfügbar sind. Die Entwicklungsumgebung hat keine entsprechenden
Umgebungsvariablen/Secret-Bindings und keinen Zugriff auf den Windows Credential Manager
des Nutzers. Die Integration darf Repository-Secrets nicht einmal auflisten (403).
Keine Tokenwerte oder Schlüssel wurden angefordert, ausgegeben oder hochgeladen.

Windows-10/11-Nutzerrechner, hörbare Stimme, echtes Mikrofon/Wake-Word und akustische
Rückkopplung bleiben ohne dessen Hardware NICHT VERIFIZIERT. Native Build-/GUI-Tests
auf Windows Server sind kein vollständiger Windows-10/11-Abnahmenachweis.

## Praxistest und Rücknahme

1. Alte App schließen, Testinstaller installieren. Header-Version 1.4.2 prüfen.
2. KI-Chat öffnen. Die gespeicherte Auswahl OpenAI / gpt-4.1-mini prüfen; Modelle
   bei Bedarf über die vorhandene offizielle Modellabfrage aktualisieren. Keine
   feste Verfügbarkeitsgarantie für ein Modell.
3. „Antworte kurz auf Deutsch: Was ist ein Test?“ eingeben. Enter/Vorschau, dann
   vollständige Daten prüfen und Cloud-Versand bestätigen (API-Kosten möglich).
4. Tatsächliche Antwort und Provider-/Modellangabe prüfen; Folgefrage stellen.
   Abbruch und Ausblenden testen. Fehlerstatus ist keine erfolgreiche Verbindung.
5. Bestehende Stimme, Hardware, Mikrofon und separat freigegebenes „Javis“ prüfen.
   Für Dokumente und Ausweichanbieter gelten weiterhin gesonderte Freigaben.
6. Bei Problemen den isolierten Patch-Commit zurücknehmen oder den unveränderten
   1.4.1-Quellstand verwenden. Vor Installations-/Datenbankänderungen eigene Daten
   exportieren. Keine Schlüssel oder privaten Chattexte in Fehlerberichte kopieren.

Kein Standardbranch-Merge. Installer unsigniert, Test-Prerelease v1.4.2-beta.1.
