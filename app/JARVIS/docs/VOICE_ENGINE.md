# Deutsche lokale Voice Engine für J.A.R.V.I.S. 1.2

## Entscheidung: Desktop-SAPI statt WinRT/Web Speech

Das vorhandene Tauri-2-Projekt ist eine Win32-Desktop-App mit NSIS-Konfiguration,
keine MSIX-App mit Paketidentität. Laut [Microsofts Dokumentation zur Spracherkennung](https://learn.microsoft.com/en-us/windows/apps/develop/input/speech-recognition)
benötigt `Windows.Media.SpeechRecognition` Paketidentität; Standard-Diktatgrammatiken
können außerdem einen Onlinedienst verwenden. Diese Kombination passt nicht zum
hier geforderten lokalen NSIS-Desktop-Ablauf. Web Speech im WebView wird ebenfalls
nicht als verfügbare oder garantiert lokale Engine vorausgesetzt.

Implementiert ist eine dokumentierte lokale Alternative: **System.Speech / Windows
Desktop-SAPI**, als isolierter .NET-Framework-Hilfsprozess über Windows PowerShell 5.1.
Rust startet und verwaltet diesen Prozess. React greift nur auf eng definierte
Tauri-Befehle zu. Keine neue Tauri-Shellberechtigung und kein Cloud-STT-Anbieter.

[Microsoft dokumentiert beim SpeechSynthesizer](https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer)
installierte Stimmen, Stimmenauswahl, Lautstärke und Sprechgeschwindigkeit.
[SpeechRecognitionEngine](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine)
ermöglicht die Auswahl installierter Erkenner, lokale Diktatgrammatiken und
`AudioLevelUpdated`-Ereignisse.

## Voraussetzungen und tatsächliche Grenzen

- Windows 10/11 mit Windows PowerShell **5.1** und System.Speech/.NET Framework.
  PowerShell 7 ist weder erforderlich noch als Ersatz fest verdrahtet.
- Ein installierter deutscher **Desktop-SAPI-Erkenner** mit Kultur `de-DE` für STT.
  Ein installiertes Sprachpaket oder die neue Windows-„Voice Access“-Oberfläche
  garantiert nicht, dass dieser Legacy-Desktop-Erkenner verfügbar ist. Die App
  prüft `InstalledRecognizers()`; ohne Treffer bleibt Push-to-Talk deaktiviert.
- Für TTS werden nur aktivierte, installierte Microsoft-Desktopstimmen mit Kultur
  `de-DE` angeboten. Nicht alle OneCore-/Natural-/Online-Stimmen erscheinen in SAPI.
  Keine Registry-Eingriffe und keine automatischen Sprachpaketdownloads.
- Eine vorhandene männliche Stimme wird bevorzugt; standardmäßig Rate −2,
  Lautstärke 70 %. Tonhöhe/Klangtiefe hängen von der tatsächlich installierten Stimme
  ab. Es wird keine nicht vorhandene tiefe Stimme behauptet oder nachgeladen.
  Ein optionaler Stimmtest benötigt keine Groq-Anmeldung.
- Audioeingang/-ausgang muss lokal verfügbar und Desktop-Mikrofonzugriff in den
  Windows-Datenschutzeinstellungen erlaubt sein. SAPI zeigt keinen verlässlichen
  per-App-UWP-Mikrofonfreigabedialog. Deshalb gibt es eine ausdrückliche, nicht
  gespeicherte Freigabe-Checkbox in der App **zusätzlich** zu Windows' Desktoprechten.
  Die App ändert keine Datenschutz- oder Unternehmensrichtlinien.
- AppLocker, Constrained Language Mode, deaktiviertes PowerShell oder fehlendes
  System.Speech können den Hilfsprozess blockieren. Dann klare Fehlermeldung statt
  unbemerktem Cloud-Fallback. `-ExecutionPolicy Bypass` gilt nur für diesen
  Hilfsprozess; es wird keine systemweite Richtlinie geändert.
- Der Hilfsprozess wird bei jedem Vorgang neu gestartet und kompiliert den statischen
  C#-Host lokal per Add-Type. Der Start kann einige Sekunden dauern. Für eine kurze
  Spracheingabe bis zum sichtbaren Zustand „Aufnahme läuft“ gedrückt halten.

## Ablauf und Freigaben

1. Die App ermittelt installierte Stimmen/Erkenner, **ohne Mikrofonaufnahme**.
2. Nutzer erlaubt das Mikrofon explizit für die aktuelle Sitzung. Diese Checkbox
   ist nach einem App-Neustart wieder aus. Keine automatische Wiederaufnahme.
3. Push-to-Talk mit Maus/Touch oder fokussiertem Button und gehaltener Leertaste/Enter
   startet eine einzelne Aufnahme. Loslassen schließt die Erkennung ab.
4. Escape, Abbruchbutton, Fokusverlust, verdeckte App oder Fensterzerstörung verwerfen
   die laufende Aufnahme. Entzug der Mikrofonfreigabe stoppt sie ebenfalls.
5. Automatisches Ende spätestens nach 30 Sekunden Erkennung. Rust überwacht zusätzlich
   den gesamten Prozess inklusive Initialisierung (45 Sekunden). Eine hängende Engine
   wird beendet. Keine Hotword-Erkennung und kein dauerhafter Listening-Modus.
6. Erkanntes Diktat wird in den vorhandenen Chatentwurf eingefügt. Bestehender Entwurf
   bleibt erhalten. Der Text ist editierbar und wird **nicht automatisch versendet**.
   Erst „Bestätigen und senden“ oder ein bewusstes Enter im Chat nutzt den vorhandenen
   `chat_with_groq`-Befehl. Es wird ausschließlich der bestätigte Text übertragen.
7. TTS ist standardmäßig aus. Nur bei aktivierter Ausgabe werden neue, tatsächlich
   empfangene KI-Antworten lokal gesprochen. Abschalten stoppt laufende Ausgabe und
   verhindert auch das Vorlesen noch ausstehender Antworten. Bei laufender Aufnahme
   oder Ausgabe werden bis zu fünf Antworten zum anschließenden lokalen Vorlesen
   vorgemerkt. Eine volle Warteschlange wird ausdrücklich gemeldet. Abbruch oder
   Abschalten der Ausgabe verwirft die Warteschlange. Aufnahme ist während einer Ausgabe gesperrt, bis sie
   über den Stop-Knopf/Escape beendet wird. Eine einzelne Sprachausgabe ist auf
   drei Minuten begrenzt, der gesamte Ausgabeprozess wird nach 200 Sekunden
   zwangsweise beendet, falls er hängt.

## Pegel und Darstellung

Der Reactor zeigt den nativen `AudioLevelUpdated`-Eingangspegel auf einer Skala
von 0 bis 100 an, **keine dB-Messung**. Rust validiert den Bereich, React zeichnet
nur vorhandene Samples. Ohne Sample erscheint „Nicht verfügbar“, nach Ende/Abbruch
verschwindet die Pegelanzeige. Die Sprechzustandsanzeige bei TTS behauptet keinen
Ausgangsaudiopegel. Dekorative Mikrofonanimationen sind durch echte Aufnahmezustände
gesteuert. `prefers-reduced-motion` deaktiviert die dekorativen Animationen; die
Messwertanzeige und klaren Aufnahmezustände bleiben erhalten.

## Datenfluss und Prozessgrenzen

- Request-JSON über umgeleitetes stdin; keine Nutzereingabe in Shell-Code oder
  Prozessargumenten. TTS spricht Klartext, interpretiert keine Antwort als SSML.
- Zeilenweises JSON über stdout für Zustände, Pegel und abschließenden Text.
  Stderr und rohe Ausnahmeinformationen werden nicht an die UI durchgereicht.
- Groq-Schlüssel und Modellvariable werden aus der Kindprozessumgebung entfernt.
  Kein Voice-Befehl liest oder überträgt API-Schlüssel.
- Keine Audiodateien, Audio-Uploads oder persistierten Aufnahmen durch die App.
  Der letzte erkannte Text und der Chatentwurf liegen im Arbeitsspeicher.
  Add-Type kann eigene Compiler-Temporärdateien für den **statischen Hostcode**
  verwenden; sie enthalten weder Diktat noch KI-Antworten oder API-Schlüssel.
- Betriebssysteminterne Telemetrie oder Richtlinien sind davon getrennt; die App
  ändert oder umgeht sie nicht und verspricht keine Kontrolle über Windows selbst.
- Sessions haben IDs; verspätete Antworten/Abbrüche einer alten Sitzung können keine
  neue Sitzung überschreiben. Schreibvorgänge zu stdin blockieren weder den
  Zustandsmutex noch den Rust-Watchdog.

## Tauri-2-/NSIS-Anbindung

`bundle.resources` bildet `src-tauri/voice/` auf `voice/` im Ressourcenverzeichnis ab.
`AppHandle.path().resolve(..., BaseDirectory::Resource)` findet Skript und Host im
Dev-/Paketkontext. Der Cross-Check hat das Kopieren beider Ressourcen bestätigt.
Keine zusätzliche .NET-Runtime wird mitgebündelt; die dokumentierten Windows-
Voraussetzungen müssen vorhanden sein. Stimmen werden nicht mitinstalliert.

NSIS-Installation und tatsächliche Windows-/SAPI-Laufzeit sind **noch nicht geprüft**.
Diese Implementierung enthält die Ressourcenanbindung, aber keinen Installer.

## Reproduzierbare Prüfungen

- `npm run check`, `npm run build`: TypeScript/Vite.
- `npm test`: sechs bestehende Daten-/Verlaufstests.
- `npm run test:ui`: zehn Browserprüfungen (drei HUD- und sieben Voice-Prüfungen). Sie
  verwenden synthetische Testantworten und öffnen kein Mikrofon, sprechen nicht
  und übertragen nichts an Groq.
- Rust-Cross-Check: `cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu --locked`.
- Zusätzlich in dieser Linux-Umgebung: C#-5-Kompilierung des Hilfscodes mit Roslyn
  4.10 gegen .NET-Framework-4.8-Referenzen und die System.Speech-8-netstandard2.0-
  API-Referenz. Erfolgreich; dies bestätigt Syntax und die verwendeten API-Formen,
  **nicht** die installierte Windows-.NET-/PowerShell-/SAPI-Laufzeit.

### Windows-Prüfung vor Freigabe

1. `tests/voice-host-probe.ps1` mit Windows PowerShell ausführen: Der Host muss
   `capabilities` und tatsächlich vorhandene de-DE-Stimmen/Erkenner melden.
   Dieses Skript öffnet ausdrücklich kein Mikrofon.
2. App starten: vor Freigabe und ohne Tastendruck kein Mikrofonzugriff.
3. Freigeben, PTT halten, sprechen: Zustand „Aufnahme läuft“ und realen Eingangspegel
   kontrollieren. Bei Stille keine frei erzeugten Ausschläge.
4. Loslassen: Text prüfen und ändern; Netzwerkanfrage erst nach Sendebestätigung.
   Abbruch/Escape/Alt-Tab/Fensterschließen/Entzug der Freigabe einzeln testen.
5. 30 Sekunden halten und automatisches Aufnahmeende kontrollieren; anschließend
   erneutes PTT testen. Gerät während der Aufnahme entfernen: sauberen Fehler prüfen.
6. Jede angebotene Stimme, Rate und Lautstärke hören; TTS aus-/einschalten, auch
   während einer Groq-Anfrage. Audioausgabe und Mikrofon dürfen nicht parallel laufen.
7. Windows-PC ohne deutsche SAPI-Pakete und mit verweigertem Desktop-Mikrofonzugriff
   prüfen. Keine Cloud- oder Browsererkennung als Ersatz starten.

## Änderung der KI-Grenze in 1.3

Die lokale Voice Engine selbst bleibt unverändert. Der bearbeitete Entwurf läuft
jetzt durch `ai_prepare`/`ai_send` und die explizite Versandvorschau des ausgewählten
Anbieters. Er kann daher OpenAI oder Groq verwenden. `chat_with_groq` existiert als
kompatibler Groq-only-Adapter weiter, verwendet aber die neue Credential-Manager-
Konfiguration; frühere .env-Hinweise gelten nicht mehr. Jede erfolgreiche, nicht
abgebrochene Antwort wird bei TTS-Opt-in wie zuvor lokal gesprochen. Es werden
keine Audiodaten an Anbieter übermittelt.
