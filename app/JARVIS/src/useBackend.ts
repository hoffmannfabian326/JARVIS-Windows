import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ramPercent, readAiStatus, readTelemetry, type AiStatus, type Sample, type Telemetry } from './telemetry';
export function useBackend() {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(true);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true;
    let busy = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (busy || !active) return;
      busy = true;
      setPolling(true);
      const [metrics, status] = await Promise.allSettled([
        invoke<unknown>('get_system_metrics').then(readTelemetry),
        invoke<unknown>('get_ai_status').then(readAiStatus),
      ]);
      if (!active) return;
      const data = metrics.status === 'fulfilled' ? metrics.value : null;
      setTelemetry(data);
      setAi(status.status === 'fulfilled' ? status.value : null);
      setError(data ? '' : 'Hardware-Abfrage fehlgeschlagen. Native Daten sind in der Browser-Vorschau nicht verfügbar.');
      setSamples(previous => [...previous, { cpu: data?.cpu_percent ?? null, ram: ramPercent(data) }].slice(-45));
      if (data) setUpdated(new Date());
      setPolling(false);
      busy = false;
      timer = setTimeout(() => void poll(), 4000);
    }
    refresh.current = () => { if (!busy) { clearTimeout(timer); void poll(); } };
    // Defer first invocation so React StrictMode can clean up its rehearsal effect.
    timer = setTimeout(() => void poll(), 0);
    return () => { active = false; clearTimeout(timer); refresh.current = () => {}; };
  }, []);
  return { telemetry, ai, samples, updated, error, polling, refresh: () => refresh.current() };
}
