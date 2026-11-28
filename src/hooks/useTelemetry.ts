import { useCallback, useEffect, useRef, useState } from 'react';
import { getDesktop, type TelemetrySample } from '../lib/desktop';

const HISTORY = 28;
const INTERVAL_MS = 2000;

export interface TelemetryState {
  supported: boolean;
  consent: boolean | null;
  sample: TelemetrySample | null;
  history: { cpu: number[]; gpu: number[]; mem: number[] };
  grant: () => Promise<void>;
  deny: () => Promise<void>;
  reload: () => void;
}

export function useTelemetry(): TelemetryState {
  const desktop = getDesktop();
  const [consent, setConsent] = useState<boolean | null>(() => (desktop ? null : false));
  const [sample, setSample] = useState<TelemetrySample | null>(null);
  const [history, setHistory] = useState({ cpu: [], gpu: [], mem: [] } as TelemetryState['history']);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!desktop) return;
    void desktop.getMonitorConsent().then((value) => {
      if (mounted.current) setConsent(value);
    });
  }, [desktop]);

  const apply = useCallback((next: TelemetrySample) => {
    setSample(next);
    setHistory((prev) => {
      const push = (list: number[], value: number | null) =>
        value == null ? list : [...list, value].slice(-HISTORY);
      return {
        cpu: push(prev.cpu, next.cpu.load),
        gpu: push(prev.gpu, next.gpu.load),
        mem: push(prev.mem, next.mem?.percent ?? null),
      };
    });
  }, []);

  useEffect(() => {
    if (!desktop || consent !== true) return undefined;
    let alive = true;
    const pull = async () => {
      try {
        const next = await desktop.sampleSystem();
        if (alive && next) apply(next);
      } catch {
        /* Abfrage fehlgeschlagen: Werte bleiben stehen */
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), INTERVAL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [apply, consent, desktop, tick]);

  const grant = useCallback(async () => {
    if (!desktop) return;
    setConsent(true);
    await desktop.setMonitorConsent(true);
  }, [desktop]);

  const deny = useCallback(async () => {
    if (!desktop) return;
    setConsent(false);
    await desktop.setMonitorConsent(false);
  }, [desktop]);

  return {
    supported: Boolean(desktop),
    consent,
    sample,
    history,
    grant,
    deny,
    reload: () => setTick((value) => value + 1),
  };
}
