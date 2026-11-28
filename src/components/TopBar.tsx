import type { BrainStatus } from '../lib/brain';
import type { Mode } from '../types';
import { formatClock, formatDateLong } from '../types';
import { ScopeSweep } from './HudInstruments';

interface Props {
  mode: Mode;
  now: number;
  aiStatus: BrainStatus | null;
  engineActive: boolean;
  onOpenSettings: () => void;
}

const CORE_LABEL: Record<Mode, string> = {
  off: 'BEREIT',
  wake: 'BEREIT',
  woken: 'HÖRT ZU',
  thinking: 'ARBEITET',
  speaking: 'SPRICHT',
};

function Chip({
  icon,
  label,
  value,
  tone = 'ok',
}: {
  icon: string;
  label: string;
  value: string;
  tone?: 'ok' | 'off' | 'warm';
}) {
  return (
    <div className={`chip chip-${tone}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="chip-icon">
        <path d={icon} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="chip-text">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export default function TopBar({ mode, now, aiStatus, engineActive, onOpenSettings }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <span className="brand-orbit" />
          <svg viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
            <circle
              cx="24"
              cy="24"
              r="16.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.9"
              opacity="0.85"
              strokeDasharray="3 5"
            />
            <path d="M24 12.5 34.5 30.5h-21z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M24 20.5 28.6 28.5h-9.2z" fill="currentColor" opacity="0.9" />
            <path d="M24 1v3.5M24 43.5V47M1 24h3.5M43.5 24H47" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          </svg>
        </span>
        <div className="brand-text">
          <h1>J.A.R.V.I.S.</h1>
          <p>UNIFIED COMMAND CENTER v1.4</p>
        </div>
      </div>

      <div className="chips">
        <Chip
          icon="M2 12h4l2-6 3 12 3-9 2 5h6"
          label="SYSTEM"
          value="ONLINE"
          tone="ok"
        />
        <Chip
          icon="M8 8a4 4 0 1 1 8 0v5a4 4 0 0 1-8 0zM5 14a7 7 0 0 0 14 0M12 21v-3"
          label="NEURAL CORE"
          value={CORE_LABEL[mode]}
          tone={mode === 'thinking' ? 'warm' : 'ok'}
        />
        <Chip
          icon="M4 7h16v10H4zM8 21h8M12 17v4"
          label="KI-ANBIETER"
          value={aiStatus?.configured ? aiStatus.provider || 'KI' : 'kein Key'}
          tone={aiStatus?.configured ? 'ok' : 'off'}
        />
        <Chip
          icon="M9 3h6v5h5v6h-5v7H9v-7H4V8h5z"
          label="MODELL"
          value={aiStatus?.model ?? '—'}
          tone="off"
        />
        <Chip
          icon="M4 12h2M8 8v8M12 5v14M16 9v6M20 11v2"
          label="VOICE"
          value={engineActive ? 'AKTIV' : 'INAKTIV'}
          tone={engineActive ? 'ok' : 'off'}
        />
      </div>

      <div className="top-right">
        <ScopeSweep label="SCAN" tone={mode === 'thinking' ? 'warn' : 'ok'} />
        <div className="clock">
          <strong>{formatClock(now)}</strong>
          <span>{formatDateLong(now)}</span>
        </div>
        <button type="button" className="icon-button" onClick={onOpenSettings} aria-label="Einstellungen öffnen">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path
              d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.7-1.3-2-3.4-2 .8a7.6 7.6 0 0 0-2.6-1.5L14.2 3H9.8l-.3 2.1a7.6 7.6 0 0 0-2.6 1.5l-2-.8-2 3.4L4.6 10.5a7.7 7.7 0 0 0 0 3L2.9 14.8l2 3.4 2-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2.1h4.4l.3-2.1a7.6 7.6 0 0 0 2.6-1.5l2 .8 2-3.4-1.7-1.3Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
