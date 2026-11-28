import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_AUTOMATION_SETTINGS,
  findConflicts,
  normalizeRoutine,
  summarizeRoutine,
  type AutomationRun,
  type AutomationRoutine,
  type AutomationSettings,
  type AutomationSnapshot,
  type AutomationConflict,
  type ContextMode,
  type ContextSample,
} from '../lib/automation';
import { askBrain } from '../lib/brain';
import { getDesktop } from '../lib/desktop';

interface Options {
  /** Spricht das Briefing über die bestehende Stimme. */
  onSpeak: (text: string) => void;
  /** Zeigt kurze Hinweise im bestehenden Hinweisbanner. */
  onNotice?: (text: string) => void;
}

const NEUTRAL_CONTEXT: ContextSample = {
  at: 0,
  mode: 'neutral',
  reason: 'Kontext wird nur in der Desktop-App erfasst.',
  automatic: false,
  manual: null,
  idleSeconds: 0,
  activeApp: null,
  processes: [],
  metrics: { cpu: null, gpu: null, ram: null, temperature: null },
  overrideUntil: 0,
};

export function useAutomation({ onSpeak, onNotice }: Options) {
  const desktop = getDesktop();
  const supported = Boolean(desktop?.automationState);
  const [snapshot, setSnapshot] = useState<AutomationSnapshot | null>(null);
  const [loading, setLoading] = useState(supported);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const lastBriefingRef = useRef(0);
  const snapshotRef = useRef<AutomationSnapshot | null>(null);
  snapshotRef.current = snapshot;

  const apply = useCallback((next: unknown) => {
    if (!next || typeof next !== 'object') return;
    const candidate = next as Partial<AutomationSnapshot>;
    if (!candidate.settings || !Array.isArray(candidate.routines) || !candidate.context) return;
    setSnapshot({
      supported: true,
      settings: candidate.settings,
      routines: candidate.routines,
      context: candidate.context,
      history: Array.isArray(candidate.history) ? (candidate.history as AutomationRun[]) : [],
      conflicts: Array.isArray(candidate.conflicts) ? (candidate.conflicts as AutomationConflict[]) : [],
      tickError: typeof (candidate as { tickError?: unknown }).tickError === 'string' ? String((candidate as { tickError: string }).tickError) : undefined,
    });
    setLoading(false);
    setError('');
  }, []);

  useEffect(() => {
    if (!desktop?.automationState) {
      setSnapshot({
        supported: false,
        settings: DEFAULT_AUTOMATION_SETTINGS,
        routines: [],
        context: NEUTRAL_CONTEXT,
        history: [],
        conflicts: [],
      });
      setLoading(false);
      return undefined;
    }
    let alive = true;
    void desktop
      .automationState()
      .then((state) => {
        if (alive) apply(state);
      })
      .catch(() => {
        if (!alive) return;
        setError('Der Automationsdienst antwortet nicht.');
        setLoading(false);
      });
    const offState = desktop.onAutomationState?.((state) => apply(state));
    const offNotify = desktop.onAutomationNotify?.((payload) => {
      if (payload?.body) onNotice?.(`${payload.title}: ${payload.body}`);
    });
    const offBriefing = desktop.onAutomationBriefing?.((payload) => {
      // Zwei Briefings in kurzer Folge würden die Stimme überlagern.
      if (Date.now() - lastBriefingRef.current < 4000) return;
      lastBriefingRef.current = Date.now();
      const context = snapshotRef.current?.context;
      const prompt = [
        'Erstelle ein kurzes, gesprochenes Briefing für den Nutzer. Höchstens drei Sätze, keine Aufzählung, kein Markdown.',
        payload?.prompt ? `Schwerpunkt: ${payload.prompt}` : '',
        context
          ? `Aktueller Modus: ${context.mode}. ${context.reason} CPU: ${context.metrics.cpu ?? 'unbekannt'} Prozent, RAM: ${context.metrics.ram ?? 'unbekannt'} Prozent.`
          : '',
        'Nenne keine Zahlen, die du nicht sicher weißt, und erfinde keine Termine.',
      ]
        .filter(Boolean)
        .join(' ');
      void askBrain(prompt, [], [], {})
        .then((reply) => {
          const answer = reply.answer.trim();
          if (answer) {
            onSpeak(answer);
            return;
          }
          onSpeak('Das Briefing ist bereit, aber das Sprachmodell hat keine Antwort geliefert.');
        })
        .catch(() => {
          const fallback = context
            ? `Kurzbriefing: Modus ${context.mode}. ${context.reason} Die CPU liegt bei ${context.metrics.cpu ?? 'unbekannter'} Prozent.`
            : 'Kurzbriefing: Der Automationsdienst meldet keine Systemwerte.';
          onSpeak(fallback);
        });
    });

    return () => {
      alive = false;
      offState?.();
      offNotify?.();
      offBriefing?.();
    };
    // onSpeak/onNotice sind stabile Callbacks aus der App.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply, desktop]);

  const refresh = useCallback(async () => {
    if (!desktop?.automationState) return;
    try {
      apply(await desktop.automationState());
    } catch {
      setError('Der Automationsdienst antwortet nicht.');
    }
  }, [apply, desktop]);

  const run = useCallback(
    async (key: string, task: () => Promise<unknown>) => {
      setBusy(key);
      setError('');
      try {
        const result = (await task()) as { ok?: boolean; error?: string; snapshot?: unknown; message?: string } | undefined;
        if (result && typeof result === 'object' && result.snapshot) apply(result.snapshot);
        else await refresh();
        if (result && result.ok === false) setError(result.error || result.message || 'Die Aktion ist fehlgeschlagen.');
        return result;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Die Aktion ist fehlgeschlagen.');
        return undefined;
      } finally {
        setBusy('');
      }
    },
    [apply, refresh],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => run('enabled', () => desktop!.automationSetEnabled!(enabled)),
    [desktop, run],
  );

  const updateSettings = useCallback(
    (patch: Partial<Pick<AutomationSettings, 'autoContext' | 'manualMode' | 'idleMinutes' | 'pollSeconds'>>) =>
      run('settings', () => desktop!.automationSettings!(patch)),
    [desktop, run],
  );

  const setProfiles = useCallback(
    (profiles: AutomationSettings['profiles']) =>
      run('profiles', () => desktop!.automationProfiles!(profiles)),
    [desktop, run],
  );

  const setHiddenModules = useCallback(
    (modules: string[]) => run('modules', () => desktop!.automationHidden!(modules)),
    [desktop, run],
  );

  const saveRoutine = useCallback(
    async (input: AutomationRoutine) => {
      const normalized = normalizeRoutine(input);
      if (!normalized.ok) {
        setError(normalized.error);
        return undefined;
      }
      return run(`save-${normalized.routine.id}`, () => desktop!.automationSave!(normalized.routine));
    },
    [desktop, run],
  );

  const deleteRoutine = useCallback(
    (id: string) => run(`delete-${id}`, () => desktop!.automationDelete!(id)),
    [desktop, run],
  );

  const duplicateRoutine = useCallback(
    (id: string) => run(`duplicate-${id}`, () => desktop!.automationDuplicate!(id)),
    [desktop, run],
  );

  const toggleRoutine = useCallback(
    (id: string, enabled: boolean) => run(`toggle-${id}`, () => desktop!.automationToggle!(id, enabled)),
    [desktop, run],
  );

  const runRoutine = useCallback(
    (id: string) => run(`run-${id}`, () => desktop!.automationRun!(id)),
    [desktop, run],
  );

  const simulate = useCallback(
    (id: string) => run(`simulate-${id}`, () => desktop!.automationSimulate!(id)),
    [desktop, run],
  );

  const clearHistory = useCallback(
    () => run('history', () => desktop!.automationClearHistory!()),
    [desktop, run],
  );

  const context = snapshot?.context ?? NEUTRAL_CONTEXT;
  const tickError = snapshot?.tickError ?? '';
  const routines = snapshot?.routines ?? [];
  const settings = snapshot?.settings ?? DEFAULT_AUTOMATION_SETTINGS;
  const conflicts = useMemo(
    () => (supported ? snapshot?.conflicts ?? findConflicts(routines) : []),
    [routines, snapshot?.conflicts, supported],
  );
  const activeCount = useMemo(() => routines.filter((routine) => routine.enabled).length, [routines]);

  const setManualMode = useCallback(
    (mode: ContextMode | null) => updateSettings({ manualMode: mode }),
    [updateSettings],
  );

  return {
    supported,
    loading,
    error,
    dismissError: () => setError(''),
    busy,
    snapshot,
    settings,
    routines,
    context,
    tickError,
    conflicts,
    activeCount,
    refresh,
    setEnabled,
    updateSettings,
    setProfiles,
    setHiddenModules,
    saveRoutine,
    deleteRoutine,
    duplicateRoutine,
    toggleRoutine,
    runRoutine,
    simulate,
    clearHistory,
    setManualMode,
  };
}

export type AutomationState = ReturnType<typeof useAutomation>;
