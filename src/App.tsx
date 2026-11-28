import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import AutomationCenter, { type AutomationTab } from './components/AutomationCenter';
import GamingHub from './components/GamingHub';
import BootOverlay from './components/BootOverlay';
import ContextDashboard from './components/ContextDashboard';
import Conversation from './components/Conversation';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import FirstRunGate from './components/FirstRunGate';
import ReactorCore from './components/ReactorCore';
import SettingsDrawer from './components/SettingsDrawer';
import Telemetry from './components/Telemetry';
import Tiles from './components/Tiles';
import UpdateView from './components/UpdateView';
import TopBar from './components/TopBar';
import { useAutomation } from './hooks/useAutomation';
import { useGaming } from './hooks/useGaming';
import { useJarvis } from './hooks/useJarvis';
import { useTelemetry } from './hooks/useTelemetry';
import { CONTEXT_LABEL, MODE_LABEL } from './lib/automation';
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
  const automation = useAutomation({ onSpeak: jarvis.announce, onNotice: jarvis.notify });
  const gaming = useGaming({ onNotice: jarvis.notify });
  const [gamingOpen, setGamingOpen] = useState(false);
  const [automationTab, setAutomationTab] = useState<AutomationTab | null>(null);
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
    const offCompanion = desktop.onCompanionAction?.((action) => {
      if (action === 'hub') {
        setGamingOpen(true);
        return;
      }
      if (action === 'chat') {
        inputRef.current?.focus();
      }
    });
    return () => {
      offHotkey?.();
      offWake?.();
      offCompanion?.();
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

  const followUpLeft = jarvis.followUpUntil ? Math.max(0, jarvis.followUpUntil - jarvis.now) : 0;
  const followUpTotal = Math.max(1, jarvis.settings.followUpSeconds * 1000);
  const followUpPercent = followUpLeft > 0 ? Math.min(100, (followUpLeft / followUpTotal) * 100) : 0;

  const activateOrb = () => {
    if (jarvis.speaking || jarvis.mode === 'thinking') {
      jarvis.cancelCurrent();
      return;
    }
    if (!jarvis.engineActive) void jarvis.start();
  };

  const contextMode = automation.context.mode;
  const contextClass = `context-${contextMode}${automation.settings.manualMode ? ' context-manual' : ''}`;
  const hiddenClass = automation.settings.hiddenModules.map((module) => `hide-${module}`).join(' ');

  return (
    <div className={`app mode-${jarvis.mode} ${contextClass} ${hiddenClass}`}>
      <div className="hud-frame" aria-hidden="true">
        <span className="hud-corner hud-corner-tl" />
        <span className="hud-corner hud-corner-tr" />
        <span className="hud-corner hud-corner-bl" />
        <span className="hud-corner hud-corner-br" />
        <span className="hud-rail hud-rail-left" />
        <span className="hud-rail hud-rail-right" />
        <span className="hud-scan" />
      </div>

      <TopBar
        mode={jarvis.mode}
        now={jarvis.now}
        aiStatus={jarvis.aiStatus}
        engineActive={jarvis.engineActive}
        onOpenSettings={() => setSettingsOpen(true)}
        context={automation.context}
        onOpenContext={() => setAutomationTab('adaptive')}
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
          <button type="button" className="view-tab view-tab-priority" onClick={() => setAutomationTab('routines')}>
            Automation
          </button>
          <button type="button" className="view-tab view-tab-priority" onClick={() => setAutomationTab('adaptive')}>
            Adaptiv
          </button>
          <button type="button" className="view-tab view-tab-priority view-tab-gaming" onClick={() => setGamingOpen(true)}>
            Gaming
          </button>
        </nav>

        {view === 'console' ? (
          <div className={`context-strip mode-${contextMode}`}>
            <span className="context-strip-dot" aria-hidden="true" />
            <div className="context-strip-copy">
              <small>BETRIEBSMODUS · {automation.settings.manualMode ? 'MANUELL' : automation.settings.autoContext ? 'AUTOMATIK' : 'AUTOMATIK AUS'}</small>
              <strong style={{ color: `var(--context-accent)` }}>{CONTEXT_LABEL[contextMode]}</strong>
              <span>{automation.context.reason}</span>
            </div>
            <div className="context-strip-actions">
              <button
                type="button"
                className={!automation.settings.manualMode ? 'is-active' : ''}
                onClick={() => void automation.setManualMode(null)}
                disabled={!automation.supported}
              >
                Auto
              </button>
              {(['gaming', 'productivity', 'relax'] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={automation.settings.manualMode === entry ? 'is-active' : ''}
                  onClick={() => void automation.setManualMode(entry)}
                  disabled={!automation.supported}
                >
                  {MODE_LABEL[entry]}
                </button>
              ))}
              <button type="button" className="ghost" onClick={() => setAutomationTab('adaptive')}>
                Details
              </button>
            </div>
          </div>
        ) : null}

        {view === 'update' ? (
          <UpdateView />
        ) : (
          <>
            {contextMode === 'gaming' || contextMode === 'productivity' || contextMode === 'relax' ? (
              <ContextDashboard
                mode={contextMode}
                context={automation.context}
                telemetry={telemetry}
                notes={jarvis.notes.length}
                timers={jarvis.timers}
                onRun={runQuick}
                onFocusChat={() => inputRef.current?.focus()}
                onOpenAutomation={() => setAutomationTab('adaptive')}
              />
            ) : (
              <div className="orb-wrap">
                <span className="orb-aura" aria-hidden="true" />
                <span className="orb-ring" aria-hidden="true" />
                <span className="orb-ticks" aria-hidden="true" />
                <ReactorCore mode={jarvis.mode} analyser={jarvis.analyser} onActivate={activateOrb} />
              </div>
            )}

            <div className="core-label">
              <span>Neural Core</span>
              <strong>{CORE_STATE[jarvis.mode]}</strong>
            </div>

            <p className={`core-caption ${jarvis.interim ? 'is-interim' : ''}`}>{caption}</p>

            {followUpLeft > 0 && jarvis.mode === 'woken' ? (
              <div className="follow-up" role="status" aria-live="polite">
                <span className="follow-up-pulse" aria-hidden="true" />
                <div className="follow-up-copy">
                  <strong>Nachfrage-Fenster · noch {Math.ceil(followUpLeft / 1000)} s</strong>
                  <span>Sprich einfach weiter — ohne „{jarvis.settings.wakeWord}“ zu sagen.</span>
                </div>
                <span className="follow-up-bar" aria-hidden="true">
                  <i style={{ width: `${followUpPercent}%` }} />
                </span>
              </div>
            ) : null}
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
        <span className="status-dot" />
        <span className="status-item">Kontext {CONTEXT_LABEL[contextMode]}</span>
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

      <AutomationCenter
        open={Boolean(automationTab)}
        initialTab={automationTab ?? 'routines'}
        automation={automation}
        onClose={() => setAutomationTab(null)}
      />

      <GamingHub
        open={gamingOpen}
        gaming={gaming}
        automation={automation}
        onClose={() => setGamingOpen(false)}
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
