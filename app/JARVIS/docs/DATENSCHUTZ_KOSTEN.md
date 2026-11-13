# Datenschutz, lokale Daten und API-Kosten

## Standardzustand

- Lokales Gedächtnis an, aber keine automatische Übernahme persönlicher Chats.
- Chat-Persistenz aus, Dokument-Cloud-Verarbeitung aus, Ausweichanbieter aus.
- Keine automatisch übernommenen alten Schlüssel. Keine Modellabfrage oder
  Verbindungstests im Hintergrund. Anbieterzugriff erst durch Nutzeraktionen.
- Mikrofonfreigabe aus; kein Hotword- oder Daueraufnahmebetrieb.
- Keine Nachrichten-/Web-/WoW-Serverquellen, Telemetrie oder Synchronisierung.

## Schlüssel

Speicherung mit `keyring`/Windows-native im Credential Manager des angemeldeten
Windows-Benutzers. Dienst `JARVIS.Neural.1.3`, getrennte Konten `openai` und `groq`.
Das Passwort-Eingabefeld ist unkontrolliert; React hält den Wert nicht im Component-
State und leert das Feld unmittelbar beim Speichern/Ersetzen. Der Wert passiert
unvermeidbar kurzzeitig DOM, IPC und Rust-Prozessspeicher. Er wird weder an SQLite,
localStorage, Exporte, Konsole noch Telemetrie übergeben. Kein Lesebefehl für Secrets.
Auf anderen Plattformen kein unsicherer Ersatzspeicher.

Eine Schlüssel-Löschung entfernt das lokale Credential. Sie widerruft den Schlüssel
nicht beim Anbieter und kann bereits verarbeitete API-Anfragen nicht zurücknehmen.
Gegebenenfalls zusätzlich im Anbieter-Dashboard widerrufen. Same-user-Malware oder
Administratorzugriff sind nicht durch diese App beherrschbar.

## Was an den Anbieter geht

Nach konkreter Bestätigung: festes deutsches Systemprompt, die bestätigte aktuelle
Frage und optional maximal fünf tatsächlich gefundene lokale Abschnitte einschließlich
Quellname, Position, Stand und eigener Metadaten. Die vollständigen Nachrichten
werden in der Vorschau angezeigt. Keine Original-PDF-Dateien, keine Audiodaten,
keine hardwarebezogenen Messwerte und keine gesamten Chatarchive. Vorherige Chats
werden nicht automatisch als Kontext eingespeist.

Anbieter und Modell stehen vor dem Versand fest. Ein optionales Ausweichziel ist
mit eigenem Modell sichtbar und braucht eine separate konkrete Freigabe. Ein
Timeout beweist nicht, dass die erste Anfrage den Anbieter nicht erreicht hat.
Retry/Failover kann daher zusätzliche Verarbeitung und Kosten verursachen.

Providerzugriff erfolgt ausschließlich im Rust-Backend, mit festen TLS-Zielen und
ohne Redirect-Folgen. Die UI hat keine Provider-Netzwerkberechtigung. Die
Produktions-CSP bleibt eng; eine getrennte Entwicklungs-CSP erlaubt ausschließlich
den lokalen Vite-Server/Hot-Reload. Keine neuen Tauri-Shell-, Dateisystem- oder
SQL-Pluginrechte; Import liest nur die vom Nutzer im Dateifeld gewählte Datei.

Bei OpenAI wird `store=false` gesetzt. Das hebt andere Anbieteraufbewahrungs-,
Sicherheits- oder gesetzlichen Regelungen nicht auf. Vor Nutzung die jeweiligen
[OpenAI-Datenschutzinformationen](https://openai.com/policies/privacy-policy/) und
[Groq-Richtlinien](https://groq.com/privacy-policy/) prüfen. Die App kontrolliert
keine anbieterinterne Verarbeitung oder Betriebssystem-Telemetrie.

## Lokales Gedächtnis und Löschung

SQLite `neural.sqlite3` unter dem von Tauri bestimmten lokalen App-Datenverzeichnis.
Datenbank und explizite JSON-Exporte sind **nicht verschlüsselt**. Dateizugriff,
Windows-Kontoschutz und Gerätespeicherverschlüsselung bleiben relevant. Keine
automatischen Backups oder externen Kopien. Exportdateien selbst schützen.

Bewusst gespeicherte Notizen/Dokumenttexte sind bearbeitbar und löschbar. FTS-Index
und Chunks werden mitgeführt. Bei vollständiger Löschung werden Wissenseinträge,
Chunks, gespeicherte Chats und die FTS-Tabellen entfernt bzw. neu erstellt und die
Datenbank kompaktiert. Ausstehende Vorschauen werden verworfen; Anfragen abgebrochen.
Credential-Manager-Schlüssel und Provider-/Datenschutzeinstellungen bleiben separat
bestehen und können gesondert geändert/gelöscht werden. Ein aktiviertes Chat-Speicher-
Opt-in bleibt für zukünftige Anfragen bestehen, bis es ausgeschaltet wird.

`secure_delete` und VACUUM sind kein forensischer Löschbeweis für SSDs, Betriebssystem-
Backups, eigene Exporte oder bereits übertragene Cloud-Inhalte. Diese Kopien sind
nicht Bestandteil des lokalen Löschvorgangs.

## Kosten und Modellgrenzen

Die App berechnet keine verbindlichen Tokenpreise oder Kostenprognosen. Preise,
Kontingente und verfügbare Modelle ändern sich. Prüfen: [OpenAI API-Preise](https://openai.com/api/pricing/)
und [Groq-Preise](https://groq.com/pricing/). Ein vorhandener Schlüssel oder eine
Modellliste ist weder ein kostenloses Kontingent noch eine Berechtigungsgarantie.

Schon ein Verbindungstest sendet eine kleine echte Modellanfrage und kann kosten.
Dokumentabschnitte erhöhen den Eingabekontext. Antworten sind auf 1.200 Completion-
Tokens begrenzt, wobei modellabhängig auch Reasoning dieses Budget verbrauchen kann.
0 zusätzliche Versuche ist der Standard; pro Anbieter sind bis zu 3 weitere
Versuche möglich. Ein freigegebener anderer Anbieter kann weitere Kosten auslösen.
Abbruch stoppt die lokale Verarbeitung/Antwortannahme, ist aber keine Zusage zur
serverseitigen Stornierung oder Erstattung.

401 bedeutet ungültige Authentifizierung, 403 verweigerten Zugriff, 429 Rate-Limit
oder Kontingent. Die App unterscheidet diese Codes und schützt rohe Fehlerdetails.
Ob ein 403 aus Konto-/Projekt-, Modell- oder sonstigen Zugriffsregeln stammt bzw.
welches konkrete Kontingent ein 429 betrifft, muss im Anbieter-Dashboard geprüft
werden. Kein erfundener erfolgreicher Verbindungstest.
