import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SpeechEngine, recognitionSupported } from '../lib/speech';
import { Speaker } from '../lib/tts';
import { handleCommand, type DesktopActions, type JarvisContext, type JarvisReply } from '../lib/intents';
import {
  getDesktop,
  type ActivityEntry,
  type ConversationFile,
  type ConversationMeta,
  type SttStartResult,
  type SttStatus,
  type TimerRecord,
  type TtsEngineOption,
} from '../lib/desktop';
import { MicTap } from '../lib/localStt';
import {
  askBrain,
  describeBrainError,
  extractMemories,
  fetchBrainStatus,
  summarizeTurns,
  type BrainStatus,
  type BrainTurn,
  type ToolCall,
  type ToolOutcome,
} from '../lib/brain';
import { askVision } from '../lib/vision';
import { parseToolCall, requiresConfirmation, type PendingTool } from '../lib/tools';
import { routineFromDraft } from '../lib/automation';
import { SentenceStream } from '../lib/sentences';
import { shouldInterrupt } from '../lib/bargein';
import { getWeatherReport } from '../lib/weather';
import { containsWake, normalize, stripWake } from '../lib/wake';
import {
  MemoryStore,
  loadMemoryStore,
  saveMemoryStore,
  type MemoryFile,
  type MemoryItem,
  type MemoryKind,
} from '../lib/memory';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  uid,
  type LogEntry,
  type MicInput,
  type Mode,
  type Note,
  type Settings,
  type TimerItem,
  formatDuration,
} from '../types';

const WAKE_WINDOW_MS = 9000;
// Nach dem letzten Satz bleibt die stille Aufnahme noch kurz offen, damit
// Sprechpausen zwischen gestreamten Sätzen keine neue Sitzung auslösen.
const SILENT_BARGE_GRACE_MS = 2000;
// Eine stille Sitzung wird nach dieser Zeit erneuert, damit lange Antworten
// nicht mitten im Satz das Zuhören verlieren.
const SILENT_BARGE_SESSION_MS = 20_000;

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* beschädigte Einstellungen ignorieren */
  }
  return { ...DEFAULT_SETTINGS };
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.notes);
    if (raw) {
      const parsed = JSON.parse(raw) as Note[];
      if (Array.isArray(parsed)) return parsed.slice(-40);
    }
  } catch {
    /* ignorieren */
  }
  return [];
}

function beep(): void {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    /* Audio-Ausgabe nicht verfügbar */
  }
}

/** Formuliert fällige Timer für die Sprachansage — einmal für alle Pfade. */
function describeDue(entries: TimerRecord[]): string {
  return entries
    .map((entry) =>
      entry.kind === 'alarm'
        ? entry.label !== 'Wecker'
          ? `Dein Wecker für ${entry.label} ist fällig.`
          : 'Dein Wecker ist fällig.'
        : entry.label !== 'Timer'
          ? `Dein Timer für ${entry.label} ist abgelaufen.`
          : 'Dein Timer ist abgelaufen.',
    )
    .join(' ');
}

function readLocalConversations(): ConversationFile[] {
  try {
    const raw = localStorage.getItem('jarvis.history.v1');
    const parsed = raw ? (JSON.parse(raw) as ConversationFile[]) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && Array.isArray(entry.turns))
      : [];
  } catch {
    return [];
  }
}

function httpUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ''));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

/**
 * Öffnet einen Link im gewählten Browser (Desktop-App) oder in einem neuen
 * Tab. false bedeutet: nichts hat sich geöffnet.
 */
