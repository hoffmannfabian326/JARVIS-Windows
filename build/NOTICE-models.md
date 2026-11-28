# Weckwort-Modelle

`melspectrogram.onnx`, `embedding_model.onnx` und `hey_jarvis_v0.1.onnx` stammen aus
[openWakeWord](https://github.com/dscripka/openWakeWord), Release `v0.5.1`.

- Code und Modell-Downloads: Apache License 2.0
- Die vortrainierten Modelle sind für persönliche, nicht-kommerzielle Nutzung gedacht.
  Für eine kommerzielle Veröffentlichung ist eine eigene Lizenz bzw. ein eigenes Modell nötig.

Die Erkennung läuft vollständig lokal (ONNX Runtime Web / WASM). Es werden keine
Audiodaten gesendet oder gespeichert.

Der Release-Workflow lädt genau diese drei Dateien und prüft ihre SHA-256-Summen.
