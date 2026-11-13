# Datenschutz und Kosten 1.4

## Standardzustand

Mikrofon, Wake Word und Roh-Audio-Speicherung sind aus. Mikrofonfreigabe und
Wake-Opt-in gelten nur für die aktuelle aktive App-Sitzung. Sie werden nicht in
localStorage oder einer Einstellungsdatei für automatischen Neustart gespeichert.
Das lokale Gedächtnis bleibt standardmäßig aktiviert; neue Sprachdialoge werden
nicht automatisch dauerhaft gespeichert, auch nicht bei einer alten Chat-Opt-in-Einstellung.

## Audio

Die App listet Geräte ohne Aufnahme. Erst eine ausdrückliche Freigabe und eine
Aktivierung (Wake, Einzelaufnahme oder gehaltene Taste) öffnet WinMM im lokalen
Sprachhost. PCM existiert nur in begrenzten Arbeitsspeicherpuffern. Keine Audio-Dateien,
Audio-Cloud, Telemetrie oder Audioübertragung über Tauri/HTTP. React erhält nur
Transkript, Zustand und reale SAPI-Pegelwerte.

„Mikrofon aus“, Escape, Fensterverlust, Gerätewechsel und App-Ende stoppen die
Aufnahme. Ein alter Start darf nach Abbruch nicht wieder aufleben. Bestätigt das
Backend das Beenden nicht, zeigt die App **Mikrofonstatus unbestätigt** und sperrt
automatischen Neustart/weitere Sprachverarbeitung. Sie behauptet nicht, die Hardware
sei ausgeschaltet. In diesem Fehlerfall App schließen und Windows-Mikrofonstatus
prüfen; fehlerhafte Treiber müssen unter Windows untersucht werden.

Während TTS und KI-Verarbeitung ist der Mikrofonprozess geschlossen. Deshalb
keine gleichzeitige Aufnahme der eigenen Ausgabe. Ein Betrieb nur im Hintergrund
oder nach Minimieren wird in diesem Entwicklungsstand nicht angeboten.

## Text zur Cloud

Lokale Hardware-, Modul-, Lautstärke- und Wissensbefehle benötigen keine KI-API.
Für freie Fragen entsteht zunächst nur eine lokale Vorschau. Erst eine konkrete
Bestätigung sendet an OpenAI oder Groq. Übertragen werden:

1. der tatsächliche System-/Sprachvertrag,
2. die ursprüngliche erkannte Frage als Text,
3. optional maximal fünf lokal gefundene Dokumentabschnitte mit Quellenmetadaten,
4. kein Mikrofon-Audio, kein automatischer vollständiger Chatverlauf und keine
   automatisch beigelegten Hardwareinventare oder vollständigen Dateisammlungen.

Dokumentverarbeitung ist standardmäßig gesperrt. Erforderlich sind sowohl die
Datenschutzeinstellung als auch die Einzelfreigabe der konkret angezeigten Abschnitte.
Ein optionaler Ausweichanbieter benötigt eine eigene Zustimmung. Modelllisten
und Verbindungstests werden nur durch die entsprechenden sichtbaren Einstellungen
abgefragt. Der echte Verbindungstest sendet eine kurze Testfrage und kann kostenpflichtig sein.

Es gelten die Datenschutzbedingungen und Preise des gewählten Anbieters:
https://openai.com/api/pricing/ und https://console.groq.com/docs/openai
sowie die jeweiligen Vertragsbedingungen. API-Nutzung ist von einem ChatGPT-Abo
getrennt. Retries und ausdrücklich freigegebene Ausweichanfragen können zusätzliche
Kosten erzeugen. Es werden keine Festpreise oder dauerhaft gültigen Modellnamen erfunden.

## Gedächtnis, Schlüssel und Aufbewahrung

Nur bewusst angelegte/importierte/ausdrücklich bestätigte Notizen und Dokumente
werden in SQLite im Tauri-App-Datenverzeichnis gespeichert (`neural.sqlite3`).
Datei und Exporte sind nicht verschlüsselt. Export, Import, Einzellöschung und
vollständiges Löschen mit `ALLES LÖSCHEN` bleiben vorhanden. Historische Dialogdaten
lassen sich exportieren/löschen; die neue Oberfläche stellt keinen Chatverlauf dar.

Der erkannte Auftrag wird optional zwölf Sekunden angezeigt. Eine offene
Versandvorschau enthält die zur Zustimmung erforderlichen Daten bis zur Freigabe,
Verwerfung oder ihrem Ablauf. Der Ergebnisbereich zeigt jeweils ein aktuelles
Ergebnis, keinen Verlauf. „Sitzungsanzeige leeren“ unter Tools leert diese Anzeige.

API-Schlüssel verbleiben im Windows Credential Manager. Es gibt keinen
Schlüssellesebefehl für das Frontend. Eingabefelder sind Passwortfelder und
werden vor/nach dem sicheren Speichervorgang geleert; keine Schlüssel in
React-Zustand, localStorage, Logs, Exporten oder Quellpaketen. Keine automatische
Übernahme von .env-Schlüsseln und keine externe Synchronisierung.
