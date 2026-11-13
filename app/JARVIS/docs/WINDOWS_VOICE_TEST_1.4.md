# Manuelle Windows-Abnahme vor einem Installer

Diese Schritte wurden **nicht** auf echter Audio-Hardware ausgeführt.
Nur mit eigenen Testinhalten und bewusst freigegebenem Mikrofon durchführen.

1. Voraussetzungen aus README installieren. `tests/voice-host-probe.ps1` ausführen:
   Kompilierung und echte Fähigkeitenliste prüfen; dabei darf kein Mikrofon öffnen.
2. `npm run tauri dev`: CPU/RAM mit Task-Manager plausibilisieren. Unbekannte
   GPU-/Temperaturwerte müssen unbekannt bleiben. Laufwerke/Netzwerkquellen prüfen.
3. Vor Freigabe: Windows-Mikrofonanzeige muss aus sein; Öffnen des Voice-Moduls
   allein darf keine Aufnahme starten. App beenden und erneut starten: wieder aus.
4. Mindestens zwei Eingabegeräte testen, spezifisch auswählen und Default testen.
   Erlaubnis in Windows verweigern: verständliche Meldung, keine App-Abstürze.
5. PTT per Maus und Tastatur, kurzer Tap während Start, Loslassen, automatische
   Sprechpause und acht Sekunden Stille prüfen. Maximal 30 Sekunden pro Befehl.
6. Separates Wake-Opt-in setzen; „Javis“ allein + Befehl sowie „Javis, Befehl“ in
   einer Äußerung prüfen. „Jarvis“, Störgeräusche, TV, verschiedene Abstände/Stimmen
   testen. Treffer-/Falschauslösungen und Latenz mit Testbedingungen protokollieren.
   Bei unzureichender Qualität Wake deaktivieren, PTT benutzen und als offen belassen.
7. Lokale Beispiele aus README: keine Provideranfrage bei CPU, Modellstatus,
   Modulöffnung, Lautstärke oder lokaler Wissenssuche.
8. Neue Sprachnotiz: vor Bestätigung kein Eintrag, nach Bestätigung genau einer.
   Dokumentzähler darf eine Sprachnotiz nicht als importierte Datei zählen.
9. Einmalige Freigabe, Ablehnung, Ablauf >120 Sekunden und doppelte Bestätigung
   testen. KI-Vorschlag nicht automatisch ausführen. Roh-Audio-Dateien dürfen
   weder im Projekt noch im App-Datenverzeichnis entstehen.
10. Eigene deutsche Stimme, leise/laute Ausgabe, Geschwindigkeit, Unterbrechen
    und Echo testen. Während TTS/KI muss die Windows-Mikrofonanzeige aus sein.
11. Geräte abziehen/Default wechseln, Fenster verlassen/minimieren, Escape,
    Mikrofon aus, App während Aufnahme/Start/TTS schließen. Keine neue Aufnahme
    ohne neue Freigabe. Unbestätigter Stop muss klar angezeigt und untersucht werden.
12. Erst nach bewusster Kostenfreigabe eigene neue API-Schlüssel im Windows Credential
    Manager einrichten. Beide Provider/Modelle, 401/403/429/Offline, Abbruch, Quellen,
    Dokument-Cloud-Sperre und separat erlaubten Fallback testen. Anbieter-Rechnungen
    und Schlüssel niemals in Testbericht/Screenshot/Repository kopieren.

Ergebnis je Schritt mit Windows-Version, Gerät, Sprachpaket, Testbedingungen und
Datum dokumentieren. Installer erst nach erfolgreicher Sprachprüfung und Freigabe
wieder aktivieren. Die bestehende App-Datenbank vor manuellen Löschtests exportieren.
