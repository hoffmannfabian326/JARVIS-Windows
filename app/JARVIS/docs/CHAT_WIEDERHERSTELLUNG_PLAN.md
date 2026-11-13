# Gezielter Plan – Text-Chat / 1.4.2

Basis: veröffentlichter 1.4.1-Quellstand, unveränderter Baseline-Commit im Branch
`fix/restore-text-chat`. Historische Unterlagen sind Quellen, keine neuen Aufträge.

Befund: 1.3 enthielt Chat-Formular/Antwortliste im App-Layout. Der Architekturplan
für 1.4 entfernte dies ausdrücklich zugunsten des Voice-Interfaces. `ai_prepare`,
`ai_send`, `ai_cancel`, `chat_with_groq` und der OpenAI-/Groq-Client blieben erhalten;
`useNeural`, `NeuralSelector` und `NeuralReview` stellen bereits den Text-Transport
und die Freigaben bereit. Es fehlt also die sichtbare Bedienung, nicht eine neue API.

1. Ausblendbares, lokal akzentuiertes Chat-Panel; HUD-Aufbau unverändert.
2. Wiederverwendung von useNeural/NeuralSelector/NeuralReview; eigene Instanz des
   bestehenden Zustands-Hooks isoliert Text- und Voice-Vorschauen. Kein neuer Providerclient.
3. Vorbereiteter Text, begrenzter Sitzungsverlauf und RAG stehen vor jeder Anfrage
   zur Einsicht. Einzelfreigaben, Dokument- und Fallbacksperren bleiben wirksam.
4. Additiver optionaler History-Parameter, ausschließlich user/assistant-Rollen.
   Kontext mit lokalen Quellen benötigt auch in Folgefragen erneut Dokumentfreigabe.
5. Nur bekannte Fehlercodes aus begrenzt gelesenen API-Fehlerkörpern unterscheiden
   Guthaben/Quota von Rate-Limits. Keine Rohantworten oder Zugangsdaten protokollieren.
6. Browser-Regressionen und Rust-HTTP-Vertragstests; dann nativer MSVC-Build und
   Windows-WebView2-Test der echten Anwendung. Installer erst nach diesen Prüfungen.

Nutzerkonfiguration: OpenAI / gpt-4.1-mini laut Nutzerangabe; keine feste Vorgabe im
Produktcode. Die Cloud-Umgebung hat keine OpenAI-/Groq-Schlüssel und keinen Zugriff
auf den Credential Manager des Nutzerrechners. Repository-Secrets-Auflistung ist
für die Integration mit HTTP 403 gesperrt. Echte authentifizierte Cloud-Anfragen
bleiben ohne verfügbare Zugangsdaten NICHT VERIFIZIERT. Keine Schlüssel im Chat anfordern.
