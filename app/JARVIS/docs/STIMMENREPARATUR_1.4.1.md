# J.A.R.V.I.S. 1.4.1 – gezielte Windows-Stimmenreparatur

Stand: 13.11.2026. Basis: veröffentlichter Quellstand v1.4.0-beta.1,
SHA-256 `2b94cca02280fc912b5434822c4d212de59ff7cf6c872a7fa0dde87b0fc302c6`.

## Befund und Ursache: bestätigte Fehler von offenen Hypothesen trennen

Der Nutzer hat Microsoft Hedda Desktop (de-DE, Enabled) und Microsoft Zira Desktop
(en-US, Enabled) über System.Speech gefunden und Hedda hörbar getestet. Damit ist
fehlende Windows-TTS-Unterstützung auf seinem Rechner widerlegt.

Die genaue Ursache der leeren Liste **auf diesem Rechner ist noch NICHT VERIFIZIERT**.
Es liegen weder ein dortiger Host-Fehler noch eine bestätigte Prozessarchitektur vor.
Die übermittelte PowerShell-Parsermeldung entstand durch zusammengeklebte Befehle;
sie ist kein Nachweis für einen Fehler der App.

Nachgewiesene Programmfehler bzw. Lücken:

1. Der C#-Probe-Code fing sämtliche TTS-Initialisierungs-/Auflistungsfehler ab und
   antwortete anschließend mit erfolgreichem Status und leerer Liste. Damit ließ
   sich ein technischer Fehler nicht von tatsächlich fehlenden Stimmen unterscheiden.
2. Die aktive Voice-Engine speicherte die Auswahl überhaupt nicht. Beim Start wurde
   immer die erste bevorzugte deutsche Stimme gesetzt. Eine Wiederherstellung fehlte.
3. „Stimme testen“ benutzte denselben Pfad wie automatisches Vorlesen. Nach dessen
   Abschalten war der Testknopf wirkungslos. Der neue Browser-Regressionsfall schlug
   am ausbleibenden `voice_start(mode=speak)` vor der Reparatur fehl.
4. Es fehlten eine erneute Suche und sichtbare Lade-/Speicherzustände. Englische und
   deaktivierte Stimmen wurden im Host weggefiltert. **Hedda selbst hätte den alten
   de-DE-/Microsoft-Filter erfüllt; dieser Filter ist keine belegte Ursache ihres Fehlens.**
5. Rust wartete vor dem Lesen der stdout-Pipe auf das Prozessende; große Antworten
   konnten die Pipe blockieren. Jetzt wird begrenzt parallel gelesen und ein Probe-
   stdin nach der Anfrage geschlossen. Das ist eine Reparatur des Transportvertrags,
   kein Nachweis, dass die zwei Stimmen des Nutzers den alten Puffer füllten.

Hypothese „CreateNoWindow verhindert allein die Abfrage“ wurde am originalen
1.4.0-Host nativ unter Windows verglichen: beide Startarten lieferten korrektes JSON.
Auf diesem Runner fehlten deutsche Stimmen; beide alten Listen waren daher leer.
Diagnose-Lauf: https://github.com/hoffmannfabian326/JARVIS-Windows/actions/runs/43346837233
Dieser Test ersetzt keinen Vergleich beider Architekturen auf dem Nutzerrechner.

## Reparatur und Schnittstellen

System.Speech bleibt die einzige Sprachengine. Keine Registry-Änderungen,
Administratorpflicht, neue Cloud-Schnittstelle oder feste Produkt-Stimmennamen.
Alle registrierten Desktop-Stimmen werden mit Name, Kultur, Geschlecht und `enabled`
übertragen. Deaktivierte Stimmen bleiben erkennbar, sind nicht auswählbar. Die
Sprechprüfung akzeptiert ausschließlich tatsächlich installierte, aktivierte IDs.
Deutsch wird bei der ersten Auswahl bevorzugt, ohne Namen fest einzubauen.

| Dateien | Zweck |
|---|---|
| `voice/VoiceCatalog.cs`, `voice/VoiceHost.cs` | vollständige Auflistung, expliziter TTS-Abfragefehler; Auswahl erneut gegen Windows prüfen |
| `voice/launch.ps1` | neue Katalogquelle laden; Encoding-Initialisierung innerhalb des Fehlerhandlers |
| `src/voice.rs` (Rust) | begrenzter asynchron gelesener Probe-Transport, strikte JSON-Prüfung, Fehler statt leerer Ersatzliste, sichere Diagnosen; native Vertragstests |
| `src/voice_preferences.rs` (Rust) | atomare lokale Speicherung ausschließlich der Stimmen-ID, Prüfung defekter Daten |
| `src/lib.rs` (Rust) | zwei zusätzliche Commands registrieren |
| `src/useVoiceCatalog.ts` | Lade-/Fehlerzustände, Suche, serialisiertes Speichern, Wiederherstellung; verspätete Suche überschreibt keine Auswahl |
| `src/useAutonomousVoice.ts` | Katalog verwenden; manueller Test unabhängig von automatischem Vorlesen, Ergebnis/Abbruch anzeigen |
| `src/useVoice.ts`, `src/VoiceSettings.tsx` | additive Typfelder und vorhandenes Voice-Panel ergänzen |
| Tests und Versionsmetadaten | Regressionen, C#-JSON-/Windows-Tests, Version 1.4.1 |

