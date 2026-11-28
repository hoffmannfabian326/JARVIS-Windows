import { useMemo, useState, type ReactNode } from 'react';
import {
  ACTION_LABEL,
  CONDITION_LABEL,
  MODE_LABEL,
  TRIGGER_LABEL,
  WEEKDAYS,
  describeAction,
  describeCondition,
  describeTrigger,
  normalizeRoutine,
  summarizeRoutine,
  type Action,
  type ActionKind,
  type AutomationRoutine,
  type Condition,
  type ConditionKind,
  type ContextMode,
  type Metric,
  type ModuleId,
  type Trigger,
  type TriggerKind,
} from '../lib/automation';
import type { AutomationState } from '../hooks/useAutomation';

interface Props {
  routine: AutomationRoutine;
  automation: AutomationState;
  onClose: () => void;
  onSaved: () => void;
}

const TRIGGER_KINDS: TriggerKind[] = ['time', 'startup', 'app_start', 'app_stop', 'mode_change', 'threshold', 'idle', 'manual', 'voice'];
const CONDITION_KINDS: ConditionKind[] = ['app_running', 'mode', 'time_window', 'metric', 'user_active'];
const ACTION_KINDS: ActionKind[] = [
  'open_app',
  'open_url',
  'notify',
  'set_mode',
  'restore_mode',
  'toggle_module',
  'set_volume',
  'create_reminder',
  'run_routine',
  'power_plan',
  'briefing',
];
const MODES: ContextMode[] = ['neutral', 'gaming', 'productivity', 'relax', 'standby'];
const METRICS: Metric[] = ['cpu', 'gpu', 'ram', 'temperature'];
const MODULES: ModuleId[] = ['telemetry', 'conversation', 'tiles', 'core'];

function defaultTrigger(kind: TriggerKind): Trigger {
  switch (kind) {
    case 'time':
      return { kind: 'time', at: '07:30', days: [0, 1, 2, 3, 4] };
    case 'startup':
      return { kind: 'startup' };
    case 'app_start':
      return { kind: 'app_start', app: 'wow.exe' };
    case 'app_stop':
      return { kind: 'app_stop', app: 'wow.exe' };
    case 'mode_change':
      return { kind: 'mode_change', mode: 'any' };
    case 'threshold':
      return { kind: 'threshold', metric: 'cpu', value: 90, direction: 'above' };
    case 'idle':
      return { kind: 'idle', minutes: 15 };
    case 'manual':
      return { kind: 'manual' };
    case 'voice':
      return { kind: 'voice' };
    default:
      return { kind: 'manual' };
  }
}

function defaultCondition(kind: ConditionKind): Condition {
  switch (kind) {
    case 'app_running':
      return { kind: 'app_running', app: 'wow.exe', running: true };
    case 'mode':
      return { kind: 'mode', mode: 'gaming' };
    case 'time_window':
      return { kind: 'time_window', from: '18:00', to: '23:59', days: [0, 1, 2, 3, 4, 5, 6] };
    case 'metric':
      return { kind: 'metric', metric: 'cpu', op: 'above', value: 80 };
    case 'user_active':
      return { kind: 'user_active', active: true, withinSeconds: 120 };
    default:
      return { kind: 'user_active', active: true, withinSeconds: 120 };
  }
}

function defaultAction(kind: ActionKind): Action {
  switch (kind) {
    case 'open_app':
      return { kind: 'open_app', app: 'notepad' };
    case 'open_url':
      return { kind: 'open_url', url: 'https://', title: '' };
    case 'notify':
      return { kind: 'notify', title: 'J.A.R.V.I.S.', message: 'Neue Automation ausgelöst.' };
    case 'set_mode':
      return { kind: 'set_mode', mode: 'gaming', durationSeconds: 0 };
    case 'restore_mode':
      return { kind: 'restore_mode' };
    case 'toggle_module':
      return { kind: 'toggle_module', module: 'telemetry', hidden: true };
    case 'set_volume':
      return { kind: 'set_volume', percent: 40 };
    case 'create_reminder':
      return { kind: 'create_reminder', label: 'Kurze Pause', seconds: 600 };
    case 'run_routine':
      return { kind: 'run_routine', routineId: '' };
    case 'power_plan':
      return { kind: 'power_plan', plan: 'balanced' };
    case 'briefing':
      return { kind: 'briefing', prompt: 'Fasse Systemlage und Aufgaben zusammen.' };
    default:
      return { kind: 'notify', title: 'J.A.R.V.I.S.', message: 'Neue Automation ausgelöst.' };
  }
}

