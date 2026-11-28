'use strict';

/* Nimmt das Mikrofon im versteckten Fenster auf und schickt 16-kHz-Int16
   an den Main-Prozess. Kein Netzwerk, keine Spracherkennung hier. */

const TARGET_RATE = 16000;
const BLOCK = 2048;

let context = null;
let stream = null;
let node = null;
let gain = null;
let resamplePhase = 0;

function toInt16(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

/** Einfache lineare Resampler-Fallback, falls der AudioContext nicht 16 kHz kann. */
function resample(input, fromRate) {
  if (fromRate === TARGET_RATE) return input;
  const ratio = fromRate / TARGET_RATE;
  const length = Math.floor((input.length - resamplePhase) / ratio);
  const out = new Float32Array(Math.max(0, length));
  let phase = resamplePhase;
  for (let i = 0; i < out.length; i += 1) {
    const index = Math.floor(phase);
    const next = Math.min(index + 1, input.length - 1);
    const mix = phase - index;
    out[i] = input[index] * (1 - mix) + input[next] * mix;
    phase += ratio;
  }
  resamplePhase = phase - input.length;
  return out;
}

async function start() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    context = new AudioContext({ sampleRate: TARGET_RATE });
    const source = context.createMediaStreamSource(stream);

    // AudioWorklet-frei: ScriptProcessor ist in Electron stabil verfügbar.
    node = context.createScriptProcessor(BLOCK, 1, 1);
    gain = context.createGain();
    gain.gain.value = 0;

    node.onaudioprocess = (event) => {
      const raw = event.inputBuffer.getChannelData(0);
      const resampled = resample(raw, context.sampleRate);
      const pcm = toInt16(resampled);
      window.jarvisWake.send(pcm.buffer);
    };

    source.connect(node);
    node.connect(gain);
    gain.connect(context.destination);
    window.jarvisWake.ready({ sampleRate: context.sampleRate });
  } catch (error) {
    window.jarvisWake.failed(String(error?.message ?? error));
  }
}

start();
