import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import BootOverlay from './components/BootOverlay';
import Conversation from './components/Conversation';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import FirstRunGate from './components/FirstRunGate';
import ReactorCore from './components/ReactorCore';
import SettingsDrawer from './components/SettingsDrawer';
import Telemetry from './components/Telemetry';
import Tiles from './components/Tiles';
import UpdateView from './components/UpdateView';
import TopBar from './components/TopBar';
import { useJarvis } from './hooks/useJarvis';
import { useTelemetry } from './hooks/useTelemetry';
import { getDesktop } from './lib/desktop';
import type { Mode } from './types';

const CORE_STATE: Record<Mode, string> = {
  off: 'BEREIT',
  wake: 'BEREIT',
  woken: 'HÖRT ZU',
  thinking: 'ARBEITET',
  speaking: 'SPRICHT',
};

function readBoot(): boolean {
  try {
    return sessionStorage.getItem('jarvis.booted') === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const jarvis = useJarvis();
  const telemetry = useTelemetry();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [view, setView] = useState<'console' | 'update'>('console');
  const [draft, setDraft] = useState('');
  const [booted, setBooted] = useState(readBoot);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const finishBoot = useCallback(() => {
    try {
      sessionStorage.setItem('jarvis.booted', '1');
    } catch {
      /* Sitzungsspeicher nicht verfügbar */
    }
    setBooted(true);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setDraft('');
    void jarvis.execute(value);
  };

  const runQuick = useCallback(
    (text: string) => {
      void jarvis.execute(text);
    },
    [jarvis],
  );

  // Globaler Hotkey/Weckwort: Fenster holen und die Eingabe fokussieren.
  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return undefined;
    const offHotkey = desktop.onHotkey(() => inputRef.current?.focus());
    const offWake = desktop.onWake(() => inputRef.current?.focus());
    return () => {
      offHotkey?.();
      offWake?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const lastJarvis = useMemo(() => {
    for (let i = jarvis.entries.length - 1; i >= 0; i -= 1) {
      if (jarvis.entries[i].role === 'jarvis') return jarvis.entries[i].text;
    }
    return '';
  }, [jarvis.entries]);

  const caption =
    jarvis.interim ||
    lastJarvis ||
    'Sage „Hey Jarvis“ oder tippe einen Befehl — ich melde mich, sobald du gerufen wirst.';

  const activateOrb = () => {
    if (jarvis.speaking || jarvis.mode === 'thinking') {
      jarvis.cancelCurrent();
      return;
    }
    if (!jarvis.engineActive) void jarvis.start();
  };

  return (
    <div className={`app mode-${jarvis.mode}`}>
      <TopBar
        mode={jarvis.mode}
        now={jarvis.now}
        aiStatus={jarvis.aiStatus}
        engineActive={jarvis.engineActive}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <Telemetry telemetry={telemetry} />

      <main className={view === 'update' ? 'core is-update' : 'core'}>
        {jarvis.notice ? (
          <div className="notice" role="status">
            <span>{jarvis.notice}</span>
            <button type="button" onClick={jarvis.dismissNotice} aria-label="Hinweis schließen">
              ×
            </button>
          </div>
        ) : null}

        <nav className="view-tabs" role="tablist" aria-label="Ansicht">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'console'}
            className={`view-tab ${view === 'console' ? 'is-active' : ''}`}
            onClick={() => setView('console')}
          >
            Konsole
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'update'}
            className={`view-tab ${view === 'update' ? 'is-active' : ''}`}
            onClick={() => setView('update')}
          >
            Update
          </button>
        </nav>

        {view === 'update' ? (
          <UpdateView />
        ) : (
          <>
            <div className="orb-wrap">
              <span className="orb-aura" aria-hidden="true" />
              <ReactorCore mode={jarvis.mode} analyser={jarvis.analyser} onActivate={activateOrb} />
            </div>

            <div className="core-label">
              <span>Neural Core</span>
              <strong>{CORE_STATE[jarvis.mode]}</strong>
            </div>

            <p className={`core-caption ${jarvis.interim ? 'is-interim' : ''}`}>{caption}</p>
          </>
        )}
      </main>

      <Conversation
        entries={jarvis.entries}
        draft={draft}
        onDraft={setDraft}
        onSubmit={submit}
        onMic={jarvis.toggle}
        engineActive={jarvis.engineActive}
        onQuick={runQuick}
        inputRef={inputRef}
        interim={jarvis.interim}
        dictationMode={jarvis.dictationMode}
        dictationAvailable={jarvis.dictationAvailable}
        onToggleDictation={jarvis.toggleDictation}
        pendingTool={jarvis.pendingTool}
        onConfirmTool={jarvis.confirmTool}
        onCancelTool={jarvis.cancelTool}
        onAlwaysAllowTool={jarvis.alwaysAllowTool}
        confirmListening={jarvis.confirmListening}
      />

      <Tiles
        notes={jarvis.notes.length}
        timers={jarvis.timers.length}
        city={jarvis.settings.city}
        onRun={runQuick}
        onVoice={jarvis.previewVoice}
        onSettings={() => setSettingsOpen(true)}
      />

      <footer className="statusbar" aria-hidden="true">
        <span className="status-item">Mitverarbeitung {jarvis.entries.length}</span>
        <span className="status-dot" />
        <span className="status-item">Gedächtnis {jarvis.notes.length} Notizen</span>
        <span className="status-dot" />
        <span className="status-item">Timer {jarvis.timers.length}</span>
        <span className="status-dot" />
        <span className="status-item">Weckwort „{jarvis.settings.wakeWord}“</span>
        <span className="status-grow" />
        <span className="status-wave">
          {Array.from({ length: 14 }, (_, index) => (
            <i key={index} style={{ animationDelay: `${index * 90}ms` }} />
          ))}
        </span>
      </footer>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={jarvis.settings}
        updateSettings={jarvis.updateSettings}
        micInputs={jarvis.micInputs}
        aiStatus={jarvis.aiStatus}
        recognitionError={jarvis.recognitionError}
        memories={jarvis.memories}
        pendingMemories={jarvis.pendingMemories}
        onForgetMemory={jarvis.forgetMemoryById}
        onApproveMemory={jarvis.approveMemory}
        onRejectMemory={jarvis.rejectMemory}
        onClearMemory={jarvis.clearMemories}
        conversations={jarvis.conversations}
        onResumeConversation={jarvis.resumeConversation}
        onDeleteConversation={jarvis.deleteConversation}
        onRevokeAutoAllow={jarvis.revokeAutoAllow}
        onPreview={jarvis.previewVoice}
        onOpenDiagnostics={() => {
          setSettingsOpen(false);
          setDiagnosticsOpen(true);
        }}
      />

      <DiagnosticsPanel
        open={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
        onUndo={jarvis.undoLast}
        canUndo={Boolean(jarvis.lastUndo)}
      />

      <FirstRunGate
        open={telemetry.supported && telemetry.consent === null}
        onAllow={() => void telemetry.grant()}
        onDeny={() => void telemetry.deny()}
      />

      {booted ? null : <BootOverlay onDone={finishBoot} />}
    </div>
  );
}
