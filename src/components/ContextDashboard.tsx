import type { ContextSample, ContextMode } from '../lib/automation';
import type { TelemetryState } from '../hooks/useTelemetry';

interface Props {
  mode: ContextMode;
  context: ContextSample;
  telemetry: TelemetryState;
  notes: number;
  timers: Array<{ id: string; label: string; due: number }>;
  onRun: (text: string) => void;
  onFocusChat: () => void;
  onOpenAutomation: () => void;
}

function metric(value: number | null, suffix = ' %'): string {
  return value == null ? '—' : `${value}${suffix}`;
}

const GAMING_APPS = [
  { label: 'World of Warcraft', command: 'starte World of Warcraft' },
  { label: 'Steam', command: 'starte Steam' },
  { label: 'Discord', command: 'starte Discord' },
];

export default function ContextDashboard({
  mode,
  context,
  telemetry,
  notes,
  timers,
  onRun,
  onFocusChat,
  onOpenAutomation,
}: Props) {
  const metrics = {
    cpu: context.metrics.cpu ?? telemetry.sample?.cpu.load ?? null,
    gpu: context.metrics.gpu ?? telemetry.sample?.gpu.load ?? null,
    ram: context.metrics.ram ?? telemetry.sample?.mem?.percent ?? null,
    temperature: context.metrics.temperature ?? telemetry.sample?.cpu.temp ?? null,
  };
  const nextTimer = [...timers].sort((a, b) => a.due - b.due)[0];

  if (mode === 'gaming') {
    return (
      <section className="context-dashboard gaming" aria-label="Gaming-Dashboard">
        <header>
          <span className="context-dashboard-eyebrow">GAMING MODE</span>
          <strong>{context.activeApp?.title || context.activeApp?.name || 'Spiel erkannt'}</strong>
          <p>{context.reason}</p>
        </header>
        <div className="context-dashboard-metrics">
          <div>
            <span>CPU</span>
            <strong>{metric(metrics.cpu)}</strong>
            <small>{telemetry.sample?.cpu.temp != null ? `${telemetry.sample.cpu.temp} °C` : 'Sensor n/a'}</small>
          </div>
          <div>
            <span>GPU</span>
            <strong>{metric(metrics.gpu)}</strong>
            <small>{telemetry.sample?.gpu.temp != null ? `${telemetry.sample.gpu.temp} °C` : 'Sensor n/a'}</small>
          </div>
          <div>
            <span>RAM</span>
            <strong>{metric(metrics.ram)}</strong>
            <small>Arbeitsspeicher</small>
          </div>
          <div>
            <span>TEMP</span>
            <strong>{metrics.temperature == null ? '—' : `${metrics.temperature} °C`}</strong>
            <small>CPU / GPU</small>
          </div>
        </div>
        <div className="context-dashboard-actions">
          {GAMING_APPS.map((entry) => (
            <button key={entry.label} type="button" onClick={() => onRun(entry.command)}>
              {entry.label}
            </button>
          ))}
          <button type="button" className="ghost" onClick={onOpenAutomation}>
            Gaming-Profile
          </button>
        </div>
        <p className="context-dashboard-foot">
          Animationen reduziert · Benachrichtigungen gedrosselt · Hardwarewerte im Blick
        </p>
      </section>
    );
  }

  if (mode === 'relax') {
    return (
      <section className="context-dashboard relax" aria-label="Relax-Dashboard">
        <header>
          <span className="context-dashboard-eyebrow">RELAX MODE</span>
          <strong>Ruhiger Betrieb</strong>
          <p>{context.reason}</p>
        </header>
        <div className="context-dashboard-focus">
          <div>
            <span>Medien</span>
            <strong>{context.activeApp?.name || 'Keine Medienanwendung im Vordergrund'}</strong>
            <small>Dezente Animationen · weniger Benachrichtigungen</small>
          </div>
          <div>
            <span>System</span>
            <strong>Ruhige Anzeige</strong>
            <small>
              CPU {metrics.cpu == null ? '—' : `${metrics.cpu} %`} · RAM{' '}
              {metrics.ram == null ? '—' : `${metrics.ram} %`}
            </small>
          </div>
        </div>
        <div className="context-dashboard-actions">
          <button type="button" onClick={() => onRun('starte Spotify')}>
            Spotify
          </button>
          <button type="button" onClick={() => onRun('pausiere')}>
            Play / Pause
          </button>
          <button type="button" onClick={() => onRun('nächster Titel')}>
            Nächster Titel
          </button>
          <button type="button" className="ghost" onClick={onOpenAutomation}>
            Adaptive Regeln
          </button>
        </div>
        <p className="context-dashboard-foot">Weniger Reize · gedimmte Darstellung · Automatik bleibt im Hintergrund</p>
      </section>
    );
  }

  return (
    <section className="context-dashboard productivity" aria-label="Produktivitäts-Dashboard">
      <header>
        <span className="context-dashboard-eyebrow">PRODUCTIVITY MODE</span>
        <strong>{context.activeApp?.title || context.activeApp?.name || 'Arbeitskontext'}</strong>
        <p>{context.reason}</p>
      </header>
      <div className="context-dashboard-focus">
        <div>
          <span>Nächste Aufgabe</span>
          <strong>{nextTimer ? nextTimer.label : 'Keine Erinnerung offen'}</strong>
          <small>
            {nextTimer
              ? `${new Date(nextTimer.due).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
              : `${notes} Notizen gespeichert`}
          </small>
        </div>
        <div>
          <span>Fokus</span>
          <strong>KI Core &amp; Sprache</strong>
          <small>Chat priorisiert · Gaming-Module im Hintergrund</small>
        </div>
      </div>
      <div className="context-dashboard-actions">
        <button type="button" onClick={onFocusChat}>
          Chat fokussieren
        </button>
        <button type="button" onClick={() => onRun('meine Notizen')}>
          Notizen ansehen
        </button>
        <button type="button" onClick={() => onRun('meine Timer')}>
          Timer prüfen
        </button>
        <button type="button" className="ghost" onClick={onOpenAutomation}>
          Adaptive Intelligence
        </button>
      </div>
    </section>
  );
}
