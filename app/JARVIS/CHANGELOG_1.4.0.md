# J.A.R.V.I.S. 1.4.0 — Autonomous Voice Interface

- Klassische Chatoberfläche/Chatnavigation durch einzelnes HUD mit orange-goldenem
  holografischem Kern, aktuellem Kontext und sechs Modul-Overlays ersetzt.
- Lokaler experimenteller „Javis“-Grammatikpfad, optional kombiniertes Wake + Diktat,
  einstellbare Konfidenzschwelle/Sprechpause, automatische Beendigung und Cooldown.
- WinMM-Geräteliste, explizite Mikrofonwahl, Default-Gerät und kontrollierte
  16-kHz-PCM-Zuführung; Hotplug-/Fokus-/Abbruch-/Close-Verhalten ergänzt.
- Rust-Start-Epochen gegen verspätete Aufnahme; ein Audio-Prozess, keine Aufnahme
  während KI/TTS; Fehler bei nicht bestätigtem Stoppen werden sichtbar behandelt.
- Bedienbare PTT-/Einzelaufnahme, echte Eingangspegel am Kern, deutsche lokale TTS,
  männliche Stimme bevorzugt, Unterbrechung, Lautstärke und Sprechgeschwindigkeit.
- Geschlossene Rust-Intent-/Tool-Schnittstelle, lokale System-/Wissensaktionen,
  Systemvertrag für KI-JSON-Vorschläge, strikte Validierung und zweite Freigabe.
- Einmalige 120-Sekunden-Freigaben für neue Erinnerungen, KI-Aktionen und Cloud;
  Dokument- und Fallback-Zustimmung getrennt, auch per expliziter Sprachphrase.
- Neue Sprachdialoge werden trotz eventuell alter Chat-Persistenz nicht gespeichert.
- OpenAI/Groq, sichere Schlüssel, SQLite/FTS5, Import/Export, WoW-Metadaten und alle
  bisherigen Rust-Kommandos erhalten. Zusätzliche echte Laufwerks-/Netzwerkabfragen.
- Vorhandene Hardwareabfrage und SQLite-Implementierung unverändert; fehlende
  GPU-/Temperaturanbieter bleiben sichtbar unbekannt.
- Windows-Desktop-Crate auf `rlib` begrenzt: behebt das nachgewiesene PE-Exportlimit
  einer nicht benötigten Debug-DLL aus der mobilen Tauri-Vorlage.
- Bundle/Installer deaktiviert. Windows-x64-Debug-Tauri-App ohne Bundle geprüft;
  reale Windows-Sprachtests und Freigabe bleiben vor einem Installer erforderlich.
