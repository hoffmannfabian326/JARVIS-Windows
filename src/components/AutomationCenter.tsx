import { useEffect, useMemo, useState } from 'react';
import {
  CONTEXT_LABEL,
  MODE_LABEL,
  describeAction,
  describeCondition,
  describeTrigger,
  emptyRoutine,
  formatRunTime,
  modeAccent,
  type AutomationRoutine,
  type ContextMode,
} from '../lib/automation';
import type { AutomationState } from '../hooks/useAutomation';
import RoutineBuilder from './RoutineBuilder';

export type AutomationTab = 'routines' | 'adaptive' | 'builder' | 'log';

interface Props {
  open: boolean;
  initialTab: AutomationTab;
  automation: AutomationState;
  onClose: () => void;
}

const TABS: Array<{ id: AutomationTab; label: string; hint: string }> = [
  { id: 'routines', label: 'Automation Center', hint: 'Routinen, Vorlagen und Konflikte' },
  { id: 'adaptive', label: 'Adaptive Intelligence', hint: 'Kontext, Profile und Betriebsmodus' },
  { id: 'builder', label: 'Routine Builder', hint: 'Visuell erstellen und simulieren' },
  { id: 'log', label: 'Activity Log', hint: 'Ausführungen und Fehler' },
];

const MODES: ContextMode[] = ['neutral', 'gaming', 'productivity', 'relax', 'standby'];

function statusLabel(status?: string): string {
  if (status === 'ok') return 'erfolgreich';
  if (status === 'error') return 'Fehler';
  if (status === 'skipped') return 'übersprungen';
  return 'noch nicht gelaufen';
}

function splitList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function contextTitle(mode: ContextMode): string {
  return `${MODE_LABEL[mode]} Mode`;
}

