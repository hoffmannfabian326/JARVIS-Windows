# Piper TTS — Herkunft

- **Binary:** `piper_windows_amd64.zip` aus dem Release `2023.11.14-2` von
  https://github.com/rhasspy/piper (MIT-Lizenz).
- **Stimme:** `de_DE-thorsten-medium` aus https://huggingface.co/rhasspy/piper-voices,
  Revision `5041a7a49ae5b3a0f30e6837769eb03fdbb231bd`
  (ältere, mit Piper 1.1/1.2 kompatible Fassung des Modells).
- Das Modell basiert auf dem Thorsten-Datensatz (deutsche Sprachaufnahmen).
  Die Stimme wird hier nur für die private, lokale Nutzung mitgeliefert.

Der Release-Workflow lädt Zip und Stimme mit festen Prüfsummen und bricht ab,
wenn sich upstream etwas ändert.
