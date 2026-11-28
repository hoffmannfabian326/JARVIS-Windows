import { useEffect, useRef } from 'react';
import type { FormEvent, RefObject } from 'react';
import type { LogEntry } from '../types';
import type { PendingTool } from '../lib/tools';
import { formatClock } from '../types';
import ToolConfirmCard from './ToolConfirmCard';

interface Props {
  entries: LogEntry[];
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onMic: () => void;
  engineActive: boolean;
  onQuick: (text: string) => void;
  inputRef: RefObject<HTMLInputElement>;
  interim: string;
  dictationMode: boolean;
  dictationAvailable: boolean;
  onToggleDictation: () => void;
  pendingTool: PendingTool | null;
  onConfirmTool: () => void;
  onCancelTool: () => void;
  onAlwaysAllowTool: (name: string) => void;
  confirmListening: boolean;
}

const QUICK = ['Systemstatus', 'Wetter in Berlin', 'Timer für 5 Minuten', 'Wie spät ist es?'];

/** Nur echte Web-Links als klickbare Quelle anzeigen. */
function safeLink(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

export default function Conversation({
  entries,
  draft,
  onDraft,
  onSubmit,
  onMic,
  engineActive,
  onQuick,
  inputRef,
  interim,
  dictationMode,
  dictationAvailable,
  onToggleDictation,
  pendingTool,
  onConfirmTool,
  onCancelTool,
  onAlwaysAllowTool,
  confirmListening,
}: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries, interim]);

  return (
    <aside className="panel conversation" aria-label="Konversation">
      <div className="panel-head">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
        <h2>J.A.R.V.I.S. — Conversation</h2>
      </div>

      <div className="convo-list" ref={listRef}>
        {entries.length === 0 && !interim ? (
          <div className="convo-empty">
            <p>Systeme online. Neural Core bereit.</p>
            <p>Wie kann ich dir heute helfen?</p>
            <div className="convo-quick">
              {QUICK.map((text) => (
                <button key={text} type="button" onClick={() => onQuick(text)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {entries.map((entry) => {
          const link = safeLink(entry.url);
          return (
            <div key={entry.id} className={`bubble bubble-${entry.role}`}>
              <span className="bubble-author">
                {entry.role === 'user' ? 'Du' : entry.role === 'jarvis' ? 'J.A.R.V.I.S.' : 'System'}
              </span>
              <p>{entry.text}</p>
              {link ? (
                <a className="bubble-link" href={link} target="_blank" rel="noreferrer noopener">
                  {link}
                </a>
              ) : null}
              <span className="bubble-time">{formatClock(entry.at)}</span>
            </div>
          );
        })}

        {interim ? (
          <div className="bubble bubble-jarvis bubble-interim">
            <span className="bubble-author">J.A.R.V.I.S.</span>
            <p>{interim}</p>
          </div>
        ) : null}
      </div>

      {pendingTool ? (
        <ToolConfirmCard
          tool={pendingTool}
          onConfirm={onConfirmTool}
          onCancel={onCancelTool}
          onAlwaysAllow={() => onAlwaysAllowTool(pendingTool.name)}
          listening={confirmListening}
        />
      ) : null}

      <form className="convo-bar" onSubmit={onSubmit}>
        <button
          type="button"
          className={`convo-dictate ${dictationMode ? 'is-on' : ''}`}
          onClick={onToggleDictation}
          disabled={!dictationAvailable}
          aria-pressed={dictationMode}
          aria-label="Diktat-Modus"
          title={
            dictationAvailable
              ? 'Diktat: Push-to-talk fügt gesprochenen Text ins aktive Fenster ein'
              : 'Diktat ist nur in der Windows-Desktop-App verfügbar'
          }
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16M4 10h10M4 15h16M4 20h7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          placeholder={dictationMode ? 'Diktat aktiv — Strg+Alt+Leertaste spricht ins Fenster' : 'Nachricht an J.A.R.V.I.S. …'}
          aria-label="Befehl eingeben"
          autoComplete="off"
        />
        <button
          type="button"
          className={`convo-mic ${engineActive ? 'is-on' : ''}`}
          onClick={onMic}
          aria-pressed={engineActive}
          aria-label={engineActive ? 'Zuhören stoppen' : 'Jarvis aktivieren'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button type="submit" className="convo-send" aria-label="Senden" disabled={!draft.trim()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 11.5 21 3l-8.5 18-2.5-7z" fill="currentColor" />
          </svg>
        </button>
      </form>
    </aside>
  );
}