export default function AutomationCenter({ open, initialTab, automation, onClose }: Props) {
  const [tab, setTab] = useState<AutomationTab>(initialTab);
  const [editing, setEditing] = useState<AutomationRoutine | null>(null);
  const [profilesDraft, setProfilesDraft] = useState({
    gaming: automation.settings.profiles.gaming.join(', '),
    productivity: automation.settings.profiles.productivity.join(', '),
    relax: automation.settings.profiles.relax.join(', '),
  });
  const [idleDraft, setIdleDraft] = useState(automation.settings.idleMinutes);
  const [pollDraft, setPollDraft] = useState(automation.settings.pollSeconds);
  const [profileNotice, setProfileNotice] = useState('');
  const [expandedRun, setExpandedRun] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [initialTab, open]);

  useEffect(() => {
    setProfilesDraft({
      gaming: automation.settings.profiles.gaming.join(', '),
      productivity: automation.settings.profiles.productivity.join(', '),
      relax: automation.settings.profiles.relax.join(', '),
    });
    setIdleDraft(automation.settings.idleMinutes);
    setPollDraft(automation.settings.pollSeconds);
  }, [automation.settings.profiles, automation.settings.idleMinutes, automation.settings.pollSeconds]);

  const sorted = useMemo(
    () => [...automation.routines].sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.priority - a.priority || a.name.localeCompare(b.name, 'de')),
    [automation.routines],
  );

  const startNew = () => {
    setEditing(emptyRoutine());
    setTab('builder');
  };

  const startEdit = (routine: AutomationRoutine) => {
    setEditing(routine);
    setTab('builder');
  };

  const saveProfiles = async () => {
    await automation.setProfiles({
      gaming: splitList(profilesDraft.gaming),
      productivity: splitList(profilesDraft.productivity),
      relax: splitList(profilesDraft.relax),
    });
    setProfileNotice('Anwendungsprofile gespeichert.');
    window.setTimeout(() => setProfileNotice(''), 4000);
  };

  const context = automation.context;
  const mode = context.mode;

  return (
    <div className={`auto-overlay ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="auto-backdrop" onClick={onClose} />
      <section className="auto-shell" role="dialog" aria-modal="true" aria-label="Automation Center">
        <header className="auto-head">
          <div className="auto-title">
            <span className="auto-eyebrow">J.A.R.V.I.S. · CONTROL PLANE</span>
            <h2>Automation &amp; Adaptive Intelligence</h2>
            <p>{TABS.find((entry) => entry.id === tab)?.hint}</p>
          </div>
          <div className="auto-head-right">
            <div className={`auto-mode-pill mode-${mode}`} title={context.reason}>
              <span />
              <div>
                <small>BETRIEBSMODUS</small>
                <strong>{CONTEXT_LABEL[mode]}</strong>
              </div>
            </div>
            <label className="auto-master">
              <span>Automationen</span>
              <input
                type="checkbox"
                checked={automation.settings.enabled}
                disabled={!automation.supported}
                onChange={(event) => void automation.setEnabled(event.target.checked)}
              />
              <i aria-hidden="true" />
              <strong>{automation.settings.enabled ? 'AN' : 'AUS'}</strong>
            </label>
            <button type="button" className="auto-close" onClick={onClose} aria-label="Automation Center schließen">
              ×
            </button>
          </div>
        </header>

        <nav className="auto-tabs" role="tablist" aria-label="Automation-Bereiche">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={tab === entry.id ? 'is-active' : ''}
              onClick={() => {
                setTab(entry.id);
                if (entry.id !== 'builder') setEditing(null);
              }}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        {automation.error ? (
          <div className="auto-alert dismissible" role="alert">
            <span>{automation.error}</span>
            <button type="button" onClick={automation.dismissError} aria-label="Hinweis schließen">
              ×
            </button>
          </div>
        ) : null}
        {!automation.supported ? (
          <div className="auto-unsupported">
            <strong>Automationen laufen ausschließlich in der Desktop-App.</strong>
            <p>
              Kontexterkennung, Windows-Aktionen und die lokale Engine brauchen den Electron-Hauptprozess. In der Browser-Vorschau
              werden keine Routinen ausgeführt und keine Systemdaten gelesen.
            </p>
          </div>
        ) : null}

        {tab === 'routines' ? (
          <div className="auto-pane">

            <div className="auto-summary-row">
              <div className="auto-stat">
                <span>Aktive Routinen</span>
                <strong>
                  {automation.activeCount}/{automation.routines.length}
                </strong>
                <small>von {automation.routines.length} angelegten</small>
              </div>
              <div className="auto-stat">
                <span>Erkannter Kontext</span>
                <strong style={{ color: modeAccent(mode) }}>{CONTEXT_LABEL[mode]}</strong>
                <small>{context.automatic ? 'automatisch' : 'manuell / pausiert'}</small>
              </div>
              <div className="auto-stat">
                <span>Letzte Ausführung</span>
                <strong>{automation.snapshot?.history[0] ? formatRunTime(automation.snapshot.history[0].at) : '—'}</strong>
                <small>{automation.snapshot?.history[0]?.routineName ?? 'noch keine'}</small>
              </div>
              <div className="auto-stat">
                <span>Prüfintervall</span>
                <strong>{automation.settings.pollSeconds} s</strong>
                <small>{automation.settings.enabled ? 'Engine aktiv' : 'Engine aus'}</small>
              </div>
            </div>

            <div className="auto-section-head">
              <div>
                <h3>Routinen</h3>
                <p>Auslöser → Bedingungen → Aktionen. Vorlagen sind vollständig bearbeitbar.</p>
              </div>
              <button type="button" className="auto-btn primary" onClick={startNew} disabled={!automation.supported}>
                + Neue Routine
              </button>
            </div>

            {automation.conflicts.length ? (
              <div className="auto-conflicts">
                <strong>Mögliche Konflikte</strong>
                {automation.conflicts.map((conflict) => (
                  <p key={`${conflict.routineId}-${conflict.otherId}`}>{conflict.message} Die Priorität entscheidet.</p>
                ))}
              </div>
            ) : null}

            <div className="auto-list">
              {sorted.map((routine) => (
                <article className={`auto-routine ${routine.enabled ? 'is-on' : ''}`} key={routine.id}>
                  <div className="auto-routine-top">
                    <div className="auto-routine-title">
                      <span className="auto-routine-dot" style={{ background: modeAccent(routine.actions.find((action) => action.kind === 'set_mode')?.mode ?? 'neutral') }} />
                      <div>
                        <h4>
                          {routine.name}
                          {routine.preset ? <em>Vorlage</em> : null}
                        </h4>
                        <p>{routine.description || 'Keine Beschreibung.'}</p>
                      </div>
                    </div>
                    <label className="auto-switch" title={routine.enabled ? 'Routine deaktivieren' : 'Routine aktivieren'}>
                      <input
                        type="checkbox"
                        checked={routine.enabled}
                        disabled={!automation.supported}
                        onChange={(event) => void automation.toggleRoutine(routine.id, event.target.checked)}
                      />
                      <i aria-hidden="true" />
                    </label>
                  </div>

                  <div className="auto-routine-meta">
                    <span>
                      <b>Auslöser</b> {describeTrigger(routine.trigger)}
                    </span>
                    <span>
                      <b>Bedingungen</b>{' '}
                      {routine.conditions.length
                        ? routine.conditions.map(describeCondition).join(routine.conditionLogic === 'or' ? ' ODER ' : ' UND ')
                        : 'keine'}
                    </span>
                    <span>
                      <b>Aktionen</b> {routine.actions.map(describeAction).join(' → ')}
                    </span>
                    <span>
                      <b>Priorität</b> {routine.priority} · <b>Cooldown</b> {routine.cooldownSeconds}s ·{' '}
                      <b>Status</b> {statusLabel(routine.lastStatus)}
                    </span>
                  </div>

                  <div className="auto-routine-actions">
                    <button type="button" onClick={() => startEdit(routine)} disabled={!automation.supported}>
                      Bearbeiten
                    </button>
                    <button type="button" onClick={() => void automation.duplicateRoutine(routine.id)} disabled={!automation.supported}>
                      Duplizieren
                    </button>
                    <button type="button" onClick={() => void automation.runRoutine(routine.id)} disabled={!automation.supported || Boolean(automation.busy)}>
                      Jetzt ausführen
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={!automation.supported}
                      onClick={() => {
                        if (!window.confirm(`Routine „${routine.name}“ löschen?`)) return;
                        void automation.deleteRoutine(routine.id);
                      }}
                    >
                      Löschen
                    </button>
                    <span className="auto-routine-last">
                      {routine.lastRunAt ? `zuletzt ${formatRunTime(routine.lastRunAt)}` : 'noch nie ausgeführt'}
                      {routine.lastError ? ` · ${routine.lastError}` : ''}
                    </span>
                  </div>
                </article>
              ))}
              {automation.routines.length === 0 ? (
                <p className="auto-empty">
                  Noch keine Routinen. Lege eine neue Routine an — die Vorlagen werden beim ersten Start der Desktop-App automatisch
                  bereitgestellt.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === 'adaptive' ? (
          <div className="auto-pane">
            <div className="auto-context-hero" style={{ borderColor: `${modeAccent(mode)}55` }}>
              <div>
                <span className="auto-eyebrow">AKTIVER KONTEXT</span>
                <h3 style={{ color: modeAccent(mode) }}>{contextTitle(mode)}</h3>
                <p>{context.reason}</p>
                <div className="auto-context-tags">
                  <span>{context.manual ? 'manuell gewählt' : context.automatic ? 'automatisch erkannt' : 'Automatik aus'}</span>
                  <span>
                    {context.idleSeconds < 60
                      ? `${Math.max(0, Math.round(context.idleSeconds))} s inaktiv`
                      : `${Math.round(context.idleSeconds / 60)} min inaktiv`}
                  </span>
                  <span>{context.activeApp ? `${context.activeApp.name}${context.activeApp.fullscreen ? ' · Vollbild' : ''}` : 'kein Vordergrundfenster'}</span>
                  <span>{context.overrideUntil ? 'Routine-Override aktiv' : 'kein Override'}</span>
                </div>
              </div>
              <div className="auto-metrics">
                {(['cpu', 'gpu', 'ram', 'temperature'] as const).map((key) => (
                  <div key={key}>
                    <span>{key === 'temperature' ? 'TEMP' : key.toUpperCase()}</span>
                    <strong>{context.metrics[key] == null ? '—' : `${context.metrics[key]}${key === 'temperature' ? '°' : '%'}`}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="auto-grid-two">
              <section className="auto-card">
                <h4>Automatik</h4>
                <label className="auto-row">
                  <span>
                    <strong>Kontexterkennung</strong>
                    <small>Liest Vordergrundfenster, Prozesse, Auslastung und Inaktivität — ausschließlich lokal.</small>
                  </span>
                  <span className="auto-switch">
                    <input
                      type="checkbox"
                      checked={automation.settings.autoContext}
                      disabled={!automation.supported}
                      onChange={(event) => void automation.updateSettings({ autoContext: event.target.checked })}
                    />
                    <i aria-hidden="true" />
                  </span>
                </label>
                <div className="auto-mode-buttons">
                  <button
                    type="button"
                    className={!automation.settings.manualMode ? 'is-active' : ''}
                    disabled={!automation.supported}
                    onClick={() => void automation.setManualMode(null)}
                  >
                    Automatik
                  </button>
                  {MODES.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      className={automation.settings.manualMode === entry ? 'is-active' : ''}
                      disabled={!automation.supported}
                      onClick={() => void automation.setManualMode(entry)}
                    >
                      {MODE_LABEL[entry]}
                    </button>
                  ))}
                </div>
                <p className="auto-hint">
                  Manuelle Auswahl hat Vorrang. „Automatik“ gibt die Kontrolle wieder an die Kontexterkennung. Ein zentraler Schalter
                  oben deaktiviert alle Routinen.
                </p>
              </section>

              <section className="auto-card">
                <h4>Erkennung</h4>
                <div className="auto-fields">
                  <label className="auto-field">
                    <span>Inaktivität bis Standby (Minuten)</span>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={idleDraft}
                      onChange={(event) => setIdleDraft(Number(event.target.value))}
                    />
                  </label>
                  <label className="auto-field">
                    <span>Prüfintervall (Sekunden)</span>
                    <input
                      type="number"
                      min={3}
                      max={30}
                      value={pollDraft}
                      onChange={(event) => setPollDraft(Number(event.target.value))}
                    />
                  </label>
                </div>
                <div className="auto-inline-actions">
                  <button
                    type="button"
                    className="auto-btn"
                    disabled={!automation.supported}
                    onClick={() => void automation.updateSettings({ idleMinutes: idleDraft, pollSeconds: pollDraft })}
                  >
                    Übernehmen
                  </button>
                  <span>Im Standby werden Systemabfragen und Aktualisierungen gedrosselt.</span>
                </div>
              </section>
            </div>

            <section className="auto-card">
              <div className="auto-card-head">
                <div>
                  <h4>Anwendungsprofile</h4>
                  <p className="auto-hint">Prozessnamen oder Fenstertitel, jeweils durch Komma getrennt. Groß-/Kleinschreibung ist egal.</p>
                </div>
                <button type="button" className="auto-btn primary" disabled={!automation.supported} onClick={() => void saveProfiles()}>
                  Profile speichern
                </button>
              </div>
              {profileNotice ? <p className="auto-ok">{profileNotice}</p> : null}
              <div className="auto-profile-grid">
                <label>
                  <span>Gaming</span>
                  <textarea rows={4} value={profilesDraft.gaming} onChange={(event) => setProfilesDraft((prev) => ({ ...prev, gaming: event.target.value }))} />
                </label>
                <label>
                  <span>Produktivität</span>
                  <textarea
                    rows={4}
                    value={profilesDraft.productivity}
                    onChange={(event) => setProfilesDraft((prev) => ({ ...prev, productivity: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Relax / Medien</span>
                  <textarea rows={4} value={profilesDraft.relax} onChange={(event) => setProfilesDraft((prev) => ({ ...prev, relax: event.target.value }))} />
                </label>
              </div>
            </section>

            <section className="auto-card">
              <h4>Dashboard-Module</h4>
              <p className="auto-hint">Routinen können Module ein- oder ausblenden. Der manuelle Schalter hier gilt sofort.</p>
              <div className="auto-module-grid">
                {(['telemetry', 'conversation', 'tiles', 'core'] as const).map((module) => {
                  const hidden = automation.settings.hiddenModules.includes(module);
                  return (
                    <label key={module} className="auto-row compact">
                      <span>{module === 'telemetry' ? 'Systemtelemetrie' : module === 'conversation' ? 'Konversation' : module === 'tiles' ? 'Modulkacheln' : 'Neural Core'}</span>
                      <span className="auto-switch">
                        <input
                          type="checkbox"
                          checked={!hidden}
                          disabled={!automation.supported}
                          onChange={(event) => {
                            const next = new Set(automation.settings.hiddenModules);
                            if (event.target.checked) next.delete(module);
                            else next.add(module);
                            void automation.setHiddenModules([...next]);
                          }}
                        />
                        <i aria-hidden="true" />
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}

        {tab === 'builder' ? (
          <div className="auto-pane">
            {editing ? (
              <RoutineBuilder
                key={editing.id}
                routine={editing}
                automation={automation}
                onClose={() => {
                  setEditing(null);
                  setTab('routines');
                }}
                onSaved={() => undefined}
              />
            ) : (
              <div className="auto-empty builder-empty">
                <strong>Wähle eine Routine zum Bearbeiten oder lege eine neue an.</strong>
                <p>Der Builder zeigt Trigger, Bedingungen und Aktionen als Kette und simuliert den Ablauf, ohne etwas auszuführen.</p>
                <div className="auto-inline-actions">
                  <button type="button" className="auto-btn primary" onClick={startNew}>
                    + Neue Routine
                  </button>
                  <button type="button" className="auto-btn" onClick={() => setTab('routines')}>
                    Zur Liste
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {tab === 'log' ? (
          <div className="auto-pane">
            <div className="auto-section-head">
              <div>
                <h3>Activity Log</h3>
                <p>Jede automatische und manuelle Ausführung, inklusive übersprungener Läufe und Fehler.</p>
              </div>
              <button type="button" className="auto-btn" disabled={!automation.supported || !automation.snapshot?.history.length} onClick={() => void automation.clearHistory()}>
                Verlauf leeren
              </button>
            </div>
            <div className="auto-runs">
              {(automation.snapshot?.history ?? []).map((run) => (
                <article className={`auto-run status-${run.status}`} key={run.id}>
                  <button
                    type="button"
                    className="auto-run-head"
                    onClick={() => setExpandedRun((prev) => (prev === run.id ? '' : run.id))}
                    aria-expanded={expandedRun === run.id}
                  >
                    <span className={`auto-run-dot`} />
                    <div>
                      <strong>{run.routineName}</strong>
                      <small>
                        {formatRunTime(run.at)} · {run.trigger} · {run.durationMs} ms
                      </small>
                    </div>
                    <span className={`auto-run-status`}>{statusLabel(run.status)}</span>
                  </button>
                  {run.message ? <p className="auto-run-message">{run.message}</p> : null}
                  {expandedRun === run.id ? (
                    <div className="auto-run-actions">
                      {run.actions.length === 0 ? <p className="auto-hint">Keine Aktion wurde ausgeführt.</p> : null}
                      {run.actions.map((action, index) => (
                        <div key={`${run.id}-${index}`} className={action.ok ? 'ok' : 'bad'}>
                          <span>
                            {action.ok ? '✓' : '✕'} {action.label}
                          </span>
                          {action.error ? <em>{action.error}</em> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              {!automation.snapshot?.history.length ? <p className="auto-empty">Noch keine Ausführungen protokolliert.</p> : null}
            </div>
            {automation.snapshot?.tickError ? <p className="auto-alert">Letzter Prüfzyklus: {automation.snapshot.tickError}</p> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
