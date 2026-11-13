# Windows-Abnahme 1.4.0 — 13.11.2026

## Auftrag und Freigabegrenze

Gefordert sind echte Windows-Sprachtests und ein Installer für die eigene Abnahme
mit anschließendem Upload ins private GitHub-Repository. Die abschließende ausdrückliche
Anforderung eines Selbsttest-Installers wird als Freigabe eines **Testpakets** verstanden,
nicht als bestandene Produktiv-/Sprachabnahme. Der normale Build bleibt ohne Installer;
`tauri.test-installer.conf.json` ist ein bewusst zu aktivierendes separates Overlay.

Die lokale Arbeitsumgebung ist Linux. Ein GitHub-Windows-Runner kann MSVC, WinMM-Abfragen,
System.Speech-Kompilierung, Installation und einen begrenzten App-Smoke-Test ausführen.
Er ist kein Windows-10/11-Audiotestplatz mit Nutzermikrofon und Lautsprechern. Der endgültige
Ausführungsnachweis steht in den beim Release gelieferten CI-Berichten und Prüfsummen.

## Tatsächlicher Wake-Pfad

Produktivcode: `VoiceHost.cs` → de-DE-System.Speech-Recognizer → Choices("Javis") /
Javis+AppendDictation → `SpeechRecognized` mit Konfidenz-/Grammatikprüfung → UTF-8-Status/
Transkript → Rust-Sitzung → React-Zustandsautomat. Aktivierung wird nur aus einem echten
Erkennungsergebnis erzeugt. Zeitgeber erneuern/beschränken Sitzungen; sie erfinden kein Wake-Ereignis.
Test-Fixtures unter `tests/browser` ersetzen dagegen ausdrücklich IPC und belegen keine Akustik.

Enginegrenzen: Windows-Desktop-SAPI, installierter de-DE-Erkenner, keine garantierte
Aussprache-/Falschauslösungsqualität eines spezialisierten Wake-Modells. Die Konfidenzschwelle
ist nur ein Ergebnisfilter. Der Vordergrundbetrieb und die Mikrofonpause während TTS bleiben
bestehen. Der Klang hängt von installierten deutschen Microsoft-Desktop-Stimmen ab.

## Reproduzierte und behobene Kernfehler

1. **Aufnahme vor Erkennerbereitschaft:** Der Konstruktor startete WinMM bereits vor
   Modell-/Grammatikinitialisierung. Die begrenzte Queue konnte sich während langsamer
   Initialisierung füllen. Der C#-Vertragstest scheiterte zuvor mit
   `REGRESSION: capture started before recognizer readiness`.
   Jetzt erfolgt ein expliziter, idempotenter Start nach der Erkennereinrichtung und
   erneuter Abbruchprüfung. Sprach-/Wake-Zeitmessung beginnt ebenfalls erst dann.
2. **Fehlerpfad verlor Mikrofonbesitz:** Nach einem nativen Erkennungsfehler wurden
   Client-Sitzungsmarker vor dem bestätigten Stoppen gelöscht. Bei zusätzlichem
   Stopfehler wurde dadurch fälschlich kein unsicherer Capture-Zustand gemeldet.
   Der neue Browser-Regressionsfall scheiterte am fehlenden „Mikrofonstatus unbestätigt“.
   Besitzmarker bleiben bis zur Abschaltung erhalten; fehlgeschlagene Starts werden
   ebenfalls zuerst sicher abgebrochen. Rust verschweigt gescheiterte Watchdog-Abbrüche
   nicht und wiederholt sie.

Keine neuen Produktfunktionen, Rechte, Provider oder externen Datenquellen ergänzt.
One-Screen-HUD, bestehende Kommandos, sichere Schlüssel, SQLite, RAG und Freigaben bleiben erhalten.

## Welche Nachweise sind möglich?

| Anforderung | Nachweis | Grenze |
|---|---|---|
| Tatsächliche lokale Wake-Implementierung | Quellenpfad + native System.Speech-Kompilierung/Probe | keine akustische Trefferquote |
| Audio-Start/Stop, Puffer, Auswahl, kein Fallback | echte AudioCapture-Klasse mit synthetischem WinMM-ABI-Testdouble | keine reale Aufnahme |
| Mikrofonliste | nativer WinMM-Test auf Windows-Runner | vorhandene Runner-Geräte; kein Nutzermikrofon |
| Prozessabbruch | realer eigener Windows-Hilfsprozess im Rust-Test | kein Hardware-/Treiber-Stresstest |
| Cloud-Freigaben, TTS/Wake-Ausschluss, Fehler-/Spätantworten | Browser-/IPC-Regressionen | keine echte Stimme/kein Echo gemessen |
| Provider/RAG/SQLite/Autorisierung | lokale HTTP-/SQLite-/PDF-/Rust-Tests | keine Produktivkonten oder API-Kosten |
| Windows-MSVC und Paket | CI-Build, NSIS-Payload, Installation/Start/Uninstall-Smoke | Windows Server ist keine Client-Abnahme |

## Nicht ausführbar / ausdrücklich offen

Aussprachevarianten („Javis“, ähnlich klingende Wörter, Akzente), Entfernung, Hintergrundgespräche,
Geräusche, Treffer- und Falschauslösungsraten; echte Windows-Mikrofonwahl/Defaultwechsel/Abziehen/
Berechtigungsverweigerung; deutsche reale Diktat-/TTS-Qualität und akustische Rückkopplung;
Treiberfehler/physische Ressourcenfreigabe; echte OpenAI-/Groq-Konten; Windows-10/11-Clientlaufzeit.
Diese Fälle sind **nicht bestanden**, sondern mangels Umgebung **nicht ausgeführt**.

## Verbleibende Risiken

- SAPI-Grammatik kann auf dem Zielrechner fehlen, unzuverlässig sein oder ein Format ablehnen.
  PTT/Einzelaufnahme benutzen; ohne Erkenner/Mikrofon bleiben manuelle lokale Module verfügbar.
- WinMM-Index/Namenskennung ist kein stabiler Endpoint-GUID; Geräte-/Standardwechsel verlangt
  neue Freigabe. Defekte Treiber müssen mit echten Geräten geprüft werden.
- Keine Aufnahme im Hintergrund; während TTS nur Knopf/Escape zum Unterbrechen.
- Keine gemessenen Windows-CPU-/RAM-/Latenz-/FAR-/FRR-Werte. Keine Qualitätszahlen erfinden.
- Testinstaller ist unsigniert. Erfolgreicher Build/Installations-Smoke ist keine Sprachfreigabe.
- CPU/RAM/Laufwerke/Netzwerksummen bleiben echte lokale Abfragen; GPU/Temperaturen ohne
  Messanbieter bleiben unbekannt. News/Webrecherche sind nicht angebunden.
- API-Abbruch kann bereits entstandene Kosten nicht rückgängig machen. Keine Schlüssel mitliefern.

## Eigene Abnahme

`WINDOWS_VOICE_TEST_1.4.md` und `WINDOWS_VOICE_ERGEBNISSE_1.4.csv` verwenden. Zuerst
Windows-Sprachpakete und Desktop-Mikrofonrechte prüfen, dann PTT, dann experimentelles „Javis“.
Mikrofon/Wake bleiben nach Installation standardmäßig aus. Den akustischen Test in Ruhe,
mit verschiedenen Abständen und mit realen Störgeräuschen wiederholen; Ergebnisse protokollieren.
Erst nach echter erfolgreicher Client-/Sprachabnahme eine stabile Veröffentlichung erwägen.
