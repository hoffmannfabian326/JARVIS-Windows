import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
export type LocalVoice = { id: string; name: string; gender: string; culture: string; enabled?: boolean };
export type VoiceCapabilities = { available: boolean; voices: LocalVoice[]; recognition: boolean; note: string; tts_error?: string | null; host_architecture?: string | null; protocol_version?: number };
export type VoiceSnapshot = { session_id: string; mode: 'listen' | 'speak'; state: 'starting' | 'listening' | 'speaking' | 'finishing' | 'complete' | 'cancelled' | 'error'; level: number | null; transcript: string; error: string | null };
const terminal = (value: VoiceSnapshot) => ['complete', 'cancelled', 'error'].includes(value.state);
export function useVoice(onTranscript: (text: string) => void) {
  const [capabilities, setCapabilities] = useState<VoiceCapabilities | null>(null);
  const [permission, setPermission] = useState(false);
  const [permissionPending, setPermissionPending] = useState(false);
  const [snapshot, setSnapshot] = useState<VoiceSnapshot | null>(null);
  const [error, setError] = useState('');
  const [voice, setVoice] = useState('');
  const [volume, setVolume] = useState(70);
  const [rate, setRate] = useState(-2);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const active = useRef(false);
  const busy = useRef(false);
  const session = useRef<string | null>(null);
  const mode = useRef<'listen' | 'speak' | null>(null);
  const generation = useRef(0);
  const finishRequested = useRef(false);
  const speechQueue = useRef<string[]>([]);
  const outputEnabled = useRef(false);
  const speakLatest = useRef<(text: string) => void>(() => {});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const transcriptCallback = useRef(onTranscript);
  transcriptCallback.current = onTranscript;
  async function cancel() {
    generation.current++;
    speechQueue.current = [];
    clearTimeout(timer.current);
    const id = session.current;
    session.current = null; busy.current = false; mode.current = null;
    if (active.current) { setStarting(false); setSnapshot(null); }
    if (id) await invoke('voice_cancel', { sessionId: id }).catch(() => {});
  }
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  useEffect(() => {
    active.current = true;
    const probe = setTimeout(() => {
      void invoke<VoiceCapabilities>('voice_capabilities').then(result => {
        if (!active.current) return;
        setCapabilities(result);
        const german = result.voices.filter(voice => voice.culture === 'de-DE');
        setVoice((german.find(voice => voice.gender === 'Male') ?? german[0])?.id ?? '');
      }).catch(() => { if (active.current) setError('Lokale Sprachengine nicht verfügbar. Windows-Sprachhost und deutsche Desktop-Sprachpakete prüfen.'); });
    }, 0);
    const stopOnBlur = () => { if (mode.current === 'listen') void cancelRef.current(); };
    const stopHidden = () => { if (document.hidden) stopOnBlur(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') void cancelRef.current(); };
    window.addEventListener('blur', stopOnBlur);
    window.addEventListener('pagehide', stopOnBlur);
    document.addEventListener('visibilitychange', stopHidden);
    window.addEventListener('keydown', escape);
    return () => {
      active.current = false; clearTimeout(probe);
      window.removeEventListener('blur', stopOnBlur);
      window.removeEventListener('pagehide', stopOnBlur);
      document.removeEventListener('visibilitychange', stopHidden);
      window.removeEventListener('keydown', escape);
      void cancelRef.current();
      void invoke('voice_permission', { allowed: false }).catch(() => {});
    };
  }, []);
  async function poll(id: string, epoch: number) {
    if (!active.current || epoch !== generation.current) return;
    try {
      const next = await invoke<VoiceSnapshot>('voice_snapshot', { sessionId: id });
      if (!active.current || epoch !== generation.current) return;
      setSnapshot(next);
      if (terminal(next)) {
        busy.current = false; session.current = null; mode.current = null;
        if (next.state === 'error') setError(next.error ?? 'Lokale Sprachaktion fehlgeschlagen.');
        if (next.mode === 'listen' && next.state === 'complete') {
          if (next.transcript.trim()) transcriptCallback.current(next.transcript.trim());
          else setError('Kein Text erkannt. Halte Push-to-Talk bis nach dem Aufnahmebeginn gedrückt.');
        }
        if (next.state === 'complete' && outputEnabled.current && speechQueue.current.length) {
          const text = speechQueue.current.shift()!;
          timer.current = setTimeout(() => { if (active.current && outputEnabled.current && epoch === generation.current) speakLatest.current(text); }, 0);
        } else if (next.state !== 'complete') speechQueue.current = [];
      } else timer.current = setTimeout(() => void poll(id, epoch), 100);
    } catch {
      if (active.current && epoch === generation.current) { await cancel(); setError('Sprachstatus nicht erreichbar. Die lokale Sitzung wurde abgebrochen.'); }
    }
  }
  async function start(action: 'listen' | 'speak', text?: string) {
    if (busy.current) return;
    if (action === 'listen' && (!permission || !capabilities?.recognition)) return;
    if (action === 'speak' && (!voice || !text?.trim())) return;
    busy.current = true; mode.current = action; finishRequested.current = false;
    const epoch = ++generation.current;
    setError(''); setStarting(true); setSnapshot(null);
    try {
      const next = await invoke<VoiceSnapshot>('voice_start', { request: { mode: action, voice, text, volume, rate } });
      if (!active.current || epoch !== generation.current) { await invoke('voice_cancel', { sessionId: next.session_id }); return; }
      session.current = next.session_id; setSnapshot(next); setStarting(false);
      if (finishRequested.current && action === 'listen') await invoke('voice_finish', { sessionId: next.session_id });
      void poll(next.session_id, epoch);
    } catch (reason) {
      if (active.current && epoch === generation.current) { busy.current = false; mode.current = null; setStarting(false); setError(String(reason)); }
    }
  }
  async function finish() {
    if (mode.current !== 'listen' || finishRequested.current) return;
    finishRequested.current = true;
    const id = session.current;
    if (id) {
      setSnapshot(previous => previous ? { ...previous, state: 'finishing', level: null } : previous);
      try { await invoke('voice_finish', { sessionId: id }); }
      catch { await cancel(); if (active.current) setError('Aufnahme konnte nicht abgeschlossen werden; sie wurde verworfen.'); }
    }
  }
  async function allowMicrophone(allowed: boolean) {
    setPermissionPending(true);
    setPermission(false);
    if (!allowed) await cancel();
    try { await invoke('voice_permission', { allowed }); if (active.current) setPermission(allowed); }
    catch { if (active.current) setError('Mikrofonfreigabe konnte nicht bestätigt werden.'); }
    finally { if (active.current) setPermissionPending(false); }
  }
  function speak(text: string) {
    if (busy.current) {
      if (outputEnabled.current) {
        if (speechQueue.current.length < 5) speechQueue.current.push(text);
        else setError('Sprachausgabe-Warteschlange voll. Weitere Antwort wurde nicht zum Vorlesen vorgemerkt.');
      }
      return;
    }
    void start('speak', text);
  }
  speakLatest.current = speak;
  const recording = snapshot?.mode === 'listen' && snapshot.state === 'listening';
  const running = starting || (snapshot !== null && !terminal(snapshot));
  return {
    capabilities, permission, permissionPending, allowMicrophone, snapshot, error, voice, setVoice, volume, setVolume, rate, setRate,
    ttsEnabled, setTtsEnabled: (enabled: boolean) => { outputEnabled.current = enabled; setTtsEnabled(enabled); if (!enabled) { speechQueue.current = []; if (mode.current === 'speak') void cancel(); } },
    startListening: () => start('listen'), finish, cancel, running, recording,
    startSpeaking: speak,
    // Native SAPI scale 0..100, not dB or a synthetic speech waveform.
    level: recording && snapshot?.level != null && Number.isFinite(snapshot.level) && snapshot.level >= 0 && snapshot.level <= 100 ? snapshot.level : null,
  };
}
export type VoiceEngine = ReturnType<typeof useVoice>;