Bestehende Rust-Befehle bleiben erhalten. Neu:

- `voice_selection_get() -> string | null`: gespeicherte ID; fehlerhafte Datei ist ein Fehler.
- `voice_selection_set({ voiceId: string })`: validierte ID atomar im Benutzer-App-Datenverzeichnis speichern.

`voice_capabilities` behält seine bisherigen Felder. Additiv: `voices[].enabled`,
`tts_error`, `tts_code`, `tts_hresult`, `host_architecture`, `protocol_version`.
Bei TTS-Abfragefehler bleibt ein unabhängig funktionierender Erkennerstatus erhalten.
Kein fehlgeschlagener Probe-Aufruf wird als erfolgreiche leere Stimmenliste dargestellt.

Speicher: `%APPDATA%\com.jarvis.commandcenter\voice-selection.json`.
Diagnose: `%APPDATA%\com.jarvis.commandcenter\voice-diagnostics.log`, begrenzt auf
ungefähr 64 KiB, mit Zeitstempel, festen Statuscodes, Stimmenanzahl, Bitness und ggf.
hexadezimalem HRESULT. Keine Stimme, Benutzerpfade, Sprachtexte, Schlüssel, rohen
API-/Ausnahmemeldungen oder Audioinhalte im Diagnoseprotokoll. Keine Übertragung.
Mikrofon-/Wake-Freigaben werden weiterhin niemals wiederhergestellt.

## Prüfungen und Grenzen

Lokale TypeScript-, Produktionsbuild-, Node-, Browser-, Rust-Typ- und C#-Compiler-
Prüfungen werden protokolliert. Browser-Fixtures ersetzen nur IPC; ihre Hedda-/Zira-
Daten sind ausdrücklich Testdaten. Speicherung dort wird durch ein Testdouble
simuliert; echte dateibasierte Speicherung wird separat in Rust geprüft.

Der Windows-Lauf führt die Rust-Tests nativ unter MSVC aus, einschließlich realem
verdecktem System.Speech-Prozess, JSON-Übertragung, tatsächlichem Prozess-Timeout,
Einstellungsdatei, Credential Manager, Geräteabfrage und Abbruch. Ein zusätzlicher
C#-Vertragstest prüft de-DE/en-US/Enabled/JSON und echte installierte SAPI-Stimmen;
falls vorhanden wird mit `SetOutputToNull()` gerendert. Das ist **kein hörbarer Test**.
Installer-Payload, x64, alle vier Voice-Ressourcen, Installation, HUD-Start und
Deinstallation werden ebenfalls geprüft. Verbindliche Ausführungsergebnisse und
Runner-Stimmen stehen im separat gelieferten `BUILD_REPORT_1.4.1.md`.

Auf dem Nutzerrechner NICHT VERIFIZIERT: Anzeige von Hedda in dieser App-Version,
hörbarer Test, Wiederherstellung bei dessen Neustart, dessen Berechtigungen und
Geräte. Unverändert offen: akustisches Wake-Verhalten, STT, Echo, reale Providerkonten
und vollständige Windows-10/11-Abnahme. Ein Windows-Server-Runner ist kein Ersatz.

## Praxistest

1. Alte App vollständig schließen. 1.4.1-Testinstaller normal im gleichen Benutzerkonto
   installieren; eigene Daten vor Änderungen nach Bedarf exportieren.
2. Voice öffnen, Suche abwarten. „Microsoft Hedda Desktop · de-DE“ auswählen.
   Ggf. „Stimmen erneut suchen“. Auf „Stimmenauswahl gespeichert“ achten.
3. „Stimme testen“ drücken, auch mit ausgeschaltetem automatischem Vorlesen.
   Hörbare deutsche Ausgabe selbst bestätigen. Der Host-Abschluss allein beweist
   nicht, dass Lautsprecher hörbar waren. Escape/Unterbrechen muss den Test beenden.
4. App vollständig beenden, neu starten und die Auswahl prüfen.
5. Lokale Tools, Mikrofon und anschließend separat freigegebenes „Javis“ prüfen.
   Für Cloud-Tests gelten weiterhin Einzelfreigaben und mögliche API-Kosten.
6. Fehlt Hedda weiterhin: angezeigte Fehlermeldung und das kleine Diagnoseprotokoll
   sichern. Architektur des erfolgreichen PowerShell-Prozesses mit
   `[Environment]::Is64BitProcess` als eigenständigem Befehl feststellen. Keine
   Zugangsdaten, Registry-Exporte oder privaten Sprachinhalte senden.

Der Installer bleibt unsigniert und wird als `v1.4.1-beta.1` gekennzeichnet.
