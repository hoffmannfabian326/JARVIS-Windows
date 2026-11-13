# Vorabplan: J.A.R.V.I.S. 1.4 — Autonomous Voice Interface

Stand vor der Implementierung: 12.11.2026. Basis ist der isoliert erhaltene 1.3-Quellstand.

1. Arc-Dashboard ohne Chat: Graphit/Orange/Gold, großer Kern, echte Hardwarewerte,
   Status-/Ergebnisbereich und sechs Overlays. Keine Nachrichtenblasen oder Texteingabe
   für KI-Fragen; Textfelder bleiben für Einstellungen, Suche und bewusste Wissenspflege.
2. Lokaler Windows-Sprachhost: vorhandenes System.Speech, exakte de-DE-Choices-Grammatik
   `Javis`, konfigurierbarer Konfidenzschwellwert. Kein belastbar behauptetes Wake-Word-
   Qualitätsniveau. Native Mikrofonliste, explizite Auswahl und lokale PCM-Zuführung
   über WinMM, keine Roh-Audiodateien. Push-to-Talk/Einzelaufnahme als Rückfallebene.
3. Zustandsautomat: aus → lokales Wake-Listening → aktiviert → Befehlsaufnahme →
   Verarbeitung/Bestätigung → TTS → Bereitschaft. Kein gleichzeitig geöffnetes Mikrofon
   während TTS/KI-Ausführung; Abbruch, Generationen, Zeitlimits, Cooldown, Fensterwechsel,
   Geräteverlust und App-Ende stoppen die Aufnahme. Wake-Opt-in gilt nur für diese Sitzung.
4. Geschlossene Intent-/Tool-Liste in Rust: echte Hardware, Providerstatus, lokale FTS-
   Suche, Modul öffnen, Lautstärke, Sprachausgabe stoppen, bewusstes Speichern. Keine
   Shell, beliebige Pfade, generische Werkzeuge oder KI-Rechteeskalation. Nicht erkannte
   freie Fragen dürfen nach transparenter Einzelfreigabe an vorhandene Provider gehen.
   Eine KI-Antwort ist grundsätzlich Daten/Text, niemals unmittelbar ausführbarer Code.
5. Bestehender Neural-Kern bleibt bestehen: OpenAI/Groq, Credential Manager-Service
   `JARVIS.Neural.1.3` (bestehende sichere Schlüssel erhalten), SQLite und RAG, Vorschau/
   Abbruch/Fallbackzustimmung. Cloud-Kosten und Dokumentabschnitte werden vor Versand
   ausdrücklich bestätigt. Neue Sprachsitzungen werden nicht automatisch persistiert.
   Neue Erinnerungen benötigen eine einmalige lokale, zeitlich begrenzte Bestätigung.
6. Prüfungen: deterministische Rust-Intent-/Berechtigungstests, bestehende Core-Tests,
   TypeScript/React, Browserflüsse inkl. Audio-Doubles, Windows-Cross-Compilation und
   Tauri-App-Build ohne Bundle. Windows-Audio/echtes Wake Word/echte Provider werden
   nur bei tatsächlich vorhandener Laufzeit/Zugang ausgeführt und sonst offen benannt.

Schnittstellen: alte Tauri-Befehle erhalten; Voice-Start wird um explizite optionale
Gerätewahl/Wake-/Silence-Einstellungen ergänzt, Snapshot um `activated`/`armed`.
Neue typisierte Assistant- und Gerätebefehle werden separat registriert.
Keine Installer-Erstellung, Veröffentlichung oder Hintergrund-Cloudverarbeitung.