async function openLink(url: string, browser: string): Promise<boolean> {
  const desktop = getDesktop();
  if (desktop?.openUrl) {
    try {
      const result = await desktop.openUrl(url, browser);
      return Boolean(result?.ok);
    } catch {
      return false;
    }
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
}

export function useJarvis() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [mode, setMode] = useState<Mode>('off');
  const modeRef = useRef<Mode>('off');

  const [engineActive, setEngineActive] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  // Ende des Nachfrage-Fensters als Zeitstempel; 0 = nicht offen.
  const [followUpUntil, setFollowUpUntil] = useState(0);
  const [dictationMode, setDictationMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('jarvis.dictation') === '1';
    } catch {
      return false;
    }
  });
  const [dictationAvailable, setDictationAvailable] = useState(false);
  const [ttsVoice, setTtsVoice] = useState<string | null>(null);
  const [ttsEngines, setTtsEngines] = useState<TtsEngineOption[]>([]);
  const dictationModeRef = useRef(dictationMode);
  dictationModeRef.current = dictationMode;
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [entries, setEntries] = useState<LogEntry[]>(() => [
    {
      id: uid(),
      role: 'system',
      text: 'Interface initialisiert. Mikrofon-Assistent im Standby.',
      at: Date.now(),
    },
  ]);
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const memoryRef = useRef<MemoryStore>(new MemoryStore());
  const memoryBridgeRef = useRef<{ load?: () => Promise<unknown>; save?: (file: MemoryFile) => Promise<unknown> }>({});
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [timers, setTimers] = useState<TimerItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingTool, setPendingTool] = useState<PendingTool | null>(null);
  const [confirmListening, setConfirmListening] = useState(false);
  const [pendingMemories, setPendingMemories] = useState<MemoryItem[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [lastUndo, setLastUndo] = useState<ActivityEntry | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [aiStatus, setAiStatus] = useState<BrainStatus | null>(null);
  const [sttStatus, setSttStatus] = useState<SttStatus | null>(null);
  const [micInputs, setMicInputs] = useState<MicInput[]>([]);
  const [micState, setMicState] = useState<'idle' | 'ready' | 'error'>('idle');
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [now, setNow] = useState(Date.now());
  const [startedAt] = useState(Date.now());

  const engineRef = useRef<SpeechEngine | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wokenUntilRef = useRef(0);
  // Öffnet in der Desktop-Hülle die kurze Aufnahme für das Nachfrage-Fenster.
  const followUpCaptureRef = useRef<() => void>(() => {});
  const lastWakeRef = useRef(0);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const aiStatusRef = useRef<BrainStatus | null>(null);
  const sttStatusRef = useRef<SttStatus | null>(null);
  const localTapRef = useRef<MicTap | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localStartingRef = useRef(false);
  const localSessionRef = useRef<{ timer: ReturnType<typeof setTimeout>; last: string } | null>(null);
  const startLocalRef = useRef<(silent?: boolean) => Promise<boolean>>(async () => false);
  const finishLocalRef = useRef<(text: string) => void>(() => {});
  const stopLocalRef = useRef<(cancel: boolean) => void>(() => {});
  // Unterbrechen durch Drüberreden: Eine stille Aufnahme begleitet die
  // Ausgabe, damit ein Zuruf ohne Weckwort ankommt (nur Desktop + sherpa).
  const silentBargeRef = useRef(false);
  const silentBlockedRef = useRef(false);
  const silentCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSilentRef = useRef<() => void>(() => {});
  const closeSilentRef = useRef<() => void>(() => {});
  const historyRef = useRef<BrainTurn[]>([]);
  const runToolRef = useRef<(call: ToolCall) => Promise<ToolOutcome>>(async () => ({
    ok: false,
    error: 'Das Werkzeug ist noch nicht bereit.',
  }));
  const startRef = useRef<() => void>(() => {});
  const pendingAnnouncementsRef = useRef<string[]>([]);
  const speechQueueRef = useRef<string[]>([]);
  const speechPumpRef = useRef(false);
  // Satz, der gerade gesprochen wird — Grundlage für die Barge-in-Prüfung.
  const spokenSentenceRef = useRef('');
  // Zeitpunkt des letzten fertigen Befehls: kurz danach stammen
  // Zwischenergebnisse noch vom Nutzer, nicht von einer Unterbrechung.
  const lastUserSpeechAtRef = useRef(0);
  const speechWaitRef = useRef<(() => void) | null>(null);
  const timersRef = useRef<TimerItem[]>([]);
  const notesRef = useRef<Note[]>([]);
  const finalHandlerRef = useRef<(text: string) => void>(() => {});
  const interimHandlerRef = useRef<(text: string) => void>(() => {});
  const errorHandlerRef = useRef<(code: string) => void>(() => {});
  const abortRef = useRef<AbortController | null>(null);
  // Jeder Abbruch erhöht den Zähler; laufende Befehle erkennen daran, dass
  // ihre Antwort nicht mehr gespeichert oder gesprochen werden darf.
  const cancelEpochRef = useRef(0);
  const persistMemoryRef = useRef<() => void>(() => {});
  const voiceCommandRef = useRef<() => void>(() => {});
  const conversationIdRef = useRef(
    `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  );
  const conversationStartedRef = useRef(Date.now());
  const conversationTitleRef = useRef('');
  const conversationTurnsRef = useRef<BrainTurn[]>([]);
  const conversationSummaryRef = useRef('');
  // Beitragszähler läuft monoton weiter, auch wenn der gespeicherte Verlauf
  // bei 60 Beiträgen gekappt wird — sonst gäbe es nie wieder eine Summary.
  const turnSeqRef = useRef(0);
  const lastSummaryAtRef = useRef(0);

  timersRef.current = timers;
  notesRef.current = notes;
  sttStatusRef.current = sttStatus;

  const changeMode = useCallback((next: Mode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const pushEntry = useCallback((entry: Omit<LogEntry, 'id' | 'at'>) => {
    setEntries((prev) => [...prev.slice(-120), { ...entry, id: uid(), at: Date.now() }]);
  }, []);

  /** Legt einen leeren Jarvis-Eintrag an, den der Textstrom füllt. */
  const appendStreamEntry = useCallback((role: LogEntry['role']) => {
    const id = uid();
    setEntries((prev) => [...prev.slice(-120), { id, role, text: '', at: Date.now() }]);
    return id;
  }, []);

  const updateEntry = useCallback((id: string, patch: Pick<LogEntry, 'text'>) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }, []);

  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashNotice = useCallback((text: string, ms = 6000) => {
    setNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), ms);
  }, []);

  const pendingToolRef = useRef<{
    id: string;
    resolve: (confirmed: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  /** Dauer des Nachfrage-Fensters aus den Einstellungen (0 = aus). */
  const followUpWindowMs = useCallback(() => {
    const seconds = Number(settingsRef.current.followUpSeconds);
    if (!Number.isFinite(seconds)) return 0;
    return Math.max(0, Math.min(20, Math.round(seconds))) * 1000;
  }, []);

  /**
   * Öffnet das kurze Nachfrage-Fenster: Die nächste Äußerung gilt ohne
   * Weckwort. Im Browser läuft die Erkennung ohnehin weiter, in der
   * Desktop-Hülle wird eigens eine Aufnahme dafür gestartet.
   */
  const openFollowUp = useCallback(() => {
    const ms = followUpWindowMs();
    const desktop = getDesktop();
    const canListen =
      Boolean(engineRef.current?.isActive) ||
      Boolean(
        desktop &&
          settingsRef.current.voiceCommands &&
          (desktop.voiceCommand || desktop.sttStart),
      );
    if (!ms || !canListen || pendingToolRef.current) return 0;
    const until = Date.now() + ms;
    wokenUntilRef.current = until;
    setFollowUpUntil(until);
    changeMode('woken');
    return ms;
  }, [changeMode, followUpWindowMs]);

  const clearFollowUp = useCallback(() => {
    wokenUntilRef.current = 0;
    setFollowUpUntil(0);
  }, []);

  const settleTool = useCallback((confirmed: boolean) => {
    const pending = pendingToolRef.current;
    if (!pending) return;
    pendingToolRef.current = null;
    clearTimeout(pending.timer);
    setPendingTool(null);
    setConfirmListening(false);
    pending.resolve(confirmed);
  }, []);

  /** Wartet auf die Bestätigung im Fenster; nach 60 Sekunden wird abgelehnt. */
  const requestToolConfirm = useCallback(
    (tool: PendingTool) =>
      new Promise<boolean>((resolve) => {
        const previous = pendingToolRef.current;
        if (previous) {
          clearTimeout(previous.timer);
          pendingToolRef.current = null;
          previous.resolve(false);
        }

        const timer = setTimeout(() => {
          if (pendingToolRef.current?.id !== tool.id) return;
          pendingToolRef.current = null;
          setPendingTool(null);
          setConfirmListening(false);
          flashNotice('Bestätigung abgelaufen — die Aktion wurde nicht ausgeführt.', 6000);
          resolve(false);
        }, 60_000);

        pendingToolRef.current = { id: tool.id, resolve, timer };
        setPendingTool(tool);

        const desktop = getDesktop();
        if (desktop?.voiceConfirm && settingsRef.current.voiceConfirm) {
          setConfirmListening(true);
          void desktop
            .voiceConfirm({ culture: settingsRef.current.lang })
            .then((result) => {
              if (pendingToolRef.current?.id !== tool.id) return;
              setConfirmListening(false);
              if (!result.ok) return;
              const answer = String(result.text ?? '').toLowerCase();
              if (/^(ja|ja bitte|okay|in ordnung)/.test(answer)) settleTool(true);
              else if (/^(nein|nein danke|abbrechen|stop)/.test(answer)) settleTool(false);
            })
            .catch(() => setConfirmListening(false));
        }
      }),
    [flashNotice, settleTool],
  );

  const cancelSilentClose = useCallback(() => {
    if (silentCloseTimerRef.current != null) {
      clearTimeout(silentCloseTimerRef.current);
      silentCloseTimerRef.current = null;
    }
  }, []);

  /**
   * Öffnet die stille Aufnahme für Barge-in — nur wenn die Einstellung an ist,
   * sherpa bereitsteht und keine andere Sitzung (Weckwort, Hotkey,
   * Bestätigung) das Mikrofon schon nutzt.
   */
  const openSilentBarge = useCallback(() => {
    const current = settingsRef.current;
    if (!current.bargeListening || !current.localStt || !getDesktop()) return;
    if (silentBargeRef.current || silentBlockedRef.current) return;
    if (localSessionRef.current || localStartingRef.current) return;
    // Während einer Ja/Nein-Rückfrage gehört das Mikrofon der Bestätigung.
    if (pendingToolRef.current) return;
    if (!sttStatusRef.current?.available) return;
    cancelSilentClose();
    silentBargeRef.current = true;
    void startLocalRef.current(true).then((started) => {
      if (started) return;
      // Kein Mikrofon oder kein Modell: für diese Antwort nicht weiter versuchen.
      silentBargeRef.current = false;
      silentBlockedRef.current = true;
    });
  }, [cancelSilentClose]);

  /** Schließt die stille Aufnahme, sobald die Ausgabe wirklich vorbei ist. */
  const scheduleSilentClose = useCallback(() => {
    if (!silentBargeRef.current && !silentBlockedRef.current) return;
    cancelSilentClose();
    silentCloseTimerRef.current = setTimeout(() => {
      silentCloseTimerRef.current = null;
      // Die nächste Antwort darf es erneut versuchen.
      silentBlockedRef.current = false;
      if (!silentBargeRef.current) return;
      silentBargeRef.current = false;
      if (localSessionRef.current) stopLocalRef.current(true);
    }, SILENT_BARGE_GRACE_MS);
  }, [cancelSilentClose]);

  openSilentRef.current = openSilentBarge;
  closeSilentRef.current = scheduleSilentClose;

  const getSpeaker = useCallback((): Speaker => {
    if (!speakerRef.current) {
      const desktop = getDesktop();
      const bridge =
        desktop && typeof desktop.synthesizeSpeech === 'function'
          ? (text: string, options?: { lengthScale?: number }) => desktop.synthesizeSpeech(text, options)
          : undefined;
      speakerRef.current = new Speaker(bridge);
    }
    return speakerRef.current;
  }, []);

  const speak = useCallback(
    async (text: string, log = true): Promise<void> => {
      if (!text.trim()) return;
      const speaker = getSpeaker();
      // Ohne Piper/ElevenLabs bleibt es still — keine Windows-Standardstimme.
      if (!speaker.available) {
        if (log) pushEntry({ role: 'jarvis', text });
        return;
      }
      if (log) pushEntry({ role: 'jarvis', text });
      // Die Erkennung bleibt eingeschaltet: Wer dazwischenredet, unterbricht
      // Jarvis. Die eigene Stimme filtert shouldInterrupt() über den Text.
      speakingRef.current = true;
      spokenSentenceRef.current = text;
      setSpeaking(true);
      // Drüberreden zulassen: Die stille Aufnahme läuft, solange gesprochen wird.
      openSilentRef.current();
      try {
        await speaker.speak(text, {
          rate: settingsRef.current.rate,
          volume: settingsRef.current.volume,
          engine: settingsRef.current.ttsEngine,
        });
      } finally {
        spokenSentenceRef.current = '';
        speakingRef.current = false;
        setSpeaking(false);
        closeSilentRef.current();
      }
    },
    [getSpeaker, pushEntry],
  );

  const releaseSpeechWaiter = useCallback(() => {
    const waiter = speechWaitRef.current;
    if (!waiter) return;
    speechWaitRef.current = null;
    waiter();
  }, []);

  const stopSpeaking = useCallback(() => {
    pendingAnnouncementsRef.current = [];
    speechQueueRef.current = [];
    speakerRef.current?.cancel();
    spokenSentenceRef.current = '';
    speakingRef.current = false;
    setSpeaking(false);
    releaseSpeechWaiter();
  }, [releaseSpeechWaiter]);

  /**
   * Barge-in: Der Nutzer redet dazwischen. Ausgabe und laufende Antwort
   * stoppen, das Mikrofon hört weiter — der gesprochene Satz wird gleich als
   * neuer Befehl verarbeitet.
   */
  const bargeIn = useCallback(
    (announce = true) => {
      abortRef.current?.abort();
      abortRef.current = null;
      busyRef.current = false;
      stopSpeaking();
      // Eine stille Aufnahme wird jetzt zur normalen: Der Zuruf läuft weiter
      // und wird gleich als Befehl ausgeführt.
      silentBargeRef.current = false;
      cancelSilentClose();
      // Kurzes Folgefenster: Die nächste Äußerung braucht kein Weckwort.
      wokenUntilRef.current = Date.now() + WAKE_WINDOW_MS;
      changeMode('woken');
      if (announce) flashNotice('Ich höre.', 2000);
    },
    [cancelSilentClose, changeMode, flashNotice, stopSpeaking],
  );
  // Für Effekte, die nur einmal aufgesetzt werden (Weckwort, Push-to-talk).
  const bargeInRef = useRef<(announce?: boolean) => void>(() => {});
  bargeInRef.current = bargeIn;

  /** „Stopp“ beendet auch eine noch laufende Antwort, nicht nur den Satz. */
  const stopSpeech = useCallback(() => {
    if (abortRef.current || speakingRef.current || speechQueueRef.current.length > 0) {
      bargeIn(false);
      return;
    }
    stopSpeaking();
  }, [bargeIn, stopSpeaking]);

  /**
   * Gemeinsame Barge-in-Prüfung für beide Erkennungswege — Chromes Web Speech
   * und die lokale sherpa-Erkennung der Desktop-App. Beide liefern Teil- und
   * Endergebnisse, beide müssen gleich reagieren.
   *
   * 'echo'      eigene Stimme über die Lautsprecher, verwerfen
   * 'interrupt' Ausgabe wurde gerade abgebrochen
   * 'none'      keine Ausgabe aktiv oder direkt nach einem Befehl
   */
  const checkBargeIn = useCallback(
    (text: string): 'echo' | 'interrupt' | 'none' => {
      const heard = String(text ?? '').trim();
      const active = speakingRef.current || speechQueueRef.current.length > 0;
      if (!heard || !active) return 'none';
      // Direkt nach einem Befehl gehören Nachzügler noch zur Frage.
      if (Date.now() - lastUserSpeechAtRef.current < 800) return 'none';
      if (!shouldInterrupt(heard, spokenSentenceRef.current)) return 'echo';
      bargeIn();
      return 'interrupt';
    },
    [bargeIn],
  );
  // Für Zuhörer, die nur einmal aufgesetzt werden (sherpa-Ereignisse).
  const checkBargeInRef = useRef(checkBargeIn);
  checkBargeInRef.current = checkBargeIn;

  /** Bricht Antwort, Sprachausgabe und offene Bestätigungen in einem Zug ab. */
  const cancelCurrent = useCallback(() => {
    cancelEpochRef.current += 1;
    silentBargeRef.current = false;
    silentBlockedRef.current = false;
    cancelSilentClose();
    const localActive = Boolean(localSessionRef.current);
    if (localActive) stopLocalRef.current(true);
    const wasActive =
      localActive || Boolean(abortRef.current) || busyRef.current || speakingRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    pendingAnnouncementsRef.current = [];
    speechQueueRef.current = [];
    spokenSentenceRef.current = '';
    speakerRef.current?.cancel();
    setSpeaking(false);
    setConfirmListening(false);
    releaseSpeechWaiter();
    settleTool(false);
    changeMode(engineRef.current?.isActive ? 'wake' : 'off');
    if (wasActive) flashNotice('Abgebrochen.', 3000);
  }, [cancelSilentClose, changeMode, flashNotice, releaseSpeechWaiter, settleTool]);

  /** Spielt gestreamte Sätze nacheinander ab, ohne sich zu überlagern. */
  const runSpeechQueue = useCallback(async () => {
    if (speechPumpRef.current) return;
    speechPumpRef.current = true;
    try {
      while (speechQueueRef.current.length) {
        const sentence = speechQueueRef.current.shift();
        if (!sentence) continue;
        await speak(sentence, false);
      }
    } finally {
      speechPumpRef.current = false;
      if (speechQueueRef.current.length === 0) releaseSpeechWaiter();
    }
  }, [releaseSpeechWaiter, speak]);

  const enqueueSpeech = useCallback(
    (text: string) => {
      const sentence = text.trim();
      if (!sentence) return;
      speechQueueRef.current.push(sentence);
      void runSpeechQueue();
    },
    [runSpeechQueue],
  );

  const waitForSpeech = useCallback(() => {
    if (!speechPumpRef.current && speechQueueRef.current.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      speechWaitRef.current = resolve;
    });
  }, []);

  const addNote = useCallback(
    (text: string) => {
      const note: Note = { id: uid(), text, at: Date.now() };
      setNotes((prev) => [...prev.slice(-39), note]);
      pushEntry({ role: 'system', text: `Notiz gespeichert: ${text}` });
      return note;
    },
    [pushEntry],
  );

  const clearNotes = useCallback(() => {
    setNotes([]);
  }, []);

  const addTimer = useCallback((due: number, label: string, kind: 'timer' | 'alarm') => {
    const record: TimerRecord = { id: uid(), due, label, kind, createdAt: Date.now() };
    setTimers((prev) => [...prev, record]);
    void getDesktop()?.timersAdd?.({ id: record.id, due, label, kind });
    return record;
  }, []);

  const removeTimer = useCallback((id: string) => {
    setTimers((prev) => prev.filter((timer) => timer.id !== id));
    void getDesktop()?.timersRemove?.(id);
  }, []);

  const undoLast = useCallback(() => {
    const entry = lastUndo;
    if (!entry?.undo) {
      flashNotice('Nichts zum Rückgängigmachen.');
      return;
    }
    if (entry.undo.type === 'note') {
      setNotes((prev) => prev.filter((note) => note.id !== entry.undo!.id));
    } else {
      removeTimer(entry.undo.id);
    }
    void getDesktop()?.activityAppend?.({
      tool: 'undo',
      ok: true,
      summary: `${entry.tool} rückgängig gemacht`,
    });
    setLastUndo(null);
    flashNotice('Rückgängig gemacht.', 4000);
  }, [flashNotice, lastUndo, removeTimer]);

  /** Schreibt eine ausgeführte Aktion ins lokale Protokoll. */
  const logActivity = useCallback(
    (tool: string, args: Record<string, unknown>, outcome: ToolOutcome, summary: string) => {
      const noteId = String((outcome as Record<string, unknown>)._noteId || '');
      const timerId = String((outcome as Record<string, unknown>)._timerId || '');
      const undo = noteId
        ? ({ type: 'note', id: noteId } as const)
        : timerId
          ? ({ type: 'timer', id: timerId } as const)
          : undefined;
      const desktop = getDesktop();
      const payload = { tool, ok: Boolean(outcome.ok), summary, args, undo };

      if (desktop?.activityAppend) {
        void desktop.activityAppend(payload).then((result) => {
          if (!result.ok || !result.entry) return;
          setActivity((prev) => [result.entry!, ...prev].slice(0, 40));
          if (result.entry.undo) setLastUndo(result.entry);
        });
        return;
      }

      const entry: ActivityEntry = { id: uid(), at: Date.now(), ...payload };
      setActivity((prev) => [entry, ...prev].slice(0, 40));
      if (undo) setLastUndo(entry);
    },
    [],
  );

  // Freie Fragen streamen über den lokalen Proxy: Der Text erscheint sofort,
  // und jeder fertige Satz geht direkt in die Sprachausgabe.
  const answerFreeform = useCallback(
    async (question: string, options: { clipboard?: string } = {}): Promise<JarvisReply> => {
      if (!aiStatusRef.current?.configured) {
        return {
          speak:
            'Für freie Fragen brauche ich ein Sprachmodell. Hinterlege GEMINI_API_KEY oder ZAI_API_KEY in der Datei .env und starte den Server neu, dann beantworte ich alle Fragen.',
        };
      }

      const entryId = appendStreamEntry('jarvis');
      const splitter = new SentenceStream();
      let streamed = '';
      let spoken = false;

      const speakSentences = (sentences: string[]) => {
        if (!sentences.length) return;
        spoken = true;
        changeMode('speaking');
        sentences.forEach((sentence) => enqueueSpeech(sentence));
      };

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const relevantMemories = memoryRef.current.search(question, 4).map((entry) => entry.item.text);
        const result = await askBrain(question, historyRef.current, relevantMemories, {
          onToolCall: (call) => runToolRef.current(call),
          onDelta: (chunk) => {
            streamed += chunk;
            updateEntry(entryId, { text: streamed.trimStart() });
            speakSentences(splitter.push(chunk));
          },
          signal: controller.signal,
          clipboard: options.clipboard,
          summary: conversationSummaryRef.current || undefined,
        });

        const answer = result.answer.trim();

        if (answer && settingsRef.current.autoMemory) {
          void extractMemories(question, answer).then((items) => {
            let added = 0;
            for (const item of items) {
              const stored = memoryRef.current.add(item.text, item.kind, 'pending');
              if (!stored.duplicate) added += 1;
            }
            if (added > 0) {
              persistMemoryRef.current();
              flashNotice(
                `${added} Gedächtnis-Vorschlag${added === 1 ? '' : 'e'} — in den Einstellungen prüfen.`,
                8000,
              );
            }
          });
        }

        speakSentences(splitter.flush());
        // Ohne Streaming (älterer Server, Anbieter-Fallback) kommt alles am Ende.
        if (!spoken && answer) {
          speakSentences(splitter.push(answer));
          speakSentences(splitter.flush());
        }

        const finalText = answer || streamed.trim();
        if (finalText) updateEntry(entryId, { text: finalText });

        await waitForSpeech();
        return { speak: '', sources: result.sources, text: finalText };
      } catch (error) {
        if (controller.signal.aborted) {
          if (streamed.trim()) updateEntry(entryId, { text: `${streamed.trim()} …` });
          else setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
          return { speak: '', text: streamed.trim() };
        }
        speakSentences(splitter.flush());
        const message = describeBrainError(error);
        if (!streamed.trim()) {
          setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
          return { speak: message };
        }
        enqueueSpeech(message);
        changeMode('speaking');
        await waitForSpeech();
        return { speak: '' };
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [appendStreamEntry, changeMode, enqueueSpeech, getSpeaker, updateEntry, waitForSpeech],
  );

  // Timer-Ansagen warten, bis eine laufende Antwort fertig gesprochen ist.
  const drainAnnouncements = useCallback(async () => {
    while (pendingAnnouncementsRef.current.length) {
      if (busyRef.current || speakingRef.current) return;
      const message = pendingAnnouncementsRef.current.shift();
      if (!message) return;
      busyRef.current = true;
      const previousMode = modeRef.current;
      changeMode('speaking');
      try {
        await speak(message);
      } finally {
        busyRef.current = false;
        const resumeWoken = previousMode === 'woken' && Date.now() < wokenUntilRef.current;
        changeMode(resumeWoken ? 'woken' : engineRef.current?.isActive ? 'wake' : 'off');
      }
    }
  }, [changeMode, speak]);

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return;
    void desktop.getInfo().then((info) => {
      setDictationAvailable(Boolean(info.dictation));
      setTtsVoice(info.tts?.available ? info.tts.voice : null);
      setTtsEngines(info.ttsEngines ?? []);
      setSttStatus(info.stt ?? null);
    });
  }, []);

  const dictateIntoWindow = useCallback(async () => {
    const desktop = getDesktop();
    if (!desktop) return;
    setNotice('Diktat läuft — sprich jetzt. Der Text landet im aktiven Fenster.');
    const result = await desktop.dictate({ culture: settingsRef.current.lang || 'de-DE' });
    if (!result.ok) {
      setNotice(`Diktat nicht möglich: ${result.error ?? 'unbekannter Fehler'}`);
      return;
    }
    const text = String(result.text ?? '').trim();
    if (!text) {
      setNotice('Nichts verstanden — bitte noch einmal.');
      return;
    }
    const typed = await desktop.typeText(text);
    if (typed.ok) {
      setNotice(`Diktat eingefügt: ${text}`);
      pushEntry({ role: 'system', text: `Diktat ins aktive Fenster: ${text}` });
    } else {
      setNotice(`Einfügen fehlgeschlagen: ${typed.error ?? 'unbekannter Fehler'}`);
    }
  }, [pushEntry]);

  const dictateRef = useRef(dictateIntoWindow);
  dictateRef.current = dictateIntoWindow;

  useEffect(() => {
    void getDesktop()?.setDictationMode?.(dictationMode);
  }, [dictationMode]);

  const toggleDictation = useCallback(() => {
    setDictationMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('jarvis.dictation', next ? '1' : '0');
      } catch {
        /* Speicher gesperrt */
      }
      setNotice(
        next
          ? 'Diktat-Modus aktiv: Push-to-talk (Strg+Alt+Leertaste) diktiert in das aktive Fenster.'
          : 'Diktat-Modus aus: Push-to-talk weckt Jarvis wie gewohnt.',
      );
      return next;
    });
  }, []);

  const buildDesktopActions = useCallback((): DesktopActions | null => {
    const desktop = getDesktop();
    if (!desktop) return null;
    return {
      openApp: async (name) => {
        const result = await desktop.openApp(name);
        return { speak: result.ok ? `${name} wird gestartet.` : `Ich konnte ${name} nicht starten.` };
      },
      closeApp: async (name) => {
        const result = await desktop.closeApp?.(name);
        if (!result) return { speak: 'Programme schließen geht nur in der Desktop-App.' };
        return {
          speak: result.ok
            ? `${name} ist geschlossen.`
            : `${name} läuft offenbar nicht — oder lässt sich nicht beenden.`,
        };
      },
      setVolume: async (percent) => {
        const result = await desktop.setVolume?.(percent);
        if (!result) return { speak: 'Die Lautstärke lässt sich nur in der Desktop-App setzen.' };
        return {
          speak: result.ok
            ? `Lautstärke auf ${percent} Prozent.`
            : `Die Lautstärke ließ sich nicht auf ${percent} Prozent setzen.`,
        };
      },
      volume: async (direction) => {
        const result = await desktop.volume(direction);
        if (!result.ok) return { speak: 'Die Lautstärke ließ sich nicht ändern.' };
        return {
          speak:
            direction === 'mute'
              ? 'Stummschaltung umgeschaltet.'
              : direction === 'up'
                ? 'Lauter.'
                : 'Leiser.',
        };
      },
      media: async (action) => {
        const result = await desktop.media(action);
        if (!result.ok) return { speak: 'Die Mediensteuerung hat nicht reagiert. Ist ein Player aktiv?' };
        return {
          speak:
            action === 'next'
              ? 'Nächster Titel.'
              : action === 'previous'
                ? 'Vorheriger Titel.'
                : 'Wiedergabe umgeschaltet.',
        };
      },
      lock: async () => {
        const result = await desktop.lock();
        return { speak: result.ok ? 'Der Rechner wird gesperrt.' : 'Sperren hat nicht funktioniert.' };
      },
    };
  }, []);

  const persistMemory = useCallback(() => {
    setMemories(memoryRef.current.recent(50));
    setPendingMemories(memoryRef.current.pending(10));
    void saveMemoryStore(memoryRef.current, memoryBridgeRef.current);
  }, []);
  persistMemoryRef.current = persistMemory;

  const refreshConversations = useCallback(async () => {
    const desktop = getDesktop();
    if (desktop?.historyList) {
      try {
        setConversations(await desktop.historyList());
      } catch {
        /* Verlauf bleibt dann unverändert */
      }
      return;
    }
    setConversations(
      readLocalConversations()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          startedAt: entry.startedAt,
          updatedAt: entry.updatedAt,
          summary: entry.summary,
          turns: entry.turns.length,
        })),
    );
  }, []);

  const saveConversation = useCallback(
    async (turns: BrainTurn[]) => {
      if (turns.length === 0) return;
      // Einmal vergeben und behalten: Beim Kappen auf 60 Beiträge fällt sonst
      // die erste Frage weg und der Titel springt auf eine spätere um.
      conversationTitleRef.current ||=
        turns.find((turn) => turn.role === 'user')?.content.slice(0, 60) || 'Gespräch';
      const title = conversationTitleRef.current;
      const payload = {
        id: conversationIdRef.current,
        title,
        startedAt: conversationStartedRef.current,
        updatedAt: Date.now(),
        summary: conversationSummaryRef.current,
        turns,
      };
      const desktop = getDesktop();
      if (desktop?.historySave) {
        try {
          const result = await desktop.historySave(payload);
          if (result.ok) await refreshConversations();
        } catch {
          /* Verlauf bleibt dann nur im Speicher */
        }
        return;
      }
      try {
        const list = readLocalConversations().filter((entry) => entry.id !== payload.id);
        localStorage.setItem('jarvis.history.v1', JSON.stringify([payload, ...list].slice(0, 10)));
        await refreshConversations();
      } catch {
        /* Speicher voll oder gesperrt */
      }
    },
    [refreshConversations],
  );

  const resumeConversation = useCallback(
    async (id: string) => {
      if (busyRef.current) {
        flashNotice('Bitte warte, bis die laufende Antwort fertig ist.', 4000);
        return;
      }
      const desktop = getDesktop();
      let file: ConversationFile | null = null;
      if (desktop?.historyLoad) {
        try {
          file = await desktop.historyLoad(id);
        } catch {
          file = null;
        }
      } else {
        file = readLocalConversations().find((entry) => entry.id === id) ?? null;
      }

      if (!file || !Array.isArray(file.turns) || file.turns.length === 0) {
        flashNotice('Dieses Gespräch konnte ich nicht laden.');
        return;
      }

      conversationIdRef.current = file.id;
      conversationStartedRef.current = file.startedAt;
      conversationTitleRef.current = file.title;
      conversationSummaryRef.current = file.summary || '';
      conversationTurnsRef.current = file.turns;
      turnSeqRef.current = file.turns.length;
      lastSummaryAtRef.current = file.turns.length;
      historyRef.current = file.turns.slice(-8);

      const base = Date.now();
      setEntries([
        { id: uid(), role: 'system', text: `Gespräch fortgesetzt: ${file.title}`, at: base },
        ...file.turns.map((turn, index) => ({
          id: uid(),
          role: turn.role === 'user' ? ('user' as const) : ('jarvis' as const),
          text: turn.content,
          at: base + index,
        })),
      ]);
      flashNotice('Gespräch geladen — du kannst direkt weiterfragen.', 5000);
    },
    [flashNotice],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (busyRef.current && conversationIdRef.current === id) {
        flashNotice('Bitte warte, bis die laufende Antwort fertig ist.', 4000);
        return;
      }
      const desktop = getDesktop();
      if (desktop?.historyRemove) {
        try {
          await desktop.historyRemove(id);
        } catch {
          /* ignorieren */
        }
      } else {
        try {
          localStorage.setItem(
            'jarvis.history.v1',
            JSON.stringify(readLocalConversations().filter((entry) => entry.id !== id)),
          );
        } catch {
          /* ignorieren */
        }
      }
      if (conversationIdRef.current === id) {
        conversationIdRef.current = `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        conversationStartedRef.current = Date.now();
        conversationTitleRef.current = '';
        conversationTurnsRef.current = [];
        conversationSummaryRef.current = '';
        historyRef.current = [];
        turnSeqRef.current = 0;
        lastSummaryAtRef.current = 0;
      }
      await refreshConversations();
    },
    [flashNotice, refreshConversations],
  );

  const forgetMemoryById = useCallback(
    (id: string) => {
      if (memoryRef.current.forgetById(id)) persistMemory();
    },
    [persistMemory],
  );

  const approveMemory = useCallback(
    (id: string) => {
      if (memoryRef.current.approve(id)) {
        persistMemory();
        flashNotice('Erinnerung übernommen.', 4000);
      }
    },
    [flashNotice, persistMemory],
  );

  const rejectMemory = useCallback(
    (id: string) => {
      if (memoryRef.current.reject(id)) persistMemory();
    },
    [persistMemory],
  );

  const clearMemories = useCallback(() => {
    memoryRef.current.clear();
    persistMemory();
  }, [persistMemory]);

  const runTool = useCallback(
    async (call: ToolCall): Promise<ToolOutcome> => {
      const tool = parseToolCall(call);
      if (!tool) return { ok: false, error: 'Unbekanntes oder ungültiges Werkzeug.' };

      const autoAllowed =
        (settingsRef.current.autoAllowTools ?? []).includes(tool.name) &&
        tool.description.risk !== 'high';
      if (requiresConfirmation(tool.name) && !autoAllowed) {
        await waitForSpeech();
        const confirmed = await requestToolConfirm(tool);
        if (!confirmed) {
          return { ok: false, canceled: true, message: 'Der Nutzer hat die Aktion nicht bestätigt.' };
        }
      }

      const desktop = getDesktop();
      const args = tool.args;

      try {
        const outcome = await (async (): Promise<ToolOutcome> => {
          switch (tool.name) {
          case 'get_system_status': {
            const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
            return {
              ok: true,
              uhrzeit: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
              datum: new Date().toLocaleDateString('de-DE', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              }),
              mikrofon: engineRef.current?.isActive ? 'aktiv' : 'inaktiv',
              stimme: voiceLabelRef.current,
              laufzeit_minuten: minutes,
              timer: timersRef.current.length,
              notizen: notesRef.current.length,
              erinnerungen: memoryRef.current.size,
              sprachmodell: aiStatusRef.current?.provider ?? 'nicht verbunden',
              websuche: aiStatusRef.current?.search ?? 'unbekannt',
            };
          }

          case 'get_weather': {
            const city = String(args.city ?? '').trim().slice(0, 80) || settingsRef.current.city;
            const report = await getWeatherReport(city);
            return { ok: true, stadt: city, bericht: report };
          }

          case 'list_notes': {
            const list = notesRef.current.slice(-10).map((note) => note.text);
            return { ok: true, anzahl: notesRef.current.length, notizen: list };
          }

          case 'list_timers': {
            const list = timersRef.current.map((timer) => ({
              label: timer.label,
              art: timer.kind,
              rest_minuten: Math.max(0, Math.round((timer.due - Date.now()) / 60000)),
            }));
            return { ok: true, anzahl: list.length, timer: list };
          }

          case 'set_timer': {
            const kind = args.kind === 'alarm' ? 'alarm' : 'timer';
            const label =
              String(args.label ?? '').trim().slice(0, 80) || (kind === 'alarm' ? 'Wecker' : 'Timer');

            if (kind === 'alarm') {
              const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(args.time ?? '').trim());
              if (!match) {
                return { ok: false, error: 'Für den Wecker fehlt eine Uhrzeit im Format HH:MM.' };
              }
              const due = new Date();
              due.setHours(Number(match[1]), Number(match[2]), 0, 0);
              if (due.getTime() <= Date.now() + 1000) due.setDate(due.getDate() + 1);
              const timer = addTimer(due.getTime(), label, 'alarm');
              return {
                ok: true,
                art: 'alarm',
                _timerId: timer.id,
                label,
                uhrzeit: `${match[1].padStart(2, '0')}:${match[2]}`,
                in_minuten: Math.max(0, Math.round((due.getTime() - Date.now()) / 60000)),
              };
            }

            const seconds = Number(args.seconds);
            if (!Number.isFinite(seconds) || seconds < 5 || seconds > 86_400) {
              return { ok: false, error: 'Für den Timer fehlt eine Dauer zwischen 5 Sekunden und 24 Stunden.' };
            }
            const due = Date.now() + seconds * 1000;
            const timer = addTimer(due, label, 'timer');
            return {
              ok: true,
              art: 'timer',
              _timerId: timer.id,
              label,
              sekunden: Math.round(seconds),
              faellig_um: new Date(due).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            };
          }

          case 'add_note': {
            const text = String(args.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
            if (text.length < 2) return { ok: false, error: 'Der Notiztext fehlt.' };
            const note = addNote(text);
            return { ok: true, notiz: text, _noteId: note.id };
          }

          case 'remember_fact': {
            const text = String(args.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
            if (text.length < 2) return { ok: false, error: 'Der Eintrag fehlt.' };
            const kind = args.kind === 'preference' ? 'preference' : 'fact';
            const result = memoryRef.current.add(text, kind);
            persistMemory();
            return { ok: true, gemerkt: result.item.text, neu: !result.duplicate };
          }

          case 'open_app': {
            if (!desktop?.openApp) {
              return { ok: false, error: 'Programme lassen sich nur in der Desktop-App starten.' };
            }
            const name = String(args.name ?? '').trim().slice(0, 60);
            if (!name) return { ok: false, error: 'Der Programmname fehlt.' };
            const result = await desktop.openApp(name);
            return result.ok
              ? { ok: true, programm: name }
              : { ok: false, error: 'Das Programm ließ sich nicht starten.' };
          }

          case 'close_app': {
            if (!desktop?.closeApp) {
              return { ok: false, error: 'Programme lassen sich nur in der Desktop-App schließen.' };
            }
            const name = String(args.name ?? '').trim().slice(0, 60);
            if (!name) return { ok: false, error: 'Der Programmname fehlt.' };
            const result = await desktop.closeApp(name);
            return result.ok
              ? { ok: true, programm: name, geschlossen: true }
              : { ok: false, error: `${name} läuft nicht oder ließ sich nicht beenden.` };
          }

          case 'open_url': {
            const url = httpUrl(args.url);
            if (!url) return { ok: false, error: 'Nur vollständige http- oder https-Adressen sind erlaubt.' };
            pushEntry({ role: 'system', text: `Öffne: ${url}`, url });
            if (!(await openLink(url, settingsRef.current.browser || ''))) {
              return { ok: false, error: 'Die Webseite ließ sich nicht öffnen.' };
            }
            return { ok: true, url };
          }

          case 'control_volume': {
            if (!desktop?.volume) {
              return { ok: false, error: 'Die Lautstärke lässt sich nur in der Desktop-App ändern.' };
            }
            const direction =
              args.direction === 'up' || args.direction === 'down' || args.direction === 'mute'
                ? args.direction
                : null;
            if (!direction) return { ok: false, error: 'Unbekannte Lautstärke-Richtung.' };
            const result = await desktop.volume(direction);
            return result.ok ? { ok: true, richtung: direction } : { ok: false, error: 'Die Lautstärke ließ sich nicht ändern.' };
          }

          case 'control_media': {
            if (!desktop?.media) {
              return { ok: false, error: 'Die Mediensteuerung gibt es nur in der Desktop-App.' };
            }
            const action =
              args.action === 'playpause' || args.action === 'next' || args.action === 'previous'
                ? args.action
                : null;
            if (!action) return { ok: false, error: 'Unbekannte Medienaktion.' };
            const result = await desktop.media(action);
            return result.ok ? { ok: true, aktion: action } : { ok: false, error: 'Die Mediensteuerung hat nicht reagiert.' };
          }

          case 'lock_screen': {
            if (!desktop?.lock) {
              return { ok: false, error: 'Sperren geht nur in der Desktop-App.' };
            }
            const result = await desktop.lock();
            return result.ok ? { ok: true } : { ok: false, error: 'Der Rechner ließ sich nicht sperren.' };
          }

          case 'propose_automation': {
            if (!desktop?.automationSave) {
              return { ok: false, error: 'Automationen lassen sich nur in der Desktop-App speichern.' };
            }
            const draft = routineFromDraft({
              name: args.name,
              description: args.description ?? args.summary,
              trigger: args.trigger,
              conditions: args.conditions,
              actions: args.actions,
            });
            if (!draft.ok) {
              return { ok: false, error: draft.error };
            }
            const saved = await desktop.automationSave(draft.routine);
            if (!saved.ok) {
              return { ok: false, error: saved.error || 'Der Entwurf ließ sich nicht speichern.' };
            }
            return {
              ok: true,
              entwurf: draft.routine.name,
              aktiv: false,
              hinweis:
                'Der Entwurf ist gespeichert und noch deaktiviert. Im Automation Center unter Automation prüfen und aktivieren.',
            };
          }

          default:
            return { ok: false, error: 'Unbekanntes Werkzeug.' };
          }
        })();

        const summary =
          String(
            (outcome as Record<string, unknown>)._summary ||
              outcome.message ||
              outcome.notiz ||
              outcome.label ||
              tool.description.title,
          ).slice(0, 240) || tool.description.title;
        logActivity(tool.name, args, outcome, summary);
        return outcome;
      } catch (error) {
        logActivity(tool.name, args, { ok: false }, `${tool.description.title} fehlgeschlagen`);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Die Aktion ist fehlgeschlagen.',
        };
      }
    },
    [
      addNote,
      addTimer,
      logActivity,
      persistMemory,
      pushEntry,
      requestToolConfirm,
      startedAt,
      waitForSpeech,
    ],
  );
  runToolRef.current = runTool;

  const execute = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      if (busyRef.current) {
        flashNotice('Ich verarbeite noch den letzten Befehl.', 4000);
        return;
      }
      const epoch = cancelEpochRef.current;
      const canceled = () => cancelEpochRef.current !== epoch;
      busyRef.current = true;
      wokenUntilRef.current = 0;
      setFollowUpUntil(0);
      setInterim('');
      changeMode('thinking');
      pushEntry({ role: 'user', text });

      const ctx: JarvisContext = {
        settings: settingsRef.current,
        desktop: buildDesktopActions(),
        notes: notesRef.current,
        timers: timersRef.current,
        addNote,
        clearNotes,
        addTimer,
        stopSpeaking: stopSpeech,
        voiceLabel: voiceLabelRef.current,
        listening: !!engineRef.current?.isActive,
        startedAt,
        brainConfigured: Boolean(aiStatusRef.current?.configured),
        // Rückfrage für lokale Befehle wie „Schließe Spotify“ über dieselbe
        // Ja/Nein-Karte, die auch die KI-Werkzeuge nutzen.
        confirm: (title: string, detail: string) =>
          requestToolConfirm({
            id: `bestaetigung-${Date.now()}`,
            name: 'close_app',
            args: {},
            description: { title, detail, risk: 'high' },
          }),
        vision: async (question: string) => {
          const result = await askVision(question, {
            onCapture: (info) => {
              beep();
              flashNotice(
                `Bildschirmfoto aufgenommen${info.width ? ` (${info.width}×${info.height})` : ''} — wird an das Bildmodell gesendet.`,
              );
              pushEntry({
                role: 'system',
                text: 'Bildschirmfoto aufgenommen und an das Bildmodell gesendet.',
              });
            },
          });
          if (!result.ok || !result.answer) {
            return { speak: result.error || 'Ich konnte den Bildschirm gerade nicht auswerten.' };
          }
          return { speak: result.answer };
        },
        memory: {
          add: (text: string, kind?: MemoryKind) => {
            const result = memoryRef.current.add(text, kind);
            persistMemory();
            return { duplicate: result.duplicate, count: memoryRef.current.size };
          },
          search: (query: string, limit?: number) =>
            memoryRef.current.search(query, limit ?? 5).map((entry) => entry.item),
          recent: (limit?: number) => memoryRef.current.recent(limit ?? 6),
          forget: (query: string) => {
            const removed = memoryRef.current.forget(query);
            if (removed) persistMemory();
            return removed;
          },
          clear: () => {
            memoryRef.current.clear();
            persistMemory();
          },
          count: memoryRef.current.size,
        },
      };

      let reply: JarvisReply | null = null;
      let clipboardText = '';
      const clipboardMention =
        /zwischenablage|kopiert|kopierte|ausgeschnitten|markiert/i.test(text);
      const clipboardWanted = settingsRef.current.clipboardEnabled && clipboardMention;

      if (clipboardMention && !settingsRef.current.clipboardEnabled) {
        reply = { speak: 'Das Lesen der Zwischenablage ist in den Einstellungen ausgeschaltet.' };
      } else if (clipboardWanted) {
        const result = await getDesktop()?.readClipboard?.();
        if (!result?.ok) {
          reply = { speak: 'Die Zwischenablage kann ich nur in der Desktop-App lesen.' };
        } else if (!String(result.text ?? '').trim()) {
          reply = { speak: 'Die Zwischenablage ist leer.' };
        } else {
          clipboardText = String(result.text).slice(0, 8000);
          flashNotice(
            `Zwischenablage gelesen (${clipboardText.length} Zeichen) — der Text geht an das Sprachmodell.`,
            7000,
          );
          pushEntry({
            role: 'system',
            text: `Zwischenablage gelesen: ${clipboardText.length} Zeichen.`,
          });
        }
      }

      if (!reply) {
        try {
          reply = await handleCommand(text, ctx);
        } catch {
          reply = { speak: 'Es ist ein interner Fehler aufgetreten. Bitte versuche es erneut.' };
        }
      }

      if (!reply) {
        reply = await answerFreeform(text, clipboardText ? { clipboard: clipboardText } : {});
      }

      // Nach einem Abbruch gehört weder die Frage noch eine Antwort in den
      // Verlauf; cancelCurrent hat den Busy-Zustand bereits freigegeben.
      if (canceled()) return;

      const assistantText = reply.text || reply.speak;
      let spoke = false;
      const appendix = [
        { role: 'user' as const, content: text },
        ...(assistantText ? [{ role: 'assistant' as const, content: assistantText }] : []),
      ];
      const turns = [...conversationTurnsRef.current, ...appendix].slice(-60);
      conversationTurnsRef.current = turns;
      turnSeqRef.current += appendix.length;
      historyRef.current = turns.slice(-8);
      void saveConversation(turns);

      if (turnSeqRef.current - lastSummaryAtRef.current >= 12) {
        lastSummaryAtRef.current = turnSeqRef.current;
        const conversationId = conversationIdRef.current;
        const previous = conversationSummaryRef.current;
        void summarizeTurns(turns.slice(0, -4), previous).then((summary) => {
          // Das Gespräch kann währenddessen gewechselt oder gelöscht worden sein.
          if (!summary || conversationIdRef.current !== conversationId) return;
          conversationSummaryRef.current = summary;
          void saveConversation(conversationTurnsRef.current);
        });
      }

      if (reply.url) {
        pushEntry({ role: 'system', text: `Öffne: ${reply.url}`, url: reply.url });
        // Der Link bleibt im Protokoll anklickbar, auch wenn kein Browser startet.
        await openLink(reply.url, settingsRef.current.browser || '');
      }

      if (reply.sources?.length) {
        for (const source of reply.sources.slice(0, 3)) {
          pushEntry({ role: 'system', text: `Quelle: ${source.title}`, url: source.url });
        }
      }

      if (reply.speak) {
        spoke = true;
        changeMode('speaking');
        await speak(reply.speak, true);
        if (canceled()) return;
      }

      busyRef.current = false;

      // Nachfrage-Fenster: Wer direkt weiterreden will, braucht kein Weckwort.
      // Im Browser gilt es für die laufende Erkennung, in der Desktop-Hülle
      // öffnet Jarvis dafür kurz das Mikrofon — aber nur nach einer Antwort
      // und nicht, solange noch eine Timer-Ansage wartet.
      const followUpMs = openFollowUp();
      if (followUpMs && !recognitionSupported() && getDesktop()) {
        if (spoke && pendingAnnouncementsRef.current.length === 0) {
          followUpCaptureRef.current();
        } else {
          // Ohne gesprochene Antwort oder mit wartender Ansage bringt das
          // Fenster in der Desktop-Hülle nichts — dann lieber normal weiter.
          clearFollowUp();
          changeMode('off');
        }
      } else if (!followUpMs) {
        changeMode(engineRef.current?.isActive ? 'wake' : 'off');
      }
      void drainAnnouncements();
    },
    [
      addNote,
      addTimer,
      answerFreeform,
      buildDesktopActions,
      changeMode,
      clearFollowUp,
      clearNotes,
      drainAnnouncements,
      openFollowUp,
      pushEntry,
      flashNotice,
      speak,
      startedAt,
      stopSpeech,
    ],
  );

  /** Beendet den Mikrofon-Tap und die lokale Sitzung; cancel verwirft das Ergebnis. */
  const stopLocalCapture = useCallback((cancel: boolean) => {
    const session = localSessionRef.current;
    localSessionRef.current = null;
    localStartingRef.current = false;
    if (session) clearTimeout(session.timer);
    localTapRef.current?.stop();
    localTapRef.current = null;
    // Das Mikrofon nur für die Sitzung offen halten, nicht dauerhaft.
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setInterim('');
    setNotice(null);
    const desktop = getDesktop();
    if (cancel) void desktop?.sttCancel?.();
    else void desktop?.sttStop?.();
  }, []);
  stopLocalRef.current = stopLocalCapture;

  const finishLocal = useCallback(
    (text: string) => {
      if (!localSessionRef.current) return;
      const clean = String(text ?? '').trim();
      // Stille in der stillen Aufnahme beendet nichts: Jarvis spricht weiter.
      if (!clean && silentBargeRef.current) return;
      // Dieselbe Barge-in-Prüfung wie bei Chromes Web Speech: Eigene Stimme
      // über die Lautsprecher wird verworfen, ein echter Zuruf unterbricht.
      const verdict = clean ? checkBargeIn(clean) : 'none';
      if (verdict === 'echo') {
        // In der stillen Aufnahme: Das war nur die eigene Stimme. Sitzung
        // bleibt offen, damit der Nutzer weiter dazwischenreden kann.
        if (silentBargeRef.current) return;
        stopLocalCapture(true);
        changeMode(engineRef.current?.isActive ? 'wake' : 'off');
        return;
      }
      if (verdict === 'none' && speakingRef.current) bargeIn(false);
      silentBargeRef.current = false;
      cancelSilentClose();
      stopLocalCapture(false);
      if (clean) {
        lastUserSpeechAtRef.current = Date.now();
        flashNotice(`Lokal verstanden: ${clean}`, 4000);
        void execute(clean);
        return;
      }
      changeMode(engineRef.current?.isActive ? 'wake' : 'off');
      flashNotice('Nichts verstanden — bitte noch einmal.', 4000);
    },
    [bargeIn, cancelSilentClose, changeMode, checkBargeIn, execute, flashNotice, stopLocalCapture],
  );
  finishLocalRef.current = finishLocal;

  const failLocal = useCallback(
    (message: string) => {
      if (!localSessionRef.current) return;
      // Stille Aufnahme: kein Alarm, nur für diese Antwort aufgeben.
      if (silentBargeRef.current) {
        silentBargeRef.current = false;
        silentBlockedRef.current = true;
        stopLocalCapture(true);
        return;
      }
      stopLocalCapture(true);
      changeMode(engineRef.current?.isActive ? 'wake' : 'off');
      flashNotice(`Lokale Spracherkennung: ${message}`, 7000);
      void getDesktop()
        ?.sttStatus?.()
        .then((status) => setSttStatus(status))
        .catch(() => {});
    },
    [changeMode, flashNotice, stopLocalCapture],
  );

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop?.onSttPartial) return undefined;
    const offPartial = desktop.onSttPartial((text) => {
      const session = localSessionRef.current;
      if (!session) return;
      // Teilergebnisse laufen durch dieselbe Prüfung wie bei Web Speech:
      // eigene Stimme fällt raus, ein echter Zuruf bricht die Ausgabe ab.
      if (checkBargeInRef.current(text) === 'echo') return;
      session.last = text;
      setInterim(text);
    });
    const offFinal = desktop.onSttFinal?.((text) => finishLocalRef.current(text));
    const offError = desktop.onSttError?.((message) => failLocal(message));
    return () => {
      offPartial();
      offFinal?.();
      offError?.();
    };
  }, [failLocal]);

  /**
   * Startet eine lokale Streaming-Sitzung. false heißt: SAPI übernehmen.
   * `silent` ist die stille Aufnahme für Barge-in: keine Meldungen, kein
   * Moduswechsel — sie begleitet nur die Ausgabe.
   */
  const startLocalListening = useCallback(async (silent = false): Promise<boolean> => {
    const desktop = getDesktop();
    if (!desktop?.sttStart) return false;
    // Während einer Antwort ist Zuhören ausdrücklich erlaubt — das ist der
    // Einstieg zum Unterbrechen.
    if (busyRef.current && !speakingRef.current) {
      if (silent) return false;
      flashNotice('Ich verarbeite noch den letzten Befehl.', 4000);
      return false;
    }
    if (localSessionRef.current) return true;
    // Ein zweiter Hotkey während des Ladens darf keine zweite Sitzung öffnen.
    if (localStartingRef.current) return true;
    localStartingRef.current = true;

    if (!silent) {
      changeMode('woken');
      setInterim('');
      flashNotice('Lokale Spracherkennung startet …', 6000);
    }

    let result: SttStartResult | null = null;
    try {
      result = await desktop.sttStart();
    } catch {
      result = null;
    }
    if (!result?.ok) {
      localStartingRef.current = false;
      if (!silent) changeMode(engineRef.current?.isActive ? 'wake' : 'off');
      if (result?.status) setSttStatus(result.status);
      if (!silent) flashNotice(`Lokale Spracherkennung nicht bereit: ${result?.error ?? 'unbekannt'}`, 7000);
      return false;
    }
    setSttStatus(result.status ?? null);

    let stream: MediaStream | null = null;
    try {
      const deviceId = settingsRef.current.micDeviceId;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      stream = null;
    }
    if (!stream) {
      localStartingRef.current = false;
      void desktop.sttCancel?.();
      if (!silent) changeMode(engineRef.current?.isActive ? 'wake' : 'off');
      if (!silent) flashNotice('Kein Mikrofonzugriff für die lokale Erkennung.', 6000);
      return false;
    }

    const tap = new MicTap();
    if (!tap.start(stream, (buffer) => desktop.sttPush?.(buffer))) {
      localStartingRef.current = false;
      stream.getTracks().forEach((track) => track.stop());
      void desktop.sttCancel?.();
      if (!silent) changeMode(engineRef.current?.isActive ? 'wake' : 'off');
      if (!silent) flashNotice('Das Mikrofon ließ sich für die lokale Erkennung nicht öffnen.', 6000);
      return false;
    }
    localStreamRef.current = stream;

    localTapRef.current = tap;
    const timer = setTimeout(() => {
      // Lange Antwort: Die stille Sitzung ohne Meldung erneuern, damit das
      // Unterbrechen nicht mitten im Satz endet.
      if (silentBargeRef.current && localSessionRef.current) {
        silentBargeRef.current = false;
        stopLocalRef.current(true);
        if (speakingRef.current || speechQueueRef.current.length > 0) openSilentRef.current();
        return;
      }
      finishLocalRef.current(localSessionRef.current?.last ?? '');
    }, silent ? SILENT_BARGE_SESSION_MS : 15_000);
    localSessionRef.current = { timer, last: '' };
    if (!silent) flashNotice('Ich höre lokal — sprich jetzt deinen Befehl.', 6000);
    return true;
  }, [changeMode, flashNotice]);
  startLocalRef.current = startLocalListening;

  const captureVoiceCommand = useCallback(async (silent = false) => {
    if (localSessionRef.current) return;
    if (busyRef.current && !speakingRef.current) {
      flashNotice('Ich verarbeite noch den letzten Befehl.');
      return;
    }
    if (settingsRef.current.localStt && sttStatusRef.current?.available) {
      const started = await startLocalRef.current();
      if (started) return;
    }
    const desktop = getDesktop();
    if (!desktop?.voiceCommand) {
      flashNotice('Spracheingabe gibt es nur in der Desktop-App.');
      return;
    }
    changeMode('woken');
    // Die stille Variante läuft im Nachfrage-Fenster; den Hinweis zeigt dort
    // bereits die Oberfläche selbst.
    if (!silent) setNotice('Ich höre — sprich jetzt deinen Befehl.');
    const result = await desktop.voiceCommand({ culture: settingsRef.current.lang || 'de-DE' });
    setNotice(null);
    if (!result.ok) {
      clearFollowUp();
      changeMode(engineRef.current?.isActive ? 'wake' : 'off');
      if (result.error !== 'no-speech') {
        flashNotice(`Spracheingabe: ${result.error ?? 'unbekannter Fehler'}`);
      }
      return;
    }
    const text = String(result.text ?? '').trim();
    if (!text) {
      clearFollowUp();
      changeMode(engineRef.current?.isActive ? 'wake' : 'off');
      return;
    }
    flashNotice(`Verstanden: ${text}`, 4000);
    void execute(text);
  }, [changeMode, clearFollowUp, execute, flashNotice]);
  voiceCommandRef.current = () => {
    void captureVoiceCommand();
  };
  followUpCaptureRef.current = () => {
    void captureVoiceCommand(true);
  };

  const activate = useCallback(() => {
    // Weckwort oder Zuruf während einer Antwort: Ausgabe sofort beenden.
    if (speakingRef.current) bargeIn(false);
    wokenUntilRef.current = Date.now() + WAKE_WINDOW_MS;
    lastWakeRef.current = Date.now();
    changeMode('woken');
    setInterim('');
    if (settingsRef.current.autoAck) void speak('Ja?', false);
  }, [bargeIn, changeMode, speak]);

  const handleFinal = useCallback(
    (text: string) => {
      const norm = normalize(text);
      if (!norm) return;
      // Eine echte Erkennung beweist, dass der Dienst wieder arbeitet.
      setRecognitionError(null);

      // Barge-in: Ein fertig erkannter Satz während der Ausgabe ist ein neuer
      // Befehl — es sei denn, er war nur die eigene Stimme.
      if (speakingRef.current || speechQueueRef.current.length > 0) {
        const verdict = checkBargeIn(text);
        if (verdict === 'echo') return;
        // Ein fertiger Satz gilt auch dann, wenn die Ausgabe gerade erst
        // begonnen hat; dann wird sie eben ohne Vorwarnung beendet.
        if (verdict === 'none') bargeIn(false);
      }
      lastUserSpeechAtRef.current = Date.now();

      const wakeWord = settingsRef.current.wakeWord;
      const hasWake = containsWake(norm, wakeWord);
      const current = modeRef.current;

      if (current === 'wake') {
        if (!hasWake) return;
        const rest = stripWake(text, wakeWord);
        if (normalize(rest).length > 1) {
          void execute(rest);
        } else {
          activate();
        }
        return;
      }

      if (current === 'woken') {
        if (hasWake) {
          const rest = stripWake(text, wakeWord);
          if (normalize(rest).length > 1) {
            void execute(rest);
            return;
          }
          activate();
          return;
        }
        void execute(text);
      }
    },
    [activate, checkBargeIn, execute],
  );

  const handleInterim = useCallback(
    (text: string) => {
      const heard = text.trim();
      // Während Jarvis spricht, entscheidet der erste erkannte Satz: eigene
      // Stimme ignorieren, echter Zwischenruf unterbricht sofort.
      const verdict = checkBargeIn(heard);
      if (verdict === 'echo') return;
      setInterim(heard);
      if (modeRef.current !== 'wake') return;
      if (!containsWake(heard, settingsRef.current.wakeWord)) return;
      if (Date.now() - lastWakeRef.current < 1600) return;
      activate();
    },
    [activate, checkBargeIn],
  );

  const handleSpeechError = useCallback(
    (code: string) => {
      // Letzten Fehler merken: Die API kann vorhanden sein und trotzdem
      // scheitern (typisch in der Desktop-Hülle).
      setRecognitionError(code);
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        engineRef.current?.stop();
        changeMode('off');
        setNotice(
          'Mikrofonzugriff wurde blockiert. Erlaube das Mikrofon in den Browser-Einstellungen und starte Jarvis erneut.',
        );
        return;
      }
      if (code === 'unsupported') {
        setNotice('Dieser Browser unterstützt keine Spracherkennung. Nutze Chrome oder Edge.');
        return;
      }
      if (code === 'network') {
        setNotice(
          'Die Spracherkennung erreicht den Dienst nicht. Chrome überträgt Sprache dafür an Google – prüfe die Internetverbindung.',
        );
        return;
      }
      if (code === 'audio-capture') {
        setNotice('Kein Mikrofon gefunden. Prüfe das angeschlossene Gerät.');
        return;
      }
      if (code === 'language-not-supported') {
        setNotice('Die gewählte Sprache wird von der Spracherkennung nicht unterstützt.');
      }
    },
    [changeMode],
  );

  finalHandlerRef.current = handleFinal;
  interimHandlerRef.current = handleInterim;
  errorHandlerRef.current = handleSpeechError;

  const engine = useMemo(
    () =>
      new SpeechEngine({
        lang: 'de-DE',
        onFinal: (text) => finalHandlerRef.current(text),
        onInterim: (text) => interimHandlerRef.current(text),
        onError: (code) => errorHandlerRef.current(code),
        onActiveChange: (active) => setEngineActive(active),
      }),
    [],
  );
  engineRef.current = engine;

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setAnalyser(null);
    setMicState('idle');
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  const initMic = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState('error');
      setNotice('Dieser Browser stellt keinen Mikrofonzugriff bereit. Nutze Chrome über localhost oder HTTPS.');
      return;
    }
    try {
      const deviceId = settingsRef.current.micDeviceId;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;

      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
      }
      const audioCtx: AudioContext = new Ctor();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const source = audioCtx.createMediaStreamSource(stream);
      const node = audioCtx.createAnalyser();
      node.fftSize = 2048;
      node.smoothingTimeConstant = 0.75;
      source.connect(node);
      setAnalyser(node);
      setMicState('ready');

      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicInputs(
        devices
          .filter((device) => device.kind === 'audioinput')
          .map((device) => ({ id: device.deviceId, label: device.label || 'Mikrofon' })),
      );
    } catch {
      setMicState('error');
      setNotice(
        'Kein Zugriff auf das Mikrofon. Erlaube den Zugriff in den Browser-Einstellungen oder wähle in den Einstellungen ein anderes Gerät.',
      );
    }
  }, []);

  // Offline-Weckwort oder Push-to-talk aus der Desktop-Hülle.
  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return undefined;
    return desktop.onWake((event) => {
      if (event.source === 'ptt' && dictationModeRef.current) {
        void dictateRef.current();
        return;
      }
      // Weckwort oder Push-to-talk während einer Antwort: Ausgabe sofort
      // beenden, die Erkennung läuft ohnehin weiter.
      if (speakingRef.current) bargeInRef.current(false);
      if (recognitionSupported()) {
        if (!engineRef.current?.isActive) void startRef.current();
        return;
      }
      if (!settingsRef.current.voiceCommands) {
        setNotice(
          'Spracheingabe ist ausgeschaltet. Tippe den Befehl in die Eingabezeile oder aktiviere sie in den Einstellungen.',
        );
        return;
      }
      voiceCommandRef.current();
    });
  }, []);

  // Globaler Hotkey der Desktop-Hülle startet das Zuhören.
  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return undefined;
    return desktop.onHotkey(() => {
      if (speakingRef.current) {
        // Desktop-Modus: Die lokale Erkennung läuft nur während einer
        // Aufnahme. Der Hotkey unterbricht daher und startet sie direkt.
        bargeInRef.current(false);
        if (!recognitionSupported()) void startRef.current();
        return;
      }
      if (localSessionRef.current || busyRef.current) {
        cancelCurrent();
        return;
      }
      if (recognitionSupported() && !engineRef.current?.isActive) {
        void startRef.current();
        return;
      }
      if (!recognitionSupported() && settingsRef.current.voiceCommands) {
        voiceCommandRef.current();
      }
    });
  }, [cancelCurrent]);

  // Escape bricht eine laufende Antwort ab, solange kein Dialog offen ist.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('.drawer.is-open, .diagnostics.is-open')) return;
      // Der Bestätigungsdialog behandelt Escape selbst und lehnt nur die
      // eine Aktion ab, statt die ganze Antwort zu verwerfen.
      if (pendingToolRef.current) return;
      if (localSessionRef.current || busyRef.current || speakingRef.current) {
        event.preventDefault();
        cancelCurrent();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelCurrent]);

  // In der Desktop-Hülle läuft Zuhören nicht über Web-Speech: einmal
  // transparent erklären, wie es dort funktioniert.
  useEffect(() => {
    if (!getDesktop() || recognitionSupported()) return;
    pushEntry({
      role: 'system',
      text: 'Desktop-Modus: Zuhören läuft über die Windows-Spracherkennung (SAPI) bzw. die lokale Engine. Weckwort „Hey Jarvis“ und Strg+Shift+J nehmen den Befehl direkt auf.',
    });
  }, [pushEntry]);

  const start = useCallback(async () => {
    setNotice(null);
    if (!recognitionSupported()) {
      if (getDesktop()) {
        if (settingsRef.current.localStt && sttStatusRef.current?.available) {
          const started = await startLocalRef.current();
          if (started) return;
        }
        if (settingsRef.current.voiceCommands) {
          voiceCommandRef.current();
          return;
        }
      }
      setNotice(
        getDesktop()
          ? 'Spracheingabe ist ausgeschaltet. Aktiviere sie in den Einstellungen oder tippe den Befehl.'
          : 'Dieser Browser unterstützt keine Spracherkennung. Nutze Chrome oder Edge.',
      );
      return;
    }
    await initMic();
    engine.setLang(settingsRef.current.lang || 'de-DE');
    engine.start();
    changeMode('wake');
    wokenUntilRef.current = 0;
    setFollowUpUntil(0);
    lastWakeRef.current = 0;
    await speak('Systeme online. Ich höre zu.', true);
  }, [changeMode, engine, initMic, speak]);
  startRef.current = start;

  const stop = useCallback(() => {
    silentBargeRef.current = false;
    silentBlockedRef.current = false;
    cancelSilentClose();
    if (localSessionRef.current) stopLocalRef.current(true);
    engine.stop();
    pendingAnnouncementsRef.current = [];
    speechQueueRef.current = [];
    spokenSentenceRef.current = '';
    speakerRef.current?.cancel();
    releaseSpeechWaiter();
    wokenUntilRef.current = 0;
    setFollowUpUntil(0);
    setInterim('');
    setSpeaking(false);
    changeMode('off');
    stopMic();
  }, [cancelSilentClose, changeMode, engine, releaseSpeechWaiter, stopMic]);

  const toggle = useCallback(() => {
    if (localSessionRef.current || busyRef.current || speakingRef.current) {
      cancelCurrent();
      return;
    }
    if (engine.isActive) stop();
    else void start();
  }, [cancelCurrent, engine, start, stop]);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        settingsRef.current = next;
        try {
          localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(next));
        } catch {
          /* Speicher voll oder gesperrt */
        }
        return next;
      });
      if (patch.micDeviceId !== undefined && engine.isActive) {
        void initMic();
      }
      if (patch.lang && engine.isActive) {
        engine.setLang(patch.lang);
      }
      if (patch.wakeOnBattery !== undefined) {
        void getDesktop()?.setWakeOnBattery?.(patch.wakeOnBattery);
      }
      if (patch.bargeListening === false || patch.localStt === false) {
        // Ausschalten beendet eine laufende stille Aufnahme sofort.
        const wasSilent = silentBargeRef.current;
        silentBargeRef.current = false;
        cancelSilentClose();
        if (wasSilent && localSessionRef.current) stopLocalRef.current(true);
      }
    },
    [cancelSilentClose, engine, initMic],
  );

  const alwaysAllowTool = useCallback(
    (name: string) => {
      const current = settingsRef.current.autoAllowTools;
      if (!current.includes(name)) {
        updateSettings({ autoAllowTools: [...current, name] });
      }
      settleTool(true);
    },
    [settleTool, updateSettings],
  );

  const revokeAutoAllow = useCallback(
    (name: string) => {
      updateSettings({
        autoAllowTools: settingsRef.current.autoAllowTools.filter((entry) => entry !== name),
      });
    },
    [updateSettings],
  );

  // Energiespar-Einstellung beim Start an den Hauptprozess durchreichen.
  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop?.setWakeOnBattery) return;
    void desktop.setWakeOnBattery(settings.wakeOnBattery);
  }, [settings.wakeOnBattery]);

  const previewVoice = useCallback(() => {
    if (!getSpeaker().available) {
      flashNotice(
        'Keine Stimme verfügbar — Piper installieren oder einen ElevenLabs-Key in den Zugangsdaten hinterlegen.',
      );
      return;
    }
    void speak('Alle Systeme nominal. Ich bin Jarvis, dein Assistent.', false);
  }, [flashNotice, getSpeaker, speak]);

  const clearLog = useCallback(() => {
    setEntries([]);
    pushEntry({ role: 'system', text: 'Protokoll zurückgesetzt. Bereit.' });
  }, [pushEntry]);

  const voiceLabel = useMemo(() => {
    const selected = ttsEngines.find(
      (entry) => entry.id === settings.ttsEngine && entry.available,
    );
    if (selected) return selected.label;
    return ttsVoice ?? 'keine Stimme';
  }, [settings.ttsEngine, ttsEngines, ttsVoice]);
  const voiceLabelRef = useRef(voiceLabel);
  voiceLabelRef.current = voiceLabel;

  const micLabel = useMemo(() => {
    const active = micInputs.find((input) => input.id === settings.micDeviceId);
    return active?.label ?? micInputs[0]?.label ?? 'Standardgerät';
  }, [micInputs, settings.micDeviceId]);

  // Status des lokalen KI-Proxys prüfen — auch wenn der Key erst später in
  // der .env landet, ohne die Seite neu zu laden.
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const status = await fetchBrainStatus();
      if (cancelled) return;
      const wasConfigured = aiStatusRef.current?.configured ?? false;
      const isConfigured = status?.configured ?? false;
      aiStatusRef.current = status;
      setAiStatus(status);
      if (wasConfigured !== isConfigured) {
        pushEntry({
          role: 'system',
          text: isConfigured
            ? `Sprachmodell verbunden: ${status?.model ?? 'KI'}. Freie Fragen sind ab jetzt verfügbar.`
            : 'Sprachmodell nicht verfügbar. Trage GEMINI_API_KEY oder ZAI_API_KEY in die .env ein — die Verbindung wird automatisch erkannt.',
        });
      }
    };

    void check();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, 5000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [pushEntry]);

  // Langzeitgedächtnis laden (Desktop-Datei, sonst localStorage)
  useEffect(() => {
    const desktop = getDesktop();
    memoryBridgeRef.current = desktop
      ? { load: () => desktop.memoryLoad(), save: (file: MemoryFile) => desktop.memorySave(file) }
      : {};
    let cancelled = false;
    void loadMemoryStore(memoryBridgeRef.current).then((store) => {
      if (cancelled) return;
      memoryRef.current = store;
      setMemories(store.recent(50));
      setPendingMemories(store.pending(10));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Notizen persistieren
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
    } catch {
      /* ignorieren */
    }
  }, [notes]);

  // Persistente Timer aus dem Hauptprozess laden und Fälligkeiten übernehmen.
  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop?.timersList) return undefined;
    let cancelled = false;
    const announce = (entries: TimerRecord[]) => {
      if (cancelled || entries.length === 0) return;
      setTimers((prev) => prev.filter((timer) => !entries.some((entry) => entry.id === timer.id)));
      beep();
      pendingAnnouncementsRef.current.push(describeDue(entries));
      void drainAnnouncements();
    };

    // Zuhörer zuerst registrieren, dann verpasste Termine abholen: Der
    // Hauptprozess hält sie zurück, bis der Renderer bereit ist.
    const off = desktop.onTimerDue?.(announce);
    void desktop.timersList().then((list) => {
      if (!cancelled) setTimers(list);
    });
    void desktop.timersReady?.().then((entries) => announce(entries ?? []));
    return () => {
      cancelled = true;
      off?.();
    };
  }, [drainAnnouncements]);

  // Aktivitätsprotokoll und Gesprächsliste laden.
  useEffect(() => {
    const desktop = getDesktop();
    void desktop?.activityList?.(30).then((list) => setActivity(list ?? []));
    void refreshConversations();
  }, [refreshConversations]);

  // Timer, Uhr und Weckwort-Fenster
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
      const current = getDesktop()
        ? []
        : timersRef.current.filter((timer) => timer.due <= Date.now());
      if (current.length) {
        setTimers((prev) => prev.filter((timer) => timer.due > Date.now()));
        beep();
        pendingAnnouncementsRef.current.push(describeDue(current));
        void drainAnnouncements();
      } else if (
        pendingAnnouncementsRef.current.length > 0 &&
        !busyRef.current &&
        !speakingRef.current
      ) {
        // Eine Ansage, die während einer Antwort fällig wurde, hier nachholen.
        void drainAnnouncements();
      }
      if (modeRef.current === 'woken' && Date.now() > wokenUntilRef.current) {
        setFollowUpUntil(0);
        changeMode('wake');
        setInterim('');
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [changeMode, drainAnnouncements]);

  // Aufräumen
  useEffect(() => {
    return () => {
      engine.stop();
      speakerRef.current?.cancel();
      localTapRef.current?.stop();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      void getDesktop()?.sttCancel?.();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioCtxRef.current) void audioCtxRef.current.close();
      const pending = pendingToolRef.current;
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(false);
        pendingToolRef.current = null;
      }
    };
  }, [engine]);

  /** Spricht eine kurze Ansage, ohne einen Befehl zu verarbeiten. */
  const announce = useCallback(
    (message: string) => {
      const text = String(message ?? '').trim();
      if (!text) return;
      pendingAnnouncementsRef.current.push(text);
      void drainAnnouncements();
    },
    [drainAnnouncements],
  );

  return {
    settings,
    updateSettings,
    mode,
    followUpUntil,
    engineActive,
    speaking,
    interim,
    entries,
    notes,
    timers,
    notice,
    dismissNotice: () => setNotice(null),
    pendingTool,
    confirmTool: () => settleTool(true),
    cancelTool: () => settleTool(false),
    voiceLabel,
    aiStatus,
    recognitionError,
    dictationMode,
    memories,
    forgetMemoryById,
    clearMemories,
    dictationAvailable,
    toggleDictation,
    micInputs,
    micState,
    analyser,
    micLabel,
    now,
    startedAt,
    start,
    stop,
    toggle,
    execute,
    stopSpeaking,
    cancelCurrent,
    previewVoice,
    clearLog,
    confirmListening,
    alwaysAllowTool,
    revokeAutoAllow,
    pendingMemories,
    approveMemory,
    rejectMemory,
    activity,
    undoLast,
    lastUndo,
    conversations,
    resumeConversation,
    deleteConversation,
    captureVoiceCommand,
    announce,
    notify: flashNotice,
    nowLabel: formatDuration(now - startedAt),
  };
}
