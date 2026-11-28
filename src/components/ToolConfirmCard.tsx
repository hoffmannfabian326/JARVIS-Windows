import { useEffect } from 'react';
import type { PendingTool } from '../lib/tools';

interface Props {
  tool: PendingTool;
  onConfirm: () => void;
  onCancel: () => void;
  onAlwaysAllow?: () => void;
  listening?: boolean;
}

/**
 * Bestätigung für alles, was Jarvis verändert. Abbrechen ist vorausgewählt,
 * damit ein versehentliches Enter nichts auslöst. Gefährliche Aktionen
 * (Sperren, Webseite öffnen) lassen sich nie dauerhaft erlauben.
 */
export default function ToolConfirmCard({
  tool,
  onConfirm,
  onCancel,
  onAlwaysAllow,
  listening = false,
}: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const risky = tool.description.risk === 'high';

  return (
    <div
      className="tool-confirm"
      role="alertdialog"
      aria-labelledby="tool-confirm-title"
      aria-describedby="tool-confirm-detail"
    >
      <span className={`tool-confirm-icon ${risky ? 'is-risk' : ''}`} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path
            d="M12 3 2.8 20h18.4L12 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M12 9v5.2M12 17.4h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </span>

      <div className="tool-confirm-copy">
        <p className="tool-confirm-kicker">Bestätigung nötig</p>
        <strong id="tool-confirm-title">{tool.description.title}</strong>
        <p id="tool-confirm-detail">{tool.description.detail}</p>
        <span className={`tool-confirm-hint ${listening ? 'is-listening' : ''}`}>
          {listening
            ? 'Ich höre zu — sage „Ja“ oder „Nein“.'
            : 'J.A.R.V.I.S. führt das erst nach deiner Bestätigung aus.'}
        </span>
      </div>

      <div className="tool-confirm-actions">
        {onAlwaysAllow && !risky ? (
          <button type="button" className="tool-allow" onClick={onAlwaysAllow}>
            Immer erlauben
          </button>
        ) : null}
        <button type="button" className="tool-cancel" onClick={onCancel} autoFocus>
          Abbrechen
        </button>
        <button type="button" className={`tool-ok ${risky ? 'is-risk' : ''}`} onClick={onConfirm}>
          Ausführen
        </button>
      </div>
    </div>
  );
}
