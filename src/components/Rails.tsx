import { useEffect, useRef } from 'react';
import type { BrainStatus } from '../lib/brain';
import type { LogEntry, MicInput, Mode, Note, Settings, TimerItem } from '../types';
import { formatClock, formatDuration } from '../types';

const MODE_TEXT: Record<Mode, string> = {
  off: 'standby',
  wake: 'wach',
  woken: 'aufmerksam',
  thinking: 'analysiert',
  speaking: 'spricht',
};

interface LeftProps {
  settings: Settings;
  mode: Mode;
  micLabel: string;
  micState: 'idle' | 'ready' | 'error';
  voiceLabel: string;
  aiStatus: BrainStatus | null;
  uptime: string;
  timers: TimerItem[];
  notes: Note[];
  now: number;
}

function Row({ label, value, tone = 'ok' }: { label: string; value: string; tone?: 'ok' | 'off' | 'warn' }) {
  return (
    <div className="kv">
      <span className="kv-label">{label}</span>
      <span className={`kv-value tone-${tone}`} title={value}>
        {value}
      </span>
    </div>
  );
}

export function LeftRail({
  settings,
  mode,
  micLabel,
  micState,
  voiceLabel,
  aiStatus,
  uptime,
  timers,
  notes,
  now,
}: LeftProps) {
  return (
    <aside className="rail rail-left" aria-label="Systemdiagnose">
      <section className="block">
        <div className="block-head">
          <h2>System</h2>
          <span className="block-tag">Link {mode === 'off' ? 'down' : 'up'}</span>
        </div>
        <Row
          label="Mikrofon"
          value={micState === 'ready' ? micLabel : micState === 'error' ? 'blockiert' : 'nicht aktiv'}
          tone={micState === 'ready' ? 'ok' : micState === 'error' ? 'warn' : 'off'}
        />
        <Row label="Stimme" value={voiceLabel} />
        <Row label="Erkennung" value="Web Speech · de-DE" tone="off" />
        <Row
          label="KI"
          value={aiStatus ? (aiStatus.configured ? aiStatus.model : 'kein Key') : 'offline'}
          tone={aiStatus?.configured ? 'ok' : 'off'}
        />
        <Row label="Weckwort" value={`„${settings.wakeWord}“`} />
        <Row label="Modus" value={MODE_TEXT[mode]} tone={mode === 'off' ? 'off' : 'ok'} />
        <Row label="Laufzeit" value={uptime} tone="off" />
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Zeitgeber</h2>
          <span className="block-tag">{timers.length}</span>
        </div>
        {timers.length === 0 ? (
          <p className="empty">Keine aktiven Timer.</p>
        ) : (
          <ul className="timer-list">
            {timers.map((timer) => {
              const total = Math.max(1, timer.due - timer.createdAt);
              const remaining = Math.max(0, timer.due - now);
              const progress = Math.min(100, Math.max(0, (1 - remaining / total) * 100));
              return (
                <li key={timer.id} className="timer">
                  <div className="timer-top">
                    <span className="timer-label" title={timer.label}>
                      {timer.kind === 'alarm' ? '◷' : '◔'} {timer.label}
                    </span>
                    <span className="timer-time">{formatDuration(remaining)}</span>
                  </div>
                  <div className="meter">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="block block-grow">
        <div className="block-head">
          <h2>Notizen</h2>
          <span className="block-tag">{notes.length}</span>
        </div>
        {notes.length === 0 ? (
          <p className="empty">Noch nichts notiert. Sage „Jarvis, notiere …“.</p>
        ) : (
          <ul className="note-list">
            {[...notes].reverse().map((note) => (
              <li key={note.id} className="note">
                <span className="note-time">{formatClock(note.at).slice(0, 5)}</span>
                <span className="note-text">{note.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

interface RightProps {
  entries: LogEntry[];
  onRun: (text: string) => void;
  onClear: () => void;
}

const QUICK = ['Wie spät ist es?', 'Wetter in Berlin', 'Timer für 5 Minuten', 'Systemstatus', 'Erzähl einen Witz'];

export function RightRail({ entries, onRun, onClear }: RightProps) {
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = feedRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [entries]);

  return (
    <aside className="rail rail-right" aria-label="Gesprächsprotokoll">
      <section className="block block-grow">
        <div className="block-head">
          <h2>Protokoll</h2>
          <button type="button" className="text-button" onClick={onClear}>
            leeren
          </button>
        </div>
        <div className="feed" ref={feedRef} aria-live="polite">
          {entries.length === 0 ? (
            <p className="empty">Keine Einträge.</p>
          ) : (
            entries.map((entry) => (
              <article key={entry.id} className={`entry entry-${entry.role}`}>
                <span className="entry-time">{formatClock(entry.at).slice(0, 5)}</span>
                <div className="entry-body">
                  <span className="entry-role">
                    {entry.role === 'user' ? 'Du' : entry.role === 'jarvis' ? 'Jarvis' : 'System'}
                  </span>
                  <p className="entry-text">{entry.text}</p>
                  {entry.url ? (
                    <a className="entry-link" href={entry.url} target="_blank" rel="noreferrer noopener">
                      {entry.url} ↗
                    </a>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Befehle</h2>
          <span className="block-tag">1-Klick</span>
        </div>
        <div className="chips">
          {QUICK.map((text) => (
            <button key={text} type="button" className="chip" onClick={() => onRun(text)}>
              {text}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

interface MicSelectProps {
  inputs: MicInput[];
  value: string;
  onChange: (value: string) => void;
}

export function MicSelect({ inputs, value, onChange }: MicSelectProps) {
  return (
    <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Standardgerät</option>
      {inputs.map((input) => (
        <option key={input.id} value={input.id}>
          {input.label}
        </option>
      ))}
    </select>
  );
}