function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="auto-days">
      {WEEKDAYS.map((label, index) => {
        const active = value.includes(index);
        return (
          <button
            key={label}
            type="button"
            className={`auto-day ${active ? 'is-on' : ''}`}
            aria-pressed={active}
            onClick={() =>
              onChange(active ? value.filter((day) => day !== index) : [...value, index].sort((a, b) => a - b))
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`auto-field ${wide ? 'is-wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function TriggerFields({ trigger, onChange }: { trigger: Trigger; onChange: (trigger: Trigger) => void }) {
  switch (trigger.kind) {
    case 'time':
      return (
        <>
          <Field label="Uhrzeit">
            <input type="time" value={trigger.at} onChange={(event) => onChange({ ...trigger, at: event.target.value })} />
          </Field>
          <Field label="Wochentage" wide>
            <DayPicker value={trigger.days} onChange={(days) => onChange({ ...trigger, days: days.length ? days : [0, 1, 2, 3, 4, 5, 6] })} />
          </Field>
        </>
      );
    case 'app_start':
    case 'app_stop':
      return (
        <Field label="Anwendung (Prozess oder Name)" wide>
          <input
            type="text"
            value={trigger.app}
            placeholder="z. B. wow.exe oder code.exe"
            onChange={(event) => onChange({ ...trigger, app: event.target.value })}
          />
        </Field>
      );
    case 'mode_change':
      return (
        <Field label="Zielmodus">
          <select value={trigger.mode} onChange={(event) => onChange({ ...trigger, mode: event.target.value as ContextMode | 'any' })}>
            <option value="any">Jeder Wechsel</option>
            {MODES.map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABEL[mode]}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'threshold':
      return (
        <>
          <Field label="Messwert">
            <select value={trigger.metric} onChange={(event) => onChange({ ...trigger, metric: event.target.value as Metric })}>
              {METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {metric.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Richtung">
            <select value={trigger.direction} onChange={(event) => onChange({ ...trigger, direction: event.target.value as 'above' | 'below' })}>
              <option value="above">überschreitet</option>
              <option value="below">unterschreitet</option>
            </select>
          </Field>
          <Field label="Grenzwert (%)">
            <input type="number" min={1} max={110} value={trigger.value} onChange={(event) => onChange({ ...trigger, value: Number(event.target.value) })} />
          </Field>
        </>
      );
    case 'idle':
      return (
        <Field label="Inaktivität (Minuten)">
          <input type="number" min={1} max={240} value={trigger.minutes} onChange={(event) => onChange({ ...trigger, minutes: Number(event.target.value) })} />
        </Field>
      );
    default:
      return <p className="auto-hint">Dieser Auslöser hat keine weiteren Einstellungen.</p>;
  }
}

function ConditionFields({ condition, onChange }: { condition: Condition; onChange: (condition: Condition) => void }) {
  switch (condition.kind) {
    case 'app_running':
      return (
        <>
          <Field label="Anwendung">
            <input type="text" value={condition.app} onChange={(event) => onChange({ ...condition, app: event.target.value })} />
          </Field>
          <Field label="Zustand">
            <select value={condition.running ? 'yes' : 'no'} onChange={(event) => onChange({ ...condition, running: event.target.value === 'yes' })}>
              <option value="yes">läuft</option>
              <option value="no">läuft nicht</option>
            </select>
          </Field>
        </>
      );
    case 'mode':
      return (
        <Field label="Modus">
          <select value={condition.mode} onChange={(event) => onChange({ ...condition, mode: event.target.value as ContextMode })}>
            {MODES.map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABEL[mode]}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'time_window':
      return (
        <>
          <Field label="Von">
            <input type="time" value={condition.from} onChange={(event) => onChange({ ...condition, from: event.target.value })} />
          </Field>
          <Field label="Bis">
            <input type="time" value={condition.to} onChange={(event) => onChange({ ...condition, to: event.target.value })} />
          </Field>
          <Field label="Wochentage" wide>
            <DayPicker value={condition.days} onChange={(days) => onChange({ ...condition, days: days.length ? days : [0, 1, 2, 3, 4, 5, 6] })} />
          </Field>
        </>
      );
    case 'metric':
      return (
        <>
          <Field label="Messwert">
            <select value={condition.metric} onChange={(event) => onChange({ ...condition, metric: event.target.value as Metric })}>
              {METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {metric.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vergleich">
            <select value={condition.op} onChange={(event) => onChange({ ...condition, op: event.target.value as 'above' | 'below' })}>
              <option value="above">über</option>
              <option value="below">unter</option>
            </select>
          </Field>
          <Field label="Wert (%)">
            <input type="number" min={0} max={110} value={condition.value} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) })} />
          </Field>
        </>
      );
    case 'user_active':
      return (
        <>
          <Field label="Zustand">
            <select value={condition.active ? 'yes' : 'no'} onChange={(event) => onChange({ ...condition, active: event.target.value === 'yes' })}>
              <option value="yes">aktiv</option>
              <option value="no">inaktiv</option>
            </select>
          </Field>
          <Field label="Zeitfenster (Sekunden)">
            <input type="number" min={10} max={3600} value={condition.withinSeconds} onChange={(event) => onChange({ ...condition, withinSeconds: Number(event.target.value) })} />
          </Field>
        </>
      );
    default:
      return null;
  }
}

function ActionFields({
  action,
  routines,
  onChange,
}: {
  action: Action;
  routines: AutomationRoutine[];
  onChange: (action: Action) => void;
}) {
  switch (action.kind) {
    case 'open_app':
      return (
        <Field label="Programm">
          <input type="text" value={action.app} onChange={(event) => onChange({ ...action, app: event.target.value })} />
        </Field>
      );
    case 'open_url':
      return (
        <>
          <Field label="Adresse">
            <input type="url" value={action.url} onChange={(event) => onChange({ ...action, url: event.target.value })} />
          </Field>
          <Field label="Titel (optional)">
            <input type="text" value={action.title ?? ''} onChange={(event) => onChange({ ...action, title: event.target.value })} />
          </Field>
        </>
      );
    case 'notify':
      return (
        <>
          <Field label="Titel">
            <input type="text" value={action.title} onChange={(event) => onChange({ ...action, title: event.target.value })} />
          </Field>
          <Field label="Text" wide>
            <input type="text" value={action.message} onChange={(event) => onChange({ ...action, message: event.target.value })} />
          </Field>
        </>
      );
    case 'set_mode':
      return (
        <>
          <Field label="Modus">
            <select value={action.mode} onChange={(event) => onChange({ ...action, mode: event.target.value as ContextMode })}>
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {MODE_LABEL[mode]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dauer (0 = bis zur Änderung)">
            <input type="number" min={0} max={86400} value={action.durationSeconds} onChange={(event) => onChange({ ...action, durationSeconds: Number(event.target.value) })} />
          </Field>
        </>
      );
    case 'toggle_module':
      return (
        <>
          <Field label="Dashboard-Modul">
            <select value={action.module} onChange={(event) => onChange({ ...action, module: event.target.value as ModuleId })}>
              {MODULES.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sichtbarkeit">
            <select value={action.hidden ? 'hide' : 'show'} onChange={(event) => onChange({ ...action, hidden: event.target.value === 'hide' })}>
              <option value="hide">ausblenden</option>
              <option value="show">einblenden</option>
            </select>
          </Field>
        </>
      );
    case 'set_volume':
      return (
        <Field label="Lautstärke (%)">
          <input type="number" min={0} max={100} value={action.percent} onChange={(event) => onChange({ ...action, percent: Number(event.target.value) })} />
        </Field>
      );
    case 'create_reminder':
      return (
        <>
          <Field label="Bezeichnung">
            <input type="text" value={action.label} onChange={(event) => onChange({ ...action, label: event.target.value })} />
          </Field>
          <Field label="Nach (Sekunden)">
            <input type="number" min={5} max={86400} value={action.seconds} onChange={(event) => onChange({ ...action, seconds: Number(event.target.value) })} />
          </Field>
        </>
      );
    case 'run_routine':
      return (
        <Field label="Zielroutine">
          <select value={action.routineId} onChange={(event) => onChange({ ...action, routineId: event.target.value })}>
            <option value="">— auswählen —</option>
            {routines.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'power_plan':
      return (
        <Field label="Windows-Energieprofil">
          <select value={action.plan} onChange={(event) => onChange({ ...action, plan: event.target.value as 'balanced' | 'high' | 'saver' })}>
            <option value="balanced">Ausbalanciert</option>
            <option value="high">Höchstleistung</option>
            <option value="saver">Energiesparen</option>
          </select>
        </Field>
      );
    case 'briefing':
      return (
        <Field label="Schwerpunkt" wide>
          <input type="text" value={action.prompt} onChange={(event) => onChange({ ...action, prompt: event.target.value })} />
        </Field>
      );
    default:
      return null;
  }
}

export default function RoutineBuilder({ routine, automation, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<AutomationRoutine>(routine);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [simulation, setSimulation] = useState<{
    triggerOk?: boolean;
    triggerNote?: string;
    conditionsOk?: boolean;
    conditionsNote?: string;
    wouldRun?: boolean;
    actions?: string[];
  } | null>(null);

  const others = useMemo(
    () => automation.routines.filter((entry) => entry.id !== draft.id),
    [automation.routines, draft.id],
  );
  const preview = useMemo(() => summarizeRoutine(draft), [draft]);

  const patch = (next: Partial<AutomationRoutine>) => {
    setDraft((prev) => ({ ...prev, ...next }));
    setNotice('');
  };

  const save = async (): Promise<boolean> => {
    const normalized = normalizeRoutine(draft);
    if (!normalized.ok) {
      setError(normalized.error);
      return false;
    }
    setError('');
    const result = await automation.saveRoutine(normalized.routine);
    if (!result || (result as { ok?: boolean }).ok === false) {
      setError((result as { error?: string })?.error || 'Speichern fehlgeschlagen.');
      return false;
    }
    setDraft(normalized.routine);
    setNotice('Routine gespeichert. Sie ist ' + (normalized.routine.enabled ? 'aktiv.' : 'noch deaktiviert.'));
    onSaved();
    return true;
  };

  const simulate = async () => {
    if (!(await save())) return;
    const result = await automation.simulate(draft.id);
    if (!result) {
      setError('Simulation fehlgeschlagen.');
      return;
    }
    setSimulation(result as typeof simulation);
    setNotice('Simulation abgeschlossen — es wurde nichts ausgeführt.');
  };

  return (
    <div className="auto-builder">
      <div className="auto-builder-head">
        <div>
          <h3>Routine Builder</h3>
          <p>{preview}</p>
        </div>
        <div className="auto-builder-actions">
          <button type="button" className="auto-btn ghost" onClick={onClose}>
            Zurück
          </button>
          <button type="button" className="auto-btn" onClick={() => void save()} disabled={automation.busy === `save-${draft.id}`}>
            Speichern
          </button>
          <button type="button" className="auto-btn primary" onClick={() => void simulate()} disabled={Boolean(automation.busy)}>
            Simulieren
          </button>
        </div>
      </div>

      {error ? <p className="auto-alert">{error}</p> : null}
      {notice ? <p className="auto-ok">{notice}</p> : null}

      <div className="auto-flow" aria-label="Workflow">
        <div className="auto-flow-node trigger">
          <span>Auslöser</span>
          <strong>{describeTrigger(draft.trigger)}</strong>
        </div>
        <span className="auto-flow-arrow" aria-hidden="true">
          →
        </span>
        <div className="auto-flow-node conditions">
          <span>Bedingungen</span>
          <strong>
            {draft.conditions.length
              ? draft.conditions.map(describeCondition).join(draft.conditionLogic === 'or' ? ' ODER ' : ' UND ')
              : 'keine'}
          </strong>
        </div>
        <span className="auto-flow-arrow" aria-hidden="true">
          →
        </span>
        <div className="auto-flow-node actions">
          <span>Aktionen</span>
          <strong>{draft.actions.map(describeAction).join(' → ') || 'noch keine'}</strong>
        </div>
      </div>

      <div className="auto-builder-grid">
        <section className="auto-card">
          <h4>Stammdaten</h4>
          <div className="auto-fields">
            <Field label="Name" wide>
              <input type="text" value={draft.name} maxLength={80} onChange={(event) => patch({ name: event.target.value })} />
            </Field>
            <Field label="Beschreibung" wide>
              <textarea value={draft.description} maxLength={240} rows={2} onChange={(event) => patch({ description: event.target.value })} />
            </Field>
            <Field label="Aktiv">
              <select value={draft.enabled ? 'on' : 'off'} onChange={(event) => patch({ enabled: event.target.value === 'on' })}>
                <option value="off">deaktiviert</option>
                <option value="on">aktiv</option>
              </select>
            </Field>
            <Field label="Priorität (1–10)">
              <input type="number" min={1} max={10} value={draft.priority} onChange={(event) => patch({ priority: Number(event.target.value) })} />
            </Field>
            <Field label="Cooldown (Sekunden)">
              <input type="number" min={30} max={86400} value={draft.cooldownSeconds} onChange={(event) => patch({ cooldownSeconds: Number(event.target.value) })} />
            </Field>
            <Field label="Bestätigung">
              <select value={draft.requireConfirmation ? 'yes' : 'no'} onChange={(event) => patch({ requireConfirmation: event.target.value === 'yes' })}>
                <option value="no">nur bei kritischen Aktionen</option>
                <option value="yes">immer vor Ausführung</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="auto-card">
          <h4>Auslöser</h4>
          <div className="auto-fields">
            <Field label="Art" wide>
              <select
                value={draft.trigger.kind}
                onChange={(event) => patch({ trigger: defaultTrigger(event.target.value as TriggerKind) })}
              >
                {TRIGGER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {TRIGGER_LABEL[kind]}
                  </option>
                ))}
              </select>
            </Field>
            <TriggerFields trigger={draft.trigger} onChange={(trigger) => patch({ trigger })} />
          </div>
        </section>
      </div>

      <section className="auto-card">
        <div className="auto-card-head">
          <h4>Bedingungen</h4>
          <select
            className="auto-add"
            value=""
            onChange={(event) => {
              if (!event.target.value) return;
              patch({
                conditions: [...draft.conditions, defaultCondition(event.target.value as ConditionKind)],
              });
            }}
          >
            <option value="">+ Bedingung</option>
            {CONDITION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {CONDITION_LABEL[kind]}
              </option>
            ))}
          </select>
        </div>
        {draft.conditions.length > 1 ? (
          <div className="auto-logic">
            <span>Verknüpfung</span>
            <button type="button" className={draft.conditionLogic === 'and' ? 'is-active' : ''} onClick={() => patch({ conditionLogic: 'and' })}>
              UND
            </button>
            <button type="button" className={draft.conditionLogic === 'or' ? 'is-active' : ''} onClick={() => patch({ conditionLogic: 'or' })}>
              ODER
            </button>
          </div>
        ) : null}
        {draft.conditions.length === 0 ? (
          <p className="auto-hint">Ohne Bedingung löst die Routine bei jedem passenden Auslöser aus.</p>
        ) : null}
        <div className="auto-blocks">
          {draft.conditions.map((condition, index) => (
            <div className="auto-block" key={`${condition.kind}-${index}`}>
              <div className="auto-block-head">
                <strong>{CONDITION_LABEL[condition.kind]}</strong>
                <button type="button" className="auto-remove" onClick={() => patch({ conditions: draft.conditions.filter((_, i) => i !== index) })} aria-label="Bedingung entfernen">
                  ×
                </button>
              </div>
              <div className="auto-fields">
                <ConditionFields
                  condition={condition}
                  onChange={(next) =>
                    patch({ conditions: draft.conditions.map((entry, i) => (i === index ? next : entry)) })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="auto-card">
        <div className="auto-card-head">
          <h4>Aktionen · Reihenfolge</h4>
          <select
            className="auto-add"
            value=""
            onChange={(event) => {
              if (!event.target.value) return;
              patch({ actions: [...draft.actions, defaultAction(event.target.value as ActionKind)] });
            }}
          >
            <option value="">+ Aktion</option>
            {ACTION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {ACTION_LABEL[kind]}
              </option>
            ))}
          </select>
        </div>
        {draft.actions.length === 0 ? <p className="auto-hint">Mindestens eine Aktion hinzufügen.</p> : null}
        <div className="auto-blocks">
          {draft.actions.map((action, index) => (
            <div className="auto-block action" key={`${action.kind}-${index}`}>
              <div className="auto-block-head">
                <span className="auto-step">Schritt {index + 1}</span>
                <strong>{ACTION_LABEL[action.kind]}</strong>
                <div className="auto-order">
                  <button type="button" disabled={index === 0} onClick={() => {
                    const next = [...draft.actions];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    patch({ actions: next });
                  }} aria-label="Nach oben">
                    ↑
                  </button>
                  <button type="button" disabled={index === draft.actions.length - 1} onClick={() => {
                    const next = [...draft.actions];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    patch({ actions: next });
                  }} aria-label="Nach unten">
                    ↓
                  </button>
                  <button type="button" className="auto-remove" onClick={() => patch({ actions: draft.actions.filter((_, i) => i !== index) })} aria-label="Aktion entfernen">
                    ×
                  </button>
                </div>
              </div>
              <div className="auto-fields">
                <ActionFields
                  action={action}
                  routines={others}
                  onChange={(next) => patch({ actions: draft.actions.map((entry, i) => (i === index ? next : entry)) })}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {simulation ? (
        <section className="auto-card simulation">
          <h4>Simulation</h4>
          <div className="auto-sim">
            <span className={simulation.triggerOk ? 'ok' : 'off'}>Auslöser: {simulation.triggerOk ? 'passt' : 'passt nicht'}</span>
            <span>{simulation.triggerNote}</span>
          </div>
          <div className="auto-sim">
            <span className={simulation.conditionsOk ? 'ok' : 'off'}>Bedingungen: {simulation.conditionsOk ? 'erfüllt' : 'nicht erfüllt'}</span>
            <span>{simulation.conditionsNote}</span>
          </div>
          <p className="auto-hint">
            {simulation.wouldRun
              ? 'Bei diesem Kontext würde die Routine jetzt ausgeführt — die Simulation selbst hat nichts verändert.'
              : 'Die Routine würde in diesem Moment nicht ausgeführt. Prüfe Auslöser und Bedingungen.'}
          </p>
        </section>
      ) : null}

      <div className="auto-footer">
        <button type="button" className="auto-btn ghost" onClick={onClose}>
          Abbrechen
        </button>
        <button type="button" className="auto-btn primary" onClick={() => void save()} disabled={Boolean(automation.busy)}>
          Routine speichern
        </button>
      </div>
    </div>
  );
}
