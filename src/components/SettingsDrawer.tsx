import { useEffect, useState } from 'react';
import type { BrainStatus } from '../lib/brain';
import {
  formatHotkey,
  getDesktop,
  type ApiConfigDraft,
  type ApiConfigState,
  type ConversationMeta,
  type DesktopInfo,
  type SttStatus,
  type TtsEngineOption,
  type WakeStatus,
} from '../lib/desktop';
import { describeRecognitionError, recognitionSupported } from '../lib/speech';
import type { MemoryItem } from '../lib/memory';
import type { MicInput, Settings } from '../types';
import { MicSelect } from './Rails';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  micInputs: MicInput[];
  aiStatus: BrainStatus | null;
  recognitionError: string | null;
  memories: MemoryItem[];
  pendingMemories: MemoryItem[];
  onForgetMemory: (id: string) => void;
  onApproveMemory: (id: string) => void;
  onRejectMemory: (id: string) => void;
  onClearMemory: () => void;
  conversations: ConversationMeta[];
  onResumeConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRevokeAutoAllow: (name: string) => void;
  onPreview: () => void;
  onOpenDiagnostics: () => void;
}

export default function SettingsDrawer({
  open,
  onClose,
  settings,
  updateSettings,
  micInputs,
  aiStatus,
  recognitionError,
  memories,
  pendingMemories,
  onForgetMemory,
  onApproveMemory,
  onRejectMemory,
  onClearMemory,
  conversations,
  onResumeConversation,
  onDeleteConversation,
  onRevokeAutoAllow,
  onPreview,
  onOpenDiagnostics,
}: Props) {
  const desktop = getDesktop();
  const [desktopInfo, setDesktopInfo] = useState<{
    platform: string;
    hotkey: string;
    ptt: string;
    wake: WakeStatus;
    tts?: { available: boolean; voice: string };
    ttsEngines?: TtsEngineOption[];
    voiceInput?: boolean;
    stt?: SttStatus;
  } | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [hotkeys, setHotkeys] = useState<{
    listen: string;
    ptt: string;
    registered: { listen: boolean; ptt: boolean };
  } | null>(null);
  const [hotkeyNote, setHotkeyNote] = useState('');
  const [hotkeyBusy, setHotkeyBusy] = useState(false);
  const [api, setApi] = useState<ApiConfigState | null>(null);
  const [provider, setProvider] = useState<'' | 'gemini' | 'zai' | 'ollama'>('');
  const [model, setModel] = useState('');
  const [aiBase, setAiBase] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [zaiKey, setZaiKey] = useState('');
  const [elevenKey, setElevenKey] = useState('');
  const [apiNote, setApiNote] = useState('');
  const [apiBusy, setApiBusy] = useState(false);
  const canListen = recognitionSupported() && !recognitionError;

const TOOL_LABELS: Record<string, string> = {
  set_timer: 'Timer und Wecker',
  add_note: 'Notizen',
  remember_fact: 'Erinnerungen',
  open_app: 'Programme starten',
  close_app: 'Programme schließen',
  control_volume: 'Lautstärke',
  control_media: 'Mediensteuerung',
};

  const applyDesktopInfo = (info: DesktopInfo) => {
    setDesktopInfo({
      platform: info.platform,
      hotkey: info.hotkey,
      ptt: info.ptt,
      tts: info.tts ? { available: info.tts.available, voice: info.tts.voice } : undefined,
      ttsEngines: info.ttsEngines ?? [],
      voiceInput: Boolean(info.voiceInput),
      stt: info.stt,
      wake: { ...info.wake, pausedReason: info.wakePausedReason ?? info.wake.pausedReason },
    });
    setAutostart(info.autostart);
  };

  const loadHotkeys = async () => {
    if (!desktop?.getHotkeys) return;
    try {
      const info = await desktop.getHotkeys();
      setHotkeys({ listen: info.listen, ptt: info.ptt, registered: info.registered });
    } catch {
      setHotkeyNote('Tastenkürzel ließen sich nicht lesen.');
    }
  };

  const saveHotkeys = async () => {
    if (!desktop?.setHotkeys || !hotkeys) return;
    setHotkeyBusy(true);
    setHotkeyNote('');
    try {
      const result = await desktop.setHotkeys({ listen: hotkeys.listen, ptt: hotkeys.ptt });
      if (!result.ok) {
        setHotkeyNote(result.error || 'Speichern fehlgeschlagen.');
        return;
      }
      await loadHotkeys();
      setHotkeyNote('Gespeichert. Die Kürzel gelten sofort und überdauern den Neustart.');
    } catch {
      setHotkeyNote('Speichern fehlgeschlagen.');
    } finally {
      setHotkeyBusy(false);
    }
  };

  useEffect(() => {
    if (!open || !desktop) return undefined;
    let cancelled = false;
    void desktop.getInfo().then((info) => {
      if (cancelled) return;
      applyDesktopInfo(info);
    });
    void loadApiConfig();
    void loadHotkeys();
    return () => {
      cancelled = true;
    };
  }, [desktop, open]);

  // Nach dem Speichern neuer Keys die Verfügbarkeit der Stimmen nachziehen.
  const refreshDesktopInfo = () => {
    if (!desktop) return;
    void desktop.getInfo().then((info) => applyDesktopInfo(info));
  };

  const loadApiConfig = async () => {
    if (!desktop?.getApiConfig) return;
    try {
      const state = await desktop.getApiConfig();
      setApi(state);
      setProvider(state.provider);
      setModel(state.model);
      setAiBase(state.aiBase);
      setVoiceId(state.elevenlabsVoiceId);
    } catch {
      setApiNote('Zugangsdaten ließen sich nicht lesen.');
    }
  };

  const saveApiConfig = async (draft: ApiConfigDraft) => {
    if (!desktop?.saveApiConfig) {
      setApiNote('Zugangsdaten lassen sich nur in der Desktop-App bearbeiten.');
      return;
    }
    setApiBusy(true);
    setApiNote('');
    try {
      const result = await desktop.saveApiConfig(draft);
      if (!result.ok) {
        setApiNote(result.error || 'Speichern fehlgeschlagen.');
        return;
      }
      await loadApiConfig();
      refreshDesktopInfo();
      setGeminiKey('');
      setZaiKey('');
      setElevenKey('');
      setApiNote('Gespeichert. Der lokale Server liest die Datei sofort neu ein.');
    } catch {
      setApiNote('Speichern fehlgeschlagen.');
    } finally {
      setApiBusy(false);
    }
  };

  const submitApi = () => {
    const draft: ApiConfigDraft = {
      provider,
      model: model.trim(),
      aiBase: aiBase.trim(),
      elevenlabsVoiceId: voiceId.trim(),
    };
    if (geminiKey.trim()) draft.geminiKey = geminiKey.trim();
    if (zaiKey.trim()) draft.zaiKey = zaiKey.trim();
    if (elevenKey.trim()) draft.elevenlabsKey = elevenKey.trim();
    void saveApiConfig(draft);
  };

  const toggleAutostart = async (enabled: boolean) => {
    if (!desktop) return;
    setAutostart(enabled);
    try {
      const result = await desktop.setAutostart(enabled);
      setAutostart(result.autostart);
    } catch {
      setAutostart(!enabled);
    }
  };

  return (
    <div className={`drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <button type="button" className="drawer-backdrop" onClick={onClose} aria-label="Einstellungen schließen" />
      <div className="drawer-panel" role="dialog" aria-modal="true" aria-label="Einstellungen">
        <div className="drawer-head">
          <div>
            <p className="kicker">Konfiguration</p>
            <h2>Systemparameter</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" fill="none" />
            </svg>
          </button>
        </div>

        <section className="drawer-section">
          <h3>Weckwort</h3>
          <label className="field">
            <span>Weckwort</span>
            <input
              type="text"
              value={settings.wakeWord}
              onChange={(event) => updateSettings({ wakeWord: event.target.value })}
              placeholder="jarvis"
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.autoAck}
              onChange={(event) => updateSettings({ autoAck: event.target.checked })}
            />
            <span>Nach dem Weckwort kurz „Ja?“ antworten</span>
          </label>
          <p className="field-hint">
            Sprich das Weckwort allein oder direkt mit Befehl: „Jarvis, wie spät ist es?“ Nach dem Weckwort hast du
            neun Sekunden für den Befehl.
          </p>
        </section>

        <section className="drawer-section">
          <h3>Mikrofon</h3>
          <label className="field">
            <span>Eingabegerät</span>
            <MicSelect
              inputs={micInputs}
              value={settings.micDeviceId}
              onChange={(value) => updateSettings({ micDeviceId: value })}
            />
          </label>
          <p className="field-hint">
            Die Geräteliste füllt sich, sobald Jarvis einmal Zugriff auf das Mikrofon hatte. Der Browser fragt beim
            Start nach der Erlaubnis.
          </p>
        </section>

        {desktop ? (
          <section className="drawer-section">
            <h3>Browser</h3>
            <label className="field">
              <span>Links öffnen mit</span>
              <select
                className="select"
                value={settings.browser}
                onChange={(event) => updateSettings({ browser: event.target.value })}
              >
                <option value="">Systemstandard</option>
                <option value="chrome">Google Chrome</option>
                <option value="edge">Microsoft Edge</option>
                <option value="firefox">Firefox</option>
                <option value="brave">Brave</option>
                <option value="opera">Opera</option>
                <option value="vivaldi">Vivaldi</option>
              </select>
            </label>
            <p className="field-hint">
              Gilt für alle Webseiten, die Jarvis öffnet — per Sprache („Öffne YouTube“) wie über die KI. „Systemstandard“
              nimmt den in Windows eingestellten Browser; ist der gewählte Browser nicht installiert, weicht Jarvis
              ebenfalls darauf aus.
            </p>
          </section>
        ) : null}

        <section className="drawer-section">
          <h3>Stimme</h3>
          <label className="field">
            <span>Neuronale Stimme</span>
            <select
              className="select"
              value={settings.ttsEngine}
              onChange={(event) =>
                updateSettings({ ttsEngine: event.target.value as Settings['ttsEngine'] })
              }
            >
              {(desktopInfo?.ttsEngines?.length
                ? desktopInfo.ttsEngines
                : [
                    { id: 'piper', label: 'Piper · Thorsten (lokal)', available: false },
                    { id: 'elevenlabs', label: 'ElevenLabs · Cloud', available: false },
                  ]
              ).map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.label}
                  {engine.available ? '' : ' · nicht konfiguriert'}
                </option>
              ))}
            </select>
          </label>
          <p className="field-hint">
            {settings.ttsEngine === 'elevenlabs'
              ? desktopInfo?.ttsEngines?.find((engine) => engine.id === 'elevenlabs')?.available
                ? 'ElevenLabs spricht über die Cloud (Stimme mdy0XxrJgPxKAMK5Wexl). Der gesprochene Text geht an elevenlabs.io; fällt der Dienst aus, übernimmt Piper. Für Dauerbetrieb nicht empfohlen: Jede Antwort verbraucht Zeichen deines ElevenLabs-Kontingents. Piper ist lokal und kostenlos.'
                : 'Für ElevenLabs fehlt ELEVENLABS_API_KEY in der .env. Bis dahin spricht Piper weiter.'
              : desktopInfo?.tts?.available
                ? 'Piper spricht lokal auf diesem Rechner, ohne Netzwerk und ohne Cloud.'
                : 'Piper ist nicht installiert. Eine Windows-Standardstimme gibt es nicht mehr — Jarvis bleibt stumm, bis Piper oder ElevenLabs bereitsteht.'}
          </p>

          <label className="field">
            <span>
              Sprechtempo <b>{settings.rate.toFixed(2)}×</b>
            </span>
            <input
              type="range"
              min="0.6"
              max="1.4"
              step="0.05"
              value={settings.rate}
              onChange={(event) => updateSettings({ rate: Number(event.target.value) })}
            />
          </label>

          <label className="field">
            <span>
              Lautstärke <b>{Math.round(settings.volume * 100)} %</b>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.volume}
              onChange={(event) => updateSettings({ volume: Number(event.target.value) })}
            />
          </label>

          <button type="button" className="ghost-button" onClick={onPreview}>
            Stimme testen
          </button>
        </section>

        <section className="drawer-section">
          <h3>Gedächtnis</h3>
          <p className="field-hint">
            Lokaler Vektorstore: Fakten und Vorlieben bleiben auf diesem Rechner, überdauern Neustarts und fließen
            bei freien Fragen als Kontext ein. Sage zum Beispiel: „Merk dir, dass ich Kaffee schwarz trinke.“
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.autoMemory}
              onChange={(event) => updateSettings({ autoMemory: event.target.checked })}
            />
            <span>Nach Gesprächen selbst Vorschläge machen</span>
          </label>
          <p className="field-hint">
            Vorschläge werden nicht sofort übernommen. Du siehst sie hier und entscheidest einzeln.
          </p>

          {pendingMemories.length > 0 ? (
            <div className="memory-pending">
              <h4>Vorschläge · {pendingMemories.length}</h4>
              <ul className="memory-list">
                {pendingMemories.map((item) => (
                  <li key={item.id} className="memory-item is-pending">
                    <span className={`memory-kind is-${item.kind}`}>
                      {item.kind === 'preference' ? 'Vorliebe' : 'Fakt'}
                    </span>
                    <span className="memory-text">{item.text}</span>
                    <button
                      type="button"
                      className="memory-accept"
                      onClick={() => onApproveMemory(item.id)}
                      aria-label={`Vorschlag übernehmen: ${item.text}`}
                      title="Übernehmen"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="memory-remove"
                      onClick={() => onRejectMemory(item.id)}
                      aria-label={`Vorschlag verwerfen: ${item.text}`}
                      title="Verwerfen"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {memories.length === 0 ? (
            <p className="memory-empty">Noch keine gespeicherten Erinnerungen.</p>
          ) : (
            <ul className="memory-list">
              {memories.slice(0, 10).map((item) => (
                <li key={item.id} className="memory-item">
                  <span className={`memory-kind is-${item.kind}`}>
                    {item.kind === 'preference' ? 'Vorliebe' : 'Fakt'}
                  </span>
                  <span className="memory-text">{item.text}</span>
                  <button
                    type="button"
                    className="memory-remove"
                    onClick={() => onForgetMemory(item.id)}
                    aria-label={`Erinnerung löschen: ${item.text}`}
                    title="Erinnerung löschen"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {memories.length > 0 ? (
            <button type="button" className="ghost-button ghost-danger" onClick={onClearMemory}>
              Gedächtnis leeren
            </button>
          ) : null}
        </section>

        <section className="drawer-section">
          <h3>Umgebung</h3>
          <label className="field">
            <span>Stadt für Wetter</span>
            <input
              type="text"
              value={settings.city}
              onChange={(event) => updateSettings({ city: event.target.value })}
              placeholder="Berlin"
            />
          </label>
          <p className="field-hint">
            Wetterdaten kommen von Open-Meteo, ohne Schlüssel und ohne Konto. In der Desktop-App hört Jarvis über
            die Windows-Spracherkennung (offline); im Browser über Web-Speech.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.clipboardEnabled}
              onChange={(event) => updateSettings({ clipboardEnabled: event.target.checked })}
            />
            <span>Zwischenablage auf Zuruf lesen</span>
          </label>
          <p className="field-hint">
            Nur nach einem ausdrücklichen Befehl wie „Fasse zusammen, was ich kopiert habe“. Der Text wird vorher
            angekündigt und geht erst dann an das Sprachmodell.
          </p>
        </section>

        <section className="drawer-section">
          <h3>Zugangsdaten</h3>
          {desktop ? (
            <>
              <label className="field">
                <span>Anbieter</span>
                <select
                  className="select"
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as '' | 'gemini' | 'zai' | 'ollama')}
                >
                  <option value="">Automatisch (Gemini, sonst Z.AI)</option>
                  <option value="gemini">Gemini</option>
                  <option value="zai">Z.AI</option>
                  <option value="ollama">Ollama (lokal, ohne Key)</option>
                </select>
              </label>

              <label className="field">
                <span>
                  Gemini API-Key <b>{api?.keys.gemini ? 'gesetzt' : 'fehlt'}</b>
                </span>
                <div className="key-row">
                  <input
                    type="password"
                    value={geminiKey}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={api?.keys.gemini ? 'gesetzt — leer lassen zum Behalten' : 'AIza…'}
                    onChange={(event) => setGeminiKey(event.target.value)}
                  />
                  {api?.keys.gemini ? (
                    <button
                      type="button"
                      className="key-clear"
                      onClick={() => void saveApiConfig({ geminiKey: null })}
                    >
                      löschen
                    </button>
                  ) : null}
                </div>
              </label>

              <label className="field">
                <span>
                  Z.AI API-Key <b>{api?.keys.zai ? 'gesetzt' : 'fehlt'}</b>
                </span>
                <div className="key-row">
                  <input
                    type="password"
                    value={zaiKey}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={api?.keys.zai ? 'gesetzt — leer lassen zum Behalten' : 'zai-…'}
                    onChange={(event) => setZaiKey(event.target.value)}
                  />
                  {api?.keys.zai ? (
                    <button
                      type="button"
                      className="key-clear"
                      onClick={() => void saveApiConfig({ zaiKey: null })}
                    >
                      löschen
                    </button>
                  ) : null}
                </div>
              </label>

              <label className="field">
                <span>
                  ElevenLabs API-Key <b>{api?.keys.elevenlabs ? 'gesetzt' : 'fehlt'}</b>
                </span>
                <div className="key-row">
                  <input
                    type="password"
                    value={elevenKey}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={api?.keys.elevenlabs ? 'gesetzt — leer lassen zum Behalten' : 'sk_…'}
                    onChange={(event) => setElevenKey(event.target.value)}
                  />
                  {api?.keys.elevenlabs ? (
                    <button
                      type="button"
                      className="key-clear"
                      onClick={() => void saveApiConfig({ elevenlabsKey: null })}
                    >
                      löschen
                    </button>
                  ) : null}
                </div>
              </label>
              <p className="field-hint">
                ElevenLabs gibt neue Keys mit <code>sk_</code> aus (Unterstrich, danach 48 Hex-Zeichen); gesendet
                werden sie im Header <code>xi-api-key</code>. Ein OpenAI-Key <code>sk-…</code> (Bindestrich)
                funktioniert hier nicht. Ältere ElevenLabs-Keys ohne Präfix bleiben gültig.
              </p>

              <label className="field">
                <span>
                  ElevenLabs Stimmen-ID <b>optional</b>
                </span>
                <input
                  type="text"
                  value={voiceId}
                  placeholder="mdy0XxrJgPxKAMK5Wexl"
                  onChange={(event) => setVoiceId(event.target.value)}
                />
              </label>

              <label className="field">
                <span>
                  Modell <b>optional</b>
                </span>
                <input
                  type="text"
                  value={model}
                  placeholder="Standard des Anbieters"
                  onChange={(event) => setModel(event.target.value)}
                />
              </label>

              <label className="field">
                <span>
                  Basis-URL <b>optional</b>
                </span>
                <input
                  type="text"
                  value={aiBase}
                  placeholder="Standard des Anbieters"
                  onChange={(event) => setAiBase(event.target.value)}
                />
              </label>

              <button type="button" className="ghost-button" onClick={submitApi} disabled={apiBusy}>
                {apiBusy ? 'Speichere …' : 'Zugangsdaten speichern'}
              </button>

              {apiNote ? <p className="field-hint">{apiNote}</p> : null}

              <p className="field-hint">
                Die Keys bleiben auf diesem Rechner in <code>.env</code> und gehen nie an die Oberfläche zurück.
                Der lokale Server liest die Datei sofort neu ein — kein Neustart nötig.
              </p>
            </>
          ) : (
            <p className="field-hint">
              Zugangsdaten lassen sich nur in der Desktop-App bearbeiten, nicht in der Browser-Vorschau.
            </p>
          )}
        </section>

        <section className="drawer-section">
          <h3>Sprachmodell</h3>
          <div className="kv">
            <span className="kv-label">Status</span>
            <span className={`kv-value tone-${aiStatus?.configured ? 'ok' : 'off'}`}>
              {aiStatus ? (aiStatus.configured ? 'verbunden' : 'kein Key') : 'Proxy offline'}
            </span>
          </div>
          <div className="kv">
            <span className="kv-label">Anbieter</span>
            <span className="kv-value tone-off">{aiStatus?.provider || '—'}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Modell</span>
            <span className="kv-value tone-off">{aiStatus?.model || '—'}</span>
          </div>
          <p className="field-hint">
            Freie Fragen beantwortet ein Sprachmodell über den lokalen Proxy. Trage die Keys oben unter{' '}
            <strong>Zugangsdaten</strong> ein — der Anbieter wird automatisch erkannt. Der Key bleibt serverseitig
            und wird nie an den Browser gesendet. Nur Fragen außerhalb der lokalen Befehle gehen an den Anbieter.
          </p>
        </section>

        <section className="drawer-section">
          <h3>Desktop</h3>
          <div className="kv">
            <span className="kv-label">Hülle</span>
            <span className={`kv-value tone-${desktop ? 'ok' : 'off'}`}>
              {desktop ? 'aktiv' : 'Browser'}
            </span>
          </div>
          <div className="kv">
            <span className="kv-label">Hotkey</span>
            <span className="kv-value tone-off">
              {desktop ? formatHotkey(desktopInfo?.hotkey, desktopInfo?.platform) : '—'}
            </span>
          </div>
          <div className="kv">
            <span className="kv-label">Offline-Weckwort</span>
            <span
              className={`kv-value tone-${
                desktopInfo?.wake.pausedReason ? 'warn' : desktopInfo?.wake.available ? 'ok' : 'off'
              }`}
            >
              {desktop
                ? desktopInfo?.wake.pausedReason
                  ? `pausiert (${desktopInfo.wake.pausedReason})`
                  : desktopInfo?.wake.available
                    ? 'aktiv'
                    : 'inaktiv'
                : '—'}
            </span>
          </div>
          <div className="kv">
            <span className="kv-label">Push-to-talk</span>
            <span className="kv-value tone-off">
              {desktop ? formatHotkey(desktopInfo?.ptt, desktopInfo?.platform) : '—'}
            </span>
          </div>
          <div className="kv">
            <span className="kv-label">Spracherkennung</span>
            <span className={`kv-value tone-${desktopInfo?.voiceInput || canListen ? 'ok' : 'off'}`}>
              {desktopInfo?.voiceInput
                ? 'SAPI · offline'
                : canListen
                  ? 'Web-Speech'
                  : 'nicht verfügbar'}
            </span>
          </div>
          {recognitionError ? (
            <div className="kv">
              <span className="kv-label">Letzter Fehler</span>
              <span className="kv-value kv-value--wrap tone-warn">
                {describeRecognitionError(recognitionError)}
              </span>
            </div>
          ) : null}

          {desktop ? (
            <label className="check">
              <input
                type="checkbox"
                checked={autostart}
                onChange={(event) => void toggleAutostart(event.target.checked)}
              />
              <span>Beim Anmelden starten</span>
            </label>
          ) : null}

          {desktop ? (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.wakeOnBattery}
                  onChange={(event) => updateSettings({ wakeOnBattery: event.target.checked })}
                />
                <span>Weckwort bei Akkubetrieb pausieren</span>
              </label>
              <p className="field-hint">
                Pausiert das Offline-Weckwort, solange der Akku trägt oder der Bildschirm gesperrt ist — das spart
                dauerhaft CPU. Hotkey und Push-to-talk funktionieren weiter.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.voiceCommands}
                  onChange={(event) => updateSettings({ voiceCommands: event.target.checked })}
                />
                <span>Push-to-talk und Weckwort nehmen einen ganzen Befehl auf (SAPI)</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.localStt}
                  disabled={!desktopInfo?.stt?.available && !settings.localStt}
                  onChange={(event) => updateSettings({ localStt: event.target.checked })}
                />
                <span>Lokale Spracherkennung (Beta, sherpa-onnx)</span>
              </label>
              <p className="field-hint">
                {desktopInfo?.stt?.available && !desktopInfo.stt.reason
                  ? 'Streamt deutsche Befehle auf diesem Rechner und zeigt Zwischentexte. SAPI bleibt für Diktat und „Ja/Nein“ zuständig.'
                  : `${desktopInfo?.stt?.reason || 'Status wird geprüft.'}${desktopInfo?.stt?.modelDir ? '' : ' Modell nach %APPDATA%\\JARVIS\\stt-models\\sherpa-onnx-streaming-zipformer-de-kroko-2025-08-06 legen.'}`}
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.bargeListening}
                  disabled={!settings.localStt || !desktopInfo?.stt?.available}
                  onChange={(event) => updateSettings({ bargeListening: event.target.checked })}
                />
                <span>Unterbrechen durch Drüberreden (stille Aufnahme)</span>
              </label>
              <p className="field-hint">
                {settings.localStt && desktopInfo?.stt?.available
                  ? 'Läuft während jeder Antwort eine stille lokale Aufnahme mit und schließt am Ende der Ausgabe — ein Zuruf reicht dann ohne Weckwort, wie im Browser. Kostet dauerhaft CPU für die Erkennung und reagiert leichter auf Geräusche; standardmäßig aus.'
                  : 'Setzt die lokale Spracherkennung voraus. Ohne sie bleibt es beim Unterbrechen per Weckwort, Hotkey oder Push-to-talk.'}
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.voiceConfirm}
                  onChange={(event) => updateSettings({ voiceConfirm: event.target.checked })}
                />
                <span>Bestätigungen per „Ja“ oder „Nein“ beantworten</span>
              </label>
              <p className="field-hint">
                Vor dem Ausführen einer Aktion fragt Jarvis per Mikrofon nach; „Ja“ führt aus, „Nein“ lehnt ab.
                Währenddessen pausiert das Offline-Weckwort.
              </p>

              {hotkeys ? (
                <>
                  <label className="field">
                    <span>
                      Hotkey „Zuhören“ <b>{hotkeys.registered.listen ? 'aktiv' : 'belegt'}</b>
                    </span>
                    <input
                      type="text"
                      value={hotkeys.listen}
                      spellCheck={false}
                      onChange={(event) => setHotkeys({ ...hotkeys, listen: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>
                      Hotkey „Push-to-talk“ <b>{hotkeys.registered.ptt ? 'aktiv' : 'belegt'}</b>
                    </span>
                    <input
                      type="text"
                      value={hotkeys.ptt}
                      spellCheck={false}
                      onChange={(event) => setHotkeys({ ...hotkeys, ptt: event.target.value })}
                    />
                  </label>
                  <button type="button" className="ghost-button" onClick={() => void saveHotkeys()} disabled={hotkeyBusy}>
                    {hotkeyBusy ? 'Speichere …' : 'Tastenkürzel speichern'}
                  </button>
                  {hotkeyNote ? <p className="field-hint">{hotkeyNote}</p> : null}
                  <p className="field-hint">
                    Schreibweise wie bei Electron: <code>CommandOrControl+Shift+J</code>. Belegte Kombinationen
                    werden abgelehnt, die alten bleiben dann aktiv.
                  </p>
                </>
              ) : null}
            </>
          ) : null}

          {desktop && desktopInfo && !desktopInfo.wake.available ? (
            <p className="field-hint">
              Offline-Weckwort inaktiv{desktopInfo.wake.reason ? `: ${desktopInfo.wake.reason}` : '.'} Push-to-talk
              funktioniert trotzdem.
            </p>
          ) : null}

          <p className="field-hint">
            {desktop
              ? 'Hotkey, Push-to-talk und Autostart wirken systemweit. Das Offline-Weckwort hört im Hintergrund mit; nach dem Wecken nimmt Jarvis deinen Befehl über SAPI auf.'
              : 'Hotkey, Autostart und OS-Aktionen gibt es nur in der Desktop-App (npm run desktop).'}
          </p>
        </section>

        <section className="drawer-section">
          <h3>Ohne Rückfrage</h3>
          {settings.autoAllowTools.length === 0 ? (
            <p className="memory-empty">
              Noch kein Werkzeug dauerhaft erlaubt. Das geht direkt an der Bestätigungskarte.
            </p>
          ) : (
            <ul className="allow-list">
              {settings.autoAllowTools.map((name) => (
                <li key={name}>
                  <span>{TOOL_LABELS[name] ?? name}</span>
                  <button
                    type="button"
                    className="memory-remove"
                    onClick={() => onRevokeAutoAllow(name)}
                    aria-label={`${TOOL_LABELS[name] ?? name} wieder bestätigen lassen`}
                    title="Wieder bestätigen lassen"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="field-hint">
            Sperren und Webseiten öffnen bleiben immer bestätigungspflichtig.
          </p>
        </section>

        <section className="drawer-section">
          <h3>Verlauf</h3>
          {conversations.length === 0 ? (
            <p className="memory-empty">Noch keine gespeicherten Gespräche.</p>
          ) : (
            <ul className="history-list">
              {conversations.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <div className="history-copy">
                    <strong>{item.title}</strong>
                    <span>
                      {new Date(item.updatedAt).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {item.turns} Beiträge
                    </span>
                  </div>
                  <div className="history-actions">
                    <button
                      type="button"
                      className="history-open"
                      onClick={() => onResumeConversation(item.id)}
                    >
                      Fortsetzen
                    </button>
                    <button
                      type="button"
                      className="memory-remove"
                      onClick={() => onDeleteConversation(item.id)}
                      aria-label={`Gespräch löschen: ${item.title}`}
                      title="Löschen"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="field-hint">
            Die letzten 20 Gespräche bleiben lokal und werden nach und nach zusammengefasst, damit der Kontext
            nicht unbegrenzt wächst.
          </p>
        </section>

        <section className="drawer-section">
          <h3>Fehlerprogramm</h3>
          <p className="field-hint">
            Prüft Server, Sprachmodell, Stimmen, Weckwort, Mikrofon und Konfiguration und listet die letzten
            Fehler. Abstürze landen als Textprotokoll auf diesem Rechner und lassen sich als Bericht kopieren.
          </p>
          <button type="button" className="ghost-button" onClick={onOpenDiagnostics}>
            Fehlerprogramm öffnen
          </button>
        </section>

        <p className="drawer-foot">J.A.R.V.I.S. Mark VII · lokale Sitzung · Konfiguration wird im Browser gespeichert</p>
      </div>
    </div>
  );
}
