# Windows-Beta: Installer-Prüfung

Der Installer wurde nach ausdrücklicher Freigabe am 09.11.2026 beauftragt.
Die bisherigen Angaben „kein Installer“ dokumentieren den vorangegangenen
Entwicklungsstand. Maßgeblich für den ausgelieferten Build sind `BUILD_REPORT.md`
und `SHA256SUMS.txt` beim GitHub-Prerelease `v1.3.0-beta.1`.

Vorbereitung auf nativem Windows Server 2025 / MSVC: TypeScript, React-Build,
6 Telemetrietests, 15 Core-Tests und der isolierte Windows-Credential-Manager-Test
bestanden. Der C#-5-/System.Speech-Host ließ sich kompilieren. Die direkte UTF-8-
Eingabe wie im Rust-Backend lieferte echte Fähigkeiten: keine deutschen Stimmen
und kein deutscher Erkenner auf dem CI-Runner. Es wurde kein Mikrofon geöffnet.

Der alte Prüfaufruf über die PowerShell-Objektpipeline scheiterte trotz funktionierender
direkter Prozesseingabe. `tests/voice-host-probe.ps1` verwendet deshalb dieselbe rohe
UTF-8-Standardeingabe wie Rust, mit Zeitlimit und strenger JSON-Ergebnisprüfung.
Der produktive Sprachhost und die vorhandenen Rust-Schnittstellen bleiben unverändert.
Die Installer-Pipeline prüft dieses korrigierte Skript erneut vor der Veröffentlichung.

Der NSIS-Installer ist unsigniert. Der finale Buildbericht unterscheidet ausgeführte
Prüfungen von offenen Tests. Installation/Deinstallation auf Windows 10/11, deutsche
Audioausgabe, Mikrofonaufnahme, reale Hardware und echte Provider-Konten erfordern
weiterhin manuelle Tests. WebView2 und lokale deutsche Desktop-Sprachpakete müssen
auf dem Zielgerät vorhanden sein. Keine API-Schlüssel werden mitgeliefert.
