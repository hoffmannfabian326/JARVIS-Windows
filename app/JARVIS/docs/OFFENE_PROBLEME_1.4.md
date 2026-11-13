# Offene Prüfungen und Grenzen

1. **Echtes Windows-Audio offen:** Auswahl realer Mikrofone, Berechtigungsverweigerung,
   Hotplug, Default-Gerätewechsel, Diktat, TTS und App-Ende müssen auf Windows 10/11 x64
   geprüft werden. IPC-Tests und Kompilierung ersetzen diese Hardwaretests nicht.
2. **Wake-Qualität offen:** „Javis“ ist eine echte lokale SAPI-Grammatik, kein validiertes
   spezialisiertes Hotword-Modell. Keine behaupteten Treffer-/Falschauslösungsquoten.
   Bei Fehler/Unzuverlässigkeit Wake ausschalten und PTT/Einzelaufnahme verwenden.
3. **Voraussetzungen:** de-DE-Desktop-SAPI und Microsoft-Desktop-Stimmen erforderlich;
   OneCore-/Cloud-Stimmen sind nicht automatisch kompatibel. Die Klangtiefe lässt
   sich ohne passende installierte Stimme nicht garantieren.
4. **Audioformat/Geräte:** WinMM, 16 kHz/16 Bit/Mono, aktuelle Index-/Namenskennungen.
   Nicht jeder virtuelle/professionelle Treiber muss dieses Format unterstützen.
   Default-Gerätekennung kann auf einzelnen Treibern unbekannt bleiben. Gleichnamige
   schnelle Austauschvorgänge und defekte Treiber erfordern echte Windows-Tests.
5. **Vordergrundbetrieb:** Aufnahme nur im aktiven Fenster; kein Hintergrund-Wake,
   keine stimmliche Unterbrechung während TTS. Sichtbarer Knopf/Escape unterbricht.
6. **Anbieterzugang offen:** Keine echten OpenAI-/Groq-Schlüssel oder kostenpflichtigen
   Produktivanfragen verwendet. Lokale HTTP-Integrationstests prüfen Modelle,
   tatsächliche Modellnamen in Antworten, HTTP-Fehler, Retries, Timeout und Abbruch.
7. **Hardwaregrenzen:** CPU/RAM sowie neue Laufwerke/Netzwerksummen über sysinfo.
   GPU-Auslastung/Temperaturen haben weiterhin keinen Messanbieter. Kein erfundener
   Online-Status, kein eingebauter News-/Webrecherchedienst.
8. **Leistung offen:** Windows-SAPI CPU/RAM/Latenz, Sprachqualität und Audio-Echo
   sind nicht gemessen. PCM-Puffer sind begrenzt; Hilfsprozesse werden pro Phase
   gestartet. Bei Bedarf nach realer Messung optimieren, nicht anhand erfundener Zahlen.
9. **Betriebssystemschutz:** Kein Sprecher-Login/keine Biometrie. Nur die ausdrücklich
   erlaubten App-Aktionen, keine gefährlichen OS-Werkzeuge. Treiber-/IPC-Stopfehler
   werden als unbestätigt gemeldet und blockieren weitere Sprachverarbeitung.
10. **Paketprüfung offen:** Windows-App wurde unter Linux nach x64/GNU kompiliert,
    nicht unter Windows gestartet. MSVC-/Windows-10/11-/NSIS-Laufzeittests stehen aus.
    Kein Installer 1.4 vorhanden, Bundle-Erstellung ist deaktiviert.
